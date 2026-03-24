# CAMBIO URGENTE: Corregir precios en toda la app + Trial 14 días al 50%

## Problema legal

Los precios que se muestran al usuario en el frontend ($49.900 y $89.900) NO coinciden con lo que realmente se cobra en el backend ($69.900 y $94.900). Esto puede traer problemas legales. TODOS los archivos deben mostrar los mismos valores que se cobran.

## Precios correctos y definitivos

| Plan | Precio mensual | En centavos (Wompi) |
|------|---------------|---------------------|
| Basic | $69.900/mes | 6990000 |
| Premium | $94.900/mes | 9490000 |
| Basic trial (14 días, 50% dto) | $34.950 | 3495000 |
| Premium trial (14 días, 50% dto) | $47.450 | 4745000 |

**SE ELIMINA el plan anual.** Solo queda mensual + trial.

## Cambios requeridos

### 1. `src/services/wompi.js` — CORREGIR PRECIOS + eliminar anual + agregar trial

Reemplazar el objeto `PLAN_PRICES` completo:

```javascript
export const PLAN_PRICES = {
  basic: {
    monthly: { amount: 69900, label: '$69.900/mes' },
    trial:   { amount: 34950, label: '$34.950', originalLabel: '$69.900/mes', savings: '50% de descuento por 14 días' },
  },
  premium: {
    monthly: { amount: 94900, label: '$94.900/mes' },
    trial:   { amount: 47450, label: '$47.450', originalLabel: '$94.900/mes', savings: '50% de descuento por 14 días' },
  },
};
```

### 2. `app/services/wompi_service.py` — Eliminar plan anual + agregar precios trial

Reemplazar el diccionario `PLAN_PRICES` completo:

```python
PLAN_PRICES = {
    "basic": {
        "monthly": 6990000,     # $69.900 COP
        "trial": 3495000,       # $34.950 COP (50% descuento, 14 días)
    },
    "premium": {
        "monthly": 9490000,     # $94.900 COP
        "trial": 4745000,       # $47.450 COP (50% descuento, 14 días)
    },
}
```

También modificar la función `process_approved_transaction` para que maneje el período "trial":

En la sección donde se calcula `expires_at`, cambiar:

```python
    # Calcular expiración según período
    now = datetime.utcnow()
    if transaction.billing_period == "yearly":
        expires_at = now + timedelta(days=365)
    elif transaction.billing_period == "trial":
        expires_at = now + timedelta(days=14)
    else:
        expires_at = now + timedelta(days=30)
```

Y en `create_payment_record`, validar que el período sea válido:

```python
async def create_payment_record(
    db: AsyncSession,
    tenant_id: int,
    plan: str,
    period: str,
) -> PaymentTransaction:
    """Crea un registro de transacción pendiente."""
    if period not in ("monthly", "trial"):
        raise ValueError(f"Período inválido: {period}")
    amount = get_price(plan, period)
    # ... resto igual
```

### 3. `app/routers/wompi.py` — Actualizar validación de período

En el endpoint `POST /create-payment`, cambiar la validación:

```python
    # Validar período — CAMBIAR de:
    # if body.period not in ("monthly", "yearly"):
    # A:
    if body.period not in ("monthly", "trial"):
        raise HTTPException(status_code=400, detail="Período inválido. Debe ser 'monthly' o 'trial'.")
```

También agregar lógica para que un tenant solo pueda usar "trial" UNA VEZ:

```python
    # Verificar si el tenant ya usó el trial
    if body.period == "trial":
        from sqlalchemy import select as sql_select
        existing_trial = await db.execute(
            sql_select(PaymentTransaction).where(
                PaymentTransaction.tenant_id == current_user.tenant_id,
                PaymentTransaction.billing_period == "trial",
                PaymentTransaction.status == "APPROVED",
            )
        )
        if existing_trial.scalars().first():
            raise HTTPException(
                status_code=400, 
                detail="Ya utilizaste tu período de prueba. Selecciona el plan mensual."
            )
```

### 4. `src/pages/Landing.jsx` — CORREGIR PRECIOS + eliminar anual + agregar trial

Reemplazar el objeto `PRICES` y eliminar el toggle de período:

```javascript
const PRICES = {
  basic:   { monthly: '$69.900/mes',  trial: '$34.950 por 14 días' },
  premium: { monthly: '$94.900/mes',  trial: '$47.450 por 14 días' },
}
```

Reemplazar toda la sección `<section className="pricing">` con esta versión que muestra el trial prominentemente:

```jsx
      <section className="pricing" id="pricing">
        <div className="pricing__inner">

          <div className="pricing__header">
            <h2 className="pricing__title">
              Precios que te hacen crecer,<br/>
              <span className="pricing__title--accent">no que te frenan.</span>
            </h2>
            <p className="pricing__sub">Sin contratos. Sin sorpresas. Cancela cuando quieras.</p>
          </div>

          {/* Banner de trial */}
          <div style={{
            background: 'linear-gradient(135deg, #FF6B2B 0%, #E55A1C 100%)',
            color: '#fff',
            padding: '16px 24px',
            borderRadius: '8px',
            textAlign: 'center',
            marginBottom: '32px',
            border: '2px solid #1A1A1A',
            boxShadow: '4px 4px 0px #1A1A1A',
          }}>
            <div style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'Bricolage Grotesque, sans-serif', marginBottom: '4px' }}>
              🔥 50% de descuento los primeros 14 días
            </div>
            <div style={{ fontSize: '14px', opacity: 0.9 }}>
              Prueba todo el poder de WashFlow a mitad de precio. Después se cobra el valor normal.
            </div>
          </div>

          <div className="pricing__cards">

            {/* Basic */}
            <div className="pricing__card">
              <div className="pricing__card-header">
                <h3 className="pricing__plan-name">Basic</h3>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', justifyContent: 'center' }}>
                  <div className="pricing__price">$34.950</div>
                </div>
                <div className="pricing__period-label">primeros 14 días</div>
                <div style={{ fontSize: '13px', color: '#6B6B6B', marginTop: '4px' }}>
                  Después <strong>$69.900/mes</strong>
                </div>
              </div>
              <ul className="pricing__features">
                {BASIC_FEATURES.map(f => (
                  <li key={f} className="pricing__feature">
                    <span className="pricing__check">✓</span>{f}
                  </li>
                ))}
              </ul>
              <Link to="/register" className="pricing__cta pricing__cta--basic">
                Probar 14 días al 50% →
              </Link>
            </div>

            {/* Premium */}
            <div className="pricing__card pricing__card--premium">
              <div className="pricing__badge">⭐ Más popular</div>
              <div className="pricing__card-header">
                <h3 className="pricing__plan-name pricing__plan-name--premium">Premium</h3>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', justifyContent: 'center' }}>
                  <div className="pricing__price">$47.450</div>
                </div>
                <div className="pricing__period-label">primeros 14 días</div>
                <div style={{ fontSize: '13px', color: '#6B6B6B', marginTop: '4px' }}>
                  Después <strong>$94.900/mes</strong>
                </div>
              </div>
              <ul className="pricing__features">
                {PREMIUM_FEATURES.map(f => (
                  <li key={f} className="pricing__feature pricing__feature--premium">
                    <span className="pricing__check pricing__check--premium">✓</span>{f}
                  </li>
                ))}
              </ul>
              <Link to="/register" className="pricing__cta pricing__cta--premium">
                Probar 14 días al 50% →
              </Link>
            </div>

          </div>

          <p className="pricing__trust">
            🔒 Pago seguro con Wompi · Cancela cuando quieras · Soporte incluido
          </p>

        </div>
      </section>
```

**ELIMINAR** completamente el toggle de período mensual/anual (el `<div className="pricing__period">` y el estado `period`). Ya no existe plan anual.

Eliminar el estado `period` del componente:
```javascript
// ELIMINAR esta línea:
// const [period, setPeriod] = useState('monthly')
```

### 5. Configuracion.jsx — PlanModal con precios correctos + trial

Buscar el componente `PlanModal` y actualizarlo. Si ya fue reemplazado por Claude Code con la versión de Wompi, buscar donde se muestran los precios y actualizarlos.

El PlanModal debe:
- Mostrar `$69.900/mes` para Basic y `$94.900/mes` para Premium
- Si el tenant NUNCA ha tenido un trial (verificar con endpoint `/wompi/subscription-status` o similar), mostrar la opción de trial al 50%
- Si ya usó el trial, solo mostrar el precio mensual normal
- NO mostrar opción anual (eliminarla completamente)

Reemplazar el selector de período en el PlanModal. En vez del toggle mensual/anual, mostrar:

```jsx
{/* Si el trial está disponible, mostrar banner */}
{!usedTrial && (
  <div style={{
    background: '#FFF5F0', border: '1px solid #FF6B2B', borderRadius: '8px',
    padding: '12px 16px', marginBottom: '20px', textAlign: 'center',
  }}>
    <div style={{ fontSize: '14px', fontWeight: 600, color: '#FF6B2B' }}>
      🔥 Descuento especial: 50% los primeros 14 días
    </div>
    <div style={{ fontSize: '12px', color: '#6B6B6B', marginTop: '4px' }}>
      Después se cobra el precio normal automáticamente.
    </div>
  </div>
)}
```

Y los precios de cada plan deben mostrar:
- Si trial disponible: "$34.950 por 14 días" con texto tachado "$69.900/mes" y botón "Probar 14 días al 50%"
- Si trial ya usado: "$69.900/mes" con botón "Pagar Basic →"

Para saber si el trial fue usado, agregar al inicio del PlanModal:

```jsx
const [usedTrial, setUsedTrial] = useState(true); // default true para no mostrar trial hasta verificar

useEffect(() => {
  api.get('/wompi/subscription-status')
    .then(data => {
      // Si el tenant tiene has_used_trial en la respuesta, úsalo
      setUsedTrial(data.has_used_trial || false);
    })
    .catch(() => {});
}, []);
```

Cuando el usuario hace clic en un plan, enviar el período correcto:

```jsx
const handleSelect = async (plan) => {
  const period = !usedTrial ? 'trial' : 'monthly';
  // ... crear pago con ese período
  const paymentData = await createPayment(plan, period);
  // ... redirect a Wompi
};
```

### 6. Backend — Endpoint subscription-status debe incluir has_used_trial

En `app/routers/wompi.py`, en el endpoint `GET /subscription-status`, agregar:

```python
    # Verificar si el tenant ya usó el trial
    trial_stmt = select(PaymentTransaction).where(
        PaymentTransaction.tenant_id == tenant.id,
        PaymentTransaction.billing_period == "trial",
        PaymentTransaction.status == "APPROVED",
    )
    trial_result = await db.execute(trial_stmt)
    has_used_trial = trial_result.scalars().first() is not None

    return {
        # ... campos existentes ...
        "has_used_trial": has_used_trial,
    }
```

### 7. Renovación automática después del trial

En `app/services/wompi_service.py`, en la función `process_recurring_renewals`, cuando un tenant con período "trial" vence, el cobro recurrente debe ser por el precio MENSUAL completo, no por el precio de trial:

```python
    # En process_recurring_renewals, al determinar el monto:
    billing_period = last_tx.billing_period if last_tx else "monthly"
    
    # Si el último pago fue trial, el siguiente debe ser monthly
    if billing_period == "trial":
        billing_period = "monthly"
    
    amount = get_price(tenant.plan, billing_period)
```

Y al crear el registro de la transacción de renovación, usar "monthly" aunque el último fue "trial":

```python
            transaction = PaymentTransaction(
                tenant_id=tenant.id,
                reference=reference,
                plan=tenant.plan,
                billing_period="monthly",  # Siempre monthly en renovaciones
                amount_in_cents=amount,
                currency="COP",
                status="PENDING",
            )
```

---

## BÚSQUEDA GLOBAL — Encontrar TODOS los archivos con precios viejos

Ejecuta estos comandos para asegurarte de que no quede NINGÚN precio viejo en el código:

```bash
# Buscar precios viejos en todo el proyecto
grep -rn "49.900" --include="*.js" --include="*.jsx" --include="*.py" --include="*.ts" --include="*.tsx"
grep -rn "89.900" --include="*.js" --include="*.jsx" --include="*.py" --include="*.ts" --include="*.tsx"
grep -rn "479.000" --include="*.js" --include="*.jsx" --include="*.py" --include="*.ts" --include="*.tsx"
grep -rn "862.000" --include="*.js" --include="*.jsx" --include="*.py" --include="*.ts" --include="*.tsx"
grep -rn "4990000" --include="*.js" --include="*.jsx" --include="*.py"
grep -rn "8990000" --include="*.js" --include="*.jsx" --include="*.py"
grep -rn "47900000" --include="*.js" --include="*.jsx" --include="*.py"
grep -rn "86200000" --include="*.js" --include="*.jsx" --include="*.py"
grep -rn "yearly" --include="*.js" --include="*.jsx" --include="*.py"
```

Si cualquiera de estos grep muestra resultados, CORRIGE ese archivo también. El objetivo es que NO EXISTA ninguna referencia a los precios viejos ni al plan anual en ningún archivo del proyecto.

---

## Resumen de archivos a modificar

1. **`src/services/wompi.js`** — Corregir precios, eliminar yearly, agregar trial
2. **`app/services/wompi_service.py`** — Corregir precios, eliminar yearly, agregar trial, ajustar renovación
3. **`app/routers/wompi.py`** — Cambiar validación de período, agregar verificación de trial único, agregar has_used_trial a subscription-status
4. **`src/pages/Landing.jsx`** — Corregir precios, eliminar toggle anual, agregar banner de trial
5. **`src/pages/Configuracion/Configuracion.jsx`** (o donde esté PlanModal) — Corregir precios, eliminar anual, agregar lógica de trial
6. **Cualquier otro archivo** que el grep revele con precios viejos

## Reglas inquebrantables

- El precio que se MUESTRA al usuario debe ser IDÉNTICO al que se COBRA. Sin excepciones.
- El trial de 14 días solo se puede usar UNA VEZ por tenant.
- Después del trial, se cobra automáticamente el precio mensual completo ($69.900 o $94.900).
- NO existe plan anual. Eliminar toda referencia a "yearly", "anual", "$479.000", "$862.000".
- Si un grep encuentra precios viejos en algún archivo no listado aquí, CORREGIRLO también.
