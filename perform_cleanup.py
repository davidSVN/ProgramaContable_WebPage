
import asyncio
from sqlalchemy import delete
from app.database import AsyncSessionLocal
from app.models import (
    Tenant, AppUser, EmployeeJoinRequest, Service, LaundryUser, Provider,
    OrderHeader, OrderDetail, OrderPayment, ConsolidatedInvoice,
    AbonoInstitucional, SpentBusiness, ProductFromProvider,
    BusinessReportData, AppSettings, PaymentTransaction
)

KEEP_TENANTS = [1, 5]

async def perform_cleanup():
    async with AsyncSessionLocal() as db:
        print("--- INICIANDO LIMPIEZA DE BASE DE DATOS ---")
        
        try:
            # 1. Dependientes de Órdenes y Facturas
            await db.execute(delete(OrderDetail).where(OrderDetail.tenant_id.notin_(KEEP_TENANTS)))
            await db.execute(delete(OrderPayment).where(OrderPayment.tenant_id.notin_(KEEP_TENANTS)))
            await db.execute(delete(OrderHeader).where(OrderHeader.tenant_id.notin_(KEEP_TENANTS)))
            await db.execute(delete(ConsolidatedInvoice).where(ConsolidatedInvoice.tenant_id.notin_(KEEP_TENANTS)))
            
            # 2. Clientes y Abonos
            await db.execute(delete(AbonoInstitucional).where(AbonoInstitucional.tenant_id.notin_(KEEP_TENANTS)))
            await db.execute(delete(LaundryUser).where(LaundryUser.tenant_id.notin_(KEEP_TENANTS)))
            
            # 3. Proveedores y Productos
            await db.execute(delete(ProductFromProvider).where(ProductFromProvider.tenant_id.notin_(KEEP_TENANTS)))
            await db.execute(delete(Provider).where(Provider.tenant_id.notin_(KEEP_TENANTS)))
            
            # 4. Servicios y Otros
            await db.execute(delete(Service).where(Service.tenant_id.notin_(KEEP_TENANTS)))
            await db.execute(delete(SpentBusiness).where(SpentBusiness.tenant_id.notin_(KEEP_TENANTS)))
            await db.execute(delete(BusinessReportData).where(BusinessReportData.tenant_id.notin_(KEEP_TENANTS)))
            await db.execute(delete(AppSettings).where(AppSettings.tenant_id.notin_(KEEP_TENANTS)))
            await db.execute(delete(PaymentTransaction).where(PaymentTransaction.tenant_id.notin_(KEEP_TENANTS)))
            
            # 5. Solicitudes de Unión (borrar todas las de tenants eliminados)
            await db.execute(delete(EmployeeJoinRequest).where(EmployeeJoinRequest.tenant_id.notin_(KEEP_TENANTS)))
            
            # 6. Usuarios App (Keep superadmin OR (tenant in 1,5))
            # Delete those who are NOT superadmin AND (tenant is not 1 or 5)
            await db.execute(delete(AppUser).where(
                (AppUser.role != "superadmin") & 
                ((AppUser.tenant_id.notin_(KEEP_TENANTS)) | (AppUser.tenant_id.is_(None)))
            ))
            
            # 7. Tenants (except 1 and 5)
            await db.execute(delete(Tenant).where(Tenant.id.notin_(KEEP_TENANTS)))

            await db.commit()
            print("✅ LIMPIEZA COMPLETADA CON ÉXITO")
            
        except Exception as e:
            await db.rollback()
            print(f"❌ ERROR DURANTE LA LIMPIEZA: {str(e)}")

if __name__ == "__main__":
    asyncio.run(perform_cleanup())
