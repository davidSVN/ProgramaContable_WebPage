from typing import List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from app.models import Service
from app.schemas import ServicioCreate, ServicioUpdate

PROTECTED_SERVICES = ["Lavado + Secado", "Servicio X Libras", "Jabon", "Suavizante"]


async def listar(
    db: AsyncSession, 
    tenant_id: int, 
    filtro_institucion: Optional[str] = None
) -> List[Service]:
    """Lista servicios de un tenant con filtro opcional por institución."""
    query = select(Service).where(Service.tenant_id == tenant_id)
    
    if filtro_institucion:
        query = query.where(Service.user_institute == filtro_institucion)
        
    result = await db.execute(query.order_by(Service.service_name))
    return result.scalars().all()


async def crear(
    db: AsyncSession, 
    tenant_id: int, 
    datos: ServicioCreate, 
    user_institute: str, 
    nombre_instituto: str
):
    """Crea un nuevo servicio asociado a un tenant."""
    try:
        # Verificar si ya existe el servicio en este tenant (el modelo ya tiene UniqueConstraint)
        # Pero podemos revisarlo antes explícitamente si queremos, o dejar que falle en IntegrityError
        # El user requería: "Si crear_servicio devuelve None → el servicio ya existe → devolver str con error"
        existe = await db.execute(
            select(Service).where(
                Service.tenant_id == tenant_id,
                Service.service_name == datos.nombre
            )
        )
        if existe.scalars().first():
            return "El servicio ya existe."

        nuevo_servicio = Service(
            tenant_id=tenant_id,
            service_name=datos.nombre,
            service_value=datos.precio,
            description=datos.descripcion,
            spent_per_service=datos.spent_per_service,
            user_institute=user_institute,
            nombre_instituto=nombre_instituto,
        )
        db.add(nuevo_servicio)
        await db.commit()
        await db.refresh(nuevo_servicio)
        
        return nuevo_servicio
        
    except IntegrityError:
        await db.rollback()
        return "El servicio ya existe."
    except Exception as e:
        await db.rollback()
        return f"Error al crear el servicio: {str(e)}"


async def borrar(db: AsyncSession, tenant_id: int, servicio_id: int) -> Optional[str]:
    """Elimina un servicio si pertenece al tenant y no está protegido ni tiene transacciones pasadas."""
    result = await db.execute(
        select(Service)
        .where(Service.tenant_id == tenant_id, Service.service_id == servicio_id)
    )
    servicio = result.scalars().first()
    
    if not servicio:
        return "Not found"
        
    # El chequeo de servicios protegidos debe ocurrir ANTES de borrar
    if servicio.service_name in PROTECTED_SERVICES:
        return "Este es un servicio fundamental y no puede ser eliminado."
        
    try:
        await db.delete(servicio)
        await db.commit()
        return None
    except IntegrityError:
        await db.rollback()
        return "Este servicio podría estar vinculado a transacciones pasadas."


async def actualizar(
    db: AsyncSession,
    tenant_id: int,
    servicio_id: int,
    datos: ServicioUpdate,
) -> Service | str:
    """Actualiza un servicio del tenant. Devuelve Service o str con error."""
    result = await db.execute(
        select(Service).where(
            Service.tenant_id == tenant_id,
            Service.service_id == servicio_id,
        )
    )
    servicio = result.scalars().first()

    if not servicio:
        return "Not found"

    if datos.nombre is not None and servicio.service_name in PROTECTED_SERVICES:
        return f"El servicio '{servicio.service_name}' es fundamental y no se puede renombrar."

    if datos.nombre is not None:
        servicio.service_name = datos.nombre.title()
    if datos.precio is not None:
        servicio.service_value = datos.precio
    if datos.descripcion is not None:
        servicio.description = datos.descripcion
    if datos.spent_per_service is not None:
        servicio.spent_per_service = datos.spent_per_service

    try:
        await db.commit()
        await db.refresh(servicio)
        return servicio
    except IntegrityError:
        await db.rollback()
        return "Ya existe un servicio con ese nombre."
    except Exception as exc:
        await db.rollback()
        return f"Error al actualizar: {exc}"
