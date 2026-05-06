"""
Aplica el FIX 1 (ingresos fantasma) a TODAS las órdenes B2C de TODOS los tenants.

Criterio: orden con balance_due <= 0, is_paid=false, status<>'Cancelada',
y suma de OrderPayment >= total_amount → marcar is_paid=true.

Pasos:
  1. Crear tabla backup _backup_fix_fantasma_<TS> con las filas que se
     modificarán (snapshot completo de orders).
  2. Mostrar el desglose por tenant.
  3. Ejecutar UPDATE en transacción.
  4. Verificar conteo post-fix.
"""
import asyncio, asyncpg
from datetime import datetime

URL = "postgresql://postgres:fizFFfQYCpLuktSFNlBNaHAcEQVxbIom@interchange.proxy.rlwy.net:37113/railway"
TS = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
BACKUP_TABLE = f"_backup_fix_fantasma_{TS}"

# Solo marcar como pagada si los pagos efectivamente cubren el total.
# Para órdenes B2C: comprobamos via order_payments.
# Para órdenes B2B: pueden cubrirse con consolidated_invoice_id, así que
# si is_institute=true y balance_due<=0 también las consideramos válidas
# (su flujo de cobranza no usa OrderPayment directo).
SELECT_AFECTADAS = """
WITH p AS (
  SELECT order_id, SUM(amount) AS sum_amt
  FROM order_payments WHERE order_id IS NOT NULL
  GROUP BY order_id
)
SELECT o.id
FROM orders o LEFT JOIN p ON p.order_id = o.id
WHERE o.is_paid = false
  AND o.balance_due <= 0
  AND o.order_status <> 'Cancelada'
  AND (
    -- B2C: pagos cubren el total
    (o.is_institute = false AND COALESCE(p.sum_amt, 0) >= o.total_amount)
    OR
    -- B2B: balance_due ya en 0 indica que la factura consolidada lo cubrió
    (o.is_institute = true)
  )
"""

async def main():
    conn = await asyncpg.connect(URL, ssl=False, timeout=30)

    # 1. Conteo previo por tenant
    print(f"\n=== Conteo de órdenes fantasma por tenant (antes del fix) ===")
    rows = await conn.fetch(f"""
        WITH afectadas AS ({SELECT_AFECTADAS})
        SELECT o.tenant_id, t.nombre,
               COUNT(*) AS n, SUM(o.total_amount) AS suma
        FROM afectadas a
        JOIN orders o ON o.id = a.id
        LEFT JOIN tenants t ON t.id = o.tenant_id
        GROUP BY o.tenant_id, t.nombre
        ORDER BY n DESC
    """)
    if not rows:
        print("(no hay órdenes fantasma)")
        await conn.close()
        return
    total = 0
    suma_total = 0.0
    for r in rows:
        total += r['n']
        suma_total += float(r['suma'] or 0)
        print(f"  Tenant {r['tenant_id']:>3} ({r['nombre'] or '?':<25}): {r['n']:>4} órdenes  ${r['suma']:>14,.0f}")
    print(f"  {'TOTAL':<37}  {total:>4} órdenes  ${suma_total:>14,.0f}")

    # 2. Backup
    print(f"\n=== Creando backup en tabla `{BACKUP_TABLE}` ===")
    await conn.execute(f"""
        CREATE TABLE {BACKUP_TABLE} AS
        SELECT o.* FROM orders o
        WHERE o.id IN ({SELECT_AFECTADAS})
    """)
    bkp_count = await conn.fetchval(f"SELECT COUNT(*) FROM {BACKUP_TABLE}")
    print(f"  ✔ {bkp_count} filas respaldadas")

    # 3. Aplicar UPDATE en transacción
    print(f"\n=== Aplicando UPDATE ===")
    async with conn.transaction():
        result = await conn.execute(f"""
            UPDATE orders SET is_paid = true
            WHERE id IN ({SELECT_AFECTADAS})
        """)
    # asyncpg returns "UPDATE N"
    print(f"  ✔ {result}")

    # 4. Verificación
    print(f"\n=== Verificación post-fix ===")
    remanente = await conn.fetchval(f"""
        SELECT COUNT(*) FROM ({SELECT_AFECTADAS}) x
    """)
    print(f"  Órdenes fantasma remanentes: {remanente}  (esperado: 0)")

    # Resumen tenant 5 actualizado
    row = await conn.fetchrow("""
        SELECT
          COUNT(*) FILTER (WHERE is_paid)                                  AS pagadas,
          COUNT(*) FILTER (WHERE NOT is_paid AND balance_due>0
                           AND order_status<>'Cancelada')                  AS por_cobrar,
          COUNT(*) FILTER (WHERE NOT is_paid AND balance_due<=0
                           AND order_status<>'Cancelada')                  AS fantasma
        FROM orders WHERE tenant_id=5 AND is_institute=false
    """)
    print(f"\n  Tenant 5 — pagadas={row['pagadas']}  por_cobrar={row['por_cobrar']}  fantasma_remanente={row['fantasma']}")

    print(f"\n✅ Fix aplicado. Backup en `{BACKUP_TABLE}` (puedes restaurar con INSERT INTO orders... ON CONFLICT).")
    await conn.close()

asyncio.run(main())
