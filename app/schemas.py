from datetime import datetime
from typing import Optional, Dict
from pydantic import BaseModel, EmailStr


# ─── Auth ─────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    role: str
    tenant_id: Optional[int] = None
    username: str


class UserMe(BaseModel):
    id: int
    email: str
    username: str
    role: str
    tenant_id: Optional[int] = None
    is_active: bool

    model_config = {"from_attributes": True}


# ─── Tenant ───────────────────────────────────────────────────────────────────

class TenantCreate(BaseModel):
    nombre: str
    ciudad: Optional[str] = None
    plan: str = "basic"
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
