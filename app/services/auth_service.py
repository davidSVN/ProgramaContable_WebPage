import os
from datetime import datetime, timedelta
from typing import Optional

import bcrypt
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from dotenv import load_dotenv

from app.models import AppUser

load_dotenv()

JWT_SECRET = os.getenv("JWT_SECRET", "cambia_esto_por_un_secreto_seguro_de_32_caracteres")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_EXPIRATION_HOURS = 24


def hash_password(password: str) -> str:
    """Genera el hash de una contraseña usando bcrypt."""
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def verificar_password(password: str, hashed: str) -> bool:
    """Verifica una contraseña contra su hash bcrypt."""
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))


def crear_token_jwt(data: dict) -> str:
    """Crea un token JWT con expiración de 24 horas."""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(hours=JWT_EXPIRATION_HOURS)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token_jwt(token: str) -> Optional[dict]:
    """Decodifica un token JWT. Retorna None si es inválido o expirado."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except JWTError:
        return None


async def login(db: AsyncSession, email: str, password: str) -> Optional[AppUser]:
    """
    Autentica un usuario por email y contraseña.
    Verifica que el usuario exista, esté activo y que su tenant esté activo.
    Retorna None si cualquier validación falla.
    """
    result = await db.execute(select(AppUser).where(AppUser.email == email))
    user = result.scalars().first()
    if not user:
        return None

    if not user.is_active:
        return None

    if not verificar_password(password, user.password_hash):
        return None

    # Si el usuario pertenece a un tenant, verificar que el tenant esté activo
    if user.tenant_id is not None:
        # Acceder a la relación cargada (eager) o cargar explícitamente
        await db.refresh(user, ["tenant"])
        if user.tenant is None or not user.tenant.is_active:
            return None

    return user
