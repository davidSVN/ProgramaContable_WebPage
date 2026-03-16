import asyncio
from sqlalchemy import text
from app.database import engine

async def update_schema():
    async with engine.begin() as conn:
        print("Añadiendo columna description a order_details...")
        await conn.execute(text("ALTER TABLE order_details ADD COLUMN IF NOT EXISTS description TEXT;"))
    print("Columna añadida correctamente.")

if __name__ == "__main__":
    asyncio.run(update_schema())
