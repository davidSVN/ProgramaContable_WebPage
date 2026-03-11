"""
Router B2B – 7 endpoints para facturación institucional (admin only).
Prefijo: /b2b  Tags: [Facturación B2B]
"""
from __future__ import annotations

from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_admin_or_above
from app.schemas import (
    AbonoRequest,
    AbonoResponse,
    FacturaConsolidadaResponse,
    GenerarFacturaRequest,
    OrdenB2BCreate,
    OrdenResponse,
    PagoInstitucionalRequest,
)
from app.services import facturacion_b2b_service as svc
from app.services.facturacion_b2c_service import FiltrosOrden

router = APIRouter()


# ─── Helper: convertir DTO → Response schema ─────────────────────────────────

def _orden_dto_to_response(dto) -> OrdenResponse:
    return OrdenResponse(
        order_id                = dto.order_id,
        user_id                 = dto.user_id,
        user_name               = dto.user_name,
        user_contact            = dto.user_contact,
        state_payment           = dto.state_payment,
        state_state             = dto.state_state,
        order_value             = dto.order_value,
        payment_method          = dto.payment_method,
        restante                = dto.restante,
        abono                   = dto.abono,
        created_at              = dto.created_at,
        days_open               = dto.days_open,
        agency                  = dto.agency,
        agency_done_date        = dto.agency_done_date,
        spent_per_order         = dto.spent_per_order,
        net_income_value        = dto.net_income_value,
        discount_value          = dto.discount_value,
        items_description       = dto.items_description,
        is_institute            = dto.is_institute,
        consolidated_invoice_id = dto.consolidated_invoice_id,
    )


def _factura_dto_to_response(dto) -> FacturaConsolidadaResponse:
    return FacturaConsolidadaResponse(
        invoice_id   = dto.invoice_id,
        user_id      = dto.user_id,
        user_name    = dto.user_name,
        total_amount = dto.total_amount,
        pagado       = dto.pagado,
        balance_due  = dto.balance_due,
        is_paid      = dto.is_paid,
        notes        = dto.notes,
        created_at   = dto.created_at,
        ordenes_ids  = dto.ordenes_ids,
    )


# ─── Endpoints: Órdenes B2B ──────────────────────────────────────────────────

@router.get("/ordenes/count", summary="Contar órdenes B2B")
async def contar_ordenes_b2b(
    estado_pago:    Optional[str]  = Query(default="Todos"),
    estado_orden:   Optional[str]  = Query(default="Todos"),
    cliente_nombre: Optional[str]  = Query(default=""),
    fecha_inicio:   Optional[date] = Query(default=None),
    fecha_fin:      Optional[date] = Query(default=None),
    db:             AsyncSession   = Depends(get_db),
    current_user = Depends(require_admin_or_above),
):
    filtros = FiltrosOrden(
        estado_pago    = estado_pago or "Todos",
        estado_orden   = estado_orden or "Todos",
        cliente_nombre = cliente_nombre or "",
        fecha_inicio   = fecha_inicio,
        fecha_fin      = fecha_fin,
    )
    total = await svc.contar_ordenes_b2b(db, current_user.tenant_id, filtros)
    return {"total": total}


@router.get("/ordenes/", response_model=List[OrdenResponse], summary="Listar órdenes B2B")
async def listar_ordenes_b2b(
    estado_pago:    Optional[str]  = Query(default="Todos"),
    estado_orden:   Optional[str]  = Query(default="Todos"),
    cliente_nombre: Optional[str]  = Query(default=""),
    fecha_inicio:   Optional[date] = Query(default=None),
    fecha_fin:      Optional[date] = Query(default=None),
    limit:          int            = Query(default=50, le=200),
    offset:         int            = Query(default=0, ge=0),
    db:             AsyncSession   = Depends(get_db),
    current_user = Depends(require_admin_or_above),
):
    filtros = FiltrosOrden(
        estado_pago    = estado_pago or "Todos",
        estado_orden   = estado_orden or "Todos",
        cliente_nombre = cliente_nombre or "",
        fecha_inicio   = fecha_inicio,
        fecha_fin      = fecha_fin,
    )
    dtos = await svc.listar_ordenes_b2b(db, current_user.tenant_id, filtros, limit, offset)
    return [_orden_dto_to_response(d) for d in dtos]


@router.post("/ordenes/", response_model=OrdenResponse, summary="Crear orden B2B")
async def crear_orden_b2b(
    body:        OrdenB2BCreate,
    db:          AsyncSession = Depends(get_db),
    current_user = Depends(require_admin_or_above),
):
    servicios_data = [s.model_dump() for s in body.servicios_data]
    resultado = await svc.crear_orden_b2b(
        db             = db,
        tenant_id      = current_user.tenant_id,
        user_id        = body.user_id,
        servicios_data = servicios_data,
        items_description = body.items_description,
        state_payment  = body.state_payment,
        payment_method = body.payment_method,
        discount_value = body.discount_value,
        abono          = body.abono,
        state_state    = body.state_state,
    )
    if isinstance(resultado, str):
        raise HTTPException(status_code=400, detail=resultado)
    return _orden_dto_to_response(resultado)


# ─── Endpoints: Facturas Consolidadas ────────────────────────────────────────

@router.get(
    "/facturas/",
    response_model=List[FacturaConsolidadaResponse],
    summary="Listar facturas consolidadas",
)
async def listar_facturas_consolidadas(
    user_id:          Optional[int]  = Query(default=None),
    solo_pendientes:  bool           = Query(default=False),
    db:               AsyncSession   = Depends(get_db),
    current_user = Depends(require_admin_or_above),
):
    dtos = await svc.listar_facturas_consolidadas(
        db, current_user.tenant_id, user_id, solo_pendientes
    )
    return [_factura_dto_to_response(d) for d in dtos]


@router.post(
    "/facturas/",
    response_model=FacturaConsolidadaResponse,
    status_code=201,
    summary="Generar factura consolidada",
)
async def generar_factura_consolidada(
    body:        GenerarFacturaRequest,
    db:          AsyncSession = Depends(get_db),
    current_user = Depends(require_admin_or_above),
):
    resultado = await svc.generar_factura_consolidada(
        db        = db,
        tenant_id = current_user.tenant_id,
        user_id   = body.user_id,
        order_ids = body.order_ids,
        notes     = body.notes,
    )
    if isinstance(resultado, str):
        raise HTTPException(status_code=400, detail=resultado)
    return _factura_dto_to_response(resultado)


@router.post(
    "/facturas/{invoice_id}/pagos",
    response_model=FacturaConsolidadaResponse,
    summary="Registrar pago institucional",
)
async def registrar_pago_institucional(
    invoice_id:  int,
    body:        PagoInstitucionalRequest,
    db:          AsyncSession = Depends(get_db),
    current_user = Depends(require_admin_or_above),
):
    resultado = await svc.registrar_pago_institucional(
        db              = db,
        tenant_id       = current_user.tenant_id,
        consolidated_id = invoice_id,
        monto           = body.monto,
        metodo_pago     = body.metodo_pago,
    )
    if isinstance(resultado, str):
        raise HTTPException(status_code=400, detail=resultado)
    return _factura_dto_to_response(resultado)


# ─── Endpoint: Abonos Institucionales ────────────────────────────────────────

@router.post("/abonos/", response_model=AbonoResponse, summary="Registrar abono institucional")
async def registrar_abono_institucional(
    body:        AbonoRequest,
    db:          AsyncSession = Depends(get_db),
    current_user = Depends(require_admin_or_above),
):
    resultado = await svc.registrar_abono_institucional(
        db             = db,
        tenant_id      = current_user.tenant_id,
        user_id        = body.user_id,
        amount         = body.amount,
        payment_method = body.payment_method,
        notes          = body.notes,
    )
    if isinstance(resultado, str):
        raise HTTPException(status_code=400, detail=resultado)
    return AbonoResponse(
        abono_id                 = resultado.abono_id,
        user_id                  = resultado.user_id,
        amount                   = resultado.amount,
        payment_method           = resultado.payment_method,
        notes                    = resultado.notes,
        created_at               = resultado.created_at,
        saldo_a_favor_resultante = resultado.saldo_a_favor_resultante,
    )
