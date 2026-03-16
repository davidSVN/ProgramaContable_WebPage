import asyncio
import logging
from datetime import datetime, time
from app.services.ml_engine import get_engine, _engines

logger = logging.getLogger(__name__)

async def recalcular_todos_los_tenants(db_factory):
    """
    Recalculates ML profiles for all active tenants by invalidating cache.
    Called once per night at 2:00 AM server time.
    """
    logger.info(f"[Scheduler] Iniciando recálculo nocturno - {datetime.utcnow()}")
    for tenant_id, engine in _engines.items():
        try:
            engine._cache_ts = None  # invalidate cache
            logger.info(f"[Scheduler] Cache invalidado para tenant {tenant_id}")
        except Exception as e:
            logger.error(f"[Scheduler] Error tenant {tenant_id}: {e}")
    logger.info("[Scheduler] Recálculo nocturno completado")

async def run_nightly_scheduler(db_factory):
    """Run forever, trigger at 2:00 AM every night."""
    while True:
        now = datetime.utcnow()
        target = datetime.combine(now.date(), time(2, 0))
        if now >= target:
            from datetime import timedelta
            target = target + timedelta(days=1)
        wait_seconds = (target - now).total_seconds()
        logger.info(f"[Scheduler] Próximo recálculo en {wait_seconds/3600:.1f} horas")
        
        # Sleep until target time
        await asyncio.sleep(wait_seconds)
        await recalcular_todos_los_tenants(db_factory)
