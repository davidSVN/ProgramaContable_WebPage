import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.dependencies import get_current_user, require_admin_or_above
from app.models import AppUser, AppSettings
from app.schemas import NegocioConfig, NegocioConfigResponse

router = APIRouter()

_WA_KEY = "whatsapp_templates"


@router.get("/whatsapp-templates")
async def get_whatsapp_templates(
    current_user: AppUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AppSettings).where(
            AppSettings.tenant_id == current_user.tenant_id,
            AppSettings.key == _WA_KEY,
        )
    )
    setting = result.scalars().first()
    if not setting:
        return {"templates": {}}
    try:
        return {"templates": json.loads(setting.value)}
    except json.JSONDecodeError:
        return {"templates": {}}


@router.put("/whatsapp-templates")
async def save_whatsapp_templates(
    body: dict,
    current_user: AppUser = Depends(require_admin_or_above),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AppSettings).where(
            AppSettings.tenant_id == current_user.tenant_id,
            AppSettings.key == _WA_KEY,
        )
    )
    setting = result.scalars().first()
    value = json.dumps(body.get("templates", {}))
    if setting:
        setting.value = value
    else:
        db.add(AppSettings(
            tenant_id=current_user.tenant_id,
            key=_WA_KEY,
            value=value,
        ))
    await db.commit()
    return {"status": "ok"}

_KEY = "negocio_config"
_MAX_LOGO_BYTES = 512_000  # 500 KB


@router.get("/negocio", response_model=NegocioConfigResponse)
async def get_negocio_config(
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    stmt = select(AppSettings).where(
        AppSettings.tenant_id == current_user.tenant_id,
        AppSettings.key == _KEY,
    )
    result = await db.execute(stmt)
    setting = result.scalars().first()

    if not setting:
        return NegocioConfigResponse(tenant_id=current_user.tenant_id)

    try:
        data = json.loads(setting.value)
    except json.JSONDecodeError:
        data = {}

    return NegocioConfigResponse(tenant_id=current_user.tenant_id, **data)


@router.put("/negocio", response_model=NegocioConfigResponse)
async def update_negocio_config(
    body: NegocioConfig,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_admin_or_above),
):
    if body.logo_base64 is not None:
        if not body.logo_base64.startswith("data:image/"):
            raise HTTPException(status_code=400, detail="El logo debe ser una imagen válida en formato base64.")
        estimated_bytes = len(body.logo_base64) * 0.75
        if estimated_bytes > _MAX_LOGO_BYTES:
            raise HTTPException(status_code=400, detail="El logo no puede superar 500KB. Redúcelo antes de subir.")

    val_json = json.dumps(body.model_dump())

    stmt = select(AppSettings).where(
        AppSettings.tenant_id == current_user.tenant_id,
        AppSettings.key == _KEY,
    )
    result = await db.execute(stmt)
    setting = result.scalars().first()

    if setting:
        setting.value = val_json
    else:
        setting = AppSettings(
            tenant_id=current_user.tenant_id,
            key=_KEY,
            value=val_json,
        )
        db.add(setting)

    try:
        await db.commit()
        await db.refresh(setting)
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al guardar: {str(e)}")

    return NegocioConfigResponse(tenant_id=current_user.tenant_id, **body.model_dump())
