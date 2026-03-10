from typing import List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Tenant, AppUser
from app.schemas import TenantCreate, TenantListItem, DashboardStats
from app.services.auth_service import hash_password


def crear_tenant(db: Session, datos: TenantCreate) -> Tenant:
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
        db.flush()  # Obtener el ID sin hacer commit

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
        db.commit()
        db.refresh(nuevo_tenant)
        return nuevo_tenant

    except Exception:
        db.rollback()
        raise


def listar_tenants(db: Session) -> List[TenantListItem]:
    """Lista todos los tenants con el total de usuarios por cada uno."""
    # Subconsulta para contar usuarios por tenant
    subquery = (
        db.query(
            AppUser.tenant_id,
            func.count(AppUser.id).label("total_usuarios"),
        )
        .group_by(AppUser.tenant_id)
        .subquery()
    )

    results = (
        db.query(Tenant, func.coalesce(subquery.c.total_usuarios, 0).label("total_usuarios"))
        .outerjoin(subquery, Tenant.id == subquery.c.tenant_id)
        .all()
    )

    items = []
    for tenant, total_usuarios in results:
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


def obtener_tenant(db: Session, tenant_id: int) -> Optional[Tenant]:
    """Obtiene un tenant por su ID."""
    return db.query(Tenant).filter(Tenant.id == tenant_id).first()


def toggle_tenant_activo(db: Session, tenant_id: int) -> Tenant:
    """
    Alterna el estado activo/inactivo de un tenant.
    - Si se desactiva: desactiva también todos sus usuarios.
    - Si se activa: reactiva solo el usuario admin (no empleados).
    """
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        return None

    nuevo_estado = not tenant.is_active
    tenant.is_active = nuevo_estado

    if not nuevo_estado:
        # Desactivar tenant → desactivar TODOS sus usuarios
        db.query(AppUser).filter(AppUser.tenant_id == tenant_id).update(
            {"is_active": False}
        )
    else:
        # Activar tenant → reactivar SOLO el admin
        db.query(AppUser).filter(
            AppUser.tenant_id == tenant_id,
            AppUser.role == "admin",
        ).update({"is_active": True})

    db.commit()
    db.refresh(tenant)
    return tenant


def stats_dashboard(db: Session) -> DashboardStats:
    """Genera las estadísticas del dashboard del superadmin."""
    total_tenants = db.query(func.count(Tenant.id)).scalar()
    tenants_activos = db.query(func.count(Tenant.id)).filter(Tenant.is_active == True).scalar()
    tenants_inactivos = total_tenants - tenants_activos

    # Total de usuarios (excluyendo superadmin — no tiene tenant)
    total_usuarios = (
        db.query(func.count(AppUser.id))
        .filter(AppUser.tenant_id.isnot(None))
        .scalar()
    )

    # Tenants agrupados por plan
    plan_counts = (
        db.query(Tenant.plan, func.count(Tenant.id))
        .group_by(Tenant.plan)
        .all()
    )
    tenants_por_plan = {plan: count for plan, count in plan_counts}

    return DashboardStats(
        total_tenants=total_tenants,
        tenants_activos=tenants_activos,
        tenants_inactivos=tenants_inactivos,
        total_usuarios=total_usuarios,
        tenants_por_plan=tenants_por_plan,
    )
