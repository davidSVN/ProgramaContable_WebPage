from typing import List, Optional
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_admin_or_above
from app.models import AppUser
from app.schemas import ServicioCreate, ServicioUpdate, LaundryServiceResponse, ServicioStatsResponse
from app.services import servicios_service

router = APIRouter()


@router.get("/", response_model=List[LaundryServiceResponse])
async def listar_servicios(
    user_institute: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    current_user: AppUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Lista los servicios del tenant (admin y empleado)."""
    servicios = await servicios_service.listar(
        db, 
        current_user.tenant_id, 
        user_institute=user_institute,
        search=search
    )
    return servicios


@router.get("/stats", response_model=ServicioStatsResponse)
async def obtener_stats_servicios(
    current_user: AppUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Retorna estadísticas de servicios para el tenant."""
    stats = await servicios_service.obtener_stats(db, current_user.tenant_id)
    return stats


@router.post("/", response_model=LaundryServiceResponse, status_code=status.HTTP_201_CREATED)
async def crear_servicio(
    datos: ServicioCreate,
    current_user: AppUser = Depends(require_admin_or_above),
    db: AsyncSession = Depends(get_db)
):
    """Crea un nuevo servicio (solo admin)."""
    # Validación manual de nombre_instituto si es instituto
    if datos.user_institute == "instituto" and not datos.nombre_instituto:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="nombre_instituto es requerido cuando user_institute es 'instituto'"
        )

    resultado = await servicios_service.crear(
        db, 
        current_user.tenant_id, 
        datos
    )
    
    if isinstance(resultado, str):
        if "ya existe" in resultado.lower():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=resultado)
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=resultado)
    
    return LaundryServiceResponse.model_validate(resultado)


@router.put("/{servicio_id}", response_model=LaundryServiceResponse)
async def actualizar_servicio(
    servicio_id: int,
    datos: ServicioUpdate,
    current_user: AppUser = Depends(require_admin_or_above),
    db: AsyncSession = Depends(get_db),
):
    """Actualiza un servicio existente (solo admin). Todos los campos son opcionales."""
    resultado = await servicios_service.actualizar(
        db,
        tenant_id=current_user.tenant_id,
        servicio_id=servicio_id,
        datos=datos,
    )
    if resultado == "Not found":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Servicio no encontrado o no pertenece al tenant",
        )
    if isinstance(resultado, str):
        if "fundamental" in resultado:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=resultado)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=resultado)
    
    return LaundryServiceResponse.model_validate(resultado)


@router.delete("/{servicio_id}", status_code=status.HTTP_200_OK)
async def borrar_servicio(
    servicio_id: int,
    current_user: AppUser = Depends(require_admin_or_above),
    db: AsyncSession = Depends(get_db)
):
    """Elimina explícitamente un servicio (solo admin)."""
    error = await servicios_service.borrar(db, current_user.tenant_id, servicio_id)
    
    if error == "Not found":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Servicio no encontrado o no pertenece al tenant"
        )
    elif error == "Este es un servicio fundamental y no puede ser eliminado.":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=error)
    elif error == "Este servicio podría estar vinculado a transacciones pasadas.":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=error)
    elif error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error)
        
    return {"deleted": True, "service_id": servicio_id}
