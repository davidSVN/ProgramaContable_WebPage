from typing import List, Optional
from datetime import date

from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_admin_or_above
from app.models import AppUser, SpentBusiness
from app.schemas import GastoCreate, GastoUpdate, GastoResponse, GastoCountResponse
from app.services import gastos_service
from app.services.gastos_service import FiltrosGasto

router = APIRouter(tags=["Gastos"])


def _dto_to_response(dto, tenant_id: int) -> GastoResponse:
    return GastoResponse(
        spent_id=dto.spent_id,
        tenant_id=tenant_id,
        spent_category=dto.spent_category,
        spent_payment_method=dto.spent_payment_method,
        spent_value=dto.spent_value,
        spent_general_name=dto.spent_general_name,
        description=None,
        spent_date=dto.spent_date,
    )


def _build_filtros(
    categoria: Optional[str],
    forma_pago: Optional[str],
    nombre_gasto: Optional[str],
    fecha_inicio: Optional[date],
    fecha_fin: Optional[date],
) -> FiltrosGasto:
    return FiltrosGasto(
        categoria=categoria or "Todos",
        forma_pago=forma_pago or "Todos",
        nombre_gasto=nombre_gasto or "",
        fecha_inicio=fecha_inicio,
        fecha_fin=fecha_fin,
    )


@router.get("/count", response_model=GastoCountResponse)
async def contar_gastos(
    categoria: Optional[str] = Query(default=None),
    forma_pago: Optional[str] = Query(default=None),
    nombre_gasto: Optional[str] = Query(default=None),
    fecha_inicio: Optional[date] = Query(default=None),
    fecha_fin: Optional[date] = Query(default=None),
    current_user: AppUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retorna la cantidad total de gastos del tenant con los mismos filtros que el listado."""
    filtros = _build_filtros(categoria, forma_pago, nombre_gasto, fecha_inicio, fecha_fin)
    total = await gastos_service.contar(db, current_user.tenant_id, filtros)
    return {"total": total}


@router.get("/", response_model=List[GastoResponse])
async def listar_gastos(
    categoria: Optional[str] = Query(default=None, description="Filtrar por categoría"),
    forma_pago: Optional[str] = Query(default=None, description="Filtrar por forma de pago"),
    nombre_gasto: Optional[str] = Query(default=None, description="Filtrar por nombre/descripción"),
    fecha_inicio: Optional[date] = Query(default=None),
    fecha_fin: Optional[date] = Query(default=None),
    limit: int = Query(25, ge=1),
    offset: int = Query(0, ge=0),
    current_user: AppUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lista los gastos del tenant con paginación y filtros."""
    filtros = _build_filtros(categoria, forma_pago, nombre_gasto, fecha_inicio, fecha_fin)
    dtos = await gastos_service.listar(db, current_user.tenant_id, filtros, limit=limit, offset=offset)
    return [_dto_to_response(dto, current_user.tenant_id) for dto in dtos]


@router.post("/", response_model=GastoResponse, status_code=status.HTTP_201_CREATED)
async def registrar_gasto(
    datos: GastoCreate,
    current_user: AppUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Registra un nuevo gasto (admin y empleado)."""
    resultado = await gastos_service.registrar(
        db,
        tenant_id=current_user.tenant_id,
        categoria=datos.spent_category or "",
        forma_pago=datos.spent_payment_method,
        monto=datos.spent_value,
        descripcion_nombre=datos.spent_general_name,
        fecha=datos.spent_date,
    )
    if isinstance(resultado, str):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=resultado)
    return _dto_to_response(resultado, current_user.tenant_id)


@router.put("/{gasto_id}", response_model=GastoResponse)
async def actualizar_gasto(
    gasto_id: int,
    datos: GastoUpdate,
    current_user: AppUser = Depends(require_admin_or_above),
    db: AsyncSession = Depends(get_db),
):
    """Actualiza un gasto existente (solo admin)."""
    resultado = await gastos_service.actualizar(
        db,
        tenant_id=current_user.tenant_id,
        gasto_id=gasto_id,
        categoria=datos.spent_category,
        descripcion_nombre=datos.spent_general_name,
        forma_pago=datos.spent_payment_method,
        monto=datos.spent_value,
    )
    if isinstance(resultado, str):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=resultado)
    # resultado == True → obtener el gasto actualizado para armar la respuesta
    res = await db.execute(
        select(SpentBusiness).where(SpentBusiness.spent_id == gasto_id)
    )
    gasto = res.scalars().first()
    from app.services.gastos_service import GastoDTO
    return _dto_to_response(GastoDTO.from_orm(gasto), current_user.tenant_id)


@router.delete("/{gasto_id}", status_code=status.HTTP_200_OK)
async def borrar_gasto(
    gasto_id: int,
    current_user: AppUser = Depends(require_admin_or_above),
    db: AsyncSession = Depends(get_db),
):
    """Elimina un gasto (solo admin)."""
    resultado = await gastos_service.borrar(db, current_user.tenant_id, gasto_id)
    if isinstance(resultado, str):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=resultado)
    return {"message": f"Gasto #{gasto_id} eliminado correctamente"}
