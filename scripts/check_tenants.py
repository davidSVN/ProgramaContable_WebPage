import asyncio
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models import SpentBusiness, AppUser

async def check_tenants():
    async with AsyncSessionLocal() as db:
        res_spent = await db.execute(select(SpentBusiness).where(SpentBusiness.spent_category == "Agencia"))
        spents = res_spent.scalars().all()
        print(f"Total SpentBusiness (Agencia): {len(spents)}")
        for s in spents:
            print(f"  ID: {s.spent_id}, Tenant: {s.tenant_id}, Value: {s.spent_value}")

        res_users = await db.execute(select(AppUser))
        users = res_users.scalars().all()
        print(f"\nUsers and their tenants:")
        for u in users:
            print(f"  User: {u.username}, Tenant ID: {u.tenant_id}")

if __name__ == "__main__":
    asyncio.run(check_tenants())
