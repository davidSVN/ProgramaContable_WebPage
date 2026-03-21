
import asyncio
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models import AppUser

async def get_sa_id():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(AppUser).where(AppUser.email == "santiago.vasquez1129@gmail.com"))
        user = result.scalars().first()
        if user:
            print(f"FOUND_SUPERADMIN_ID: {user.id}")
        else:
            print("NO_SUPERADMIN_FOUND")

if __name__ == "__main__":
    asyncio.run(get_sa_id())
