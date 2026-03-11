from typing import List
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_admin_or_above
from app.models import AppUser
from app.schemas import ProveedorCreate, ProveedorUpdate, ProveedorResponse
from app.services import proveedores_service
from app.services.proveedores_service import ProveedorDTO

router = APIRouter()


def _dto_to_response(dto: ProveedorDTO) -> ProveedorResponse:
    return ProveedorResponse(
        prov_id=dto.prov_id,
        prov_name=dto.prov_name,
        prov_contact=dto.prov_contact,
        prov_address=dto.prov_address,
        state=dto.state,
        loyalty_level=dto.loyalty_level,
    )


@router.get("/", response_model=List[ProveedorResponse])
async def listar_proveedores(
    search_names: List[str] = Query(default=[]),
    search_contacts: List[str] = Query(default=[]),
    current_user: AppUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lista proveedores del tenant con filtros opcionales (admin y empleado)."""
    dtos = await proveedores_service.listar(
        db,
        current_user.tenant_id,
        search_names=search_names or None,
        search_contacts=search_contacts or None,
    )
    return [_dto_to_response(dto) for dto in dtos]


@router.post("/", response_model=ProveedorResponse, status_code=status.HTTP_201_CREATED)
async def crear_proveedor(
    datos: ProveedorCreate,
    current_user: AppUser = Depends(require_admin_or_above),
    db: AsyncSession = Depends(get_db),
):
    """Crea un nuevo proveedor (solo admin)."""
    resultado = await proveedores_service.crear(
        db,
        tenant_id=current_user.tenant_id,
        nombre=datos.nombre,
        telefono=datos.telefono,
        email=datos.email,
        direccion=datos.direccion,
        activo=datos.activo,
        loyalty_level=datos.loyalty_level,
    )
    if isinstance(resultado, str):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=resultado)
    return _dto_to_response(resultado)


@router.put("/{proveedor_id}", response_model=ProveedorResponse)
async def actualizar_proveedor(
    proveedor_id: int,
    datos: ProveedorUpdate,
    current_user: AppUser = Depends(require_admin_or_above),
    db: AsyncSession = Depends(get_db),
):
    """Actualiza un proveedor existente (solo admin). Todos los campos son opcionales."""
    resultado = await proveedores_service.actualizar(
        db,
        tenant_id=current_user.tenant_id,
        proveedor_id=proveedor_id,
        datos=datos,
    )
    if isinstance(resultado, str):
        if "no encontrado" in resultado.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=resultado)
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=resultado)
    return _dto_to_response(resultado)


@router.delete("/{proveedor_id}", status_code=status.HTTP_200_OK)
async def borrar_proveedor(
    proveedor_id: int,
    current_user: AppUser = Depends(require_admin_or_above),
    db: AsyncSession = Depends(get_db),
):
    """Elimina un proveedor (solo admin)."""
    resultado = await proveedores_service.borrar(db, current_user.tenant_id, proveedor_id)
    if isinstance(resultado, str):
        if "no encontrado" in resultado.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=resultado)
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=resultado)
    return {"message": "Proveedor eliminado correctamente"}
