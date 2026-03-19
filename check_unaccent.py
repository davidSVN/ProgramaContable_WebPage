
import asyncio
from sqlalchemy import text
from app.database import engine

async def check_unaccent():
    try:
        async with engine.connect() as conn:
            # Try to use unaccent
            await conn.execute(text("SELECT unaccent('áéíóúÁÉÍÓÚ')"))
            print("unaccent is available")
    except Exception as e:
        print(f"unaccent is NOT available: {e}")
        print("Attempting to enable it...")
        try:
            async with engine.begin() as conn:
                await conn.execute(text("CREATE EXTENSION IF NOT EXISTS unaccent"))
            print("unaccent enabled successfully")
        except Exception as e2:
            print(f"Failed to enable unaccent: {e2}")

if __name__ == "__main__":
    asyncio.run(check_unaccent())
