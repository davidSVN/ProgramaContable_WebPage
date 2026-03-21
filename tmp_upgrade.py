
import asyncio
from app.database import AsyncSessionLocal
from app.models import Tenant
async def upgrade():
    async with AsyncSessionLocal() as db:
        tenant = await db.get(Tenant, 16)
        tenant.plan = 'basic'
        await db.commit()
asyncio.run(upgrade())
