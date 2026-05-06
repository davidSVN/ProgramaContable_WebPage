"""Compara facturas_por_cobrar antes/después del fix por periodo (tenant 5)."""
import asyncio, asyncpg
from datetime import datetime, timedelta

URL = "postgresql://postgres:fizFFfQYCpLuktSFNlBNaHAcEQVxbIom@interchange.proxy.rlwy.net:37113/railway"
TENANT = 5

async def main():
    conn = await asyncpg.connect(URL, ssl=False, timeout=15)
    hoy = datetime.utcnow()

    rangos = {
        "mes (May 2026)":     (datetime(2026, 5, 1), datetime(2026, 5, 31, 23, 59, 59)),
        "trimestre (Q2 2026)":(datetime(2026, 4, 1), datetime(2026, 6, 30, 23, 59, 59)),
        "año (2026)":         (datetime(2026, 1, 1), datetime(2026, 12, 31, 23, 59, 59)),
        "año (2025)":         (datetime(2025, 1, 1), datetime(2025, 12, 31, 23, 59, 59)),
        "todo":               (datetime(2000, 1, 1), hoy),
    }
    print("\n📊 facturas_por_cobrar por periodo (tenant 5)\n")
    print(f"{'Periodo':<25} {'Suma balance_due':>20} {'# órdenes':>12}")
    print("-" * 60)

    Q = """
        SELECT COALESCE(SUM(balance_due), 0) AS suma, COUNT(*) AS n
        FROM orders
        WHERE tenant_id=$1 AND is_paid=false
          AND order_status<>'Cancelada' AND balance_due>0
          AND date >= $2 AND date <= $3
    """
    for name, (inicio, fin) in rangos.items():
        row = await conn.fetchrow(Q, TENANT, inicio, fin)
        print(f"{name:<25} ${row['suma']:>18,.0f} {row['n']:>12}")

    # Histórico sin filtro (lo que mostraba antes)
    row = await conn.fetchrow("""
        SELECT COALESCE(SUM(balance_due), 0) AS suma, COUNT(*) AS n
        FROM orders WHERE tenant_id=$1 AND is_paid=false
          AND order_status<>'Cancelada' AND balance_due>0
    """, TENANT)
    print(f"\n[ANTES, sin filtro de fecha — siempre el mismo número]")
    print(f"  Suma = ${row['suma']:,.0f}   # órdenes = {row['n']}")

    await conn.close()

asyncio.run(main())
