import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Evento de inicio: crea las tablas en la BD."""
    await init_db()
    yield


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
        "http://localhost:3000",
        "http://localhost:4173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routers ──────────────────────────────────────────────────────────────────

from app.routers import auth, superadmin, gastos, proveedores, servicios, usuarios, ordenes, b2b, app_users

app.include_router(auth.router, prefix="/api")
app.include_router(superadmin.router, prefix="/api")
app.include_router(gastos.router, prefix="/api/gastos", tags=["Gastos"])
app.include_router(proveedores.router, prefix="/api/proveedores", tags=["Proveedores"])
app.include_router(servicios.router, prefix="/api/servicios", tags=["Servicios"])
app.include_router(usuarios.router, prefix="/api/usuarios", tags=["Usuarios"])
app.include_router(ordenes.router, prefix="/api/ordenes", tags=["Órdenes B2C"])
app.include_router(b2b.router, prefix="/api/b2b", tags=["Facturación B2B"])
app.include_router(app_users.router, prefix="/api")


# ─── Health Check ─────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {"status": "ok", "version": "0.1.0"}
