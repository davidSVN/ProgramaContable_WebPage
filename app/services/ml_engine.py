import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import Optional
from dataclasses import dataclass, field


@dataclass
class ClienteMLProfile:
    user_id: int
    user_name: str
    frecuencia_promedio_dias: float      # avg days between orders
    ticket_promedio: float               # avg order value
    varianza_ticket: float               # ticket variance
    servicios_favoritos: list            # top 3 service names
    tendencia: str                       # "creciendo"|"estable"|"decayendo"
    riesgo_churn: float                  # 0.0 to 1.0
    churn_categoria: str                 # "bajo"|"medio"|"alto"
    lifetime_value_estimado: float       # LTV projection 12 months
    dias_sin_orden: int
    total_ordenes: int
    total_gastado: float
    ultimo_pedido: Optional[datetime]
    segmento_rfm: str                    # "campeon"|"leal"|"en_riesgo"|"perdido"|"nuevo"
    descuento_sugerido: Optional[float]  # % discount suggestion
    razon_descuento: Optional[str]


class MLEngine:

    def __init__(self, tenant_id: int):
        self.tenant_id = tenant_id
        self._cache: dict = {}
        self._cache_ts: Optional[datetime] = None
        self.CACHE_TTL_HOURS = 1

    def _is_cache_valid(self) -> bool:
        if not self._cache_ts:
            return False
        # Use UTC for consistency
        return (datetime.utcnow() - self._cache_ts).total_seconds() < 3600

    # ── Core: build profiles from raw order data ──────────────────

    def calcular_perfiles(self, orders_df: pd.DataFrame) -> list[ClienteMLProfile]:
        """
        orders_df columns required:
          user_id, user_name, created_at, total_amount, balance_due,
          is_paid, items_description, net_income_value
        
        Returns list of ClienteMLProfile, one per unique user_id.
        """
        perfiles = []
        hoy = datetime.utcnow()

        if orders_df.empty:
            return []

        for user_id, grupo in orders_df.groupby("user_id"):
            grupo = grupo.sort_values("created_at")
            user_name = grupo["user_name"].iloc[-1]

            # Basic metrics
            total_ordenes = len(grupo)
            total_gastado = float(np.nan_to_num(grupo["total_amount"].sum(), nan=0.0))
            ticket_promedio = float(np.nan_to_num(grupo["total_amount"].mean(), nan=0.0))
            varianza_ticket = float(np.nan_to_num(grupo["total_amount"].std(), nan=0.0))
            ultimo_pedido = pd.to_datetime(grupo["created_at"].iloc[-1])
            # Ensure naive for comparison with hoy
            ultimo_pedido_naive = ultimo_pedido.to_pydatetime().replace(tzinfo=None)
            dias_sin_orden = (hoy - ultimo_pedido_naive).days

            if total_ordenes > 1:
                fechas = pd.to_datetime(grupo["created_at"])
                # diff() on aware Series works, but output timedelta is same
                deltas = fechas.diff().dropna().dt.days
                frecuencia_promedio_dias = float(deltas.mean()) if not deltas.empty else 30.0
            else:
                frecuencia_promedio_dias = 30.0
            
            frecuencia_promedio_dias = float(np.nan_to_num(frecuencia_promedio_dias, nan=30.0))

            # Trend: compare last 30 days vs previous 30 days
            corte = hoy - timedelta(days=30)
            corte_anterior = hoy - timedelta(days=60)
            
            # Ensure created_at is naive for comparison with corte
            grupo_created_at = pd.to_datetime(grupo["created_at"]).dt.tz_localize(None)
            recientes = grupo[grupo_created_at >= corte]
            anteriores = grupo[
                (grupo_created_at >= corte_anterior) &
                (grupo_created_at < corte)
            ]
            if len(recientes) > len(anteriores):
                tendencia = "creciendo"
            elif len(recientes) < len(anteriores):
                tendencia = "decayendo"
            else:
                tendencia = "estable"

            # Churn score (0.0 to 1.0)
            ratio_ausencia = min(dias_sin_orden / max(frecuencia_promedio_dias, 1), 3.0) / 3.0 if not pd.isna(dias_sin_orden) else 0.5
            ratio_frecuencia = 1.0 - min(
                len(recientes) / max(frecuencia_promedio_dias / 7, 1), 1.0
            ) if frecuencia_promedio_dias > 0 else 0.5
            
            penalizacion_tendencia = 0.2 if tendencia == "decayendo" else 0.0
            
            riesgo_churn = 0.5 * ratio_ausencia + 0.3 * ratio_frecuencia + 0.2 * penalizacion_tendencia
            riesgo_churn = min(max(float(np.nan_to_num(riesgo_churn, nan=0.5)), 0.0), 1.0)
            riesgo_churn = round(riesgo_churn, 2)

            if riesgo_churn < 0.35:
                churn_categoria = "bajo"
            elif riesgo_churn < 0.65:
                churn_categoria = "medio"
            else:
                churn_categoria = "alto"

            # LTV projection: ticket_promedio * (365 / frecuencia) * 0.8 retention factor
            ltv = ticket_promedio * (365.0 / max(frecuencia_promedio_dias, 1)) * 0.8
            
            # Ensure no NaN gets through
            ticket_promedio = float(np.nan_to_num(ticket_promedio, nan=0.0))
            varianza_ticket = float(np.nan_to_num(varianza_ticket, nan=0.0))
            ltv = float(np.nan_to_num(ltv, nan=0.0))
            dias_sin_orden = int(np.nan_to_num(dias_sin_orden, nan=0))

            # RFM Segmentation
            # R: days since last order (lower = better), scored 1-5
            r_score = 5 if dias_sin_orden <= 15 else (
                      4 if dias_sin_orden <= 30 else (
                      3 if dias_sin_orden <= 60 else (
                      2 if dias_sin_orden <= 90 else 1)))
            # F: total orders, scored 1-5
            f_score = 5 if total_ordenes >= 20 else (
                      4 if total_ordenes >= 10 else (
                      3 if total_ordenes >= 5 else (
                      2 if total_ordenes >= 2 else 1)))
            # M: total spent, scored 1-5 (relative thresholds)
            m_score = 5 if total_gastado >= 500000 else (
                      4 if total_gastado >= 200000 else (
                      3 if total_gastado >= 100000 else (
                      2 if total_gastado >= 50000 else 1)))

            rfm = r_score + f_score + m_score
            if rfm >= 13:
                segmento_rfm = "campeon"
            elif rfm >= 10:
                segmento_rfm = "leal"
            elif rfm >= 7:
                segmento_rfm = "en_riesgo"
            elif r_score <= 2:
                segmento_rfm = "perdido"
            else:
                segmento_rfm = "nuevo"

            # Top services from items_description
            servicios_favoritos = []  

            # Discount suggestion
            descuento_sugerido = None
            razon_descuento = None
            if churn_categoria == "alto" and ltv > 50000:
                descuento_sugerido = 15.0
                razon_descuento = f"Cliente frecuente con {dias_sin_orden} días sin visitar. LTV alto."
            elif churn_categoria == "medio" and tendencia == "decayendo":
                descuento_sugerido = 10.0
                razon_descuento = f"Tendencia decreciente. Última visita hace {dias_sin_orden} días."
            elif segmento_rfm == "leal" and dias_sin_orden > 20:
                descuento_sugerido = 8.0
                razon_descuento = f"Cliente leal que empieza a espaciar visitas."

            perfiles.append(ClienteMLProfile(
                user_id=int(user_id),
                user_name=user_name,
                frecuencia_promedio_dias=round(frecuencia_promedio_dias, 1),
                ticket_promedio=round(ticket_promedio, 0),
                varianza_ticket=round(varianza_ticket, 0),
                servicios_favoritos=servicios_favoritos,
                tendencia=tendencia,
                riesgo_churn=riesgo_churn,
                churn_categoria=churn_categoria,
                lifetime_value_estimado=round(ltv, 0),
                dias_sin_orden=dias_sin_orden,
                total_ordenes=int(total_ordenes),
                total_gastado=float(np.nan_to_num(round(total_gastado, 0), nan=0.0)),
                ultimo_pedido=ultimo_pedido_naive,
                segmento_rfm=segmento_rfm,
                descuento_sugerido=descuento_sugerido,
                razon_descuento=razon_descuento,
            ))

        return perfiles

    # ── Demand Forecaster ─────────────────────────────────────────

    def forecast_demanda(self, orders_df: pd.DataFrame, semanas: int = 4) -> list[dict]:
        """
        Returns weekly demand forecast for next N weeks.
        Uses Exponential Moving Average + decay factor.
        """
        if orders_df.empty:
            return []

        orders_df["semana"] = pd.to_datetime(orders_df["created_at"]).dt.to_period("W")
        semanal = orders_df.groupby("semana").size().reset_index(name="ordenes")

        if len(semanal) < 2:
            return []

        valores = semanal["ordenes"].values.astype(float)
        alpha = 0.3
        ema = valores[0]
        for v in valores[1:]:
            ema = alpha * v + (1 - alpha) * ema

        forecast = []
        ultima_semana = pd.Period(semanal["semana"].iloc[-1], freq="W")
        ema = float(np.nan_to_num(ema, nan=0.0))
        
        for i in range(1, semanas + 1):
            semana_futura = ultima_semana + i
            # slight decay factor for uncertainty
            estimado = round(ema * (0.95 ** i))
            optimista = round(estimado * 1.2)
            pesimista = round(estimado * 0.8)
            forecast.append({
                "semana": str(semana_futura),
                "estimado": int(np.nan_to_num(estimado, nan=0)),
                "optimista": int(np.nan_to_num(optimista, nan=0)),
                "pesimista": int(np.nan_to_num(pesimista, nan=0)),
            })
        return forecast

    # ── Financial Summary ─────────────────────────────────────────

    def calcular_income_neto(
        self,
        orders_df: pd.DataFrame,
        gastos_df: pd.DataFrame,
        periodo_actual: tuple,   # (fecha_inicio, fecha_fin) datetime
        periodo_anterior: tuple,
    ) -> dict:
        """
        Returns net income comparison between two periods.
        income_neto = sum(net_income_value from orders) - sum(spent_value from gastos)
        """
        def filtrar(df, col, inicio, fin):
            if df.empty:
                return df
            # Convert series to naive to match inicio/fin inputs
            series_naive = pd.to_datetime(df[col]).dt.tz_localize(None)
            mask = (series_naive >= inicio) & (series_naive <= fin)
            return df[mask]

        # Current period
        ord_actual = filtrar(orders_df, "created_at", *periodo_actual)
        gas_actual = filtrar(gastos_df, "spent_date", *periodo_actual)
        ingresos_actual = ord_actual["net_income_value"].sum() if not ord_actual.empty else 0.0
        egresos_actual = gas_actual["spent_value"].sum() if not gas_actual.empty else 0.0
        neto_actual = ingresos_actual - egresos_actual

        # Previous period
        ord_anterior = filtrar(orders_df, "created_at", *periodo_anterior)
        gas_anterior = filtrar(gastos_df, "spent_date", *periodo_anterior)
        ingresos_anterior = ord_anterior["net_income_value"].sum() if not ord_anterior.empty else 0.0
        egresos_anterior = gas_anterior["spent_value"].sum() if not gas_anterior.empty else 0.0
        neto_anterior = ingresos_anterior - egresos_anterior

        # % change
        def pct_change(actual, anterior):
            if anterior == 0:
                return 0.0 if actual != 0 else 0.0
            return round(((actual - anterior) / abs(anterior)) * 100, 1)

        # Historico mensual (last 12 months for chart)
        hoy = datetime.utcnow()
        historico = []
        for i in range(11, -1, -1):
            # Calculate month and year exactly
            month_idx = (hoy.month - 1 - i) % 12
            year_offset = (hoy.month - 1 - i) // 12
            month_val = month_idx + 1
            year_val = hoy.year + year_offset
            
            m_start = datetime(year_val, month_val, 1)
            
            # Find next month start for m_end
            if month_val == 12:
                m_end = datetime(year_val + 1, 1, 1) - timedelta(seconds=1)
            else:
                m_end = datetime(year_val, month_val + 1, 1) - timedelta(seconds=1)
            
            o_m = filtrar(orders_df, "created_at", m_start, m_end)
            g_m = filtrar(gastos_df, "spent_date", m_start, m_end)
            
            ing = o_m["net_income_value"].sum() if not o_m.empty else 0.0
            egr = g_m["spent_value"].sum() if not g_m.empty else 0.0
            
            historico.append({
                "mes": m_start.strftime("%b %y").lower(),
                "ingresos": float(np.nan_to_num(round(ing, 0), nan=0.0)),
                "egresos": float(np.nan_to_num(round(egr, 0), nan=0.0)),
                "neto": float(np.nan_to_num(round(ing - egr, 0), nan=0.0))
            })

        return {
            "periodo_actual": {
                "ingresos": round(ingresos_actual, 0),
                "egresos": round(egresos_actual, 0),
                "neto": round(neto_actual, 0),
            },
            "periodo_anterior": {
                "ingresos": round(ingresos_anterior, 0),
                "egresos": round(egresos_anterior, 0),
                "neto": round(neto_anterior, 0),
            },
            "cambio_pct": {
                "ingresos": pct_change(ingresos_actual, ingresos_anterior),
                "egresos": pct_change(egresos_actual, egresos_anterior),
                "neto": pct_change(neto_actual, neto_anterior),
            },
            "historico_mensual": historico
        }

    # ── Retention & Churn Cohort ──────────────────────────────────

    def calcular_retencion(self, orders_df: pd.DataFrame) -> dict:
        """
        Monthly retention rate + churn rate for last 6 months.
        """
        if orders_df.empty:
            return {"meses": []}

        # Ensure naive for frequency conversion
        orders_df["mes"] = pd.to_datetime(orders_df["created_at"]).dt.tz_localize(None).dt.to_period("M")
        meses = sorted(orders_df["mes"].unique())[-6:]

        resultado = []
        for i, mes in enumerate(meses):
            clientes_mes = set(orders_df[orders_df["mes"] == mes]["user_id"])
            if i == 0:
                resultado.append({
                    "mes": str(mes),
                    "activos": len(clientes_mes),
                    "retencion_pct": None,
                    "churn_pct": None,
                })
                continue
            clientes_anterior = set(orders_df[orders_df["mes"] == meses[i-1]]["user_id"])
            if not clientes_anterior:
                resultado.append({
                    "mes": str(mes),
                    "activos": len(clientes_mes),
                    "retencion_pct": None,
                    "churn_pct": None,
                })
                continue
                
            retenidos = clientes_mes & clientes_anterior
            retencion = round(len(retenidos) / len(clientes_anterior) * 100, 1)
            churn = round(100 - retencion, 1)
            resultado.append({
                "mes": str(mes),
                "activos": len(clientes_mes),
                "retencion": retencion,
                "churn": churn,
            })

        return {"historico": resultado}


# ── Module-level cache per tenant ─────────────────────────────────
_engines: dict[int, MLEngine] = {}

def get_engine(tenant_id: int) -> MLEngine:
    if tenant_id not in _engines:
        _engines[tenant_id] = MLEngine(tenant_id)
    return _engines[tenant_id]
