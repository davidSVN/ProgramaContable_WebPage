# FEATURE: Cobro recurrente automático + Aviso de vencimiento a 5 días

## Contexto

WashFlow es una app SaaS multi-tenant (FastAPI + React + PostgreSQL en Railway). Ya tenemos integrada la pasarela de pagos Wompi Colombia con pagos únicos vía Widget/Checkout Web. Ahora necesitamos implementar:

1. **Cobro recurrente automático**: Tokenizar la tarjeta del usuario en el primer pago, guardar el token, y cobrar automáticamente cuando el plan esté por vencer.
2. **Banner de aviso**: Mostrar un aviso cuando falten 5 días o menos para que expire el plan.

## Arquitectura actual (NO modificar lo que ya funciona)

### Archivos existentes relevantes:
- `app/models.py` — Tiene modelo `Tenant` (con `plan`, `plan_expires_at`, `last_payment_reference`) y `PaymentTransaction`
- `app/services/wompi_service.py` — Servicio de Wompi con `PLAN_PRICES`, verificación de firma, etc.
- `app/routers/wompi.py` — Endpoints: `POST /wompi/create-payment`, `POST /wompi/webhook`, `GET /wompi/verify/{reference}`, `GET /wompi/payment-history`
- `app/schemas.py` — Schemas de pago
- `src/services/wompi.js` — Cliente frontend de Wompi
- `src/pages/Configuracion/Configuracion.jsx` — PlanModal con checkout de Wompi

### Variables de entorno disponibles:
```
WOMPI_PUBLIC_KEY=pub_test_xxx
WOMPI_PRIVATE_KEY=prv_test_xxx
WOMPI_EVENTS_SECRET=test_events_xxx
WOMPI_INTEGRITY_SECRET=test_integrity_xxx
WOMPI_API_URL=https://sandbox.wompi.co/v1
```

---

## PARTE 1: Tokenización y cobro recurrente

### Cómo funciona la tokenización en Wompi

El flujo de tokenización de Wompi funciona así:

1. **Primer pago**: El usuario paga normalmente por el checkout. En la respuesta de la transacción aprobada, Wompi devuelve un `payment_source_id` si usamos la API directamente, O podemos tokenizar la tarjeta por separado.

2. **Tokenizar la tarjeta**: Se puede usar el Widget de Wompi en modo tokenización, que devuelve un token de tarjeta. Con ese token, hacemos un POST a `/v1/payment_sources` para crear una fuente de pago reutilizable.

3. **Cobros futuros**: Con el `payment_source_id` guardado, hacemos POST a `/v1/transactions` directamente desde el backend, sin intervención del usuario.

### Flujo propuesto

#### Primer pago (modificar el flujo actual):
1. Usuario elige plan → se abre el Widget de Wompi en modo tokenización (`data-widget-operation="tokenize"`)
2. El Widget devuelve un `token` de tarjeta
3. Nuestro backend:
   a. Crea una fuente de pago (POST a `{WOMPI_API_URL}/v1/payment_sources`) con el token
   b. Guarda el `payment_source_id` en el tenant
   c. Crea la primera transacción usando el `payment_source_id` (POST a `{WOMPI_API_URL}/v1/transactions`)
   d. El webhook confirma el pago y activa el plan

#### Cobros recurrentes (nuevo):
1. Un cron job/scheduler revisa diariamente qué planes vencen hoy
2. Para cada tenant con `payment_source_id` guardado, crea una transacción automática
3. El webhook confirma y renueva el plan automáticamente
4. Si el cobro falla, se notifica al usuario y se le da 5 días de gracia

### Cambios en la base de datos

Ejecutar esta migración SQL (el desarrollador la ejecutará en DBeaver):

```sql
-- Agregar campos de tokenización al tenant
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS wompi_payment_source_id INTEGER;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS card_last_four VARCHAR(4);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS card_brand VARCHAR(20);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN DEFAULT TRUE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS renewal_failed_at TIMESTAMP;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS grace_period_ends_at TIMESTAMP;
```

### Cambios en `app/models.py`

Agregar estos campos al modelo `Tenant` (NO reemplazar, solo agregar):

```python
# Campos de cobro recurrente (agregar dentro de la clase Tenant)
wompi_payment_source_id = Column(Integer, nullable=True)
card_last_four = Column(String(4), nullable=True)
card_brand = Column(String(20), nullable=True)
auto_renew = Column(Boolean, default=True, nullable=False)
renewal_failed_at = Column(DateTime, nullable=True)
grace_period_ends_at = Column(DateTime, nullable=True)
```

### Cambios en `app/services/wompi_service.py`

Agregar estas funciones al archivo existente:

```python
async def tokenize_card_and_create_source(
    token: str,
    customer_email: str,
    acceptance_token: str,
) -> dict:
    """
    Crea una fuente de pago en Wompi a partir de un token de tarjeta.
    
    1. POST /v1/payment_sources con el token
    2. Retorna el payment_source_id y datos de la tarjeta
    """
    async with httpx.AsyncClient() as client:
        # Crear fuente de pago
        response = await client.post(
            f"{WOMPI_API_URL}/v1/payment_sources",
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
            "brand": data.get("public_data", {}).get("type"),  # VISA, MASTERCARD, etc.
        }


async def charge_with_payment_source(
    payment_source_id: int,
    amount_in_cents: int,
    reference: str,
    customer_email: str,
    recurrent: bool = True,
) -> dict:
    """
    Cobra automáticamente usando una fuente de pago guardada.
    No requiere intervención del usuario.
    """
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{WOMPI_API_URL}/v1/transactions",
            json={
                "amount_in_cents": amount_in_cents,
                "currency": "COP",
                "customer_email": customer_email,
                "reference": reference,
                "payment_source_id": payment_source_id,
                "recurrent": recurrent,
            },
            headers={"Authorization": f"Bearer {WOMPI_PRIVATE_KEY}"},
        )
        
        if response.status_code not in (200, 201):
            raise Exception(f"Error en cobro: {response.text}")
        
        return response.json().get("data", {})


async def get_acceptance_token() -> str:
    """
    Obtiene el token de aceptación de términos de Wompi.
    Requerido para crear fuentes de pago.
    """
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{WOMPI_API_URL}/v1/merchants/{WOMPI_PUBLIC_KEY}",
        )
        data = response.json().get("data", {})
        return data.get("presigned_acceptance", {}).get("acceptance_token", "")


async def process_recurring_renewals(db: AsyncSession):
    """
    Busca tenants cuyo plan vence HOY o ya venció,
    que tengan auto_renew=True y payment_source_id,
    e intenta cobrarles automáticamente.
    """
    from sqlalchemy import select, and_, or_
    
    now = datetime.utcnow()
    
    # Buscar tenants que necesitan renovación
    stmt = select(Tenant).where(
        and_(
            Tenant.plan.in_(["basic", "premium"]),
            Tenant.wompi_payment_source_id.isnot(None),
            Tenant.auto_renew == True,
            Tenant.plan_expires_at <= now,
            # No intentar si ya falló y está en período de gracia
            or_(
                Tenant.renewal_failed_at.is_(None),
                Tenant.renewal_failed_at < now - timedelta(hours=24),  # Reintentar cada 24h
            ),
        )
    )
    
    result = await db.execute(stmt)
    tenants = result.scalars().all()
    
    results = []
    
    for tenant in tenants:
        try:
            # Determinar precio (mantener el mismo período)
            # Buscar la última transacción aprobada para saber el período
            last_tx_stmt = select(PaymentTransaction).where(
                PaymentTransaction.tenant_id == tenant.id,
                PaymentTransaction.status == "APPROVED",
            ).order_by(PaymentTransaction.created_at.desc()).limit(1)
            
            last_tx_result = await db.execute(last_tx_stmt)
            last_tx = last_tx_result.scalars().first()
            
            billing_period = last_tx.billing_period if last_tx else "monthly"
            amount = get_price(tenant.plan, billing_period)
            reference = generate_reference(tenant.id)
            
            # Obtener email del admin del tenant
            admin_stmt = select(AppUser).where(
                AppUser.tenant_id == tenant.id,
                AppUser.role == "admin",
            ).limit(1)
            admin_result = await db.execute(admin_stmt)
            admin = admin_result.scalars().first()
            
            if not admin:
                continue
            
            # Crear registro de transacción
            transaction = PaymentTransaction(
                tenant_id=tenant.id,
                reference=reference,
                plan=tenant.plan,
                billing_period=billing_period,
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
                recurrent=True,
            )
            
            # El webhook se encargará de actualizar el estado
            results.append({
                "tenant_id": tenant.id,
                "reference": reference,
                "status": "charge_initiated",
                "wompi_id": wompi_response.get("id"),
            })
            
        except Exception as e:
            # Marcar que falló el cobro
            tenant.renewal_failed_at = now
            tenant.grace_period_ends_at = now + timedelta(days=5)
            await db.commit()
            
            results.append({
                "tenant_id": tenant.id,
                "status": "failed",
                "error": str(e),
            })
    
    return results
```

### Nuevos endpoints en `app/routers/wompi.py`

Agregar estos endpoints al router existente:

```python
@router.post("/save-payment-source")
async def save_payment_source(
    body: dict,  # {token: str}
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
        # Obtener acceptance token
        acceptance_token = await wompi_service.get_acceptance_token()
        
        # Crear fuente de pago en Wompi
        source_data = await wompi_service.tokenize_card_and_create_source(
            token=token,
            customer_email=current_user.email,
            acceptance_token=acceptance_token,
        )
        
        # Guardar en el tenant
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
    body: dict,  # {auto_renew: bool}
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Permite al usuario activar/desactivar la renovación automática."""
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant")
    
    tenant = await db.get(Tenant, current_user.tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant no encontrado")
    
    tenant.auto_renew = body.get("auto_renew", True)
    await db.commit()
    
    return {"auto_renew": tenant.auto_renew}


@router.get("/subscription-status")
async def subscription_status(
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Retorna el estado completo de la suscripción del tenant,
    incluyendo datos de tarjeta guardada y días restantes.
    """
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
```

### Cron job para cobros recurrentes

Crear archivo nuevo `app/tasks/renewal_cron.py`:

```python
"""
Cron job que se ejecuta diariamente para procesar renovaciones automáticas.

Para ejecutar manualmente: python -m app.tasks.renewal_cron
Para programar en Railway: agregar un Cron Job Service con schedule "0 6 * * *" (6am UTC diario)

Comando: python -m app.tasks.renewal_cron
"""
import asyncio
import logging
from app.database import async_session_maker  # Ajustar al session maker real de tu proyecto
from app.services.wompi_service import process_recurring_renewals

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def run_renewals():
    logger.info("Iniciando proceso de renovaciones automáticas...")
    
    async with async_session_maker() as db:
        results = await process_recurring_renewals(db)
    
    for r in results:
        if r["status"] == "failed":
            logger.error(f"Renovación fallida para tenant {r['tenant_id']}: {r['error']}")
        else:
            logger.info(f"Cobro iniciado para tenant {r['tenant_id']}: ref={r['reference']}")
    
    logger.info(f"Proceso completado. {len(results)} tenants procesados.")


if __name__ == "__main__":
    asyncio.run(run_renewals())
```

**NOTA IMPORTANTE**: Revisa cómo se crea la sesión de base de datos en el proyecto. Busca en `app/database.py` si existe un `async_session_maker`, `AsyncSessionLocal`, o similar. Ajusta el import en el cron job para usar el session maker correcto del proyecto.

### Alternativa al cron job: Endpoint interno

Si Railway no soporta cron jobs fácilmente, crea un endpoint protegido que puedas llamar con un servicio externo (como cron-job.org) diariamente:

```python
@router.post("/process-renewals")
async def process_renewals_endpoint(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Endpoint interno para procesar renovaciones.
    Protegido por un secreto en el header.
    """
    # Verificar secreto (agrega CRON_SECRET a tus variables de entorno)
    cron_secret = os.getenv("CRON_SECRET", "")
    if request.headers.get("X-Cron-Secret") != cron_secret or not cron_secret:
        raise HTTPException(status_code=401, detail="No autorizado")
    
    results = await wompi_service.process_recurring_renewals(db)
    return {"processed": len(results), "results": results}
```

---

## PARTE 2: Banner de aviso de vencimiento

### Frontend — Componente de banner

Crear archivo nuevo `src/components/PlanExpiryBanner.jsx`:

```jsx
import { useState, useEffect } from 'react';
import { api } from '../services/api';

export default function PlanExpiryBanner() {
  const [status, setStatus] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    api.get('/wompi/subscription-status')
      .then(data => setStatus(data))
      .catch(() => {});
  }, []);

  // No mostrar si: no hay datos, plan es none, más de 5 días, o fue cerrado
  if (!status || status.plan === 'none' || status.days_remaining > 5 || dismissed) {
    return null;
  }

  const isExpired = status.days_remaining === 0;
  const isGrace = status.is_in_grace_period;
  const renewalFailed = status.renewal_failed;

  // Determinar mensaje y estilo
  let message = '';
  let bgColor = '';
  let textColor = '';

  if (isExpired && !isGrace) {
    // Plan expirado y sin gracia
    message = 'Tu plan ha expirado. Renueva ahora para seguir usando WashFlow.';
    bgColor = '#FED7D7';
    textColor = '#9B2C2C';
  } else if (renewalFailed && isGrace) {
    // Cobro falló, en período de gracia
    message = `No pudimos cobrar tu tarjeta ****${status.card_last_four || ''}. Tienes hasta el ${new Date(status.grace_period_ends_at).toLocaleDateString('es-CO')} para actualizar tu método de pago.`;
    bgColor = '#FEFCBF';
    textColor = '#975A16';
  } else if (status.days_remaining <= 5 && status.days_remaining > 0) {
    // Por vencer en 5 días o menos
    if (status.auto_renew && status.has_payment_source) {
      message = `Tu plan se renueva automáticamente en ${status.days_remaining} día${status.days_remaining > 1 ? 's' : ''}.`;
      bgColor = '#E6F1FB';
      textColor = '#185FA5';
    } else {
      message = `Tu plan vence en ${status.days_remaining} día${status.days_remaining > 1 ? 's' : ''}. Renueva ahora para no perder acceso.`;
      bgColor = '#FEFCBF';
      textColor = '#975A16';
    }
  }

  if (!message) return null;

  return (
    <div style={{
      background: bgColor,
      color: textColor,
      padding: '12px 20px',
      borderRadius: '8px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '12px',
      marginBottom: '16px',
      fontSize: '14px',
      fontFamily: 'DM Sans, sans-serif',
      border: `1px solid ${textColor}20`,
    }}>
      <span>{message}</span>
      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
        {(!status.auto_renew || !status.has_payment_source || renewalFailed || isExpired) && (
          <button
            onClick={() => window.location.href = '/dashboard?section=configuracion'}
            style={{
              background: '#FF6B2B',
              color: '#fff',
              border: 'none',
              padding: '6px 16px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              fontFamily: 'DM Sans, sans-serif',
            }}
          >
            Renovar →
          </button>
        )}
        {!isExpired && (
          <button
            onClick={() => setDismissed(true)}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '18px',
              color: textColor,
              padding: '0 4px',
            }}
            aria-label="Cerrar"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
```

### Agregar el banner al Dashboard

En `src/pages/Dashboard.jsx` (o el componente principal donde se renderiza el contenido del dashboard), importar y agregar el banner:

```jsx
import PlanExpiryBanner from '../components/PlanExpiryBanner';

// Dentro del JSX, al inicio del contenido principal (después del topbar, antes del contenido):
<PlanExpiryBanner />
```

---

## PARTE 3: Sección de método de pago en Configuración

Agregar una sección en Configuración que muestre la tarjeta guardada y permita activar/desactivar la renovación automática.

En `Configuracion.jsx`, agregar un nuevo componente `PaymentMethodSection`:

```jsx
function PaymentMethodSection() {
  const [status, setStatus] = useState(null);
  const [toggling, setToggling] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    api.get('/wompi/subscription-status')
      .then(data => setStatus(data))
      .catch(() => {});
  }, []);

  const toggleAutoRenew = async () => {
    setToggling(true);
    try {
      const result = await api.post('/wompi/toggle-auto-renew', {
        auto_renew: !status.auto_renew,
      });
      setStatus(prev => ({ ...prev, auto_renew: result.auto_renew }));
      setToast(result.auto_renew ? 'Renovación automática activada' : 'Renovación automática desactivada');
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      setToast('Error al cambiar configuración');
      setTimeout(() => setToast(null), 3000);
    } finally {
      setToggling(false);
    }
  };

  if (!status || status.plan === 'none') return null;

  return (
    <section className="ab-suscrip-card" style={{ marginBottom: '16px' }}>
      <div className="ab-suscrip-header">
        <span className="ab-suscrip-icon" aria-hidden="true">💳</span>
        <h2 className="ab-suscrip-title">Método de pago</h2>
      </div>
      <div className="ab-suscrip-body">
        {toast && (
          <div style={{
            padding: '8px 12px', marginBottom: '12px', borderRadius: '6px',
            background: '#F0FFF4', fontSize: '13px', color: '#38A169',
          }}>
            {toast}
          </div>
        )}

        {status.has_payment_source ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{
              background: '#F5F0E8', borderRadius: '8px', padding: '10px 16px',
              fontFamily: 'monospace', fontSize: '14px',
            }}>
              {status.card_brand || 'Tarjeta'} **** {status.card_last_four || '----'}
            </div>
            <div style={{ fontSize: '13px', color: '#6B6B6B' }}>
              {status.auto_renew ? 'Se renueva automáticamente' : 'Renovación manual'}
            </div>
          </div>
        ) : (
          <p style={{ fontSize: '13px', color: '#6B6B6B', marginBottom: '16px' }}>
            No tienes un método de pago guardado. Tu plan se debe renovar manualmente.
          </p>
        )}

        {status.has_payment_source && (
          <label style={{
            display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer',
            fontSize: '14px',
          }}>
            <input
              type="checkbox"
              checked={status.auto_renew}
              onChange={toggleAutoRenew}
              disabled={toggling}
              style={{ width: '18px', height: '18px', accentColor: '#FF6B2B' }}
            />
            Renovar mi plan automáticamente
          </label>
        )}

        {status.plan_expires_at && (
          <p style={{ fontSize: '12px', color: '#6B6B6B', marginTop: '12px' }}>
            Tu plan {status.plan} vence el {new Date(status.plan_expires_at).toLocaleDateString('es-CO')}.
            {status.days_remaining > 0 && ` (${status.days_remaining} días restantes)`}
          </p>
        )}
      </div>
    </section>
  );
}
```

Y renderizarlo en el componente principal `Configuracion`, ANTES de `SuscripcionSection`:

```jsx
{canEdit && <PaymentMethodSection />}
<SuscripcionSection user={user} />
```

---

## PARTE 4: Migración SQL

El desarrollador ejecutará esto manualmente en DBeaver:

```sql
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS wompi_payment_source_id INTEGER;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS card_last_four VARCHAR(4);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS card_brand VARCHAR(20);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN DEFAULT TRUE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS renewal_failed_at TIMESTAMP;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS grace_period_ends_at TIMESTAMP;
```

---

## PARTE 5: Variable de entorno adicional

Agregar en Railway y en `.env`:

```env
CRON_SECRET=un_secreto_aleatorio_largo_aqui
```

---

## Resumen de cambios

### Archivos a EDITAR (agregar, no reemplazar):
1. `app/models.py` — Agregar 6 campos al modelo Tenant
2. `app/services/wompi_service.py` — Agregar funciones de tokenización y cobro recurrente
3. `app/routers/wompi.py` — Agregar 4 endpoints nuevos
4. `app/schemas.py` — Agregar schemas si hace falta
5. `src/pages/Configuracion/Configuracion.jsx` — Agregar PaymentMethodSection
6. `src/pages/Dashboard.jsx` — Agregar PlanExpiryBanner

### Archivos NUEVOS:
7. `app/tasks/renewal_cron.py` — Cron job de renovación
8. `src/components/PlanExpiryBanner.jsx` — Banner de vencimiento

### Acciones MANUALES del usuario:
9. Ejecutar SQL de migración en DBeaver
10. Agregar CRON_SECRET en Railway
11. Configurar cron job en Railway (o usar servicio externo como cron-job.org para llamar al endpoint `/api/wompi/process-renewals` diariamente a las 6am con el header `X-Cron-Secret`)

## IMPORTANTE

- NO modificar los flujos existentes que ya funcionan (pago único, webhook, verificación)
- El widget de tokenización de Wompi se integra como un script: `<script src="https://checkout.wompi.co/widget.js" data-widget-operation="tokenize" data-public-key="...">`
- En sandbox, usar tarjeta de prueba: 4242 4242 4242 4242
- El cobro recurrente usa `"recurrent": true` en el body del POST a `/v1/transactions` para mejorar tasa de aprobación con Credential On File (COF) en Visa/Mastercard
- Si el cobro falla, el tenant tiene 5 días de gracia antes de perder acceso
