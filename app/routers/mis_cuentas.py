"""
Router: /api/mis-cuentas

Saldo real por canal calculado a partir de:
  - Ingresos: OrderPayment + AbonoInstitucional
  - Gastos: SpentBusiness
  - Transferencias internas: ChannelTransfer
  - Ajustes de calibración: AppSettings  ← para reconciliar saldos históricos

Las órdenes y gastos NO cambian su método de pago histórico; sólo la tabla
channel_transfers registra movimientos entre cuentas.

CALIBRACIÓN
-----------
El saldo calculado puede no coincidir con la realidad si el negocio tiene
movimientos físicos anteriores no registrados en el sistema.
El endpoint PUT /calibrar permite guardar el saldo real conocido por canal.
El sistema almacena un ajuste = saldo_real - saldo_calculado en AppSettings
con clave "canal_ajuste_{channel}". El saldo mostrado siempre será:
  saldo_calculado + ajuste
"""

import json
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_admin_or_above
from app.models import (
    AppUser, AppSettings, OrderPayment, AbonoInstitucional,
    SpentBusiness, ChannelTransfer, OrderHeader,
)
from app.schemas import (
    ChannelTransferCreate, ChannelTransferOut,
    ChannelBalance, MisCuentasResponse,
)

router = APIRouter(prefix="/mis-cuentas", tags=["Mis Cuentas"])

_AJUSTE_PREFIX = "canal_ajuste_"


# ── helpers ───────────────────────────────────────────────────────────────────

def _require_tenant(user: AppUser) -> int:
    if not user.tenant_id:
        raise HTTPException(403, "Sólo disponible para usuarios de un negocio")
    return user.tenant_id


async def _get_adjustments(db: AsyncSession, tenant_id: int) -> dict[str, float]:
    """Lee los ajustes de calibración guardados en AppSettings."""
    result = await db.execute(
        select(AppSettings).where(
            AppSettings.tenant_id == tenant_id,
            AppSettings.key.like(f"{_AJUSTE_PREFIX}%"),
        )
    )
    rows = result.scalars().all()
    return {
        row.key[len(_AJUSTE_PREFIX):]: float(row.value)
        for row in rows
    }


async def _channel_balances(db: AsyncSession, tenant_id: int) -> dict[str, dict]:
    """Calcula ingresos, gastos y transferencias por canal."""
    canales: dict[str, dict] = {}

    def _get(ch: str) -> dict:
        key = (ch or "").strip().lower()
        if key not in canales:
            canales[key] = {
                "ingresos": 0.0,
                "gastos": 0.0,
                "transferencias_in": 0.0,
                "transferencias_out": 0.0,
            }
        return canales[key]

    # Ingresos B2C: pagos de órdenes
    rows = await db.execute(
        select(OrderPayment.payment_method, func.sum(OrderPayment.amount))
        .where(OrderPayment.tenant_id == tenant_id)
        .group_by(OrderPayment.payment_method)
    )
    for method, total in rows.all():
        _get(method)["ingresos"] += float(total or 0)

    # Ingresos B2B: abonos institucionales
    rows = await db.execute(
        select(AbonoInstitucional.payment_method, func.sum(AbonoInstitucional.amount))
        .where(AbonoInstitucional.tenant_id == tenant_id)
        .group_by(AbonoInstitucional.payment_method)
    )
    for method, total in rows.all():
        _get(method)["ingresos"] += float(total or 0)

    # Gastos
    rows = await db.execute(
        select(SpentBusiness.spent_payment_method, func.sum(SpentBusiness.spent_value))
        .where(SpentBusiness.tenant_id == tenant_id)
        .group_by(SpentBusiness.spent_payment_method)
    )
    for method, total in rows.all():
        _get(method)["gastos"] += float(total or 0)

    # Transferencias internas
    rows = await db.execute(
        select(ChannelTransfer.from_channel, ChannelTransfer.to_channel, ChannelTransfer.amount)
        .where(ChannelTransfer.tenant_id == tenant_id)
    )
    for from_ch, to_ch, amount in rows.all():
        _get(from_ch)["transferencias_out"] += float(amount or 0)
        _get(to_ch)["transferencias_in"] += float(amount or 0)

    return canales


async def _ordenes_por_cobrar(db: AsyncSession, tenant_id: int) -> float:
    result = await db.execute(
        select(func.sum(OrderHeader.balance_due))
        .where(
            OrderHeader.tenant_id == tenant_id,
            OrderHeader.balance_due > 0,
            OrderHeader.order_status != "Cancelada",
        )
    )
    return float(result.scalar() or 0)


# ── endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=MisCuentasResponse)
async def get_mis_cuentas(
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    tenant_id = _require_tenant(current_user)
    raw = await _channel_balances(db, tenant_id)
    adjustments = await _get_adjustments(db, tenant_id)

    canales_out: list[ChannelBalance] = []
    total_saldo = 0.0

    for ch, data in sorted(raw.items()):
        saldo_calculado = (
            data["ingresos"]
            - data["gastos"]
            + data["transferencias_in"]
            - data["transferencias_out"]
        )
        ajuste = adjustments.get(ch, 0.0)
        saldo_final = saldo_calculado + ajuste

        canales_out.append(ChannelBalance(
            channel=ch,
            ingresos=data["ingresos"],
            gastos=data["gastos"],
            transferencias_in=data["transferencias_in"],
            transferencias_out=data["transferencias_out"],
            ajuste=ajuste,
            saldo=saldo_final,
        ))
        total_saldo += saldo_final

    # Canales calibrados que no tienen transacciones aún también deben aparecer
    for ch, ajuste in adjustments.items():
        if ch not in raw and ajuste != 0:
            canales_out.append(ChannelBalance(
                channel=ch,
                ingresos=0.0,
                gastos=0.0,
                transferencias_in=0.0,
                transferencias_out=0.0,
                ajuste=ajuste,
                saldo=ajuste,
            ))
            total_saldo += ajuste

    por_cobrar = await _ordenes_por_cobrar(db, tenant_id)

    result = await db.execute(
        select(ChannelTransfer)
        .where(ChannelTransfer.tenant_id == tenant_id)
        .order_by(ChannelTransfer.transfer_date.desc())
        .limit(100)
    )
    transferencias = result.scalars().all()

    # total_ingresos y total_gastos son el bruto real (sin ajustes), útil para
    # el cuadre contable: net_income = en_bancos + por_cobrar
    total_ingresos = sum(d["ingresos"] for d in raw.values())
    total_gastos = sum(d["gastos"] for d in raw.values())

    return MisCuentasResponse(
        canales=canales_out,
        total_ingresos=total_ingresos,
        total_gastos=total_gastos,
        total_saldo=total_saldo,
        ordenes_por_cobrar=por_cobrar,
        washflow_net_income=total_saldo + por_cobrar,
        transferencias=[ChannelTransferOut.model_validate(t) for t in transferencias],
    )


# ── calibración ───────────────────────────────────────────────────────────────

class CalibracionEntry(BaseModel):
    channel: str
    saldo_real: float   # lo que el usuario sabe que hay físicamente


class CalibracionRequest(BaseModel):
    canales: list[CalibracionEntry]


class CalibracionResponse(BaseModel):
    ajustes: dict[str, float]   # channel → ajuste aplicado


@router.put("/calibrar", response_model=CalibracionResponse)
async def calibrar_saldos(
    payload: CalibracionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_admin_or_above),
):
    """
    Guarda el saldo real conocido por canal.
    El sistema calcula internamente el ajuste = saldo_real - saldo_calculado.
    Desde entonces: saldo_mostrado = saldo_calculado + ajuste = saldo_real + Δ_futuras
    """
    tenant_id = _require_tenant(current_user)
    raw = await _channel_balances(db, tenant_id)
    ajustes_guardados: dict[str, float] = {}

    for entry in payload.canales:
        ch = entry.channel.strip().lower()
        if not ch:
            continue

        data = raw.get(ch, {"ingresos": 0.0, "gastos": 0.0, "transferencias_in": 0.0, "transferencias_out": 0.0})
        saldo_calculado = (
            data["ingresos"]
            - data["gastos"]
            + data["transferencias_in"]
            - data["transferencias_out"]
        )
        ajuste = entry.saldo_real - saldo_calculado
        ajustes_guardados[ch] = ajuste

        key = f"{_AJUSTE_PREFIX}{ch}"
        result = await db.execute(
            select(AppSettings).where(
                AppSettings.tenant_id == tenant_id,
                AppSettings.key == key,
            )
        )
        setting = result.scalar_one_or_none()
        if setting:
            setting.value = str(ajuste)
        else:
            db.add(AppSettings(tenant_id=tenant_id, key=key, value=str(ajuste)))

    await db.commit()
    return CalibracionResponse(ajustes=ajustes_guardados)


@router.delete("/calibrar/{channel}", status_code=204)
async def borrar_calibracion(
    channel: str,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_admin_or_above),
):
    """Elimina el ajuste de calibración de un canal (vuelve al cálculo bruto)."""
    tenant_id = _require_tenant(current_user)
    key = f"{_AJUSTE_PREFIX}{channel.strip().lower()}"
    result = await db.execute(
        select(AppSettings).where(
            AppSettings.tenant_id == tenant_id,
            AppSettings.key == key,
        )
    )
    setting = result.scalar_one_or_none()
    if setting:
        await db.delete(setting)
        await db.commit()


# ── transferencias ────────────────────────────────────────────────────────────

@router.post("/transferencias", response_model=ChannelTransferOut, status_code=201)
async def crear_transferencia(
    payload: ChannelTransferCreate,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    tenant_id = _require_tenant(current_user)

    if payload.from_channel.strip().lower() == payload.to_channel.strip().lower():
        raise HTTPException(400, "from_channel y to_channel no pueden ser iguales")
    if payload.amount <= 0:
        raise HTTPException(400, "El monto debe ser mayor a 0")

    transfer = ChannelTransfer(
        tenant_id=tenant_id,
        from_channel=payload.from_channel.strip().lower(),
        to_channel=payload.to_channel.strip().lower(),
        amount=payload.amount,
        notes=payload.notes,
        transfer_date=payload.transfer_date or datetime.utcnow(),
    )
    db.add(transfer)
    await db.commit()
    await db.refresh(transfer)
    return ChannelTransferOut.model_validate(transfer)


@router.delete("/transferencias/{transfer_id}", status_code=204)
async def eliminar_transferencia(
    transfer_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    tenant_id = _require_tenant(current_user)
    result = await db.execute(
        select(ChannelTransfer).where(
            ChannelTransfer.id == transfer_id,
            ChannelTransfer.tenant_id == tenant_id,
        )
    )
    transfer = result.scalar_one_or_none()
    if not transfer:
        raise HTTPException(404, "Transferencia no encontrada")
    await db.delete(transfer)
    await db.commit()
