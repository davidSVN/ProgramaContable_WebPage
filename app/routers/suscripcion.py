from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models import AppUser, Tenant
from app.schemas import PlanUpdateRequest, PlanResponse, SuscripcionInfo

router = APIRouter(prefix="/suscripcion", tags=["Suscripción"])

VALID_PLANS = {"none", "basic", "premium"}


@router.get("/info", response_model=SuscripcionInfo)
async def get_suscripcion_info(
    current_user: AppUser = Depends(get_current_user),
):
    """Retorna la información de suscripción del tenant actual."""
    if current_user.role == "superadmin":
        plan = "superadmin"
        features = {
            "puede_crear_ordenes":       True,
            "puede_ver_historial":       True,
            "puede_gestionar_usuarios":  True,
            "puede_ver_reportes_basicos": True,
            "puede_ver_ml":              True,
            "puede_ver_rfm":             True,
            "puede_ver_forecast":        True,
        }
    else:
        plan = current_user.tenant.plan if current_user.tenant else "none"
        features = {
            "puede_crear_ordenes":       plan != "none",
            "puede_ver_historial":       plan != "none",
            "puede_gestionar_usuarios":  plan != "none",
            "puede_ver_reportes_basicos": plan != "none",
            "puede_ver_ml":              plan == "premium",
            "puede_ver_rfm":             plan == "premium",
            "puede_ver_forecast":        plan == "premium",
        }
        
    return SuscripcionInfo(
        plan_actual=plan,
        puede_usar_app=True if current_user.role == "superadmin" else (plan != "none"),
        es_premium=True if current_user.role == "superadmin" else (plan == "premium"),
        features=features,
    )


@router.patch("/plan", response_model=PlanResponse)
async def actualizar_plan(
    datos: PlanUpdateRequest,
    current_user: AppUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin actualiza el plan de su propio tenant. Superadmin puede usar query param tenant_id."""
    if datos.plan not in VALID_PLANS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Plan inválido. Valores permitidos: {', '.join(VALID_PLANS)}",
        )

    if current_user.role == "empleado":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acceso denegado: se requiere rol admin o superior",
        )

    # SEGURIDAD: Solo superadmin puede activar planes pagados directamente.
    # Los admins normales solo pueden usar este endpoint para "CANCELAR" (plan = 'none').
    if current_user.role != "superadmin" and datos.plan != "none":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para activar planes pagados directamente. Por favor usa la pasarela de pagos.",
        )

    tenant = current_user.tenant
    if tenant is None:
        if current_user.role == "superadmin":
            # Si es superadmin y no tiene tenant, permitimos el "éxito" falso para el frontend
            return PlanResponse(
                tenant_id=0,
                plan=datos.plan,
                updated_at=datetime.utcnow(),
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Superadmin no tiene tenant. Usa /superadmin/tenants/{tenant_id}/plan",
        )

    tenant.plan = datos.plan
    await db.commit()
    await db.refresh(tenant)

    return PlanResponse(
        tenant_id=tenant.id,
        plan=tenant.plan,
        updated_at=datetime.utcnow(),
    )
