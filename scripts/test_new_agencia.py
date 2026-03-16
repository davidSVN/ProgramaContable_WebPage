import asyncio
from app.database import AsyncSessionLocal
from app.services import gastos_service

async def test_new_agencia_logic():
    print("Testing listar_detalles_agencia directly...")
    async with AsyncSessionLocal() as db:
        # Testing for tenant 1
        res = await gastos_service.listar_detalles_agencia(db, tenant_id=1, limit=5)
        print(f"Returned {len(res)} detailed agency items.")
        for item in res:
            print(f"  Order #{item.order_id} | {item.customer_name} | {item.service_name} | Cost: {item.agency_cost}")

if __name__ == "__main__":
    asyncio.run(test_new_agencia_logic())
