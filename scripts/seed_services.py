import asyncio
import os
import sys

# Add the project root to sys.path to allow importing from 'app'
# This script is expected to be run from the project root: python scripts/seed_services.py
sys.path.append(os.getcwd())

from sqlalchemy import select, update
from app.database import AsyncSessionLocal
from app.models import Service

B2C_SERVICES = [
    ("Lavado Simple", 12000.0, 3000.0, "Lavado estándar de prendas"),
    ("Lavado + Secado", 25000.0, 6000.0, "Sesión de 2 horas máximo"),
    ("Secado Solo", 13000.0, 3500.0, "Sesión de 40 min"),
    ("De 0 - 5 Libras", 4700.0, 1200.0, "Precio por peso hasta 5 libras"),
    ("De 5.1 - 10 Libras", 4200.0, 1100.0, "Precio por peso 5 a 10 libras"),
    ("Mayor a 10.1 Libras", 3800.0, 1000.0, "Precio por libra mayor a 10"),
    ("Sencillo", 30000.0, 8000.0, "Adjuntar medidas"),
    ("Lavado en Seco", 45000.0, 12000.0, "Prendas delicadas"),
    ("Edredón Sencillo", 35000.0, 9000.0, "Edredones tamaño sencillo"),
    ("Edredón Doble", 55000.0, 14000.0, "Edredones tamaño doble o queen"),
    ("Planchado", 8000.0, 2000.0, "Planchado por prenda"),
    ("Lavado Especial", 60000.0, 16000.0, "Prendas con tratamiento especial"),
]

B2B_SERVICES = [
    ("Lavado Industrial Hotel", 18000.0, 4500.0, "Hotel Dann Carlton", "Precio por convenio hotelero"),
    ("Lavado Clínica", 22000.0, 5500.0, "Clínica San Rafael", "Uniformes y ropa de cama clínica"),
    ("Lavado Restaurante", 15000.0, 3800.0, "Restaurante La Fondue", "Manteles y uniformes"),
    ("Lavado Colegio", 14000.0, 3500.0, "Colegio Los Andes", "Uniformes deportivos"),
    ("Servicio Express B2B", 35000.0, 9000.0, "Hotel Bogotá Plaza", "Entrega en 4 horas"),
    ("Lavado Corporativo", 20000.0, 5000.0, "Constructora Ospina", "Dotación corporativa mensual"),
]

async def seed_services():
    tenant_id = 1
    
    async with AsyncSessionLocal() as session:
        # B2C
        for name, value, spent, desc in B2C_SERVICES:
            stmt = select(Service).where(Service.service_name == name, Service.tenant_id == tenant_id)
            result = await session.execute(stmt)
            service = result.scalar_one_or_none()
            
            if service:
                # Update existing
                service.service_value = value
                service.spent_per_service = spent
                service.description = desc
                service.user_institute = "usuario"
                service.nombre_instituto = None
                print(f"Actualizando B2C: {name} | ${value:,.0f}")
            else:
                # Create new
                new_service = Service(
                    tenant_id=tenant_id,
                    service_name=name,
                    service_value=value,
                    spent_per_service=spent,
                    description=desc,
                    user_institute="usuario",
                    nombre_instituto=None
                )
                session.add(new_service)
                print(f"Insertando B2C: {name} | ${value:,.0f}")

        # B2B
        for name, value, spent, inst, desc in B2B_SERVICES:
            stmt = select(Service).where(Service.service_name == name, Service.tenant_id == tenant_id)
            result = await session.execute(stmt)
            service = result.scalar_one_or_none()
            
            if service:
                # Update existing
                service.service_value = value
                service.spent_per_service = spent
                service.description = desc
                service.user_institute = "instituto"
                service.nombre_instituto = inst
                print(f"Actualizando B2B: {name} | ${value:,.0f}")
            else:
                # Create new
                new_service = Service(
                    tenant_id=tenant_id,
                    service_name=name,
                    service_value=value,
                    spent_per_service=spent,
                    description=desc,
                    user_institute="instituto",
                    nombre_instituto=inst
                )
                session.add(new_service)
                print(f"Insertando B2B: {name} | ${value:,.0f}")

        await session.commit()
        
        # Verify final counts
        stmt_b2c = select(Service).where(Service.tenant_id == tenant_id, Service.user_institute == "usuario")
        res_b2c = await session.execute(stmt_b2c)
        count_b2c = len(res_b2c.scalars().all())
        
        stmt_b2b = select(Service).where(Service.tenant_id == tenant_id, Service.user_institute == "instituto")
        res_b2b = await session.execute(stmt_b2b)
        count_b2b = len(res_b2b.scalars().all())
        
    print(f"\n✅ {count_b2c + count_b2b} servicios insertados en tenant_id=1 ({count_b2c} B2C + {count_b2b} B2B)")

if __name__ == "__main__":
    asyncio.run(seed_services())
