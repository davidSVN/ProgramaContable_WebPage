"""
Servicio de Facturación B2B – lógica async de negocio para órdenes institucionales.
B2B = instituciones (colegios, hoteles, empresas) que acumulan órdenes y pagan en bloque.
Tienen saldo_a_favor, facturas consolidadas y amortización automática.

NO duplica la lógica de crear_orden — la importa de facturacion_b2c_service con is_institute=True.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models import (
    AbonoInstitucional,
    ConsolidatedInvoice,
    LaundryUser,
    OrderHeader,
    OrderPayment,
)

# Importar el servicio B2C para reutilizar crear_orden y los DTOs de orden
import app.services.facturacion_b2c_service as b2c_svc
from app.services.facturacion_b2c_service import FiltrosOrden, OrdenDTO


# ──────────────────────────────────────────────────────────────────────────────
# DTOs B2B
# ──────────────────────────────────────────────────────────────────────────────

@dataclass
class FacturaConsolidadaDTO:
    invoice_id:   int
    user_id:      int
    user_name:    str
    total_amount: float
    pagado:       float        # suma de OrderPayments vinculados
    balance_due:  float        # total_amount - pagado
    is_paid:      bool
    notes:        Optional[str]
    created_at:   datetime
    ordenes_ids:  list[int]    # IDs de órdenes vinculadas

    @classmethod
    def from_orm(cls, fac: ConsolidatedInvoice, pagado: float) -> "FacturaConsolidadaDTO":
        user_name = fac.user.user_name if fac.user else f"ID {fac.user_id}"
        ordenes_ids = [o.id for o in fac.orders] if fac.orders else []
        bd = round(max(0.0, float(fac.total_amount) - pagado), 2)
        return cls(
            invoice_id   = fac.id,
            user_id      = fac.user_id,
            user_name    = user_name,
            total_amount = float(fac.total_amount),
            pagado       = round(pagado, 2),
            balance_due  = bd,
            is_paid      = fac.is_paid,
            notes        = fac.notes,
            created_at   = fac.created_at,
            ordenes_ids  = ordenes_ids,
        )


@dataclass
class AbonoDTO:
    abono_id:                 int
    user_id:                  int
    amount:                   float
    payment_method:           str
    notes:                    Optional[str]
    created_at:               datetime
    saldo_a_favor_resultante: float   # saldo del usuario después del abono


# ──────────────────────────────────────────────────────────────────────────────
# Helper: cargar FacturaConsolidada con pagado calculado
# ──────────────────────────────────────────────────────────────────────────────

async def _cargar_factura_dto(
    db: AsyncSession, factura: ConsolidatedInvoice
) -> FacturaConsolidadaDTO:
    """Recarga la factura con sus órdenes y calcula el total pagado."""
    res = await db.execute(
        select(ConsolidatedInvoice)
        .options(
            joinedload(ConsolidatedInvoice.orders),
            joinedload(ConsolidatedInvoice.user),
        )
        .where(ConsolidatedInvoice.id == factura.id)
    )
    fac_full = res.unique().scalars().first()

    res_pagado = await db.execute(
        select(func.sum(OrderPayment.amount)).where(
            OrderPayment.consolidated_invoice_id == factura.id
        )
    )
    pagado = res_pagado.scalar() or 0.0
    return FacturaConsolidadaDTO.from_orm(fac_full, pagado)


# ──────────────────────────────────────────────────────────────────────────────
# Servicio B2B
# ──────────────────────────────────────────────────────────────────────────────

async def crear_orden_b2b(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    servicios_data: list[dict],
    items_description: str,
    state_payment: str,
    payment_method: str,
    discount_value: float,
    abono: float,
    state_state: str,
) -> "OrdenDTO | str":
    """
    Crea una orden B2B con identificación automática de servicios de agencia.
    """
    from app.models import OrderDetail, SpentBusiness, Service
    from app.services.facturacion_b2c_service import BOGOTA_TZ
    from datetime import timedelta
    from sqlalchemy.exc import IntegrityError

    stmt_u = select(LaundryUser).where(LaundryUser.user_id == user_id)
    if tenant_id is not None:
        stmt_u = stmt_u.where(LaundryUser.tenant_id == tenant_id)
        
    res_user = await db.execute(stmt_u)
    usuario = res_user.scalars().first()
    if not usuario:
        return f"Institución ID {user_id} no encontrada en este tenant."

    try:
        nombre_usuario = usuario.user_name

        # PASO 1: identificar servicios de agencia automáticamente
        total_spent_per_order = 0.0
        servicios = [dict(s) for s in servicios_data]

        for s in servicios:
            svc_id = s.get("id")
            svc_name = s.get("name")
            
            stmt_svc = select(Service).where(Service.tenant_id == tenant_id)
            if svc_id:
                stmt_svc = stmt_svc.where(Service.service_id == svc_id)
            else:
                stmt_svc = stmt_svc.where(Service.service_name == svc_name)
                
            res_svc = await db.execute(stmt_svc)
            svc_obj = res_svc.scalars().first()
            
            if svc_obj and (svc_obj.spent_per_service or 0) > 0:
                cost = float(svc_obj.spent_per_service) * s.get("qty", 1)
                s["spent_per_service"] = cost
                s["is_agency"] = True
                total_spent_per_order += cost
            else:
                s["spent_per_service"] = 0.0
                s["is_agency"] = False

        # PASO 2: calcular totales
        subtotal    = sum(s["value"] * s["qty"] for s in servicios)
        order_value = round(subtotal - discount_value, 2)
        net_income  = round(order_value - total_spent_per_order, 2)

        if state_payment == "Pagada":
            restante = 0.0
        else:
            restante = max(0.0, round(order_value - abono, 2))

        now_bogota = datetime.now(BOGOTA_TZ).replace(tzinfo=None)

        # PASO 3: crear OrderHeader con is_institute=True
        orden = OrderHeader(
            tenant_id         = tenant_id,
            user_id           = user_id,
            user_name         = nombre_usuario,
            date              = now_bogota,
            order_status      = state_state,
            is_paid           = (state_payment == "Pagada"),
            subtotal          = subtotal,
            discount          = discount_value,
            total_amount      = order_value,
            balance_due       = restante,
            items_description = items_description or None,
            spent_per_order   = total_spent_per_order,
            agency_cost       = total_spent_per_order,
            net_income_value  = net_income,
            is_institute      = True,   # B2B siempre True
        )
        db.add(orden)
        await db.flush()  # obtener orden.id

        # PASO 4: crear OrderDetail por cada servicio
        for s in servicios:
            agency_done = (now_bogota + timedelta(days=7)).date() if s.get("is_agency") else None
            detalle = OrderDetail(
                tenant_id        = tenant_id,
                order_id         = orden.id,
                user_id          = user_id,
                user_name        = nombre_usuario,
                service_name     = s["name"],
                quantity         = s["qty"],
                unit_price       = s["value"],
                total_item_price = s["value"] * s["qty"],
                is_agency        = s.get("is_agency", False),
                agency_done_date = agency_done,
                spent_per_order  = s["spent_per_service"],
                description      = s.get("description"),
            )
            db.add(detalle)

        # PASO 5: crear OrderPayment si hay abono o pago total
        if abono > 0 or state_payment == "Pagada":
            monto_pago = order_value if state_payment == "Pagada" else abono
            pago = OrderPayment(
                tenant_id      = tenant_id,
                order_id       = orden.id,
                user_id        = user_id,
                user_name      = nombre_usuario,
                payment_method = payment_method or "N/A",
                amount         = monto_pago,
            )
            db.add(pago)

        # PASO 6: gasto de agencia automático
        for s in servicios:
            if s.get("is_agency"):
                svc_name = s.get("name", "Servicio")
                # Truncar nombre_usuario para evitar exceder 100 caracteres en spent_general_name
                nombre_gasto = f"Orden #{orden.id} - {svc_name} (Agencia)"[:100]
                
                gasto_agencia = SpentBusiness(
                    tenant_id            = tenant_id,
                    spent_date           = now_bogota,
                    spent_category       = "Agencia",
                    spent_general_name   = nombre_gasto,
                    spent_payment_method = "Nequi",
                    spent_value          = s["spent_per_service"],
                    description          = f"Costo automático para {svc_name} en orden #{orden.id} - Cliente: {nombre_usuario}"
                )
                db.add(gasto_agencia)

        # PASO 7 (B2B exclusivo): si Pagada → crear ConsolidatedInvoice automática
        if state_payment == "Pagada":
            factura_auto = ConsolidatedInvoice(
                tenant_id    = tenant_id,
                user_id      = user_id,
                total_amount = order_value,
                is_paid      = True,
                notes        = f"Pago inmediato – Orden #{orden.id}",
            )
            db.add(factura_auto)
            await db.flush()
            orden.consolidated_invoice_id = factura_auto.id

        await db.commit()
        await db.refresh(orden)

        # Construir DTO
        user_map    = {usuario.user_id: usuario.user_name}
        contact_map = {usuario.user_id: usuario.user_contact or "—"}

        from sqlalchemy.orm import selectinload
        res_orden = await db.execute(
            select(OrderHeader)
            .options(selectinload(OrderHeader.details), selectinload(OrderHeader.payments))
            .where(OrderHeader.id == orden.id)
        )
        orden_full = res_orden.unique().scalars().first()
        return OrdenDTO.from_orm(orden_full, user_map, contact_map)

    except IntegrityError as exc:
        await db.rollback()
        return f"Error de integridad al crear la orden B2B: {exc}"
    except Exception as exc:
        await db.rollback()
        import traceback
        error_details = traceback.format_exc()
        return f"Error inesperado al crear orden B2B: {exc}\n{error_details}"


async def listar_ordenes_b2b(
    db: AsyncSession,
    tenant_id: int,
    filtros: FiltrosOrden,
    limit: int = 50,
    offset: int = 0,
) -> list[OrdenDTO]:
    """Lista órdenes B2B (is_institute=True) con filtros, paginación y eager load."""
    stmt = (
        select(OrderHeader)
        .options(
            joinedload(OrderHeader.payments),
            joinedload(OrderHeader.details),
        )
        .order_by(OrderHeader.date.desc())
        .limit(limit)
        .offset(offset)
    )
    # Aplicar filtros base B2B (tenant + is_institute=True)
    if tenant_id is not None:
        stmt = stmt.where(OrderHeader.tenant_id == tenant_id)
        
    stmt = stmt.where(
        OrderHeader.is_institute == True,  # noqa: E712
    )
    if filtros.estado_pago and filtros.estado_pago != "Todos":
        is_paid_val = filtros.estado_pago == "Pagada"
        stmt = stmt.where(OrderHeader.is_paid == is_paid_val)
    if filtros.estado_orden and filtros.estado_orden != "Todos":
        stmt = stmt.where(OrderHeader.order_status == filtros.estado_orden)
    if filtros.fecha_inicio:
        stmt = stmt.where(func.date(OrderHeader.date) >= filtros.fecha_inicio.isoformat())
    if filtros.fecha_fin:
        stmt = stmt.where(func.date(OrderHeader.date) <= filtros.fecha_fin.isoformat())
    if filtros.cliente_nombre:
        stmt = stmt.join(LaundryUser, OrderHeader.user_id == LaundryUser.user_id).where(
            LaundryUser.user_name.ilike(f"%{filtros.cliente_nombre}%")
        )
    if filtros.user_id:
        stmt = stmt.where(OrderHeader.user_id == filtros.user_id)

    result = await db.execute(stmt)
    ordenes = result.unique().scalars().all()

    user_ids = {o.user_id for o in ordenes}
    if user_ids:
        res_u = await db.execute(
            select(LaundryUser).where(LaundryUser.user_id.in_(user_ids))
        )
        usuarios = res_u.scalars().all()
        name_map    = {u.user_id: u.user_name          for u in usuarios}
        contact_map = {u.user_id: u.user_contact or "—" for u in usuarios}
    else:
        name_map, contact_map = {}, {}

    return [OrdenDTO.from_orm(o, name_map, contact_map) for o in ordenes]


async def contar_ordenes_b2b(
    db: AsyncSession,
    tenant_id: int,
    filtros: FiltrosOrden,
) -> int:
    """Cuenta órdenes B2B con filtros aplicados."""
    stmt = select(func.count(OrderHeader.id)).where(
        OrderHeader.is_institute == True,  # noqa: E712
    )
    if tenant_id is not None:
        stmt = stmt.where(OrderHeader.tenant_id == tenant_id)
    if filtros.estado_pago and filtros.estado_pago != "Todos":
        stmt = stmt.where(OrderHeader.is_paid == (filtros.estado_pago == "Pagada"))
    if filtros.estado_orden and filtros.estado_orden != "Todos":
        stmt = stmt.where(OrderHeader.order_status == filtros.estado_orden)
    if filtros.fecha_inicio:
        stmt = stmt.where(func.date(OrderHeader.date) >= filtros.fecha_inicio.isoformat())
    if filtros.fecha_fin:
        stmt = stmt.where(func.date(OrderHeader.date) <= filtros.fecha_fin.isoformat())
    if filtros.cliente_nombre:
        stmt = stmt.join(LaundryUser, OrderHeader.user_id == LaundryUser.user_id).where(
            LaundryUser.user_name.ilike(f"%{filtros.cliente_nombre}%")
        )
    if filtros.user_id:
        stmt = stmt.where(OrderHeader.user_id == filtros.user_id)
    result = await db.execute(stmt)
    return result.scalar() or 0


async def generar_factura_consolidada(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    order_ids: list[int],
    notes: Optional[str] = None,
) -> "FacturaConsolidadaDTO | str":
    """
    Agrupa múltiples órdenes B2B de una institución en una ConsolidatedInvoice.
    Solo agrupa órdenes: is_institute=True, is_paid=False, consolidated_invoice_id IS NULL.
    """
    # Verificar que el usuario pertenece al tenant
    stmt_u = select(LaundryUser).where(LaundryUser.user_id == user_id)
    if tenant_id is not None:
        stmt_u = stmt_u.where(LaundryUser.tenant_id == tenant_id)
        
    res_user = await db.execute(stmt_u)
    if not res_user.scalars().first():
        return f"Institución ID {user_id} no encontrada en este tenant."

    stmt_ord = select(OrderHeader).where(
        OrderHeader.user_id == user_id,
        OrderHeader.id.in_(order_ids),
        OrderHeader.is_paid == False,               # noqa: E712
        OrderHeader.consolidated_invoice_id == None, # noqa: E711
        OrderHeader.is_institute == True,           # noqa: E712
    )
    if tenant_id is not None:
        stmt_ord = stmt_ord.where(OrderHeader.tenant_id == tenant_id)
        
    res_ord = await db.execute(stmt_ord)
    ordenes = res_ord.scalars().all()

    if not ordenes:
        return "No se encontraron órdenes B2B válidas para consolidar (quizás ya están pagadas, consolidadas o no son de esta institución)."

    total_due = sum(float(o.balance_due) for o in ordenes)

    factura = ConsolidatedInvoice(
        tenant_id    = tenant_id,
        user_id      = user_id,
        total_amount = total_due,
        is_paid      = False,
        notes        = notes,
    )
    db.add(factura)
    await db.flush()  # obtener factura.id

    for orden in ordenes:
        orden.consolidated_invoice_id = factura.id

    await db.commit()
    return await _cargar_factura_dto(db, factura)


async def listar_facturas_consolidadas(
    db: AsyncSession,
    tenant_id: int,
    user_id: Optional[int] = None,
    solo_pendientes: bool = False,
    limit: int = 100,
    offset: int = 0,
) -> list[FacturaConsolidadaDTO]:
    """
    Lista facturas consolidadas del tenant.
    Filtra opcionalmente por usuario y/o solo las pendientes.
    Incluye suma de pagos realizados para calcular balance real.
    """
    stmt = (
        select(ConsolidatedInvoice)
        .options(
            joinedload(ConsolidatedInvoice.orders),
            joinedload(ConsolidatedInvoice.user),
        )
        .order_by(ConsolidatedInvoice.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    if tenant_id is not None:
        stmt = stmt.where(ConsolidatedInvoice.tenant_id == tenant_id)
    if user_id is not None:
        stmt = stmt.where(ConsolidatedInvoice.user_id == user_id)
    if solo_pendientes:
        stmt = stmt.where(ConsolidatedInvoice.is_paid == False)  # noqa: E712

    result = await db.execute(stmt)
    facturas = result.unique().scalars().all()

    # Calcular pagado por factura en una sola query agregada
    invoice_ids = [f.id for f in facturas]
    pagado_map: dict[int, float] = {}
    if invoice_ids:
        res_pag = await db.execute(
            select(
                OrderPayment.consolidated_invoice_id,
                func.sum(OrderPayment.amount).label("total_pagado"),
            )
            .where(OrderPayment.consolidated_invoice_id.in_(invoice_ids))
            .group_by(OrderPayment.consolidated_invoice_id)
        )
        for row in res_pag.all():
            pagado_map[row.consolidated_invoice_id] = float(row.total_pagado or 0)

    return [
        FacturaConsolidadaDTO.from_orm(f, pagado_map.get(f.id, 0.0))
        for f in facturas
    ]


async def registrar_pago_institucional(
    db: AsyncSession,
    tenant_id: int,
    consolidated_id: int,
    monto: float,
    metodo_pago: str,
) -> "FacturaConsolidadaDTO | str":
    """
    Registra un pago sobre una factura consolidada.
    Lógica: Saldo a Favor → descuenta del usuario.
             FIFO: distribuye el pago a órdenes hijas.
             Si excede la deuda → excedente va a saldo_a_favor.
    """
    try:
        stmt_fac = select(ConsolidatedInvoice).where(
            ConsolidatedInvoice.id == consolidated_id,
        )
        if tenant_id is not None:
            stmt_fac = stmt_fac.where(ConsolidatedInvoice.tenant_id == tenant_id)
            
        res_fac = await db.execute(stmt_fac)
        factura = res_fac.scalars().first()
        if not factura:
            return f"Factura consolidada #{consolidated_id} no encontrada en este tenant."

        res_usr = await db.execute(
            select(LaundryUser).where(LaundryUser.user_id == factura.user_id)
        )
        usuario = res_usr.scalars().first()
        nombre_usuario = usuario.user_name if usuario else f"ID {factura.user_id}"

        # Si paga con Saldo a Favor, limitar al saldo disponible
        if metodo_pago == "Saldo a Favor":
            monto = min(monto, float(usuario.saldo_a_favor))
            if monto <= 0:
                return "El usuario no tiene Saldo a Favor suficiente."
            usuario.saldo_a_favor -= monto

        # Calcular deuda real restante
        res_prev = await db.execute(
            select(func.sum(OrderPayment.amount)).where(
                OrderPayment.consolidated_invoice_id == factura.id
            )
        )
        pagos_previos = float(res_prev.scalar() or 0.0)
        deuda_actual = float(factura.total_amount) - pagos_previos

        if deuda_actual <= 0:
            # Factura ya pagada: si no es Saldo a Favor, devolver a saldo
            if metodo_pago != "Saldo a Favor":
                usuario.saldo_a_favor += monto
            else:
                # Devolver lo que se dedujo
                usuario.saldo_a_favor += monto
            await db.commit()
            return await _cargar_factura_dto(db, factura)

        pago_factura = monto
        if monto > deuda_actual:
            pago_factura = deuda_actual
            excedente = monto - deuda_actual
            if metodo_pago == "Saldo a Favor":
                usuario.saldo_a_favor += excedente
            else:
                usuario.saldo_a_favor += excedente

        if pago_factura > 0:
            pago = OrderPayment(
                tenant_id               = tenant_id,
                consolidated_invoice_id = factura.id,
                user_id                 = factura.user_id,
                user_name               = nombre_usuario,
                payment_method          = metodo_pago,
                amount                  = pago_factura,
            )
            db.add(pago)

        # Distribuir FIFO a órdenes hijas con balance_due > 0
        res_ord = await db.execute(
            select(OrderHeader)
            .where(
                OrderHeader.consolidated_invoice_id == factura.id,
                OrderHeader.is_paid == False,  # noqa: E712
            )
            .order_by(OrderHeader.date.asc())
        )
        ordenes = res_ord.scalars().all()

        monto_a_distribuir = pago_factura
        for orden in ordenes:
            if monto_a_distribuir <= 0.01:
                break
            a_cobrar = min(float(orden.balance_due), monto_a_distribuir)
            orden.balance_due = round(float(orden.balance_due) - a_cobrar, 2)
            monto_a_distribuir -= a_cobrar
            if orden.balance_due <= 0.01:
                orden.is_paid = True
                orden.balance_due = 0.0

        # Marcar factura como pagada si el total de pagos la finiquita
        pagos_totales = pagos_previos + pago_factura
        if pagos_totales >= float(factura.total_amount) - 0.01:
            factura.is_paid = True

        await db.commit()
        return await _cargar_factura_dto(db, factura)

    except Exception as exc:
        await db.rollback()
        return f"Error al registrar pago institucional: {exc}"


async def registrar_abono_institucional(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    amount: float,
    payment_method: str,
    notes: Optional[str] = None,
) -> "AbonoDTO | str":
    """
    Registra un abono libre para una institución.
    ATÓMICA en una sola transacción:
      1. Crea AbonoInstitucional e incrementa saldo_a_favor.
      2. Amortiza FIFO sobre ConsolidatedInvoices pendientes.
      3. Si queda saldo: amortiza órdenes B2B individuales sin consolidar y
         las auto-agrupa en una nueva ConsolidatedInvoice.
    """
    try:
        stmt_u = select(LaundryUser).where(LaundryUser.user_id == user_id)
        if tenant_id is not None:
            stmt_u = stmt_u.where(LaundryUser.tenant_id == tenant_id)
            
        res_user = await db.execute(stmt_u)
        usuario = res_user.scalars().first()
        if not usuario:
            return f"Institución ID {user_id} no encontrada en este tenant."

        # ── PASO 1: Crear AbonoInstitucional e incrementar saldo_a_favor ─────
        abono = AbonoInstitucional(
            tenant_id      = tenant_id,
            user_id        = user_id,
            amount         = amount,
            payment_method = payment_method,
            notes          = notes,
        )
        usuario.saldo_a_favor = float(usuario.saldo_a_favor) + amount
        db.add(abono)

        # ── PASO 2: Amortizar Facturas Consolidadas pendientes (FIFO) ─────────
        stmt_fac = (
            select(ConsolidatedInvoice)
            .where(
                ConsolidatedInvoice.user_id == user_id,
                ConsolidatedInvoice.is_paid == False,  # noqa: E712
            )
            .order_by(ConsolidatedInvoice.created_at.asc())
        )
        if tenant_id is not None:
            stmt_fac = stmt_fac.where(ConsolidatedInvoice.tenant_id == tenant_id)
            
        res_fac = await db.execute(stmt_fac)
        facturas_pendientes = res_fac.scalars().all()

        for fac in facturas_pendientes:
            if float(usuario.saldo_a_favor) <= 0:
                break

            # Calcular cuánto falta realmente (considerando pagos parciales)
            res_pagado = await db.execute(
                select(func.sum(OrderPayment.amount)).where(
                    OrderPayment.consolidated_invoice_id == fac.id
                )
            )
            pagado_en_factura = float(res_pagado.scalar() or 0.0)
            falta_por_pagar = float(fac.total_amount) - pagado_en_factura

            if falta_por_pagar <= 0:
                fac.is_paid = True
                continue

            a_cobrar = min(falta_por_pagar, float(usuario.saldo_a_favor))

            new_payment = OrderPayment(
                tenant_id               = tenant_id,
                consolidated_invoice_id = fac.id,
                user_id                 = user_id,
                user_name               = usuario.user_name,
                payment_method          = "Billetera Automática (Abono)",
                amount                  = a_cobrar,
            )
            db.add(new_payment)
            usuario.saldo_a_favor = round(float(usuario.saldo_a_favor) - a_cobrar, 2)
            pagado_en_factura += a_cobrar

            if pagado_en_factura >= float(fac.total_amount):
                fac.is_paid = True
                # Limpiar balance_due de órdenes hijas
                res_hijas = await db.execute(
                    select(OrderHeader).where(
                        OrderHeader.consolidated_invoice_id == fac.id
                    )
                )
                for hija in res_hijas.scalars().all():
                    hija.balance_due = 0.0
                    hija.is_paid = True

        # ── PASO 3: Amortizar Órdenes B2B individuales no consolidadas (FIFO) ─
        if float(usuario.saldo_a_favor) > 0.01:
            stmt_ord = (
                select(OrderHeader)
                .where(
                    OrderHeader.user_id == user_id,
                    OrderHeader.is_institute == True,            # noqa: E712
                    OrderHeader.is_paid == False,                # noqa: E712
                    OrderHeader.balance_due > 0,
                    OrderHeader.consolidated_invoice_id == None,  # noqa: E711
                )
                .order_by(OrderHeader.date.asc())
            )
            if tenant_id is not None:
                stmt_ord = stmt_ord.where(OrderHeader.tenant_id == tenant_id)
                
            res_ord = await db.execute(stmt_ord)
            ordenes_pendientes = res_ord.scalars().all()

            ordenes_afectadas = []
            saldo_usado_en_ordenes = 0.0

            for ordn in ordenes_pendientes:
                if float(usuario.saldo_a_favor) <= 0.01:
                    break
                a_cobrar = min(float(ordn.balance_due), float(usuario.saldo_a_favor))
                ordn.balance_due = round(float(ordn.balance_due) - a_cobrar, 2)
                usuario.saldo_a_favor = round(float(usuario.saldo_a_favor) - a_cobrar, 2)
                saldo_usado_en_ordenes += a_cobrar
                if ordn.balance_due <= 0.01:
                    ordn.is_paid = True
                    ordn.balance_due = 0.0
                ordenes_afectadas.append(ordn)

            # Si afectamos alguna orden individual: auto-agrupar en nueva factura
            if ordenes_afectadas:
                total_factura = sum(float(o.total_amount) for o in ordenes_afectadas)
                nueva_factura = ConsolidatedInvoice(
                    tenant_id    = tenant_id,
                    user_id      = user_id,
                    total_amount = total_factura,
                    is_paid      = all(o.is_paid for o in ordenes_afectadas),
                    notes        = "Auto-agrupadas por Abono Automático en Billetera",
                )
                db.add(nueva_factura)
                await db.flush()

                for o in ordenes_afectadas:
                    o.consolidated_invoice_id = nueva_factura.id

                # Registrar el pago correspondiente a la nueva factura
                pago_auto = OrderPayment(
                    tenant_id               = tenant_id,
                    consolidated_invoice_id = nueva_factura.id,
                    user_id                 = user_id,
                    user_name               = usuario.user_name,
                    payment_method          = "Billetera Automática (Abono)",
                    amount                  = saldo_usado_en_ordenes,
                )
                db.add(pago_auto)

        await db.flush()
        await db.commit()
        await db.refresh(abono)
        await db.refresh(usuario)

        return AbonoDTO(
            abono_id                 = abono.id,
            user_id                  = user_id,
            amount                   = amount,
            payment_method           = payment_method,
            notes                    = notes,
            created_at               = abono.created_at,
            saldo_a_favor_resultante = float(usuario.saldo_a_favor),
        )

    except Exception as exc:
        await db.rollback()
        return f"Error al registrar abono institucional: {exc}"
