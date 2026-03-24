"""
Servicio de Gastos – lógica de negocio para SpentBusiness.
Migrado de Flet a FastAPI async con multi-tenancy.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import List, Optional

from sqlalchemy import select, func, or_, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import SpentBusiness, OrderHeader, OrderDetail


# ──────────────────────────────────────────
# DTO  (igual que el original)
# ──────────────────────────────────────────

@dataclass
class GastoDTO:
    spent_id:             int
    spent_category:       str
    spent_general_name:   Optional[str]
    spent_payment_method: str
    spent_value:          float
    spent_date:           date
    description:          Optional[str] = None

    @classmethod
    def from_orm(cls, g) -> "GastoDTO":
        return cls(
            spent_id             = g.spent_id,
            spent_category       = g.spent_category or "",
            spent_general_name   = g.spent_general_name,
            spent_payment_method = g.spent_payment_method or "",
            spent_value          = float(g.spent_value),
            spent_date           = g.spent_date,
            description          = g.description,
        )

@dataclass
class AgencyServiceDTO:
    id: int
    order_id: int
    service_name: str
    quantity: float
    unit_price: float
    total_item_price: float
    agency_cost: float
    date: datetime
    customer_name: str
    description: Optional[str] = None

    @classmethod
    def from_rows(cls, r):
        return cls(
            id=r[0],
            order_id=r[1],
            service_name=r[2],
            quantity=r[3],
            unit_price=r[4],
            total_item_price=r[5],
            agency_cost=r[6],
            date=r[7],
            customer_name=r[8],
            description=r[9]
        )

# ──────────────────────────────────────────
# Filtros tipados  (igual que el original)
# ──────────────────────────────────────────

@dataclass
class FiltrosGasto:
    categoria:    str = "Todos"
    forma_pago:   str = "Todos"
    nombre_gasto: str = ""
    fecha_inicio: Optional[date] = None
    fecha_fin:    Optional[date] = None


# ──────────────────────────────────────────
# Helpers de query
# ──────────────────────────────────────────

def _aplicar_filtros(query, filtros: FiltrosGasto):
    """Aplica todos los filtros opcionales a la consulta."""
    if filtros.categoria and filtros.categoria != "Todos":
        query = query.where(SpentBusiness.spent_category == filtros.categoria)
    if filtros.forma_pago and filtros.forma_pago != "Todos":
        query = query.where(SpentBusiness.spent_payment_method == filtros.forma_pago)
    if filtros.nombre_gasto:
        query = query.where(
            func.unaccent(SpentBusiness.spent_general_name).ilike(func.unaccent(f"%{filtros.nombre_gasto}%"))
        )
    if filtros.fecha_inicio:
        query = query.where(SpentBusiness.spent_date >= filtros.fecha_inicio)
    if filtros.fecha_fin:
        query = query.where(SpentBusiness.spent_date <= filtros.fecha_fin)
    return query


# ──────────────────────────────────────────
# Servicio
# ──────────────────────────────────────────

async def registrar(
    db: AsyncSession,
    tenant_id: int,
    categoria: str,
    forma_pago: str,
    monto: float,
    descripcion_nombre: Optional[str] = None,
    fecha: Optional[date] = None,
    descripcion: Optional[str] = None,
) -> GastoDTO | str:
    """Registra un gasto. Devuelve GastoDTO o str con error."""
    if fecha is None:
        fecha = datetime.now().date()
    try:
        g = SpentBusiness(
            tenant_id=tenant_id,
            spent_category=categoria,
            spent_payment_method=forma_pago,
            spent_value=monto,
            spent_general_name=descripcion_nombre,
            description=descripcion,
            spent_date=fecha,
        )
        db.add(g)
        await db.commit()
        await db.refresh(g)
        return GastoDTO.from_orm(g)
    except Exception as exc:
        await db.rollback()
        return f"Error al registrar gasto: {exc}"


async def contar(
    db: AsyncSession,
    tenant_id: int,
    filtros: FiltrosGasto = None,
) -> int:
    """Cuenta gastos del tenant aplicando filtros."""
    if filtros is None:
        filtros = FiltrosGasto()
    query = select(func.count(SpentBusiness.spent_id))
    if tenant_id is not None:
        query = query.where(SpentBusiness.tenant_id == tenant_id)
    query = _aplicar_filtros(query, filtros)
    result = await db.execute(query)
    return result.scalar()


async def listar(
    db: AsyncSession,
    tenant_id: int,
    filtros: FiltrosGasto = None,
    limit: int = 25,
    offset: int = 0,
) -> List[GastoDTO]:
    """Lista gastos del tenant aplicando filtros y paginación."""
    if filtros is None:
        filtros = FiltrosGasto()
    query = select(SpentBusiness)
    if tenant_id is not None:
        query = query.where(SpentBusiness.tenant_id == tenant_id)
    query = _aplicar_filtros(query, filtros)
    stmt = query.order_by(SpentBusiness.spent_date.desc(), SpentBusiness.spent_id.desc()).offset(offset).limit(limit)
    result = await db.execute(stmt)
    return [GastoDTO.from_orm(g) for g in result.scalars().all()]


async def actualizar(
    db: AsyncSession,
    tenant_id: int,
    gasto_id: int,
    categoria: Optional[str] = None,
    descripcion_nombre: Optional[str] = None,
    forma_pago: Optional[str] = None,
    monto: Optional[float] = None,
) -> bool | str:
    """Actualiza un gasto. Devuelve True o str con error."""
    try:
        stmt = select(SpentBusiness).where(SpentBusiness.spent_id == gasto_id)
        if tenant_id is not None:
            stmt = stmt.where(SpentBusiness.tenant_id == tenant_id)
        
        result = await db.execute(stmt)
        gasto = result.scalars().first()
        if not gasto:
            return f"Gasto #{gasto_id} no encontrado."

        if categoria is not None:
            gasto.spent_category = categoria
        if descripcion_nombre is not None:
            gasto.spent_general_name = descripcion_nombre
        if forma_pago is not None:
            gasto.spent_payment_method = forma_pago
        if monto is not None:
            gasto.spent_value = monto

        await db.commit()
        return True
    except Exception as exc:
        await db.rollback()
        return f"Error al actualizar gasto: {exc}"


async def borrar(
    db: AsyncSession,
    tenant_id: int,
    gasto_id: int,
) -> bool | str:
    """Elimina un gasto. Devuelve True o str con error."""
    try:
        stmt = select(SpentBusiness).where(SpentBusiness.spent_id == gasto_id)
        if tenant_id is not None:
            stmt = stmt.where(SpentBusiness.tenant_id == tenant_id)
            
        result = await db.execute(stmt)
        gasto = result.scalars().first()
        if not gasto:
            return f"Gasto #{gasto_id} no encontrado."
        await db.delete(gasto)
        await db.commit()
        return True
    except Exception as exc:
        await db.rollback()
        return f"Error al borrar gasto: {exc}"

@dataclass
class AgencyServiceDTO:
    id:               int
    order_id:         int
    order_number:     Optional[int]
    date:             datetime
    customer_name:    str
    service_name:     str
    quantity:         float
    unit_price:       float
    total_item_price: float
    agency_cost:      float
    description:      Optional[str] = None

    @classmethod
    def from_rows(cls, row) -> "AgencyServiceDTO":
        return cls(
            id               = row.id,
            order_id         = row.order_id,
            order_number     = getattr(row, "order_number", None),
            date             = row.date,
            customer_name    = row.user_name,
            service_name     = row.service_name,
            quantity         = float(row.quantity),
            unit_price       = float(row.unit_price),
            total_item_price = float(row.total_item_price),
            agency_cost      = float(row.spent_per_order),
            description      = getattr(row, "description", None),
        )


async def contar_detalles_agencia(
    db: AsyncSession,
    tenant_id: int,
    nombre_gasto: Optional[str] = None,
    fecha_inicio: Optional[date] = None,
    fecha_fin: Optional[date] = None,
) -> int:
    """Cuenta detalles de servicios marcados como agencia logicamente."""
    from app.models import OrderDetail, OrderHeader
    stmt = (
        select(func.count(OrderDetail.id))
        .join(OrderHeader, OrderDetail.order_id == OrderHeader.id)
        .where(OrderDetail.is_agency == True)
    )
    if tenant_id is not None:
        stmt = stmt.where(OrderDetail.tenant_id == tenant_id)
    
    if nombre_gasto:
        stmt = stmt.where(
            or_(
                func.unaccent(OrderHeader.user_name).ilike(func.unaccent(f"%{nombre_gasto}%")),
                func.unaccent(OrderDetail.service_name).ilike(func.unaccent(f"%{nombre_gasto}%"))
            )
        )
    if fecha_inicio:
        stmt = stmt.where(OrderHeader.date >= datetime.combine(fecha_inicio, datetime.min.time()))
    if fecha_fin:
        stmt = stmt.where(OrderHeader.date <= datetime.combine(fecha_fin, datetime.max.time()))

    result = await db.execute(stmt)
    return result.scalar() or 0


async def obtener_stats_agencia(
    db: AsyncSession,
    tenant_id: int,
    nombre_gasto: Optional[str] = None,
    fecha_inicio: Optional[date] = None,
    fecha_fin: Optional[date] = None,
) -> dict:
    """Obtiene conteo total y costo total de servicios de agencia."""
    from app.models import OrderDetail, OrderHeader
    stmt = (
        select(
            func.count(OrderDetail.id).label("total_count"),
            func.sum(OrderDetail.total_item_price).label("total_value"),
            func.sum(OrderDetail.spent_per_order).label("total_cost"),
            func.count(func.distinct(OrderDetail.order_id)).label("total_orders_count")
        )
        .join(OrderHeader, OrderDetail.order_id == OrderHeader.id)
        .where(OrderDetail.is_agency == True)
    )
    if tenant_id is not None:
        stmt = stmt.where(OrderDetail.tenant_id == tenant_id)
    
    if nombre_gasto:
        stmt = stmt.where(
            or_(
                func.unaccent(OrderHeader.user_name).ilike(func.unaccent(f"%{nombre_gasto}%")),
                func.unaccent(OrderDetail.service_name).ilike(func.unaccent(f"%{nombre_gasto}%"))
            )
        )
    if fecha_inicio:
        stmt = stmt.where(OrderHeader.date >= datetime.combine(fecha_inicio, datetime.min.time()))
    if fecha_fin:
        stmt = stmt.where(OrderHeader.date <= datetime.combine(fecha_fin, datetime.max.time()))

    result = await db.execute(stmt)
    row = result.one()
    return {
        "total_count": row.total_count or 0,
        "total_value": float(row.total_value or 0.0),
        "total_cost": float(row.total_cost or 0.0),
        "total_orders_count": row.total_orders_count or 0
    }

async def obtener_resumen_agencia(
    db: AsyncSession,
    tenant_id: int,
    group_by: str = "mes",  # "dia", "semana", "mes"
    nombre_gasto: Optional[str] = None,
    fecha_inicio: Optional[date] = None,
    fecha_fin: Optional[date] = None
) -> list[dict]:
    # Definir la truncación según el motor (Postgres/SQLite)
    # Asumiendo Postgres por el uso de func.date_trunc en otros lados, 
    # pero usemos extract para ser más genéricos si es posible o simplemente date_trunc.
    
    if group_by == "dia":
        trunc_func = func.date_trunc('day', OrderHeader.date)
    elif group_by == "semana":
        trunc_func = func.date_trunc('week', OrderHeader.date)
    else: # mes
        trunc_func = func.date_trunc('month', OrderHeader.date)

    stmt = (
        select(
            trunc_func.label("periodo_raw"),
            func.count(OrderDetail.id).label("count"),
            func.sum(OrderDetail.total_item_price).label("facturado"),
            func.sum(OrderDetail.spent_per_order).label("costo")
        )
        .join(OrderHeader, OrderDetail.order_id == OrderHeader.id)
        .where(OrderDetail.is_agency == True)
    )
    
    if tenant_id is not None:
        stmt = stmt.where(OrderDetail.tenant_id == tenant_id)
    if nombre_gasto:
        stmt = stmt.where(
            or_(
                func.unaccent(OrderHeader.user_name).ilike(func.unaccent(f"%{nombre_gasto}%")),
                func.unaccent(OrderDetail.service_name).ilike(func.unaccent(f"%{nombre_gasto}%"))
            )
        )
    if fecha_inicio:
        stmt = stmt.where(OrderHeader.date >= datetime.combine(fecha_inicio, datetime.min.time()))
    if fecha_fin:
        stmt = stmt.where(OrderHeader.date <= datetime.combine(fecha_fin, datetime.max.time()))

    stmt = stmt.group_by("periodo_raw").order_by(desc("periodo_raw"))
    
    result = await db.execute(stmt)
    rows = result.all()
    
    res = []
    MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
    
    for r in rows:
        d = r.periodo_raw
        if group_by == "dia":
            label = f"{d.day} {MESES[d.month-1]}"
        elif group_by == "semana":
            # simplificado: "Sem {week} · {mes}"
            label = f"Sem {d.isocalendar()[1]} · {MESES[d.month-1]}"
        else: # mes
            label = f"{MESES[d.month-1]} {d.year}"
            
        res.append({
            "periodo": label,
            "count": r.count,
            "facturado": float(r.facturado or 0.0),
            "costo": float(r.costo or 0.0),
            "sort_date": d
        })
    return res


async def listar_detalles_agencia(
    db: AsyncSession,
    tenant_id: int,
    nombre_gasto: Optional[str] = None,
    fecha_inicio: Optional[date] = None,
    fecha_fin: Optional[date] = None,
    limit: int = 25,
    offset: int = 0,
) -> List[AgencyServiceDTO]:
    """Lista detalles de servicios marcados como agencia logicamente."""
    from app.models import OrderDetail, OrderHeader
    from sqlalchemy import or_
    
    stmt = (
        select(
            OrderDetail.id,
            OrderDetail.order_id,
            OrderDetail.order_number,
            OrderDetail.service_name,
            OrderDetail.quantity,
            OrderDetail.unit_price,
            OrderDetail.total_item_price,
            OrderDetail.spent_per_order,
            OrderHeader.date,
            OrderHeader.user_name,
            OrderDetail.description
        )
        .join(OrderHeader, OrderDetail.order_id == OrderHeader.id)
        .where(OrderDetail.is_agency == True)
    )
    
    if tenant_id is not None:
        stmt = stmt.where(OrderDetail.tenant_id == tenant_id)
        
    if nombre_gasto:
        stmt = stmt.where(
            or_(
                func.unaccent(OrderHeader.user_name).ilike(func.unaccent(f"%{nombre_gasto}%")),
                func.unaccent(OrderDetail.service_name).ilike(func.unaccent(f"%{nombre_gasto}%"))
            )
        )
    if fecha_inicio:
        stmt = stmt.where(OrderHeader.date >= datetime.combine(fecha_inicio, datetime.min.time()))
    if fecha_fin:
        stmt = stmt.where(OrderHeader.date <= datetime.combine(fecha_fin, datetime.max.time()))

    stmt = stmt.order_by(OrderHeader.date.desc(), OrderDetail.id.desc())
    stmt = stmt.offset(offset).limit(limit)
    
    result = await db.execute(stmt)
    rows = result.all()
    return [AgencyServiceDTO.from_rows(r) for r in rows]
