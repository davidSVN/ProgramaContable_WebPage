import logging
import os
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.dependencies import get_current_user
from app.models import AppUser, PaymentTransaction, Tenant
from app.schemas import (
    CreatePaymentRequest,
    PaymentIntegrityResponse,
    PaymentTransactionResponse,
    PaymentHistoryResponse,
)
from app.services import wompi_service

logger = logging.getLogger(__name__)

# ─── Router autenticado (requiere JWT) ───────────────────────────────────────
router = APIRouter(prefix="/wompi", tags=["Wompi Payments"])

# ─── Router público (sin JWT — usado por Wompi para webhooks) ────────────────
public_router = APIRouter(prefix="/wompi", tags=["Wompi Webhook"])


# ── Endpoints públicos ────────────────────────────────────────────────────────

@public_router.get("/webhook-test")
async def webhook_test():
    """Verifica que el endpoint del webhook es alcanzable sin JWT."""
    return {"status": "ok", "message": "Webhook endpoint is reachable", "jwt_required": False}


@public_router.post("/webhook")
async def wompi_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Recibe eventos de Wompi. NO requiere JWT.
    La seguridad está en la verificación de la firma SHA256.
    """
    logger.info("=" * 60)
    logger.info("WOMPI WEBHOOK RECIBIDO")

    try:
        event_data = await request.json()
    except Exception as e:
        logger.error(f"Error parseando JSON: {str(e)}")
        raise HTTPException(status_code=400, detail="JSON inválido")

    event_type = event_data.get("event", "unknown")
    data = event_data.get("data", {})
    transaction_data = data.get("transaction", {})
    reference = transaction_data.get("reference", "")
    wompi_id = transaction_data.get("id", "")
    tx_status = transaction_data.get("status", "")

    logger.info(f"Evento: {event_type}")
    logger.info(f"Referencia: {reference}")
    logger.info(f"Wompi ID: {wompi_id}")
    logger.info(f"Status Wompi: {tx_status}")

    signature_valid = wompi_service.verify_event_signature(event_data)
    logger.info(f"Firma válida: {signature_valid}")

    if not signature_valid:
        logger.warning("FIRMA INVÁLIDA — Rechazando webhook")
        raise HTTPException(status_code=401, detail="Firma inválida")

    if event_type != "transaction.updated":
        logger.info(f"Evento ignorado (no es transaction.updated): {event_type}")
        return {"status": "ignored"}

    payment_method_data = transaction_data.get("payment_method", {})
    payment_method_type = payment_method_data.get("type", "") if isinstance(payment_method_data, dict) else ""

    if tx_status == "APPROVED":
        logger.info(f"Procesando APROBADO: ref={reference}")
        result = await wompi_service.process_approved_transaction(
            db=db,
            reference=reference,
            wompi_transaction_id=wompi_id,
            payment_method=payment_method_type,
        )
        if result:
            logger.info(f"PLAN ACTIVADO: tenant={result.tenant_id}, plan={result.plan}")
        else:
            logger.error(f"No se encontró transacción para referencia: {reference}")

    elif tx_status in ("DECLINED", "VOIDED", "ERROR"):
        logger.info(f"Procesando FALLIDO: ref={reference}, status={tx_status}")
        await wompi_service.process_failed_transaction(
            db=db, reference=reference, status=tx_status, wompi_transaction_id=wompi_id,
        )

    logger.info("WEBHOOK PROCESADO OK")
    logger.info("=" * 60)
    return {"status": "ok"}


@public_router.post("/process-renewals")
async def process_renewals_endpoint(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Endpoint interno para procesar renovaciones automáticas.
    Protegido por CRON_SECRET en el header X-Cron-Secret.
    """
    cron_secret = os.getenv("CRON_SECRET", "")
    if not cron_secret or request.headers.get("X-Cron-Secret") != cron_secret:
        raise HTTPException(status_code=401, detail="No autorizado")

    results = await wompi_service.process_recurring_renewals(db)
    return {"processed": len(results), "results": results}


# ── Endpoints autenticados ────────────────────────────────────────────────────

@router.post("/create-payment", response_model=PaymentIntegrityResponse)
async def create_payment(
    body: CreatePaymentRequest,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Crea un registro de pago pendiente y retorna los datos para el checkout de Wompi."""
    if body.plan not in ("basic", "premium"):
        raise HTTPException(status_code=400, detail="Plan inválido. Debe ser 'basic' o 'premium'.")

    if body.period not in ("monthly", "yearly", "trial"):
        raise HTTPException(status_code=400, detail="Período inválido. Debe ser 'monthly', 'yearly' o 'trial'.")

    if current_user.tenant_id is None:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asociado.")

    # El trial solo está disponible si el tenant nunca ha tenido ningún pago aprobado
    if body.period == "trial":
        existing_payment = await db.execute(
            select(PaymentTransaction).where(
                PaymentTransaction.tenant_id == current_user.tenant_id,
                PaymentTransaction.status == "APPROVED",
            )
        )
        if existing_payment.scalars().first():
            raise HTTPException(
                status_code=400,
                detail="El período de prueba solo está disponible para cuentas nuevas. Selecciona el plan mensual o anual.",
            )

    transaction = await wompi_service.create_payment_record(
        db=db,
        tenant_id=current_user.tenant_id,
        plan=body.plan,
        period=body.period,
    )

    signature = wompi_service.generate_integrity_signature(
        reference=transaction.reference,
        amount_in_cents=transaction.amount_in_cents,
        currency=transaction.currency,
    )

    redirect_url = f"{wompi_service.FRONTEND_URL}/dashboard?payment_ref={transaction.reference}"

    return PaymentIntegrityResponse(
        reference=transaction.reference,
        amount_in_cents=transaction.amount_in_cents,
        currency=transaction.currency,
        integrity_signature=signature,
        public_key=wompi_service.WOMPI_PUBLIC_KEY,
        redirect_url=redirect_url,
    )


@router.get("/verify/{reference}")
async def verify_payment(
    reference: str,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Verifica el estado de un pago. Si está PENDING en nuestra DB,
    consulta directamente a Wompi por referencia y actualiza.
    Es el respaldo del webhook — si el webhook no llegó, el polling
    del frontend usa este endpoint para obtener el estado real.
    """
    stmt = select(PaymentTransaction).where(
        PaymentTransaction.reference == reference,
        PaymentTransaction.tenant_id == current_user.tenant_id,
    )
    result = await db.execute(stmt)
    transaction = result.scalars().first()

    if not transaction:
        raise HTTPException(status_code=404, detail="Transacción no encontrada")

    # Si ya tiene estado final, retornar directamente
    if transaction.status in ("APPROVED", "DECLINED", "VOIDED", "ERROR"):
        return transaction

    # Si está PENDING, consultar directamente a Wompi por nuestra referencia
    logger.info(f"Transacción PENDING, consultando Wompi por referencia: {reference}")

    try:
        wompi_data = await wompi_service.find_transaction_by_reference(reference)

        if wompi_data:
            tx_status = wompi_data.get("status", "")
            wompi_id = wompi_data.get("id", "")
            pm = wompi_data.get("payment_method", {})
            pm_type = pm.get("type", "") if isinstance(pm, dict) else ""

            logger.info(f"Wompi responde: status={tx_status}, id={wompi_id}")

            if tx_status == "APPROVED":
                transaction = await wompi_service.process_approved_transaction(
                    db=db,
                    reference=reference,
                    wompi_transaction_id=wompi_id,
                    payment_method=pm_type,
                )
            elif tx_status in ("DECLINED", "VOIDED", "ERROR"):
                transaction = await wompi_service.process_failed_transaction(
                    db=db,
                    reference=reference,
                    status=tx_status,
                    wompi_transaction_id=wompi_id,
                )
    except Exception as e:
        logger.error(f"Error verificando con Wompi: {str(e)}")

    await db.refresh(transaction)
    return transaction


@router.get("/payment-history", response_model=PaymentHistoryResponse)
async def payment_history(
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Retorna el historial de pagos del tenant actual."""
    stmt = (
        select(PaymentTransaction)
        .where(PaymentTransaction.tenant_id == current_user.tenant_id)
        .order_by(PaymentTransaction.created_at.desc())
        .limit(20)
    )
    result = await db.execute(stmt)
    transactions = result.scalars().all()

    tenant = await db.get(Tenant, current_user.tenant_id) if current_user.tenant_id else None

    return PaymentHistoryResponse(
        transactions=[PaymentTransactionResponse.model_validate(t) for t in transactions],
        current_plan=tenant.plan if tenant else "none",
        plan_expires_at=tenant.plan_expires_at if tenant else None,
    )


@router.get("/subscription-status")
async def subscription_status(
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Estado completo de la suscripción: días restantes, tarjeta guardada, auto-renovación."""
    if not current_user.tenant_id:
        return {"plan": "none", "days_remaining": 0}

    tenant = await db.get(Tenant, current_user.tenant_id)
    if not tenant:
        return {"plan": "none", "days_remaining": 0}

    days_remaining = 0
    if tenant.plan_expires_at:
        delta = tenant.plan_expires_at - datetime.utcnow()
        days_remaining = max(0, delta.days)

    # El trial no está disponible si el tenant tiene cualquier pago aprobado previo
    any_payment_stmt = select(PaymentTransaction).where(
        PaymentTransaction.tenant_id == tenant.id,
        PaymentTransaction.status == "APPROVED",
    )
    any_payment_result = await db.execute(any_payment_stmt)
    has_used_trial = any_payment_result.scalars().first() is not None

    return {
        "plan": tenant.plan,
        "plan_expires_at": tenant.plan_expires_at.isoformat() if tenant.plan_expires_at else None,
        "days_remaining": days_remaining,
        "auto_renew": tenant.auto_renew,
        "has_payment_source": tenant.wompi_payment_source_id is not None,
        "card_last_four": tenant.card_last_four,
        "card_brand": tenant.card_brand,
        "renewal_failed": tenant.renewal_failed_at is not None,
        "grace_period_ends_at": tenant.grace_period_ends_at.isoformat() if tenant.grace_period_ends_at else None,
        "is_in_grace_period": (
            tenant.grace_period_ends_at is not None
            and tenant.grace_period_ends_at > datetime.utcnow()
        ),
        "has_used_trial": has_used_trial,
    }


@router.post("/save-payment-source")
async def save_payment_source(
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Recibe un token de tarjeta, crea una fuente de pago y la guarda en el tenant."""
    token = body.get("token")
    if not token:
        raise HTTPException(status_code=400, detail="Token requerido")

    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant")

    try:
        acceptance_token = await wompi_service.get_acceptance_token()
        source_data = await wompi_service.tokenize_card_and_create_source(
            token=token,
            customer_email=current_user.email,
            acceptance_token=acceptance_token,
        )

        tenant = await db.get(Tenant, current_user.tenant_id)
        if tenant:
            tenant.wompi_payment_source_id = source_data["payment_source_id"]
            tenant.card_last_four = source_data.get("last_four", "")
            tenant.card_brand = source_data.get("brand", "")
            tenant.auto_renew = True
            await db.commit()

        return {
            "status": "ok",
            "last_four": source_data.get("last_four"),
            "brand": source_data.get("brand"),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/toggle-auto-renew")
async def toggle_auto_renew(
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Activa o desactiva la renovación automática del tenant."""
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant")

    tenant = await db.get(Tenant, current_user.tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant no encontrado")

    tenant.auto_renew = body.get("auto_renew", True)
    await db.commit()

    return {"auto_renew": tenant.auto_renew}
