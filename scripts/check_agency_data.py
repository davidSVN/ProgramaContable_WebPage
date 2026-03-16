import asyncio
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models import SpentBusiness, OrderHeader, OrderDetail, Service

async def check_agency_data():
    async with AsyncSessionLocal() as db:
        # Check if there are any SpentBusiness with category 'Agencia'
        res_spent = await db.execute(select(SpentBusiness).where(SpentBusiness.spent_category == "Agencia"))
        spents = res_spent.scalars().all()
        print(f"Total SpentBusiness (Agencia): {len(spents)}")
        for s in spents:
            print(f"  ID: {s.spent_id}, Date: {s.spent_date}, Name: {s.spent_general_name}, Value: {s.spent_value}")

        # Check for orders that have agency_cost > 0
        res_orders = await db.execute(select(OrderHeader).where(OrderHeader.agency_cost > 0))
        orders = res_orders.scalars().all()
        print(f"\nOrders with agency_cost > 0: {len(orders)}")
        for o in orders:
            print(f"  Order ID: {o.id}, User: {o.user_name}, Agency Cost: {o.agency_cost}")

        # Check for services that have spent_per_service > 0
        res_svc = await db.execute(select(Service).where(Service.spent_per_service > 0))
        services = res_svc.scalars().all()
        print(f"\nServices with spent_per_service > 0: {len(services)}")
        for s in services:
            print(f"  Service: {s.service_name}, Cost: {s.spent_per_service}")

if __name__ == "__main__":
    asyncio.run(check_agency_data())
