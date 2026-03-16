"""
Servicio de Proveedores – lógica de negocio.
Migrado de Flet a FastAPI async con multi-tenancy.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional

from sqlalchemy import select, or_

from app.schemas import ProveedorUpdate
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Provider


# ──────────────────────────────────────────
# DTO
# ──────────────────────────────────────────

@dataclass
class ProveedorDTO:
    prov_id:       int
    prov_name:     str
    prov_contact:  str
    prov_email:    Optional[str]
    prov_address:  Optional[str]
    state:         bool
    loyalty_level: Optional[str]

    @classmethod
    def from_orm(cls, p) -> "ProveedorDTO":
        return cls(
            prov_id       = p.prov_id,
            prov_name     = p.prov_name,
            prov_contact  = p.prov_contact or "",
            prov_email    = getattr(p, "prov_email", None),
            prov_address  = p.prov_address,
            state         = bool(p.state),
            loyalty_level = p.loyalty_level,
        )


# ──────────────────────────────────────────
# Servicio
# ──────────────────────────────────────────

async def listar(
    db: AsyncSession,
    tenant_id: int,
    search_names: Optional[List[str]] = None,
    search_contacts: Optional[List[str]] = None,
) -> List[ProveedorDTO]:
    """Lista proveedores del tenant con filtros opcionales por nombre y contacto."""
    query = select(Provider)
    if tenant_id is not None:
        query = query.where(Provider.tenant_id == tenant_id)

    if search_names:
        conds = [Provider.prov_name.ilike(f"%{name}%") for name in search_names]
        query = query.where(or_(*conds))

    if search_contacts:
        conds = [Provider.prov_contact.ilike(f"%{contact}%") for contact in search_contacts]
        query = query.where(or_(*conds))

    result = await db.execute(query.order_by(Provider.prov_name))
    return [ProveedorDTO.from_orm(p) for p in result.scalars().all()]


async def crear(
    db: AsyncSession,
    tenant_id: int,
    nombre: str,
    telefono: Optional[str] = None,
    email: Optional[str] = None,
    direccion: Optional[str] = None,
    activo: bool = True,
    loyalty_level: Optional[str] = None,
) -> ProveedorDTO | str:
    """Crea un proveedor. Devuelve ProveedorDTO o str con error."""
    try:
        p = Provider(
            tenant_id=tenant_id,
            prov_name=nombre,
            prov_contact=telefono or "",
            prov_address=direccion,
            state=activo,
            loyalty_level=loyalty_level,
        )
        db.add(p)
        await db.commit()
        await db.refresh(p)
        return ProveedorDTO.from_orm(p)
    except IntegrityError:
        await db.rollback()
        return "Ya existe un proveedor con ese nombre o contacto."
    except Exception as exc:
        await db.rollback()
        return f"Error al crear: {exc}"


async def actualizar(
    db: AsyncSession,
    tenant_id: int,
    proveedor_id: int,
    datos: ProveedorUpdate,
) -> ProveedorDTO | str:
    """Actualiza un proveedor del tenant. Devuelve ProveedorDTO o str con error."""
    try:
        stmt = select(Provider).where(Provider.prov_id == proveedor_id)
        if tenant_id is not None:
            stmt = stmt.where(Provider.tenant_id == tenant_id)
        
        result = await db.execute(stmt)
        prov = result.scalars().first()
        if not prov:
            return f"Proveedor #{proveedor_id} no encontrado."

        if datos.nombre is not None:
            prov.prov_name = datos.nombre
        if datos.telefono is not None:
            prov.prov_contact = datos.telefono
        if datos.direccion is not None:
            prov.prov_address = datos.direccion
        if datos.activo is not None:
            prov.state = datos.activo
        if datos.loyalty_level is not None:
            prov.loyalty_level = datos.loyalty_level

        await db.commit()
        await db.refresh(prov)
        return ProveedorDTO.from_orm(prov)

    except IntegrityError:
        await db.rollback()
        return "Ya existe un proveedor con ese nombre o contacto."
    except Exception as exc:
        await db.rollback()
        return f"Error al actualizar: {exc}"


async def borrar(
    db: AsyncSession,
    tenant_id: int,
    proveedor_id: int,
) -> bool | str:
    """Elimina un proveedor. Devuelve True o str con error."""
    try:
        stmt = select(Provider).where(Provider.prov_id == proveedor_id)
        if tenant_id is not None:
            stmt = stmt.where(Provider.tenant_id == tenant_id)
            
        result = await db.execute(stmt)
        prov = result.scalars().first()
        if not prov:
            return f"Proveedor #{proveedor_id} no encontrado."
        await db.delete(prov)
        await db.commit()
        return True
    except IntegrityError:
        await db.rollback()
        return "No se puede borrar: el proveedor tiene registros asociados."
    except Exception as exc:
        await db.rollback()
        return f"Error al borrar: {exc}"
