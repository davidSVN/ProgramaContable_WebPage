import asyncio
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.database import AsyncSessionLocal
from app.models import AppUser, EmployeeJoinRequest, Tenant

async def simulate_setup_status():
    async with AsyncSessionLocal() as db:
        # Get a pending user (if any)
        res = await db.execute(select(AppUser).where(AppUser.role == "pending"))
        user = res.scalars().first()
        if not user:
            print("No pending user found to test.")
            return

        print(f"Testing setup_status for user: {user.email}")
        try:
            result = await db.execute(
                select(EmployeeJoinRequest)
                .where(EmployeeJoinRequest.user_id == user.id)
                .options(selectinload(EmployeeJoinRequest.tenant))
            )
            req = result.scalars().first()
            print(f"Query successful. Request: {req}")
            if req:
                print(f"Tenant: {req.tenant.nombre if req.tenant else 'None'}")
                print(f"Created at: {req.created_at.isoformat()}")
        except Exception as e:
            print(f"FAILED: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(simulate_setup_status())
