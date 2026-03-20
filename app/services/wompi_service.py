import os
import hashlib
import time
from datetime import datetime, timedelta
from typing import Optional

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from dotenv import load_dotenv

from app.models import PaymentTransaction, Tenant

load_dotenv()

# ─── Configuración ───────────────────────────────────────────────────────────

WOMPI_PUBLIC_KEY = os.getenv("WOMPI_PUBLIC_KEY", "")
WOMPI_PRIVATE_KEY = os.getenv("WOMPI_PRIVATE_KEY", "")
WOMPI_EVENTS_SECRET = os.getenv("WOMPI_EVENTS_SECRET", "")
WOMPI_INTEGRITY_SECRET = os.getenv("WOMPI_INTEGRITY_SECRET", "")
WOMPI_API_URL = os.getenv("WOMPI_API_URL", "https://sandbox.wompi.co/v1")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

# ─── Precios en centavos ─────────────────────────────────────────────────────

PLAN_PRICES = {
    "basic": {
        "monthly": 4990000,     # $49.900 COP
        "yearly": 47900000,     # $479.000 COP (ahorra 2 meses)
    },
    "premium": {
        "monthly": 8990000,     # $89.900 COP
        "yearly": 86200000,     # $862.000 COP (ahorra 2 meses)
    },
}


def get_price(plan: str, period: str) -> int:
    """Retorna el precio en centavos para un plan y período."""
    if plan not in PLAN_PRICES or period not in PLAN_PRICES[plan]:
        raise ValueError(f"Plan o período inválido: {plan}/{period}")
    return PLAN_PRICES[plan][period]


def generate_reference(tenant_id: int) -> str:
    """Genera una referencia única para la transacción."""
    timestamp = int(time.time() * 1000)
    return f"WF-{tenant_id}-{timestamp}"


def generate_integrity_signature(reference: str, amount_in_cents: int, currency: str = "COP") -> str:
    """
    Genera la firma de integridad SHA256 para el checkout de Wompi.

    La firma se genera concatenando:
    referencia + monto_en_centavos + moneda + secreto_de_integridad
    """
    cadena = f"{reference}{amount_in_cents}{currency}{WOMPI_INTEGRITY_SECRET}"
    return hashlib.sha256(cadena.encode("utf-8")).hexdigest()


def verify_event_signature(event_data: dict) -> bool:
    """
    Verifica que un webhook realmente viene de Wompi.

    Wompi envía un objeto 'signature' con:
    - properties: lista de campos del objeto data a concatenar
    - checksum: el hash SHA256 esperado
    """
    try:
        signature = event_data.get("signature", {})
        properties = signature.get("properties", [])
        checksum = signature.get("checksum", "")
        timestamp = event_data.get("timestamp", "")
        data = event_data.get("data", {})

        concat_values = ""
        for prop in properties:
            keys = prop.split(".")
            value = data
            for key in keys:
                if isinstance(value, dict):
                    value = value.get(key, "")
                else:
                    value = ""
                    break
            concat_values += str(value)

        concat_values += str(timestamp)
        concat_values += WOMPI_EVENTS_SECRET

        calculated_checksum = hashlib.sha256(concat_values.encode("utf-8")).hexdigest()

        return calculated_checksum == checksum
    except Exception:
        return False


async def create_payment_record(
    db: AsyncSession,
    tenant_id: int,
    plan: str,
    period: str,
) -> PaymentTransaction:
    """Crea un registro de transacción pendiente."""
    amount = get_price(plan, period)
    reference = generate_reference(tenant_id)

    transaction = PaymentTransaction(
        tenant_id=tenant_id,
        reference=reference,
        plan=plan,
        billing_period=period,
        amount_in_cents=amount,
        currency="COP",
        status="PENDING",
    )

    db.add(transaction)
    await db.commit()
    await db.refresh(transaction)

    return transaction


async def process_approved_transaction(
    db: AsyncSession,
    reference: str,
    wompi_transaction_id: str,
    payment_method: Optional[str] = None,
) -> Optional[PaymentTransaction]:
    """
    Procesa una transacción aprobada:
    1. Actualiza el registro de PaymentTransaction
    2. Activa el plan en el Tenant
    3. Calcula la fecha de expiración
    """
    stmt = select(PaymentTransaction).where(PaymentTransaction.reference == reference)
    result = await db.execute(stmt)
    transaction = result.scalars().first()

    if not transaction:
        return None

    if transaction.status == "APPROVED":
        return transaction

    now = datetime.utcnow()
    if transaction.billing_period == "yearly":
        expires_at = now + timedelta(days=365)
    else:
        expires_at = now + timedelta(days=30)

    transaction.status = "APPROVED"
    transaction.wompi_transaction_id = wompi_transaction_id
    transaction.payment_method = payment_method
    transaction.plan_expires_at = expires_at
    transaction.updated_at = now

    tenant = await db.get(Tenant, transaction.tenant_id)
    if tenant:
        tenant.plan = transaction.plan
        tenant.plan_expires_at = expires_at
        tenant.last_payment_reference = reference

        if transaction.plan == "premium":
            tenant.max_usuarios = max(tenant.max_usuarios, 15)
        elif transaction.plan == "basic":
            tenant.max_usuarios = max(tenant.max_usuarios, 5)

    await db.commit()
    await db.refresh(transaction)

    return transaction


async def process_failed_transaction(
    db: AsyncSession,
    reference: str,
    status: str,
    wompi_transaction_id: Optional[str] = None,
) -> Optional[PaymentTransaction]:
    """Marca una transacción como fallida (DECLINED, VOIDED, ERROR)."""
    stmt = select(PaymentTransaction).where(PaymentTransaction.reference == reference)
    result = await db.execute(stmt)
    transaction = result.scalars().first()

    if not transaction:
        return None

    transaction.status = status
    transaction.wompi_transaction_id = wompi_transaction_id
    transaction.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(transaction)

    return transaction


async def verify_transaction_with_wompi(transaction_id: str) -> Optional[dict]:
    """
    Consulta directamente a Wompi el estado de una transacción.
    Verificación adicional al webhook (doble check).
    """
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{WOMPI_API_URL}/transactions/{transaction_id}",
                headers={"Authorization": f"Bearer {WOMPI_PRIVATE_KEY}"},
            )
            if response.status_code == 200:
                return response.json().get("data", {})
    except Exception:
        pass
    return None
