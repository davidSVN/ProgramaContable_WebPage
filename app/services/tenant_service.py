from typing import List, Optional

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Tenant, AppUser
from app.schemas import TenantCreate, TenantListItem, DashboardStats
from app.services.auth_service import hash_password


async def crear_tenant(db: AsyncSession, datos: TenantCreate) -> Tenant:
    """
    Crea un tenant y su usuario admin en una transacción atómica.
    Si algo falla, hace rollback de todo.
    """
    try:
        # 1. Crear el tenant
        nuevo_tenant = Tenant(
            nombre=datos.nombre,
            ciudad=datos.ciudad,
            plan=datos.plan,
        )
        db.add(nuevo_tenant)
        await db.flush()  # Obtener el ID sin hacer commit

        # 2. Crear el usuario admin del tenant
        admin_user = AppUser(
            tenant_id=nuevo_tenant.id,
            email=datos.email_admin,
            username=datos.username_admin,
            password_hash=hash_password(datos.password_admin),
            role="admin",
        )
        db.add(admin_user)

        # 3. Commit atómico
        await db.commit()
        await db.refresh(nuevo_tenant)
        return nuevo_tenant

    except Exception:
        await db.rollback()
        raise


async def listar_tenants(db: AsyncSession) -> List[TenantListItem]:
    """Lista todos los tenants con el total de usuarios por cada uno."""
    # Subconsulta para contar usuarios por tenant
    subquery = (
        select(
            AppUser.tenant_id,
            func.count(AppUser.id).label("total_usuarios"),
        )
        .group_by(AppUser.tenant_id)
        .subquery()
    )

    stmt = (
        select(Tenant, func.coalesce(subquery.c.total_usuarios, 0).label("total_usuarios"))
        .outerjoin(subquery, Tenant.id == subquery.c.tenant_id)
    )

    result = await db.execute(stmt)
    rows = result.all()

    items = []
    for tenant, total_usuarios in rows:
        items.append(
            TenantListItem(
                id=tenant.id,
                nombre=tenant.nombre,
                ciudad=tenant.ciudad,
                plan=tenant.plan,
                is_active=tenant.is_active,
                created_at=tenant.created_at,
                total_usuarios=total_usuarios,
            )
        )
    return items


async def obtener_tenant(db: AsyncSession, tenant_id: int) -> Optional[Tenant]:
    """Obtiene un tenant por su ID."""
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    return result.scalars().first()


async def toggle_tenant_activo(db: AsyncSession, tenant_id: int) -> Tenant:
    """
    Alterna el estado activo/inactivo de un tenant.
    - Si se desactiva: desactiva también todos sus usuarios.
    - Si se activa: reactiva solo el usuario admin (no empleados).
    """
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalars().first()
    if not tenant:
        return None

    nuevo_estado = not tenant.is_active
    tenant.is_active = nuevo_estado

    if not nuevo_estado:
        # Desactivar tenant → desactivar TODOS sus usuarios
        await db.execute(
            update(AppUser)
            .where(AppUser.tenant_id == tenant_id)
            .values(is_active=False)
        )
    else:
        # Activar tenant → reactivar SOLO el admin
        await db.execute(
            update(AppUser)
            .where(AppUser.tenant_id == tenant_id, AppUser.role == "admin")
            .values(is_active=True)
        )

    await db.commit()
    await db.refresh(tenant)
    return tenant


async def stats_dashboard(db: AsyncSession) -> DashboardStats:
    """Genera las estadísticas del dashboard del superadmin."""
    total_tenants = (await db.execute(select(func.count(Tenant.id)))).scalar()
    tenants_activos = (
        await db.execute(select(func.count(Tenant.id)).where(Tenant.is_active == True))
    ).scalar()
    tenants_inactivos = total_tenants - tenants_activos

    # Total de usuarios (excluyendo superadmin — no tiene tenant)
    total_usuarios = (
        await db.execute(
            select(func.count(AppUser.id)).where(AppUser.tenant_id.isnot(None))
        )
    ).scalar()

    # Tenants agrupados por plan
    plan_result = await db.execute(
        select(Tenant.plan, func.count(Tenant.id)).group_by(Tenant.plan)
    )
    tenants_por_plan = {plan: count for plan, count in plan_result.all()}

    return DashboardStats(
        total_tenants=total_tenants,
        tenants_activos=tenants_activos,
        tenants_inactivos=tenants_inactivos,
        total_usuarios=total_usuarios,
        tenants_por_plan=tenants_por_plan,
    )
