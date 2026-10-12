import datetime as dt
import logging
import os
import uuid
from pathlib import Path
from typing import Literal, Optional

import bcrypt
import jwt
import pyodbc
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from src.schemas.admin_shemas import (
    Person,
    Admin,
    AdminLogin,
    Scrapyard,
    Blacklist,
    Scrap,
    RequestDecision
)
from src.services import db_connection

router = APIRouter()
logger = logging.getLogger(__name__)

load_dotenv()

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_HOURS = 8
DUMMY_HASH = bcrypt.hashpw(b"not-a-real-password", bcrypt.gensalt())

bearer = HTTPBearer()

# ---------------------------------------------------------------------------
# Scrap pictures live on disk, not in the database
# the Scraps table only a relative path like "scraps/<random>.jpg" in its image_path column.
# main.py must serve this folder, e.g.: 
#    app.mount("/media", StaticFiles(directory=os.getenv("UPLOAD_DIR", "uploads")), name="media")
# ---------------------------------------------------------------------------

UPLOAD_ROOT = Path(os.getenv("UPLOAD_DIR", "uploads"))
SCRAP_IMAGE_DIR = UPLOAD_ROOT / "scraps"
SCRAP_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB


def _detect_image_ext(head: bytes) -> Optional[str]:
    """Identify the real image type from its first bytes - the filename and the
    Content-Type header are both client-supplied, so neither is trusted."""
    if head.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return ".webp"
    return None


def save_scrap_image(upload: UploadFile) -> str:
    """Validate and store an uploaded picture. Returns the path to keep in the DB."""
    data = upload.file.read(MAX_IMAGE_BYTES + 1)
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="The picture is too large (5 MB maximum).")
    ext = _detect_image_ext(data[:12])
    if ext is None:
        raise HTTPException(status_code=415, detail="The picture must be a JPG, PNG or WebP image.")
    name = f"{uuid.uuid4().hex}{ext}"  # random name: no collisions, nothing user-controlled in the path
    (SCRAP_IMAGE_DIR / name).write_bytes(data)
    return f"scraps/{name}"


def remove_scrap_image(rel_path: Optional[str]) -> None:
    """Best-effort delete of a stored picture. Never raises."""
    if not rel_path:
        return
    try:
        target = (UPLOAD_ROOT / rel_path).resolve()
        if SCRAP_IMAGE_DIR.resolve() in target.parents:  # only ever delete inside the scraps folder
            target.unlink(missing_ok=True)
    except OSError:
        logger.warning("Could not delete picture %s", rel_path)

BLACKLIST_REASONS = [
    "Suspected stolen scrap",
    "Selling stolen or illegal materials",
    "Fraudulent or false documents",
    "Misdeclared or contaminated scrap",
    "Abusive behaviour towards staff",
    "Repeated no-shows on collections",
]

def delete_row(cursor, conn, sql: str, params, not_found: str, conflict: str) -> str:
    """
    Shared delete logic: runs the DELETE, 404s if nothing matched, and turns a
    foreign-key violation into a friendly 409 instead of a raw SQL error.
    Call this INSIDE your route's existing try/except HTTPException/Exception
    block - it only knows about the not-found and FK-conflict cases.
    """
    try:
        cursor.execute(sql, *params) if isinstance(params, (tuple, list)) else cursor.execute(sql, params)
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail=not_found)
        conn.commit()
        return "Deleted"
    except HTTPException:
        raise
    except pyodbc.IntegrityError:
        conn.rollback()
        raise HTTPException(status_code=409, detail=conflict)


def require_admin(creds: HTTPAuthorizationCredentials = Depends(bearer)) -> dict:
    """Dependency: only a signed-in admin (valid, unexpired token) gets through."""
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired. Please sign in again.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid session. Please sign in again.")
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access only.")
    return payload


@router.get("/scrapyards")
def list_scrapyards():
    conn = None
    cursor = None
    try:
        conn = pyodbc.connect(db_connection.connect())
        cursor = conn.cursor()
        cursor.execute("SELECT scrapyard_id, scrapyard_name FROM Scrapyards ORDER BY scrapyard_name")
        return [{"id": row.scrapyard_id, "label": row.scrapyard_name} for row in cursor.fetchall()]
    except Exception:
        logger.exception("Failed to list scrapyards")
        raise HTTPException(status_code=500, detail="Could not load scrapyards.")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.post("/admins/register/admin")
def admin_registration(person_payload: Person, admin_payload: Admin):
    conn = None
    cursor = None
    try:
        password_hash = bcrypt.hashpw(admin_payload.password.encode(), bcrypt.gensalt()).decode()

        conn = pyodbc.connect(db_connection.connect())
        conn.autocommit = False
        cursor = conn.cursor()

        cursor.execute(
            """
            INSERT INTO Persons (
                username, first_name, last_name, id_number, age,
                email_address, contact_number, physical_address, date_registered
            )
            OUTPUT INSERTED.person_id
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            person_payload.username,
            person_payload.first_name,
            person_payload.last_name,
            person_payload.id_number,
            person_payload.age,
            person_payload.email_address,
            person_payload.contact_number,
            person_payload.physical_address,
            person_payload.date_registered,
        )
        person_id = cursor.fetchone()[0]

        cursor.execute(
            "INSERT INTO Admins (person_id, scrapyard_id, password_hash) VALUES (?, ?, ?)",
            person_id,
            admin_payload.scrapyard_id,
            password_hash,
        )

        conn.commit()
        return "Admin successfully registered"

    except pyodbc.IntegrityError:
        if conn:
            conn.rollback()
        raise HTTPException(
            status_code=409,
            detail="This admin is already registered, or the scrapyard ID does not exist.",
        )
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("Admin registration failed")
        raise HTTPException(status_code=500, detail="Could not register admin. Please try again.")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.post("/admins/login")
def admin_login(credentials: AdminLogin):
    conn = None
    cursor = None
    try:
        conn = pyodbc.connect(db_connection.connect())
        cursor = conn.cursor()

        cursor.execute(
            """
            SELECT p.person_id, a.admin_id, p.username, a.scrapyard_id, a.password_hash
            FROM Persons p
            JOIN Admins a ON a.person_id = p.person_id
            WHERE p.email_address = ?
            """,
            credentials.email_address,
        )
        row = cursor.fetchone()

        stored = row.password_hash.encode() if row and row.password_hash else DUMMY_HASH
        password_ok = bcrypt.checkpw(credentials.password.encode(), stored)

        if not row or not row.password_hash or not password_ok:
            raise HTTPException(status_code=401, detail="Invalid email or password.")

        cursor.execute(
            "SELECT scrapyard_name FROM Scrapyards WHERE scrapyard_id = ?",
            row.scrapyard_id,
        )
        scrapyard_row = cursor.fetchone()
        scrapyard_name = scrapyard_row.scrapyard_name if scrapyard_row else None

        token = jwt.encode(
            {
                "sub": str(row.person_id),
                "role": "admin",
                "scrapyard_id": row.scrapyard_id,
                "exp": dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=JWT_HOURS),
            },
            JWT_SECRET,
            algorithm="HS256",
        )
        return {
            "token": token,
            "admin": {
                "admin_id": row.admin_id,
                "username": row.username,
                "scrapyard_name": scrapyard_name,
                "scrapyard_id": row.scrapyard_id,
            },
        }

    except HTTPException:
        raise
    except Exception:
        logger.exception("Admin login failed")
        raise HTTPException(status_code=500, detail="Could not sign in. Please try again.")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


# ---------------------------------------------------------------------------
# Sellers: search, edit, delete.
# ---------------------------------------------------------------------------
@router.get("/admins/sellers")
def list_sellers(admin: dict = Depends(require_admin)):
    conn = None
    cursor = None
    try:
        conn = pyodbc.connect(db_connection.connect())
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT s.seller_id, p.username, p.first_name, p.last_name, p.id_number, p.age,
                   p.email_address, p.contact_number, p.physical_address, p.date_registered
            FROM Sellers s
            JOIN Persons p ON p.person_id = s.person_id
            ORDER BY p.date_registered DESC
            """
        )
        cols = [c[0] for c in cursor.description]
        return [dict(zip(cols, row)) for row in cursor.fetchall()]
    except Exception:
        logger.exception("Failed to list sellers")
        raise HTTPException(status_code=500, detail="Could not load sellers.")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.put("/admins/sellers/{seller_id}")
def update_seller(seller_id: int, person_payload: Person, admin: dict = Depends(require_admin)):
    conn = None
    cursor = None
    try:
        conn = pyodbc.connect(db_connection.connect())
        cursor = conn.cursor()

        cursor.execute("SELECT person_id FROM Sellers WHERE seller_id = ?", seller_id)
        row = cursor.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Seller not found.")

        cursor.execute(
            """
            UPDATE Persons
            SET username = ?, first_name = ?, last_name = ?, id_number = ?, age = ?,
                email_address = ?, contact_number = ?, physical_address = ?
            WHERE person_id = ?
            """,
            person_payload.username,
            person_payload.first_name,
            person_payload.last_name,
            person_payload.id_number,
            person_payload.age,
            person_payload.email_address,
            person_payload.contact_number,
            person_payload.physical_address,
            row.person_id,
        )
        conn.commit()
        return "Seller details updated"
    except HTTPException:
        raise
    except pyodbc.IntegrityError:
        if conn:
            conn.rollback()
        raise HTTPException(
            status_code=409,
            detail="Another person already uses that ID number, username or email.",
        )
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("Seller update failed")
        raise HTTPException(status_code=500, detail="Could not update seller. Please try again.")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.delete("/admins/sellers/{seller_id}")
def delete_seller(seller_id: int, admin: dict = Depends(require_admin)):
    conn = None
    cursor = None
    try:
        conn = pyodbc.connect(db_connection.connect())
        cursor = conn.cursor()
        delete_row(
            cursor, conn,
            "DELETE FROM Sellers WHERE seller_id = ?", (seller_id,),
            not_found="Seller not found.",
            conflict="This seller has deliveries or transactions on record and can't be deleted.",
        )
        return "Seller deleted"
    except HTTPException:
        raise
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("Seller delete failed")
        raise HTTPException(status_code=500, detail="Could not delete seller. Please try again.")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/admins/clerks")
def list_clerks(admin: dict = Depends(require_admin)):
    conn = None
    cursor = None
    try:
        conn = pyodbc.connect(db_connection.connect())
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT c.clerk_id, p.first_name, p.last_name, p.username,
                   p.email_address, p.contact_number, p.date_registered
            FROM Clerks c
            JOIN Persons p ON p.person_id = c.person_id
            WHERE c.scrapyard_id = ?
            ORDER BY p.date_registered DESC
            """,
            admin["scrapyard_id"],
        )
        cols = [c[0] for c in cursor.description]
        return [dict(zip(cols, row)) for row in cursor.fetchall()]
    except Exception:
        logger.exception("Failed to list clerks")
        raise HTTPException(status_code=500, detail="Could not load clerks.")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/admins/deliveries")
def list_deliveries(admin: dict = Depends(require_admin)):
    conn = None
    cursor = None
    try:
        conn = pyodbc.connect(db_connection.connect())
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT d.delivery_id, ps.first_name AS seller_first_name, ps.last_name AS seller_last_name,
                   pc.username AS clerk_username, d.scrap_description, d.estimated_weight,
                   d.delivery_type, d.request_id, d.delivery_date
            FROM ScrapDeliveries d
            JOIN Sellers s ON s.seller_id = d.seller_id
            JOIN Persons ps ON ps.person_id = s.person_id
            JOIN Clerks c ON c.clerk_id = d.clerk_id
            JOIN Persons pc ON pc.person_id = c.person_id
            WHERE d.scrapyard_id = ?
            ORDER BY d.delivery_id DESC
            """,
            admin["scrapyard_id"],
        )
        cols = [c[0] for c in cursor.description]
        return [dict(zip(cols, row)) for row in cursor.fetchall()]
    except Exception:
        logger.exception("Failed to list deliveries")
        raise HTTPException(status_code=500, detail="Could not load deliveries.")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/admins/inspections")
def list_inspections(admin: dict = Depends(require_admin)):
    conn = None
    cursor = None
    try:
        conn = pyodbc.connect(db_connection.connect())
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT i.inspection_id, i.delivery_id, sc.scrap_name, i.actual_weight,
                   i.scrap_grade, i.unit_price, pc.username AS clerk_username, i.inspection_date
            FROM ScrapInspections i
            JOIN Scraps sc ON sc.scrap_id = i.scrap_id
            JOIN Clerks c ON c.clerk_id = i.clerk_id
            JOIN Persons pc ON pc.person_id = c.person_id
            WHERE i.scrapyard_id = ?
            ORDER BY i.inspection_id DESC
            """,
            admin["scrapyard_id"],
        )
        cols = [c[0] for c in cursor.description]
        return [dict(zip(cols, row)) for row in cursor.fetchall()]
    except Exception:
        logger.exception("Failed to list inspections")
        raise HTTPException(status_code=500, detail="Could not load inspections.")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/admins/transactions")
def list_transactions(admin: dict = Depends(require_admin)):
    conn = None
    cursor = None
    try:
        conn = pyodbc.connect(db_connection.connect())
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT t.transaction_id, ps.first_name AS seller_first_name, ps.last_name AS seller_last_name,
                   pc.username AS clerk_username, t.unit_price, t.total_amount,
                   t.payment_method, t.transaction_ref, t.transaction_date
            FROM Transactions t
            JOIN Sellers s ON s.seller_id = t.seller_id
            JOIN Persons ps ON ps.person_id = s.person_id
            JOIN Clerks c ON c.clerk_id = t.clerk_id
            JOIN Persons pc ON pc.person_id = c.person_id
            WHERE t.scrapyard_id = ?
            ORDER BY t.transaction_id DESC
            """,
            admin["scrapyard_id"],
        )
        cols = [c[0] for c in cursor.description]
        return [dict(zip(cols, row)) for row in cursor.fetchall()]
    except Exception:
        logger.exception("Failed to list transactions")
        raise HTTPException(status_code=500, detail="Could not load transactions.")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


# ---------------------------------------------------------------------------
# Scrap prices: add, list, edit, delete. Scoped to the admin's scrapyard.
# ---------------------------------------------------------------------------
@router.post("/admins/register/scrap_type")
def register_scrap(
    scrap_name: str = Form(...),
    unit_price: float = Form(...),
    min_price: float = Form(...),
    max_price: float = Form(...),
    unit_measure: str = Form(...),
    last_updated: str = Form(...),
    image: UploadFile = File(...),
    admin: dict = Depends(require_admin),
):
    image_path = save_scrap_image(image)  # validated and written to disk before the DB is touched
    conn = None
    cursor = None
    try:
        conn = pyodbc.connect(db_connection.connect())
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO Scraps (
                scrapyard_id, scrap_name, unit_price, min_price,
                max_price, unit_measure, last_updated, image_path
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            admin["scrapyard_id"],
            scrap_name,
            unit_price,
            min_price,
            max_price,
            unit_measure,
            last_updated,
            image_path,
        )
        conn.commit()
        return f"{scrap_name} scrap successfully added"
    except pyodbc.IntegrityError:
        if conn:
            conn.rollback()
        remove_scrap_image(image_path)  # no row, no orphaned file
        raise HTTPException(status_code=409, detail="This scrap type already exists for your scrapyard.")
    except Exception:
        if conn:
            conn.rollback()
        remove_scrap_image(image_path)
        logger.exception("Scrap registration failed")
        raise HTTPException(status_code=500, detail="Could not add scrap type. Please try again.")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/admins/scraps")
def list_scrap_prices(admin: dict = Depends(require_admin)):
    conn = None
    cursor = None
    try:
        conn = pyodbc.connect(db_connection.connect())
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT scrap_id, scrap_name, unit_price, min_price, max_price, unit_measure, last_updated, image_path
            FROM Scraps
            WHERE scrapyard_id = ?
            ORDER BY scrap_name
            """,
            admin["scrapyard_id"],
        )
        cols = [c[0] for c in cursor.description]
        return [dict(zip(cols, row)) for row in cursor.fetchall()]
    except Exception:
        logger.exception("Failed to list scrap prices")
        raise HTTPException(status_code=500, detail="Could not load scrap prices.")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.put("/admins/scraps/{scrap_id}")
def update_scrap(scrap_id: int, scrap_payload: Scrap, admin: dict = Depends(require_admin)):
    conn = None
    cursor = None
    try:
        conn = pyodbc.connect(db_connection.connect())
        cursor = conn.cursor()
        cursor.execute(
            """
            UPDATE Scraps
            SET scrap_name = ?, unit_price = ?, min_price = ?, max_price = ?,
                unit_measure = ?, last_updated = ?
            WHERE scrap_id = ? AND scrapyard_id = ?
            """,
            scrap_payload.scrap_name,
            scrap_payload.unit_price,
            scrap_payload.min_price,
            scrap_payload.max_price,
            scrap_payload.unit_measure,
            scrap_payload.last_updated,
            scrap_id,
            admin["scrapyard_id"], 
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Scrap type not found for your scrapyard.")
        conn.commit()
        return "Scrap price updated"
    except HTTPException:
        raise
    except pyodbc.IntegrityError:
        if conn:
            conn.rollback()
        raise HTTPException(
            status_code=409,
            detail="A scrap type with that name already exists for your scrapyard.",
        )
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("Scrap update failed")
        raise HTTPException(status_code=500, detail="Could not update scrap type. Please try again.")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.put("/admins/scraps/{scrap_id}/image")
def replace_scrap_image(scrap_id: int, image: UploadFile = File(...), admin: dict = Depends(require_admin)):
    new_path = save_scrap_image(image)
    conn = None
    cursor = None
    try:
        conn = pyodbc.connect(db_connection.connect())
        cursor = conn.cursor()
        cursor.execute(
            "SELECT image_path FROM Scraps WHERE scrap_id = ? AND scrapyard_id = ?",
            scrap_id,
            admin["scrapyard_id"],
        )
        row = cursor.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Scrap type not found for your scrapyard.")
        old_path = row.image_path

        cursor.execute(
            "UPDATE Scraps SET image_path = ? WHERE scrap_id = ? AND scrapyard_id = ?",
            new_path,
            scrap_id,
            admin["scrapyard_id"],
        )
        conn.commit()
        remove_scrap_image(old_path)  # only once the new picture is safely recorded
        return "Picture updated"
    except HTTPException:
        remove_scrap_image(new_path)
        raise
    except Exception:
        if conn:
            conn.rollback()
        remove_scrap_image(new_path)
        logger.exception("Scrap picture update failed")
        raise HTTPException(status_code=500, detail="Could not update the picture. Please try again.")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.delete("/admins/scraps/{scrap_id}")
def delete_scrap(scrap_id: int, admin: dict = Depends(require_admin)):
    conn = None
    cursor = None
    try:
        conn = pyodbc.connect(db_connection.connect())
        cursor = conn.cursor()
        cursor.execute(
            "SELECT image_path FROM Scraps WHERE scrap_id = ? AND scrapyard_id = ?",
            scrap_id,
            admin["scrapyard_id"],
        )
        row = cursor.fetchone()
        image_path = row.image_path if row else None

        delete_row(
            cursor, conn,
            "DELETE FROM Scraps WHERE scrap_id = ? AND scrapyard_id = ?", (scrap_id, admin["scrapyard_id"]),
            not_found="Scrap type not found for your scrapyard.",
            conflict="This scrap type has inspections on record and can't be deleted.",
        )
        remove_scrap_image(image_path)  # delete_row raises on failure, so this only runs on success
        return "Scrap type deleted"
    except HTTPException:
        raise
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("Scrap delete failed")
        raise HTTPException(status_code=500, detail="Could not delete scrap type. Please try again.")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/admins/stock-summary")
def stock_summary(admin: dict = Depends(require_admin)):
    conn = None
    cursor = None
    try:
        conn = pyodbc.connect(db_connection.connect())
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT
                s.scrap_name,
                MAX(s.unit_price) AS price_per_kg,
                SUM(i.actual_weight) AS total_weight_kg,
                SUM(i.actual_weight * s.unit_price) AS amount_spent,
                GETDATE() AS last_update
            FROM ScrapInspections i
            JOIN Scraps s ON s.scrap_id = i.scrap_id
            WHERE s.scrapyard_id = ?
            GROUP BY s.scrap_name
            ORDER BY s.scrap_name
            """,
            admin["scrapyard_id"],
        )
        cols = [c[0] for c in cursor.description]
        return [dict(zip(cols, row)) for row in cursor.fetchall()]
    except Exception:
        logger.exception("Failed to load stock summary")
        raise HTTPException(status_code=500, detail="Could not load stock summary.")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


# ---------------------------------------------------------------------------
# signed-in:  admins profile.
# ---------------------------------------------------------------------------
@router.get("/admins/me")
def get_admin_profile(admin: dict = Depends(require_admin)):
    conn = None
    cursor = None
    try:
        conn = pyodbc.connect(db_connection.connect())
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT p.username, p.first_name, p.last_name, p.id_number, p.age,
                   p.email_address, p.contact_number, p.physical_address, p.date_registered,
                   a.admin_id, a.scrapyard_id, sy.scrapyard_name
            FROM Persons p
            JOIN Admins a ON a.person_id = p.person_id
            LEFT JOIN Scrapyards sy ON sy.scrapyard_id = a.scrapyard_id
            WHERE p.person_id = ?
            """,
            int(admin["sub"]),
        )
        row = cursor.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Admin profile not found.")
        cols = [c[0] for c in cursor.description]
        return dict(zip(cols, row))
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to load admin profile")
        raise HTTPException(status_code=500, detail="Could not load your profile.")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.put("/admins/me")
def update_admin_profile(person_payload: Person, admin: dict = Depends(require_admin)):
    conn = None
    cursor = None
    try:
        conn = pyodbc.connect(db_connection.connect())
        cursor = conn.cursor()
        cursor.execute(
            """
            UPDATE Persons
            SET username = ?, first_name = ?, last_name = ?, id_number = ?, age = ?,
                email_address = ?, contact_number = ?, physical_address = ?
            WHERE person_id = ?
            """,
            person_payload.username,
            person_payload.first_name,
            person_payload.last_name,
            person_payload.id_number,
            person_payload.age,
            person_payload.email_address,
            person_payload.contact_number,
            person_payload.physical_address,
            int(admin["sub"]),
        )
        conn.commit()
        return "Profile updated"
    except pyodbc.IntegrityError:
        if conn:
            conn.rollback()
        raise HTTPException(
            status_code=409,
            detail="Another person already uses that ID number, username or email.",
        )
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("Admin profile update failed")
        raise HTTPException(status_code=500, detail="Could not update your profile. Please try again.")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


# ---------------------------------------------------------------------------
# Collection requests - sellers submit them (status 'pending'); the admin of
# the chosen scrapyard approves or rejects. The seller sees the new status in
# their "My requests" view.
# ---------------------------------------------------------------------------

@router.get("/admins/collection-requests")
def list_collection_requests(admin: dict = Depends(require_admin)):
    conn = None
    cursor = None
    try:
        conn = pyodbc.connect(db_connection.connect())
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT cr.request_id, p.first_name AS seller_first_name, p.last_name AS seller_last_name,
                   cr.contact, cr.scrap_type, cr.estimated_weight, cr.collection_address,
                   cr.collection_date, cr.collection_time, cr.request_status
            FROM CollectRequests cr
            JOIN Sellers s ON s.seller_id = cr.seller_id
            JOIN Persons p ON p.person_id = s.person_id
            WHERE cr.scrapyard_id = ?
            ORDER BY CASE WHEN cr.request_status = 'pending' THEN 0 ELSE 1 END,
                     cr.collection_date, cr.collection_time
            """,
            admin["scrapyard_id"],
        )
        cols = [c[0] for c in cursor.description]
        return [dict(zip(cols, row)) for row in cursor.fetchall()]
    except Exception:
        logger.exception("Failed to list collection requests")
        raise HTTPException(status_code=500, detail="Could not load collection requests.")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.put("/admins/collection-requests/{request_id}/status")
def decide_collection_request(request_id: int, decision: RequestDecision, admin: dict = Depends(require_admin)):
    # Only a still-pending request in the admin's own scrapyard can be decided.
    conn = None
    cursor = None
    try:
        conn = pyodbc.connect(db_connection.connect())
        cursor = conn.cursor()
        cursor.execute(
            """
            UPDATE CollectRequests SET request_status = ?
            WHERE request_id = ? AND scrapyard_id = ? AND request_status = 'pending'
            """,
            decision.status,
            request_id,
            admin["scrapyard_id"],
        )
        if cursor.rowcount == 0:
            cursor.execute(
                "SELECT request_status FROM CollectRequests WHERE request_id = ? AND scrapyard_id = ?",
                request_id,
                admin["scrapyard_id"],
            )
            row = cursor.fetchone()
            if row is None:
                raise HTTPException(status_code=404, detail="Request not found for your scrapyard.")
            raise HTTPException(status_code=409, detail=f"This request was already {row.request_status}.")
        conn.commit()
        return f"Request {decision.status}"
    except HTTPException:
        raise
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("Collection request decision failed")
        raise HTTPException(status_code=500, detail="Could not update the request. Please try again.")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


# ---------------------------------------------------------------------------
# Blacklist - list, add, lift.
# ---------------------------------------------------------------------------
@router.get("/admins/blacklist-reasons")
def list_blacklist_reasons(admin: dict = Depends(require_admin)):
    return BLACKLIST_REASONS


@router.get("/admins/blacklist")
def list_blacklist(admin: dict = Depends(require_admin)):
    conn = None
    cursor = None
    try:
        conn = pyodbc.connect(db_connection.connect())
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT b.blacklist_id, b.seller_id, p.first_name, p.last_name, p.id_number,
                   p.contact_number, b.reason, b.blacklist_status, b.blacklist_date
            FROM Blacklists b
            JOIN Sellers s ON s.seller_id = b.seller_id
            JOIN Persons p ON p.person_id = s.person_id
            WHERE b.scrapyard_id = ?
            ORDER BY CASE WHEN b.blacklist_status = 'active' THEN 0 ELSE 1 END, b.blacklist_date DESC
            """,
            admin["scrapyard_id"],
        )
        cols = [c[0] for c in cursor.description]
        return [dict(zip(cols, row)) for row in cursor.fetchall()]
    except Exception:
        logger.exception("Failed to list blacklist")
        raise HTTPException(status_code=500, detail="Could not load the blacklist.")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.post("/admins/blacklist")
def blacklist_seller(payload: Blacklist, admin: dict = Depends(require_admin)):
    if payload.seller_id is None:
        raise HTTPException(status_code=422, detail="Choose a seller to blacklist.")
    if payload.reason not in BLACKLIST_REASONS:
        raise HTTPException(status_code=422, detail="Choose a reason from the list.")

    conn = None
    cursor = None
    try:
        conn = pyodbc.connect(db_connection.connect())
        cursor = conn.cursor()

        cursor.execute("SELECT 1 FROM Sellers WHERE seller_id = ?", payload.seller_id)
        if cursor.fetchone() is None:
            raise HTTPException(status_code=404, detail="Seller not found.")

        # one active entry per seller per scrapyard (the lock stops two clicks racing past this check)
        cursor.execute(
            """
            SELECT 1 FROM Blacklists WITH (UPDLOCK, HOLDLOCK)
            WHERE seller_id = ? AND scrapyard_id = ? AND blacklist_status = 'active'
            """,
            payload.seller_id,
            admin["scrapyard_id"],
        )
        if cursor.fetchone() is not None:
            raise HTTPException(status_code=409, detail="This seller is already blacklisted at your scrapyard.")

        cursor.execute(
            """
            INSERT INTO Blacklists (seller_id, scrapyard_id, reason, blacklist_status, blacklist_date)
            VALUES (?, ?, ?, 'active', ?)
            """,
            payload.seller_id,
            admin["scrapyard_id"],
            payload.reason,
            dt.date.today().isoformat(),
        )
        conn.commit()
        return "Seller blacklisted"
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("Blacklisting failed")
        raise HTTPException(status_code=500, detail="Could not blacklist the seller. Please try again.")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.put("/admins/blacklist/{blacklist_id}/lift")
def lift_blacklist(blacklist_id: int, admin: dict = Depends(require_admin)):
    conn = None
    cursor = None
    try:
        conn = pyodbc.connect(db_connection.connect())
        cursor = conn.cursor()
        cursor.execute(
            """
            UPDATE Blacklists SET blacklist_status = 'lifted'
            WHERE blacklist_id = ? AND scrapyard_id = ? AND blacklist_status = 'active'
            """,
            blacklist_id,
            admin["scrapyard_id"],
        )
        if cursor.rowcount == 0:
            cursor.execute(
                "SELECT blacklist_status FROM Blacklists WHERE blacklist_id = ? AND scrapyard_id = ?",
                blacklist_id,
                admin["scrapyard_id"],
            )
            row = cursor.fetchone()
            if row is None:
                raise HTTPException(status_code=404, detail="Blacklist entry not found for your scrapyard.")
            raise HTTPException(status_code=409, detail="This blacklist entry was already lifted.")
        conn.commit()
        return "Blacklist lifted"
    except HTTPException:
        raise
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("Lifting blacklist failed")
        raise HTTPException(status_code=500, detail="Could not lift the blacklist. Please try again.")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


# ---------------------------------------------------------------------------
# The scrapyard the signed-in admin belongs to: view and update its details.
# ---------------------------------------------------------------------------
@router.get("/admins/scrapyard")
def get_my_scrapyard(admin: dict = Depends(require_admin)):
    conn = None
    cursor = None
    try:
        conn = pyodbc.connect(db_connection.connect())
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT scrapyard_id, scrapyard_name, email_address, contact_number,
                   registration_number, physical_address, opening_hour, closing_hour, operating_days
            FROM Scrapyards
            WHERE scrapyard_id = ?
            """,
            admin["scrapyard_id"],
        )
        row = cursor.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Scrapyard not found.")
        cols = [c[0] for c in cursor.description]
        return dict(zip(cols, row))
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to load scrapyard")
        raise HTTPException(status_code=500, detail="Could not load your scrapyard's details.")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.put("/admins/scrapyard")
def update_my_scrapyard(details: Scrapyard, admin: dict = Depends(require_admin)):
    conn = None
    cursor = None
    try:
        conn = pyodbc.connect(db_connection.connect())
        cursor = conn.cursor()
        cursor.execute(
            """
            UPDATE Scrapyards
            SET scrapyard_name = ?, email_address = ?, contact_number = ?, registration_number = ?,
                physical_address = ?, opening_hour = ?, closing_hour = ?, operating_days = ?
            WHERE scrapyard_id = ?
            """,
            details.scrapyard_name,
            details.email_address,
            details.contact_number,
            details.registration_number,
            details.physical_address,
            details.opening_hour,
            details.closing_hour,
            details.operating_days,
            admin["scrapyard_id"],
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Scrapyard not found.")
        conn.commit()
        return "Scrapyard details updated"
    except HTTPException:
        raise
    except pyodbc.IntegrityError:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=409, detail="Another scrapyard already uses that name.")
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("Scrapyard update failed")
        raise HTTPException(status_code=500, detail="Could not update the scrapyard. Please try again.")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()