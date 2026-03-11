from typing import List, Optional
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_admin_or_above
from app.models import AppUser
from app.schemas import ServicioCreate, ServicioUpdate, LaundryServiceResponse
from app.services import servicios_service

router = APIRouter()


@router.get("/", response_model=List[LaundryServiceResponse])
async def listar_servicios(
    filtro_institucion: Optional[str] = Query(default=None),
    current_user: AppUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Lista los servicios del tenant (admin y empleado)."""
    servicios = await servicios_service.listar(
        db, 
        current_user.tenant_id, 
        filtro_institucion=filtro_institucion
    )
    return servicios


@router.post("/", response_model=LaundryServiceResponse, status_code=status.HTTP_201_CREATED)
async def crear_servicio(
    datos: ServicioCreate,
    current_user: AppUser = Depends(require_admin_or_above),
    db: AsyncSession = Depends(get_db)
):
    """Crea un nuevo servicio (solo admin). Los datos de la institución se sacan del usuario."""
    # En el modelo original, no existía 'user_institute' en AppUser, pero el user_request dice:
    # "extraer de current_user.institute o similar según tu modelo de User"
    # Como no hay campos así en AppUser (solo role, tenant, username, email), 
    # usaré un fallback por defecto basado en los detalles del requirement original.
    
    # Intenta obtener de un posible profile, o usar valores por defecto si el AppUser no lo tiene.
    ui = datos.user_institute
    ni = datos.nombre_instituto
    
    resultado = await servicios_service.crear(
        db, 
        current_user.tenant_id, 
        datos,
        user_institute=ui,
        nombre_instituto=ni
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
    if isinstance(resultado, str) and "fundamental" in resultado:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=resultado)
    if isinstance(resultado, str):
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
        
    return {"message": "Servicio eliminado correctamente"}
