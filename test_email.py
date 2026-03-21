from pydantic import BaseModel, EmailStr

class Test(BaseModel):
    email: EmailStr

try:
    t = Test(email="valid@example.com")
    print(f"Validation successful: {t.email}")
except Exception as e:
    print(f"Validation failed: {e}")
