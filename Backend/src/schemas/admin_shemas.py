from pydantic import BaseModel, Field
from typing import Literal, Optional

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


class Admin(BaseModel):
    person_id: int = None
    scrapyard_id: int = None
    password: str = Field(min_length=8, max_length=72)

class AdminLogin(BaseModel):
    email_address: str
    password: str

class RequestDecision(BaseModel):
    status: Literal["approved", "rejected"]

class ScrapyardUpdate(BaseModel):
    scrapyard_name: str = Field(min_length=1, max_length=40)
    email_address: Optional[str] = Field(default=None, max_length=60)
    contact_number: Optional[str] = Field(default=None, max_length=10)
    registration_number: Optional[str] = Field(default=None, max_length=14)
    physical_address: Optional[str] = Field(default=None, max_length=255)
    opening_hour: Optional[str] = Field(default=None, max_length=10)
    closing_hour: Optional[str] = Field(default=None, max_length=10)
    operating_days: Optional[str] = Field(default=None, max_length=10)


class Blacklist(BaseModel):
    seller_id: int = None
    scrapyard_id: int = None
    reason: str
    blacklist_status: str = None
    blacklist_date: str = None

class ScheduleRequest(BaseModel):
    request_id: int = None
    admin_id: int = None
    driver_id: int = None
    vehicle_id: int = None
    vehicle_type_id: int = None

class Scrap(BaseModel):
    scrapyard_id: int = None
    scrap_name: str = None
    unit_price: float = None
    min_price: float = None
    max_price: float = None
    unit_measure: str = None
    last_updated: str = None