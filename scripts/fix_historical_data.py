"""
Migración de datos históricos — ejecutar UNA sola vez.

IMPORTANTE: El script crea un backup JSON ANTES de cualquier modificación.
El backup se guarda en scripts/backup_<timestamp>.json.

Corrige:

  FIX 1 — Órdenes B2C "fantasma" (is_paid=True sin OrderPayment)
    Resetea is_paid=False, balance_due=total_amount para que el dashboard
    las excluya del ingreso cobrado y aparezcan en "por cobrar".

  FIX 2 — Órdenes B2B pagadas vía factura consolidada sin OrderPayment por orden
    Crea un OrderPayment por orden vinculado a la factura consolidada
    para trazabilidad cash-basis completa.

Uso:
    cd lavalatu-api
    python scripts/fix_historical_data.py
"""

import json
import os
import sys
from datetime import datetime, date

# ── Conexión ─────────────────────────────────────────────────────────────────

def get_conn():
    import psycopg2
    db_url = os.environ.get("DATABASE_URL", "")

    # Cargar .env manualmente si no hay variable de entorno
    if not db_url:
        env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
        if os.path.exists(env_path):
            with open(env_path) as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("DATABASE_URL="):
                        db_url = line.split("=", 1)[1]
                        break

    if not db_url:
        print("ERROR: DATABASE_URL no encontrada.")
        sys.exit(1)

    # psycopg2 usa postgresql:// sin +asyncpg
    db_url = db_url.replace("postgresql+asyncpg://", "postgresql://")
    return psycopg2.connect(db_url)


def json_serial(obj):
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    raise TypeError(f"Type {type(obj)} not serializable")


# ── Diagnóstico ───────────────────────────────────────────────────────────────

QUERY_FANTASMAS_B2C = """
SELECT oh.id, oh.order_number, oh.user_name, oh.total_amount,
       oh.balance_due, oh.is_paid, oh.order_status, oh.date,
       oh.net_income_value, oh.is_institute, oh.consolidated_invoice_id
FROM orders oh
LEFT JOIN order_payments op ON op.order_id = oh.id
WHERE oh.tenant_id = 5
  AND oh.is_paid = TRUE
  AND oh.balance_due = 0
  AND oh.order_status != 'Cancelada'
  AND oh.total_amount > 0
  AND oh.consolidated_invoice_id IS NULL
  AND op.id IS NULL
ORDER BY oh.date
"""

QUERY_B2B_SIN_PAYMENT = """
SELECT oh.id, oh.order_number, oh.user_name, oh.total_amount,
       oh.consolidated_invoice_id, oh.date, oh.is_paid, oh.balance_due,
       oh.order_status
FROM orders oh
LEFT JOIN order_payments op ON op.order_id = oh.id
WHERE oh.tenant_id = 5
  AND oh.is_institute = TRUE
  AND oh.is_paid = TRUE
  AND oh.balance_due = 0
  AND oh.order_status != 'Cancelada'
  AND oh.total_amount > 0
  AND oh.consolidated_invoice_id IS NOT NULL
  AND op.id IS NULL
ORDER BY oh.date
"""


def run():
    conn = get_conn()
    cur = conn.cursor()

    # ── DIAGNÓSTICO ───────────────────────────────────────────────────────────
    cur.execute(QUERY_FANTASMAS_B2C)
    cols = [d[0] for d in cur.description]
    fantasmas_b2c = [dict(zip(cols, row)) for row in cur.fetchall()]

    cur.execute(QUERY_B2B_SIN_PAYMENT)
    cols = [d[0] for d in cur.description]
    b2b_sin_payment = [dict(zip(cols, row)) for row in cur.fetchall()]

    total_b2c = sum(float(r["total_amount"]) for r in fantasmas_b2c)
    total_b2b = sum(float(r["total_amount"]) for r in b2b_sin_payment)

    print("\n" + "="*70)
    print("DIAGNÓSTICO")
    print("="*70)

    print(f"\nFIX 1 — Órdenes B2C fantasma a resetear: {len(fantasmas_b2c)} órdenes")
    for r in fantasmas_b2c:
        print(f"  #{r['order_number']:<6} {r['user_name']:<28} ${float(r['total_amount']):>10,.0f}  {str(r['date'])[:10]}")
    print(f"  {'TOTAL:':<36} ${total_b2c:>10,.0f}")

    print(f"\nFIX 2 — Órdenes B2B sin OrderPayment por orden: {len(b2b_sin_payment)} órdenes")
    for r in b2b_sin_payment:
        print(f"  #{r['order_number']:<6} {r['user_name']:<28} ${float(r['total_amount']):>10,.0f}  factura #{r['consolidated_invoice_id']}")
    print(f"  {'TOTAL:':<36} ${total_b2b:>10,.0f}")

    if not fantasmas_b2c and not b2b_sin_payment:
        print("\nNada que corregir. Script finalizado.")
        cur.close()
        conn.close()
        return

    # ── CONFIRMACIÓN ─────────────────────────────────────────────────────────
    print("\n" + "="*70)
    resp = input("¿Crear backup y aplicar correcciones? [s/N]: ").strip().lower()
    if resp != "s":
        print("Cancelado.")
        cur.close()
        conn.close()
        return

    # ── BACKUP ───────────────────────────────────────────────────────────────
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        f"backup_{ts}.json"
    )
    backup = {
        "timestamp": ts,
        "fix1_ordenes_b2c_fantasma": fantasmas_b2c,
        "fix2_ordenes_b2b_sin_payment": b2b_sin_payment,
    }
    with open(backup_path, "w", encoding="utf-8") as f:
        json.dump(backup, f, default=json_serial, indent=2, ensure_ascii=False)
    print(f"\nOK Backup guardado en: {backup_path}")

    # ── FIX 1: Resetear órdenes B2C fantasma ─────────────────────────────────
    if fantasmas_b2c:
        ids = [r["id"] for r in fantasmas_b2c]
        cur.execute(
            """
            UPDATE orders
            SET is_paid = FALSE,
                balance_due = total_amount
            WHERE id = ANY(%s)
              AND tenant_id = 5
            """,
            (ids,)
        )
        print(f"\nOK FIX 1: {cur.rowcount} órdenes B2C reseteadas a is_paid=FALSE")

    # ── FIX 2: Crear OrderPayments para B2B sin payment por orden ─────────────
    if b2b_sin_payment:
        creados = 0
        for r in b2b_sin_payment:
            cur.execute(
                """
                INSERT INTO order_payments
                    (tenant_id, order_id, order_number, consolidated_invoice_id,
                     user_id, user_name, payment_method, amount)
                SELECT
                    oh.tenant_id,
                    oh.id,
                    oh.order_number,
                    oh.consolidated_invoice_id,
                    oh.user_id,
                    oh.user_name,
                    'Factura Consolidada (Migración)',
                    oh.total_amount
                FROM orders oh
                WHERE oh.id = %s
                """,
                (r["id"],)
            )
            creados += cur.rowcount

        print(f"OK FIX 2: {creados} OrderPayments creados para órdenes B2B")

    conn.commit()
    print("\nOK Cambios confirmados en base de datos.")
    cur.close()
    conn.close()


if __name__ == "__main__":
    run()
