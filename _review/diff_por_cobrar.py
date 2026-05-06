"""Compara los dos scorecards de 'por cobrar' para tenant 5 histórico."""
import asyncio, asyncpg
URL = "postgresql://postgres:fizFFfQYCpLuktSFNlBNaHAcEQVxbIom@interchange.proxy.rlwy.net:37113/railway"

async def main():
    conn = await asyncpg.connect(URL, ssl=False, timeout=15)

    print("\n=== Tenant 5 — desglose de balance_due > 0 ===\n")

    # 1. IA y Reportes (/reportes/financiero) — TODO incluye B2B
    ia = await conn.fetchrow("""
        SELECT COALESCE(SUM(balance_due),0) AS suma, COUNT(*) AS n
        FROM orders
        WHERE tenant_id=5 AND is_paid=false
          AND order_status<>'Cancelada' AND balance_due>0
    """)
    print(f"  IA y Reportes (incluye B2C+B2B): ${float(ia['suma']):>12,.0f}  ({ia['n']} órdenes)")

    # 2. Pestaña Por Cobrar (/historial/stats con is_institute=false) — solo B2C
    pc = await conn.fetchrow("""
        SELECT COALESCE(SUM(balance_due),0) AS suma, COUNT(*) AS n
        FROM orders
        WHERE tenant_id=5 AND is_institute=false
          AND order_status<>'Cancelada' AND balance_due>0
    """)
    print(f"  Pestaña Por Cobrar (solo B2C):    ${float(pc['suma']):>12,.0f}  ({pc['n']} órdenes)")

    # 3. Lo que es B2B
    b2b = await conn.fetchrow("""
        SELECT COALESCE(SUM(balance_due),0) AS suma, COUNT(*) AS n
        FROM orders
        WHERE tenant_id=5 AND is_institute=true
          AND order_status<>'Cancelada' AND balance_due>0
    """)
    print(f"  Diferencia (solo B2B):            ${float(b2b['suma']):>12,.0f}  ({b2b['n']} órdenes)")

    print(f"\n  ¿Cuadra? {float(ia['suma']) - float(pc['suma'])} debe ser ≈ {float(b2b['suma'])}")

    # Detalle B2B
    print("\n=== Órdenes B2B con balance_due > 0 ===")
    rows = await conn.fetch("""
        SELECT id, order_number, user_name, total_amount, balance_due, order_status, date
        FROM orders WHERE tenant_id=5 AND is_institute=true
          AND order_status<>'Cancelada' AND balance_due>0
        ORDER BY balance_due DESC LIMIT 20
    """)
    for r in rows:
        print(f"  #{r['order_number']:<6} {(r['user_name'] or '?')[:30]:<32} total=${float(r['total_amount']):>10,.0f}  debe=${float(r['balance_due']):>10,.0f}  {r['order_status']:<12} {str(r['date'])[:10]}")

    await conn.close()

asyncio.run(main())
