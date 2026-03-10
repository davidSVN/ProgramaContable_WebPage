# 🧺 Lavalatu API

API backend multi-tenant para gestión de lavanderías, construida con **FastAPI + SQLAlchemy + PostgreSQL + JWT**.

## Requisitos previos

- **Python 3.10+**
- **PostgreSQL 14+** (corriendo y accesible)
- **pip** para instalar dependencias

## Instalación

### 1. Crear la base de datos en PostgreSQL

```sql
CREATE DATABASE lavalatu_db;
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
```

Edita `.env` con tus valores reales:

```env
DATABASE_URL=postgresql://tu_usuario:tu_password@localhost:5432/lavalatu_db
JWT_SECRET=genera_un_secreto_seguro_de_al_menos_32_caracteres
JWT_ALGORITHM=HS256
ALLOWED_ORIGINS=http://localhost:3000
ENVIRONMENT=development
```

### 3. Instalar dependencias

```bash
pip install -r requirements.txt
```

### 4. Correr en desarrollo

```bash
uvicorn app.main:app --reload
```

La API estará disponible en `http://localhost:8000`.  
La documentación interactiva (Swagger UI) estará en `http://localhost:8000/docs`.

## Endpoints disponibles

### Públicos (sin autenticación)

| Método | Ruta             | Descripción               |
|--------|------------------|---------------------------|
| GET    | `/`              | Health check              |
| POST   | `/api/auth/login`| Iniciar sesión (obtener JWT) |

### Autenticados (requieren JWT)

| Método | Ruta                  | Descripción                    |
|--------|-----------------------|--------------------------------|
| GET    | `/api/auth/me`        | Datos del usuario autenticado  |

### SuperAdmin (requieren rol `superadmin`)

| Método | Ruta                                          | Descripción                          |
|--------|-----------------------------------------------|--------------------------------------|
| GET    | `/api/superadmin/dashboard`                   | Estadísticas generales               |
| GET    | `/api/superadmin/tenants`                     | Listar todos los tenants             |
| POST   | `/api/superadmin/tenants`                     | Crear un nuevo tenant + admin        |
| GET    | `/api/superadmin/tenants/{id}`                | Detalle de un tenant                 |
| PATCH  | `/api/superadmin/tenants/{id}/toggle-activo`  | Activar/desactivar un tenant         |

## Crear el primer SuperAdmin

Después de correr la aplicación por primera vez (para que se creen las tablas), ejecuta este SQL directamente en PostgreSQL:

```sql
INSERT INTO app_users (email, username, password_hash, role, is_active, tenant_id)
VALUES (
    'tu_email@ejemplo.com',
    'SuperAdmin',
    '$2b$12$LJ3m4ys3Lk0TSwHBQhMGxOJqHeKZGMHCE9H5gDyVqXyRq3VmNisKq',
    'superadmin',
    true,
    NULL
);
```

> ⚠️ **Importante:** El `password_hash` de arriba corresponde a la contraseña `admin123`.  
> Para generar tu propio hash, ejecuta en Python:
>
> ```python
> import bcrypt
> hash = bcrypt.hashpw("tu_password_seguro".encode(), bcrypt.gensalt()).decode()
> print(hash)
> ```
>
> Luego reemplaza el valor en el SQL.

## Roles del sistema

| Rol          | Descripción                                      |
|--------------|--------------------------------------------------|
| `superadmin` | Dueño del SaaS. Acceso total. Sin tenant.        |
| `admin`      | Dueño de una lavandería. Gestiona su tenant.     |
| `empleado`   | Empleado de una lavandería. Acceso limitado.     |

## Estructura del proyecto

```
lavalatu-api/
├── app/
│   ├── __init__.py
│   ├── main.py                  ← FastAPI app, CORS, routers
│   ├── database.py              ← Conexión PostgreSQL
│   ├── models.py                ← Modelos SQLAlchemy
│   ├── schemas.py               ← Schemas Pydantic
│   ├── dependencies.py          ← Auth dependencies
│   ├── routers/
│   │   ├── auth.py              ← Login, /me
│   │   └── superadmin.py        ← Gestión de tenants
│   └── services/
│       ├── auth_service.py      ← JWT + bcrypt
│       └── tenant_service.py    ← Lógica de tenants
├── .env.example
├── requirements.txt
└── README.md
```
