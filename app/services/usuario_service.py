"""
Servicio de Usuarios (clientes de lavandería) – lógica de negocio para FastAPI async.
NOTA: "Usuario" aquí = cliente de la lavandería, NO el usuario autenticado JWT (AppUser).
"""
from __future__ import annotations

from datetime import datetime
import logging
from dataclasses import dataclass
from typing import Optional, List, Dict

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_, case
from sqlalchemy.exc import IntegrityError

from app.models import LaundryUser, OrderHeader, ConsolidatedInvoice
from app.schemas import UsuarioCreate, UsuarioUpdate

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────
# DTO  (Data Transfer Object) – sin sesión SQLAlchemy expuesta
# Idéntico al original del servicio Flet
# ──────────────────────────────────────────────────────────────

@dataclass
class UsuarioDTO:
    user_id:           int
    user_name:         str
    user_contact:      str
    email:             Optional[str]
    nit:               Optional[str]
    user_address:      Optional[str]
    state:             bool
    loyalty_level:     Optional[str]
    user_type:         str
    payment_condition: str
    saldo_a_favor:     float = 0.0
    
    # Métricas
    total_orders:     int = 0
    total_spent:      float = 0.0
    last_visit:       Optional[datetime] = None
    pending_invoices: int = 0
    ordenes_mes: int = 0
    notas: Optional[str] = None

    @classmethod
    def from_orm(cls, u, total_orders=0, total_spent=0.0, last_visit=None, pending_invoices=0, ordenes_mes=0) -> "UsuarioDTO":
        return cls(
            user_id           = u.user_id,
            user_name         = u.user_name,
            user_contact      = u.user_contact or "",
            email             = u.email,
            nit               = u.nit,
            user_address      = u.user_address,
            state             = bool(u.state),
            loyalty_level     = u.loyalty_level,
            user_type         = u.user_type,
            payment_condition = u.payment_condition,
            saldo_a_favor     = float(u.saldo_a_favor or 0.0),
            total_orders      = total_orders,
            total_spent       = total_spent or 0.0,
            last_visit        = last_visit,
            pending_invoices  = pending_invoices,
            ordenes_mes       = ordenes_mes,
            notas             = u.notas
        )


# ──────────────────────────────────────────────────────────────
# Helpers internos de consulta
# ──────────────────────────────────────────────────────────────

def _apply_search_filters(stmt, search_names: List[str], search_contacts: List[str]):
    """Aplica filtros de búsqueda por nombre o contacto combinados."""
    tokens = [n for n in (search_names or []) if n] + [c for c in (search_contacts or []) if c]
    if not tokens:
        return stmt
    
    for t in tokens:
        pattern = func.unaccent(f"%{t}%")
        stmt = stmt.where(
            or_(
                func.unaccent(LaundryUser.user_name).ilike(pattern),
                func.unaccent(LaundryUser.user_contact).ilike(pattern)
            )
        )
    return stmt


# ──────────────────────────────────────────────────────────────
# Consultas
# ──────────────────────────────────────────────────────────────

async def listar(
    db: AsyncSession,
    tenant_id: int,
    user_type:       Optional[str] = None,
    search_names:    List[str] = [],
    search_contacts: List[str] = [],
    limit:  int = 25,
    offset: int = 0,
) -> List[UsuarioDTO]:
    """Lista todos los clientes del tenant con paginación, búsqueda, tipo y métricas."""
    
    stmt_pending = (
        select(
            ConsolidatedInvoice.user_id,
            func.count(ConsolidatedInvoice.id).label("pending_count")
        )
        .where(ConsolidatedInvoice.is_paid == False)
    )
    if tenant_id is not None:
        stmt_pending = stmt_pending.where(ConsolidatedInvoice.tenant_id == tenant_id)
    
    pending_sub = (
        stmt_pending.group_by(ConsolidatedInvoice.user_id)
        .subquery()
    )

    stmt = (
        select(
            LaundryUser,
            func.count(OrderHeader.id).label("total_orders"),
            func.sum(OrderHeader.total_amount).label("total_spent"),
            func.max(OrderHeader.date).label("last_visit"),
            func.coalesce(pending_sub.c.pending_count, 0).label("pending_invoices"),
            func.count(func.distinct(case(
                (and_(
                    func.extract('month', OrderHeader.date) == datetime.utcnow().month,
                    func.extract('year', OrderHeader.date) == datetime.utcnow().year
                ), OrderHeader.id),
                else_=None
            ))).label("ordenes_mes")
        )
        .outerjoin(OrderHeader, LaundryUser.user_id == OrderHeader.user_id)
        .outerjoin(pending_sub, LaundryUser.user_id == pending_sub.c.user_id)
    )

    if tenant_id is not None:
        stmt = stmt.where(LaundryUser.tenant_id == tenant_id)

    if user_type:
        stmt = stmt.where(LaundryUser.user_type == user_type)
    
    stmt = _apply_search_filters(stmt, search_names, search_contacts)
    
    stmt = (
        stmt.group_by(LaundryUser.user_id, pending_sub.c.pending_count)
        .order_by(LaundryUser.user_name.asc())
        .limit(limit)
        .offset(offset)
    )
    
    result = await db.execute(stmt)
    rows = result.all()
    
    return [
        UsuarioDTO.from_orm(
            row[0], 
            total_orders=row[1], 
            total_spent=row[2], 
            last_visit=row[3],
            pending_invoices=row[4],
            ordenes_mes=row[5]
        ) 
        for row in rows
    ]


async def contar(
    db: AsyncSession,
    tenant_id: int,
    user_type:       Optional[str] = None,
    search_names:    List[str] = [],
    search_contacts: List[str] = [],
) -> int:
    """Cuenta los clientes del tenant."""
    stmt = select(func.count(LaundryUser.user_id))
    if tenant_id is not None:
        stmt = stmt.where(LaundryUser.tenant_id == tenant_id)
    if user_type:
        stmt = stmt.where(LaundryUser.user_type == user_type)
    stmt = _apply_search_filters(stmt, search_names, search_contacts)
    result = await db.execute(stmt)
    return result.scalar() or 0


async def buscar_por_nombre(
    db: AsyncSession,
    tenant_id: int,
    query: str,
    user_type: Optional[str] = None,
    limit: int = 13,
) -> List[UsuarioDTO]:
    """Búsqueda rápida para dropdowns (ej: formulario de facturación).
    Busca tanto en user_name como en user_contact, igual que el servicio Flet original.
    """
    stmt = select(LaundryUser)
    if tenant_id is not None:
        stmt = stmt.where(LaundryUser.tenant_id == tenant_id)
    
    if user_type:
        stmt = stmt.where(LaundryUser.user_type == user_type)

    if query:
        stmt = stmt.where(
            func.unaccent(LaundryUser.user_name).ilike(func.unaccent(f"%{query}%")) |
            func.unaccent(LaundryUser.user_contact).ilike(func.unaccent(f"%{query}%"))
        )
    stmt = stmt.order_by(LaundryUser.user_name.asc()).limit(limit)
    result = await db.execute(stmt)
    return [UsuarioDTO.from_orm(u) for u in result.scalars().all()]


async def obtener(
    db: AsyncSession,
    tenant_id: int,
    usuario_id: int,
) -> Optional[UsuarioDTO]:
    """Devuelve un cliente por ID con sus métricas."""
    
    stmt_pending = (
        select(
            ConsolidatedInvoice.user_id,
            func.count(ConsolidatedInvoice.id).label("pending_count")
        )
        .where(ConsolidatedInvoice.is_paid == False)
    )
    if tenant_id is not None:
        stmt_pending = stmt_pending.where(ConsolidatedInvoice.tenant_id == tenant_id)
    
    pending_sub = (
        stmt_pending.group_by(ConsolidatedInvoice.user_id)
        .subquery()
    )

    stmt = (
        select(
            LaundryUser,
            func.count(OrderHeader.id).label("total_orders"),
            func.sum(OrderHeader.total_amount).label("total_spent"),
            func.max(OrderHeader.date).label("last_visit"),
            func.coalesce(pending_sub.c.pending_count, 0).label("pending_invoices"),
            func.count(func.distinct(case(
                (and_(
                    func.extract('month', OrderHeader.date) == datetime.utcnow().month,
                    func.extract('year', OrderHeader.date) == datetime.utcnow().year
                ), OrderHeader.id),
                else_=None
            ))).label("ordenes_mes")
        )
        .outerjoin(OrderHeader, LaundryUser.user_id == OrderHeader.user_id)
        .outerjoin(pending_sub, LaundryUser.user_id == pending_sub.c.user_id)
        .where(LaundryUser.user_id == usuario_id)
    )
    if tenant_id is not None:
        stmt = stmt.where(LaundryUser.tenant_id == tenant_id)
    
    stmt = stmt.group_by(LaundryUser.user_id, pending_sub.c.pending_count)
    
    result = await db.execute(stmt)
    row = result.first()
    
    if not row:
        return None
        
    return UsuarioDTO.from_orm(
        row[0], 
        total_orders=row[1], 
        total_spent=row[2], 
        last_visit=row[3],
        pending_invoices=row[4],
        ordenes_mes=row[5]
    )


# ──────────────────────────────────────────────────────────────
# Mutaciones
# ──────────────────────────────────────────────────────────────

async def crear(
    db: AsyncSession,
    tenant_id: int,
    data: UsuarioCreate,
    user_institute: str = "Usuario",
) -> UsuarioDTO | str:
    """Crea un cliente. Devuelve UsuarioDTO en éxito o str con mensaje de error."""
    try:
        nuevo = LaundryUser(
            tenant_id         = tenant_id,
            user_name         = data.nombre,
            user_contact      = data.contacto,
            email             = data.email,
            nit               = data.nit,
            user_address      = data.direccion,
            state             = data.activo,
            loyalty_level     = data.loyalty_level,
            user_type         = data.user_type,
            payment_condition = data.payment_condition,
            user_institute    = user_institute,
            notas             = data.notas,
        )
        db.add(nuevo)
        await db.commit()
        await db.refresh(nuevo)
        return await obtener(db, tenant_id, nuevo.user_id)
    except IntegrityError:
        await db.rollback()
        return "Ya existe un usuario con ese nombre o contacto."
    except Exception as exc:
        await db.rollback()
        logger.error(f"Error al crear usuario: {exc}")
        return f"Error al crear usuario: {exc}"


async def borrar(
    db: AsyncSession,
    tenant_id: int,
    usuario_id: int,
) -> bool | str:
    """Borra un cliente. Devuelve True en éxito o str con error.
    Verifica ownership por tenant_id antes de borrar.
    """
    stmt = select(LaundryUser).where(LaundryUser.user_id == usuario_id)
    if tenant_id is not None:
        stmt = stmt.where(LaundryUser.tenant_id == tenant_id)

    result = await db.execute(stmt)
    usuario = result.scalars().first()
    if not usuario:
        return "Cliente no encontrado"

    try:
        await db.delete(usuario)
        await db.commit()
        return True
    except IntegrityError:
        await db.rollback()
        return "No se puede borrar: el usuario tiene órdenes asociadas."
    except Exception as exc:
        await db.rollback()
        return f"Error al borrar usuario: {exc}"


async def actualizar(
    db: AsyncSession,
    tenant_id: int,
    usuario_id: int,
    data: UsuarioUpdate,
) -> bool | str:
    """Actualiza un cliente. Devuelve True en éxito o str con error.
    Verifica ownership por tenant_id antes de actualizar.
    Campos actualizables: nombre, email (→user_contact), activo, direccion, loyalty_level.
    """
    stmt = select(LaundryUser).where(LaundryUser.user_id == usuario_id)
    if tenant_id is not None:
        stmt = stmt.where(LaundryUser.tenant_id == tenant_id)
    
    result = await db.execute(stmt)
    usuario = result.scalars().first()
    if not usuario:
        return "Cliente no encontrado"

    update_data = data.model_dump(exclude_unset=True)
    if "nombre" in update_data:
        usuario.user_name = update_data["nombre"]
    if "contacto" in update_data:
        usuario.user_contact = update_data["contacto"] or ""
    if "email" in update_data:
        usuario.email = update_data["email"]
    if "nit" in update_data:
        usuario.nit = update_data["nit"]
    if "direccion" in update_data:
        usuario.user_address = update_data["direccion"]
    if "activo" in update_data:
        usuario.state = update_data["activo"]
    if "loyalty_level" in update_data:
        usuario.loyalty_level = update_data["loyalty_level"]
    if "user_type" in update_data:
        usuario.user_type = update_data["user_type"]
    if "payment_condition" in update_data:
        usuario.payment_condition = update_data["payment_condition"]
    if "notas" in update_data:
        usuario.notas = update_data["notas"]

    try:
        await db.commit()
        await db.refresh(usuario)
        return await obtener(db, tenant_id, usuario.user_id)
    except IntegrityError:
        await db.rollback()
        return "Error de integridad al actualizar el usuario."
    except Exception as exc:
        await db.rollback()
        return f"Error al actualizar usuario: {exc}"


# ──────────────────────────────────────────────────────────────
# Mapa rápido (uso interno – no exponer como endpoints por ahora)
# ──────────────────────────────────────────────────────────────

async def mapa_nombres(db: AsyncSession, tenant_id: int) -> Dict[int, str]:
    """Devuelve {user_id: user_name} para todos los clientes del tenant.
    # uso interno — no exponer como endpoint
    """
    stmt = select(LaundryUser).where(LaundryUser.tenant_id == tenant_id)
    result = await db.execute(stmt)
    return {u.user_id: u.user_name for u in result.scalars().all()}


async def mapa_contactos(db: AsyncSession, tenant_id: int) -> Dict[int, str]:
    """Devuelve {user_id: user_contact} para todos los clientes del tenant.
    # uso interno — no exponer como endpoint
    """
    stmt = select(LaundryUser).where(LaundryUser.tenant_id == tenant_id)
    result = await db.execute(stmt)
    return {u.user_id: (u.user_contact or "—") for u in result.scalars().all()}
