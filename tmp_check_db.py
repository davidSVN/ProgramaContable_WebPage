
import asyncio
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models import Tenant, AppSettings

async def check_db():
    async with AsyncSessionLocal() as db:
        # Check Tenant 5
        result = await db.execute(select(Tenant).where(Tenant.id == 5))
        tenant = result.scalars().first()
        if tenant:
            print(f"Tenant 5: ID={tenant.id}, Nombre='{tenant.nombre}', Active={tenant.is_active}")
        else:
            print("Tenant 5 no encontrado")

        # Check all tenants named LAVALATU (case insensitive)
        from sqlalchemy import func
        result = await db.execute(select(Tenant).where(func.lower(Tenant.nombre) == "lavalatu"))
        tenants = result.scalars().all()
        for t in tenants:
            print(f"Found Tenant: ID={t.id}, Nombre='{t.nombre}', Active={t.is_active}")

        # Check AppSettings for Tenant 5
        result = await db.execute(select(AppSettings).where(AppSettings.tenant_id == 5, AppSettings.key == "business_name"))
        setting = result.scalars().first()
        if setting:
            print(f"Tenant 5 business_name setting: '{setting.value}'")
        else:
            print("Tenant 5 no tiene setting 'business_name' (usará default 'LAVALATU')")

if __name__ == "__main__":
    asyncio.run(check_db())
