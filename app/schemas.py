from datetime import datetime
from typing import Any, List as _List2, Optional, Dict
from pydantic import BaseModel, EmailStr


# ─── Auth ─────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    role: str
    tenant_id: Optional[int] = None
    username: str
    plan: str = "none"


class UserMe(BaseModel):
    id: int
    email: str
    username: str
    role: str
    tenant_id: Optional[int] = None
    is_active: bool
    plan: str = "none"

    model_config = {"from_attributes": True}


# ─── Tenant ───────────────────────────────────────────────────────────────────

class TenantCreate(BaseModel):
    nombre: str
    ciudad: Optional[str] = None
    plan: str = "none"
    email_admin: EmailStr
    username_admin: str
    password_admin: str


class TenantResponse(BaseModel):
    id: int
    nombre: str
    ciudad: Optional[str] = None
    plan: str
    is_active: bool
    created_at: datetime
    max_usuarios: int

    model_config = {"from_attributes": True}


class TenantListItem(BaseModel):
    id: int
    nombre: str
    ciudad: Optional[str] = None
    plan: str
    is_active: bool
    created_at: datetime
    total_usuarios: int = 0

    model_config = {"from_attributes": True}


# ─── SuperAdmin Dashboard ────────────────────────────────────────────────────

class DashboardStats(BaseModel):
    total_tenants: int
    tenants_activos: int
    tenants_inactivos: int
    total_usuarios: int
    tenants_por_plan: Dict[str, int]


# ─── Gastos ───────────────────────────────────────────────────────────────────

class GastoCreate(BaseModel):
    spent_category: Optional[str] = None
    spent_payment_method: str
    spent_value: float
    spent_general_name: Optional[str] = None
    description: Optional[str] = None
    spent_date: Optional[datetime] = None


class GastoUpdate(BaseModel):
    spent_category: Optional[str] = None
    spent_payment_method: Optional[str] = None
    spent_value: Optional[float] = None
    spent_general_name: Optional[str] = None
    description: Optional[str] = None
    spent_date: Optional[datetime] = None


class GastoResponse(BaseModel):
    spent_id: int
    tenant_id: Optional[int] = None
    spent_category: Optional[str] = None
    spent_payment_method: str
    spent_value: float
    spent_general_name: Optional[str] = None
    description: Optional[str] = None
    spent_date: datetime

    model_config = {"from_attributes": True}


class AgencyServiceDetailResponse(BaseModel):
    id: int
    order_id: int
    order_number: Optional[int] = None
    date: datetime
    customer_name: str
    service_name: str
    quantity: float
    unit_price: float
    total_item_price: float
    agency_cost: float
    description: Optional[str] = None

    model_config = {"from_attributes": True}


class GastoCountResponse(BaseModel):
    total: int


class GastoStatsResponse(BaseModel):
    total_gastos: float           # sum of all spent_value for tenant
    total_manual: float           # sum where spent_category != 'Agencia'
    total_agencia: float          # sum where spent_category = 'Agencia'
    gasto_mes_actual: float       # sum of current month
    por_categoria: dict           # {"Nómina": 500000, "Arriendo": 800000, ...}
    count_total: int
    count_manual: int
    count_agencia: int


# ─── Proveedores ──────────────────────────────────────────────────────────────

class ProveedorCreate(BaseModel):
    nombre: str
    telefono: Optional[str] = None
    email: Optional[str] = None
    direccion: Optional[str] = None
    activo: bool = True
    loyalty_level: Optional[str] = None

class ProveedorUpdate(BaseModel):
    nombre: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    direccion: Optional[str] = None
    activo: Optional[bool] = None
    loyalty_level: Optional[str] = None

class ProveedorResponse(BaseModel):
    prov_id: int
    prov_name: str
    prov_contact: str
    prov_address: Optional[str] = None
    state: bool
    loyalty_level: Optional[str] = None

    model_config = {"from_attributes": True}


# ─── Servicios de Lavandería ──────────────────────────────────────────────────

from pydantic import Field

class ServicioCreate(BaseModel):
    service_name: str
    service_value: float = Field(gt=0, description="Precio debe ser mayor a 0")
    description: Optional[str] = None
    spent_per_service: float = 0.0
    user_institute: str = "usuario"  # 'usuario' or 'instituto'
    nombre_instituto: Optional[str] = None

class ServicioUpdate(BaseModel):
    service_name: Optional[str] = None
    service_value: Optional[float] = Field(default=None, gt=0)
    description: Optional[str] = None
    spent_per_service: Optional[float] = None
    user_institute: Optional[str] = None
    nombre_instituto: Optional[str] = None

class LaundryServiceResponse(BaseModel):
    service_id: int
    service_name: str
    service_value: float
    description: Optional[str] = None
    spent_per_service: float
    user_institute: str
    nombre_instituto: Optional[str] = None
    
    model_config = {"from_attributes": True}

class ServicioStatsResponse(BaseModel):
    total_b2c: int
    total_b2b: int
    precio_promedio_b2c: float
    precio_promedio_b2b: float
    servicio_mas_rentable: Optional[str] = None


# ─── Usuarios (Clientes de Lavandería) ────────────────────────────────────────

class UsuarioCreate(BaseModel):
    nombre: str
    email: Optional[str] = None
    contacto: str = Field(min_length=2, max_length=100)
    nit: Optional[str] = None
    direccion: Optional[str] = None
    user_type: str = "B2C"
    payment_condition: str = "Contado"
    activo: bool = True
    loyalty_level: Optional[str] = None
    notas: Optional[str] = None

class UsuarioUpdate(BaseModel):
    nombre: Optional[str] = None
    email: Optional[str] = None
    contacto: Optional[str] = Field(default=None, min_length=2, max_length=100)
    nit: Optional[str] = None
    direccion: Optional[str] = None
    user_type: Optional[str] = None
    payment_condition: Optional[str] = None
    activo: Optional[bool] = None
    loyalty_level: Optional[str] = None
    notas: Optional[str] = None

class UsuarioResponse(BaseModel):
    user_id: int
    user_name: str
    user_contact: str
    email: Optional[str] = None
    nit: Optional[str] = None
    user_address: Optional[str] = None
    state: bool
    loyalty_level: Optional[str] = None
    notas: Optional[str] = None
    user_type: str
    payment_condition: str
    saldo_a_favor: float = 0.0
    
    # Métricas calculadas
    total_orders: int = 0
    total_spent: float = 0.0
    last_visit: Optional[datetime] = None
    pending_invoices: int = 0
    ordenes_mes: int = 0

    model_config = {"from_attributes": True}

class UsuarioCountResponse(BaseModel):
    total: int


# ─── Órdenes B2C ─────────────────────────────────────────────────────────────

from datetime import date as _date
from pydantic import ConfigDict
from typing import List as _List

class ItemOrdenCreate(BaseModel):
    id: Optional[int] = None         # service_id
    name: str
    qty: float = Field(ge=0)
    value: float = Field(gt=0)
    is_agency: bool = False
    description: Optional[str] = None


class AbonoInicial(BaseModel):
    monto: float = Field(gt=0)
    metodo_pago: str                 # "Efectivo" | "Nequi" | "Transferencia"


class DomicilioCreate(BaseModel):
    direccion_recogida: str
    direccion_entrega:  str
    fecha_recogida:     Optional[datetime] = None
    hora_recogida:      Optional[str] = None
    fecha_entrega:      Optional[datetime] = None
    hora_entrega:       Optional[str] = None
    nombre_receptor:    Optional[str] = None
    empleado_id:        Optional[int] = None
    notas:              Optional[str] = None


class DomicilioUpdate(BaseModel):
    direccion_recogida:  Optional[str] = None
    direccion_entrega:   Optional[str] = None
    fecha_recogida:      Optional[datetime] = None
    hora_recogida:       Optional[str] = None
    fecha_entrega:       Optional[datetime] = None
    hora_entrega:        Optional[str] = None
    nombre_receptor:     Optional[str] = None
    empleado_id:         Optional[int] = None
    empleado_nombre:     Optional[str] = None
    estado_domicilio:    Optional[str] = None
    notas:               Optional[str] = None


class DomicilioResponse(BaseModel):
    id:                  int
    order_id:            int
    direccion_recogida:  str
    direccion_entrega:   str
    fecha_recogida:      Optional[datetime] = None
    hora_recogida:       Optional[str] = None
    fecha_entrega:       Optional[datetime] = None
    hora_entrega:        Optional[str] = None
    nombre_receptor:     Optional[str] = None
    empleado_id:         Optional[int] = None
    empleado_nombre:     Optional[str] = None
    estado_domicilio:    str
    notas:               Optional[str] = None
    created_at:          datetime
    model_config = ConfigDict(from_attributes=True)


class OrdenCreate(BaseModel):
    user_id: int
    servicios_data: _List[ItemOrdenCreate]
    items_description: str = ""
    state_payment: str               # "Pagada" | "Debe"
    discount_value: float = 0.0
    pagos: _List[AbonoInicial] = []
    # Si pagos está vacío → orden queda como Debe sin abono.
    # Si state_payment == "Pagada" → se registra el total con el método
    # del primer elemento de pagos o "Efectivo" si pagos está vacío.
    state_state: str = "En progreso"
    is_domicilio: bool = False
    domicilio: Optional[DomicilioCreate] = None


class ActualizarEstadoRequest(BaseModel):
    estado: str
    estado_pago: str
    metodo_pago: Optional[str] = None
    monto_pago: float = 0.0


class RegistrarPagoRequest(BaseModel):
    monto: float = Field(gt=0)
    metodo_pago: str


class OrdenResponse(BaseModel):
    order_id: int
    order_number: Optional[int] = None
    user_id: int
    user_name: str
    user_contact: str
    state_payment: str
    state_state: str
    order_value: float
    payment_method: Optional[str] = None
    restante: float
    abono: float
    created_at: datetime
    days_open: int
    agency: Optional[str] = None
    agency_done_date: Optional[_date] = None
    spent_per_order: float
    net_income_value: float
    discount_value: float
    items_description: Optional[str] = None
    is_institute: bool
    consolidated_invoice_id: Optional[int] = None
    servicios_data: Optional[_List2[Any]] = None

    model_config = ConfigDict(from_attributes=True)


class DetalleOrdenResponse(BaseModel):
    name: str
    qty: float
    value: float
    is_agency: bool
    description: Optional[str] = None
    spent_per_service: Optional[float] = 0.0


class OrderDetailFlatResponse(BaseModel):
    id: int
    order_id: int
    order_number: Optional[int] = None
    user_name: Optional[str] = None
    service_name: str
    quantity: float
    unit_price: float
    total_item_price: float
    is_agency: bool
    agency_done_date: Optional[datetime] = None
    spent_per_order: float = 0.0
    date: datetime
    order_status: str
    description: Optional[str] = None

class OrderDetailsStatsResponse(BaseModel):
    total_count: int
    total_value: float = 0.0
    total_cost: float = 0.0
    total_orders_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class AgencySummaryRow(BaseModel):
    periodo: str
    count: int
    facturado: float
    costo: float
    sort_date: datetime


class ClienteSearchResponse(BaseModel):
    id: int
    nombre: str


# ─── Facturación B2B ──────────────────────────────────────────────────────────

class OrdenB2BCreate(BaseModel):
    """Igual que OrdenCreate pero sin is_institute (se fuerza True internamente)."""
    user_id: int
    servicios_data: _List[ItemOrdenCreate]
    items_description: str = ""
    state_payment: str               # "Pagada" | "Debe"
    payment_method: str              # "Efectivo" | "Nequi" | "Transferencia"
    discount_value: float = 0.0
    abono: float = 0.0
    state_state: str = "En progreso"


class GenerarFacturaRequest(BaseModel):
    user_id: int
    order_ids: _List[int]
    notes: Optional[str] = None


class PagoInstitucionalRequest(BaseModel):
    monto: float = Field(gt=0)
    metodo_pago: str


class AbonoRequest(BaseModel):
    user_id: int
    amount: float = Field(gt=0)
    payment_method: str
    notes: Optional[str] = None


class FacturaConsolidadaResponse(BaseModel):
    invoice_id: int
    user_id: int
    user_name: str
    total_amount: float
    pagado: float
    balance_due: float
    is_paid: bool
    notes: Optional[str] = None
    created_at: datetime
    ordenes_ids: _List[int]

    model_config = ConfigDict(from_attributes=True)


class AbonoResponse(BaseModel):
    abono_id: int
    user_id: int
    amount: float
    payment_method: str
    notes: Optional[str] = None
    created_at: datetime
    saldo_a_favor_resultante: float

    model_config = ConfigDict(from_attributes=True)


# ─── Historial de Órdenes ──────────────────────────────────────────────────

class OrderHistorialItem(BaseModel):
    id: int
    order_number: Optional[int] = None
    date: datetime
    order_status: str
    estado_pago: str  # Campo derivado
    is_paid: bool
    subtotal: float
    discount: float
    total_amount: float
    balance_due: float
    items_description: Optional[str] = None
    is_institute: bool
    consolidated_invoice_id: Optional[int] = None
    user_id: int
    user_name: str
    user_contact: Optional[str] = None
    days_passed: int = 0
    agency_cost: float = 0.0
    spent_per_order: float = 0.0
    total_paid: float = 0.0
    net_income_value: float = 0.0
    
    # Delivery info
    delivered_at: Optional[datetime] = None
    delivered_by: Optional[str] = None
    received_by_name: Optional[str] = None
    invoice_delivered: Optional[bool] = None
    has_signature: bool = False

    # Domicilio info
    is_domicilio: bool = False
    domicilio: Optional[DomicilioResponse] = None

    model_config = ConfigDict(from_attributes=True)


class DomicilioStatsResponse(BaseModel):
    total: int
    pendientes: int
    en_camino: int
    entregados: int
    sin_asignar: int


class OrderHistorialResponse(BaseModel):
    data: _List[OrderHistorialItem]
    total: int
    page: int
    limit: int
    total_pages: int


class OrderStatsResponse(BaseModel):
    total_ordenes: int
    total_recaudado: float
    ordenes_debe: int
    monto_por_cobrar: float
    total_gastos_agencia: float = 0.0
    utilidad_neta: float = 0.0


# ─── Tracking de entrega ──────────────────────────────────────────────────────

class EntregarOrdenRequest(BaseModel):
    received_by_name: Optional[str] = None
    received_by_cedula: Optional[str] = None
    invoice_delivered: bool
    delivery_signature: Optional[str] = None
    metodo_pago: Optional[str] = None
    order_status: Optional[str] = "Entregada"
    estado_pago: Optional[str] = None

class EntregarOrdenResponse(BaseModel):
    order_id: int
    order_status: str           # will be "Entregada"
    is_paid: bool
    balance_due: float
    delivered_at: datetime
    delivered_by: str
    received_by_name: str
    received_by_cedula: str
    invoice_delivered: bool
    has_signature: bool         # True if delivery_signature is not null
    
    model_config = ConfigDict(from_attributes=True)


# ─── Setup / Join Requests ────────────────────────────────────────────────────

class SetupBusinessRequest(BaseModel):
    nombre_negocio: str


class SetupJoinRequest(BaseModel):
    nombre_negocio: str


class JoinRequestResponse(BaseModel):
    id: int
    user_id: int
    tenant_id: int
    status: str
    created_at: datetime
    username: Optional[str] = None
    email: Optional[str] = None
    tenant_nombre: Optional[str] = None

    model_config = {"from_attributes": True}


class SetupStatusResponse(BaseModel):
    role: str
    join_request: Optional[dict] = None


# ─── App Users Management ─────────────────────────────────────────────────────

class AppUserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str
    role: str  # "admin" | "empleado"
    cedula: Optional[str] = None
    tenant_id: Optional[int] = None

class AppUserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    cedula: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None  # Added to allow password updates

class AppUserResponse(BaseModel):
    id: int
    username: str
    email: str
    role: str
    cedula: Optional[str] = None
    is_active: bool
    created_at: datetime
    last_login: Optional[datetime] = None
    tenant_id: Optional[int] = None

    model_config = {"from_attributes": True}

class AppUsersStatsResponse(BaseModel):
    total_usuarios: int
    total_admins: int
    total_empleados: int
    activos: int
    inactivos: int
    max_usuarios: int        # from tenant.max_usuarios
    slots_disponibles: int   # max_usuarios - total_usuarios


# ─── Settings / Abreviaciones ────────────────────────────────────────────────

class AbreviacionesResponse(BaseModel):
    abreviaciones: Dict[str, str]

class AbreviacionesUpdate(BaseModel):
    abreviaciones: Dict[str, str]

class AbreviacionesSaveResponse(BaseModel):
    abreviaciones: Dict[str, str]
    total: int


# ─── Suscripción ──────────────────────────────────────────────────────────────

class PlanUpdateRequest(BaseModel):
    plan: str  # "none" | "basic" | "premium"


class PlanResponse(BaseModel):
    tenant_id: int
    plan: str
    updated_at: datetime

    model_config = {"from_attributes": True}


class SuscripcionInfo(BaseModel):
    plan_actual: str        # "none" | "basic" | "premium"
    puede_usar_app: bool    # False if plan == "none"
    es_premium: bool        # True only if plan == "premium"
    features: Dict[str, bool]


# ─── Negocio Config ───────────────────────────────────────────────────────────

class NegocioConfig(BaseModel):
    nombre: str = ""
    slogan: str = ""
    direccion: str = ""
    telefono: str = ""
    nit: str = ""
    mensaje_pie: str = "¡GRACIAS POR TU PREFERENCIA!"
    logo_base64: Optional[str] = None  # "data:image/png;base64,..."
    logo_width: int = 50

class NegocioConfigResponse(NegocioConfig):
    tenant_id: Optional[int] = None


# ─── Business Settings ────────────────────────────────────────────────────────

class BusinessSettingsUpdate(BaseModel):
    business_name: Optional[str] = None
    business_address: Optional[str] = None
    business_phone: Optional[str] = None
    business_logo: Optional[str] = None

class BusinessSettingsResponse(BaseModel):
    business_name: str
    business_address: str
    business_phone: str
    business_logo: Optional[str] = None


# ─── Wompi / Pagos ────────────────────────────────────────────────────────────

class CreatePaymentRequest(BaseModel):
    """Request del frontend para iniciar un pago."""
    plan: str       # "basic" | "premium"
    period: str     # "monthly" | "yearly" | "trial"


class PaymentIntegrityResponse(BaseModel):
    """Respuesta con los datos necesarios para abrir el checkout de Wompi."""
    reference: str
    amount_in_cents: int
    currency: str
    integrity_signature: str
    public_key: str
    redirect_url: str


class PaymentTransactionResponse(BaseModel):
    """Respuesta con el estado de una transacción."""
    id: int
    reference: str
    wompi_transaction_id: Optional[str] = None
    plan: str
    billing_period: str
    amount_in_cents: int
    status: str
    payment_method: Optional[str] = None
    created_at: datetime
    plan_expires_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class PaymentHistoryResponse(BaseModel):
    """Lista de transacciones del tenant."""
    transactions: list
    current_plan: str
    plan_expires_at: Optional[datetime] = None
