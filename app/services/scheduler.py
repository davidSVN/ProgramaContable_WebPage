import asyncio
import logging
from datetime import datetime, time, timedelta
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


async def procesar_renovaciones(db_factory):
    """
    Procesa cobros recurrentes de Wompi para tenants cuyo plan venció.
    Luego degrada a 'none' los que no pudieron renovar y vencio su gracia.
    Called once per night at 6:00 AM server time.
    """
    from app.services.wompi_service import process_recurring_renewals, downgrade_expired_plans

    logger.info(f"[Scheduler] Iniciando renovaciones automáticas - {datetime.utcnow()}")
    try:
        async with db_factory() as db:
            results = await process_recurring_renewals(db)
        for r in results:
            if r["status"] == "failed":
                logger.error(f"[Scheduler] Renovación fallida tenant {r['tenant_id']}: {r['error']}")
            else:
                logger.info(f"[Scheduler] Cobro iniciado tenant {r['tenant_id']}: ref={r['reference']}")
        logger.info(f"[Scheduler] Renovaciones completadas — {len(results)} tenants procesados")
    except Exception as e:
        logger.error(f"[Scheduler] Error en renovaciones automáticas: {e}")

    logger.info(f"[Scheduler] Iniciando degradación de planes vencidos - {datetime.utcnow()}")
    try:
        async with db_factory() as db:
            downgrades = await downgrade_expired_plans(db)
        for d in downgrades:
            if d["action"] == "grace_period_started":
                logger.info(f"[Scheduler] Gracia iniciada tenant {d['tenant_id']}: hasta {d['grace_ends_at']}")
            elif d["action"] == "downgraded_to_none":
                logger.warning(f"[Scheduler] Plan degradado a 'none' tenant {d['tenant_id']}")
            elif d["action"] == "error":
                logger.error(f"[Scheduler] Error degradando tenant {d['tenant_id']}: {d['error']}")
        logger.info(f"[Scheduler] Degradaciones completadas — {len(downgrades)} tenants procesados")
    except Exception as e:
        logger.error(f"[Scheduler] Error en degradación de planes: {e}")


async def seconds_until(target_time: time) -> float:
    """Calcula los segundos hasta la próxima ocurrencia de target_time (UTC)."""
    now = datetime.utcnow()
    target = datetime.combine(now.date(), target_time)
    if now >= target:
        target += timedelta(days=1)
    return (target - now).total_seconds()


async def run_nightly_scheduler(db_factory):
    """
    Loop principal del scheduler. Lanza dos tareas independientes:
      - 02:00 UTC → recálculo de ML
      - 06:00 UTC → cobros recurrentes de Wompi
    """
    TIME_ML       = time(2, 0)
    TIME_RENEWALS = time(6, 0)

    async def loop_ml():
        while True:
            wait = await seconds_until(TIME_ML)
            logger.info(f"[Scheduler] Próximo recálculo ML en {wait/3600:.1f}h")
            await asyncio.sleep(wait)
            await recalcular_todos_los_tenants(db_factory)

    async def loop_renewals():
        while True:
            wait = await seconds_until(TIME_RENEWALS)
            logger.info(f"[Scheduler] Próximas renovaciones Wompi en {wait/3600:.1f}h")
            await asyncio.sleep(wait)
            await procesar_renovaciones(db_factory)

    await asyncio.gather(loop_ml(), loop_renewals())
