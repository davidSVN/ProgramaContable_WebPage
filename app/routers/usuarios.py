from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_admin_or_above
from app.models import AppUser, OrderHeader
from app.schemas import UsuarioCreate, UsuarioUpdate, UsuarioResponse, UsuarioCountResponse, OrderHistorialItem
from app.services import usuario_service
from app.services.historial_service import _derivar_estado_pago

router = APIRouter()

# 1. GET /usuarios/count
@router.get("/count", response_model=UsuarioCountResponse)
async def contar_usuarios(
    user_type: Optional[str] = Query(default=None),
    search_names: List[str] = Query(default=[]),
    search_contacts: List[str] = Query(default=[]),
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user)
):
    total = await usuario_service.contar(
        db=db,
        tenant_id=current_user.tenant_id,
        user_type=user_type,
        search_names=search_names,
        search_contacts=search_contacts
    )
    return {"total": total}

# 2. GET /usuarios
@router.get("", response_model=List[UsuarioResponse])
async def listar_usuarios(
    user_type: Optional[str] = Query(default=None),
    search_names: List[str] = Query(default=[]),
    search_contacts: List[str] = Query(default=[]),
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user)
):
    return await usuario_service.listar(
        db=db,
        tenant_id=current_user.tenant_id,
        user_type=user_type,
        search_names=search_names,
        search_contacts=search_contacts,
        limit=limit,
        offset=offset
    )

# 3. GET /usuarios/search
@router.get("/search", response_model=List[UsuarioResponse])
async def buscar_usuario_por_nombre(
    q: str = Query(default="", min_length=0),
    user_type: Optional[str] = Query(default=None),
    limit: int = Query(default=13),
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user)
):
    # el endpoint debe soportar búsqueda con q="" vacío devolviendo lista vacía
    if not q:
        return []
    
    return await usuario_service.buscar_por_nombre(
        db=db,
        tenant_id=current_user.tenant_id,
        query=q,
        user_type=user_type,
        limit=limit
    )

# 4a. GET /usuarios/{usuario_id}/ordenes — últimas órdenes del cliente
@router.get("/{usuario_id}/ordenes", response_model=List[OrderHistorialItem])
async def obtener_ordenes_usuario(
    usuario_id: int,
    limit: int = Query(default=5, ge=1, le=20),
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    stmt = (
        select(OrderHeader)
        .where(OrderHeader.user_id == usuario_id)
        .order_by(OrderHeader.date.desc())
        .limit(limit)
    )
    if current_user.tenant_id is not None:
        stmt = stmt.where(OrderHeader.tenant_id == current_user.tenant_id)
    result = await db.execute(stmt)
    ordenes = result.scalars().all()
    return [
        OrderHistorialItem(
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
            user_name=o.user_name or "",
        )
        for o in ordenes
    ]


# 4. GET /usuarios/{usuario_id}
@router.get("/{usuario_id}", response_model=UsuarioResponse)
async def obtener_usuario(
    usuario_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user)
):
    usuario = await usuario_service.obtener(
        db=db,
        tenant_id=current_user.tenant_id,
        usuario_id=usuario_id
    )
    if not usuario:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return usuario

# 5. POST /usuarios
@router.post("", response_model=UsuarioResponse, status_code=status.HTTP_201_CREATED)
async def crear_usuario(
    data: UsuarioCreate,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user)
):
    result = await usuario_service.crear(
        db=db,
        tenant_id=current_user.tenant_id,
        data=data,
        user_institute=current_user.username  # Extraemos del current_user (se solicitó user_institute de current_user)
    )
    
    if isinstance(result, str):
        if "Ya existe" in result:
            raise HTTPException(status_code=409, detail=result)
        raise HTTPException(status_code=400, detail=result)
        
    return result

# 6. PUT /usuarios/{usuario_id}
@router.put("/{usuario_id}")
async def actualizar_usuario(
    usuario_id: int,
    data: UsuarioUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_admin_or_above)
):
    result = await usuario_service.actualizar(
        db=db,
        tenant_id=current_user.tenant_id,
        usuario_id=usuario_id,
        data=data
    )
    
    if isinstance(result, str):
        raise HTTPException(status_code=400, detail=result)
        
    return {"message": "Cliente actualizado correctamente"}

# 7. DELETE /usuarios/{usuario_id}
@router.delete("/{usuario_id}")
async def borrar_usuario(
    usuario_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_admin_or_above)
):
    result = await usuario_service.borrar(
        db=db,
        tenant_id=current_user.tenant_id,
        usuario_id=usuario_id
    )
    
    if isinstance(result, str):
        if "órdenes asociadas" in result:
            raise HTTPException(status_code=409, detail=result)
        raise HTTPException(status_code=400, detail=result)
        
    return {"message": "Cliente eliminado correctamente"}
