from typing import Any, Union, Optional
from pydantic import BaseModel, Field


class Person(BaseModel):
    username: str = None
    first_name:str = None
    last_name: str = None
    id_number: str = None
    age: int = None
    email_address: str = None
    contact_number: str = None
    physical_address: str = None
    date_registered: str = None


class Clerk(BaseModel):
    scrapyard_id: int
    password: str = Field(min_length=8, max_length=72)  # bcrypt's limit is 72 bytespip install bcrypt PyJWT

class ClerkLogin(BaseModel):
    email_address: str
    password: str

class Deliveries(BaseModel):
    seller_id: int = None
    request_id: Optional[int] = None
    clerk_id: int = None
    scrapyard_id: int = None
    scrap_description: str = None
    estimated_weight: float = None
    delivery_type: str = None
    delivery_date: str = None

class Inspection(BaseModel):
    delivery_id: int = None
    scrapyard_id: int = None
    clerk_id: int = None
    scrap_id: int = None
    actual_weight: float = None
    scrap_grade: str = None
    unit_price: float = None
    inspection_date: str = None

class Transction(BaseModel):
    inspection_id: int = None
    scrapyard_id: int = None
    clerk_id: int = None
    seller_id: int = None
    unit_price: float = None
    total_amount: float = None
    payment_method: str = None
    transaction_ref: str = None
    transaction_date: str = None

class ClerkPasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=72)
