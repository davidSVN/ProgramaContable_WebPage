import asyncio
import os
import sys

# Add the project root to sys.path to import app modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import select, func, delete, update
from app.database import AsyncSessionLocal
from app.models import OrderHeader, OrderPayment

# Target tenant and users
TENANT_ID = 5
USER_NAMES = [
    'YADIT ESTHER',
    'GABRIELA GUERRERO',
    'CLAUDIA MANRIQUE',
    'SANDRA TARRAGOZA',
    'OSCAR AVENDAÑO',
    'LUISA FERNANDA',
    'CARLOS PINZON',
    'GABRIELA GORRAIZ',
    'PAOLA FARIETA',
    'FRANKLIN SANDOR'
]

async def fix_orders():
    async with AsyncSessionLocal() as session:
        try:
            print(f"Buscando órdenes para el tenant {TENANT_ID}...")
            
            # 1. Find the orders
            stmt = select(OrderHeader).where(
                OrderHeader.tenant_id == TENANT_ID,
                func.upper(OrderHeader.user_name).in_(USER_NAMES)
            )
            result = await session.execute(stmt)
            orders = result.scalars().all()
            
            if not orders:
                print("No se encontraron órdenes para los usuarios especificados.")
                return

            order_ids = [o.id for o in orders]
            print(f"Se encontraron {len(orders)} órdenes: {order_ids}")

            # 2. Delete OrderPayment records
            print("Eliminando registros de pagos asociados...")
            del_stmt = delete(OrderPayment).where(OrderPayment.order_id.in_(order_ids))
            await session.execute(del_stmt)

            # 3. Update OrderHeader records
            print("Actualizando órdenes (is_paid=False, balance_due=total_amount, net_income_value=0.0)...")
            upd_stmt = (
                update(OrderHeader)
                .where(OrderHeader.id.in_(order_ids))
                .values(
                    is_paid=False,
                    balance_due=OrderHeader.total_amount,
                    net_income_value=0.0
                )
            )
            await session.execute(upd_stmt)

            # Commit changes
            await session.commit()
            print("¡Cambios aplicados exitosamente!")

        except Exception as e:
            print(f"Error durante la ejecución: {e}")
            await session.rollback()
        finally:
            await session.close()

if __name__ == "__main__":
    asyncio.run(fix_orders())
