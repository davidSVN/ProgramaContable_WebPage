import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

# Añadir el directorio raíz al path para importar app
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import AsyncSessionLocal
from app.models import OrderHeader

TENANT_ID = 1

def get_relative_date(label: str) -> datetime:
    now = datetime.utcnow()
    if "hour" in label:
        hours = int(label.split()[0])
        return now - timedelta(hours=hours)
    if "yesterday" in label:
        return now - timedelta(days=1)
    if "day" in label:
        days = int(label.split()[0])
        return now - timedelta(days=days)
    return now

async def seed():
    delivered_data = [
        {
            "delivered_by": "Carlos Méndez",
            "received_by_name": "María Torres",
            "received_by_cedula": "1020304050",
            "invoice_delivered": True,
            "delivered_at_str": "2 hours ago"
        },
        {
            "delivered_by": "Luisa Torres", 
            "received_by_name": "Juan García",
            "received_by_cedula": "9876543210",
            "invoice_delivered": False,
            "delivered_at_str": "yesterday"
        },
        {
            "delivered_by": "Carlos Méndez",
            "received_by_name": "Sofía Ramírez",
            "received_by_cedula": "1122334455",
            "invoice_delivered": True,
            "delivered_at_str": "3 days ago"
        },
        {
            "delivered_by": "Andrés Felipe",
            "received_by_name": "Ricardo López",
            "received_by_cedula": "80776655",
            "invoice_delivered": True,
            "delivered_at_str": "12 hours ago"
        },
        {
            "delivered_by": "Luisa Torres",
            "received_by_name": "Elena Gómez",
            "received_by_cedula": "52443322",
            "invoice_delivered": False,
            "delivered_at_str": "2 days ago"
        },
        {
            "delivered_by": "Carlos Méndez",
            "received_by_name": "Roberto Díaz",
            "received_by_cedula": "1033445566",
            "invoice_delivered": True,
            "delivered_at_str": "4 days ago"
        },
        {
            "delivered_by": "Andrés Felipe",
            "received_by_name": "Patricia Sosa",
            "received_by_cedula": "32112233",
            "invoice_delivered": False,
            "delivered_at_str": "5 days ago"
        },
        {
            "delivered_by": "Luisa Torres",
            "received_by_name": "Fernando Vale",
            "received_by_cedula": "79887766",
            "invoice_delivered": True,
            "delivered_at_str": "yesterday"
        },
        {
            "delivered_by": "Carlos Méndez",
            "received_by_name": "Diana Castro",
            "received_by_cedula": "1000222333",
            "invoice_delivered": True,
            "delivered_at_str": "6 hours ago"
        },
        {
            "delivered_by": "Andrés Felipe",
            "received_by_name": "Mateo Rojas",
            "received_by_cedula": "111222333",
            "invoice_delivered": False,
            "delivered_at_str": "1 day ago"
        },
    ]

    async with AsyncSessionLocal() as db:
        # 1. Obtener las 10 órdenes "Entregada" más recientes para el tenant 1
        stmt = (
            select(OrderHeader)
            .where(OrderHeader.tenant_id == TENANT_ID, OrderHeader.order_status == "Entregada")
            .order_by(OrderHeader.date.desc())
            .limit(10)
        )
        result = await db.execute(stmt)
        orders = result.scalars().all()

        if not orders:
            print("⚠️ No se encontraron órdenes con estado 'Entregada' para el tenant 1.")
            return

        # 2. Actualizar cada orden con los datos ficticios
        for i, order in enumerate(orders):
            data = delivered_data[i % len(delivered_data)]
            order.delivered_by = data["delivered_by"]
            order.received_by_name = data["received_by_name"]
            order.received_by_cedula = data["received_by_cedula"]
            order.invoice_delivered = data["invoice_delivered"]
            order.delivered_at = get_relative_date(data["delivered_at_str"])
            order.delivery_signature = None
        
        # 3. Fix all old orders (tenant 1) with default values if necessary
        # We ensure delivered_at, delivered_by, etc. are not NULL for a consistent state
        fix_stmt = (
            update(OrderHeader)
            .where(OrderHeader.tenant_id == TENANT_ID)
            .where(OrderHeader.delivered_by == None)
            .values(
                invoice_delivered=False,
                delivered_by="System",
                received_by_name="N/A"
            )
        )
        await db.execute(fix_stmt)

        await db.commit()
        print(f"✅ {len(orders)} órdenes actualizadas con datos de entrega")
        print("✅ Órdenes antiguas actualizadas con valores por defecto")

if __name__ == "__main__":
    asyncio.run(seed())
