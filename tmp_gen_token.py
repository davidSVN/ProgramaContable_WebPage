
import asyncio
from app.services.auth_service import crear_token_jwt
from app.database import AsyncSessionLocal
from app.models import AppUser
from sqlalchemy import select

async def generate_sa_token():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(AppUser).where(AppUser.id == 2))
        user = result.scalars().first()
        if not user:
            print("USER_NOT_FOUND")
            return
            
        token = crear_token_jwt({
            "user_id": user.id,
            "email": user.email,
            "role": user.role,
            "tenant_id": user.tenant_id,
            "plan": "superadmin"
        })
        print(f"SA_TOKEN: {token}")

if __name__ == "__main__":
    asyncio.run(generate_sa_token())
