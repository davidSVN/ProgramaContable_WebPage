
import asyncio
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models import AppUser

async def find_superadmin():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(AppUser).where(AppUser.role == "superadmin"))
        user = result.scalars().first()
        if user:
            print(f"FOUND_SUPERADMIN_EMAIL: {user.email}")
        else:
            print("NO_SUPERADMIN_FOUND")

if __name__ == "__main__":
    asyncio.run(find_superadmin())
