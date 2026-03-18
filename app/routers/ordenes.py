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
    OrderDetailFlatResponse,
    OrderDetailsStatsResponse,
    OrderHistorialResponse,
    OrderStatsResponse,
    EntregarOrdenRequest,
    EntregarOrdenResponse,
    RegistrarPagoRequest,
)
from datetime import datetime
from app.services import facturacion_b2c_service as service
from app.services import historial_service
from app.services.facturacion_b2c_service import FiltrosOrden

router = APIRouter()


# ── Historial y Estadísticas ──────────────────────────────────────────────────

@router.get("/historial", response_model=OrderHistorialResponse)
async def obtener_historial_ordenes(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=15, ge=1, le=100),
    estado_pago: Optional[str] = Query(default=None),
    estado_orden: Optional[str] = Query(default=None),
    cliente: Optional[str] = Query(default=None),
    desde: Optional[date] = Query(default=None),
    hasta: Optional[date] = Query(default=None),
    is_institute: Optional[bool] = Query(default=None),
    sort_field: str = Query(default="id"),
    sort_direction: str = Query(default="desc"),
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Obtiene el historial de órdenes del tenant con filtros y paginación.
    Incluye tanto B2C como B2B (instituciones) si se filtra por is_institute.
    """
    return await historial_service.obtener_historial(
        db=db,
        tenant_id=current_user.tenant_id,
        page=page,
        limit=limit,
        estado_pago=estado_pago,
        estado_orden=estado_orden,
        cliente=cliente,
        desde=desde,
        hasta=hasta,
        is_institute=is_institute,
        sort_field=sort_field,
        sort_direction=sort_direction
    )


@router.get("/historial/stats", response_model=OrderStatsResponse)
async def obtener_stats(
    estado_pago: Optional[str] = Query(default=None),
    estado_orden: Optional[str] = Query(default=None),
    cliente: Optional[str] = Query(default=None),
    desde: Optional[date] = Query(default=None),
    hasta: Optional[date] = Query(default=None),
    is_institute: Optional[bool] = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Obtiene estadísticas resumidas de órdenes para el tenant actual con filtros aplicados.
    """
    return await historial_service.obtener_stats_historial(
        db, 
        current_user.tenant_id,
        estado_pago=estado_pago,
        estado_orden=estado_orden,
        cliente=cliente,
        desde=desde,
        hasta=hasta,
        is_institute=is_institute
    )


@router.get("/historial/statuses", response_model=List[str])
async def obtener_estados_orden_unicos(
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Obtiene la lista de todos los estados de orden únicos presentes en el sistema para este tenant.
    """
    from sqlalchemy import select as sa_select
    from app.models import OrderHeader
    stmt = (
        sa_select(OrderHeader.order_status)
        .where(OrderHeader.tenant_id == current_user.tenant_id)
        .distinct()
    )
    res = await db.execute(stmt)
    return [s for s in res.scalars().all() if s]


# ── 1. GET /ordenes/servicios ─────────────────────────────────────────────────
# IMPORTANTE: rutas literales ANTES de rutas con {order_id}
@router.get("/servicios", response_model=List[LaundryServiceResponse])
async def listar_servicios(
    institucion: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Lista servicios disponibles para crear órdenes B2C o específicos por institución."""
    servicios = await service.listar_servicios_disponibles(db, current_user.tenant_id, institucion)
    # ServicioDTO → dict compatible con LaundryServiceResponse
    return [
        {
            "service_id":        s.service_id,
            "service_name":      s.service_name,
            "service_value":     s.service_value,
            "description":       None,
            "spent_per_service": s.spent_per_service,
            "user_institute":    s.user_institute,
            "nombre_instituto":  s.nombre_instituto,
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


# ── 3b. GET /ordenes/detalles/count ──────────────────────────────────────────
@router.get("/detalles/count")
async def contar_detalles_ordenes(
    order_id:     Optional[int]  = Query(default=None),
    user_id:      Optional[int]  = Query(default=None),
    service_name: Optional[str]  = Query(default=None),
    user_name:    Optional[str]  = Query(default=None),
    is_agency:    Optional[bool] = Query(default=None),
    fecha_inicio: Optional[date] = Query(default=None),
    fecha_fin:    Optional[date] = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    from sqlalchemy import select as sa_select, func
    from app.models import OrderDetail, OrderHeader as OH

    stmt = (
        sa_select(func.count(OrderDetail.id))
        .join(OH, OrderDetail.order_id == OH.id)
        .where(OrderDetail.tenant_id == current_user.tenant_id)
    )
    if order_id is not None:
        stmt = stmt.where(OrderDetail.order_id == order_id)
    if user_id is not None:
        stmt = stmt.where(OrderDetail.user_id == user_id)
    if service_name:
        stmt = stmt.where(OrderDetail.service_name.ilike(f"%{service_name}%"))
    if user_name:
        stmt = stmt.where(OrderDetail.user_name.ilike(f"%{user_name}%"))
    if is_agency is not None:
        stmt = stmt.where(OrderDetail.is_agency == is_agency)
    if fecha_inicio:
        stmt = stmt.where(OH.date >= datetime.combine(fecha_inicio, datetime.min.time()))
    if fecha_fin:
        stmt = stmt.where(OH.date <= datetime.combine(fecha_fin, datetime.max.time()))
    result = await db.execute(stmt)
    return {"total": result.scalar() or 0}


# ── 3d. GET /ordenes/detalles/stats ───────────────────────────────────────────
@router.get("/detalles/stats", response_model=OrderDetailsStatsResponse)
async def obtener_stats_detalles_ordenes(
    order_id:     Optional[int]  = Query(default=None),
    user_id:      Optional[int]  = Query(default=None),
    service_name: Optional[str]  = Query(default=None),
    user_name:    Optional[str]  = Query(default=None),
    is_agency:    Optional[bool] = Query(default=None),
    fecha_inicio: Optional[date] = Query(default=None),
    fecha_fin:    Optional[date] = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    from sqlalchemy import select as sa_select, func
    from app.models import OrderDetail, OrderHeader as OH

    stmt = (
        sa_select(
            func.count(OrderDetail.id).label("total_count"),
            func.sum(OrderDetail.total_item_price).label("total_value"),
            func.sum(OrderDetail.spent_per_order).label("total_cost")
        )
        .join(OH, OrderDetail.order_id == OH.id)
        .where(OrderDetail.tenant_id == current_user.tenant_id)
    )
    if order_id is not None:
        stmt = stmt.where(OrderDetail.order_id == order_id)
    if user_id is not None:
        stmt = stmt.where(OrderDetail.user_id == user_id)
    if service_name:
        stmt = stmt.where(OrderDetail.service_name.ilike(f"%{service_name}%"))
    if user_name:
        stmt = stmt.where(OH.user_name.ilike(f"%{user_name}%"))
    if is_agency is not None:
        stmt = stmt.where(OrderDetail.is_agency == is_agency)
    if fecha_inicio:
        stmt = stmt.where(OH.date >= datetime.combine(fecha_inicio, datetime.min.time()))
    if fecha_fin:
        stmt = stmt.where(OH.date <= datetime.combine(fecha_fin, datetime.max.time()))
    
    result = await db.execute(stmt)
    row = result.one()
    return {
        "total_count": row.total_count or 0,
        "total_value": float(row.total_value or 0.0),
        "total_cost": float(row.total_cost or 0.0)
    }


# ── 3c. GET /ordenes/detalles ─────────────────────────────────────────────────
@router.get("/detalles", response_model=List[OrderDetailFlatResponse])
async def listar_detalles_ordenes(
    order_id:     Optional[int]  = Query(default=None),
    user_id:      Optional[int]  = Query(default=None),
    service_name: Optional[str]  = Query(default=None),
    user_name:    Optional[str]  = Query(default=None),
    is_agency:    Optional[bool] = Query(default=None),
    fecha_inicio: Optional[date] = Query(default=None),
    fecha_fin:    Optional[date] = Query(default=None),
    limit:        int            = Query(default=15, ge=1, le=200),
    offset:       int            = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    from sqlalchemy import select as sa_select
    from app.models import OrderDetail, OrderHeader as OH

    stmt = (
        sa_select(
            OrderDetail.id,
            OrderDetail.order_id,
            OrderDetail.user_name,
            OrderDetail.service_name,
            OrderDetail.quantity,
            OrderDetail.unit_price,
            OrderDetail.total_item_price,
            OrderDetail.is_agency,
            OrderDetail.agency_done_date,
            OrderDetail.spent_per_order,
            OrderDetail.description,
            OH.date,
            OH.order_status,
        )
        .join(OH, OrderDetail.order_id == OH.id)
        .where(OrderDetail.tenant_id == current_user.tenant_id)
    )
    if order_id is not None:
        stmt = stmt.where(OrderDetail.order_id == order_id)
    if user_id is not None:
        stmt = stmt.where(OrderDetail.user_id == user_id)
    if service_name:
        stmt = stmt.where(OrderDetail.service_name.ilike(f"%{service_name}%"))
    if user_name:
        stmt = stmt.where(OrderDetail.user_name.ilike(f"%{user_name}%"))
    if is_agency is not None:
        stmt = stmt.where(OrderDetail.is_agency == is_agency)
    if fecha_inicio:
        stmt = stmt.where(OH.date >= datetime.combine(fecha_inicio, datetime.min.time()))
    if fecha_fin:
        stmt = stmt.where(OH.date <= datetime.combine(fecha_fin, datetime.max.time()))
    stmt = stmt.order_by(OH.date.desc()).limit(limit).offset(offset)
    result = await db.execute(stmt)
    rows = result.all()
    return [
        {
            "id":               r.id,
            "order_id":         r.order_id,
            "user_name":        r.user_name,
            "service_name":     r.service_name,
            "quantity":         r.quantity,
            "unit_price":       r.unit_price,
            "total_item_price": r.total_item_price,
            "is_agency":        r.is_agency,
            "agency_done_date": r.agency_done_date,
            "spent_per_order":  r.spent_per_order,
            "description":      r.description,
            "date":             r.date,
            "order_status":     r.order_status,
        }
        for r in rows
    ]


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
            "description": item.description,
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
    orden_dict = _orden_dto_to_dict(resultado)
    orden_dict["servicios_data"] = servicios_data
    return orden_dict


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


# ── 9. POST /ordenes/{order_id}/entregar ──────────────────────────────────────
@router.post("/{order_id}/entregar", response_model=EntregarOrdenResponse)
async def entregar_orden(
    order_id: int,
    data: EntregarOrdenRequest,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Registra la entrega de una orden, actualiza el estado y marca como pagada
    si hay saldo pendiente (se asume que el cliente paga al recoger).
    """
    from sqlalchemy import select as sa_select
    from app.models import OrderHeader

    # 1. Buscar orden por id + tenant_id
    res = await db.execute(
        sa_select(OrderHeader).where(
            OrderHeader.id == order_id,
            OrderHeader.tenant_id == current_user.tenant_id
        )
    )
    orden = res.scalars().first()

    # 2. Validar existencia
    if not orden:
        raise HTTPException(status_code=404, detail="Orden no encontrada")

    # 3. Validar estado (no entregada, no cancelada)
    if orden.order_status == "Entregada":
        raise HTTPException(status_code=400, detail="La orden ya ha sido entregada")
    if orden.order_status == "Cancelada":
        raise HTTPException(status_code=400, detail="No se puede entregar una orden cancelada")

    # 4. Actualizar campos de entrega
    orden.order_status = data.order_status or "Entregada"
    orden.delivered_at = datetime.now()
    orden.delivered_by = current_user.username
    
    # Si se entregó factura física, los datos de recibo son los mismos del cliente
    if data.invoice_delivered:
        orden.received_by_name = orden.user_name
        orden.received_by_cedula = str(orden.user_id) if orden.user_id else None
    else:
        # Si NO se entregó factura, guardamos lo que venga del frontend
        if data.received_by_name:
            orden.received_by_name = data.received_by_name
        if data.received_by_cedula:
            orden.received_by_cedula = data.received_by_cedula
        
    orden.invoice_delivered = data.invoice_delivered
    orden.delivery_signature = data.delivery_signature

    # 5. Saldo pendiente / Estado pago
    if data.estado_pago:
        if data.estado_pago == "Pagada":
            orden.is_paid = True
            orden.balance_due = 0.0
        elif data.estado_pago == "Debe":
            orden.is_paid = False
        # Si es "Parcial", la lógica actual no es clara sobre cuánto abona, 
        # así que nos mantenemos en lo simple por ahora.
    elif orden.balance_due > 0:
        # Default behavior: auto-mark as paid if delivering and has debt
        orden.is_paid = True
        orden.balance_due = 0.0

    if data.metodo_pago and orden.is_paid:
        orden.payment_method = data.metodo_pago

    # 6. Commit
    await db.commit()
    await db.refresh(orden)

    return EntregarOrdenResponse(
        order_id=orden.id,
        order_status=orden.order_status,
        is_paid=orden.is_paid,
        balance_due=orden.balance_due,
        delivered_at=orden.delivered_at,
        delivered_by=orden.delivered_by,
        received_by_name=orden.received_by_name,
        received_by_cedula=orden.received_by_cedula,
        invoice_delivered=orden.invoice_delivered,
        has_signature=bool(orden.delivery_signature)
    )


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
