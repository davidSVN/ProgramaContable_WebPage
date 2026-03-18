
import asyncio
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models import Service

async def check_services():
    async with AsyncSessionLocal() as db:
        stmt = select(Service).where(Service.tenant_id == 5)
        result = await db.execute(stmt)
        services = result.scalars().all()
        print(f"Found {len(services)} services for tenant 5:")
        for s in services:
            print(f"- ID: {s.service_id}, Name: {s.service_name}, UserInstitute: '{s.user_institute}'")

if __name__ == "__main__":
    asyncio.run(check_services())
