import os
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://usuario:password@localhost:5432/lavalatu_db")

engine = create_async_engine(
    DATABASE_URL,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

Base = declarative_base()


async def get_db():
    """Dependency de FastAPI que provee una sesión async de BD."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    """Crea todas las tablas definidas en los modelos y aplica
    micro-migraciones idempotentes para columnas agregadas in-place."""
    from app import models  # noqa: F401 — importa para registrar modelos en Base
    from sqlalchemy import text

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

        # ── Micro-migraciones idempotentes (PostgreSQL) ───────────────────
        # ADD COLUMN IF NOT EXISTS y CREATE INDEX IF NOT EXISTS son no-ops
        # cuando ya existen, así que se pueden re-ejecutar al deploy.
        await conn.execute(text("""
            ALTER TABLE spents_business
            ADD COLUMN IF NOT EXISTS order_detail_id INTEGER
            REFERENCES order_details(id) ON DELETE SET NULL
        """))
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS ix_spents_business_order_detail_id
            ON spents_business(order_detail_id)
        """))
