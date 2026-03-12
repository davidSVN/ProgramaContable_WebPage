
import asyncio
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from app.database import AsyncSessionLocal
from app.models import LaundryUser

FAKE_USERS = [
    {"nombre": "María García López", "email": "maria.garcia@gmail.com", "contacto": "310-452-7891", "direccion": "Calle 72 #15-30, Bogotá", "nivelFidelidad": "3", "estado": "Activo", "user_type": "B2C", "payment_condition": "Contado"},
    {"nombre": "Carlos Rodríguez Pérez", "email": "c.rodriguez@hotmail.com", "contacto": "315-678-9012", "direccion": "Av. El Dorado #68-50, Bogotá", "nivelFidelidad": "2", "estado": "Activo", "user_type": "B2C", "payment_condition": "Contado"},
    {"nombre": "Ana Martínez Silva", "email": "ana.martinez@gmail.com", "contacto": "312-234-5678", "direccion": "Carrera 13 #85-42, Bogotá", "nivelFidelidad": "1", "estado": "Activo", "user_type": "B2C", "payment_condition": "Contado"},
    {"nombre": "Luis Hernández Torres", "email": "luis.h@yahoo.com", "contacto": "318-901-2345", "direccion": "Calle 100 #19-20, Bogotá", "nivelFidelidad": "3", "estado": "Activo", "user_type": "B2C", "payment_condition": "Contado"},
    {"nombre": "Sofía Ramírez Gómez", "email": "sofia.ramirez@gmail.com", "contacto": "320-345-6789", "direccion": "Transv. 94 #52-45, Bogotá", "nivelFidelidad": "2", "estado": "Activo", "user_type": "B2C", "payment_condition": "Contado"},
    {"nombre": "Andrés López Vargas", "email": "andres.lopez@outlook.com", "contacto": "322-456-7890", "direccion": "Calle 26 #31-30, Bogotá", "nivelFidelidad": "1", "estado": "Inactivo", "user_type": "B2C", "payment_condition": "Contado"},
    {"nombre": "Valentina Castro Mora", "email": "vale.castro@gmail.com", "contacto": "314-567-8901", "direccion": "Carrera 7 #123-45, Bogotá", "nivelFidelidad": "2", "estado": "Activo", "user_type": "B2C", "payment_condition": "Contado"},
    {"nombre": "Felipe Jiménez Cruz", "email": "felipe.j@gmail.com", "contacto": "317-678-9012", "direccion": "Av. Boyacá #80-20, Bogotá", "nivelFidelidad": "1", "estado": "Activo", "user_type": "B2C", "payment_condition": "Contado"},
    {"nombre": "Camila Sánchez Ruiz", "email": "camila.sanchez@hotmail.com", "contacto": "300-789-0123", "direccion": "Calle 53 #45-60, Bogotá", "nivelFidelidad": "3", "estado": "Activo", "user_type": "B2C", "payment_condition": "Contado"},
    {"nombre": "Daniel Morales Díaz", "email": "daniel.m@gmail.com", "contacto": "301-890-1234", "direccion": "Carrera 30 #45-30, Bogotá", "nivelFidelidad": "1", "estado": "Inactivo", "user_type": "B2C", "payment_condition": "Contado"},
    {"nombre": "Isabella Vargas Pineda", "email": "isa.vargas@gmail.com", "contacto": "313-901-2345", "direccion": "Calle 116 #48-70, Bogotá", "nivelFidelidad": "2", "estado": "Activo", "user_type": "B2C", "payment_condition": "Contado"},
    {"nombre": "Juan Pablo Reyes Mora", "email": "jp.reyes@gmail.com", "contacto": "316-012-3456", "direccion": "Av. 19 #120-50, Bogotá", "nivelFidelidad": "1", "estado": "Activo", "user_type": "B2C", "payment_condition": "Contado"},
    {"nombre": "Mariana Torres Cárdenas", "email": "mariana.t@outlook.com", "contacto": "304-123-4567", "direccion": "Calle 134 #52-80, Bogotá", "nivelFidelidad": "3", "estado": "Activo", "user_type": "B2C", "payment_condition": "Contado"},
    {"nombre": "Santiago Medina Osorio", "email": "santi.medina@gmail.com", "contacto": "319-234-5678", "direccion": "Carrera 11 #82-50, Bogotá", "nivelFidelidad": "1", "estado": "Inactivo", "user_type": "B2C", "payment_condition": "Contado"},
    {"nombre": "Natalia Ospina Betancourt", "email": "natalia.o@gmail.com", "contacto": "311-345-6789", "direccion": "Calle 85 #23-30, Bogotá", "nivelFidelidad": "2", "estado": "Activo", "user_type": "B2C", "payment_condition": "Contado"},
]

FAKE_INSTITUTIONS = [
    {"nombre": "Hotel Dann Carlton", "nit": "860.007.777-5", "contacto": "3101112233", "email": "contacto@danncarlton.com", "direccion": "Calle 19 #5-72, Bogotá", "estado": "Activo", "user_type": "B2B", "payment_condition": "Al crédito"},
    {"nombre": "Clínica San Rafael", "nit": "899.999.061-1", "contacto": "3202223344", "email": "info@sanrafael.com", "direccion": "Av. Ciudad de Cali #9-70, Bogotá", "estado": "Activo", "user_type": "B2B", "payment_condition": "Al crédito"},
    {"nombre": "Restaurante La Fondue", "nit": "900.123.456-8", "contacto": "3003334455", "email": "admin@lafondue.com", "direccion": "Calle 82 #11-40, Bogotá", "estado": "Activo", "user_type": "B2B", "payment_condition": "Contado"},
    {"nombre": "Constructora Ospina S.A.", "nit": "860.000.987-3", "contacto": "3154445566", "email": "compras@ospina.com", "direccion": "Carrera 7 #32-05, Bogotá", "estado": "Activo", "user_type": "B2B", "payment_condition": "Contado"},
    {"nombre": "Colegio Los Andes", "nit": "890.801.719-2", "contacto": "3125556677", "email": "rectoria@losandes.edu.co", "direccion": "Calle 127 #19-10, Bogotá", "estado": "Activo", "user_type": "B2B", "payment_condition": "Al crédito"},
    {"nombre": "Hospital Santa Clara", "nit": "899.999.021-4", "contacto": "3186667788", "email": "gerencia@santaclara.gov.co", "direccion": "Carrera 15 #1-59 Sur, Bogotá", "estado": "Activo", "user_type": "B2B", "payment_condition": "Al crédito"},
    {"nombre": "Limpieza Total S.A.S.", "nit": "900.456.789-1", "contacto": "3227778899", "email": "ventas@limpiezatotal.com", "direccion": "Av. Boyacá #63-02, Bogotá", "estado": "Inactivo", "user_type": "B2B", "payment_condition": "Contado"},
    {"nombre": "Hotel Bogotá Plaza", "nit": "860.009.762-7", "contacto": "3178889900", "email": "gerencia@bogotaplaza.com", "direccion": "Carrera 29 #101-10, Bogotá", "estado": "Activo", "user_type": "B2B", "payment_condition": "Al crédito"},
]

async def migrate():
    tenant_id = 1
    async with AsyncSessionLocal() as session:
        # B2C Users
        for u in FAKE_USERS:
            user = LaundryUser(
                tenant_id=tenant_id,
                user_name=u["nombre"],
                user_contact=u["contacto"],
                email=u["email"],
                user_address=u["direccion"],
                state=(u["estado"] == "Activo"),
                loyalty_level=f"Nivel {u['nivelFidelidad']}",
                user_type=u["user_type"],
                payment_condition=u["payment_condition"],
                user_institute="Demo Admin"
            )
            session.add(user)
        
        # B2B Institutions
        for i in FAKE_INSTITUTIONS:
            user = LaundryUser(
                tenant_id=tenant_id,
                user_name=i["nombre"],
                user_contact=i["contacto"],
                email=i["email"],
                nit=i["nit"],
                user_address=i["direccion"],
                state=(i["estado"] == "Activo"),
                user_type=i["user_type"],
                payment_condition=i["payment_condition"],
                user_institute="Demo Admin"
            )
            session.add(user)
            
        try:
            await session.commit()
            print("Migración completada exitosamente.")
        except IntegrityError as e:
            await session.rollback()
            print(f"Error de integridad (posible duplicado): {e}")
        except Exception as e:
            await session.rollback()
            print(f"Error inesperado: {e}")

if __name__ == "__main__":
    asyncio.run(migrate())
