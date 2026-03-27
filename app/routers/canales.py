from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_admin_or_above
from app.models import AppUser, CanalPago, CanalTransferencia, OrderPayment, SpentBusiness
from app.schemas import (
    CanalPagoCreate, CanalPagoUpdate, CanalPagoResponse,
    TransferenciaCreate, TransferenciaResponse, CanalSaldoResponse,
)

router = APIRouter(prefix="/canales", tags=["Canales de Pago"])

DEFAULT_CANALES = [
    {"nombre": "rappi pay",        "tipo": "banco",             "emoji": "⚡", "color": "#FF6B2B", "orden": 0},
    {"nombre": "nubank",           "tipo": "banco",             "emoji": "💜", "color": "#9C27B0", "orden": 1},
    {"nombre": "efectivo",         "tipo": "efectivo",          "emoji": "💵", "color": "#4CAF50", "orden": 2},
    {"nombre": "nequi",            "tipo": "billetera_digital", "emoji": "💜", "color": "#7F77DD", "orden": 3},
    {"nombre": "daviplata",        "tipo": "billetera_digital", "emoji": "🔴", "color": "#E91E63", "orden": 4},
    {"nombre": "transferencia",    "tipo": "banco",             "emoji": "🏦", "color": "#185FA5", "orden": 5},
]


async def _seed_defaults(db: AsyncSession, tenant_id: int) -> None:
    """Create default channels for a tenant if none exist."""
    for c in DEFAULT_CANALES:
        db.add(CanalPago(tenant_id=tenant_id, **c))
    await db.commit()


# ── GET /canales/ ─────────────────────────────────────────────────────────────

@router.get("/", response_model=List[CanalPagoResponse], summary="Listar canales de pago")
async def listar_canales(
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    result = await db.execute(
        select(CanalPago)
        .where(CanalPago.tenant_id == current_user.tenant_id)
        .order_by(CanalPago.orden, CanalPago.id)
    )
    canales = result.scalars().all()

    if not canales:
        await _seed_defaults(db, current_user.tenant_id)
        result = await db.execute(
            select(CanalPago)
            .where(CanalPago.tenant_id == current_user.tenant_id)
            .order_by(CanalPago.orden, CanalPago.id)
        )
        canales = result.scalars().all()

    return canales


# ── GET /canales/saldos ────────────────────────────────────────────────────────

@router.get("/saldos", response_model=List[CanalSaldoResponse], summary="Saldos por canal")
async def saldos_canales(
    fecha_inicio: Optional[date] = None,
    fecha_fin: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    # 1. All active channels (seed if needed)
    result = await db.execute(
        select(CanalPago)
        .where(CanalPago.tenant_id == current_user.tenant_id, CanalPago.is_active == True)
        .order_by(CanalPago.orden, CanalPago.id)
    )
    canales = result.scalars().all()
    if not canales:
        await _seed_defaults(db, current_user.tenant_id)
        result = await db.execute(
            select(CanalPago)
            .where(CanalPago.tenant_id == current_user.tenant_id, CanalPago.is_active == True)
            .order_by(CanalPago.orden, CanalPago.id)
        )
        canales = result.scalars().all()

    # 2. OrderPayments grouped by payment_method in period
    pago_stmt = (
        select(OrderPayment.payment_method, func.sum(OrderPayment.amount).label("total"))
        .where(OrderPayment.tenant_id == current_user.tenant_id)
    )
    if fecha_inicio:
        pago_stmt = pago_stmt.where(OrderPayment.order_id.isnot(None))  # only order payments
    # Join to orders for date filtering — use subquery approach via direct date filter on payments
    # OrderPayment has no date column; filter via order date using a join
    if fecha_inicio or fecha_fin:
        from app.models import OrderHeader
        pago_stmt = (
            select(OrderPayment.payment_method, func.sum(OrderPayment.amount).label("total"))
            .join(OrderHeader, and_(
                OrderPayment.order_id == OrderHeader.id,
                OrderPayment.tenant_id == current_user.tenant_id,
            ))
            .where(OrderPayment.tenant_id == current_user.tenant_id)
        )
        if fecha_inicio:
            pago_stmt = pago_stmt.where(
                OrderHeader.date >= datetime.combine(fecha_inicio, datetime.min.time())
            )
        if fecha_fin:
            pago_stmt = pago_stmt.where(
                OrderHeader.date <= datetime.combine(fecha_fin, datetime.max.time())
            )
    pago_stmt = pago_stmt.group_by(OrderPayment.payment_method)

    pago_res = await db.execute(pago_stmt)
    brutos: dict[str, float] = {row.payment_method: float(row.total or 0) for row in pago_res}

    # 3. Transferencias in/out per canal in period
    tf_stmt = select(CanalTransferencia).where(
        CanalTransferencia.tenant_id == current_user.tenant_id
    )
    if fecha_inicio:
        tf_stmt = tf_stmt.where(
            CanalTransferencia.fecha >= datetime.combine(fecha_inicio, datetime.min.time())
        )
    if fecha_fin:
        tf_stmt = tf_stmt.where(
            CanalTransferencia.fecha <= datetime.combine(fecha_fin, datetime.max.time())
        )
    tf_res = await db.execute(tf_stmt)
    transferencias = tf_res.scalars().all()

    tf_in:  dict[str, float] = {}
    tf_out: dict[str, float] = {}
    for t in transferencias:
        tf_in[t.canal_destino]  = tf_in.get(t.canal_destino, 0.0)  + t.monto
        tf_out[t.canal_origen]  = tf_out.get(t.canal_origen, 0.0)  + t.monto

    # 4. SpentBusiness (egresos) grouped by spent_payment_method in period
    gasto_stmt = (
        select(SpentBusiness.spent_payment_method, func.sum(SpentBusiness.spent_value).label("total"))
        .where(SpentBusiness.tenant_id == current_user.tenant_id)
    )
    if fecha_inicio:
        gasto_stmt = gasto_stmt.where(
            SpentBusiness.spent_date >= datetime.combine(fecha_inicio, datetime.min.time())
        )
    if fecha_fin:
        gasto_stmt = gasto_stmt.where(
            SpentBusiness.spent_date <= datetime.combine(fecha_fin, datetime.max.time())
        )
    gasto_stmt = gasto_stmt.group_by(SpentBusiness.spent_payment_method)
    gasto_res = await db.execute(gasto_stmt)
    egresos_map: dict[str, float] = {row.spent_payment_method: float(row.total or 0) for row in gasto_res}

    # 5. Build response — one entry per active canal
    # saldo_real = ingresos - egresos + transferencias_in - transferencias_out
    # Sum of all saldo_real == net_income
    saldos = []
    for canal in canales:
        bruto   = brutos.get(canal.nombre, 0.0)
        egresos = egresos_map.get(canal.nombre, 0.0)
        entrada = tf_in.get(canal.nombre, 0.0)
        salida  = tf_out.get(canal.nombre, 0.0)
        saldos.append(CanalSaldoResponse(
            canal=canal.nombre,
            emoji=canal.emoji,
            color=canal.color,
            tipo=canal.tipo,
            saldo_bruto=bruto,
            egresos=egresos,
            transferencias_in=entrada,
            transferencias_out=salida,
            saldo_real=bruto - egresos + entrada - salida,
        ))

    return saldos


# ── POST /canales/ ────────────────────────────────────────────────────────────

@router.post("/", response_model=CanalPagoResponse, status_code=201, summary="Crear canal")
async def crear_canal(
    body: CanalPagoCreate,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_admin_or_above),
):
    canal = CanalPago(tenant_id=current_user.tenant_id, **body.model_dump())
    db.add(canal)
    try:
        await db.commit()
        await db.refresh(canal)
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Ya existe un canal con ese nombre")
    return canal


# ── PUT /canales/{canal_id} ────────────────────────────────────────────────────

@router.put("/{canal_id}", response_model=CanalPagoResponse, summary="Actualizar canal")
async def actualizar_canal(
    canal_id: int,
    body: CanalPagoUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_admin_or_above),
):
    result = await db.execute(
        select(CanalPago).where(CanalPago.id == canal_id, CanalPago.tenant_id == current_user.tenant_id)
    )
    canal = result.scalars().first()
    if not canal:
        raise HTTPException(status_code=404, detail="Canal no encontrado")

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(canal, field, value)

    await db.commit()
    await db.refresh(canal)
    return canal


# ── DELETE /canales/{canal_id} ────────────────────────────────────────────────

@router.delete("/{canal_id}", status_code=204, summary="Desactivar canal")
async def eliminar_canal(
    canal_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_admin_or_above),
):
    result = await db.execute(
        select(CanalPago).where(CanalPago.id == canal_id, CanalPago.tenant_id == current_user.tenant_id)
    )
    canal = result.scalars().first()
    if not canal:
        raise HTTPException(status_code=404, detail="Canal no encontrado")
    canal.is_active = False
    await db.commit()


# ── GET /canales/transferencias ────────────────────────────────────────────────

@router.get("/transferencias", response_model=List[TransferenciaResponse], summary="Listar transferencias")
async def listar_transferencias(
    fecha_inicio: Optional[date] = None,
    fecha_fin: Optional[date] = None,
    canal: Optional[str] = None,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    stmt = select(CanalTransferencia).where(
        CanalTransferencia.tenant_id == current_user.tenant_id
    )
    if fecha_inicio:
        stmt = stmt.where(
            CanalTransferencia.fecha >= datetime.combine(fecha_inicio, datetime.min.time())
        )
    if fecha_fin:
        stmt = stmt.where(
            CanalTransferencia.fecha <= datetime.combine(fecha_fin, datetime.max.time())
        )
    if canal:
        stmt = stmt.where(
            (CanalTransferencia.canal_origen == canal) |
            (CanalTransferencia.canal_destino == canal)
        )

    stmt = stmt.order_by(CanalTransferencia.fecha.desc()).offset((page - 1) * limit).limit(limit)
    result = await db.execute(stmt)
    return result.scalars().all()


# ── POST /canales/transferencias ───────────────────────────────────────────────

@router.post("/transferencias", response_model=TransferenciaResponse, status_code=201, summary="Registrar transferencia")
async def crear_transferencia(
    body: TransferenciaCreate,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_admin_or_above),
):
    if body.canal_origen == body.canal_destino:
        raise HTTPException(status_code=422, detail="El canal origen y destino no pueden ser iguales")
    if body.monto <= 0:
        raise HTTPException(status_code=422, detail="El monto debe ser mayor a 0")

    transferencia = CanalTransferencia(
        tenant_id=current_user.tenant_id,
        canal_origen=body.canal_origen,
        canal_destino=body.canal_destino,
        monto=body.monto,
        fecha=body.fecha or datetime.utcnow(),
        notas=body.notas,
        registrado_por=current_user.username,
    )
    db.add(transferencia)
    await db.commit()
    await db.refresh(transferencia)
    return transferencia


# ── DELETE /canales/transferencias/{id} ───────────────────────────────────────

@router.delete("/transferencias/{transferencia_id}", status_code=204, summary="Revertir transferencia")
async def eliminar_transferencia(
    transferencia_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_admin_or_above),
):
    result = await db.execute(
        select(CanalTransferencia).where(
            CanalTransferencia.id == transferencia_id,
            CanalTransferencia.tenant_id == current_user.tenant_id,
        )
    )
    t = result.scalars().first()
    if not t:
        raise HTTPException(status_code=404, detail="Transferencia no encontrada")
    await db.delete(t)
    await db.commit()
