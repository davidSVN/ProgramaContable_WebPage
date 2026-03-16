import asyncio
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models import OrderDetail, OrderHeader

async def check_order_details():
    async with AsyncSessionLocal() as db:
        # Join OrderDetail with OrderHeader to get the date and customer name
        stmt = (
            select(
                OrderDetail.id,
                OrderDetail.order_id,
                OrderDetail.service_name,
                OrderDetail.quantity,
                OrderDetail.unit_price,
                OrderDetail.total_item_price,
                OrderDetail.spent_per_order,
                OrderHeader.date,
                OrderHeader.user_name
            )
            .join(OrderHeader, OrderDetail.order_id == OrderHeader.id)
            .where(OrderDetail.is_agency == True)
        )
        res = await db.execute(stmt)
        rows = res.all()
        print(f"Found {len(rows)} agency service details:")
        for r in rows:
            print(f"Order #{r.order_id} | {r.user_name} | {r.service_name} | Qty: {r.quantity} | Total: {r.total_item_price} | Agency Cost: {r.spent_per_order}")

if __name__ == "__main__":
    asyncio.run(check_order_details())
