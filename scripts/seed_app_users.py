import asyncio
import os
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models import AppUser
from app.services import auth_service

users_to_seed = [
    {
        "username": "Carlos Méndez",
        "email": "carlos.admin@washflow.demo",
        "password": "Admin2025*",
        "role": "admin",
        "cedula": "1020304050",
        "is_active": True,
        "tenant_id": 1,
    },
    {
        "username": "Luisa Torres",
        "email": "luisa.empleada@washflow.demo",
        "password": "Emp2025*",
        "role": "empleado",
        "cedula": "1122334455",
        "is_active": True,
        "tenant_id": 1,
    },
    {
        "username": "Andrés Gómez",
        "email": "andres.empleado@washflow.demo",
        "password": "Emp2025*",
        "role": "empleado",
        "cedula": "9988776655",
        "is_active": True,
        "tenant_id": 1,
    },
    {
        "username": "María Admin",
        "email": "maria.admin2@washflow.demo",
        "password": "Admin2025*",
        "role": "admin",
        "cedula": "3344556677",
        "is_active": True,
        "tenant_id": 1,
    },
    {
        "username": "Pedro Inactivo",
        "email": "pedro.inactivo@washflow.demo",
        "password": "Emp2025*",
        "role": "empleado",
        "cedula": "5566778899",
        "is_active": False,
        "tenant_id": 1,
    },
]

async def seed_users():
    print("Seeding app_users for tenant_id=1...")
    async with AsyncSessionLocal() as db:
        inserted_count = 0
        for user_data in users_to_seed:
            # Verificar si el email ya existe
            result = await db.execute(select(AppUser).where(AppUser.email == user_data["email"]))
            existing_user = result.scalars().first()
            
            if existing_user:
                print(f"Skipping {user_data['email']} (already exists)")
                continue

            # Crear nuevo usuario
            new_user = AppUser(
                username=user_data["username"],
                email=user_data["email"],
                password_hash=auth_service.hash_password(user_data["password"]),
                role=user_data["role"],
                cedula=user_data["cedula"],
                is_active=user_data["is_active"],
                tenant_id=user_data["tenant_id"]
            )
            db.add(new_user)
            inserted_count += 1
        
        await db.commit()
        if inserted_count > 0:
            print(f"✅ {inserted_count} usuarios de app insertados en tenant_id=1")
        else:
            print("No new users were inserted.")

if __name__ == "__main__":
    asyncio.run(seed_users())
