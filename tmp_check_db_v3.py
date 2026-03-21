
import asyncio
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models import Tenant, AppSettings

async def check_db():
    async with AsyncSessionLocal() as db:
        print("--- TENANTS ---")
        result = await db.execute(select(Tenant))
        tenants = result.scalars().all()
        for t in tenants:
            # Print ID and Name, handling potential special characters
            print(f"ID={t.id} | Nombre={repr(t.nombre)} | Active={t.is_active}")

        print("\n--- RELEVANT SETTINGS FOR TENANT 5 ---")
        # Exclude 'business_logo' to avoid terminal flooding
        result = await db.execute(select(AppSettings).where(AppSettings.tenant_id == 5))
        settings = result.scalars().all()
        for s in settings:
            if s.key == "business_logo" or len(s.value) > 200:
                print(f"Key={repr(s.key)} | Value=(Too long or Binary, len={len(s.value)})")
            else:
                print(f"Key={repr(s.key)} | Value={repr(s.value)}")

if __name__ == "__main__":
    asyncio.run(check_db())
