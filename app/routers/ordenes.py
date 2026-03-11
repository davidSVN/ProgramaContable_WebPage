"""
Router de Órdenes B2C (clientes particulares).
Prefijo: /ordenes  — registrado en main.py
"""
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_admin_or_above
from app.models import AppUser
from app.schemas import (
    ActualizarEstadoRequest,
    ClienteSearchResponse,
    DetalleOrdenResponse,
    LaundryServiceResponse,
    OrdenCreate,
    OrdenResponse,
    RegistrarPagoRequest,
)
from app.services import facturacion_b2c_service as service
from app.services.facturacion_b2c_service import FiltrosOrden

router = APIRouter()


# ── 1. GET /ordenes/servicios ─────────────────────────────────────────────────
# IMPORTANTE: rutas literales ANTES de rutas con {order_id}
@router.get("/servicios", response_model=List[LaundryServiceResponse])
async def listar_servicios(
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Lista servicios disponibles para crear órdenes B2C."""
    servicios = await service.listar_servicios_disponibles(db, current_user.tenant_id)
    # ServicioDTO → dict compatible con LaundryServiceResponse
    return [
        {
            "service_id":        s.service_id,
            "service_name":      s.service_name,
            "service_value":     s.service_value,
            "description":       None,
            "spent_per_service": s.spent_per_service,
            "nombre_instituto":  "usuario",
        }
        for s in servicios
    ]


# ── 2. GET /ordenes/clientes/search ──────────────────────────────────────────
@router.get("/clientes/search", response_model=List[ClienteSearchResponse])
async def buscar_clientes(
    q: str = Query(min_length=1),
    limit: int = Query(default=13, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Busca clientes B2C por nombre o contacto."""
    resultados = await service.buscar_clientes(db, current_user.tenant_id, q, limit)
    return [{"id": uid, "nombre": nombre} for uid, nombre in resultados]


# ── 3. GET /ordenes/count ─────────────────────────────────────────────────────
@router.get("/count")
async def contar_ordenes(
    estado_pago:    str           = Query(default="Todos"),
    estado_orden:   str           = Query(default="Todos"),
    cliente_nombre: str           = Query(default=""),
    fecha_inicio:   Optional[date] = Query(default=None),
    fecha_fin:      Optional[date] = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    filtros = FiltrosOrden(
        estado_pago    = estado_pago,
        estado_orden   = estado_orden,
        cliente_nombre = cliente_nombre,
        fecha_inicio   = fecha_inicio,
        fecha_fin      = fecha_fin,
    )
    total = await service.contar_ordenes(db, current_user.tenant_id, filtros)
    return {"total": total}


# ── 4. GET /ordenes/ ──────────────────────────────────────────────────────────
@router.get("/", response_model=List[OrdenResponse])
async def listar_ordenes(
    estado_pago:    str           = Query(default="Todos"),
    estado_orden:   str           = Query(default="Todos"),
    cliente_nombre: str           = Query(default=""),
    fecha_inicio:   Optional[date] = Query(default=None),
    fecha_fin:      Optional[date] = Query(default=None),
    limit:          int           = Query(default=50, ge=1, le=200),
    offset:         int           = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    filtros = FiltrosOrden(
        estado_pago    = estado_pago,
        estado_orden   = estado_orden,
        cliente_nombre = cliente_nombre,
        fecha_inicio   = fecha_inicio,
        fecha_fin      = fecha_fin,
    )
    ordenes = await service.listar_ordenes(db, current_user.tenant_id, filtros, limit, offset)
    return [_orden_dto_to_dict(o) for o in ordenes]


# ── 5. POST /ordenes/ ─────────────────────────────────────────────────────────
@router.post("/", response_model=OrdenResponse, status_code=status.HTTP_201_CREATED)
async def crear_orden(
    data: OrdenCreate,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    servicios_data = [
        {
            "id":        item.id,
            "name":      item.name,
            "qty":       item.qty,
            "value":     item.value,
            "is_agency": item.is_agency,
        }
        for item in data.servicios_data
    ]
    resultado = await service.crear_orden(
        db               = db,
        tenant_id        = current_user.tenant_id,
        user_id          = data.user_id,
        servicios_data   = servicios_data,
        items_description= data.items_description,
        state_payment    = data.state_payment,
        pagos            = [p.dict() for p in data.pagos],
        discount_value   = data.discount_value,
        state_state      = data.state_state,
    )
    if isinstance(resultado, str):
        raise HTTPException(status_code=400, detail=resultado)
    return _orden_dto_to_dict(resultado)


# ── 6. GET /ordenes/{order_id}/detalle ───────────────────────────────────────
@router.get("/{order_id}/detalle", response_model=List[DetalleOrdenResponse])
async def obtener_detalle(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    resultado = await service.obtener_detalle_orden(db, current_user.tenant_id, order_id)
    if isinstance(resultado, str):
        raise HTTPException(status_code=404, detail=resultado)
    return resultado


# ── 7. PUT /ordenes/{order_id}/estado ────────────────────────────────────────
@router.put("/{order_id}/estado")
async def actualizar_estado(
    order_id: int,
    data: ActualizarEstadoRequest,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    resultado = await service.actualizar_estado(
        db          = db,
        tenant_id   = current_user.tenant_id,
        order_id    = order_id,
        estado      = data.estado,
        estado_pago = data.estado_pago,
        metodo_pago = data.metodo_pago,
        monto_pago  = data.monto_pago,
    )
    if isinstance(resultado, str):
        raise HTTPException(status_code=400, detail=resultado)
    return {"message": "Estado actualizado"}


# ── 8. POST /ordenes/{order_id}/pagos ────────────────────────────────────────
@router.post("/{order_id}/pagos")
async def registrar_pago(
    order_id: int,
    data: RegistrarPagoRequest,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    resultado = await service.registrar_pago(
        db          = db,
        tenant_id   = current_user.tenant_id,
        order_id    = order_id,
        monto       = data.monto,
        metodo_pago = data.metodo_pago,
    )
    if isinstance(resultado, str):
        raise HTTPException(status_code=400, detail=resultado)

    # Devolver balance_due actualizado
    from sqlalchemy import select as sa_select
    from app.models import OrderHeader
    res = await db.execute(
        sa_select(OrderHeader).where(OrderHeader.id == order_id)
    )
    orden_actualizada = res.scalars().first()
    return {
        "message":     "Pago registrado",
        "balance_due": orden_actualizada.balance_due if orden_actualizada else 0.0,
    }


# ── 9. DELETE /ordenes/{order_id} ────────────────────────────────────────────
@router.delete("/{order_id}")
async def eliminar_orden(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_admin_or_above),
):
    resultado = await service.eliminar_orden(db, current_user.tenant_id, order_id)
    if isinstance(resultado, str):
        if resultado == "consolidada":
            raise HTTPException(
                status_code=409,
                detail="No se puede eliminar: pertenece a una factura consolidada B2B",
            )
        raise HTTPException(status_code=404, detail=resultado)
    return {"message": "Orden eliminada"}


# ── Helper: OrdenDTO → dict para Pydantic ─────────────────────────────────────
def _orden_dto_to_dict(o) -> dict:
    """Convierte OrdenDTO al dict esperado por OrdenResponse."""
    return {
        "order_id":               o.order_id,
        "user_id":                o.user_id,
        "user_name":              o.user_name,
        "user_contact":           o.user_contact,
        "state_payment":          o.state_payment,
        "state_state":            o.state_state,
        "order_value":            o.order_value,
        "payment_method":         o.payment_method,
        "restante":               o.restante,
        "abono":                  o.abono,
        "created_at":             o.created_at,
        "days_open":              o.days_open,
        "agency":                 o.agency,
        "agency_done_date":       o.agency_done_date,
        "spent_per_order":        o.spent_per_order,
        "net_income_value":       o.net_income_value,
        "discount_value":         o.discount_value,
        "items_description":      o.items_description,
        "is_institute":           o.is_institute,
        "consolidated_invoice_id": o.consolidated_invoice_id,
    }
