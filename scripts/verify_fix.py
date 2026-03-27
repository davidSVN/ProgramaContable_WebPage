import asyncio
import os
import sys

# Add the project root to sys.path to import app modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import select, func
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

async def verify_orders():
    async with AsyncSessionLocal() as session:
        try:
            print(f"Verificando órdenes para el tenant {TENANT_ID}...")
            
            # 1. Fetch the orders
            stmt = select(OrderHeader).where(
                OrderHeader.tenant_id == TENANT_ID,
                func.upper(OrderHeader.user_name).in_(USER_NAMES)
            )
            result = await session.execute(stmt)
            orders = result.scalars().all()
            
            if not orders:
                print("EROR: No se encontraron órdenes para los usuarios especificados.")
                return

            all_ok = True
            order_ids = [o.id for o in orders]
            
            for o in orders:
                is_paid_ok = (o.is_paid == False)
                balance_ok = (abs(o.balance_due - o.total_amount) < 0.01)
                income_ok = (o.net_income_value == 0.0)
                
                if not (is_paid_ok and balance_ok and income_ok):
                    print(f"FALLO en Orden {o.id} ({o.user_name}): is_paid={o.is_paid}, balance={o.balance_due}/{o.total_amount}, income={o.net_income_value}")
                    all_ok = False
                else:
                    print(f"OK: Orden {o.id} ({o.user_name})")

            # 2. Check for payments
            print("Verificando pagos asociados...")
            pay_stmt = select(OrderPayment).where(OrderPayment.order_id.in_(order_ids))
            pay_result = await session.execute(pay_stmt)
            payments = pay_result.scalars().all()
            
            if payments:
                print(f"FALLO: Se encontraron {len(payments)} pagos asociados a estas órdenes.")
                all_ok = False
            else:
                print("OK: No se encontraron pagos asociados.")

            if all_ok:
                print("\n>>> VERIFICACIÓN EXITOSA: Todas las órdenes están correctamente marcadas como 'deben'.")
            else:
                print("\n>>> VERIFICACIÓN FALLIDA: Hay errores en los datos.")

        except Exception as e:
            print(f"Error durante la verificación: {e}")
        finally:
            await session.close()

if __name__ == "__main__":
    asyncio.run(verify_orders())
