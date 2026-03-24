from datetime import date, datetime, timedelta
from typing import List, Optional
import pandas as pd
import pytz
from collections import Counter
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_premium
from app.models import AppUser, OrderHeader, OrderDetail, OrderPayment, SpentBusiness, LaundryUser
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
        "id": o.id,
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
            "id", "user_id", "user_name", "created_at", "total_amount", 
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
            "total": 0, "total_ingresos": 0, "total_egresos": 0, "income_neto": 0,
            "ticket_promedio": 0, "ordenes_debe": 0, "pct_cobrado": 0, "por_estado": {},
            "ingresos_por_metodo": {}
        }

    gastos_df = await _get_gastos_df(db, current_user.tenant_id, fecha_inicio, fecha_fin)
    ingresos = orders_df["net_income_value"].sum()
    egresos = gastos_df["spent_value"].sum() if not gastos_df.empty else 0
    
    # Cálculos adicionales para el frontend
    ordenes_debe = len(orders_df[orders_df["is_paid"] == False])
    pct_cobrado = (1 - (orders_df["balance_due"].sum() / orders_df["total_amount"].sum() if orders_df["total_amount"].sum() > 0 else 0)) * 100
    
    # ── Pagos por método ────────────────────────────────────────────────────────
    pagos_por_metodo = {}
    order_ids = orders_df["id"].tolist()
    if order_ids:
        res_pagos = await db.execute(
            select(
                OrderPayment.payment_method,
                func.sum(OrderPayment.amount).label("total")
            ).where(
                and_(
                    OrderPayment.tenant_id == current_user.tenant_id,
                    OrderPayment.order_id.in_(order_ids),
                )
            ).group_by(OrderPayment.payment_method)
        )
        pagos_por_metodo = {row.payment_method: float(row.total or 0) for row in res_pagos}

    return {
        "total": len(orders_df),
        "total_ingresos": float(ingresos),
        "total_egresos": float(egresos),
        "income_neto": float(ingresos - egresos),
        "ticket_promedio": float(orders_df["total_amount"].mean()),
        "ordenes_debe": ordenes_debe,
        "pct_cobrado": round(pct_cobrado, 1),
        "por_estado": orders_df["order_status"].value_counts().to_dict() if "order_status" in orders_df else {},
        "ingresos_por_metodo": pagos_por_metodo
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
        
    # Solo usuarios activos
    stmt = stmt.where(LaundryUser.state == True)
        
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

    # Fetch only active users and their contacts
    user_ids = [p.user_id for p in perfiles]
    contacts_result = await db.execute(
        select(LaundryUser.user_id, LaundryUser.user_contact)
        .where(
            LaundryUser.user_id.in_(user_ids),
            LaundryUser.state == True
        )
    )
    rows_active = contacts_result.all()
    contacts_map = {r.user_id: r.user_contact for r in rows_active}
    active_user_ids = set(contacts_map.keys())

    # Map only active users
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
        "contacto": contacts_map.get(p.user_id),
        "segmento": SEG_MAP.get(p.segmento_rfm, "Nuevos"),
        "frecuencia": round(p.frecuencia_promedio_dias, 1),
        "ticket_promedio": p.ticket_promedio,
        "tendencia": p.tendencia,
        "riesgo_churn": int((p.riesgo_churn or 0) * 100),
        "ltv_estimado": p.lifetime_value_estimado,
        "ultima_visita": p.ultimo_pedido,
        "total_ordenes": p.total_ordenes,
        "total_historico": p.total_gastado
    } for p in perfiles if p.user_id in active_user_ids]

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

    # Fetch only active users and their contacts
    user_ids = [p.user_id for p in perfiles]
    contacts_result = await db.execute(
        select(LaundryUser.user_id, LaundryUser.user_contact)
        .where(
            LaundryUser.user_id.in_(user_ids),
            LaundryUser.state == True
        )
    )
    rows_active = contacts_result.all()
    contacts_map = {r.user_id: r.user_contact for r in rows_active}
    active_user_ids = set(contacts_map.keys())

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
        "contacto": contacts_map.get(p.user_id),
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
    } for p in perfiles if p.user_id in active_user_ids]

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


# ── RESUMEN DEL DÍA ───────────────────────────────────────────────────────────

@router.get("/resumen-dia", summary="Resumen completo del día")
async def resumen_dia(
    fecha: Optional[date] = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Resumen completo del día: órdenes, pagos, egresos y servicios."""

    tz_colombia = pytz.timezone("America/Bogota")
    hoy = fecha or datetime.now(tz_colombia).date()
    inicio = datetime.combine(hoy, datetime.min.time())
    fin    = datetime.combine(hoy, datetime.max.time())
    tid    = current_user.tenant_id

    # ── Órdenes del día ──────────────────────────────────────────────────────
    res_ordenes = await db.execute(
        select(OrderHeader).where(
            and_(
                OrderHeader.tenant_id == tid,
                OrderHeader.date >= inicio,
                OrderHeader.date <= fin,
            )
        )
    )
    ordenes = res_ordenes.scalars().all()
    order_ids = [o.id for o in ordenes]

    # ── Pagos del día ────────────────────────────────────────────────────────
    pagos_por_metodo = {}
    if order_ids:
        res_pagos = await db.execute(
            select(
                OrderPayment.payment_method,
                func.sum(OrderPayment.amount).label("total")
            ).where(
                and_(
                    OrderPayment.tenant_id == tid,
                    OrderPayment.order_id.in_(order_ids),
                )
            ).group_by(OrderPayment.payment_method)
        )
        pagos_por_metodo = {row.payment_method: float(row.total or 0) for row in res_pagos}

    # ── Egresos del día ──────────────────────────────────────────────────────
    res_gastos = await db.execute(
        select(SpentBusiness).where(
            and_(
                SpentBusiness.tenant_id == tid,
                SpentBusiness.spent_date >= inicio,
                SpentBusiness.spent_date <= fin,
            )
        )
    )
    gastos = res_gastos.scalars().all()

    # ── Detalles de órdenes del día ──────────────────────────────────────────
    detalles = []
    if order_ids:
        res_detalles = await db.execute(
            select(OrderDetail).where(
                and_(
                    OrderDetail.tenant_id == tid,
                    OrderDetail.order_id.in_(order_ids),
                )
            )
        )
        detalles = res_detalles.scalars().all()

    # ── Cálculos ─────────────────────────────────────────────────────────────
    total_ingresos = sum(float(o.total_amount or 0) for o in ordenes)
    total_cobrado  = sum(float(o.total_amount or 0) - float(o.balance_due or 0) for o in ordenes)
    total_debe     = sum(float(o.balance_due or 0) for o in ordenes)
    total_egresos  = sum(float(g.spent_value or 0) for g in gastos)
    income_neto    = total_cobrado - total_egresos

    servicios_count = Counter(d.service_name for d in detalles if d.service_name)
    servicios_agencia = [d for d in detalles if getattr(d, "is_agency", False)]

    return {
        "fecha": str(hoy),
        "resumen": {
            "total_ordenes":      len(ordenes),
            "total_ingresos":     round(total_ingresos, 0),
            "total_cobrado":      round(total_cobrado, 0),
            "total_debe":         round(total_debe, 0),
            "total_egresos":      round(total_egresos, 0),
            "income_neto":        round(income_neto, 0),
            "ordenes_pagadas":    sum(1 for o in ordenes if o.is_paid),
            "ordenes_debe":       sum(1 for o in ordenes if not o.is_paid and (o.balance_due or 0) > 0),
            "ordenes_entregadas": sum(1 for o in ordenes if o.order_status == "Entregada"),
            "ordenes_agencia":    sum(1 for o in ordenes if (o.agency_cost or 0) > 0),
            "ordenes_instituto":  sum(1 for o in ordenes if getattr(o, "is_institute", False)),
        },
        "ingresos_por_metodo": pagos_por_metodo,
        "egresos": [
            {
                "nombre":    g.spent_general_name,
                "categoria": g.spent_category,
                "valor":     float(g.spent_value or 0),
                "metodo":    g.spent_payment_method,
            }
            for g in gastos
        ],
        "ordenes": [
            {
                "id":          o.id,
                "cliente":     o.user_name,
                "total":       float(o.total_amount or 0),
                "cobrado":     float(o.total_amount or 0) - float(o.balance_due or 0),
                "debe":        float(o.balance_due or 0),
                "estado":      o.order_status,
                "estado_pago": "Pagada" if o.is_paid else "Debe",
                "es_instituto":   getattr(o, "is_institute", False),
                "tiene_agencia":  bool(o.agency_cost and o.agency_cost > 0),
                "descripcion":    o.items_description,
            }
            for o in ordenes
        ],
        "servicios_del_dia": [
            {"nombre": nombre, "cantidad": cant}
            for nombre, cant in servicios_count.most_common(20)
        ],
        "servicios_agencia": [
            {
                "servicio":  d.service_name,
                "cantidad":  d.quantity,
                "orden_id":  d.order_id,
                "cliente":   getattr(d, "user_name", ""),
                "valor":     float(d.total_item_price or 0),
            }
            for d in servicios_agencia
        ],
    }
