import asyncio
import httpx

async def test_agencia_endpoint():
    # We need a token to test it. Let's try to find an admin user or just bypass if possible (but we can't bypass Depends(get_current_user))
    # Alternatively, I'll just run a script that calls the service directly.
    print("Testing gastos_service.listar directly...")
    from app.database import AsyncSessionLocal
    from app.services import gastos_service
    from app.services.gastos_service import FiltrosGasto

    async with AsyncSessionLocal() as db:
        filtros = FiltrosGasto(categoria="Agencia")
        # Testing for tenant 1
        res = await gastos_service.listar(db, tenant_id=1, filtros=filtros)
        print(f"Service returned {len(res)} items for tenant 1")
        for item in res:
            print(f"  ID: {item.spent_id}, Name: {item.spent_general_name}, Value: {item.spent_value}")

if __name__ == "__main__":
    asyncio.run(test_agencia_endpoint())
