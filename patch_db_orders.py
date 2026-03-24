import asyncio
import os
from sqlalchemy import text
from app.database import AsyncSessionLocal, engine

async def run_patch():
    # 1. Add column
    async with engine.begin() as conn:
        try:
            await conn.execute(text('''ALTER TABLE "orders" ADD COLUMN order_number INTEGER DEFAULT NULL;'''))
            print("Added order_number column to orders table.")
        except Exception as e:
            print("Column may already exist or error:", e)

    # 2. Backfill sequentially
    async with AsyncSessionLocal() as session:
        tenants_query = await session.execute(text('''SELECT DISTINCT tenant_id FROM "orders"'''))
        tenants = [row[0] for row in tenants_query.all() if row[0] is not None]

        for tid in tenants:
            orders_q = await session.execute(
                text('''SELECT id FROM "orders" WHERE tenant_id = :tid ORDER BY id ASC'''),
                {"tid": tid}
            )
            order_ids = [row[0] for row in orders_q.all()]

            for i, oid in enumerate(order_ids, start=1):
                await session.execute(
                    text('''UPDATE "orders" SET order_number = :onum WHERE id = :oid'''),
                    {"onum": i, "oid": oid}
                )
            
            print(f"Tenant {tid}: backfilled {len(order_ids)} orders sequentially.")

        await session.commit()
    print("Database migration logic completed successfully!")

if __name__ == '__main__':
    asyncio.run(run_patch())
