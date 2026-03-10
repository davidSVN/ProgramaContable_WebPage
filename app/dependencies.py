from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AppUser
from app.services.auth_service import decode_token_jwt

# Esquema de seguridad Bearer
security = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
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

    user = db.query(AppUser).filter(AppUser.id == user_id).first()
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario no encontrado o inactivo",
        )

    return user


def require_superadmin(
    current_user: AppUser = Depends(get_current_user),
) -> AppUser:
    """Lanza HTTPException 403 si el usuario no es superadmin."""
    if current_user.role != "superadmin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acceso denegado: se requiere rol superadmin",
        )
    return current_user


def require_admin_or_above(
    current_user: AppUser = Depends(get_current_user),
) -> AppUser:
    """Lanza HTTPException 403 si el usuario es empleado."""
    if current_user.role == "empleado":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acceso denegado: se requiere rol admin o superior",
        )
    return current_user
