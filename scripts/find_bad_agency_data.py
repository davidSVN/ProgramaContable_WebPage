import asyncio
from sqlalchemy import select, or_
from app.database import AsyncSessionLocal
from app.models import SpentBusiness

async def find_bad_data():
    async with AsyncSessionLocal() as db:
        # Check for entries missing required fields for GastoResponse
        stmt = select(SpentBusiness).where(
            SpentBusiness.spent_category == "Agencia",
            or_(
                SpentBusiness.spent_payment_method == None,
                SpentBusiness.spent_value == None,
                SpentBusiness.spent_date == None,
                SpentBusiness.spent_general_name == None
            )
        )
        res = await db.execute(stmt)
        bad_entries = res.scalars().all()
        print(f"Total agency entries with NULLs in required fields: {len(bad_entries)}")
        for e in bad_entries:
            print(f"  ID: {e.spent_id}, Payment: {e.spent_payment_method}, Val: {e.spent_value}, Date: {e.spent_date}, Name: {e.spent_general_name}")

        # Summary of all agency entries
        res_all = await db.execute(select(SpentBusiness).where(SpentBusiness.spent_category == "Agencia"))
        all_entries = res_all.scalars().all()
        print(f"\nAll Agency Entries ({len(all_entries)}):")
        for e in all_entries:
            print(f"  ID: {e.spent_id} | Name: {e.spent_general_name} | Value: {e.spent_value} | Method: {e.spent_payment_method}")

if __name__ == "__main__":
    asyncio.run(find_bad_data())
