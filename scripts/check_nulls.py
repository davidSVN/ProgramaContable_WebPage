import asyncio
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models import SpentBusiness

async def check_nulls():
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(SpentBusiness).where(SpentBusiness.spent_category == "Agencia"))
        spents = res.scalars().all()
        print(f"Checking {len(spents)} agency gastos for nulls in required fields:")
        for s in spents:
            print(f"ID: {s.spent_id}")
            print(f"  spent_payment_method: {s.spent_payment_method}")
            print(f"  spent_value: {s.spent_value}")
            print(f"  spent_date: {s.spent_date}")
            print(f"  spent_general_name: {s.spent_general_name}")

if __name__ == "__main__":
    asyncio.run(check_nulls())
