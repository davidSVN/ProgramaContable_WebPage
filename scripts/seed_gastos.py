import asyncio
import os
import sys
from datetime import date, datetime, timedelta
from typing import List, Dict, Any

# Add the project root to sys.path to allow importing from 'app'
sys.path.append(os.getcwd())

from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models import SpentBusiness

# --- CONFIGURATION ---
TENANT_ID = 1

MONTHLY_EXPENSES = {
    "Nómina": [
        {"name": "Salario Carlos Méndez", "value": 1300000, "method": "Transferencia", "description": "Salario mensual empleado"},
        {"name": "Salario Luisa Torres", "value": 1200000, "method": "Transferencia", "description": "Salario mensual empleada"},
    ],
    "Servicios Públicos": [
        {"name": "Factura Agua", "value": 85000, "method": "Efectivo", "description": None},
        {"name": "Factura Luz", "value": 220000, "method": "Efectivo", "description": None},
        {"name": "Factura Gas", "value": 95000, "method": "Efectivo", "description": None},
    ],
    "Arriendo": [
        {"name": "Arriendo local lavandería", "value": 800000, "method": "Transferencia", "description": None},
    ]
}

ONETIME_EXPENSES = [
    {"category": "Papelería", "name": "Resma papel facturas", "value": 45000, "method": "Efectivo", "description": None},
    {"category": "Papelería", "name": "Bolsas empaque", "value": 38000, "method": "Efectivo", "description": None},
    {"category": "Publicidad", "name": "Pauta Instagram", "value": 150000, "method": "Nequi", "description": "Campaña 15 días redes sociales"},
    {"category": "Publicidad", "name": "Volantes impresos", "value": 80000, "method": "Efectivo", "description": None},
    {"category": "Préstamos", "name": "Cuota préstamo maquinaria", "value": 450000, "method": "Transferencia", "description": "Cuota 8 de 24 - lavadora industrial"},
    {"category": "Otros", "name": "Mantenimiento lavadora", "value": 120000, "method": "Efectivo", "description": "Cambio de filtros y revisión general"},
]

def get_last_months_dates(count: int) -> List[date]:
    """Returns a list of dates representing the 15th of each of the last X months."""
    dates = []
    today = date.today()
    for i in range(count):
        # Go back i months
        year = today.year
        month = today.month - i
        while month <= 0:
            month += 12
            year -= 1
        dates.append(date(year, month, 15))
    return dates

async def seed_gastos():
    summary = {
        "Nómina": 0,
        "Servicios Públicos": 0,
        "Arriendo": 0,
        "Otros": 0,
        "Total Count": 0,
        "Total Value": 0.0
    }
    
    last_3_months = get_last_months_dates(3)
    today = date.today()
    
    async with AsyncSessionLocal() as session:
        # 1. Insert Monthly Expenses
        for target_date in last_3_months:
            # Convert date to datetime for SpentBusiness model which uses DateTime
            # Alternatively, SpentBusiness model has spent_date = Column(DateTime, default=datetime.utcnow)
            dt_to_save = datetime.combine(target_date, datetime.min.time())
            
            for category, items in MONTHLY_EXPENSES.items():
                for item in items:
                    # Check existence
                    res = await session.execute(
                        select(SpentBusiness).where(
                            SpentBusiness.spent_general_name == item["name"],
                            SpentBusiness.tenant_id == TENANT_ID
                        )
                    )
                    existing = res.scalars().all()
                    already_exists = any(g.spent_date.year == target_date.year and g.spent_date.month == target_date.month for g in existing)
                    
                    if not already_exists:
                        new_gasto = SpentBusiness(
                            tenant_id=TENANT_ID,
                            spent_category=category,
                            spent_general_name=item["name"],
                            spent_value=item["value"],
                            spent_payment_method=item["method"],
                            description=item.get("description"),
                            spent_date=dt_to_save
                        )
                        session.add(new_gasto)
                        summary[category if category in summary else "Otros"] += 1
                        summary["Total Count"] += 1
                        summary["Total Value"] += item["value"]

        # 2. Insert One-time Expenses (Current Month)
        for item in ONETIME_EXPENSES:
            res = await session.execute(
                select(SpentBusiness).where(
                    SpentBusiness.spent_general_name == item["name"],
                    SpentBusiness.tenant_id == TENANT_ID
                )
            )
            existing = res.scalars().all()
            already_exists = any(g.spent_date.year == today.year and g.spent_date.month == today.month for g in existing)
            
            if not already_exists:
                new_gasto = SpentBusiness(
                    tenant_id=TENANT_ID,
                    spent_category=item["category"],
                    spent_general_name=item["name"],
                    spent_value=item["value"],
                    spent_payment_method=item["method"],
                    description=item.get("description"),
                    spent_date=datetime.now()
                )
                session.add(new_gasto)
                summary[item["category"] if item["category"] in summary else "Otros"] += 1
                summary["Total Count"] += 1
                summary["Total Value"] += item["value"]

        await session.commit()
    
    print(f"✅ Seed gastos: {summary['Total Count']} registros insertados")
    print(f"  - Nómina: {summary['Nómina']} | Servicios: {summary['Servicios Públicos']} | Arriendo: {summary['Arriendo']} | Otros: {summary['Otros']}")
    print(f"  - Total insertado: ${summary['Total Value']:,.0f}")

if __name__ == "__main__":
    asyncio.run(seed_gastos())
