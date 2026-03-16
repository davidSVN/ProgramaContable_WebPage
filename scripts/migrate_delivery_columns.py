import asyncio
import os
import sys
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# Añadir el directorio raíz al path para importar app
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import AsyncSessionLocal

async def migrate():
    async with AsyncSessionLocal() as db:
        try:
            print("⏳ Aplicando migración de columnas de entrega...")
            commands = [
                "ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP;",
                "ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_by VARCHAR(100);",
                "ALTER TABLE orders ADD COLUMN IF NOT EXISTS received_by_name VARCHAR(100);",
                "ALTER TABLE orders ADD COLUMN IF NOT EXISTS received_by_cedula VARCHAR(20);",
                "ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_delivered BOOLEAN;",
                "ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_signature TEXT;"
            ]
            for cmd in commands:
                await db.execute(text(cmd))
            
            await db.commit()
            print("✅ Columnas de entrega añadidas exitosamente.")
        except Exception as e:
            print(f"❌ Error durante la migración: {str(e)}")
            await db.rollback()

if __name__ == "__main__":
    asyncio.run(migrate())
