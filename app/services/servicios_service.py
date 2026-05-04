from typing import List, Optional, Union
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from app.models import Service
from app.schemas import ServicioCreate, ServicioUpdate

PROTECTED_SERVICES = ["Lavado + Secado", "Servicio X Libras", "Jabon", "Suavizante"]


async def listar(
    db: AsyncSession, 
    tenant_id: int, 
    user_institute: Optional[str] = None,
    search: Optional[str] = None
) -> List[Service]:
    """Lista servicios de un tenant con filtros opcionales (case/accent insensitive)."""
    query = select(Service)
    if tenant_id is not None:
        query = query.where(Service.tenant_id == tenant_id)
    
    if user_institute:
        # Usar ilike para ignorar case
        query = query.where(Service.user_institute.ilike(user_institute))
    
    if search:
        # Usar unaccent + ilike para ignorar tildes y case
        query = query.where(
            func.unaccent(Service.service_name).ilike(func.unaccent(f"%{search}%"))
        )
        
    result = await db.execute(query.order_by(func.lower(Service.service_name)))
    return result.scalars().all()


async def crear(
    db: AsyncSession, 
    tenant_id: int, 
    datos: ServicioCreate
):
    """Crea un nuevo servicio asociado a un tenant."""
    try:
        # Verificar si ya existe
        stmt = select(Service).where(
            Service.tenant_id == tenant_id,
            Service.service_name == datos.service_name,
            Service.user_institute == datos.user_institute,
            Service.nombre_instituto == datos.nombre_instituto
        )
        existe = await db.execute(stmt)
        if existe.scalars().first():
            return "El servicio ya existe."

        nuevo_servicio = Service(
            tenant_id=tenant_id,
            service_name=datos.service_name,
            service_value=datos.service_value,
            description=datos.description,
            spent_per_service=datos.spent_per_service,
            user_institute=datos.user_institute,
            nombre_instituto=datos.nombre_instituto,
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
    """Elimina un servicio si pertenece al tenant y no está protegido."""
    stmt = select(Service).where(Service.service_id == servicio_id)
    if tenant_id is not None:
        stmt = stmt.where(Service.tenant_id == tenant_id)
    
    result = await db.execute(stmt)
    servicio = result.scalars().first()
    
    if not servicio:
        return "Not found"
        
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
) -> Union[Service, str]:
    """Actualiza un servicio del tenant. Devuelve Service o str con error."""
    stmt = select(Service).where(Service.service_id == servicio_id)
    if tenant_id is not None:
        stmt = stmt.where(Service.tenant_id == tenant_id)
    
    result = await db.execute(stmt)
    servicio = result.scalars().first()

    if not servicio:
        return "Not found"

    # Validar cambio de nombre en servicios protegidos
    if (datos.service_name is not None and 
        datos.service_name != servicio.service_name and 
        servicio.service_name in PROTECTED_SERVICES):
        return f"El servicio '{servicio.service_name}' es fundamental y no se puede renombrar."

    update_data = datos.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(servicio, key, value)

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


async def obtener_stats(db: AsyncSession, tenant_id: int) -> dict:
    """Calcula estadísticas de servicios para el tenant."""
    # B2C Stats
    stmt_b2c = select(
        func.count(Service.service_id).label("count"),
        func.avg(Service.service_value).label("avg_price")
    ).where(Service.user_institute.ilike("usuario"))
    
    if tenant_id is not None:
        stmt_b2c = stmt_b2c.where(Service.tenant_id == tenant_id)
    
    res_b2c = await db.execute(stmt_b2c)
    row_b2c = res_b2c.one()
    
    # B2B Stats
    stmt_b2b = select(
        func.count(Service.service_id).label("count"),
        func.avg(Service.service_value).label("avg_price")
    ).where(Service.user_institute.ilike("instituto"))
    
    if tenant_id is not None:
        stmt_b2b = stmt_b2b.where(Service.tenant_id == tenant_id)
    
    res_b2b = await db.execute(stmt_b2b)
    row_b2b = res_b2b.one()
    
    # Servant más rentable (service_value - spent_per_service)
    stmt_rentable = select(Service.service_name)
    if tenant_id is not None:
        stmt_rentable = stmt_rentable.where(Service.tenant_id == tenant_id)
    
    stmt_rentable = stmt_rentable.order_by((Service.service_value - Service.spent_per_service).desc()).limit(1)
    
    res_rentable = await db.execute(stmt_rentable)
    rentable_name = res_rentable.scalar_one_or_none()
    
    return {
        "total_b2c": row_b2c.count,
        "total_b2b": row_b2b.count,
        "precio_promedio_b2c": float(row_b2c.avg_price or 0.0),
        "precio_promedio_b2b": float(row_b2b.avg_price or 0.0),
        "servicio_mas_rentable": rentable_name
    }
