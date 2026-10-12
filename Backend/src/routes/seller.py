import datetime as dt
import logging
import os

import bcrypt
import jwt
import pyodbc
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from src.schemas.seller_schemas import (
    Person,
    Seller,
    SelleLogin,
    SellerPasswordChange,
    CollectRequest,
)

from src.services import db_connection

seller_router: APIRouter = APIRouter()
logger = logging.getLogger(__name__)

load_dotenv()

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_HOURS = 8
DUMMY_HASH = bcrypt.hashpw(b"not-a-real-password", bcrypt.gensalt())

bearer = HTTPBearer()

def require_seller(creds: HTTPAuthorizationCredentials = Depends(bearer)) -> dict:
    """Dependency: only a signed-in seller (valid, unexpired token) gets through."""
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired. Please sign in again.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid session. Please sign in again.")
    if payload.get("role") != "seller":
        raise HTTPException(status_code=403, detail="Seller access only.")
    return payload


@seller_router.post("/seller/register")
def seller_registration(person_payload: Person, seller_payload: Seller) -> str:
    conn = None
    cursor = None
    try:
        password_hash = bcrypt.hashpw(seller_payload.password.encode(), bcrypt.gensalt()).decode()
        conn = pyodbc.connect(db_connection.connect())
        conn.autocommit = False  # person + seller are saved together or not at all
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
            "INSERT INTO Sellers (person_id, password_hash) VALUES (?, ?)",
            person_id,
            password_hash,
        )

        conn.commit()
        return f"{person_payload.username} account has been successfully registered"
    except pyodbc.IntegrityError:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=409, detail="Email or ID number already registered.")
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("Seller registration failed")
        raise HTTPException(status_code=500, detail="Registration failed. Please try again.")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@seller_router.post("/seller/login")
def seller_login(login_payload: SelleLogin):
    conn = None
    cursor = None
    try:
        conn = pyodbc.connect(db_connection.connect())
        cursor = conn.cursor()

        cursor.execute(
            """
            SELECT p.person_id, s.seller_id, p.username, s.password_hash
            FROM Persons p
            JOIN Sellers s ON s.person_id = p.person_id
            WHERE p.email_address = ?
            """,
            login_payload.email_address,
        )
        row = cursor.fetchone()
        stored = row.password_hash.encode() if row and row.password_hash else DUMMY_HASH
        password_ok = bcrypt.checkpw(login_payload.password.encode(), stored)

        if not row or not row.password_hash or not password_ok:
            raise HTTPException(status_code=401, detail="Invalid email or password.")

        token = jwt.encode(
            {
                "sub": str(row.person_id),
                "role": "seller",
                "exp": dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=JWT_HOURS),
            },
            JWT_SECRET,
            algorithm="HS256",
        )
        return {
            "token": token,
            "seller": {
                "seller_id": row.seller_id,
                "username": row.username,
            },
        }

    except HTTPException:
        raise
    except Exception:
        logger.exception("Seller login failed")
        raise HTTPException(status_code=500, detail="Sign in failed. Please try again.")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


# ---------------------------------------------------------------------------
# The signed-in seller's profile.
# ---------------------------------------------------------------------------

@seller_router.get("/seller/me")
def get_seller_profile(seller: dict = Depends(require_seller)):
    conn = None
    cursor = None
    try:
        conn = pyodbc.connect(db_connection.connect())
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT p.username, p.first_name, p.last_name, p.id_number, p.age,
                   p.email_address, p.contact_number, p.physical_address, p.date_registered,
                   s.seller_id, s.bulk_points, s.loyalty_points
            FROM Persons p
            JOIN Sellers s ON s.person_id = p.person_id
            WHERE p.person_id = ?
            """,
            int(seller["sub"]),
        )
        row = cursor.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Seller profile not found.")
        cols = [c[0] for c in cursor.description]
        return dict(zip(cols, row))
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to load seller profile")
        raise HTTPException(status_code=500, detail="Could not load your profile.")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@seller_router.put("/seller/me")
def update_seller_profile(person_payload: Person, seller: dict = Depends(require_seller)):
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
            int(seller["sub"]),
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
        logger.exception("Seller profile update failed")
        raise HTTPException(status_code=500, detail="Could not update your profile. Please try again.")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@seller_router.put("/seller/me/password")
def update_seller_password(payload: SellerPasswordChange, seller: dict = Depends(require_seller)):
    conn = None
    cursor = None
    try:
        conn = pyodbc.connect(db_connection.connect())
        cursor = conn.cursor()

        cursor.execute("SELECT password_hash FROM Sellers WHERE person_id = ?", int(seller["sub"]))
        row = cursor.fetchone()
        if row is None or not bcrypt.checkpw(payload.current_password.encode(), row.password_hash.encode()):
            raise HTTPException(status_code=401, detail="Current password is incorrect.")

        new_hash = bcrypt.hashpw(payload.new_password.encode(), bcrypt.gensalt()).decode()
        cursor.execute("UPDATE Sellers SET password_hash = ? WHERE person_id = ?", new_hash, int(seller["sub"]))
        conn.commit()
        return "Password updated"
    except HTTPException:
        raise
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("Seller password update failed")
        raise HTTPException(status_code=500, detail="Could not update your password. Please try again.")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


# ---------------------------------------------------------------------------
# Scrap prices - view only. A seller isn't tied to one yard.
# ---------------------------------------------------------------------------

@seller_router.get("/seller/scrap-prices")
def list_seller_scrap_prices(seller: dict = Depends(require_seller)):
    conn = None
    cursor = None
    try:
        conn = pyodbc.connect(db_connection.connect())
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT sc.scrap_id, sc.scrap_name, sc.unit_price, sc.min_price, sc.max_price,
                   sc.unit_measure, sc.last_updated, sc.image_path, sy.scrapyard_name
            FROM Scraps sc
            JOIN Scrapyards sy ON sy.scrapyard_id = sc.scrapyard_id
            ORDER BY sc.scrap_name, sy.scrapyard_name
            """
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


# ---------------------------------------------------------------------------
# Scrap collection requests.
# ---------------------------------------------------------------------------

@seller_router.get("/seller/scraps")
def list_scraps_for_scrapyard(scrapyard_id: int, seller: dict = Depends(require_seller)):
    # Backs the "scrap type" select, which depends on whichever scrapyard the
    # seller picks first - submits scrap_name itself (CollectRequest.scrap_type
    # is a str, not an id).
    conn = None
    cursor = None
    try:
        conn = pyodbc.connect(db_connection.connect())
        cursor = conn.cursor()
        cursor.execute(
            "SELECT scrap_name FROM Scraps WHERE scrapyard_id = ? ORDER BY scrap_name",
            scrapyard_id,
        )
        return [{"id": row.scrap_name, "label": row.scrap_name} for row in cursor.fetchall()]
    except Exception:
        logger.exception("Failed to list scraps for scrapyard")
        raise HTTPException(status_code=500, detail="Could not load scrap types for that scrapyard.")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@seller_router.post("/seller/collection-requests")
def create_collection_request(payload: CollectRequest, seller: dict = Depends(require_seller)):
    conn = None
    cursor = None
    try:
        conn = pyodbc.connect(db_connection.connect())
        cursor = conn.cursor()

        # Who is asking comes from the login token.
        cursor.execute("SELECT seller_id FROM Sellers WHERE person_id = ?", int(seller["sub"]))
        seller_row = cursor.fetchone()
        if seller_row is None:
            raise HTTPException(status_code=404, detail="Seller not found.")
        seller_id = seller_row[0]

        # The scrapyard can refuse a seller it has blacklisted. 409, not 403: the
        # dashboard treats 401/403 as "session expired" and would sign them out.
        cursor.execute(
            """
            SELECT 1 FROM Blacklists
            WHERE seller_id = ? AND scrapyard_id = ? AND blacklist_status = 'active'
            """,
            seller_id,
            payload.scrapyard_id,
        )
        if cursor.fetchone() is not None:
            raise HTTPException(
                status_code=409,
                detail="This scrapyard can't accept collection requests from you right now.",
            )

        cursor.execute(
            """
            INSERT INTO CollectRequests (
                scrapyard_id, seller_id, contact, scrap_type, estimated_weight,
                collection_address, collection_time, collection_date, request_status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
            """,
            payload.scrapyard_id,
            seller_id,
            payload.contact,
            payload.scrap_type,
            payload.estimated_weight,
            payload.collection_address,
            payload.collection_time,
            payload.collection_date,
        )
        conn.commit()
        return "Collection request submitted"
    except HTTPException:
        raise
    except pyodbc.IntegrityError:
        if conn:
            conn.rollback()
        raise HTTPException(
            status_code=409,
            detail="Could not submit the request - check the scrapyard and scrap type.",
        )
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("Collection request failed")
        raise HTTPException(status_code=500, detail="Could not submit the collection request. Please try again.")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@seller_router.get("/seller/collection-requests")
def list_my_collection_requests(seller: dict = Depends(require_seller)):
    conn = None
    cursor = None
    try:
        conn = pyodbc.connect(db_connection.connect())
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT cr.request_id, sy.scrapyard_name, cr.scrap_type, cr.estimated_weight,
                   cr.collection_address, cr.collection_date, cr.collection_time, cr.request_status
            FROM CollectRequests cr
            JOIN Sellers s ON s.seller_id = cr.seller_id
            JOIN Scrapyards sy ON sy.scrapyard_id = cr.scrapyard_id
            WHERE s.person_id = ?
            ORDER BY cr.collection_date DESC, cr.collection_time DESC
            """,
            int(seller["sub"]),
        )
        cols = [c[0] for c in cursor.description]
        return [dict(zip(cols, row)) for row in cursor.fetchall()]
    except Exception:
        logger.exception("Failed to list collection requests")
        raise HTTPException(status_code=500, detail="Could not load your collection requests.")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()