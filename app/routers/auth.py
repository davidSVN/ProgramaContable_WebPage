from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models import AppUser
from app.schemas import LoginRequest, TokenResponse, UserMe
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/login", response_model=TokenResponse)
async def login(datos: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Autentica un usuario y retorna un token JWT."""
    user = await auth_service.login(db, datos.email, datos.password)

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales inválidas o cuenta/tenant inactivo",
        )

    user.last_login = datetime.utcnow()
    await db.commit()

    token = auth_service.crear_token_jwt({
        "user_id": user.id,
        "email": user.email,
        "role": user.role,
        "tenant_id": user.tenant_id,
    })

    return TokenResponse(
        access_token=token,
        user_id=user.id,
        role=user.role,
        tenant_id=user.tenant_id,
        username=user.username,
    )


@router.get("/me", response_model=UserMe)
async def me(current_user: AppUser = Depends(get_current_user)):
    """Retorna la información del usuario autenticado."""
    return UserMe.model_validate(current_user)
