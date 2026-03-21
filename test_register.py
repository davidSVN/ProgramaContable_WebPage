import asyncio
from app.database import AsyncSessionLocal
from app.models import AppUser
from app.services import auth_service
from sqlalchemy import select

async def simulate_register():
    email = "test_register@example.com"
    name = "Test User"
    password = "password123"
    
    async with AsyncSessionLocal() as db:
        # Check if user already exists
        res = await db.execute(select(AppUser).where(AppUser.email == email))
        if res.scalars().first():
            print(f"User {email} already exists. Cleaning up...")
            # We skip actual delete for safety, use unique email
            email = f"test_{int(asyncio.get_event_loop().time())}@example.com"

        print(f"Registering user: {email}")
        try:
            user = AppUser(
                email=email,
                username=name,
                password_hash=auth_service.hash_password(password),
                role="pending",
                tenant_id=None,
                is_active=True,
            )
            db.add(user)
            await db.commit()
            print(f"User added successfully: {user.id}")
        except Exception as e:
            print(f"FAILED: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(simulate_register())
