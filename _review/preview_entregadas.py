"""Dry-run: muestra cuántas órdenes pagadas se reclasificarían a 'Entregada'."""
import asyncio, asyncpg
URL = "postgresql://postgres:fizFFfQYCpLuktSFNlBNaHAcEQVxbIom@interchange.proxy.rlwy.net:37113/railway"

async def main():
    conn = await asyncpg.connect(URL, ssl=False, timeout=30)

    print("\n=== Órdenes pagadas por estado actual (todos los tenants) ===\n")
    rows = await conn.fetch("""
        SELECT tenant_id, order_status, COUNT(*) AS n,
               SUM(total_amount) AS suma
        FROM orders
        WHERE is_paid = true
        GROUP BY tenant_id, order_status
        ORDER BY tenant_id, n DESC
    """)
    cur = None
    for r in rows:
        if r['tenant_id'] != cur:
            cur = r['tenant_id']
            print(f"\nTenant {cur}:")
        marca = "→ se cambia" if r['order_status'] != 'Entregada' else "(ya está)"
        print(f"  {r['order_status']:<20} {r['n']:>5}  ${float(r['suma'] or 0):>14,.0f}  {marca}")

    print("\n\n=== Resumen del impacto ===")
    row = await conn.fetchrow("""
        SELECT
          COUNT(*) FILTER (WHERE order_status<>'Entregada' AND order_status<>'Cancelada') AS a_cambiar,
          COUNT(*) FILTER (WHERE order_status='Entregada') AS ya_entregada,
          COUNT(*) FILTER (WHERE order_status='Cancelada') AS canceladas_no_tocar
        FROM orders WHERE is_paid=true
    """)
    print(f"  A cambiar a 'Entregada':   {row['a_cambiar']}")
    print(f"  Ya estaban en 'Entregada': {row['ya_entregada']}")
    print(f"  Canceladas (NO se tocan):  {row['canceladas_no_tocar']}")

    await conn.close()

asyncio.run(main())
