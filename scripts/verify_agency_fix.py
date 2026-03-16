import asyncio
import os
import sys
import traceback
from datetime import datetime
from sqlalchemy import select

# Añadir el directorio raíz al path para importar app
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import AsyncSessionLocal
from app.models import Service, OrderHeader, SpentBusiness, LaundryUser
from app.services import facturacion_b2c_service as service

async def verify():
    async with AsyncSessionLocal() as db:
        try:
            tenant_id = 1
            
            # 1. Asegurar un cliente de prueba
            res_user = await db.execute(select(LaundryUser).where(LaundryUser.tenant_id == tenant_id))
            user = res_user.scalars().first()
            if not user:
                user = LaundryUser(tenant_id=tenant_id, user_name="Test User", user_contact="123456", user_type="B2C")
                db.add(user)
                await db.flush()
            
            # 2. Asegurar un servicio de agencia
            svc_name = "Agency Test Service " + datetime.now().strftime("%H%M%S")
            svc = Service(
                tenant_id=tenant_id,
                service_name=svc_name,
                service_value=20000.0,
                spent_per_service=14000.0,
                user_institute="usuario"
            )
            db.add(svc)
            await db.flush()
            
            print(f"--- Testing Agency Order Creation ---")
            # 3. Crear orden
            order_data = {
                "id": svc.service_id,
                "name": svc.service_name,
                "qty": 1,
                "value": 20000.0,
                "is_agency": True
            }
            
            result = await service.crear_orden(
                db=db,
                tenant_id=tenant_id,
                user_id=user.user_id,
                servicios_data=[order_data],
                items_description="Verification test",
                state_payment="Pagada",
                pagos=[{"monto": 20000.0, "metodo_pago": "Efectivo"}],
                discount_value=0.0,
                state_state="Entregada"
            )
            
            if isinstance(result, str):
                print(f"❌ Error in result: {result}")
            else:
                print(f"✅ Success: Order #{result.order_id}")

        except Exception as e:
            print(f"❌ Caught Exception: {e}")
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(verify())
