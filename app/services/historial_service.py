from datetime import date
from typing import Optional, List
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import OrderHeader, LaundryUser
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
    is_institute: Optional[bool] = None
) -> OrderHistorialResponse:
    
    stmt = select(OrderHeader)
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
        stmt = stmt.where(OrderHeader.user_name.ilike(f"%{cliente}%"))

    # Nota: estado_pago es un filtro complejo porque es derivado.
    # Si viene el filtro, aplicamos las condiciones equivalentes en SQL.
    if estado_pago:
        if estado_pago == "Cancelada":
            stmt = stmt.where(OrderHeader.order_status == "Cancelada")
        elif estado_pago == "Pagada":
            stmt = stmt.where(OrderHeader.order_status != "Cancelada", OrderHeader.is_paid == True, OrderHeader.balance_due <= 0)
        elif estado_pago == "Debe":
            stmt = stmt.where(OrderHeader.order_status != "Cancelada", OrderHeader.is_paid == False, OrderHeader.balance_due >= OrderHeader.total_amount)
        elif estado_pago == "Abono parcial":
            stmt = stmt.where(OrderHeader.order_status != "Cancelada", OrderHeader.is_paid == False, OrderHeader.balance_due > 0, OrderHeader.balance_due < OrderHeader.total_amount)

    # Count total
    count_stmt = select(func.count(OrderHeader.id)).select_from(stmt.subquery())
    total_res = await db.execute(count_stmt)
    total = total_res.scalar() or 0
    
    # Paginate
    offset = (page - 1) * limit
    stmt = stmt.order_by(OrderHeader.date.desc()).limit(limit).offset(offset)
    
    result = await db.execute(stmt)
    ordenes = result.scalars().all()
    
    items = []
    for o in ordenes:
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
            user_name=o.user_name
        ))
        
    total_pages = (total + limit - 1) // limit if limit > 0 else 0
    
    return OrderHistorialResponse(
        data=items,
        total=total,
        page=page,
        limit=limit,
        total_pages=total_pages
    )

async def obtener_stats_historial(db: AsyncSession, tenant_id: int) -> OrderStatsResponse:
    count_stmt = select(func.count(OrderHeader.id))
    recaudado_stmt = select(func.sum(OrderHeader.total_amount - OrderHeader.balance_due))
    deuda_count_stmt = select(func.count(OrderHeader.id)).where(
        OrderHeader.balance_due > 0,
        OrderHeader.order_status != 'Cancelada'
    )
    monto_cobrar_stmt = select(func.sum(OrderHeader.balance_due)).where(
        OrderHeader.order_status != 'Cancelada'
    )
    
    if tenant_id is not None:
        count_stmt = count_stmt.where(OrderHeader.tenant_id == tenant_id)
        recaudado_stmt = recaudado_stmt.where(OrderHeader.tenant_id == tenant_id)
        deuda_count_stmt = deuda_count_stmt.where(OrderHeader.tenant_id == tenant_id)
        monto_cobrar_stmt = monto_cobrar_stmt.where(OrderHeader.tenant_id == tenant_id)
    
    res_count = await db.execute(count_stmt)
    res_recaudado = await db.execute(recaudado_stmt)
    res_deuda_count = await db.execute(deuda_count_stmt)
    res_monto_cobrar = await db.execute(monto_cobrar_stmt)
    
    return OrderStatsResponse(
        total_ordenes=res_count.scalar() or 0,
        total_recaudado=float(res_recaudado.scalar() or 0.0),
        ordenes_debe=res_deuda_count.scalar() or 0,
        monto_por_cobrar=float(res_monto_cobrar.scalar() or 0.0)
    )
