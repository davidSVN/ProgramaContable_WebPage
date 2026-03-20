# FIX CRÍTICO: El webhook de Wompi responde 404 — Arreglar ruta + excepción JWT + polling de respaldo

## Problema encontrado

El debugger de Wompi muestra que el webhook llega a nuestro backend pero responde **404 Not Found**. Hay DOS causas confirmadas:

1. **URL incompleta en Wompi**: La URL configurada era `https://programacontablewebpage-production.up.railway.app` sin el path `/api/wompi/webhook`. Esto YA FUE CORREGIDO manualmente en el panel de Wompi. Ahora la URL es `https://programacontablewebpage-production.up.railway.app/api/wompi/webhook`.

2. **Middleware JWT bloquea el webhook**: El backend tiene un middleware o dependencia global de autenticación JWT. Wompi hace un POST al webhook SIN token JWT, entonces el middleware lo rechaza antes de que llegue al endpoint. ESTO NECESITA SER CORREGIDO EN EL CÓDIGO.

## Regla fundamental

**NINGÚN cambio de plan se hace manualmente.** El estado de la suscripción del usuario depende ÚNICA y EXCLUSIVAMENTE de la respuesta de Wompi. Si Wompi dice APPROVED → plan activo. Si Wompi dice DECLINED → plan no activo. Nadie toca la base de datos a mano, no hay botones de "activar plan" sin pago. Todo el flujo es automático.

## QUÉ HACER — en orden de prioridad

### PASO 1: Excluir el webhook de la autenticación JWT

Busca en TODO el proyecto dónde se aplica la autenticación JWT de forma global. Puede estar en:

- `app/main.py` — como middleware global
- `app/dependencies.py` — como dependencia por defecto
- `app/routers/wompi.py` — si el router hereda dependencias de otro router padre
- Cualquier archivo que tenga `@app.middleware` o `Depends(get_current_user)` aplicado globalmente

**Lo que debes hacer**: Asegurarte de que las rutas `/api/wompi/webhook` y `/api/wompi/webhook-test` NO pasen por verificación JWT. Wompi llama a estas rutas directamente desde sus servidores, sin token.

#### Si es un middleware en main.py:

Busca algo como esto y agrega la excepción:

```python
@app.middleware("http")
async def some_auth_middleware(request: Request, call_next):
    # AGREGAR ESTO AL INICIO del middleware:
    # Excluir rutas del webhook de Wompi de la autenticación
    if request.url.path in ("/api/wompi/webhook", "/api/wompi/webhook-test"):
        return await call_next(request)
    
    # ... resto del middleware existente ...
```

#### Si es una dependencia global en el router:

Si el router de Wompi hereda dependencias de un router padre o si en `main.py` se incluye con dependencias globales, el endpoint del webhook necesita NO usar `Depends(get_current_user)`. Revisa que el endpoint `POST /webhook` en `app/routers/wompi.py` NO tenga `current_user: AppUser = Depends(get_current_user)` en sus parámetros. Solo debe tener `request: Request` y `db: AsyncSession = Depends(get_db)`.

#### Si hay un APIRouter con dependencias por defecto:

Si en algún lugar el router se crea así:
```python
router = APIRouter(prefix="/wompi", tags=["Wompi"], dependencies=[Depends(get_current_user)])
```

Entonces TODOS los endpoints del router requieren JWT, incluido el webhook. La solución es crear DOS routers separados en `app/routers/wompi.py`:

```python
# Router para endpoints que SÍ requieren autenticación
router = APIRouter(prefix="/wompi", tags=["Wompi Payments"])

# Router para endpoints PÚBLICOS (webhook)
public_router = APIRouter(prefix="/wompi", tags=["Wompi Webhook"])

# El webhook va en el router público
@public_router.post("/webhook")
async def wompi_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    # ... lógica del webhook ...

@public_router.get("/webhook-test")
async def webhook_test():
    return {"status": "ok", "message": "Webhook endpoint is reachable"}

# Los demás endpoints van en el router autenticado
@router.post("/create-payment", response_model=PaymentIntegrityResponse)
async def create_payment(
    body: CreatePaymentRequest,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    # ...

@router.get("/verify/{reference}")
async def verify_payment(
    reference: str,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    # ...

# NOTA: Ambos routers deben registrarse en main.py:
# app.include_router(wompi.router, prefix="/api")
# app.include_router(wompi.public_router, prefix="/api")
```

**IMPORTANTE**: Busca en `main.py` cómo se registra el router de Wompi y asegúrate de registrar AMBOS routers si decides usar esta solución.

### PASO 2: Agregar endpoint de prueba del webhook

En el router PÚBLICO (sin JWT), agregar:

```python
@public_router.get("/webhook-test")
async def webhook_test():
    """Endpoint para verificar que la ruta del webhook es alcanzable sin JWT."""
    return {"status": "ok", "message": "Webhook endpoint is reachable", "jwt_required": False}
```

**Verificación después del deploy**: Abrir en el navegador `https://programacontablewebpage-production.up.railway.app/api/wompi/webhook-test`. DEBE mostrar `{"status": "ok", ...}`. Si muestra 401 o 403, la excepción JWT no está funcionando. Si muestra 404, el router no está registrado.

### PASO 3: Agregar logging detallado al webhook

El endpoint POST `/webhook` debe tener logging completo para diagnosticar. Reemplaza la implementación actual del webhook:

```python
import logging
logger = logging.getLogger(__name__)

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

    # Verificar firma
    signature_valid = wompi_service.verify_event_signature(event_data)
    logger.info(f"Firma válida: {signature_valid}")
    
    if not signature_valid:
        logger.warning("FIRMA INVÁLIDA — Rechazando webhook")
        # TEMPORAL para diagnóstico: procesar igual pero logear
        # Cuando confirmes que funciona, descomenta el raise:
        # raise HTTPException(status_code=401, detail="Firma inválida")
        logger.warning("MODO DIAGNÓSTICO: Procesando a pesar de firma inválida")

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
```

### PASO 4: Mejorar verificación por polling (consulta directa a Wompi)

En `app/services/wompi_service.py`, agregar esta función para buscar transacciones por referencia directamente en la API de Wompi:

```python
async def find_transaction_by_reference(reference: str) -> Optional[dict]:
    """
    Busca una transacción en Wompi por su referencia.
    Esto permite verificar el estado sin depender del webhook.
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{WOMPI_API_URL}/v1/transactions",
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
        logger.error(f"Error consultando Wompi por referencia {reference}: {str(e)}")
    
    return None
```

### PASO 5: Mejorar endpoint de verificación

En `app/routers/wompi.py`, reemplazar el endpoint `GET /verify/{reference}` existente:

```python
@router.get("/verify/{reference}")
async def verify_payment(
    reference: str,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Verifica el estado de un pago. Si está PENDING en nuestra DB,
    consulta directamente a Wompi y actualiza.
    
    Este endpoint es el respaldo del webhook — si el webhook no llegó,
    el frontend usa polling con este endpoint para obtener el estado real.
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

    # Si está PENDING, consultar directamente a Wompi
    logger.info(f"Verificando transacción PENDING con Wompi: ref={reference}")
    
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
```

### PASO 6: Frontend — Polling automático al regresar del checkout

En `src/services/wompi.js`, agregar la función de polling:

```javascript
/**
 * Hace polling al backend cada intervalMs hasta que el pago
 * tenga un estado final o se agoten los intentos.
 */
export async function pollPaymentStatus(reference, {
  intervalMs = 4000,
  maxAttempts = 30,  // 30 * 4s = 2 minutos máximo
  onPending = null,
} = {}) {
  let attempts = 0;

  return new Promise((resolve, reject) => {
    const poll = setInterval(async () => {
      attempts++;

      try {
        const result = await api.get(`/wompi/verify/${reference}`);

        if (['APPROVED', 'DECLINED', 'VOIDED', 'ERROR'].includes(result.status)) {
          clearInterval(poll);
          resolve(result);
          return;
        }

        if (onPending) onPending(attempts, maxAttempts);
      } catch (err) {
        console.error('Error en polling:', err);
      }

      if (attempts >= maxAttempts) {
        clearInterval(poll);
        resolve({ status: 'PENDING', reference });
      }
    }, intervalMs);
  });
}
```

### PASO 7: Dashboard.jsx — Reemplazar verificación con polling + UX mejorada

Buscar el `useEffect` que verifica el pago al regresar de Wompi (busca `payment_ref` en searchParams) y REEMPLAZAR todo el bloque con:

```jsx
import { pollPaymentStatus } from '../services/wompi';

// Estados (agregar junto a los demás useState del componente):
const [paymentResult, setPaymentResult] = useState(null);
const [paymentChecking, setPaymentChecking] = useState(false);
const [pollMessage, setPollMessage] = useState('');

// useEffect para verificar pago al regresar de Wompi
useEffect(() => {
  const paymentRef = searchParams.get('payment_ref');
  if (!paymentRef) return;

  const checkPayment = async () => {
    setPaymentChecking(true);
    setPollMessage('Verificando tu pago con Wompi...');

    try {
      const result = await pollPaymentStatus(paymentRef, {
        intervalMs: 4000,
        maxAttempts: 30,
        onPending: (attempt) => {
          const msgs = [
            'Verificando tu pago con Wompi...',
            'Esperando confirmación del banco...',
            'Procesando, esto puede tomar unos segundos...',
            'Casi listo, confirmando transacción...',
            'Aún procesando, por favor espera...',
          ];
          setPollMessage(msgs[Math.min(attempt - 1, msgs.length - 1)]);
        },
      });

      setPaymentResult(result);

      if (result.status === 'APPROVED') {
        localStorage.setItem('washflow_plan', result.plan);
      }
    } catch (err) {
      console.error('Error verificando pago:', err);
      setPaymentResult({ status: 'ERROR', reference: paymentRef });
    } finally {
      setPaymentChecking(false);
      searchParams.delete('payment_ref');
      setSearchParams(searchParams, { replace: true });
    }
  };

  // Esperar 3 segundos para dar tiempo al webhook
  setTimeout(checkPayment, 3000);
}, []);
```

Y REEMPLAZAR los modales de resultado de pago existentes con:

```jsx
{/* Spinner mientras se verifica el pago */}
{paymentChecking && (
  <div style={{
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.5)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', zIndex: 9999,
  }}>
    <div style={{
      background: '#FFFDF7', border: '2px solid #1A1A1A',
      borderRadius: '8px', padding: '40px', maxWidth: '400px',
      textAlign: 'center', boxShadow: '4px 4px 0px #1A1A1A',
    }}>
      <div style={{
        width: '48px', height: '48px', border: '4px solid #E8E3D9',
        borderTopColor: '#FF6B2B', borderRadius: '50%',
        animation: 'spinLoader 1s linear infinite',
        margin: '0 auto 20px',
      }} />
      <h2 style={{ fontFamily: 'Bricolage Grotesque', marginBottom: '8px', fontSize: '18px' }}>
        Confirmando tu pago
      </h2>
      <p style={{ color: '#6B6B6B', fontSize: '14px' }}>{pollMessage}</p>
    </div>
  </div>
)}

{/* Resultado final del pago */}
{paymentResult && !paymentChecking && (
  <div style={{
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.5)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', zIndex: 9999,
  }}>
    <div style={{
      background: '#FFFDF7', border: '2px solid #1A1A1A',
      borderRadius: '8px', padding: '32px', maxWidth: '420px',
      textAlign: 'center', boxShadow: '4px 4px 0px #1A1A1A',
    }}>
      {paymentResult.status === 'APPROVED' ? (
        <>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
          <h2 style={{ fontFamily: 'Bricolage Grotesque', marginBottom: '8px' }}>¡Pago exitoso!</h2>
          <p style={{ color: '#6B6B6B', marginBottom: '16px' }}>
            Tu plan <strong>{paymentResult.plan}</strong> ha sido activado.
            {paymentResult.plan_expires_at && (
              <> Válido hasta {new Date(paymentResult.plan_expires_at).toLocaleDateString('es-CO')}.</>
            )}
          </p>
          <button className="neo-btn neo-btn-primary" onClick={() => { setPaymentResult(null); window.location.reload(); }}>
            ¡Comenzar! →
          </button>
        </>
      ) : paymentResult.status === 'PENDING' ? (
        <>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏳</div>
          <h2 style={{ fontFamily: 'Bricolage Grotesque', marginBottom: '8px' }}>Pago en proceso</h2>
          <p style={{ color: '#6B6B6B', marginBottom: '16px' }}>
            Tu pago fue recibido pero el banco aún lo está procesando. 
            Esto es normal y puede tomar unos minutos. Tu plan se activará automáticamente 
            cuando el banco confirme.
          </p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="neo-btn neo-btn-primary" onClick={async () => {
              setPaymentChecking(true);
              setPollMessage('Verificando con Wompi...');
              try {
                const result = await pollPaymentStatus(paymentResult.reference, { intervalMs: 3000, maxAttempts: 10 });
                setPaymentResult(result);
                if (result.status === 'APPROVED') localStorage.setItem('washflow_plan', result.plan);
              } catch (e) { console.error(e); }
              finally { setPaymentChecking(false); }
            }}>
              Verificar ahora →
            </button>
            <button className="neo-btn neo-btn-outline" onClick={() => setPaymentResult(null)}>Cerrar</button>
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>❌</div>
          <h2 style={{ fontFamily: 'Bricolage Grotesque', marginBottom: '8px' }}>Pago no completado</h2>
          <p style={{ color: '#6B6B6B', marginBottom: '16px' }}>
            {paymentResult.status === 'DECLINED'
              ? 'El pago fue rechazado por el banco. Intenta con otro método de pago.'
              : 'Hubo un error procesando el pago. Intenta de nuevo.'}
          </p>
          <button className="neo-btn neo-btn-outline" onClick={() => setPaymentResult(null)}>Cerrar</button>
        </>
      )}
    </div>
  </div>
)}
```

---

## RESUMEN

### Archivos a modificar:
1. **`app/main.py`** (o donde esté el middleware JWT) — Agregar excepción para `/api/wompi/webhook` y `/api/wompi/webhook-test`
2. **`app/routers/wompi.py`** — Separar webhook en router público sin JWT + agregar logging + mejorar verify con consulta directa a Wompi + agregar webhook-test
3. **`app/services/wompi_service.py`** — Agregar `find_transaction_by_reference()`
4. **`src/services/wompi.js`** — Agregar `pollPaymentStatus()`
5. **`src/pages/Dashboard.jsx`** — Reemplazar verificación de pago con polling + modales mejorados

### Registrar ambos routers en main.py:
```python
from app.routers import wompi
app.include_router(wompi.router, prefix="/api")
app.include_router(wompi.public_router, prefix="/api")  # SIN JWT
```

### Verificación post-deploy:
1. Abrir `https://programacontablewebpage-production.up.railway.app/api/wompi/webhook-test` en el navegador → DEBE mostrar `{"status": "ok"}`
2. Si muestra 401/403 → la excepción JWT no funciona, revisar middleware
3. Si muestra 404 → el public_router no está registrado en main.py
4. Hacer un pago de prueba y verificar en los logs de Railway que aparezcan los mensajes "WOMPI WEBHOOK RECIBIDO" y "PLAN ACTIVADO"

### Flujo completo después del fix:
1. Usuario paga en Wompi
2. Wompi envía webhook → backend activa plan instantáneamente (Capa 1)
3. Usuario regresa a WashFlow → frontend hace polling cada 4s consultando a Wompi directo (Capa 2)
4. Si el webhook ya activó el plan, el polling lo detecta inmediatamente
5. Si el webhook falló, el polling consulta a Wompi, recibe APPROVED, y activa el plan
6. El usuario SIEMPRE ve "¡Pago exitoso!" sin intervención manual
