from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.database import get_db
from app.dependencies import require_superadmin
from app.models import AppUser
from app.schemas import (
    TenantCreate,
    TenantResponse,
    TenantListItem,
    DashboardStats,
)
from app.services import tenant_service

router = APIRouter(prefix="/superadmin", tags=["SuperAdmin"])


@router.get("/dashboard", response_model=DashboardStats)
async def dashboard(
    current_user: AppUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    """Retorna las estadísticas generales del dashboard."""
    return tenant_service.stats_dashboard(db)


@router.get("/tenants", response_model=list[TenantListItem])
async def listar_tenants(
    current_user: AppUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    """Lista todos los tenants con su cantidad de usuarios."""
    return tenant_service.listar_tenants(db)


@router.post("/tenants", response_model=TenantResponse, status_code=status.HTTP_201_CREATED)
async def crear_tenant(
    datos: TenantCreate,
    current_user: AppUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    """Crea un nuevo tenant con su usuario admin."""
    try:
        tenant = tenant_service.crear_tenant(db, datos)
        return TenantResponse.model_validate(tenant)
    except IntegrityError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"El email '{datos.email_admin}' ya está registrado",
        )


@router.get("/tenants/{tenant_id}", response_model=TenantResponse)
async def obtener_tenant(
    tenant_id: int,
    current_user: AppUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    """Obtiene los detalles de un tenant específico."""
    tenant = tenant_service.obtener_tenant(db, tenant_id)
    if tenant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tenant con id {tenant_id} no encontrado",
        )
    return TenantResponse.model_validate(tenant)


@router.patch("/tenants/{tenant_id}/toggle-activo", response_model=TenantResponse)
async def toggle_activo(
    tenant_id: int,
    current_user: AppUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    """Activa o desactiva un tenant y sus usuarios asociados."""
    tenant = tenant_service.toggle_tenant_activo(db, tenant_id)
    if tenant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tenant con id {tenant_id} no encontrado",
        )
    return TenantResponse.model_validate(tenant)
