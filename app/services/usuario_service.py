"""
Servicio de Usuarios (clientes de lavandería) – lógica de negocio para FastAPI async.
NOTA: "Usuario" aquí = cliente de la lavandería, NO el usuario autenticado JWT (AppUser).
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional, List, Dict

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from sqlalchemy.exc import IntegrityError

from app.models import LaundryUser
from app.schemas import UsuarioCreate, UsuarioUpdate

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────
# DTO  (Data Transfer Object) – sin sesión SQLAlchemy expuesta
# Idéntico al original del servicio Flet
# ──────────────────────────────────────────────────────────────

@dataclass
class UsuarioDTO:
    user_id:       int
    user_name:     str
    user_contact:  str
    user_address:  Optional[str]
    state:         bool
    loyalty_level: Optional[str]

    @classmethod
    def from_orm(cls, u) -> "UsuarioDTO":
        return cls(
            user_id       = u.user_id,
            user_name     = u.user_name,
            user_contact  = u.user_contact or "",
            user_address  = u.user_address,
            state         = bool(u.state),
            loyalty_level = u.loyalty_level,
        )


# ──────────────────────────────────────────────────────────────
# Helpers internos de consulta
# ──────────────────────────────────────────────────────────────

def _apply_search_filters(stmt, search_names: List[str], search_contacts: List[str]):
    """Aplica filtros de búsqueda por nombre o contacto (OR dentro del mismo tipo)."""
    if search_names:
        name_filters = [LaundryUser.user_name.ilike(f"%{n}%") for n in search_names if n]
        if name_filters:
            stmt = stmt.where(or_(*name_filters))
    if search_contacts:
        contact_filters = [LaundryUser.user_contact.ilike(f"%{c}%") for c in search_contacts if c]
        if contact_filters:
            stmt = stmt.where(or_(*contact_filters))
    return stmt


# ──────────────────────────────────────────────────────────────
# Consultas
# ──────────────────────────────────────────────────────────────

async def listar(
    db: AsyncSession,
    tenant_id: int,
    search_names:    List[str] = [],
    search_contacts: List[str] = [],
    limit:  int = 25,
    offset: int = 0,
) -> List[UsuarioDTO]:
    """Lista todos los clientes del tenant con paginación y búsqueda opcional."""
    stmt = select(LaundryUser).where(LaundryUser.tenant_id == tenant_id)
    stmt = _apply_search_filters(stmt, search_names, search_contacts)
    stmt = stmt.order_by(LaundryUser.user_name.asc()).limit(limit).offset(offset)
    result = await db.execute(stmt)
    return [UsuarioDTO.from_orm(u) for u in result.scalars().all()]


async def contar(
    db: AsyncSession,
    tenant_id: int,
    search_names:    List[str] = [],
    search_contacts: List[str] = [],
) -> int:
    """Cuenta los clientes del tenant. Útil para paginación en el frontend."""
    stmt = select(func.count(LaundryUser.user_id)).where(LaundryUser.tenant_id == tenant_id)
    stmt = _apply_search_filters(stmt, search_names, search_contacts)
    result = await db.execute(stmt)
    return result.scalar() or 0


async def buscar_por_nombre(
    db: AsyncSession,
    tenant_id: int,
    query: str,
    limit: int = 13,
) -> List[UsuarioDTO]:
    """Búsqueda rápida para dropdowns (ej: formulario de facturación).
    Busca tanto en user_name como en user_contact, igual que el servicio Flet original.
    """
    stmt = select(LaundryUser).where(LaundryUser.tenant_id == tenant_id)
    if query:
        stmt = stmt.where(
            LaundryUser.user_name.ilike(f"%{query}%") |
            LaundryUser.user_contact.ilike(f"%{query}%")
        )
    stmt = stmt.order_by(LaundryUser.user_name.asc()).limit(limit)
    result = await db.execute(stmt)
    return [UsuarioDTO.from_orm(u) for u in result.scalars().all()]


async def obtener(
    db: AsyncSession,
    tenant_id: int,
    usuario_id: int,
) -> Optional[UsuarioDTO]:
    """Devuelve un cliente por ID, verificando que pertenezca al tenant.
    Si no pertenece al tenant → devuelve None (el router lanza 404).
    """
    stmt = select(LaundryUser).where(
        LaundryUser.tenant_id == tenant_id,
        LaundryUser.user_id   == usuario_id,
    )
    result = await db.execute(stmt)
    u = result.scalars().first()
    return UsuarioDTO.from_orm(u) if u else None


# ──────────────────────────────────────────────────────────────
# Mutaciones
# ──────────────────────────────────────────────────────────────

async def crear(
    db: AsyncSession,
    tenant_id: int,
    data: UsuarioCreate,
    user_institute: str = "Usuario",
) -> UsuarioDTO | str:
    """Crea un cliente. Devuelve UsuarioDTO en éxito o str con mensaje de error.
    Nota: el campo 'email' del schema es el user_contact del modelo (teléfono/contacto).
    user_institute viene de current_user en el router, NO del body.
    """
    try:
        nuevo = LaundryUser(
            tenant_id     = tenant_id,
            user_name     = data.nombre,
            user_contact  = data.email or "",  # email del schema → user_contact del modelo
            user_address  = data.direccion,
            state         = data.activo,
            loyalty_level = data.loyalty_level,
            user_institute = user_institute,
        )
        db.add(nuevo)
        await db.commit()
        await db.refresh(nuevo)
        return UsuarioDTO.from_orm(nuevo)
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
    stmt = select(LaundryUser).where(
        LaundryUser.tenant_id == tenant_id,
        LaundryUser.user_id   == usuario_id,
    )
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
    stmt = select(LaundryUser).where(
        LaundryUser.tenant_id == tenant_id,
        LaundryUser.user_id   == usuario_id,
    )
    result = await db.execute(stmt)
    usuario = result.scalars().first()
    if not usuario:
        return "Cliente no encontrado"

    update_data = data.model_dump(exclude_unset=True)
    if "nombre" in update_data:
        usuario.user_name = update_data["nombre"]
    if "email" in update_data:
        usuario.user_contact = update_data["email"] or ""
    if "direccion" in update_data:
        usuario.user_address = update_data["direccion"]
    if "activo" in update_data:
        usuario.state = update_data["activo"]
    if "loyalty_level" in update_data:
        usuario.loyalty_level = update_data["loyalty_level"]

    try:
        await db.commit()
        await db.refresh(usuario)
        return True
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
