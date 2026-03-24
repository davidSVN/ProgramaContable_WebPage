
import asyncio
from sqlalchemy import text
from app.database import engine

async def check_constraints():
    async with engine.connect() as conn:
        print("Constraints on 'orders':")
        res = await conn.execute(text("SELECT conname, pg_get_constraintdef(c.oid) FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace JOIN pg_class t ON t.oid = c.conrelid WHERE t.relname = 'orders'"))
        for row in res:
            print(f"  {row[0]}: {row[1]}")

        print("\nConstraints on 'order_details':")
        res = await conn.execute(text("SELECT conname, pg_get_constraintdef(c.oid) FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace JOIN pg_class t ON t.oid = c.conrelid WHERE t.relname = 'order_details'"))
        for row in res:
            print(f"  {row[0]}: {row[1]}")

if __name__ == "__main__":
    asyncio.run(check_constraints())
