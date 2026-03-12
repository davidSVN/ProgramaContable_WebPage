import random
import asyncio
from datetime import datetime, timedelta
from sqlalchemy import select

import sys
import os

# Añadir el directorio raíz al path para importar app
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(ROOT_DIR)

from app.database import AsyncSessionLocal
from app.models import OrderHeader, LaundryUser

# Configuración
TENANT_ID = 1
NUM_ORDERS = 50
B2B_COUNT = 15
B2C_COUNT = 35

STATUS_WEIGHTS = {
    'Recibida': 5,
    'En proceso': 30,
    'Lista para entregar': 10,
    'Entregada': 45,
    'Cancelada': 10
}

B2C_NAMES = ["María Torres", "Carlos Pérez", "Luisa Gómez", "Andrés Martínez", "Elena Rodríguez", "Jorge Castro", "Patricia Ruiz", "Fernando Lopez", "Diana Salazar", "Gabriel Mendez", "Sonia Prada", "Ricardo Duarte", "Monica Silva", "Javier Ortiz", "Beatriz Vega"]
B2B_NAMES = ["Hotel Dann Carlton", "Clínica San Rafael", "Colegio Los Andes", "Restaurante El Cielo", "Gimnasio Bodytech"]

ITEMS_POOL = ["Camisas", "Pantalones", "Sábanas", "Cobijas", "Toallas", "Trajes", "Vestidos", "Chaquetas"]

def get_random_date(days_back=180):
    return datetime.utcnow() - timedelta(days=random.randint(0, days_back), hours=random.randint(0, 23))

def generate_items_description():
    count = random.randint(1, 4)
    items = random.sample(ITEMS_POOL, count)
    parts = [f"{random.randint(1, 5)} {item}" for item in items]
    return ", ".join(parts)

async def seed_orders():
    print("Iniciando seed de órdenes...")
    async with AsyncSessionLocal() as db:
        # Generar pool de estados ponderados
        statuses_weighted = []
        for status, weight in STATUS_WEIGHTS.items():
            statuses_weighted.extend([status] * weight)
        
        for i in range(1, NUM_ORDERS + 1):
            is_institute = i <= B2B_COUNT
            
            # Tiempos: Si es reciente (< 14 días), forzar En proceso o Recibida
            date = get_random_date()
            if (datetime.utcnow() - date).days < 14:
                status = random.choice(['Recibida', 'En proceso'])
            else:
                status = random.choice(statuses_weighted)
            
            # Totales
            if is_institute:
                subtotal = float(random.randint(80000, 500000))
                user_name = random.choice(B2B_NAMES)
                user_id = B2B_NAMES.index(user_name) + 1
                consolidated_invoice_id = random.randint(1, 10)
            else:
                subtotal = float(random.randint(20000, 150000))
                user_name = random.choice(B2C_NAMES)
                user_id = B2C_NAMES.index(user_name) + 1
                consolidated_invoice_id = None
            
            # Descuento
            discount = 0.0
            if random.random() < 0.2: # 20% tienen descuento
                discount = float(random.randint(5000, 20000))
            
            total_amount = subtotal - discount
            spent_per_order = total_amount * random.uniform(0.2, 0.4)
            net_income_value = total_amount - spent_per_order
            
            # Pago Logic
            if status == 'Cancelada':
                is_paid = False
                balance_due = 0.0
            else:
                # Random pago state
                p_state = random.random()
                if p_state < 0.7:  # 70% pagada
                    is_paid = True
                    balance_due = 0.0
                elif p_state < 0.9: # 20% debe
                    is_paid = False
                    balance_due = total_amount
                else: # 10% abono parcial
                    is_paid = False
                    balance_due = total_amount * random.uniform(0.1, 0.6)

            new_order = OrderHeader(
                tenant_id=TENANT_ID,
                date=date,
                order_status=status,
                is_paid=is_paid,
                subtotal=subtotal,
                discount=discount,
                total_amount=total_amount,
                balance_due=balance_due,
                net_income_value=net_income_value,
                items_description=generate_items_description(),
                spent_per_order=spent_per_order,
                is_institute=is_institute,
                consolidated_invoice_id=consolidated_invoice_id,
                user_id=user_id,
                user_name=user_name
            )
            
            db.add(new_order)
            if i % 10 == 0:
                print(f"Insertando orden {i}/{NUM_ORDERS}...")

        try:
            await db.commit()
            print(f"✅ {NUM_ORDERS} órdenes insertadas en tenant_id={TENANT_ID}")
        except Exception as e:
            await db.rollback()
            print(f"❌ Error al insertar órdenes: {e}")

if __name__ == "__main__":
    asyncio.run(seed_orders())
