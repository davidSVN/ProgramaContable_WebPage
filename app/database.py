import os
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://usuario:password@localhost:5432/lavalatu_db")

engine = create_async_engine(DATABASE_URL, pool_pre_ping=True)

AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

Base = declarative_base()


async def get_db():
    """Dependency de FastAPI que provee una sesión async de BD."""
    async with AsyncSessionLocal() as db:
        try:
            yield db
        finally:
            await db.close()


async def init_db():
    """Crea todas las tablas definidas en los modelos."""
    from app import models  # noqa: F401 — importa para registrar modelos en Base
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
