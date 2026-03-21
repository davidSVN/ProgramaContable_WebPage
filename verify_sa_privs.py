
import asyncio
import httpx
from app.services.auth_service import crear_token_jwt
from app.database import AsyncSessionLocal
from app.models import AppUser
from sqlalchemy import select

async def verify_sa():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(AppUser).where(AppUser.id == 2))
        user = result.scalars().first()
        if not user:
            print("USER_NOT_FOUND")
            return
            
        token = crear_token_jwt({
            "user_id": user.id,
            "email": user.email,
            "role": user.role,
            "tenant_id": user.tenant_id,
            "plan": "superadmin"
        })
        
        headers = {"Authorization": f"Bearer {token}"}
        
        async with httpx.AsyncClient() as client:
            # 1. Check suscripcion info
            resp = await client.get("http://localhost:8000/api/suscripcion/info", headers=headers)
            print(f"Suscripcion Info Status: {resp.status_code}")
            print(f"Suscripcion Info Body: {resp.text}")
            
            # 2. Check a premium-only endpoint (e.g. some ML/Analytics if exists, or just verify logic)
            # Actually, let's try to access a setting or something that requires active subscription.
            resp = await client.get("http://localhost:8000/api/settings/business", headers=headers)
            print(f"Settings (Sub Required) Status: {resp.status_code}")

if __name__ == "__main__":
    asyncio.run(verify_sa())
