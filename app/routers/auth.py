from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user, require_pending
from app.models import AppUser, Tenant, EmployeeJoinRequest, AppSettings
from app.schemas import (
    LoginRequest, RegisterRequest, TokenResponse, UserMe,
    SetupBusinessRequest, SetupJoinRequest, SetupStatusResponse,
)
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/register", response_model=TokenResponse)
async def register(datos: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Crea una cuenta sin tenant. El usuario debe completar el setup eligiendo su rol."""
    result = await db.execute(select(AppUser).where(AppUser.email == datos.email))
    if result.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Este email ya está registrado",
        )

    user = AppUser(
        email=datos.email,
        username=datos.name,
        password_hash=auth_service.hash_password(datos.password),
        role="pending",
        tenant_id=None,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = auth_service.crear_token_jwt({
        "user_id": user.id,
        "email": user.email,
        "role": user.role,
        "tenant_id": None,
        "plan": "none",
    })

    return TokenResponse(
        access_token=token,
        user_id=user.id,
        role=user.role,
        tenant_id=None,
        username=user.username,
        plan="none",
    )


@router.post("/setup/business", response_model=TokenResponse)
async def setup_business(
    datos: SetupBusinessRequest,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_pending),
):
    """Completa el setup creando un nuevo negocio y asignando al usuario como admin."""
    nombre = datos.nombre_negocio.strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="El nombre del negocio es requerido")

    existing = await db.execute(
        select(Tenant).where(func.lower(Tenant.nombre) == nombre.lower())
    )
    if existing.scalars().first():
        raise HTTPException(
            status_code=400,
            detail="Ya existe un negocio registrado con ese nombre. Elige otro.",
        )

    tenant = Tenant(nombre=nombre, plan="none")
    db.add(tenant)
    await db.flush()

    current_user.role = "admin"
    current_user.tenant_id = tenant.id

    # Inicializar configuración del negocio
    biz_setting = AppSettings(
        tenant_id=tenant.id,
        key="business_name",
        value=nombre
    )
    db.add(biz_setting)

    await db.commit()
    await db.refresh(current_user)
    await db.refresh(tenant)

    token = auth_service.crear_token_jwt({
        "user_id": current_user.id,
        "email": current_user.email,
        "role": current_user.role,
        "tenant_id": current_user.tenant_id,
        "plan": tenant.plan,
    })

    return TokenResponse(
        access_token=token,
        user_id=current_user.id,
        role=current_user.role,
        tenant_id=current_user.tenant_id,
        username=current_user.username,
        plan=tenant.plan,
    )


@router.post("/setup/join-request")
async def setup_join_request(
    datos: SetupJoinRequest,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_pending),
):
    """Envía solicitud para unirse a un negocio como empleado."""
    nombre = datos.nombre_negocio.strip()

    # Buscar por Tenant.nombre OR por AppSettings.business_name
    stmt = (
        select(Tenant)
        .outerjoin(AppSettings, Tenant.id == AppSettings.tenant_id)
        .where(
            Tenant.is_active == True,
            (
                (func.lower(Tenant.nombre) == nombre.lower()) |
                ((AppSettings.key == "business_name") & (func.lower(AppSettings.value) == nombre.lower()))
            )
        )
    )
    result = await db.execute(stmt)
    tenant = result.scalars().first()

    if not tenant:
        raise HTTPException(
            status_code=404,
            detail="No se encontró un negocio con ese nombre exacto. Verifica con tu administrador.",
        )

    # Verificar si ya hay una solicitud pendiente
    result = await db.execute(
        select(EmployeeJoinRequest).where(
            EmployeeJoinRequest.user_id == current_user.id,
            EmployeeJoinRequest.status == "pending",
        )
    )
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="Ya tienes una solicitud pendiente")

    join_request = EmployeeJoinRequest(
        user_id=current_user.id,
        tenant_id=tenant.id,
        status="pending",
    )
    db.add(join_request)
    await db.commit()

    return {"message": "Solicitud enviada. El administrador del negocio debe aprobarla."}


@router.get("/setup/status", response_model=SetupStatusResponse)
async def setup_status(
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Retorna el rol actual del usuario y si tiene solicitud pendiente."""
    if current_user.role != "pending":
        return SetupStatusResponse(role=current_user.role, join_request=None)

    result = await db.execute(
        select(EmployeeJoinRequest)
        .where(EmployeeJoinRequest.user_id == current_user.id)
        .options(selectinload(EmployeeJoinRequest.tenant))
        .order_by(EmployeeJoinRequest.created_at.desc())
    )
    req = result.scalars().first()

    join_request_data = None
    if req:
        join_request_data = {
            "id": req.id,
            "status": req.status,
            "tenant_nombre": req.tenant.nombre if req.tenant else None,
            "created_at": req.created_at.isoformat(),
        }

    return SetupStatusResponse(role=current_user.role, join_request=join_request_data)


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

    plan = user.tenant.plan if user.tenant else "none"
    if user.role == "superadmin":
        plan = "superadmin"

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
        plan="superadmin" if current_user.role == "superadmin" else (current_user.tenant.plan if current_user.tenant else "none"),
    )
