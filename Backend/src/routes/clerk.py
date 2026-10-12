import datetime as dt
import os
import logging
import bcrypt
import jwt
import pyodbc

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from src.schemas.clerk_schemas import(
    Person,
    Clerk,
    ClerkLogin,
    Deliveries,
    Inspection,
    Transction,
    ClerkPasswordChange

) 
from src.services import db_connection

from dotenv import load_dotenv
from pydantic import BaseModel, Field

router = APIRouter()
logger = logging.getLogger(__name__)

load_dotenv()

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_HOURS = 8

DUMMY_HASH = bcrypt.hashpw(b"not-a-real-password", bcrypt.gensalt())

bearer = HTTPBearer()

 
# ---------------------------------------------------------------------------
# Reward rules.
# ---------------------------------------------------------------------------
LOYALTY_POINTS_PER_DELIVERY = 10      # added to the seller on every recorded delivery
BULK_WEIGHT_THRESHOLD_KG = 100.0      # an inspection >= this weight counts as "bulk"
BULK_POINTS_PER_BULK_INSPECTION = 5   # added to the seller when an inspection is bulk
 
LOYALTY_BONUS_THRESHOLD = 100
LOYALTY_BONUS_PERCENT = 2.0
BULK_BONUS_THRESHOLD = 50
BULK_BONUS_PERCENT = 3.0
 
 
def compute_bonus(base_amount, loyalty_points, bulk_points) -> float:
    """Bonus (in rand) on top of base_amount, based on the seller's current points."""
    percent = 0.0
    if (loyalty_points or 0) >= LOYALTY_BONUS_THRESHOLD:
        percent += LOYALTY_BONUS_PERCENT
    if (bulk_points or 0) >= BULK_BONUS_THRESHOLD:
        percent += BULK_BONUS_PERCENT
    return round(float(base_amount) * percent / 100, 2)
 

def require_clerk(creds: HTTPAuthorizationCredentials = Depends(bearer)) -> dict:
    """Dependency: only a signed-in clerk (valid, unexpired token) gets through."""
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired. Please sign in again.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid session. Please sign in again.")
    if payload.get("role") != "clerk":
        raise HTTPException(status_code=403, detail="Clerk access only.")
    return payload

@router.post("/clerks/register/clerk")
def clerk_registration(person_payload: Person, clerk_payload: Clerk):
    conn = None
    cursor = None
    try:
        password_hash = bcrypt.hashpw(clerk_payload.password.encode(), bcrypt.gensalt()).decode()

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
            "INSERT INTO Clerks (person_id, scrapyard_id, password_hash) VALUES (?, ?, ?)",
            person_id,
            clerk_payload.scrapyard_id,
            password_hash,
        )

        conn.commit()
        return "Clerk successfully registered"

    except pyodbc.IntegrityError:
        if conn:
            conn.rollback()
        raise HTTPException(
            status_code=409,
            detail="This clerk is already registered, or the scrapyard ID does not exist.",
        )
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("Clerk registration failed")
        raise HTTPException(status_code=500, detail="Could not register clerk. Please try again.")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.post("/clerks/login")
def clerk_login(credentials: ClerkLogin):
    conn = None
    cursor = None
    try:
        conn = pyodbc.connect(db_connection.connect())
        cursor = conn.cursor()

        cursor.execute(
            """
            SELECT p.person_id, c.clerk_id, p.username, c.scrapyard_id, c.password_hash
            FROM Persons p
            JOIN Clerks c ON c.person_id = p.person_id
            WHERE p.email_address = ?
            """,
            credentials.email_address,
        )
        row = cursor.fetchone()
        cursor.execute(
            "SELECT scrapyard_name FROM Scrapyards WHERE scrapyard_id = ?",
            row.scrapyard_id
        )

        scrapyard_name = cursor.fetchone()

        stored = row.password_hash.encode() if row and row.password_hash else DUMMY_HASH
        password_ok = bcrypt.checkpw(credentials.password.encode(), stored)

        if not row or not row.password_hash or not password_ok:
            raise HTTPException(status_code=401, detail="Invalid email or password.")

        token = jwt.encode(
            {
                "sub": str(row.person_id),
                "role": "clerk",
                "scrapyard_id": row.scrapyard_id,
                "exp": dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=JWT_HOURS),
            },
            JWT_SECRET,
            algorithm="HS256",
        )
        return {
            "token": token,
            "clerk": {
                "clerk_id": row.clerk_id,
                "username": row.username,
                "scrapyard_id": row.scrapyard_id,
                "scrapyard_name": scrapyard_name.scrapyard_name
            },
        }

    except HTTPException:
        raise
    except Exception:
        logger.exception("Clerk login failed")
        raise HTTPException(status_code=500, detail="Could not sign in. Please try again.")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

@router.post("/clerks/register/seller")
def seller_registration(person_payload: Person, clerk: dict = Depends(require_clerk)):
    conn = None
    cursor = None
    try:
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

        cursor.execute("INSERT INTO Sellers (person_id) VALUES (?)", person_id)

        conn.commit()
        return "Seller successfully registered"

    except pyodbc.IntegrityError:
        if conn:
            conn.rollback()
        raise HTTPException(
            status_code=409,
            detail="A person with this ID number, username or email is already registered.",
        )
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("Seller registration failed")
        raise HTTPException(status_code=500, detail="Could not register seller. Please try again.")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


 
@router.post("/clerks/scrap_proccessing/delivery")
def record_delivery(delivery_payload: Deliveries, clerk: dict = Depends(require_clerk)):
    conn = None
    cursor = None
    try:
        conn = pyodbc.connect(db_connection.connect())
        cursor = conn.cursor() 

        # Refuse sellers this scrapyard has blacklisted. 409, not 403: the dashboard
        # treats 401/403 as "session expired" and would sign the clerk out.
        cursor.execute(
            """
            SELECT 1 FROM Blacklists
            WHERE seller_id = ? AND scrapyard_id = ? AND blacklist_status = 'active'
            """,
            delivery_payload.seller_id,
            clerk["scrapyard_id"],
        )
        if cursor.fetchone() is not None:
            raise HTTPException(status_code=409, detail="This seller is blacklisted at your scrapyard.")
 
        cursor.execute(
            """
            INSERT INTO ScrapDeliveries(
                seller_id, request_id, clerk_id, scrapyard_id, scrap_description,
                estimated_weight, delivery_type, delivery_date
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            delivery_payload.seller_id,
            delivery_payload.request_id,
            delivery_payload.clerk_id,
            delivery_payload.scrapyard_id,
            delivery_payload.scrap_description,
            delivery_payload.estimated_weight,
            delivery_payload.delivery_type,
            delivery_payload.delivery_date,
        )
 
        # Every delivery earns the seller loyalty points.
        cursor.execute(
            "UPDATE Sellers SET loyalty_points = ISNULL(loyalty_points, 0) + ? WHERE seller_id = ?",
            LOYALTY_POINTS_PER_DELIVERY,
            delivery_payload.seller_id,
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Seller not found.")
 
        conn.commit()
        return f"Scrap delivery successfully recorded. Seller earned {LOYALTY_POINTS_PER_DELIVERY} loyalty points."
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("Delivery recording failed")
        raise HTTPException(status_code=500, detail="Could not record the delivery. Please try again.")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()
 
 
@router.post("/clerks/scrap_processing/inspection")
def record_scrap_inspections(inspection_payload: Inspection, clerk: dict = Depends(require_clerk)):
    conn = None
    cursor = None
    try:
        conn = pyodbc.connect(db_connection.connect())
        cursor = conn.cursor()
 
        cursor.execute("SELECT unit_price FROM Scraps WHERE scrap_id = ?", inspection_payload.scrap_id)
        row = cursor.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Scrap not found")
        unit_price = row[0]
 
        # The seller is whoever made the delivery being inspected.
        cursor.execute("SELECT seller_id FROM ScrapDeliveries WHERE delivery_id = ?", inspection_payload.delivery_id)
        delivery_row = cursor.fetchone()
        if delivery_row is None:
            raise HTTPException(status_code=404, detail="Delivery not found")
        seller_id = delivery_row[0]
 
        cursor.execute(
            "SELECT 1 FROM ScrapInspections WITH (UPDLOCK, HOLDLOCK) WHERE delivery_id = ?",
            inspection_payload.delivery_id,
        )
        if cursor.fetchone() is not None:
            raise HTTPException(status_code=409, detail="This delivery has already been inspected.")
 
        cursor.execute(
            """
            INSERT INTO ScrapInspections(
                delivery_id, scrapyard_id, clerk_id, scrap_id, actual_weight,
                scrap_grade, unit_price, inspection_date
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            inspection_payload.delivery_id,
            inspection_payload.scrapyard_id,
            inspection_payload.clerk_id,
            inspection_payload.scrap_id,
            inspection_payload.actual_weight,
            inspection_payload.scrap_grade,
            unit_price,
            inspection_payload.inspection_date,
        )
 
        # A heavy enough inspection earns the seller bulk points.
        bulk_awarded = 0
        if float(inspection_payload.actual_weight) >= BULK_WEIGHT_THRESHOLD_KG:
            cursor.execute(
                "UPDATE Sellers SET bulk_points = ISNULL(bulk_points, 0) + ? WHERE seller_id = ?",
                BULK_POINTS_PER_BULK_INSPECTION,
                seller_id,
            )
            bulk_awarded = BULK_POINTS_PER_BULK_INSPECTION
 
        conn.commit()
        message = "Successfully recorded inspection record"
        if bulk_awarded:
            message += f". Bulk delivery - seller earned {bulk_awarded} bulk points."
        return message
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("Scrap inspection recording failed")
        raise HTTPException(status_code=500, detail="Could not record the inspection. Please try again.")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()
 
 
@router.post("/clerks/scrap_proccessing/transction")
def create_transaction(transction_payload: Transction, clerk: dict = Depends(require_clerk)):
    import random
 
    value: list = ["absAs", "ndQkzx", "pqkRr", "mkrRf"]
    v1: int = random.randrange(100, 1000)
    v2: int = random.randint(100, 500)
    v3: str = random.choice(value)
    transaction_ref: str = f"REF{v2}{v3}{v1}"
 
    conn = None
    cursor = None
    try:
        conn = pyodbc.connect(db_connection.connect())
        cursor = conn.cursor()
 
        # The seller and their points come from the inspections delivery.
        cursor.execute(
            """
            SELECT i.unit_price, i.actual_weight, d.seller_id, s.loyalty_points, s.bulk_points
            FROM ScrapInspections i
            JOIN ScrapDeliveries d ON d.delivery_id = i.delivery_id
            JOIN Sellers s ON s.seller_id = d.seller_id
            WHERE i.inspection_id = ?
            """,
            transction_payload.inspection_id,
        )
        row = cursor.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Inspection not found.")
        unit_price = float(row.unit_price)
        actual_weight = float(row.actual_weight)
        seller_id = row.seller_id
 
        cursor.execute(
            "SELECT 1 FROM Transactions WITH (UPDLOCK, HOLDLOCK) WHERE inspection_id = ?",
            transction_payload.inspection_id,
        )
        if cursor.fetchone() is not None:
            raise HTTPException(
                status_code=409,
                detail="A transaction has already been recorded for this inspection.",
            )
 
        base_amount = round(unit_price * actual_weight, 2)
        bonus_amount = compute_bonus(base_amount, row.loyalty_points, row.bulk_points)
        total_amount = round(base_amount + bonus_amount, 2)
 
        cursor.execute(
            """
            INSERT INTO Transactions(
                inspection_id, scrapyard_id, clerk_id, seller_id, unit_price,
                total_amount, payment_method, transaction_ref, transaction_date
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            transction_payload.inspection_id,
            transction_payload.scrapyard_id,
            transction_payload.clerk_id,
            seller_id,
            unit_price,
            total_amount,  # base + any bonus
            transction_payload.payment_method,
            transaction_ref,
            transction_payload.transaction_date,
        )
 
        conn.commit()
        return {
            "message": "Transaction completed successfully",
            "transaction_ref": transaction_ref,
            "unit_price": unit_price,
            "actual_weight": actual_weight,
            "base_amount": base_amount,
            "bonus_amount": bonus_amount,
            "total_amount": total_amount,
            "payment_method": transction_payload.payment_method,
            "transaction_date": transction_payload.transaction_date,
        }
    except HTTPException:
        raise
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("Transaction recording failed")
        raise HTTPException(status_code=500, detail="Could not record the transaction. Please try again.")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()
 

# ---------------------------------------------------------------------------
# Lookup endpoints: populate dashboard <select> fields with id & display name.
# Each returns [{ "id": <value that gets submitted>, "label": <what's shown> }, ...]
# ---------------------------------------------------------------------------

@router.get("/clerks/lookup/sellers")
def list_sellers(clerk: dict = Depends(require_clerk)):
    conn = None
    cursor = None
    try:
        conn = pyodbc.connect(db_connection.connect())
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT s.seller_id, p.first_name, p.last_name
            FROM Sellers s
            JOIN Persons p ON p.person_id = s.person_id
            ORDER BY p.first_name, p.last_name
            """
        )
        return [
            {"id": row.seller_id, "label": f"{row.first_name} {row.last_name}"}
            for row in cursor.fetchall()
        ]
    except Exception:
        logger.exception("Failed to list sellers")
        raise HTTPException(status_code=500, detail="Could not load sellers.")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/clerks/lookup/scraps")
def list_scraps(clerk: dict = Depends(require_clerk)):
    conn = None
    cursor = None
    try:
        conn = pyodbc.connect(db_connection.connect())
        cursor = conn.cursor()
        cursor.execute("SELECT scrap_id, scrap_name FROM Scraps ORDER BY scrap_name")
        return [{"id": row.scrap_id, "label": row.scrap_name} for row in cursor.fetchall()]
    except Exception:
        logger.exception("Failed to list scraps")
        raise HTTPException(status_code=500, detail="Could not load scrap types.")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/clerks/lookup/deliveries")
def list_deliveries(clerk: dict = Depends(require_clerk)):
    conn = None
    cursor = None
    try:
        conn = pyodbc.connect(db_connection.connect())
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT d.delivery_id, d.scrap_description, p.first_name, p.last_name
            FROM ScrapDeliveries d
            JOIN Sellers s ON s.seller_id = d.seller_id
            JOIN Persons p ON p.person_id = s.person_id
            WHERE d.scrapyard_id = ?
            ORDER BY d.delivery_id DESC
            """,
            clerk["scrapyard_id"],
        )
        return [
            {
                "id": row.delivery_id,
                "label": f"Id: {row.delivery_id}: {row.scrap_description} ({row.first_name} {row.last_name})",
            }
            for row in cursor.fetchall()
        ]
    except Exception:
        logger.exception("Failed to list deliveries")
        raise HTTPException(status_code=500, detail="Could not load deliveries.")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/clerks/lookup/inspections")
def list_inspections(clerk: dict = Depends(require_clerk)):
    conn = None
    cursor = None
    try:
        conn = pyodbc.connect(db_connection.connect())
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT i.inspection_id, i.actual_weight, i.unit_price, sc.scrap_name,
                   se.seller_id, p.first_name, p.last_name
            FROM ScrapInspections i
            JOIN Scraps sc ON sc.scrap_id = i.scrap_id
            JOIN ScrapDeliveries d ON d.delivery_id = i.delivery_id
            JOIN Sellers se ON se.seller_id = d.seller_id
            JOIN Persons p ON p.person_id = se.person_id
            WHERE i.scrapyard_id = ?
            ORDER BY i.inspection_id DESC
            """,
            clerk["scrapyard_id"],
        )
        return [
            {
                "id": row.inspection_id,
                "label": f"Id: {row.inspection_id}: {row.scrap_name} ({row.actual_weight}kg)",
                "seller_id": row.seller_id,
                "seller_label": f"{row.first_name} {row.last_name}",
                "total_amount": round(row.unit_price * row.actual_weight, 2),
            }
            for row in cursor.fetchall()
        ]
    except Exception:
        logger.exception("Failed to list inspections")
        raise HTTPException(status_code=500, detail="Could not load inspections.")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/clerks/lookup/collection-requests")
def list_collection_requests(seller_id: int, clerk: dict = Depends(require_clerk)):
    conn = None
    cursor = None
    try:
        conn = pyodbc.connect(db_connection.connect())
        cursor = conn.cursor()
        # Only requests the admin has approved, for this seller, at this clerk's own
        # scrapyard, and not already tied to a recorded delivery.
        cursor.execute(
            """
            SELECT cr.request_id, cr.scrap_type, cr.estimated_weight, cr.collection_date
            FROM CollectRequests cr
            WHERE cr.seller_id = ?
              AND cr.scrapyard_id = ?
              AND cr.request_status = 'approved'
              AND NOT EXISTS (SELECT 1 FROM ScrapDeliveries d WHERE d.request_id = cr.request_id)
            ORDER BY cr.collection_date DESC, cr.request_id DESC
            """,
            seller_id,
            clerk["scrapyard_id"],
        )
        return [
            {
                "id": row.request_id,
                "label": f"#{row.request_id} — {row.scrap_type}, {row.estimated_weight} kg ({row.collection_date})",
            }
            for row in cursor.fetchall()
        ]
    except Exception:
        logger.exception("Failed to list collection requests")
        raise HTTPException(status_code=500, detail="Could not load collection requests.")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


# ---------------------------------------------------------------------------
# signed - in:  clerk's profile & password changes.
# ---------------------------------------------------------------------------

@router.get("/clerks/me")
def get_clerk_profile(clerk: dict = Depends(require_clerk)):
    conn = None
    cursor = None
    try:
        conn = pyodbc.connect(db_connection.connect())
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT p.username, p.first_name, p.last_name, p.id_number, p.age,
                   p.email_address, p.contact_number, p.physical_address, p.date_registered,
                   c.clerk_id, c.scrapyard_id, sy.scrapyard_name
            FROM Persons p
            JOIN Clerks c ON c.person_id = p.person_id
            LEFT JOIN Scrapyards sy ON sy.scrapyard_id = c.scrapyard_id
            WHERE p.person_id = ?
            """,
            int(clerk["sub"]),
        )
        row = cursor.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Clerk profile not found.")
        cols = [c[0] for c in cursor.description]
        return dict(zip(cols, row))
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to load clerk profile")
        raise HTTPException(status_code=500, detail="Could not load your profile.")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.put("/clerks/me")
def update_clerk_profile(person_payload: Person, clerk: dict = Depends(require_clerk)):
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
            int(clerk["sub"]),
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
        logger.exception("Clerk profile update failed")
        raise HTTPException(status_code=500, detail="Could not update your profile. Please try again.")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.put("/clerks/me/password")
def update_clerk_password(payload: ClerkPasswordChange, clerk: dict = Depends(require_clerk)):
    conn = None
    cursor = None
    try:
        conn = pyodbc.connect(db_connection.connect())
        cursor = conn.cursor()

        cursor.execute("SELECT password_hash FROM Clerks WHERE person_id = ?", int(clerk["sub"]))
        row = cursor.fetchone()
        if row is None or not bcrypt.checkpw(payload.current_password.encode(), row.password_hash.encode()):
            raise HTTPException(status_code=401, detail="Current password is incorrect.")

        new_hash = bcrypt.hashpw(payload.new_password.encode(), bcrypt.gensalt()).decode()
        cursor.execute("UPDATE Clerks SET password_hash = ? WHERE person_id = ?", new_hash, int(clerk["sub"]))
        conn.commit()
        return "Password updated"
    except HTTPException:
        raise
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("Clerk password update failed")
        raise HTTPException(status_code=500, detail="Could not update your password. Please try again.")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/clerks/scrap-prices")
def list_clerk_scrap_prices(clerk: dict = Depends(require_clerk)):
    conn = None
    cursor = None
    try:
        conn = pyodbc.connect(db_connection.connect())
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT scrap_id, scrap_name, unit_price, min_price, max_price, unit_measure, last_updated
            FROM Scraps
            WHERE scrapyard_id = ?
            ORDER BY scrap_name
            """,
            clerk["scrapyard_id"],
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
