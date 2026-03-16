import asyncio
import os
from sqlalchemy import text
from app.database import engine

async def apply_updates():
    print("Applying schema updates to app_users table...")
    async with engine.begin() as conn:
        await conn.execute(text("ALTER TABLE app_users ADD COLUMN IF NOT EXISTS cedula VARCHAR(20);"))
        await conn.execute(text("ALTER TABLE app_users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP;"))
    print("✅ Schema updates applied successfully.")

if __name__ == "__main__":
    asyncio.run(apply_updates())
