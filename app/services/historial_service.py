from datetime import date
from typing import Optional, List
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import OrderHeader, LaundryUser
from sqlalchemy.orm import joinedload, selectinload
from app.schemas import OrderHistorialItem, OrderHistorialResponse, OrderStatsResponse

def _derivar_estado_pago(order_status: str, is_paid: bool, balance_due: float, total_amount: float) -> str:
    if order_status == 'Cancelada':
        return 'Cancelada'
    if is_paid and balance_due <= 0:
        return 'Pagada'
    if not is_paid and balance_due >= total_amount:
        return 'Debe'
    if not is_paid and 0 < balance_due < total_amount:
        return 'Abono parcial'
    return 'Debe' # Default if anything else

async def obtener_historial(
    db: AsyncSession,
    tenant_id: int,
    page: int = 1,
    limit: int = 15,
    estado_pago: Optional[str] = None,
    estado_orden: Optional[str] = None,
    cliente: Optional[str] = None,
    desde: Optional[date] = None,
    hasta: Optional[date] = None,
    is_institute: Optional[bool] = None,
    sort_field: str = "id",
    sort_direction: str = "desc"
) -> OrderHistorialResponse:
    
    # Base query with eager loads
    stmt = select(OrderHeader).options(
        joinedload(OrderHeader.buyer), 
        selectinload(OrderHeader.payments)
    )
    
    # Outer join with LaundryUser to allow filtering by contact
    stmt = stmt.join(LaundryUser, OrderHeader.user_id == LaundryUser.user_id, isouter=True)

    if tenant_id is not None:
        stmt = stmt.where(OrderHeader.tenant_id == tenant_id)
    
    if estado_orden:
        stmt = stmt.where(OrderHeader.order_status == estado_orden)
    
    if is_institute is not None:
        stmt = stmt.where(OrderHeader.is_institute == is_institute)
        
    if desde:
        stmt = stmt.where(func.date(OrderHeader.date) >= desde)
    if hasta:
        stmt = stmt.where(func.date(OrderHeader.date) <= hasta)
        
    if cliente:
        # Search by order_id (numeric), user_name, items_description, received_by_name OR user_contact
        term = cliente.strip().lstrip('#')
        
        # Base conditions: text fields
        conditions = [
            OrderHeader.user_name.ilike(f"%{term}%"),
            OrderHeader.items_description.ilike(f"%{term}%"),
            OrderHeader.received_by_name.ilike(f"%{term}%"),
            OrderHeader.order_status.ilike(f"%{term}%"),
            LaundryUser.user_contact.ilike(f"%{term}%")
        ]
        
        # Try numeric ID search
        if term.isdigit():
            conditions.append(OrderHeader.id == int(term))
            
        stmt = stmt.where(or_(*conditions))

    # Nota: estado_pago es un filtro complejo porque es derivado.
    if estado_pago:
        ep = estado_pago.upper()
        if ep == "CANCELADA":
            stmt = stmt.where(OrderHeader.order_status == "Cancelada")
        elif ep == "PAGADA":
            stmt = stmt.where(OrderHeader.order_status != "Cancelada", OrderHeader.is_paid == True, OrderHeader.balance_due <= 0)
        elif ep == "DEBE":
            stmt = stmt.where(OrderHeader.order_status != "Cancelada", OrderHeader.is_paid == False, OrderHeader.balance_due >= OrderHeader.total_amount)
        elif ep == "ABONO PARCIAL":
            stmt = stmt.where(OrderHeader.order_status != "Cancelada", OrderHeader.is_paid == False, OrderHeader.balance_due > 0, OrderHeader.balance_due < OrderHeader.total_amount)
        elif ep == "POR_COBRAR":
            stmt = stmt.where(OrderHeader.order_status != "Cancelada", OrderHeader.is_paid == False, OrderHeader.balance_due > 0)

    # Count total
    count_stmt = select(func.count(OrderHeader.id)).select_from(stmt.subquery())
    total_res = await db.execute(count_stmt)
    total = total_res.scalar() or 0
    
    # Paginate and Sort
    offset = (page - 1) * limit
    
    # Mapping fields for sorting
    sort_attr = getattr(OrderHeader, sort_field, OrderHeader.id)
    if sort_direction == "desc":
        stmt = stmt.order_by(sort_attr.desc())
    else:
        stmt = stmt.order_by(sort_attr.asc())
        
    stmt = stmt.limit(limit).offset(offset)
    
    result = await db.execute(stmt)
    ordenes = result.scalars().unique().all()
    
    from app.services.facturacion_b2c_service import BOGOTA_TZ
    from datetime import datetime
    now_bogota = datetime.now(BOGOTA_TZ).replace(tzinfo=None)

    items = []
    for o in ordenes:
        total_p = sum(p.amount for p in o.payments)
        days_diff = (now_bogota - o.date) if o.date else None
        days_p = max(0, days_diff.days) if days_diff else 0
        
        items.append(OrderHistorialItem(
            id=o.id,
            date=o.date,
            order_status=o.order_status,
            estado_pago=_derivar_estado_pago(o.order_status, o.is_paid, o.balance_due, o.total_amount),
            is_paid=o.is_paid,
            subtotal=o.subtotal,
            discount=o.discount,
            total_amount=o.total_amount,
            balance_due=o.balance_due,
            items_description=o.items_description,
            is_institute=o.is_institute,
            consolidated_invoice_id=o.consolidated_invoice_id,
            user_id=o.user_id,
            user_name=o.user_name,
            user_contact=o.buyer.user_contact if o.buyer else "—",
            days_passed=days_p,
            agency_cost=o.agency_cost or o.spent_per_order or 0.0,
            spent_per_order=o.spent_per_order or 0.0,
            total_paid=total_p,
            net_income_value=o.net_income_value or (o.total_amount - (o.agency_cost or o.spent_per_order or 0.0)),
            # Delivery info
            delivered_at=o.delivered_at,
            delivered_by=o.delivered_by,
            received_by_name=o.received_by_name,
            invoice_delivered=o.invoice_delivered,
            has_signature=bool(o.delivery_signature)
        ))
        
    total_pages = (total + limit - 1) // limit if limit > 0 else 0
    
    return OrderHistorialResponse(
        data=items,
        total=total,
        page=page,
        limit=limit,
        total_pages=total_pages
    )

async def obtener_stats_historial(
    db: AsyncSession, 
    tenant_id: int,
    estado_pago: Optional[str] = None,
    estado_orden: Optional[str] = None,
    cliente: Optional[str] = None,
    desde: Optional[date] = None,
    hasta: Optional[date] = None,
    is_institute: Optional[bool] = None
) -> OrderStatsResponse:
    # We use a common "where" clause for all stat queries to ensure consistency
    # Start with basic tenant filtering
    from app.models import LaundryUser
    
    # Base conditions
    filters = [OrderHeader.tenant_id == tenant_id]
    
    if estado_orden:
        filters.append(OrderHeader.order_status == estado_orden)
    
    if is_institute is not None:
        filters.append(OrderHeader.is_institute == is_institute)
        
    if desde:
        filters.append(func.date(OrderHeader.date) >= desde)
    if hasta:
        filters.append(func.date(OrderHeader.date) <= hasta)
        
    if cliente:
        term = cliente.strip().lstrip('#')
        # We need to join LaundryUser for contact search in stats too if we want to be 100% consistent
        # But stats usually don't need the join if we just filter by header fields.
        # To be safe and consistent with obtener_historial:
        conditions = [
            OrderHeader.user_name.ilike(f"%{term}%"),
            OrderHeader.items_description.ilike(f"%{term}%"),
            OrderHeader.received_by_name.ilike(f"%{term}%"),
            OrderHeader.order_status.ilike(f"%{term}%") # Search by status also
        ]
        if term.isdigit():
            conditions.append(OrderHeader.id == int(term))
        # Note: LaundryUser join would be needed here if we search by contact in stats.
    
    # Deriving state filters for status_pago
    if estado_pago:
        if estado_pago == "Cancelada":
            filters.append(OrderHeader.order_status == "Cancelada")
        elif estado_pago == "Pagada":
            filters.append(OrderHeader.order_status != "Cancelada")
            filters.append(OrderHeader.is_paid == True)
            filters.append(OrderHeader.balance_due <= 0)
        elif estado_pago == "Debe":
            filters.append(OrderHeader.order_status != "Cancelada")
            filters.append(OrderHeader.is_paid == False)
            filters.append(OrderHeader.balance_due >= OrderHeader.total_amount)
        elif estado_pago == "Abono parcial":
            filters.append(OrderHeader.order_status != "Cancelada")
            filters.append(OrderHeader.is_paid == False)
            filters.append(OrderHeader.balance_due > 0)
            filters.append(OrderHeader.balance_due < OrderHeader.total_amount)

    # Now define specific statements using the filtered base
    count_stmt = select(func.count(OrderHeader.id)).where(*filters)
    # total_recaudado = sum(net_income_value) as requested
    recaudado_stmt = select(func.sum(OrderHeader.net_income_value)).where(*filters)
    
    deuda_count_stmt = select(func.count(OrderHeader.id)).where(
        *filters,
        OrderHeader.balance_due > 0,
        OrderHeader.order_status != 'Cancelada'
    )
    monto_cobrar_stmt = select(func.sum(OrderHeader.balance_due)).where(
        *filters,
        OrderHeader.order_status != 'Cancelada'
    )
    gastos_agencia_stmt = select(func.sum(OrderHeader.spent_per_order)).where(
        *filters,
        OrderHeader.order_status != 'Cancelada'
    )
    utilidad_neta_stmt = select(func.sum(OrderHeader.net_income_value)).where(
        *filters,
        OrderHeader.order_status != 'Cancelada'
    )
    
    # Execute all
    res_count = await db.execute(count_stmt)
    res_recaudado = await db.execute(recaudado_stmt)
    res_deuda_count = await db.execute(deuda_count_stmt)
    res_monto_cobrar = await db.execute(monto_cobrar_stmt)
    res_gastos_agencia = await db.execute(gastos_agencia_stmt)
    res_utilidad_neta = await db.execute(utilidad_neta_stmt)
    
    return OrderStatsResponse(
        total_ordenes=res_count.scalar() or 0,
        total_recaudado=float(res_recaudado.scalar() or 0.0),
        ordenes_debe=res_deuda_count.scalar() or 0,
        monto_por_cobrar=float(res_monto_cobrar.scalar() or 0.0),
        total_gastos_agencia=float(res_gastos_agencia.scalar() or 0.0),
        utilidad_neta=float(res_utilidad_neta.scalar() or 0.0)
    )
