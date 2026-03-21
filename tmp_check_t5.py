
import asyncio
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models import Tenant

async def check_db():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Tenant).where(Tenant.id == 5))
        t = result.scalars().first()
        if t:
            print(f"RESULT_TENANT_5_NAME: {t.nombre}")
            print(f"RESULT_TENANT_5_ACTIVE: {t.is_active}")
        else:
            print("RESULT_TENANT_5_NOT_FOUND")

if __name__ == "__main__":
    asyncio.run(check_db())
