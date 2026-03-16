from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_admin_or_above
from app.models import AppUser, Tenant
from app.schemas import (
    AppUserCreate,
    AppUserUpdate,
    AppUserResponse,
    AppUsersStatsResponse,
)
from app.services import auth_service

router = APIRouter(prefix="/app-users", tags=["App Users"])


@router.get("", response_model=List[AppUserResponse])
async def list_app_users(
    role: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_admin_or_above),
):
    """Lista usuarios del tenant actual, excluyendo superadmins."""
    stmt = select(AppUser).where(AppUser.role != "superadmin")
    
    if current_user.role != "superadmin":
        stmt = stmt.where(AppUser.tenant_id == current_user.tenant_id)

    if role:
        stmt = stmt.where(AppUser.role == role)
    if is_active is not None:
        stmt = stmt.where(AppUser.is_active == is_active)
    if search:
        stmt = stmt.where(
            or_(
                AppUser.username.ilike(f"%{search}%"),
                AppUser.email.ilike(f"%{search}%"),
            )
        )

    stmt = stmt.order_by(AppUser.created_at.desc())
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/stats", response_model=AppUsersStatsResponse)
async def get_app_users_stats(
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_admin_or_above),
):
    """Retorna estadísticas de usuarios para el tenant actual."""
    tenant_id = current_user.tenant_id

    # Conteos básicos
    stmt = select(
        func.count(AppUser.id).label("total"),
        func.count(AppUser.id).filter(AppUser.role == "admin").label("admins"),
        func.count(AppUser.id).filter(AppUser.role == "empleado").label("empleados"),
        func.count(AppUser.id).filter(AppUser.is_active == True).label("activos"),
        func.count(AppUser.id).filter(AppUser.is_active == False).label("inactivos"),
    ).where(AppUser.role != "superadmin")

    if tenant_id is not None:
        stmt = stmt.where(AppUser.tenant_id == tenant_id)

    result = await db.execute(stmt)
    stats = result.first()

    total_usuarios = stats.total
    
    if tenant_id is not None:
        tenant = await db.get(Tenant, tenant_id)
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant no encontrado")
        max_usuarios = tenant.max_usuarios
    else:
        # Para superadmin global, no hay un límite único, o podríamos sumar todos
        stmt_max = select(func.sum(Tenant.max_usuarios))
        res_max = await db.execute(stmt_max)
        max_usuarios = res_max.scalar() or 999  # Fallback

    slots_disponibles = max(0, max_usuarios - total_usuarios)

    return AppUsersStatsResponse(
        total_usuarios=total_usuarios,
        total_admins=stats.admins,
        total_empleados=stats.empleados,
        activos=stats.activos,
        inactivos=stats.inactivos,
        max_usuarios=max_usuarios,
        slots_disponibles=slots_disponibles,
    )


@router.post("", response_model=AppUserResponse, status_code=status.HTTP_201_CREATED)
async def create_app_user(
    datos: AppUserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_admin_or_above),
):
    """Crea un nuevo usuario de aplicación (staff)."""
    tenant_id = datos.tenant_id if current_user.role == "superadmin" and datos.tenant_id is not None else current_user.tenant_id
    
    if tenant_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Se requiere un tenant_id para crear un usuario"
        )

    # 1. Validar límite de usuarios
    tenant = await db.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant no encontrado")

    stmt_count = select(func.count(AppUser.id)).where(AppUser.tenant_id == tenant_id)
    count_res = await db.execute(stmt_count)
    current_count = count_res.scalar()

    if current_count >= tenant.max_usuarios:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Límite de usuarios alcanzado para tu plan actual",
        )

    # 2. Validar rol
    if datos.role not in ["admin", "empleado"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El rol debe ser 'admin' o 'empleado'",
        )

    # 3. Validar email único globalmente
    stmt_email = select(AppUser).where(AppUser.email == datos.email)
    email_res = await db.execute(stmt_email)
    if email_res.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El email ya está registrado",
        )

    # Crear usuario
    new_user = AppUser(
        username=datos.username,
        email=datos.email,
        password_hash=auth_service.hash_password(datos.password),
        role=datos.role,
        cedula=datos.cedula,
        tenant_id=tenant_id,
        is_active=True,
    )

    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return new_user


@router.put("/{user_id}", response_model=AppUserResponse)
async def update_app_user(
    user_id: int,
    datos: AppUserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_admin_or_above),
):
    """Actualiza un usuario de aplicación."""
    user = await db.get(AppUser, user_id)

    if current_user.role != "superadmin" and (not user or user.tenant_id != current_user.tenant_id):
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    # Validaciones de seguridad
    if user.id == current_user.id:
        if datos.role and datos.role != user.role:
            raise HTTPException(
                status_code=400, detail="No puedes cambiar tu propio rol"
            )
        if datos.is_active is False:
            raise HTTPException(status_code=400, detail="No puedes desactivarte a ti mismo")

    # Actualizar campos
    update_data = datos.model_dump(exclude_unset=True)
    
    if "password" in update_data:
        user.password_hash = auth_service.hash_password(update_data.pop("password"))
    
    for key, value in update_data.items():
        setattr(user, key, value)

    await db.commit()
    await db.refresh(user)
    return user


@router.patch("/{user_id}/toggle-activo")
async def toggle_user_active(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_admin_or_above),
):
    """Activa o desactiva un usuario."""
    user = await db.get(AppUser, user_id)

    if current_user.role != "superadmin" and (not user or user.tenant_id != current_user.tenant_id):
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="No puedes desactivarte a ti mismo")

    user.is_active = not user.is_active
    await db.commit()
    return {"id": user_id, "is_active": user.is_active}


@router.delete("/{user_id}")
async def delete_app_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_admin_or_above),
):
    """Elimina un usuario de aplicación."""
    user = await db.get(AppUser, user_id)

    if current_user.role != "superadmin" and (not user or user.tenant_id != current_user.tenant_id):
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="No puedes eliminarte a ti mismo")

    # Verificar si es el último admin
    if user.role == "admin":
        stmt_admins = select(func.count(AppUser.id)).where(
            AppUser.tenant_id == user.tenant_id, 
            AppUser.role == "admin",
            AppUser.is_active == True
        )
        admins_res = await db.execute(stmt_admins)
        admins_count = admins_res.scalar()
        if admins_count <= 1:
            raise HTTPException(
                status_code=400, detail="No se puede eliminar al último administrador activo"
            )

    await db.delete(user)
    await db.commit()
    return {"deleted": True}
