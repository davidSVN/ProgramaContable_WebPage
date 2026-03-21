
import asyncio
from sqlalchemy import select, func
from app.database import AsyncSessionLocal
from app.models import Tenant, AppSettings

async def check_db():
    async with AsyncSessionLocal() as db:
        # Get all tenants to see what's there
        result = await db.execute(select(Tenant))
        tenants = result.scalars().all()
        print("--- TENANTS ---")
        for t in tenants:
            print(f"ID={t.id} | Nombre={repr(t.nombre)} | Active={t.is_active}")

        print("\n--- SETTINGS FOR TENANT 5 ---")
        result = await db.execute(select(AppSettings).where(AppSettings.tenant_id == 5))
        settings = result.scalars().all()
        for s in settings:
            print(f"Key={repr(s.key)} | Value={repr(s.value)}")

if __name__ == "__main__":
    asyncio.run(check_db())
