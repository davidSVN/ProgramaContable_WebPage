
import asyncio
from sqlalchemy import text
from app.database import engine

async def update_schema():
    async with engine.begin() as conn:
        # Alter user_contact type
        print("Alterando user_contact...")
        await conn.execute(text("ALTER TABLE laundry_users ALTER COLUMN user_contact TYPE VARCHAR(50);"))
        
        # Add email
        print("Añadiendo columna email...")
        await conn.execute(text("ALTER TABLE laundry_users ADD COLUMN IF NOT EXISTS email VARCHAR(150);"))
        
        # Add nit
        print("Añadiendo columna nit...")
        await conn.execute(text("ALTER TABLE laundry_users ADD COLUMN IF NOT EXISTS nit VARCHAR(50);"))
        
        # Add user_type
        print("Añadiendo columna user_type...")
        await conn.execute(text("ALTER TABLE laundry_users ADD COLUMN IF NOT EXISTS user_type VARCHAR(20) DEFAULT 'B2C';"))
        
        # Add payment_condition
        print("Añadiendo columna payment_condition...")
        await conn.execute(text("ALTER TABLE laundry_users ADD COLUMN IF NOT EXISTS payment_condition VARCHAR(50) DEFAULT 'Contado';"))
        
    print("Esquema actualizado correctamente.")

if __name__ == "__main__":
    asyncio.run(update_schema())
