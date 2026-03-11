"""
Servicio de Gastos – lógica de negocio para SpentBusiness.
Migrado de Flet a FastAPI async con multi-tenancy.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import List, Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import SpentBusiness


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

    @classmethod
    def from_orm(cls, g) -> "GastoDTO":
        return cls(
            spent_id             = g.spent_id,
            spent_category       = g.spent_category or "",
            spent_general_name   = g.spent_general_name,
            spent_payment_method = g.spent_payment_method or "",
            spent_value          = float(g.spent_value),
            spent_date           = g.spent_date,
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
        query = query.where(SpentBusiness.spent_general_name.ilike(f"%{filtros.nombre_gasto}%"))
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
    query = select(func.count(SpentBusiness.spent_id)).where(
        SpentBusiness.tenant_id == tenant_id
    )
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
    query = select(SpentBusiness).where(SpentBusiness.tenant_id == tenant_id)
    query = _aplicar_filtros(query, filtros)
    stmt = query.order_by(SpentBusiness.spent_date.desc()).offset(offset).limit(limit)
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
        result = await db.execute(
            select(SpentBusiness).where(
                SpentBusiness.tenant_id == tenant_id,
                SpentBusiness.spent_id == gasto_id,
            )
        )
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
        result = await db.execute(
            select(SpentBusiness).where(
                SpentBusiness.tenant_id == tenant_id,
                SpentBusiness.spent_id == gasto_id,
            )
        )
        gasto = result.scalars().first()
        if not gasto:
            return f"Gasto #{gasto_id} no encontrado."
        await db.delete(gasto)
        await db.commit()
        return True
    except Exception as exc:
        await db.rollback()
        return f"Error al borrar gasto: {exc}"
