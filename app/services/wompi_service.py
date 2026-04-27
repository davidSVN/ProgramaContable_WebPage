import os
import hashlib
import time
from datetime import datetime, timedelta
from typing import Optional

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from dotenv import load_dotenv

from app.models import PaymentTransaction, Tenant, AppUser

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
        "monthly": 1000,
        "yearly": 1000,
        "trial": 1000,
    },
    "premium": {
        "monthly": 1100,
        "yearly": 1100,
        "trial": 1100,
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
    if period not in ("monthly", "yearly", "trial"):
        raise ValueError(f"Período inválido: {period}")
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
    elif transaction.billing_period == "trial":
        expires_at = now + timedelta(days=7)
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


async def find_transaction_by_reference(reference: str) -> Optional[dict]:
    """
    Busca una transacción en Wompi por NUESTRA referencia (WF-xxx-timestamp).
    Útil cuando el webhook no llegó y no tenemos wompi_transaction_id todavía.
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{WOMPI_API_URL}/transactions",
                params={"reference": reference},
                headers={"Authorization": f"Bearer {WOMPI_PRIVATE_KEY}"},
            )
            if response.status_code == 200:
                result = response.json()
                data = result.get("data", [])
                if isinstance(data, list) and len(data) > 0:
                    return data[0]
                elif isinstance(data, dict) and data.get("id"):
                    return data
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Error consultando Wompi por referencia {reference}: {e}")
    return None


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

# ─── Tokenización y cobro recurrente ─────────────────────────────────────────

async def get_acceptance_token() -> str:
    """
    Obtiene el token de aceptación de términos de Wompi.
    Requerido para crear fuentes de pago.
    """
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{WOMPI_API_URL}/merchants/{WOMPI_PUBLIC_KEY}",
        )
        data = response.json().get("data", {})
        return data.get("presigned_acceptance", {}).get("acceptance_token", "")


async def tokenize_card_and_create_source(
    token: str,
    customer_email: str,
    acceptance_token: str,
) -> dict:
    """
    Crea una fuente de pago en Wompi a partir de un token de tarjeta.
    Retorna el payment_source_id y datos de la tarjeta.
    """
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{WOMPI_API_URL}/payment_sources",
            json={
                "type": "CARD",
                "token": token,
                "customer_email": customer_email,
                "acceptance_token": acceptance_token,
            },
            headers={"Authorization": f"Bearer {WOMPI_PRIVATE_KEY}"},
        )

        if response.status_code not in (200, 201):
            raise Exception(f"Error creando fuente de pago: {response.text}")

        data = response.json().get("data", {})
        return {
            "payment_source_id": data.get("id"),
            "last_four": data.get("public_data", {}).get("last_four"),
            "brand": data.get("public_data", {}).get("type"),
        }


async def charge_with_payment_source(
    payment_source_id: int,
    amount_in_cents: int,
    reference: str,
    customer_email: str,
) -> dict:
    """
    Cobra automáticamente usando una fuente de pago guardada.
    No requiere intervención del usuario.
    """
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{WOMPI_API_URL}/transactions",
            json={
                "amount_in_cents": amount_in_cents,
                "currency": "COP",
                "customer_email": customer_email,
                "reference": reference,
                "payment_source_id": payment_source_id,
                "recurrent": True,
            },
            headers={"Authorization": f"Bearer {WOMPI_PRIVATE_KEY}"},
        )

        if response.status_code not in (200, 201):
            raise Exception(f"Error en cobro recurrente: {response.text}")

        return response.json().get("data", {})


async def process_recurring_renewals(db: AsyncSession) -> list:
    """
    Busca tenants cuyo plan vence HOY o ya venció,
    que tengan auto_renew=True y payment_source_id,
    e intenta cobrarles automáticamente.
    """
    from sqlalchemy import and_, or_

    now = datetime.utcnow()

    stmt = select(Tenant).where(
        and_(
            Tenant.plan.in_(["basic", "premium"]),
            Tenant.wompi_payment_source_id.isnot(None),
            Tenant.auto_renew == True,
            Tenant.plan_expires_at <= now,
            or_(
                Tenant.renewal_failed_at.is_(None),
                Tenant.renewal_failed_at < now - timedelta(hours=24),
            ),
        )
    )

    result = await db.execute(stmt)
    tenants = result.scalars().all()

    results = []

    for tenant in tenants:
        try:
            # Buscar último período de facturación
            last_tx_stmt = (
                select(PaymentTransaction)
                .where(
                    PaymentTransaction.tenant_id == tenant.id,
                    PaymentTransaction.status == "APPROVED",
                )
                .order_by(PaymentTransaction.created_at.desc())
                .limit(1)
            )
            last_tx_result = await db.execute(last_tx_stmt)
            last_tx = last_tx_result.scalars().first()

            billing_period = last_tx.billing_period if last_tx else "monthly"

            # Si el último pago fue trial, el siguiente debe ser monthly
            if billing_period == "trial":
                billing_period = "monthly"

            amount = get_price(tenant.plan, billing_period)
            reference = generate_reference(tenant.id)

            # Obtener email del admin del tenant
            admin_stmt = (
                select(AppUser)
                .where(AppUser.tenant_id == tenant.id, AppUser.role == "admin")
                .limit(1)
            )
            admin_result = await db.execute(admin_stmt)
            admin = admin_result.scalars().first()

            if not admin:
                continue

            # Crear registro de transacción pendiente
            transaction = PaymentTransaction(
                tenant_id=tenant.id,
                reference=reference,
                plan=tenant.plan,
                billing_period="monthly",  # Siempre monthly en renovaciones
                amount_in_cents=amount,
                currency="COP",
                status="PENDING",
            )
            db.add(transaction)
            await db.commit()

            # Cobrar con la fuente de pago guardada
            wompi_response = await charge_with_payment_source(
                payment_source_id=tenant.wompi_payment_source_id,
                amount_in_cents=amount,
                reference=reference,
                customer_email=admin.email,
            )

            # El webhook se encarga de actualizar el estado final
            results.append({
                "tenant_id": tenant.id,
                "reference": reference,
                "status": "charge_initiated",
                "wompi_id": wompi_response.get("id"),
            })

        except Exception as e:
            tenant.renewal_failed_at = now
            tenant.grace_period_ends_at = now + timedelta(days=5)
            await db.commit()

            results.append({
                "tenant_id": tenant.id,
                "status": "failed",
                "error": str(e),
            })

    return results


async def downgrade_expired_plans(db: AsyncSession) -> list:
    """
    Aplica periodo de gracia o degrada a 'none' los planes vencidos sin renovación.
    - Si plan vencido y sin gracia iniciada: inicia gracia (5 días desde vencimiento)
    - Si gracia vencida: plan = "none"
    Debe llamarse DESPUÉS de process_recurring_renewals para no degradar
    a tenants que acaban de renovar.
    """
    from sqlalchemy import and_

    now = datetime.utcnow()

    stmt = select(Tenant).where(
        and_(
            Tenant.plan.in_(["basic", "premium"]),
            Tenant.plan_expires_at.isnot(None),
            Tenant.plan_expires_at <= now,
        )
    )
    result = await db.execute(stmt)
    tenants = result.scalars().all()

    results = []

    for tenant in tenants:
        try:
            if tenant.grace_period_ends_at is None:
                tenant.grace_period_ends_at = tenant.plan_expires_at + timedelta(days=5)
                results.append({
                    "tenant_id": tenant.id,
                    "action": "grace_period_started",
                    "grace_ends_at": tenant.grace_period_ends_at.isoformat(),
                })
            elif tenant.grace_period_ends_at < now:
                tenant.plan = "none"
                tenant.wompi_payment_source_id = None
                tenant.renewal_failed_at = None
                tenant.grace_period_ends_at = None
                results.append({
                    "tenant_id": tenant.id,
                    "action": "downgraded_to_none",
                })
        except Exception as e:
            results.append({
                "tenant_id": tenant.id,
                "action": "error",
                "error": str(e),
            })

    await db.commit()
    return results
