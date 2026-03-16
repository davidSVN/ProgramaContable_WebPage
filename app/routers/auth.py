from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models import AppUser
from app.schemas import LoginRequest, RegisterRequest, TokenResponse, UserMe, TenantCreate
from app.services import auth_service, tenant_service

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/register", response_model=TokenResponse)
async def register(datos: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Registra un nuevo negocio (tenant) y su administrador."""
    # Mapear RegisterRequest a TenantCreate
    tenant_data = TenantCreate(
        nombre=datos.name,
        email_admin=datos.email,
        username_admin=datos.name,
        password_admin=datos.password,
        plan="none"
    )
    
    try:
        tenant = await tenant_service.crear_tenant(db, tenant_data)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error al registrar: {str(e)}"
        )

    # Buscar al usuario admin recién creado para generar el token
    from sqlalchemy import select
    stmt = select(AppUser).where(AppUser.tenant_id == tenant.id, AppUser.role == "admin")
    result = await db.execute(stmt)
    user = result.scalars().first()

    token = auth_service.crear_token_jwt({
        "user_id": user.id,
        "email": user.email,
        "role": user.role,
        "tenant_id": user.tenant_id,
        "plan": tenant.plan,
    })

    return TokenResponse(
        access_token=token,
        user_id=user.id,
        role=user.role,
        tenant_id=user.tenant_id,
        username=user.username,
        plan=tenant.plan,
    )


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

    plan = user.tenant.plan if user.tenant else "superadmin"
    token = auth_service.crear_token_jwt({
        "user_id": user.id,
        "email": user.email,
        "role": user.role,
        "tenant_id": user.tenant_id,
        "plan": plan,
    })

    return TokenResponse(
        access_token=token,
        user_id=user.id,
        role=user.role,
        tenant_id=user.tenant_id,
        username=user.username,
        plan=plan,
    )


@router.get("/me", response_model=UserMe)
async def me(current_user: AppUser = Depends(get_current_user)):
    """Retorna la información del usuario autenticado."""
    return UserMe(
        id=current_user.id,
        email=current_user.email,
        username=current_user.username,
        role=current_user.role,
        tenant_id=current_user.tenant_id,
        is_active=current_user.is_active,
        plan=current_user.tenant.plan if current_user.tenant else "superadmin",
    )
