import asyncio
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.database import AsyncSessionLocal
from app.models import AppUser, EmployeeJoinRequest

async def check_db_state():
    async with AsyncSessionLocal() as db:
        # Check pending users
        res = await db.execute(select(AppUser).where(AppUser.role == "pending"))
        pending_users = res.scalars().all()
        print(f"Pending users: {len(pending_users)}")
        for u in pending_users:
            print(f"- {u.email} (ID: {u.id})")
            # Check their join requests
            jr_res = await db.execute(select(EmployeeJoinRequest).where(EmployeeJoinRequest.user_id == u.id))
            jrs = jr_res.scalars().all()
            print(f"  Join requests: {len(jrs)}")
            for jr in jrs:
                print(f"    JR ID: {jr.id}, Status: {jr.status}")

if __name__ == "__main__":
    asyncio.run(check_db_state())
