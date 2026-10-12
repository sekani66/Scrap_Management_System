from pydantic import BaseModel, Field

class Person(BaseModel):
    username:       str
    first_name:     str 
    last_name:      str
    id_number:      str
    age:            int
    email_address:  str
    contact_number: str
    physical_address: str
    date_registered: str

class Seller(BaseModel):
    password: str = Field(min_length=8, max_length=72)

class SelleLogin(BaseModel):
    email_address: str 
    password:      str

class SellerPasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=72)

class CollectRequest(BaseModel):
    scrapyard_id: int
    seller_id: int
    contact: str
    scrap_type: str
    estimated_weight: float
    collection_address: str
    collection_time: str
    collection_date: str
