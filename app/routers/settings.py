import json
from typing import Dict
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.dependencies import get_current_user, require_admin_or_above
from app.models import AppUser, AppSettings
from app.schemas import AbreviacionesResponse, AbreviacionesUpdate, AbreviacionesSaveResponse, BusinessSettingsResponse, BusinessSettingsUpdate

router = APIRouter()

DEFAULT_ABREVIACIONES = {
    "ca": "camisa",
    "pa": "pantalón", 
    "az": "azul",
    "ne": "negro",
    "bl": "blanco",
    "ro": "rojo",
    "sa": "sábana",
    "to": "toalla",
    "ch": "chaqueta",
    "su": "suéter",
    "ve": "vestido",
    "fa": "falda",
    "me": "medias",
    "co": "cobija",
    "al": "almohada",
    "do": "doble",
    "gr": "grande",
    "pe": "pequeño",
    "la": "lavado",
    "se": "secado",
}

@router.get("/abreviaciones", response_model=AbreviacionesResponse)
async def get_abreviaciones(
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user)
):
    """Obtiene el conjunto de abreviaciones del tenant."""
    stmt = select(AppSettings).where(
        AppSettings.tenant_id == current_user.tenant_id,
        AppSettings.key == "abreviaciones"
    )
    result = await db.execute(stmt)
    setting = result.scalars().first()
    
    if not setting:
        return {"abreviaciones": DEFAULT_ABREVIACIONES}
    
    try:
        data = json.loads(setting.value)
        return {"abreviaciones": data}
    except json.JSONDecodeError:
        return {"abreviaciones": DEFAULT_ABREVIACIONES}

@router.put("/abreviaciones", response_model=AbreviacionesSaveResponse)
async def update_abreviaciones(
    body: AbreviacionesUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_admin_or_above)
):
    """Actualiza (o crea) el set de abreviaciones para el tenant."""
    abreviaciones = body.abreviaciones
    
    # Validaciones
    if len(abreviaciones) > 200:
        raise HTTPException(status_code=400, detail="Máximo 200 abreviaciones permitidas.")
    
    for k, v in abreviaciones.items():
        if len(k) > 10:
            raise HTTPException(status_code=400, detail=f"Abreviación '{k}' excede 10 caracteres.")
        if len(v) > 50:
            raise HTTPException(status_code=400, detail=f"Expansión '{v}' excede 50 caracteres.")
            
    # Upsert logic
    stmt = select(AppSettings).where(
        AppSettings.tenant_id == current_user.tenant_id,
        AppSettings.key == "abreviaciones"
    )
    result = await db.execute(stmt)
    setting = result.scalars().first()
    
    val_json = json.dumps(abreviaciones)
    
    if setting:
        setting.value = val_json
    else:
        setting = AppSettings(
            tenant_id=current_user.tenant_id,
            key="abreviaciones",
            value=val_json
        )
        db.add(setting)
    
    try:
        await db.commit()
        await db.refresh(setting)
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al guardar: {str(e)}")
    
    return {
        "abreviaciones": abreviaciones,
        "total": len(abreviaciones)
    }

@router.get("/business", response_model=BusinessSettingsResponse)
async def get_business_settings(
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user)
):
    """Obtiene la información comercial del negocio."""
    keys = ["business_name", "business_address", "business_phone", "business_logo"]
    stmt = select(AppSettings).where(
        AppSettings.tenant_id == current_user.tenant_id,
        AppSettings.key.in_(keys)
    )
    result = await db.execute(stmt)
    settings = result.scalars().all()
    
    mapping = {s.key: s.value for s in settings}
    
    # Fallback al nombre del tenant si la configuración no existe
    tenant_name = current_user.tenant.nombre if current_user.tenant else "Lavalatu"

    return {
        "business_name": mapping.get("business_name", tenant_name),
        "business_address": mapping.get("business_address", "Dirección no configurada"),
        "business_phone": mapping.get("business_phone", "0000000000"),
        "business_logo": mapping.get("business_logo")
    }

@router.put("/business", response_model=BusinessSettingsResponse)
async def update_business_settings(
    body: BusinessSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_admin_or_above)
):
    """Actualiza la información comercial del negocio."""
    data = body.model_dump(exclude_unset=True)
    
    for key, value in data.items():
        if value is None: continue
        
        stmt = select(AppSettings).where(
            AppSettings.tenant_id == current_user.tenant_id,
            AppSettings.key == key
        )
        result = await db.execute(stmt)
        setting = result.scalars().first()
        
        if setting:
            setting.value = value
        else:
            setting = AppSettings(
                tenant_id=current_user.tenant_id,
                key=key,
                value=value
            )
            db.add(setting)
            
    try:
        await db.commit()
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
        
    # Return updated state
    return await get_business_settings(db, current_user)
