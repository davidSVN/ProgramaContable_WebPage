# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
pip install -r requirements.txt

# Run development server (auto-reload)
uvicorn app.main:app --reload

# Run on custom port
uvicorn app.main:app --reload --port 8001

# Database migrations (Alembic)
alembic upgrade head
alembic revision --autogenerate -m "description"
```

There is no test suite currently. The interactive API docs are at `http://localhost:8000/docs`.

## Environment

Copy `.env.example` to `.env` and set:
- `DATABASE_URL` — async PostgreSQL URL (`postgresql+asyncpg://...` or `postgresql://...`)
- `JWT_SECRET` — at least 32 characters
- `JWT_ALGORITHM` — `HS256`
- `ALLOWED_ORIGINS` — comma-separated frontend origins
- `ENVIRONMENT` — `development` or `production`

## Architecture

Multi-tenant SaaS REST API for laundry management. Stack: FastAPI + SQLAlchemy (async) + PostgreSQL + JWT.

**Request flow:** Router → Service → AsyncSession (SQLAlchemy ORM)

### Layer structure

- `app/main.py` — App bootstrap, CORS, router registration
- `app/database.py` — Async engine, `AsyncSession` factory, `init_db()` (creates tables on startup)
- `app/models.py` — All 13 SQLAlchemy ORM models
- `app/schemas.py` — All Pydantic request/response schemas
- `app/dependencies.py` — JWT auth: `get_current_user`, `require_superadmin`, `require_admin_or_above`
- `app/routers/` — Route handlers (thin layer, delegate to services)
- `app/services/` — Business logic per domain

### Multi-tenancy

Every data model has a `tenant_id` FK. Queries always filter by the authenticated user's `tenant_id`. The `superadmin` role has no tenant and manages all tenants via `/api/superadmin/`.

### Roles

| Role | Access |
|------|--------|
| `superadmin` | Full SaaS access, no tenant |
| `admin` | Full access within their tenant |
| `empleado` | Limited access within their tenant |

### Key models

- `Tenant` — laundry business (organization)
- `AppUser` — system user (superadmin/admin/empleado)
- `LaundryUser` — customer of a laundry (has `saldo_a_favor` credit balance)
- `OrderHeader` / `OrderDetail` / `OrderPayment` — B2C orders with multi-payment support
- `ConsolidatedInvoice` / `AbonoInstitucional` — B2B invoicing for institutional clients
- `SpentBusiness` — business expenses
- `BusinessReportData` — analytics/reporting snapshots

### API prefixes

| Prefix | Router file | Description |
|--------|-------------|-------------|
| `/api/auth` | `routers/auth.py` | Login, `/me` |
| `/api/superadmin` | `routers/superadmin.py` | Tenant management |
| `/api/usuarios` | `routers/usuarios.py` | Laundry customer CRUD |
| `/api/servicios` | `routers/servicios.py` | Services & pricing |
| `/api/ordenes` | `routers/ordenes.py` | B2C order lifecycle |
| `/api/b2b` | `routers/b2b.py` | B2B invoicing |
| `/api/gastos` | `routers/gastos.py` | Expense tracking |
| `/api/proveedores` | `routers/proveedores.py` | Supplier management |

### First superadmin

Tables are auto-created on startup. Insert the first superadmin directly in SQL (see README.md for the bcrypt hash generation snippet).
