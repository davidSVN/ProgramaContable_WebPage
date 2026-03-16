import asyncio
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models import SpentBusiness, Service, LaundryUser, OrderHeader
from app.services import facturacion_b2c_service

async def verify_multi_agency_gastos():
    async with AsyncSessionLocal() as db:
        tenant_id = 1
        
        # 1. Find or create a user
        res_user = await db.execute(select(LaundryUser).where(LaundryUser.tenant_id == tenant_id).limit(1))
        user = res_user.scalars().first()
        if not user:
            print("No user found for testing")
            return

        # 2. Find two agency services
        res_svc = await db.execute(select(Service).where(Service.tenant_id == tenant_id, Service.spent_per_service > 0).limit(2))
        services = res_svc.scalars().all()
        if len(services) < 2:
            print(f"Need 2 agency services for test, found {len(services)}")
            return

        servicios_data = [
            {"id": services[0].service_id, "name": services[0].service_name, "qty": 1, "value": 50000},
            {"id": services[1].service_id, "name": services[1].service_name, "qty": 2, "value": 30000}
        ]

        print(f"Creating order for user {user.user_name} with 2 agency services...")
        
        # 3. Create order
        result = await facturacion_b2c_service.crear_orden(
            db,
            tenant_id=tenant_id,
            user_id=user.user_id,
            servicios_data=servicios_data,
            items_description="Test multi agency gastos",
            state_payment="Pendiente",
            pagos=[],
            discount_value=0,
            state_state="Recibida"
        )
        
        if isinstance(result, str):
            print(f"Error creating order: {result}")
            return
            
        order_id = result.order_id
        print(f"Order created with ID: {order_id}")

        # 4. Verify SpentBusiness entries
        res_spent = await db.execute(select(SpentBusiness).where(SpentBusiness.spent_general_name.like(f"Orden #{order_id} - % (Agencia)%")))
        spents = res_spent.scalars().all()
        
        print(f"Found {len(spents)} SpentBusiness entries for this order.")
        for s in spents:
            print(f"  ID: {s.spent_id} | Name: {s.spent_general_name} | Value: {s.spent_value}")

        if len(spents) == 2:
            print("SUCCESS: 2 individual agency gastos created.")
        else:
            print(f"FAILURE: Expected 2 agency gastos, but found {len(spents)}.")

if __name__ == "__main__":
    asyncio.run(verify_multi_agency_gastos())
