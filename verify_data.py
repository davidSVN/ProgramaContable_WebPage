
import asyncio
from app.database import AsyncSessionLocal
from app.services import usuario_service

async def verify():
    tenant_id = 1
    async with AsyncSessionLocal() as session:
        usuarios = await usuario_service.listar(session, tenant_id, limit=50)
        print(f"Total usuarios recuperados: {len(usuarios)}")
        for u in usuarios:
            print(f"ID: {u.user_id}, Nombre: {u.user_name}, Tipo: {u.user_type}, Contacto: {u.user_contact}, Email: {u.email}, NIT: {u.nit}, Gastado: {u.total_spent}, Ordenes: {u.total_orders}")

if __name__ == "__main__":
    asyncio.run(verify())
