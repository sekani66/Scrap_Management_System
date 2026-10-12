import os
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from src.routes import (
    clerk,
    admin,
    seller
)
from src.services import db_connection
import pyodbc
import logging


app = FastAPI()
logger = logging.getLogger(__name__)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex="http://(localhost|127\\.0\\.0\\.1):\\d+",
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)
@app.get("/")
def root():
    conn = None
    cursor = None
    try: 
        conn = pyodbc.connect(db_connection.connect())
        cursor = conn.cursor()
        return {"DB Connection": "Active"} if cursor else {"DB Connection": "Not Connected"}
    except Exception:
        return {"DB Connection": "Not Connected"}

    

app.mount("/media", StaticFiles(directory=os.getenv("UPLOAD_DIR", "uploads")), name="media")
app.include_router(seller.seller_router)
app.include_router(admin.router)
app.include_router(clerk.router)
