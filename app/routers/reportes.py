from datetime import date, datetime, timedelta
from typing import List, Optional
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_premium
from app.models import AppUser, OrderHeader, OrderDetail, SpentBusiness, LaundryUser
from app.services import ml_engine

router = APIRouter()

# ── Helper: Fetch and convert to DataFrame ──────────────────────────────────

async def _get_orders_df(db: AsyncSession, tenant_id: Optional[int], fecha_inicio: Optional[date] = None, fecha_fin: Optional[date] = None):
    stmt = select(OrderHeader)
    if tenant_id is not None:
        stmt = stmt.where(OrderHeader.tenant_id == tenant_id)
        
    if fecha_inicio:
        stmt = stmt.where(OrderHeader.date >= datetime.combine(fecha_inicio, datetime.min.time()))
    if fecha_fin:
        stmt = stmt.where(OrderHeader.date <= datetime.combine(fecha_fin, datetime.max.time()))
    
    result = await db.execute(stmt)
    orders = result.scalars().all()
    
    df = pd.DataFrame([{
        "user_id": o.user_id,
        "user_name": o.user_name,
        "created_at": o.date,
        "total_amount": float(o.total_amount or 0),
        "net_income_value": float(o.net_income_value or 0),
        "balance_due": float(o.balance_due or 0),
        "is_paid": o.is_paid,
        "items_description": o.items_description,
        "order_status": o.order_status,
    } for o in orders])
    
    if not df.empty:
        df = df.sort_values("created_at")
    else:
        # Define columns for empty DF to prevent downstream crashes
        df = pd.DataFrame(columns=[
            "user_id", "user_name", "created_at", "total_amount", 
            "net_income_value", "balance_due", "is_paid", 
            "items_description", "order_status"
        ])
    return df

async def _get_gastos_df(db: AsyncSession, tenant_id: Optional[int], fecha_inicio: Optional[date] = None, fecha_fin: Optional[date] = None):
    stmt = select(SpentBusiness)
    if tenant_id is not None:
        stmt = stmt.where(SpentBusiness.tenant_id == tenant_id)
        
    if fecha_inicio:
        stmt = stmt.where(SpentBusiness.spent_date >= datetime.combine(fecha_inicio, datetime.min.time()))
    if fecha_fin:
        stmt = stmt.where(SpentBusiness.spent_date <= datetime.combine(fecha_fin, datetime.max.time()))
        
    result = await db.execute(stmt)
    gastos = result.scalars().all()
    
    df = pd.DataFrame([{
        "spent_date": g.spent_date,
        "spent_value": float(g.spent_value),
        "spent_category": g.spent_category,
    } for g in gastos])
    
    if df.empty:
        df = pd.DataFrame(columns=["spent_date", "spent_value", "spent_category"])
    return df

# ── BASIC PLAN (all tenants) ──────────────────────────────────────────────────

@router.get("/financiero", summary="Comparativa de ingreso neto")
async def reporte_financiero(
    periodo: str = Query("mes", enum=["mes", "trimestre", "año", "todo"]),
    año: int = Query(default=datetime.utcnow().year),
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Retorna comparativa de ingresos, egresos y neto vs periodo anterior."""
    hoy = datetime.utcnow()
    
    if periodo == "mes":
        inicio_actual = datetime(año, hoy.month, 1)
        proximo_mes = (inicio_actual + timedelta(days=32)).replace(day=1)
        fin_actual = proximo_mes - timedelta(seconds=1)
        
        inicio_anterior = (inicio_actual - timedelta(days=1)).replace(day=1)
        fin_anterior = inicio_actual - timedelta(seconds=1)
        
    elif periodo == "trimestre":
        # Determinamos el trimestre actual (1, 2, 3 o 4)
        trim_actual = (hoy.month - 1) // 3 + 1
        inicio_actual = datetime(año, (trim_actual - 1) * 3 + 1, 1)
        
        # Fin del trimestre actual
        siguiente_trim_month = trim_actual * 3 + 1
        if siguiente_trim_month > 12:
            fin_actual = datetime(año, 12, 31, 23, 59, 59)
        else:
            fin_actual = datetime(año, siguiente_trim_month, 1) - timedelta(seconds=1)
            
        # Inicio y fin del trimestre anterior
        if trim_actual == 1:
            inicio_anterior = datetime(año - 1, 10, 1)
            fin_anterior = datetime(año - 1, 12, 31, 23, 59, 59)
        else:
            inicio_anterior = datetime(año, (trim_actual - 2) * 3 + 1, 1)
            fin_anterior = inicio_actual - timedelta(seconds=1)
            
    elif periodo == "año":
        inicio_actual = datetime(año, 1, 1)
        fin_actual = datetime(año, 12, 31, 23, 59, 59)
        inicio_anterior = datetime(año - 1, 1, 1)
        fin_anterior = datetime(año - 1, 12, 31, 23, 59, 59)
    else: # todo
        inicio_actual = datetime(2000, 1, 1)
        fin_actual = datetime.utcnow()
        inicio_anterior = inicio_actual - timedelta(seconds=1)
        fin_anterior = inicio_actual

    orders_df = await _get_orders_df(db, current_user.tenant_id)
    gastos_df = await _get_gastos_df(db, current_user.tenant_id)
    
    engine = ml_engine.get_engine(current_user.tenant_id)
    raw_res = engine.calcular_income_neto(
        orders_df, gastos_df, 
        (inicio_actual, fin_actual), 
        (inicio_anterior, fin_anterior)
    )

    # Transformación para el frontend (IAReportes.jsx)
    return {
        "ingresos": raw_res["periodo_actual"]["ingresos"],
        "egresos": raw_res["periodo_actual"]["egresos"],
        "neto": raw_res["periodo_actual"]["neto"],
        "vs_anterior": {
            "ingresos_pct": raw_res["cambio_pct"]["ingresos"],
            "egresos_pct": raw_res["cambio_pct"]["egresos"],
            "neto_pct": raw_res["cambio_pct"]["neto"],
        },
        "historico_mensual": raw_res.get("historico_mensual", []) # Backend needs updating for this too
    }

@router.get("/ordenes-resumen", summary="Resumen de órdenes")
async def reporte_ordenes_resumen(
    fecha_inicio: Optional[date] = None,
    fecha_fin: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    orders_df = await _get_orders_df(db, current_user.tenant_id, fecha_inicio, fecha_fin)
    
    if orders_df.empty:
        return {
            "total_ordenes": 0, "total_ingresos": 0, "total_egresos": 0, "income_neto": 0,
            "ticket_promedio": 0, "ordenes_por_estado": {}
        }

    gastos_df = await _get_gastos_df(db, current_user.tenant_id, fecha_inicio, fecha_fin)
    ingresos = orders_df["net_income_value"].sum()
    egresos = gastos_df["spent_value"].sum() if not gastos_df.empty else 0
    
    # Cálculos adicionales para el frontend
    ordenes_debe = len(orders_df[orders_df["is_paid"] == False])
    pct_cobrado = (1 - (orders_df["balance_due"].sum() / orders_df["total_amount"].sum() if orders_df["total_amount"].sum() > 0 else 0)) * 100
    
    return {
        "total": len(orders_df),
        "total_ingresos": float(ingresos),
        "total_egresos": float(egresos),
        "income_neto": float(ingresos - egresos),
        "ticket_promedio": float(orders_df["total_amount"].mean()),
        "ordenes_debe": ordenes_debe,
        "pct_cobrado": round(pct_cobrado, 1),
        "por_estado": orders_df["order_status"].value_counts().to_dict() if "order_status" in orders_df else {}
    }

@router.get("/clientes-riesgo", summary="Clientes en riesgo (60+ días sin orden)")
async def reporte_clientes_riesgo(
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Versión básica: busca usuarios con más de 60 días desde su última orden."""
    hoy = datetime.utcnow()
    limite = hoy - timedelta(days=60)
    
    # Query optimizada
    stmt = (
        select(
            LaundryUser.user_id,
            LaundryUser.user_name,
            LaundryUser.user_contact,
            func.max(OrderHeader.date).label("ultima_orden"),
            func.sum(OrderHeader.total_amount).label("gastado_total")
        )
        .join(OrderHeader, LaundryUser.user_id == OrderHeader.user_id)
    )
    
    if current_user.tenant_id is not None:
        stmt = stmt.where(LaundryUser.tenant_id == current_user.tenant_id)
        
    stmt = (
        stmt.group_by(LaundryUser.user_id, LaundryUser.user_name, LaundryUser.user_contact)
        .having(func.max(OrderHeader.date) < limite)
        .order_by(func.max(OrderHeader.date).asc())
    )
    
    result = await db.execute(stmt)
    rows = result.all()
    
    return [{
        "user_id": r.user_id,
        "nombre": r.user_name,
        "dias_sin_visitar": (hoy - r.ultima_orden).days,
        "total_gastado": float(r.gastado_total or 0),
        "ultima_visita": r.ultima_orden,
        "contacto": getattr(r, "user_contact", "—") # We need to select contact in query
    } for r in rows]

@router.get("/servicios-ranking", summary="Ranking de servicios por ingresos")
async def reporte_servicios_ranking(
    fecha_inicio: Optional[date] = None,
    fecha_fin: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    stmt = (
        select(
            OrderDetail.service_name,
            func.sum(OrderDetail.total_item_price).label("ingresos"),
            func.count(OrderDetail.id).label("cantidad")
        )
        .join(OrderHeader, OrderDetail.order_id == OrderHeader.id)
    )
    
    if current_user.tenant_id is not None:
        stmt = stmt.where(OrderDetail.tenant_id == current_user.tenant_id)
    if fecha_inicio:
        stmt = stmt.where(OrderHeader.date >= datetime.combine(fecha_inicio, datetime.min.time()))
    if fecha_fin:
        stmt = stmt.where(OrderHeader.date <= datetime.combine(fecha_fin, datetime.max.time()))
        
    stmt = stmt.group_by(OrderDetail.service_name).order_by(func.sum(OrderDetail.total_item_price).desc()).limit(10)
    
    result = await db.execute(stmt)
    rows = result.all()
    
    return [{
        "service_name": r.service_name,
        "total": float(r.ingresos or 0),
        "cantidad": r.cantidad
    } for r in rows]

# ── PREMIUM PLAN ONLY ─────────────────────────────────────────────────────────

@router.get("/ml/perfiles", summary="Perfiles de clientes (ML)")
async def reporte_ml_perfiles(
    fecha_inicio: Optional[date] = None,
    fecha_fin: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_premium),
):
    orders_df = await _get_orders_df(db, current_user.tenant_id, fecha_inicio, fecha_fin)
    if orders_df.empty:
        return []
    engine = ml_engine.get_engine(current_user.tenant_id)
    perfiles = engine.calcular_perfiles(orders_df)
    
    # Map to frontend keys
    SEG_MAP = {
        "campeon": "Campeones",
        "leal": "Leales",
        "en_riesgo": "En Riesgo",
        "perdido": "Perdidos",
        "nuevo": "Nuevos"
    }

    return [{
        "user_id": p.user_id,
        "nombre": p.user_name,
        "segmento": SEG_MAP.get(p.segmento_rfm, "Nuevos"),
        "frecuencia": round(p.frecuencia_promedio_dias, 1),
        "ticket_promedio": p.ticket_promedio,
        "tendencia": p.tendencia,
        "riesgo_churn": int((p.riesgo_churn or 0) * 100),
        "ltv_estimado": p.lifetime_value_estimado,
        "ultima_visita": p.ultimo_pedido,
        "total_ordenes": p.total_ordenes,
        "total_historico": p.total_gastado
    } for p in perfiles]

@router.get("/ml/perfil/{user_id}", summary="Perfil individual de cliente (ML)")
async def reporte_ml_perfil_unico(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_premium),
):
    # Fetch orders only for this user for efficiency
    stmt = select(OrderHeader).where(OrderHeader.user_id == user_id)
    if current_user.tenant_id is not None:
        stmt = stmt.where(OrderHeader.tenant_id == current_user.tenant_id)
        
    result = await db.execute(stmt)
    orders = result.scalars().all()
    
    if not orders:
        raise HTTPException(status_code=404, detail="No se encontraron órdenes para este usuario")
        
    orders_df = pd.DataFrame([{
        "user_id": o.user_id,
        "user_name": o.user_name,
        "created_at": o.date,
        "total_amount": float(o.total_amount),
        "items_description": o.items_description,
    } for o in orders])
    
    engine = ml_engine.get_engine(current_user.tenant_id)
    perfiles = engine.calcular_perfiles(orders_df)
    if not perfiles:
        return None
        
    p = perfiles[0]
    SEG_MAP = {
        "campeon": "Campeones",
        "leal": "Leales",
        "en_riesgo": "En Riesgo",
        "perdido": "Perdidos",
        "nuevo": "Nuevos"
    }

    return {
        "user_id": p.user_id,
        "nombre": p.user_name,
        "segmento": SEG_MAP.get(p.segmento_rfm, "Nuevos"),
        "frecuencia": round(p.frecuencia_promedio_dias, 1),
        "ticket_promedio": p.ticket_promedio,
        "tendencia": p.tendencia,
        "riesgo_churn": int((p.riesgo_churn or 0) * 100),
        "nivel_riesgo": p.churn_categoria,
        "ltv_estimado": p.lifetime_value_estimado,
        "ltv": p.lifetime_value_estimado,
        "ultima_visita": p.ultimo_pedido,
        "dias_sin_visitar": p.dias_sin_orden,
        "total_ordenes": p.total_ordenes,
        "total_historico": p.total_gastado,
        "total_gastado": p.total_gastado,
        "descuento_sugerido": p.descuento_sugerido,
        "razon": p.razon_descuento
    }

@router.get("/ml/oportunidades-descuento", summary="Sugerencias de descuentos")
async def reporte_ml_descuentos(
    fecha_inicio: Optional[date] = None,
    fecha_fin: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_premium),
):
    orders_df = await _get_orders_df(db, current_user.tenant_id, fecha_inicio, fecha_fin)
    if orders_df.empty:
        return []
    engine = ml_engine.get_engine(current_user.tenant_id)
    perfiles = engine.calcular_perfiles(orders_df)
    
    # Map to frontend keys (Reusable mapping)
    SEG_MAP = {
        "campeon": "Campeones",
        "leal": "Leales",
        "en_riesgo": "En Riesgo",
        "perdido": "Perdidos",
        "nuevo": "Nuevos"
    }

    perfiles_mapped = [{
        "user_id": p.user_id,
        "nombre": p.user_name,
        "segmento": SEG_MAP.get(p.segmento_rfm, "Nuevos"),
        "frecuencia": round(p.frecuencia_promedio_dias, 1),
        "ticket_promedio": p.ticket_promedio,
        "tendencia": p.tendencia,
        "riesgo_churn": int((p.riesgo_churn or 0) * 100),
        "nivel_riesgo": p.churn_categoria,
        "ltv_estimado": p.lifetime_value_estimado,
        "ltv": p.lifetime_value_estimado, # Both names used
        "ultima_visita": p.ultimo_pedido,
        "dias_sin_visitar": p.dias_sin_orden,
        "total_ordenes": p.total_ordenes,
        "total_historico": p.total_gastado,
        "total_gastado": p.total_gastado,
        "descuento_sugerido": p.descuento_sugerido,
        "razon": p.razon_descuento
    } for p in perfiles]

    # Filter only those with suggestions
    oportunidades = [p for p in perfiles_mapped if p["descuento_sugerido"] is not None]
    return sorted(oportunidades, key=lambda x: (x["riesgo_churn"] or 0), reverse=True)

@router.get("/ml/segmentos-rfm", summary="Distribución de segmentos RFM")
async def reporte_ml_segmentos(
    fecha_inicio: Optional[date] = None,
    fecha_fin: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_premium),
):
    orders_df = await _get_orders_df(db, current_user.tenant_id, fecha_inicio, fecha_fin)
    if orders_df.empty:
        return {"campeon": 0, "leal": 0, "en_riesgo": 0, "perdido": 0, "nuevo": 0}
    engine = ml_engine.get_engine(current_user.tenant_id)
    perfiles = engine.calcular_perfiles(orders_df)
    
    counts = {"Campeones": 0, "Leales": 0, "En Riesgo": 0, "Perdidos": 0, "Nuevos": 0}
    SEG_MAP = {
        "campeon": "Campeones",
        "leal": "Leales",
        "en_riesgo": "En Riesgo",
        "perdido": "Perdidos",
        "nuevo": "Nuevos"
    }
    for p in perfiles:
        label = SEG_MAP.get(p.segmento_rfm, "Nuevos")
        counts[label] += 1
            
    return counts

@router.get("/ml/forecast-demanda", summary="Pronóstico de demanda (Forecast)")
async def reporte_ml_forecast(
    semanas: int = Query(4, ge=1, le=12),
    fecha_inicio: Optional[date] = None,
    fecha_fin: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_premium),
):
    orders_df = await _get_orders_df(db, current_user.tenant_id, fecha_inicio, fecha_fin)
    if orders_df.empty:
        return []
    engine = ml_engine.get_engine(current_user.tenant_id)
    return engine.forecast_demanda(orders_df, semanas)

@router.get("/retencion", summary="Análisis de retención (Cohortes)")
async def reporte_retencion(
    fecha_inicio: Optional[date] = None,
    fecha_fin: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_premium),
):
    orders_df = await _get_orders_df(db, current_user.tenant_id, fecha_inicio, fecha_fin)
    if orders_df.empty:
        return {"meses": []}
    engine = ml_engine.get_engine(current_user.tenant_id)
    return engine.calcular_retencion(orders_df)

@router.post("/ml/recalcular", summary="Forzar recálculo de IA")
async def recalcular_ml(
    current_user: AppUser = Depends(require_premium),
):
    engine = ml_engine.get_engine(current_user.tenant_id)
    engine._cache_ts = None
    return {"status": "ok", "recalculado_at": datetime.utcnow()}
