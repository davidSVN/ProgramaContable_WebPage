from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Float, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from app.database import Base


class Tenant(Base):
    __tablename__ = "tenants"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(100), nullable=False, unique=True)
    ciudad = Column(String(100), nullable=True)
    plan = Column(String(50), default="none", nullable=False)  # "none" | "basic" | "premium"
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    max_usuarios = Column(Integer, default=5, nullable=False)

    plan_expires_at = Column(DateTime, nullable=True)
    last_payment_reference = Column(String(100), nullable=True)

    # Cobro recurrente / tokenización
    wompi_payment_source_id = Column(Integer, nullable=True)
    card_last_four = Column(String(4), nullable=True)
    card_brand = Column(String(20), nullable=True)
    auto_renew = Column(Boolean, default=True, nullable=False)
    renewal_failed_at = Column(DateTime, nullable=True)
    grace_period_ends_at = Column(DateTime, nullable=True)

    # Relación
    usuarios = relationship("AppUser", back_populates="tenant", lazy="selectin")


class AppUser(Base):
    __tablename__ = "app_users"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=True)  # null para superadmin y pending
    email = Column(String(150), unique=True, nullable=False, index=True)
    username = Column(String(100), nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False)  # "superadmin" | "admin" | "empleado" | "pending"
    cedula = Column(String(20), nullable=True)
    last_login = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relación
    tenant = relationship("Tenant", back_populates="usuarios")
    join_requests = relationship("EmployeeJoinRequest", back_populates="user")


class EmployeeJoinRequest(Base):
    __tablename__ = "employee_join_requests"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("app_users.id"), nullable=False)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)
    status = Column(String(20), default="pending", nullable=False)  # "pending" | "approved" | "rejected"
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("AppUser", back_populates="join_requests")
    tenant = relationship("Tenant")


class Service(Base):
    __tablename__ = "services"
    service_id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    service_name = Column(String(100), nullable=False)
    service_value = Column(Float, nullable=False)
    description = Column(Text)
    spent_per_service = Column(Float, default=0.0)
    user_institute = Column(String(100), default="Usuario")
    nombre_instituto = Column(String(100), default="usuario")
    tenant = relationship("Tenant")
    
    __table_args__ = (UniqueConstraint("service_name", "tenant_id", "user_institute", "nombre_instituto"),)


class LaundryUser(Base):
    __tablename__ = "laundry_users"
    user_id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    user_name = Column(String(100), nullable=False)
    user_contact = Column(String(50), nullable=False)  # Mantenemos como teléfono/contacto principal
    email = Column(String(150), nullable=True)
    nit = Column(String(50), nullable=True)  # Para instituciones B2B
    user_address = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    state = Column(Boolean, default=True, nullable=False)
    loyalty_level = Column(String(50))
    user_institute = Column(String(100), default="Usuario")
    user_type = Column(String(20), default="B2C")  # "B2C" | "B2B"
    payment_condition = Column(String(50), default="Contado")  # "Contado" | "Al crédito"
    saldo_a_favor = Column(Float, default=0.0, nullable=False)
    notas = Column(Text, nullable=True)
    tenant = relationship("Tenant")
    orders = relationship("OrderHeader", back_populates="buyer")
    abonos = relationship("AbonoInstitucional", back_populates="user", cascade="all, delete-orphan")
    
    __table_args__ = (
        UniqueConstraint("user_name", "tenant_id"),
        UniqueConstraint("user_contact", "tenant_id"),
    )


class Provider(Base):
    __tablename__ = "provider"
    prov_id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    prov_name = Column(String(100), nullable=False)
    prov_contact = Column(String(50), nullable=False)
    prov_address = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    state = Column(Boolean, default=True, nullable=False)
    loyalty_level = Column(String(50))
    tenant = relationship("Tenant")
    products = relationship("ProductFromProvider", back_populates="provider")
    
    __table_args__ = (UniqueConstraint("prov_name", "tenant_id"),)


class OrderHeader(Base):
    __tablename__ = "orders"
    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    order_number = Column(Integer, nullable=True)
    date = Column(DateTime, default=datetime.utcnow, nullable=False)
    order_status = Column(String(50), default="Pendiente", nullable=False)
    is_paid = Column(Boolean, default=False, nullable=False)
    subtotal = Column(Float, nullable=False, default=0.0)
    discount = Column(Float, nullable=False, default=0.0)
    total_amount = Column(Float, nullable=False, default=0.0)
    balance_due = Column(Float, nullable=False, default=0.0)
    net_income_value = Column(Float, nullable=False, default=0.0)
    items_description = Column(Text, nullable=True)
    spent_per_order = Column(Float, default=0.0)
    agency_cost = Column(Float, default=0.0)
    is_institute = Column(Boolean, default=False, nullable=False)
    consolidated_invoice_id = Column(Integer, ForeignKey("consolidated_invoices.id"), nullable=True)
    user_id = Column(Integer, ForeignKey("laundry_users.user_id"), nullable=False)
    user_name = Column(String(150))

    # Tracking de entrega
    delivered_at = Column(DateTime, nullable=True)
    delivered_by = Column(String(100), nullable=True)
    received_by_name = Column(String(100), nullable=True)
    received_by_cedula = Column(String(20), nullable=True)
    invoice_delivered = Column(Boolean, nullable=True)
    delivery_signature = Column(Text, nullable=True)
    tenant = relationship("Tenant")
    buyer = relationship("LaundryUser", back_populates="orders")
    details = relationship("OrderDetail", back_populates="order", cascade="all, delete-orphan")
    payments = relationship("OrderPayment", back_populates="order", cascade="all, delete-orphan", foreign_keys="[OrderPayment.order_id]")
    consolidated_invoice = relationship("ConsolidatedInvoice", back_populates="orders")


class OrderDetail(Base):
    __tablename__ = "order_details"
    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False, index=True)
    order_number = Column(Integer, nullable=True)  # tenant-scoped sequential number
    user_id = Column(Integer, ForeignKey("laundry_users.user_id"))
    user_name = Column(String(150))
    service_name = Column(String(100), nullable=False)
    quantity = Column(Float, nullable=False, default=1.0)
    unit_price = Column(Float, nullable=False)
    total_item_price = Column(Float, nullable=False)
    is_agency = Column(Boolean, default=False, nullable=False)
    agency_done_date = Column(DateTime, nullable=True)
    spent_per_order = Column(Float, default=0.0)
    description = Column(Text, nullable=True)
    tenant = relationship("Tenant")
    order = relationship("OrderHeader", back_populates="details")


class OrderPayment(Base):
    __tablename__ = "order_payments"
    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=True, index=True)
    order_number = Column(Integer, nullable=True)  # tenant-scoped sequential number
    consolidated_invoice_id = Column(Integer, ForeignKey("consolidated_invoices.id"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("laundry_users.user_id"))
    user_name = Column(String(150))
    payment_method = Column(String(50), nullable=False)
    amount = Column(Float, nullable=False)
    tenant = relationship("Tenant")
    order = relationship("OrderHeader", back_populates="payments", foreign_keys=[order_id])
    consolidated_invoice = relationship("ConsolidatedInvoice", back_populates="payments", foreign_keys=[consolidated_invoice_id])


class ConsolidatedInvoice(Base):
    __tablename__ = "consolidated_invoices"
    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("laundry_users.user_id"), nullable=False, index=True)
    total_amount = Column(Float, nullable=False, default=0.0)
    is_paid = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    notes = Column(Text, nullable=True)
    tenant = relationship("Tenant")
    user = relationship("LaundryUser")
    orders = relationship("OrderHeader", back_populates="consolidated_invoice")
    payments = relationship("OrderPayment", back_populates="consolidated_invoice")


class AbonoInstitucional(Base):
    __tablename__ = "abonos_institucionales"
    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("laundry_users.user_id"), nullable=False, index=True)
    amount = Column(Float, nullable=False)
    payment_method = Column(String(50), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    notes = Column(Text, nullable=True)
    tenant = relationship("Tenant")
    user = relationship("LaundryUser", back_populates="abonos")


class SpentBusiness(Base):
    __tablename__ = "spents_business"
    spent_id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    spent_date = Column(DateTime, default=datetime.utcnow, nullable=False)
    spent_general_name = Column(String(100))
    spent_category = Column(String(50))
    description = Column(Text)
    spent_payment_method = Column(String(50), nullable=False)
    spent_value = Column(Float, nullable=False)
    tenant = relationship("Tenant")


class ProductFromProvider(Base):
    __tablename__ = "products_from_providers"
    product_id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    product_name = Column(String(100), nullable=False)
    prov_id = Column(Integer, ForeignKey("provider.prov_id"), nullable=False)
    value = Column(Float, nullable=False)
    tenant = relationship("Tenant")
    provider = relationship("Provider", back_populates="products")


class BusinessReportData(Base):
    __tablename__ = "business_report_data"
    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    fecha = Column(DateTime, default=datetime.utcnow, index=True)
    ingreso_egreso = Column(String(50), nullable=False)
    nombre_ingreso_egreso = Column(String(255), nullable=False)
    estado_orden = Column(String(50), nullable=False)
    estado_pago = Column(String(50), nullable=False)
    metodo_pago = Column(String(50), nullable=False)
    servicio_mayor_90_dias = Column(Boolean, nullable=False)
    numero_usuarios = Column(Float, nullable=False)
    numero_ordenes = Column(Float, nullable=False)
    valor = Column(Float, nullable=False)
    restante = Column(Float, nullable=False)
    abono = Column(Float, nullable=False)
    total_descuentos = Column(Float, nullable=False)
    tenant = relationship("Tenant")


class AppSettings(Base):
    __tablename__ = "app_settings"
    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    key = Column(String(100), nullable=False)
    value = Column(Text, nullable=False)
    tenant = relationship("Tenant")

    __table_args__ = (UniqueConstraint("key", "tenant_id"),)


class PaymentTransaction(Base):
    """Registra cada intento de pago vía Wompi."""
    __tablename__ = "payment_transactions"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)

    # Referencia única que enviamos a Wompi (formato: WF-{tenant_id}-{timestamp})
    reference = Column(String(100), unique=True, nullable=False, index=True)

    # ID de transacción que devuelve Wompi
    wompi_transaction_id = Column(String(100), nullable=True, unique=True, index=True)

    # Plan y período que se está comprando
    plan = Column(String(50), nullable=False)              # "basic" | "premium"
    billing_period = Column(String(20), nullable=False)    # "monthly" | "yearly" | "trial"

    # Monto en centavos (como lo maneja Wompi)
    amount_in_cents = Column(Integer, nullable=False)
    currency = Column(String(10), default="COP", nullable=False)

    # Estado del pago
    status = Column(String(30), default="PENDING", nullable=False)

    # Método de pago usado (CARD, NEQUI, PSE, BANCOLOMBIA_QR, etc.)
    payment_method = Column(String(50), nullable=True)

    # Fechas
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Fecha de expiración del plan
    plan_expires_at = Column(DateTime, nullable=True)

    # Relación
    tenant = relationship("Tenant")
