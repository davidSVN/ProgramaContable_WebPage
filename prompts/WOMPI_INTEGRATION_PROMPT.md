# IMPLEMENTACIÓN COMPLETA: Pasarela de pagos Wompi para WashFlow

## Contexto del proyecto

WashFlow es una aplicación SaaS multi-tenant para lavanderías, desplegada en Railway.
- **Frontend**: React (Vite), desplegado con dominio propio
- **Backend**: FastAPI (Python), desplegado en Railway con dominio propio
- **Base de datos**: PostgreSQL en Railway
- **Autenticación**: JWT con bcrypt
- **Modelo multi-tenant**: cada negocio (Tenant) tiene un plan: "none" | "basic" | "premium"

## Objetivo

Integrar la pasarela de pagos **Wompi Colombia** para que los usuarios puedan suscribirse a un plan (basic o premium) pagando con tarjeta, Nequi, PSE, Bancolombia QR, Daviplata, etc. El flujo usa el **Widget/Checkout Web de Wompi** (redirección a checkout.wompi.co).

## Precios definidos

| Plan    | Mensual (COP) | Anual (COP)  | Centavos mensual | Centavos anual |
|---------|---------------|--------------|-------------------|----------------|
| Basic   | $49.900       | $479.000     | 4990000           | 47900000       |
| Premium | $89.900       | $862.000     | 8990000           | 86200000       |

> **IMPORTANTE**: Wompi maneja montos en **centavos**. $49.900 COP = 4990000 centavos.

---

## PASO 0: Variables de entorno

Agrega estas variables al archivo `.env` del backend (y en Railway como variables de entorno). **El usuario debe reemplazar los valores placeholder con sus llaves reales de Wompi.**

```env
# ============================================
# WOMPI - LLAVES SANDBOX (PRUEBAS)
# Obtén estas llaves en: comercios.wompi.co → Desarrollo → Programadores
# ============================================

# Llave pública sandbox (prefijo pub_test_)
# Úsala en el frontend para abrir el widget de pago
WOMPI_PUBLIC_KEY=pub_test_XXXXXXXXXXXXXXXXXX          # <-- REEMPLAZA CON TU LLAVE PÚBLICA SANDBOX

# Llave privada sandbox (prefijo prv_test_)
# Úsala en el backend para consultar transacciones
WOMPI_PRIVATE_KEY=prv_test_XXXXXXXXXXXXXXXXXX         # <-- REEMPLAZA CON TU LLAVE PRIVADA SANDBOX

# Secreto de eventos sandbox (prefijo test_events_)
# Úsalo para verificar que los webhooks vienen de Wompi
# Encuéntralo en: comercios.wompi.co → Desarrollo → Programadores → Secretos
WOMPI_EVENTS_SECRET=test_events_XXXXXXXXXXXXXXXXXX    # <-- REEMPLAZA CON TU SECRETO DE EVENTOS SANDBOX

# Secreto de integridad sandbox (prefijo test_integrity_)
# Úsalo para generar la firma SHA256 del widget
# Encuéntralo en: comercios.wompi.co → Desarrollo → Programadores → Secretos
WOMPI_INTEGRITY_SECRET=test_integrity_XXXXXXXXXXXXXXXXXX  # <-- REEMPLAZA CON TU SECRETO DE INTEGRIDAD SANDBOX

# URL base del API de Wompi
# Sandbox: https://sandbox.wompi.co/v1
# Producción: https://production.wompi.co/v1
WOMPI_API_URL=https://sandbox.wompi.co/v1

# URL del checkout de Wompi
# Sandbox: https://checkout.wompi.co/p/
# Producción: https://checkout.wompi.co/p/  (misma URL, cambia la llave)
WOMPI_CHECKOUT_URL=https://checkout.wompi.co/p/

# URL de tu frontend (para redirección después del pago)
FRONTEND_URL=https://tu-dominio.com                   # <-- REEMPLAZA CON TU DOMINIO REAL

# ============================================
# CUANDO PASES A PRODUCCIÓN, cambia:
# - Prefijos pub_test_ → pub_prod_
# - Prefijos prv_test_ → prv_prod_
# - Prefijos test_events_ → prod_events_
# - Prefijos test_integrity_ → prod_integrity_
# - WOMPI_API_URL → https://production.wompi.co/v1
# ============================================
```

También agrega la llave pública al frontend. Crea o edita el archivo `.env` en la raíz del proyecto React:

```env
# Frontend .env (raíz del proyecto React/Vite)
VITE_WOMPI_PUBLIC_KEY=pub_test_XXXXXXXXXXXXXXXXXX     # <-- MISMA LLAVE PÚBLICA SANDBOX
VITE_WOMPI_CHECKOUT_URL=https://checkout.wompi.co/p/
```

---

## PASO 1: Nuevo modelo en la base de datos

**Archivo a editar**: `app/models.py`

Agrega este modelo **al final del archivo**, antes de que termine. NO modifiques los modelos existentes.

```python
class PaymentTransaction(Base):
    """Registra cada intento de pago vía Wompi."""
    __tablename__ = "payment_transactions"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)

    # Referencia única que enviamos a Wompi (formato: WF-{tenant_id}-{timestamp})
    reference = Column(String(100), unique=True, nullable=False, index=True)

    # ID de transacción que devuelve Wompi
    wompi_transaction_id = Column(String(100), nullable=True, unique=True, index=True)

    # Plan y período que se está comprando
    plan = Column(String(50), nullable=False)              # "basic" | "premium"
    billing_period = Column(String(20), nullable=False)    # "monthly" | "yearly"

    # Monto en centavos (como lo maneja Wompi)
    amount_in_cents = Column(Integer, nullable=False)
    currency = Column(String(10), default="COP", nullable=False)

    # Estado del pago
    # PENDING → el usuario abrió el checkout pero aún no paga
    # APPROVED → Wompi confirmó el pago exitoso
    # DECLINED → pago rechazado
    # VOIDED → pago anulado
    # ERROR → error en el procesamiento
    status = Column(String(30), default="PENDING", nullable=False)

    # Método de pago usado (CARD, NEQUI, PSE, BANCOLOMBIA_QR, etc.)
    payment_method = Column(String(50), nullable=True)

    # Fechas
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Fecha de expiración del plan (created_at + 30 días o + 365 días)
    plan_expires_at = Column(DateTime, nullable=True)

    # Relación
    tenant = relationship("Tenant")
```

También agrega estos campos al modelo `Tenant` existente (NO reemplaces el modelo, solo agrega las columnas):

```python
# Agregar DENTRO de la clase Tenant, después de max_usuarios:
    plan_expires_at = Column(DateTime, nullable=True)
    last_payment_reference = Column(String(100), nullable=True)
```

---

## PASO 2: Migración de la base de datos

Ejecuta una migración para crear la nueva tabla y agregar las columnas al tenant. Si usas Alembic:

```bash
alembic revision --autogenerate -m "add payment_transactions and tenant plan fields"
alembic upgrade head
```

Si NO usas Alembic, ejecuta este SQL directamente en la base de datos de Railway:

```sql
-- Crear tabla de transacciones de pago
CREATE TABLE IF NOT EXISTS payment_transactions (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    reference VARCHAR(100) UNIQUE NOT NULL,
    wompi_transaction_id VARCHAR(100) UNIQUE,
    plan VARCHAR(50) NOT NULL,
    billing_period VARCHAR(20) NOT NULL,
    amount_in_cents INTEGER NOT NULL,
    currency VARCHAR(10) DEFAULT 'COP' NOT NULL,
    status VARCHAR(30) DEFAULT 'PENDING' NOT NULL,
    payment_method VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
    plan_expires_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_payment_transactions_tenant_id ON payment_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS ix_payment_transactions_reference ON payment_transactions(reference);
CREATE INDEX IF NOT EXISTS ix_payment_transactions_wompi_transaction_id ON payment_transactions(wompi_transaction_id);

-- Agregar columnas al tenant
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMP;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS last_payment_reference VARCHAR(100);
```

---

## PASO 3: Schemas de Pydantic

**Archivo a editar**: `app/schemas.py`

Agrega estos schemas al final del archivo, en la sección de Suscripción:

```python
# ─── Wompi / Pagos ────────────────────────────────────────────────────────────

class CreatePaymentRequest(BaseModel):
    """Request del frontend para iniciar un pago."""
    plan: str       # "basic" | "premium"
    period: str     # "monthly" | "yearly"


class PaymentIntegrityResponse(BaseModel):
    """Respuesta con los datos necesarios para abrir el checkout de Wompi."""
    reference: str
    amount_in_cents: int
    currency: str
    integrity_signature: str
    public_key: str
    redirect_url: str


class PaymentTransactionResponse(BaseModel):
    """Respuesta con el estado de una transacción."""
    id: int
    reference: str
    wompi_transaction_id: Optional[str] = None
    plan: str
    billing_period: str
    amount_in_cents: int
    status: str
    payment_method: Optional[str] = None
    created_at: datetime
    plan_expires_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class PaymentHistoryResponse(BaseModel):
    """Lista de transacciones del tenant."""
    transactions: list
    current_plan: str
    plan_expires_at: Optional[datetime] = None
```

---

## PASO 4: Servicio de Wompi (Backend)

**Archivo nuevo**: `app/services/wompi_service.py`

```python
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

    Wompi usa esta firma para verificar que nadie manipuló el monto.
    """
    cadena = f"{reference}{amount_in_cents}{currency}{WOMPI_INTEGRITY_SECRET}"
    return hashlib.sha256(cadena.encode("utf-8")).hexdigest()


def verify_event_signature(event_data: dict) -> bool:
    """
    Verifica que un webhook realmente viene de Wompi.

    Wompi envía un objeto 'signature' con:
    - properties: lista de campos del objeto data a concatenar
    - checksum: el hash SHA256 esperado

    Nosotros recalculamos el hash y lo comparamos.
    """
    try:
        signature = event_data.get("signature", {})
        properties = signature.get("properties", [])
        checksum = signature.get("checksum", "")
        timestamp = event_data.get("timestamp", "")
        data = event_data.get("data", {})

        # Concatenar los valores de las propiedades en orden
        concat_values = ""
        for prop in properties:
            # Navegar por la ruta (ej: "transaction.id" → data["transaction"]["id"])
            keys = prop.split(".")
            value = data
            for key in keys:
                if isinstance(value, dict):
                    value = value.get(key, "")
                else:
                    value = ""
                    break
            concat_values += str(value)

        # Agregar timestamp y secreto de eventos
        concat_values += str(timestamp)
        concat_values += WOMPI_EVENTS_SECRET

        # Calcular SHA256
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
    """Crea un registro de transacción pendiente y retorna los datos para el checkout."""
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
    # Buscar la transacción por referencia
    stmt = select(PaymentTransaction).where(PaymentTransaction.reference == reference)
    result = await db.execute(stmt)
    transaction = result.scalars().first()

    if not transaction:
        return None

    # Si ya fue procesada, no hacer nada
    if transaction.status == "APPROVED":
        return transaction

    # Calcular expiración
    now = datetime.utcnow()
    if transaction.billing_period == "yearly":
        expires_at = now + timedelta(days=365)
    else:
        expires_at = now + timedelta(days=30)

    # Actualizar transacción
    transaction.status = "APPROVED"
    transaction.wompi_transaction_id = wompi_transaction_id
    transaction.payment_method = payment_method
    transaction.plan_expires_at = expires_at
    transaction.updated_at = now

    # Activar plan en el tenant
    tenant = await db.get(Tenant, transaction.tenant_id)
    if tenant:
        tenant.plan = transaction.plan
        tenant.plan_expires_at = expires_at
        tenant.last_payment_reference = reference

        # Ajustar max_usuarios según plan
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
    Esto es una verificación adicional al webhook (doble check).
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
```

---

## PASO 5: Router de Wompi (Backend)

**Archivo nuevo**: `app/routers/wompi.py`

```python
import logging
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.dependencies import get_current_user
from app.models import AppUser, PaymentTransaction
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
    # Validar plan
    if body.plan not in ("basic", "premium"):
        raise HTTPException(status_code=400, detail="Plan inválido. Debe ser 'basic' o 'premium'.")

    # Validar período
    if body.period not in ("monthly", "yearly"):
        raise HTTPException(status_code=400, detail="Período inválido. Debe ser 'monthly' o 'yearly'.")

    # Validar que el usuario tenga tenant
    if current_user.tenant_id is None:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asociado.")

    # Crear registro de transacción
    transaction = await wompi_service.create_payment_record(
        db=db,
        tenant_id=current_user.tenant_id,
        plan=body.plan,
        period=body.period,
    )

    # Generar firma de integridad
    signature = wompi_service.generate_integrity_signature(
        reference=transaction.reference,
        amount_in_cents=transaction.amount_in_cents,
        currency=transaction.currency,
    )

    # URL de redirección después del pago
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

    Wompi envía un POST con el evento transaction.updated cada vez
    que una transacción cambia de estado.
    """
    try:
        event_data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="JSON inválido")

    logger.info(f"Webhook recibido de Wompi: {event_data.get('event', 'unknown')}")

    # 1. Verificar la firma del evento
    if not wompi_service.verify_event_signature(event_data):
        logger.warning("Webhook con firma inválida rechazado")
        raise HTTPException(status_code=401, detail="Firma inválida")

    # 2. Extraer datos de la transacción
    event_type = event_data.get("event", "")
    data = event_data.get("data", {})
    transaction_data = data.get("transaction", {})

    # Solo procesamos eventos de transacciones
    if event_type != "transaction.updated":
        return {"status": "ignored", "event": event_type}

    reference = transaction_data.get("reference", "")
    wompi_id = transaction_data.get("id", "")
    tx_status = transaction_data.get("status", "")
    payment_method_data = transaction_data.get("payment_method", {})
    payment_method_type = payment_method_data.get("type", "") if payment_method_data else ""

    logger.info(f"Procesando transacción: ref={reference}, status={tx_status}")

    # 3. Procesar según el estado
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

    # Wompi espera un 200 OK
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
    regresa del checkout de Wompi para mostrar el resultado.
    """
    stmt = select(PaymentTransaction).where(
        PaymentTransaction.reference == reference,
        PaymentTransaction.tenant_id == current_user.tenant_id,
    )
    result = await db.execute(stmt)
    transaction = result.scalars().first()

    if not transaction:
        raise HTTPException(status_code=404, detail="Transacción no encontrada")

    # Si todavía está PENDING, intentar verificar directamente con Wompi
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
```

---

## PASO 6: Registrar el router en la app principal

**Archivo a editar**: El archivo principal de FastAPI donde se registran los routers (probablemente `app/main.py` o similar).

Busca dónde se incluyen los demás routers y agrega:

```python
from app.routers import wompi

# Junto a los demás app.include_router(...)
app.include_router(wompi.router, prefix="/api")
```

**IMPORTANTE**: El endpoint `/api/wompi/webhook` NO debe tener autenticación JWT. Asegúrate de que el middleware de autenticación no bloquee esta ruta. Si tu app tiene un middleware global de autenticación, agrega una excepción para `/api/wompi/webhook`.

---

## PASO 7: Dependencia httpx

Agrega `httpx` al archivo de dependencias del backend:

```bash
pip install httpx
```

O agrégalo al `requirements.txt`:
```
httpx>=0.27.0
```

---

## PASO 8: Servicio de Wompi (Frontend)

**Archivo nuevo**: `src/services/wompi.js`

```javascript
import { api } from './api';

/**
 * Precios de los planes (para mostrar en el UI).
 * Los precios reales los valida el backend.
 */
export const PLAN_PRICES = {
  basic: {
    monthly: { amount: 49900, label: '$49.900/mes' },
    yearly:  { amount: 479000, label: '$479.000/año', savings: 'Ahorras 2 meses' },
  },
  premium: {
    monthly: { amount: 89900, label: '$89.900/mes' },
    yearly:  { amount: 862000, label: '$862.000/año', savings: 'Ahorras 2 meses' },
  },
};

/**
 * Solicita al backend crear un registro de pago y devuelve
 * los datos necesarios para redirigir al checkout de Wompi.
 */
export async function createPayment(plan, period) {
  const data = await api.post('/wompi/create-payment', { plan, period });
  return data;
}

/**
 * Redirige al usuario al checkout de Wompi con todos los parámetros.
 *
 * @param {object} paymentData - Respuesta de createPayment()
 * @param {string} userEmail - Email del usuario actual
 * @param {string} userName - Nombre del usuario actual
 */
export function redirectToWompiCheckout(paymentData, userEmail = '', userName = '') {
  const checkoutUrl = import.meta.env.VITE_WOMPI_CHECKOUT_URL || 'https://checkout.wompi.co/p/';

  // Construir los parámetros del checkout
  const params = new URLSearchParams({
    'public-key': paymentData.public_key,
    'currency': paymentData.currency,
    'amount-in-cents': paymentData.amount_in_cents.toString(),
    'reference': paymentData.reference,
    'signature:integrity': paymentData.integrity_signature,
    'redirect-url': paymentData.redirect_url,
  });

  // Parámetros opcionales del cliente
  if (userEmail) {
    params.set('customer-data:email', userEmail);
  }
  if (userName) {
    params.set('customer-data:full-name', userName);
  }

  // Redirigir al checkout de Wompi
  window.location.href = `${checkoutUrl}?${params.toString()}`;
}

/**
 * Verifica el estado de un pago después de que el usuario
 * regresa del checkout de Wompi.
 */
export async function verifyPayment(reference) {
  const data = await api.get(`/wompi/verify/${reference}`);
  return data;
}

/**
 * Obtiene el historial de pagos del tenant.
 */
export async function getPaymentHistory() {
  const data = await api.get('/wompi/payment-history');
  return data;
}
```

---

## PASO 9: Reemplazar PlanModal en Configuracion.jsx

**Archivo a editar**: `src/pages/Configuracion/Configuracion.jsx` (o donde esté el componente)

### 9A. Agregar imports al inicio del archivo

Agrega estos imports junto a los existentes:

```javascript
import { PLAN_PRICES, createPayment, redirectToWompiCheckout } from '../../services/wompi';
```

### 9B. Reemplazar el componente PlanModal completo

Busca el componente `PlanModal` (empieza en `function PlanModal({ currentPlan, onClose, onChanged })`) y reemplázalo COMPLETO por este:

```jsx
/* ── PlanModal con Wompi ──────────────────────────────── */
function PlanModal({ currentPlan, onClose, onChanged }) {
  const [loading, setLoading] = useState(null);
  const [toast, setToast] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState('monthly');

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const handleSelect = async (plan) => {
    if (plan === currentPlan) {
      showToast('Ya tienes este plan', false);
      return;
    }

    setLoading(plan);
    try {
      // 1. Crear registro de pago en el backend
      const paymentData = await createPayment(plan, selectedPeriod);

      // 2. Obtener datos del usuario para pre-llenar el checkout
      const userEmail = localStorage.getItem('washflow_email') || '';
      const userName = localStorage.getItem('washflow_username') || '';

      // 3. Redirigir al checkout de Wompi
      redirectToWompiCheckout(paymentData, userEmail, userName);

    } catch (err) {
      showToast(err.message || 'Error al iniciar el pago', false);
      setLoading(null);
    }
  };

  const getPrice = (plan) => {
    const prices = PLAN_PRICES[plan];
    if (!prices) return { label: '', savings: '' };
    return prices[selectedPeriod] || prices.monthly;
  };

  return (
    <div className="ab-modal-overlay" onClick={onClose}>
      <div className="ab-modal" onClick={e => e.stopPropagation()}>
        <div className="ab-modal-header">
          <h2 className="ab-modal-title">Elegir plan de suscripción</h2>
          <button className="ab-modal-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        {toast && (
          <div className={`ab-toast ${toast.ok ? 'ab-toast--ok' : 'ab-toast--err'}`}>
            {toast.msg}
          </div>
        )}

        {/* Selector de período */}
        <div style={{
          display: 'flex', justifyContent: 'center', gap: '4px',
          margin: '0 0 20px', padding: '4px',
          background: '#F5F0E8', borderRadius: '8px', width: 'fit-content',
          marginLeft: 'auto', marginRight: 'auto'
        }}>
          <button
            onClick={() => setSelectedPeriod('monthly')}
            style={{
              padding: '8px 20px', border: 'none', borderRadius: '6px',
              cursor: 'pointer', fontFamily: 'DM Sans', fontSize: '14px', fontWeight: 600,
              background: selectedPeriod === 'monthly' ? '#1A1A1A' : 'transparent',
              color: selectedPeriod === 'monthly' ? '#fff' : '#6B6B6B',
              transition: 'all 0.2s',
            }}
          >
            Mensual
          </button>
          <button
            onClick={() => setSelectedPeriod('yearly')}
            style={{
              padding: '8px 20px', border: 'none', borderRadius: '6px',
              cursor: 'pointer', fontFamily: 'DM Sans', fontSize: '14px', fontWeight: 600,
              background: selectedPeriod === 'yearly' ? '#1A1A1A' : 'transparent',
              color: selectedPeriod === 'yearly' ? '#fff' : '#6B6B6B',
              transition: 'all 0.2s',
            }}
          >
            Anual
            <span style={{
              marginLeft: '6px', fontSize: '11px', padding: '2px 6px',
              background: '#38A169', color: '#fff', borderRadius: '4px',
            }}>
              -17%
            </span>
          </button>
        </div>

        <div className="ab-modal-plans">
          {/* Basic */}
          <div className={`ab-modal-plan ${currentPlan === 'basic' ? 'ab-modal-plan--current' : ''}`}>
            {currentPlan === 'basic' && <span className="ab-modal-current-badge">Plan actual</span>}
            <h3 className="ab-modal-plan__name">Basic</h3>
            <p className="ab-modal-plan__price">{getPrice('basic').label}</p>
            {selectedPeriod === 'yearly' && getPrice('basic').savings && (
              <p style={{ fontSize: '12px', color: '#38A169', marginTop: '-8px', marginBottom: '8px' }}>
                {getPrice('basic').savings}
              </p>
            )}
            <ul className="ab-modal-plan__features">
              {BASIC_FEATURES.map(f => <li key={f}><span>✓</span>{f}</li>)}
            </ul>
            <button
              className="ab-modal-plan__btn ab-modal-plan__btn--basic"
              onClick={() => handleSelect('basic')}
              disabled={loading !== null}
            >
              {loading === 'basic' ? (
                <><span className="ab-save-spinner" /> Redirigiendo a pago...</>
              ) : (
                'Pagar Basic →'
              )}
            </button>
          </div>

          {/* Premium */}
          <div className={`ab-modal-plan ab-modal-plan--premium ${currentPlan === 'premium' ? 'ab-modal-plan--current' : ''}`}>
            {currentPlan === 'premium' && <span className="ab-modal-current-badge ab-modal-current-badge--premium">Plan actual</span>}
            <h3 className="ab-modal-plan__name ab-modal-plan__name--premium">Premium</h3>
            <p className="ab-modal-plan__price">{getPrice('premium').label}</p>
            {selectedPeriod === 'yearly' && getPrice('premium').savings && (
              <p style={{ fontSize: '12px', color: '#38A169', marginTop: '-8px', marginBottom: '8px' }}>
                {getPrice('premium').savings}
              </p>
            )}
            <ul className="ab-modal-plan__features ab-modal-plan__features--premium">
              {PREMIUM_FEATURES.map(f => <li key={f}><span>✓</span>{f}</li>)}
            </ul>
            <button
              className="ab-modal-plan__btn ab-modal-plan__btn--premium"
              onClick={() => handleSelect('premium')}
              disabled={loading !== null}
            >
              {loading === 'premium' ? (
                <><span className="ab-save-spinner" /> Redirigiendo a pago...</>
              ) : (
                'Pagar Premium →'
              )}
            </button>
          </div>
        </div>

        <p style={{
          textAlign: 'center', fontSize: '12px', color: '#6B6B6B',
          marginTop: '16px', padding: '0 16px'
        }}>
          Serás redirigido a Wompi para completar el pago de forma segura.
          Aceptamos tarjeta, Nequi, PSE, Bancolombia QR y Daviplata.
        </p>
      </div>
    </div>
  );
}
```

---

## PASO 10: Verificar pago al regresar del checkout

**Archivo a editar**: `src/pages/Dashboard.jsx` (o el componente principal del Dashboard)

Agrega esta lógica al inicio del componente Dashboard para detectar cuando el usuario regresa del checkout de Wompi:

```jsx
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { verifyPayment } from '../services/wompi';

// Dentro del componente Dashboard:
function Dashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [paymentResult, setPaymentResult] = useState(null);

  // Verificar pago al regresar de Wompi
  useEffect(() => {
    const paymentRef = searchParams.get('payment_ref');
    if (!paymentRef) return;

    const checkPayment = async () => {
      try {
        const result = await verifyPayment(paymentRef);
        setPaymentResult(result);

        if (result.status === 'APPROVED') {
          // Actualizar plan en localStorage
          localStorage.setItem('washflow_plan', result.plan);
          // Mostrar mensaje de éxito (usa tu sistema de toast/notificaciones)
        }
      } catch (err) {
        console.error('Error verificando pago:', err);
      } finally {
        // Limpiar el parámetro de la URL
        searchParams.delete('payment_ref');
        setSearchParams(searchParams, { replace: true });
      }
    };

    // Esperar un momento para dar tiempo al webhook
    setTimeout(checkPayment, 2000);
  }, []);

  // ... resto del componente

  return (
    <>
      {/* Modal de resultado del pago */}
      {paymentResult && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 9999,
        }}>
          <div style={{
            background: '#FFFDF7', border: '2px solid #1A1A1A',
            borderRadius: '8px', padding: '32px', maxWidth: '400px',
            textAlign: 'center', boxShadow: '4px 4px 0px #1A1A1A',
          }}>
            {paymentResult.status === 'APPROVED' ? (
              <>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
                <h2 style={{ fontFamily: 'Bricolage Grotesque', marginBottom: '8px' }}>
                  ¡Pago exitoso!
                </h2>
                <p style={{ color: '#6B6B6B', marginBottom: '16px' }}>
                  Tu plan <strong>{paymentResult.plan}</strong> ha sido activado.
                  {paymentResult.plan_expires_at && (
                    <> Válido hasta {new Date(paymentResult.plan_expires_at).toLocaleDateString('es-CO')}.</>
                  )}
                </p>
                <button
                  className="neo-btn neo-btn-primary"
                  onClick={() => {
                    setPaymentResult(null);
                    window.location.reload();
                  }}
                >
                  ¡Comenzar! →
                </button>
              </>
            ) : paymentResult.status === 'PENDING' ? (
              <>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏳</div>
                <h2 style={{ fontFamily: 'Bricolage Grotesque', marginBottom: '8px' }}>
                  Pago en proceso
                </h2>
                <p style={{ color: '#6B6B6B', marginBottom: '16px' }}>
                  Tu pago está siendo procesado. Te notificaremos cuando se confirme.
                </p>
                <button
                  className="neo-btn neo-btn-outline"
                  onClick={() => setPaymentResult(null)}
                >
                  Entendido
                </button>
              </>
            ) : (
              <>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>❌</div>
                <h2 style={{ fontFamily: 'Bricolage Grotesque', marginBottom: '8px' }}>
                  Pago no completado
                </h2>
                <p style={{ color: '#6B6B6B', marginBottom: '16px' }}>
                  El pago fue {paymentResult.status === 'DECLINED' ? 'rechazado' : 'cancelado'}.
                  Puedes intentar de nuevo desde Configuración.
                </p>
                <button
                  className="neo-btn neo-btn-outline"
                  onClick={() => setPaymentResult(null)}
                >
                  Cerrar
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ... resto del JSX del Dashboard ... */}
    </>
  );
}
```

---

## PASO 11: Configurar webhook en el panel de Wompi

Este paso es MANUAL (el usuario lo hace en el navegador):

1. Ir a **comercios.wompi.co**
2. Iniciar sesión
3. Ir a **Desarrolladores → Seguimiento de transacciones**
4. En el campo **"URL de eventos"**, pegar: `https://TU-DOMINIO-BACKEND.com/api/wompi/webhook`
5. Hacer clic en **Guardar**
6. **IMPORTANTE**: Hacer lo mismo para el ambiente de Sandbox (hay un toggle para cambiar entre ambientes)

---

## PASO 12: Datos de prueba para Sandbox

Para probar pagos en sandbox, usa estos datos:

### Tarjeta de crédito (aprobada)
- Número: `4242 4242 4242 4242`
- Fecha: cualquier fecha futura (ej: 12/28)
- CVC: cualquier 3 dígitos (ej: 123)

### Tarjeta de crédito (rechazada)
- Número: `4111 1111 1111 1111`

### Nequi (aprobado)
- Número: `3991111111`

### Nequi (rechazado)
- Número: `3992222222`

### PSE
- Selecciona cualquier banco, el sandbox te deja elegir el resultado.

---

## RESUMEN DE ARCHIVOS

### Archivos NUEVOS a crear:
1. `app/services/wompi_service.py` — Toda la lógica de Wompi
2. `app/routers/wompi.py` — Endpoints de la API
3. `src/services/wompi.js` — Cliente de Wompi para React

### Archivos a EDITAR (no reemplazar, solo agregar):
4. `app/models.py` — Agregar modelo `PaymentTransaction` + campos en `Tenant`
5. `app/schemas.py` — Agregar schemas de pagos
6. `app/main.py` — Registrar el router de Wompi
7. `src/pages/Configuracion/Configuracion.jsx` — Reemplazar `PlanModal` + agregar import
8. `src/pages/Dashboard.jsx` — Agregar verificación de pago al retorno
9. `.env` (backend) — Agregar variables de Wompi
10. `.env` (frontend) — Agregar llave pública de Wompi
11. `requirements.txt` — Agregar `httpx`

### Acciones MANUALES del usuario:
12. Ejecutar migración de base de datos (SQL o Alembic)
13. Configurar URL del webhook en el panel de Wompi
14. Reemplazar placeholders de llaves con las llaves reales
15. Deploy en Railway

---

## NOTAS IMPORTANTES

1. **El webhook NO lleva autenticación JWT**. Wompi llama directamente a tu endpoint. La seguridad está en la verificación de la firma (`verify_event_signature`).

2. **Montos siempre en centavos**. $49.900 COP = 4990000 centavos. Wompi rechaza montos que no sean enteros.

3. **Referencias únicas**. Cada pago necesita una referencia única (formato `WF-{tenant_id}-{timestamp}`). Wompi rechaza referencias duplicadas.

4. **Doble verificación**: El webhook es la fuente primaria de verdad, pero el endpoint `/verify/{reference}` consulta directamente a Wompi como respaldo.

5. **Para pasar a producción**: Solo cambia las llaves en las variables de entorno (de `test_` a `prod_`) y la URL del API de `sandbox` a `production`. El código es el mismo.

6. **Tarjetas de prueba sandbox**: `4242424242424242` = aprobada, `4111111111111111` = rechazada.
