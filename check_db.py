
import asyncio
from sqlalchemy import text
from app.database import engine

async def check_columns():
    async with engine.connect() as conn:
        for table in ["order_details", "order_payments", "orders"]:
            print(f"Checking {table}...")
            res = await conn.execute(text(f"SELECT column_name FROM information_schema.columns WHERE table_name = '{table}' AND column_name = 'order_number'"))
            exists = res.scalar()
            print(f"  Column 'order_number' exists: {exists is not None}")

if __name__ == "__main__":
    asyncio.run(check_columns())
