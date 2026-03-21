
import asyncio
from sqlalchemy import select, func, delete
from app.database import AsyncSessionLocal
from app.models import (
    Tenant, AppUser, EmployeeJoinRequest, Service, LaundryUser, Provider,
    OrderHeader, OrderDetail, OrderPayment, ConsolidatedInvoice,
    AbonoInstitucional, SpentBusiness, ProductFromProvider,
    BusinessReportData, AppSettings, PaymentTransaction
)

KEEP_TENANTS = [1, 5]

async def check_cleanup():
    async with AsyncSessionLocal() as db:
        print("--- RECUENTO DE DATOS A ELIMINAR ---")
        
        tables = [
            ("Detalles de Órdenes", OrderDetail),
            ("Pagos de Órdenes", OrderPayment),
            ("Órdenes", OrderHeader),
            ("Facturas Consolidadas", ConsolidatedInvoice),
            ("Abonos Institucionales", AbonoInstitucional),
            ("Usuarios de Lavandería", LaundryUser),
            ("Productos de Proveedores", ProductFromProvider),
            ("Proveedores", Provider),
            ("Servicios", Service),
            ("Gastos de Negocio", SpentBusiness),
            ("Reportes de Negocio", BusinessReportData),
            ("Configuraciones App", AppSettings),
            ("Transacciones de Pago", PaymentTransaction),
            ("Solicitudes de Unión", EmployeeJoinRequest),
        ]

        for name, model in tables:
            stmt = select(func.count()).select_from(model).where(model.tenant_id.notin_(KEEP_TENANTS))
            res = await db.execute(stmt)
            count = res.scalar()
            print(f"{name}: {count} filas se eliminarán")

        # Usuarios (Keep superadmin or tenant in 1,5)
        stmt = select(func.count()).select_from(AppUser).where(
            (AppUser.role != "superadmin") & 
            ((AppUser.tenant_id.notin_(KEEP_TENANTS)) | (AppUser.tenant_id.is_(None)))
        )
        res = await db.execute(stmt)
        u_count = res.scalar()
        print(f"Usuarios App (no superadmin/1/5): {u_count} se eliminarán")

        # Tenants
        stmt = select(func.count()).select_from(Tenant).where(Tenant.id.notin_(KEEP_TENANTS))
        res = await db.execute(stmt)
        t_count = res.scalar()
        print(f"Tenants (distintos a 1 y 5): {t_count} se eliminarán")

if __name__ == "__main__":
    asyncio.run(check_cleanup())
