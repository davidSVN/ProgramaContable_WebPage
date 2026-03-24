"""
Servicio de Facturación B2C – lógica async de negocio para órdenes de clientes particulares.
B2C = clientes físicos (no instituciones). NUNCA crea ConsolidatedInvoice.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from sqlalchemy import select, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models import (
    OrderDetail,
    OrderHeader,
    OrderPayment,
    Service,
    SpentBusiness,
    LaundryUser,
)


# ── Zona horaria de Bogotá ─────────────────────────────────────────────────────
BOGOTA_TZ = ZoneInfo("America/Bogota")


# ──────────────────────────────────────────────────────────────────────────────
# DTOs  (mantenidos idénticos al servicio Flet original)
# ──────────────────────────────────────────────────────────────────────────────

@dataclass
class ServicioDTO:
    service_id:    int
    service_name:  str
    service_value: float
    spent_per_service: float = 0.0
    user_institute: str = "Usuario"
    nombre_instituto: Optional[str] = None

    @classmethod
    def from_orm(cls, s) -> "ServicioDTO":
        return cls(
            service_id        = s.service_id,
            service_name      = s.service_name,
            service_value     = float(s.service_value),
            spent_per_service = float(s.spent_per_service or 0),
            user_institute    = s.user_institute,
            nombre_instituto  = s.nombre_instituto,
        )


@dataclass
class OrdenDTO:
    order_id:          int
    order_number:      Optional[int]
    user_id:           int
    user_name:         str
    user_contact:      str
    state_payment:     str
    state_state:       str
    order_value:       float
    payment_method:    Optional[str]
    restante:          float
    abono:             float
    created_at:        datetime
    days_open:         int
    agency:            Optional[str]
    agency_done_date:  Optional[date]
    spent_per_order:   float
    net_income_value:  float
    discount_value:    float
    items_description: Optional[str]
    is_institute:      bool
    consolidated_invoice_id: Optional[int]

    @classmethod
    def from_orm(cls, o, user_map: dict[int, str], contact_map: dict[int, str]) -> "OrdenDTO":
        if o.order_status != "Terminada":
            _days = (datetime.now(timezone.utc).date() - o.date.date()).days
            days_open = max(0, _days)
        else:
            days_open = 0

        abono_calc = float(o.total_amount) - float(o.balance_due)

        # Último método de pago registrado
        last_pm = None
        if o.payments:
            last_pm = o.payments[-1].payment_method

        # Determinar si hay al menos un detalle de agencia
        agency_str = None
        agency_done = None
        if hasattr(o, "details") and o.details:
            if any(d.is_agency for d in o.details):
                agency_str = "Agencia"
                agency_done_raw = next((d.agency_done_date for d in o.details if d.is_agency), None)
                agency_done = agency_done_raw.date() if isinstance(agency_done_raw, datetime) else agency_done_raw
            else:
                agency_str = "Local"

        return cls(
            order_id          = o.id,
            order_number      = o.order_number,
            user_id           = o.user_id,
            user_name         = user_map.get(o.user_id, o.user_name or f"ID {o.user_id}"),
            user_contact      = contact_map.get(o.user_id, "—"),
            state_payment     = "Pagada" if o.is_paid else "Debe",
            state_state       = o.order_status,
            order_value       = float(o.total_amount),
            payment_method    = last_pm,
            restante          = float(o.balance_due),
            abono             = float(abono_calc),
            created_at        = o.date,
            days_open         = days_open,
            agency            = agency_str,
            agency_done_date  = agency_done,
            spent_per_order   = float(o.spent_per_order or 0),
            net_income_value  = float(o.net_income_value or o.total_amount),
            discount_value    = float(o.discount or 0),
            items_description = o.items_description,
            is_institute      = bool(getattr(o, "is_institute", False)),
            consolidated_invoice_id = getattr(o, "consolidated_invoice_id", None),
        )


# ──────────────────────────────────────────────────────────────────────────────
# Filtros tipados
# ──────────────────────────────────────────────────────────────────────────────

@dataclass
class FiltrosOrden:
    estado_pago:    str = "Todos"
    estado_orden:   str = "Todos"
    cliente_nombre: str = ""
    fecha_inicio:   Optional[date] = None
    fecha_fin:      Optional[date] = None
    user_id:        Optional[int] = None


# ──────────────────────────────────────────────────────────────────────────────
# Helpers internos de query
# ──────────────────────────────────────────────────────────────────────────────

def _aplicar_filtros_ordenes(stmt, tenant_id: int, filtros: FiltrosOrden):
    """Aplica filtros comunes a un SELECT sobre OrderHeader."""
    if tenant_id is not None:
        stmt = stmt.where(OrderHeader.tenant_id == tenant_id)
        
    stmt = stmt.where(
        OrderHeader.is_institute == False,  # noqa: E712  — B2C nunca es instituto
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
    return stmt


# ──────────────────────────────────────────────────────────────────────────────
# Funciones del servicio
# ──────────────────────────────────────────────────────────────────────────────

async def listar_servicios_disponibles(
    db: AsyncSession, tenant_id: int, institucion: Optional[str] = None
) -> list[ServicioDTO]:
    """Lista servicios B2C del tenant o filtros por institución específica."""
    if not institucion:
        # Comportamiento original: solo B2C/Usuario (uso ilike para robustez)
        stmt = select(Service).where(
            Service.user_institute.ilike("usuario"),
        )
    else:
        # Si hay institución: filtrar por instituto y nombre específico
        stmt = select(Service).where(
            Service.user_institute.ilike("instituto"),
            func.unaccent(Service.nombre_instituto).ilike(func.unaccent(institucion)),
        )

    if tenant_id is not None:
        stmt = stmt.where(Service.tenant_id == tenant_id)
    
    stmt = stmt.order_by(Service.service_name)
    result = await db.execute(stmt)
    servicios = result.scalars().all()
    return [ServicioDTO.from_orm(s) for s in servicios]


async def buscar_clientes(
    db: AsyncSession, tenant_id: int, query: str, limit: int = 13
) -> list[tuple[int, str]]:
    """Busca clientes B2C del tenant por nombre o contacto."""
    stmt = (
        select(LaundryUser)
        .where(
            LaundryUser.user_institute.ilike("usuario"),
            or_(
                func.unaccent(LaundryUser.user_name).ilike(func.unaccent(f"%{query}%")),
                func.unaccent(LaundryUser.user_contact).ilike(func.unaccent(f"%{query}%")),
            ),
        )
    )
    if tenant_id is not None:
        stmt = stmt.where(LaundryUser.tenant_id == tenant_id)
    
    stmt = stmt.order_by(LaundryUser.user_name.asc()).limit(limit)
    result = await db.execute(stmt)
    usuarios = result.scalars().all()
    return [(u.user_id, u.user_name) for u in usuarios]


async def crear_orden(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    servicios_data: list[dict],   # [{id, name, qty, value, is_agency}, ...]
    items_description: str,
    state_payment: str,
    pagos: list[dict],            # [{"monto": float, "metodo_pago": str}, ...]
    discount_value: float,
    state_state: str,
) -> "OrdenDTO | str":
    """
    Crea una nueva orden B2C. Devuelve OrdenDTO o str con mensaje de error.
    NUNCA crea ConsolidatedInvoice (eso es exclusivo B2B).
    """
    try:
        stmt_u = select(LaundryUser).where(LaundryUser.user_id == user_id)
        if tenant_id is not None:
            stmt_u = stmt_u.where(LaundryUser.tenant_id == tenant_id)
        
        res_user = await db.execute(stmt_u)
        cliente = res_user.scalars().first()
        if not cliente:
            return f"Cliente ID {user_id} no encontrado en este tenant."

        nombre_usuario = cliente.user_name

        # ── PASO 1: identificar servicios de agencia automáticamente ───────────
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
            
            if s.get("is_agency"):
                # Prioridad: costo del maestro de servicios en BD; el frontend no garantiza enviarlo
                frontend_cost = float(s.get("spent_per_service", 0.0))
                if svc_obj and (svc_obj.spent_per_service or 0) > 0:
                    cost = float(svc_obj.spent_per_service) * s.get("qty", 1)
                else:
                    cost = frontend_cost
                s["spent_per_service"] = cost
                s["is_agency"] = True
                total_spent_per_order += cost
            elif svc_obj and (svc_obj.spent_per_service or 0) > 0:
                # Si no viene marcado pero el maestro dice que tiene costo, lo marcamos
                cost = float(svc_obj.spent_per_service) * s.get("qty", 1)
                s["spent_per_service"] = cost
                s["is_agency"] = True
                total_spent_per_order += cost
            else:
                s["spent_per_service"] = 0.0
                s["is_agency"] = False

        # ── PASO 2: calcular totales ───────────────────────────────────────────
        subtotal      = sum(s["value"] * s["qty"] for s in servicios)
        order_value   = round(subtotal - discount_value, 2)
        net_income    = round(order_value - total_spent_per_order, 2)
        abono_total   = sum(p["monto"] for p in pagos)

        if state_payment == "Pagada":
            restante = 0.0
        else:
            restante = max(0.0, round(order_value - abono_total, 2))

        # ── PASO 3: crear OrderHeader ──────────────────────────────────────────
        max_order_query = select(func.max(OrderHeader.order_number)).where(OrderHeader.tenant_id == tenant_id)
        max_order = (await db.execute(max_order_query)).scalar() or 0
        next_order_number = max_order + 1

        now_bogota = datetime.now(BOGOTA_TZ).replace(tzinfo=None)
        
        orden = OrderHeader(
            order_number      = next_order_number,
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
            is_institute      = False,   # B2C siempre False
        )
        db.add(orden)
        await db.flush()  # obtener orden.id

        # ── PASO 4: crear OrderDetail por cada servicio ────────────────────────
        for s in servicios:
            agency_done = (now_bogota + timedelta(days=7)).date() if s.get("is_agency") else None
            detalle = OrderDetail(
                tenant_id        = tenant_id,
                order_id         = orden.id,
                order_number     = next_order_number,
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

        # ── PASO 5: crear OrderPayment(s) ─────────────────────────────────────
        if state_payment == "Pagada":
            # Un solo pago por el total completo
            metodo = pagos[0]["metodo_pago"] if pagos else "Efectivo"
            db.add(OrderPayment(
                tenant_id      = tenant_id,
                order_id       = orden.id,
                order_number   = next_order_number,
                user_id        = user_id,
                user_name      = nombre_usuario,
                payment_method = metodo,
                amount         = order_value,
            ))
        else:
            # Un OrderPayment por cada abono inicial con monto > 0
            for p in pagos:
                if p["monto"] > 0:
                    db.add(OrderPayment(
                        tenant_id      = tenant_id,
                        order_id       = orden.id,
                        order_number   = next_order_number,
                        user_id        = user_id,
                        user_name      = nombre_usuario,
                        payment_method = p["metodo_pago"],
                        amount         = p["monto"],
                    ))

        # ── PASO 6: gasto de agencia automático ───────────────────────────────
        for s in servicios:
            if s.get("is_agency"):
                svc_name = s.get("name", "Servicio")
                # Truncar para evitar DataError en spent_general_name (max 100)
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

        await db.commit()
        await db.refresh(orden)

        # Construir DTO con los datos del usuario
        user_map    = {cliente.user_id: cliente.user_name}
        contact_map = {cliente.user_id: cliente.user_contact or "—"}

        # Recargar con selectinload para evitar Cartesian Product crash
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
        return f"Error de integridad al crear la orden: {exc}"
    except Exception as exc:
        await db.rollback()
        return f"Error inesperado: {exc}"


async def contar_ordenes(
    db: AsyncSession, tenant_id: int, filtros: FiltrosOrden
) -> int:
    """Cuenta órdenes B2C con filtros aplicados."""
    stmt = select(func.count(OrderHeader.id))
    stmt = _aplicar_filtros_ordenes(stmt, tenant_id, filtros)
    result = await db.execute(stmt)
    return result.scalar() or 0


async def listar_ordenes(
    db: AsyncSession,
    tenant_id: int,
    filtros: FiltrosOrden,
    limit: int = 50,
    offset: int = 0,
) -> list[OrdenDTO]:
    """Lista órdenes B2C con filtros, paginación y eager load."""
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
    stmt = _aplicar_filtros_ordenes(stmt, tenant_id, filtros)

    result = await db.execute(stmt)
    ordenes = result.unique().scalars().all()

    # Resolver user_map y contact_map DENTRO de la sesión
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


async def registrar_pago(
    db: AsyncSession,
    tenant_id: int,
    order_id: int,
    monto: float,
    metodo_pago: str,
) -> "bool | str":
    """Registra un abono parcial a una orden B2C existente."""
    try:
        stmt_o = select(OrderHeader).where(
            OrderHeader.id == order_id,
            OrderHeader.is_institute == False,  # noqa: E712
        )
        if tenant_id is not None:
            stmt_o = stmt_o.where(OrderHeader.tenant_id == tenant_id)
            
        res = await db.execute(stmt_o)
        orden = res.scalars().first()
        if not orden:
            raise ValueError(f"Orden #{order_id} no encontrada en este tenant.")

        pago = OrderPayment(
            tenant_id      = tenant_id,
            order_id       = orden.id,
            order_number   = orden.order_number,
            user_id        = orden.user_id,
            user_name      = orden.user_name,
            payment_method = metodo_pago,
            amount         = monto,
        )
        db.add(pago)

        nueva_deuda = round(orden.balance_due - monto, 2)
        orden.balance_due = max(0.0, nueva_deuda)
        if orden.balance_due <= 0:
            orden.is_paid = True

        await db.commit()
        return True

    except ValueError as ve:
        await db.rollback()
        return str(ve)
    except Exception as exc:
        await db.rollback()
        return f"Error al registrar pago: {exc}"


async def actualizar_estado(
    db: AsyncSession,
    tenant_id: int,
    order_id: int,
    estado: str,
    estado_pago: str,
    metodo_pago: Optional[str] = None,
    monto_pago: float = 0.0,
) -> "bool | str":
    """Actualiza el estado de una orden B2C y opcionalmente registra un pago."""
    try:
        stmt_uo = select(OrderHeader).where(
            OrderHeader.id == order_id,
            OrderHeader.is_institute == False,  # noqa: E712
        )
        if tenant_id is not None:
            stmt_uo = stmt_uo.where(OrderHeader.tenant_id == tenant_id)
        
        res = await db.execute(stmt_uo)
        orden = res.scalars().first()
        if not orden:
            return f"Orden #{order_id} no encontrada en este tenant."

        # Registrar pago si hay monto
        if monto_pago > 0 and metodo_pago:
            resultado_pago = await registrar_pago(db, tenant_id, order_id, monto_pago, metodo_pago)
            if isinstance(resultado_pago, str):
                return resultado_pago
            # Recargar la orden para obtener balance_due actualizado
            await db.refresh(orden)

        # Actualizar estado
        orden.order_status = estado

        # Regla is_paid
        if orden.balance_due <= 0 or estado == "Terminada" or estado_pago == "Pagada":
            orden.is_paid = True
            if estado == "Terminada" or estado_pago == "Pagada":
                orden.balance_due = 0.0
        else:
            orden.is_paid = False

        await db.commit()
        return True

    except Exception as exc:
        await db.rollback()
        return f"Error al actualizar orden: {exc}"


async def obtener_detalle_orden(
    db: AsyncSession, tenant_id: int, order_id: int
) -> "list[dict] | str":
    """Devuelve los ítems de detalle de una orden B2C."""
    stmt_do = select(OrderHeader).where(
        OrderHeader.id == order_id,
    )
    if tenant_id is not None:
        stmt_do = stmt_do.where(OrderHeader.tenant_id == tenant_id)
        
    res = await db.execute(stmt_do)
    orden = res.scalars().first()
    if not orden:
        return f"Orden #{order_id} no encontrada en este tenant."

    res_det = await db.execute(
        select(OrderDetail).where(OrderDetail.order_id == order_id)
    )
    detalles = res_det.scalars().all()

    return [
        {
            "name":      d.service_name,
            "qty":       d.quantity,
            "value":     d.unit_price,
            "is_agency": d.is_agency,
            "description": d.description,
        }
        for d in detalles
    ]


async def eliminar_orden(
    db: AsyncSession, tenant_id: int, order_id: int
) -> "bool | str":
    """Elimina una orden B2C. Falla si pertenece a una factura consolidada B2B."""
    stmt_eo = select(OrderHeader).where(OrderHeader.id == order_id)
    if tenant_id is not None:
        stmt_eo = stmt_eo.where(OrderHeader.tenant_id == tenant_id)
        
    res = await db.execute(stmt_eo)
    orden = res.scalars().first()
    if not orden:
        return f"Orden #{order_id} no encontrada."

    if orden.consolidated_invoice_id is not None:
        # Lanzar HTTPException desde el router; aquí devolvemos string marcador
        return "consolidada"  # el router detecta esta palabra clave → 409

    try:
        await db.delete(orden)
        await db.commit()
        return True
    except Exception as exc:
        await db.rollback()
        return f"Error al eliminar la orden: {exc}"
