import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

# Añadir el directorio raíz al path para importar app
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import AsyncSessionLocal, engine
from app.models import LaundryUser, Service, OrderHeader, OrderDetail, Tenant

TENANT_ID = 1

async def seed():
    async with AsyncSessionLocal() as db:
        # 0. Asegurar que el Tenant existe
        res_tenant = await db.execute(select(Tenant).where(Tenant.id == TENANT_ID))
        tenant = res_tenant.scalars().first()
        if not tenant:
            tenant = Tenant(id=TENANT_ID, nombre="Tenant de Prueba", ciudad="Bogotá")
            db.add(tenant)
            await db.commit()
            print(f"✅ Tenant ID {TENANT_ID} creado.")

        # --- PART A: B2C Clients ---
        b2c_clients = [
            {"user_name": "María Torres", "user_contact": "3144500001", "user_type": "B2C", 
             "state": True, "payment_condition": "Contado", "saldo_a_favor": 7000.0,
             "loyalty_level": "Nivel 1"},
            {"user_name": "Carlos Pérez", "user_contact": "3155600002", "user_type": "B2C",
             "state": True, "payment_condition": "Contado", "saldo_a_favor": 0.0,
             "loyalty_level": "Nivel 1"},
            {"user_name": "Luisa Gómez", "user_contact": "3166700003", "user_type": "B2C",
             "state": True, "payment_condition": "Contado", "saldo_a_favor": 0.0,
             "loyalty_level": "Nivel 2"},
            {"user_name": "Andrés Martínez", "user_contact": "3177800004", "user_type": "B2C",
             "state": True, "payment_condition": "Contado", "saldo_a_favor": 15000.0,
             "loyalty_level": "Nivel 1"},
            {"user_name": "Sofía Ramírez", "user_contact": "3188900005", "user_type": "B2C",
             "state": True, "payment_condition": "Contado", "saldo_a_favor": 0.0,
             "loyalty_level": "Nivel 1"},
        ]

        for c_data in b2c_clients:
            res = await db.execute(
                select(LaundryUser).where(
                    LaundryUser.user_name == c_data["user_name"],
                    LaundryUser.tenant_id == TENANT_ID
                )
            )
            if not res.scalars().first():
                db.add(LaundryUser(tenant_id=TENANT_ID, **c_data))
        
        await db.commit()
        print("✅ Clientes B2C procesados.")

        # --- PART B: B2B Institutions ---
        b2b_inst = [
            {"user_name": "Hotel Dann Carlton", "user_contact": "6012345678", 
             "user_type": "B2B", "payment_condition": "Al crédito", "saldo_a_favor": 50000.0,
             "state": True, "loyalty_level": "Nivel 3"},
            {"user_name": "Clínica San Rafael", "user_contact": "6019876543",
             "user_type": "B2B", "payment_condition": "Al crédito", "saldo_a_favor": 0.0,
             "state": True, "loyalty_level": "Nivel 2"},
            {"user_name": "Restaurante La Fondue", "user_contact": "3209876543",
             "user_type": "B2B", "payment_condition": "Contado", "saldo_a_favor": 0.0,
             "state": True, "loyalty_level": "Nivel 1"},
        ]

        for inst_data in b2b_inst:
            res = await db.execute(
                select(LaundryUser).where(
                    LaundryUser.user_name == inst_data["user_name"],
                    LaundryUser.tenant_id == TENANT_ID
                )
            )
            if not res.scalars().first():
                db.add(LaundryUser(tenant_id=TENANT_ID, **inst_data))
        
        await db.commit()
        print("✅ Instituciones B2B procesadas.")

        # --- PART C: B2B Services ---
        b2b_services = [
            {"service_name": "Lavado Industrial Hotel", "service_value": 18000, 
             "spent_per_service": 4500, "user_institute": "instituto", 
             "nombre_instituto": "Hotel Dann Carlton"},
            {"service_name": "Servicio Express Hotel", "service_value": 35000,
             "spent_per_service": 9000, "user_institute": "instituto",
             "nombre_instituto": "Hotel Dann Carlton"},
            {"service_name": "Lavado Clínica", "service_value": 22000,
             "spent_per_service": 5500, "user_institute": "instituto",
             "nombre_instituto": "Clínica San Rafael"},
            {"service_name": "Lavado Manteles", "service_value": 15000,
             "spent_per_service": 3800, "user_institute": "instituto",
             "nombre_instituto": "Restaurante La Fondue"},
        ]

        for s_data in b2b_services:
            res = await db.execute(
                select(Service).where(
                    Service.service_name == s_data["service_name"],
                    Service.tenant_id == TENANT_ID
                )
            )
            if not res.scalars().first():
                db.add(Service(tenant_id=TENANT_ID, **s_data))
        
        await db.commit()
        print("✅ Servicios B2B procesados.")

        # --- PART D: 9 Orders for Luisa Gómez ---
        res_luisa = await db.execute(
            select(LaundryUser).where(
                LaundryUser.user_name == "Luisa Gómez",
                LaundryUser.tenant_id == TENANT_ID
            )
        )
        luisa = res_luisa.scalars().first()
        if luisa:
            # Contar órdenes actuales
            res_count = await db.execute(
                select(func.count(OrderHeader.id)).where(OrderHeader.user_id == luisa.user_id)
            )
            current_orders = res_count.scalar() or 0
            
            orders_to_add = 9 - current_orders
            if orders_to_add > 0:
                print(f"⏳ Insertando {orders_to_add} órdenes para Luisa Gómez...")
                for i in range(orders_to_add):
                    # Esparcir por los últimos 3 meses
                    days_ago = (i + 1) * 10
                    # Usar datetime naive como el default del modelo (utcnow)
                    order_date = datetime.utcnow() - timedelta(days=days_ago)
                    
                    order = OrderHeader(
                        tenant_id=TENANT_ID,
                        user_id=luisa.user_id,
                        user_name=luisa.user_name,
                        date=order_date,
                        order_status="Entregada",
                        is_paid=True,
                        subtotal=25000.0,
                        discount=0.0,
                        total_amount=25000.0,
                        balance_due=0.0,
                        net_income_value=25000.0,
                        is_institute=False
                    )
                    db.add(order)
                    try:
                        await db.flush() # Obtener ID
                    except Exception as e:
                        print(f"❌ Error insertando orden {i}: {e}")
                        raise

                    # Añadir detalle ficticio
                    detail = OrderDetail(
                        tenant_id=TENANT_ID,
                        order_id=order.id,
                        user_id=luisa.user_id,
                        user_name=luisa.user_name,
                        service_name="Lavado General",
                        quantity=1.0,
                        unit_price=25000.0,
                        total_item_price=25000.0,
                        spent_per_order=0.0
                    )
                    db.add(detail)
                
                await db.commit()
                print("✅ Órdenes de Luisa procesadas.")
            else:
                print("ℹ️ Luisa ya tiene 9 o más órdenes.")

    print("\n✅ Seed completo: 5 clientes B2C, 3 instituciones B2B, \n   servicios B2B por institución, 9 órdenes de Luisa para trigger fidelidad")

if __name__ == "__main__":
    asyncio.run(seed())
