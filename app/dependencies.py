from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import AppUser
from app.services.auth_service import decode_token_jwt

# Esquema de seguridad Bearer
security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> AppUser:
    """
    Extrae el token del header Authorization: Bearer ...,
    decodifica el JWT y busca el usuario en la BD.
    Lanza HTTPException 401 si algo falla.
    """
    token = credentials.credentials
    payload = decode_token_jwt(token)

    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado",
        )

    user_id = payload.get("user_id")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido: user_id no encontrado",
        )

    result = await db.execute(
        select(AppUser)
        .where(AppUser.id == user_id)
        .options(selectinload(AppUser.tenant))
    )
    user = result.scalars().first()
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario no encontrado o inactivo",
        )

    return user


async def require_superadmin(
    current_user: AppUser = Depends(get_current_user),
) -> AppUser:
    """Lanza HTTPException 403 si el usuario no es superadmin."""
    if current_user.role != "superadmin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acceso denegado: se requiere rol superadmin",
        )
    return current_user


async def require_admin_or_above(
    current_user: AppUser = Depends(get_current_user),
) -> AppUser:
    """Lanza HTTPException 403 si el usuario es empleado o pending."""
    if current_user.role in ("empleado", "pending"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acceso denegado: se requiere rol admin o superior",
        )
    return current_user


async def require_suscripcion_activa(
    current_user: AppUser = Depends(get_current_user),
) -> AppUser:
    """Raises 402/403 if tenant has no active subscription. Superadmin bypasses."""
    if current_user.role == "superadmin":
        return current_user

    if current_user.role == "pending":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "SETUP_REQUIRED",
                "message": "Debes completar la configuración de tu cuenta.",
            },
        )
    
    if current_user.tenant_id is None:
        return current_user  # fallback cases
        
    if not current_user.tenant or current_user.tenant.plan == "none":
        raise HTTPException(
            status_code=402,
            detail={
                "code": "SUBSCRIPTION_REQUIRED",
                "message": "Tu lavandería no tiene una suscripción activa.",
                "plan_actual": "none",
            },
        )
    return current_user


async def require_pending(
    current_user: AppUser = Depends(get_current_user),
) -> AppUser:
    """Lanza HTTPException 400 si el usuario ya completó el setup."""
    if current_user.role != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El setup ya fue completado",
        )
    return current_user


async def require_premium(
    current_user: AppUser = Depends(get_current_user),
) -> AppUser:
    """Raises 403 if tenant plan is not premium. SuperAdmin bypasses this."""
    if current_user.role == "superadmin":
        return current_user

    if not current_user.tenant or current_user.tenant.plan != "premium":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Funcionalidad exclusiva del plan Premium",
        )
    return current_user
