import asyncio
from sqlalchemy import text
from app.database import engine

async def main():
    async with engine.connect() as conn:
        result = await conn.execute(text("SELECT id, subtotal, discount, total_amount, agency_cost, net_income_value FROM orders ORDER BY id DESC LIMIT 5;"))
        with open('db_res.txt', 'w') as f:
            for row in result:
                f.write(f"{row[0]} | {row[1]} | {row[2]} | {row[3]} | {row[4]} | {row[5]}\n")

if __name__ == "__main__":
    asyncio.run(main())
