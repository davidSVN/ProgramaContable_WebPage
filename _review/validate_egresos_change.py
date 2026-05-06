"""Valida que el cambio (ingresos=total_amount, egresos incluye agencia)
preserve aproximadamente el neto histórico para tenant 5."""
import asyncio, asyncpg
from datetime import datetime
URL = "postgresql://postgres:fizFFfQYCpLuktSFNlBNaHAcEQVxbIom@interchange.proxy.rlwy.net:37113/railway"

async def main():
    conn = await asyncpg.connect(URL, ssl=False, timeout=30)
    rangos = {
        "Mayo 2026":  (datetime(2026, 5, 1), datetime(2026, 5, 31, 23, 59, 59)),
        "Abril 2026": (datetime(2026, 4, 1), datetime(2026, 4, 30, 23, 59, 59)),
        "Año 2026":   (datetime(2026, 1, 1), datetime(2026, 12, 31, 23, 59, 59)),
        "Histórico":  (datetime(2000, 1, 1), datetime.utcnow()),
    }
    print(f"\n{'Periodo':<13} {'Ingresos antes':>17} {'Ingresos nuevo':>17} {'Egresos antes':>15} {'Egresos nuevo':>15} {'Neto antes':>13} {'Neto nuevo':>13} {'Δ neto':>10}")
    print("-" * 130)
    for name, (i, f) in rangos.items():
        # ANTES: ingresos = sum(net_income_value WHERE is_paid), egresos = sum(spent_value WHERE cat<>'Agencia')
        ing_antes = float(await conn.fetchval("""
            SELECT COALESCE(SUM(net_income_value),0) FROM orders
            WHERE tenant_id=5 AND is_paid=true AND date>=$1 AND date<=$2
        """, i, f))
        egr_antes = float(await conn.fetchval("""
            SELECT COALESCE(SUM(spent_value),0) FROM spents_business
            WHERE tenant_id=5 AND spent_category<>'Agencia' AND spent_date>=$1 AND spent_date<=$2
        """, i, f))
        # NUEVO: ingresos = sum(total_amount WHERE is_paid), egresos = sum(spent_value)
        ing_nuevo = float(await conn.fetchval("""
            SELECT COALESCE(SUM(total_amount),0) FROM orders
            WHERE tenant_id=5 AND is_paid=true AND date>=$1 AND date<=$2
        """, i, f))
        egr_nuevo = float(await conn.fetchval("""
            SELECT COALESCE(SUM(spent_value),0) FROM spents_business
            WHERE tenant_id=5 AND spent_date>=$1 AND spent_date<=$2
        """, i, f))
        neto_a = ing_antes - egr_antes
        neto_n = ing_nuevo - egr_nuevo
        print(f"{name:<13} ${ing_antes:>15,.0f} ${ing_nuevo:>15,.0f} ${egr_antes:>13,.0f} ${egr_nuevo:>13,.0f} ${neto_a:>11,.0f} ${neto_n:>11,.0f} ${neto_n-neto_a:>+8,.0f}")

    await conn.close()

asyncio.run(main())
