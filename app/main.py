import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db

load_dotenv()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Evento de inicio: crea las tablas en la BD y arranca scheduler."""
    await init_db()  # Temporarily disabled to debug hang
    
    # Iniciar scheduler en segundo plano
    import asyncio
    from app.services.scheduler import run_nightly_scheduler
    from app.database import AsyncSessionLocal
    
    # Guardamos la referencia para cancelarla al apagar si fuera necesario
    scheduler_task = asyncio.create_task(run_nightly_scheduler(AsyncSessionLocal))
    
    yield
    
    # Al apagar el servidor
    scheduler_task.cancel()


app = FastAPI(
    title="Lavalatu API",
    version="0.1.0",
    description="API multi-tenant para gestión de lavanderías",
    lifespan=lifespan,
)

# ─── CORS ─────────────────────────────────────────────────────────────────────

from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routers ──────────────────────────────────────────────────────────────────

from fastapi import Depends
from app.dependencies import require_suscripcion_activa
from app.routers import auth, superadmin, gastos, proveedores, servicios, usuarios, ordenes, b2b, app_users, settings, reportes, suscripcion, configuracion, wompi, join_requests

_sub = [Depends(require_suscripcion_activa)]

app.include_router(auth.router, prefix="/api")
app.include_router(superadmin.router, prefix="/api")
app.include_router(suscripcion.router, prefix="/api")
app.include_router(gastos.router, prefix="/api/gastos", tags=["Gastos"], dependencies=_sub)
app.include_router(proveedores.router, prefix="/api/proveedores", tags=["Proveedores"], dependencies=_sub)
app.include_router(servicios.router, prefix="/api/servicios", tags=["Servicios"], dependencies=_sub)
app.include_router(usuarios.router, prefix="/api/usuarios", tags=["Usuarios"], dependencies=_sub)
# Configuraciones del negocio
app.include_router(configuracion.router, prefix="/api/configuracion", tags=["Configuración"], dependencies=_sub)
app.include_router(reportes.router, prefix="/api/reportes", tags=["IA & Reportes"], dependencies=_sub)
app.include_router(ordenes.router, prefix="/api/ordenes", tags=["Órdenes B2C"], dependencies=_sub)
app.include_router(b2b.router, prefix="/api/b2b", tags=["Facturación B2B"], dependencies=_sub)
app.include_router(app_users.router, prefix="/api")
app.include_router(join_requests.router, prefix="/api")
app.include_router(wompi.public_router, prefix="/api")  # Sin JWT — webhook de Wompi
app.include_router(wompi.router, prefix="/api")
app.include_router(settings.router, prefix="/api/settings", tags=["Settings"], dependencies=_sub)


# ─── Static Files / Frontend ──────────────────────────────────────────────────

from fastapi.staticfiles import StaticFiles

# Montamos la carpeta dist del frontend. 
# Importante: Esto debe ir al final para no interferir con las rutas de la API.
if os.path.exists("frontend/dist"):
    app.mount("/", StaticFiles(directory="frontend/dist", html=True), name="static")
