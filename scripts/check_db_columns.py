import asyncio
import os
import sys
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# Añadir el directorio raíz al path para importar app
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import AsyncSessionLocal

async def check_columns():
    async with AsyncSessionLocal() as db:
        try:
            # Check for columns in the orders table
            query = text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'orders' 
                AND column_name IN (
                    'delivered_at', 'delivered_by', 'received_by_name', 
                    'received_by_cedula', 'invoice_delivered', 'delivery_signature'
                );
            """)
            result = await db.execute(query)
            columns = [row[0] for row in result.fetchall()]
            print(f"COLUMNS_FOUND: {', '.join(columns)}")
        except Exception as e:
            print(f"ERROR: {str(e)}")

if __name__ == "__main__":
    asyncio.run(check_columns())
