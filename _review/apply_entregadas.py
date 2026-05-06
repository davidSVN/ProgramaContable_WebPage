"""
Marca todas las órdenes pagadas como order_status='Entregada'.
Excluye:
  - Las que ya están en 'Entregada'
  - Las 'Cancelada' (no tiene sentido marcarlas como entregadas)
"""
import asyncio, asyncpg
from datetime import datetime

URL = "postgresql://postgres:fizFFfQYCpLuktSFNlBNaHAcEQVxbIom@interchange.proxy.rlwy.net:37113/railway"
TS = datetime.now().strftime("%Y%m%d_%H%M%S")
BACKUP_TABLE = f"_backup_fix_entregadas_{TS}"

WHERE_CLAUSE = """
WHERE tenant_id = 5
  AND is_paid = true
  AND order_status NOT IN ('Entregada', 'Cancelada')
"""

async def main():
    conn = await asyncpg.connect(URL, ssl=False, timeout=60)

    # 1. Backup
    print(f"=== Creando backup `{BACKUP_TABLE}` ===")
    await conn.execute(f"""
        CREATE TABLE {BACKUP_TABLE} AS
        SELECT * FROM orders {WHERE_CLAUSE}
    """)
    n = await conn.fetchval(f"SELECT COUNT(*) FROM {BACKUP_TABLE}")
    print(f"  ✔ {n} filas respaldadas")

    # 2. Aplicar UPDATE en transacción
    print(f"\n=== Aplicando UPDATE ===")
    async with conn.transaction():
        result = await conn.execute(f"""
            UPDATE orders SET order_status = 'Entregada'
            {WHERE_CLAUSE}
        """)
    print(f"  ✔ {result}")

    # 3. Verificación
    print(f"\n=== Verificación post-fix ===")
    rows = await conn.fetch("""
        SELECT tenant_id, order_status, COUNT(*) AS n
        FROM orders WHERE is_paid=true
        GROUP BY tenant_id, order_status ORDER BY tenant_id, n DESC
    """)
    cur = None
    for r in rows:
        if r['tenant_id'] != cur:
            cur = r['tenant_id']
            print(f"\nTenant {cur}:")
        print(f"  {r['order_status']:<20} {r['n']:>5}")

    print(f"\n✅ Backup en `{BACKUP_TABLE}`. Para revertir:")
    print(f"   UPDATE orders o SET order_status = b.order_status")
    print(f"   FROM {BACKUP_TABLE} b WHERE o.id = b.id;")

    await conn.close()

asyncio.run(main())
