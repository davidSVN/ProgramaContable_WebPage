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

router = APIRouter(prefix="/wompi", tags=["Wompi Payments"])


@router.post("/create-payment", response_model=PaymentIntegrityResponse)
async def create_payment(
    body: CreatePaymentRequest,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Crea un registro de pago pendiente y retorna los datos necesarios
    para abrir el checkout de Wompi en el frontend.
    """
    if body.plan not in ("basic", "premium"):
        raise HTTPException(status_code=400, detail="Plan inválido. Debe ser 'basic' o 'premium'.")

    if body.period not in ("monthly", "yearly"):
        raise HTTPException(status_code=400, detail="Período inválido. Debe ser 'monthly' o 'yearly'.")

    if current_user.tenant_id is None:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asociado.")

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


@router.post("/webhook")
async def wompi_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Endpoint que recibe los eventos de Wompi (webhook).

    IMPORTANTE: Este endpoint NO requiere autenticación JWT porque
    es llamado directamente por los servidores de Wompi.
    """
    try:
        event_data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="JSON inválido")

    logger.info(f"Webhook recibido de Wompi: {event_data.get('event', 'unknown')}")

    if not wompi_service.verify_event_signature(event_data):
        logger.warning("Webhook con firma inválida rechazado")
        raise HTTPException(status_code=401, detail="Firma inválida")

    event_type = event_data.get("event", "")
    data = event_data.get("data", {})
    transaction_data = data.get("transaction", {})

    if event_type != "transaction.updated":
        return {"status": "ignored", "event": event_type}

    reference = transaction_data.get("reference", "")
    wompi_id = transaction_data.get("id", "")
    tx_status = transaction_data.get("status", "")
    payment_method_data = transaction_data.get("payment_method", {})
    payment_method_type = payment_method_data.get("type", "") if payment_method_data else ""

    logger.info(f"Procesando transacción: ref={reference}, status={tx_status}")

    if tx_status == "APPROVED":
        result = await wompi_service.process_approved_transaction(
            db=db,
            reference=reference,
            wompi_transaction_id=wompi_id,
            payment_method=payment_method_type,
        )
        if result:
            logger.info(f"Pago aprobado: ref={reference}, plan={result.plan}")
        else:
            logger.warning(f"Transacción no encontrada para referencia: {reference}")

    elif tx_status in ("DECLINED", "VOIDED", "ERROR"):
        await wompi_service.process_failed_transaction(
            db=db,
            reference=reference,
            status=tx_status,
            wompi_transaction_id=wompi_id,
        )
        logger.info(f"Pago fallido: ref={reference}, status={tx_status}")

    return {"status": "ok"}


@router.get("/verify/{reference}", response_model=PaymentTransactionResponse)
async def verify_payment(
    reference: str,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Verifica el estado de un pago por su referencia.
    El frontend llama a este endpoint después de que el usuario
    regresa del checkout de Wompi.
    """
    stmt = select(PaymentTransaction).where(
        PaymentTransaction.reference == reference,
        PaymentTransaction.tenant_id == current_user.tenant_id,
    )
    result = await db.execute(stmt)
    transaction = result.scalars().first()

    if not transaction:
        raise HTTPException(status_code=404, detail="Transacción no encontrada")

    if transaction.status == "PENDING" and transaction.wompi_transaction_id:
        wompi_data = await wompi_service.verify_transaction_with_wompi(
            transaction.wompi_transaction_id
        )
        if wompi_data:
            tx_status = wompi_data.get("status", "")
            if tx_status == "APPROVED":
                transaction = await wompi_service.process_approved_transaction(
                    db=db,
                    reference=reference,
                    wompi_transaction_id=wompi_data.get("id", ""),
                    payment_method=wompi_data.get("payment_method", {}).get("type", ""),
                )
            elif tx_status in ("DECLINED", "VOIDED", "ERROR"):
                transaction = await wompi_service.process_failed_transaction(
                    db=db,
                    reference=reference,
                    status=tx_status,
                    wompi_transaction_id=wompi_data.get("id", ""),
                )

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
    }


@router.post("/save-payment-source")
async def save_payment_source(
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Recibe un token de tarjeta del widget de Wompi,
    crea una fuente de pago y la guarda en el tenant.
    """
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


@router.post("/process-renewals")
async def process_renewals_endpoint(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Endpoint interno para procesar renovaciones automáticas.
    Protegido por CRON_SECRET en el header X-Cron-Secret.
    Llamar diariamente desde cron-job.org o similar.
    """
    cron_secret = os.getenv("CRON_SECRET", "")
    if not cron_secret or request.headers.get("X-Cron-Secret") != cron_secret:
        raise HTTPException(status_code=401, detail="No autorizado")

    results = await wompi_service.process_recurring_renewals(db)
    return {"processed": len(results), "results": results}
