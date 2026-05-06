"""Detecta el origen de la discrepancia entre /reportes/financiero y /gastos/stats para Mayo 2026, tenant 5."""
import asyncio, asyncpg
from datetime import datetime
URL = "postgresql://postgres:fizFFfQYCpLuktSFNlBNaHAcEQVxbIom@interchange.proxy.rlwy.net:37113/railway"

async def main():
    conn = await asyncpg.connect(URL, ssl=False, timeout=30)
    inicio = datetime(2026, 5, 1)
    fin    = datetime(2026, 5, 31, 23, 59, 59)

    print("\n=== Mayo 2026 — Tenant 5: gastos por categoría ===")
    rows = await conn.fetch("""
        SELECT spent_category, COUNT(*) AS n, SUM(spent_value) AS suma
        FROM spents_business
        WHERE tenant_id=5 AND spent_date >= $1 AND spent_date <= $2
        GROUP BY spent_category ORDER BY suma DESC
    """, inicio, fin)
    total_general = 0.0
    total_sin_agencia = 0.0
    for r in rows:
        cat = r['spent_category'] or '(null)'
        suma = float(r['suma'] or 0)
        total_general += suma
        if cat != 'Agencia':
            total_sin_agencia += suma
        print(f"  {cat:<25} {r['n']:>4}  ${suma:>14,.0f}")
    print(f"\n  {'TOTAL (todas las cat.)':<30} ${total_general:>14,.0f}  ← /gastos/stats")
    print(f"  {'TOTAL (sin Agencia)':<30} ${total_sin_agencia:>14,.0f}  ← /reportes/financiero")
    print(f"  {'DIFERENCIA':<30} ${total_general - total_sin_agencia:>14,.0f}")

    await conn.close()

asyncio.run(main())
