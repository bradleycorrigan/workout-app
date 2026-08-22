import os
import asyncio
import json
import uuid
from calendar import monthrange
from contextlib import asynccontextmanager
from datetime import date
from typing import Any, AsyncIterator

import asyncpg
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from dotenv import load_dotenv
from fastapi import FastAPI, Form, Query, Request
from fastapi.middleware.gzip import GZipMiddleware
from fastapi import HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.types import Scope

from concentration import calculate_concentration

load_dotenv()

DATABASE_URL = os.environ.get("DATABASE_URL")
USER_ID = os.environ.get("USER_ID")

if DATABASE_URL is None:
    raise RuntimeError("Missing DATABASE_URL in environment.")
if USER_ID is None:
    raise RuntimeError("Missing USER_ID in environment.")

WORKOUT_PRICES_GBP: dict[str, float] = {
    "gym_kgx": 13.6,
    "gym": 15.0,
    "lido_swim": 6.4,
    "swim_kgx": 8.1,
    "swim": 6.8,
    "sauna": 18.7,
    "reservoir": 13.15,
}

WORKOUT_DISPLAY: dict[str, str] = {
    "gym": "Gym",
    "gym_kgx": "Gym KGX",
    "swim": "Pool Swim",
    "swim_kgx": "Pool Swim KGX",
    "lido_swim": "Lido Swim",
    "reservoir": "Reservoir Swim",
    "sauna": "Sauna",
}

WORKOUT_SHORT_DISPLAY: dict[str, str] = {
    "gym": "Gym",
    "gym_kgx": "Gym KGX",
    "swim": "Pool",
    "swim_kgx": "Pool KGX",
    "lido_swim": "Lido",
    "reservoir": "Reservoir",
    "sauna": "Sauna",
}

DB_POOL: asyncpg.Pool | None = None


class CachedStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope: Scope) -> Any:
        response = await super().get_response(path, scope)
        method = scope.get("method", "GET")
        if method in {"GET", "HEAD"} and getattr(response, "status_code", 0) == 200:
            if path.startswith("v2/"):
                response.headers.setdefault("Cache-Control", "public, max-age=86400")
            else:
                response.headers.setdefault("Cache-Control", "public, max-age=3600")
        return response


async def ensure_performance_indexes(conn: Any) -> None:
    index_specs = [
        ("workouts", "idx_workouts_user_date", "user_id, workout_date"),
        ("weigh_ins", "idx_weigh_ins_user_date", "user_id, weigh_date"),
        ("injections", "idx_injections_user_date", "user_id, injection_date"),
    ]

    for table_name, index_name, columns in index_specs:
        exists = await conn.fetchval("SELECT to_regclass($1)", f"public.{table_name}")
        if exists is None:
            continue
        await conn.execute(f"CREATE INDEX IF NOT EXISTS {index_name} ON {table_name} ({columns})")


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    global DB_POOL
    DB_POOL = await asyncpg.create_pool(
        DATABASE_URL,
        statement_cache_size=0,
        min_size=1,
        max_size=10,
    )
    async with DB_POOL.acquire() as conn:
        await ensure_performance_indexes(conn)
    try:
        yield
    finally:
        if DB_POOL is not None:
            await DB_POOL.close()
            DB_POOL = None


app = FastAPI(title="Workout Dashboard", lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=1024)
app.mount("/static", CachedStaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

THEME = {
    "bg": "rgba(253, 246, 227, 0.68)",
    "panel": "rgba(255, 255, 255, 0.35)",
    "ink": "#10363f",
    "grid": "rgba(88, 110, 117, 0.2)",
    "green": "#2f6f4f",
}
CHART_TITLE_SIZE = 16


def is_mobile_request(request: Request, mobile: str | None) -> bool:
    if mobile is not None:
        normalized = mobile.strip().lower()
        return normalized in {"1", "true", "yes", "y", "mobile"}

    user_agent = request.headers.get("user-agent", "").lower()
    mobile_tokens = ["iphone", "android", "mobile", "ipad", "ipod"]
    return any(token in user_agent for token in mobile_tokens)


def render_chart_response(fig: go.Figure, mobile: bool, chart_kind: str = "default") -> HTMLResponse:
    base_config: dict[str, Any] = {
        "responsive": True,
        "displaylogo": False,
        "scrollZoom": False,
        "doubleClick": "reset",
        "modeBarButtonsToRemove": [
            "lasso2d",
            "select2d",
            "autoScale2d",
            "toggleSpikelines",
        ],
    }

    if mobile:
        fig.update_layout(
            height=330 if chart_kind != "heatmap" else 380,
            margin=dict(l=12, r=10, t=48, b=36),
            font=dict(size=13),
            legend=dict(font=dict(size=10)),
        )
        fig.update_xaxes(automargin=True, tickfont=dict(size=11), title_font=dict(size=12))
        fig.update_yaxes(automargin=True, tickfont=dict(size=11), title_font=dict(size=12))
        base_config["displayModeBar"] = False
        base_config["showTips"] = False
    else:
        base_config["displayModeBar"] = "hover"

    html = fig.to_html(
        full_html=False,
        include_plotlyjs=False,
        config=base_config,
    )
    return HTMLResponse(html)


def render_echarts_response(option: dict[str, Any], height: int = 340) -> HTMLResponse:
        chart_id = f"echart-{uuid.uuid4().hex}"
        option_json = json.dumps(option)
        html = f"""
<div id="{chart_id}" class="echart-canvas" style="height:{height}px;"></div>
<script>
(() => {{
    const el = document.getElementById('{chart_id}');
    if (!el || !window.echarts) return;
    const chart = echarts.init(el, null, {{ renderer: 'canvas' }});
    const option = {option_json};
    chart.setOption(option);
    const resize = () => chart.resize();
    if (window.ResizeObserver) {{
        const ro = new ResizeObserver(resize);
        ro.observe(el);
    }}
    window.addEventListener('resize', resize, {{ passive: true }});
}})();
</script>
"""
        return HTMLResponse(html)


async def get_connection() -> Any:
    if DB_POOL is not None:
        return await DB_POOL.acquire()
    return await asyncpg.connect(DATABASE_URL, statement_cache_size=0)


async def release_connection(conn: Any) -> None:
    if DB_POOL is not None:
        await DB_POOL.release(conn)
        return
    await conn.close()


def apply_default_insights_window(start_date: date | None, end_date: date | None) -> tuple[date | None, date | None]:
    if start_date is not None or end_date is not None:
        return start_date, end_date

    today = date.today()
    year = today.year
    month = today.month - 2
    while month <= 0:
        month += 12
        year -= 1

    return date(year, month, 1), today


def rows_to_dicts(rows: list[Any]) -> list[dict[str, Any]]:
    return [dict(r) for r in rows]


def workout_bucket(workout_type: str) -> str:
    if workout_type in {"gym", "gym_kgx"}:
        return "Gym"
    if workout_type in {"swim", "swim_kgx"}:
        return "Pool Swim"
    return "Lido/Res Swim"


def normalize_exercise_filter(exercise: str | None) -> str:
    if not exercise:
        return "all"
    normalized = exercise.strip().lower()
    allowed = {"all", "gym", "pool_swim", "lido_res_swim"}
    return normalized if normalized in allowed else "all"


def compact_workout_label(workout_types: list[str], mobile: bool) -> str:
    labels: list[str] = []
    for workout_type in workout_types:
        short = WORKOUT_SHORT_DISPLAY.get(str(workout_type), str(workout_type))
        if short not in labels:
            labels.append(short)

    if not labels:
        return ""
    if mobile:
        return labels[0] if len(labels) == 1 else f"{labels[0]} +"
    if len(labels) <= 2:
        return " + ".join(labels)
    return f"{labels[0]} +{len(labels) - 1}"


def to_iso(d: date | None) -> str | None:
    return d.isoformat() if d is not None else None


def build_monthly_summary_rows(df: pd.DataFrame) -> list[dict[str, Any]]:
    by_month = df.groupby("month", as_index=False).agg(
        value_gbp=("workout_value_gbp", "sum"),
        workout_days=("workout_date", lambda s: s.dt.date.nunique()),
        total_sessions=("workout_type", "count"),
    )

    by_type = (
        df.groupby(["month", "bucket"])
        .size()
        .unstack(fill_value=0)
        .reset_index()
    )
    for col in ["Gym", "Pool Swim", "Lido/Res Swim"]:
        if col not in by_type.columns:
            by_type[col] = 0

    merged = by_month.merge(by_type[["month", "Gym", "Pool Swim", "Lido/Res Swim"]], on="month", how="left")

    def adherence_pct(month_str: str, workout_days: int) -> float:
        y, m = month_str.split("-")
        return round((workout_days / monthrange(int(y), int(m))[1]) * 100.0, 2)

    merged["adherence_pct"] = merged.apply(
        lambda r: adherence_pct(str(r["month"]), int(r["workout_days"])),
        axis=1,
    )
    merged = merged.sort_values("month", ascending=False)

    rows: list[dict[str, Any]] = []
    for _, row in merged.iterrows():
        rows.append(
            {
                "month": str(row["month"]),
                "value_gbp": float(row["value_gbp"]),
                "adherence_pct": float(row["adherence_pct"]),
                "workout_days": int(row["workout_days"]),
                "total_sessions": int(row["total_sessions"]),
                "gym": int(row["Gym"]),
                "pool_swim": int(row["Pool Swim"]),
                "lido_res_swim": int(row["Lido/Res Swim"]),
            }
        )
    return rows


def apply_date_window(df: pd.DataFrame, date_col: str, start_date: date | None, end_date: date | None) -> pd.DataFrame:
    if start_date is not None:
        df = df[df[date_col] >= pd.Timestamp(start_date)]
    if end_date is not None:
        df = df[df[date_col] <= pd.Timestamp(end_date)]
    return df


def apply_workout_exercise_filter(df: pd.DataFrame, exercise: str) -> pd.DataFrame:
    if exercise == "all":
        return df
    bucket_map = {
        "gym": "Gym",
        "pool_swim": "Pool Swim",
        "lido_res_swim": "Lido/Res Swim",
    }
    return df[df["bucket"] == bucket_map[exercise]]


def apply_chart_theme(fig: go.Figure, title: str, y_title: str = "") -> go.Figure:
    fig.update_layout(
        title=dict(
            text=title,
            x=0.02,
            xanchor="left",
            y=0.98,
            yanchor="top",
            font=dict(family="Fraunces, Georgia, serif", size=CHART_TITLE_SIZE, color=THEME["ink"]),
        ),
        margin=dict(l=18, r=18, t=58, b=40),
        height=360,
        paper_bgcolor=THEME["bg"],
        plot_bgcolor=THEME["panel"],
        font=dict(color=THEME["ink"], size=15, family="Inter, Avenir Next, Segoe UI, sans-serif"),
        legend=dict(
            bgcolor="rgba(255,255,255,0.35)",
            bordercolor="rgba(47,111,79,0.25)",
            borderwidth=1,
            orientation="h",
            yanchor="bottom",
            y=1.03,
            xanchor="left",
            x=0,
            font=dict(size=11),
        ),
    )
    fig.update_xaxes(showgrid=True, gridcolor=THEME["grid"], zeroline=False)
    fig.update_yaxes(showgrid=True, gridcolor=THEME["grid"], zeroline=False, title=y_title)
    return fig


@app.get("/legacy", include_in_schema=False)
async def home_legacy() -> None:
    raise HTTPException(status_code=410, detail="Legacy mode has been sunset. Use '/' or '/insights'.")


@app.get("/", response_class=HTMLResponse)
async def home_log(request: Request) -> HTMLResponse:
    return templates.TemplateResponse(request=request, name="v2_log.html", context={"request": request})


@app.get("/insights", response_class=HTMLResponse)
@app.get("/v2", response_class=HTMLResponse)
async def home_insights(request: Request) -> HTMLResponse:
    return templates.TemplateResponse(request=request, name="v2.html", context={"request": request})


@app.get("/api/summary")
async def dashboard_summary() -> dict[str, Any]:
    conn = await get_connection()
    try:
        summary_row = await conn.fetchrow(
            """
            SELECT
                TO_CHAR(CURRENT_DATE, 'Mon YYYY') AS month_label,
                (
                    SELECT COUNT(*)
                    FROM workouts
                    WHERE user_id = $1
                      AND workout_date >= DATE_TRUNC('month', CURRENT_DATE)::date
                      AND workout_date < (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month')::date
                ) AS month_workouts,
                (
                    SELECT COUNT(*)
                    FROM weigh_ins
                    WHERE user_id = $1
                      AND weigh_date >= DATE_TRUNC('month', CURRENT_DATE)::date
                      AND weigh_date < (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month')::date
                ) AS month_weigh_ins,
                (
                    SELECT ROUND(COALESCE(SUM(workout_value_gbp), 0)::numeric, 2)
                    FROM workouts
                    WHERE user_id = $1
                      AND workout_date >= DATE_TRUNC('month', CURRENT_DATE)::date
                      AND workout_date < (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month')::date
                ) AS month_value_gbp
            """,
            USER_ID,
        )
    finally:
        await release_connection(conn)

    if summary_row is None:
        return {
            "month_label": "",
            "month_workouts": 0,
            "month_weigh_ins": 0,
            "month_value_gbp": 0.0,
        }

    return {
        "month_label": str(summary_row["month_label"]),
        "month_workouts": int(summary_row["month_workouts"]),
        "month_weigh_ins": int(summary_row["month_weigh_ins"]),
        "month_value_gbp": float(summary_row["month_value_gbp"]),
    }


@app.post("/weigh-ins", response_class=HTMLResponse)
async def add_weigh_in(
    request: Request,
    weigh_date: date = Form(...),
    weight_kg: float = Form(...),
) -> HTMLResponse:
    conn = await get_connection()
    try:
        await conn.execute(
            "INSERT INTO weigh_ins (user_id, weigh_date, weight_kg) VALUES ($1, $2, $3)",
            USER_ID,
            weigh_date,
            weight_kg,
        )
    finally:
        await release_connection(conn)

    return templates.TemplateResponse(
        request=request,
        name="_save_success.html",
        context={"request": request, "message": f"Logged {weight_kg:.1f} kg"},
    )


@app.post("/injections", response_class=HTMLResponse)
async def add_injection(
    request: Request,
    injection_date: date = Form(...),
    dose_mg: float = Form(...),
) -> HTMLResponse:
    conn = await get_connection()
    try:
        await conn.execute(
            "INSERT INTO injections (user_id, injection_date, dose_mg) VALUES ($1, $2, $3)",
            USER_ID,
            injection_date,
            dose_mg,
        )
    finally:
        await release_connection(conn)

    return templates.TemplateResponse(
        request=request,
        name="_save_success.html",
        context={"request": request, "message": f"Logged {dose_mg:.2f} mg"},
    )


@app.post("/workouts", response_class=HTMLResponse)
async def add_workout(
    request: Request,
    workout_date: date = Form(...),
    workout_types: list[str] = Form(...),
) -> HTMLResponse:
    conn = await get_connection()
    try:
        for workout_type in workout_types:
            if workout_type not in WORKOUT_PRICES_GBP:
                raise HTTPException(status_code=400, detail=f"Unsupported workout type: {workout_type}")
            workout_value_gbp = WORKOUT_PRICES_GBP[workout_type]
            await conn.execute(
                """
                INSERT INTO workouts (user_id, workout_date, workout_type, workout_value_gbp)
                VALUES ($1, $2, $3, $4)
                """,
                USER_ID,
                workout_date,
                workout_type,
                workout_value_gbp,
            )
    finally:
        await release_connection(conn)

    return templates.TemplateResponse(
        request=request,
        name="_save_success.html",
        context={"request": request, "message": f"Logged {len(workout_types)} workout(s)"},
    )


@app.post("/weigh-ins/{weigh_in_id}/delete", response_class=HTMLResponse)
async def delete_weigh_in(request: Request, weigh_in_id: int) -> HTMLResponse:
    conn = await get_connection()
    try:
        deleted = await conn.execute(
            "DELETE FROM weigh_ins WHERE weigh_in_id = $1 AND user_id = $2",
            weigh_in_id,
            USER_ID,
        )
    finally:
        await release_connection(conn)

    if deleted == "DELETE 0":
        raise HTTPException(status_code=404, detail="Weigh-in not found.")

    return templates.TemplateResponse(
        request=request,
        name="_save_success.html",
        context={"request": request, "message": "Deleted weigh-in"},
    )


@app.post("/weigh-ins/{weigh_in_id}/edit", response_class=HTMLResponse)
async def edit_weigh_in(
    request: Request,
    weigh_in_id: int,
    weigh_date: date = Form(...),
    weight_kg: float = Form(...),
) -> HTMLResponse:
    conn = await get_connection()
    try:
        updated = await conn.execute(
            """
            UPDATE weigh_ins
            SET weigh_date = $1, weight_kg = $2
            WHERE weigh_in_id = $3 AND user_id = $4
            """,
            weigh_date,
            weight_kg,
            weigh_in_id,
            USER_ID,
        )
    finally:
        await release_connection(conn)

    if updated == "UPDATE 0":
        raise HTTPException(status_code=404, detail="Weigh-in not found.")

    return templates.TemplateResponse(
        request=request,
        name="_save_success.html",
        context={"request": request, "message": "Updated weigh-in"},
    )


@app.post("/injections/{injection_id}/delete", response_class=HTMLResponse)
async def delete_injection(request: Request, injection_id: int) -> HTMLResponse:
    conn = await get_connection()
    try:
        deleted = await conn.execute(
            "DELETE FROM injections WHERE injection_id = $1 AND user_id = $2",
            injection_id,
            USER_ID,
        )
    finally:
        await release_connection(conn)

    if deleted == "DELETE 0":
        raise HTTPException(status_code=404, detail="Injection not found.")

    return templates.TemplateResponse(
        request=request,
        name="_save_success.html",
        context={"request": request, "message": "Deleted injection"},
    )


@app.post("/injections/{injection_id}/edit", response_class=HTMLResponse)
async def edit_injection(
    request: Request,
    injection_id: int,
    injection_date: date = Form(...),
    dose_mg: float = Form(...),
) -> HTMLResponse:
    conn = await get_connection()
    try:
        updated = await conn.execute(
            """
            UPDATE injections
            SET injection_date = $1, dose_mg = $2
            WHERE injection_id = $3 AND user_id = $4
            """,
            injection_date,
            dose_mg,
            injection_id,
            USER_ID,
        )
    finally:
        await release_connection(conn)

    if updated == "UPDATE 0":
        raise HTTPException(status_code=404, detail="Injection not found.")

    return templates.TemplateResponse(
        request=request,
        name="_save_success.html",
        context={"request": request, "message": "Updated injection"},
    )


@app.post("/workouts/{workout_id}/delete", response_class=HTMLResponse)
async def delete_workout(request: Request, workout_id: int) -> HTMLResponse:
    conn = await get_connection()
    try:
        deleted = await conn.execute(
            "DELETE FROM workouts WHERE workout_id = $1 AND user_id = $2",
            workout_id,
            USER_ID,
        )
    finally:
        await release_connection(conn)

    if deleted == "DELETE 0":
        raise HTTPException(status_code=404, detail="Workout not found.")

    return templates.TemplateResponse(
        request=request,
        name="_save_success.html",
        context={"request": request, "message": "Deleted workout"},
    )


@app.post("/workouts/{workout_id}/edit", response_class=HTMLResponse)
async def edit_workout(
    request: Request,
    workout_id: int,
    workout_date: date = Form(...),
    workout_type: str = Form(...),
) -> HTMLResponse:
    if workout_type not in WORKOUT_PRICES_GBP:
        raise HTTPException(status_code=400, detail=f"Unsupported workout type: {workout_type}")

    conn = await get_connection()
    try:
        updated = await conn.execute(
            """
            UPDATE workouts
            SET workout_date = $1,
                workout_type = $2,
                workout_value_gbp = $3
            WHERE workout_id = $4 AND user_id = $5
            """,
            workout_date,
            workout_type,
            WORKOUT_PRICES_GBP[workout_type],
            workout_id,
            USER_ID,
        )
    finally:
        await release_connection(conn)

    if updated == "UPDATE 0":
        raise HTTPException(status_code=404, detail="Workout not found.")

    return templates.TemplateResponse(
        request=request,
        name="_save_success.html",
        context={"request": request, "message": "Updated workout"},
    )


@app.get("/charts/concentration", response_class=HTMLResponse)
async def concentration_chart(
    request: Request,
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    exercise: str = Query(default="all"),
    mobile: str | None = Query(default=None),
) -> HTMLResponse:
    conn = await get_connection()
    try:
        rows = await conn.fetch(
            """
            SELECT injection_date, dose_mg
            FROM injections
            WHERE user_id = $1
            ORDER BY injection_date;
            """,
            USER_ID,
        )
    finally:
        await release_connection(conn)

    if not rows:
        return HTMLResponse("<p>No injection data yet.</p>")

    df = pd.DataFrame(rows_to_dicts(rows))
    df["injection_date"] = pd.to_datetime(df["injection_date"])
    df = apply_date_window(df, "injection_date", start_date, end_date)
    if df.empty:
        return HTMLResponse("<p>No injection data for the selected filters.</p>")

    _ = normalize_exercise_filter(exercise)
    curve = calculate_concentration(df, days_forecast=21).sort_values("date")
    is_mobile = is_mobile_request(request, mobile)
    series_data = [
        [d.strftime("%Y-%m-%d"), float(v)]
        for d, v in zip(curve["date"], curve["estimated_concentration"])
    ]
    option: dict[str, Any] = {
        "backgroundColor": "transparent",
        "animationDuration": 500,
        "title": {
            "text": "Estimated Concentration",
            "left": 0,
            "top": 0,
            "textStyle": {"fontSize": 16 if is_mobile else 18, "fontWeight": 700, "color": "#16313a"},
        },
        "grid": {"left": 14, "right": 14, "top": 48, "bottom": 32, "containLabel": True},
        "tooltip": {"trigger": "axis"},
        "xAxis": {
            "type": "time",
            "axisLabel": {"fontSize": 11 if is_mobile else 12, "hideOverlap": True},
        },
        "yAxis": {
            "type": "value",
            "name": "Estimated level",
            "nameTextStyle": {"fontSize": 11 if is_mobile else 12},
            "splitLine": {"lineStyle": {"color": "rgba(88,110,117,0.22)"}},
        },
        "series": [
            {
                "name": "Estimated Concentration",
                "type": "line",
                "smooth": 0.35,
                "showSymbol": not is_mobile,
                "symbolSize": 6,
                "lineStyle": {"width": 3, "color": "#1f5a3f"},
                "areaStyle": {"color": "rgba(47,111,79,0.14)"},
                "data": series_data,
            }
        ],
    }
    return render_echarts_response(option, height=320 if is_mobile else 360)


@app.get("/charts/weight-trend", response_class=HTMLResponse)
async def weight_trend_chart(
    request: Request,
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    exercise: str = Query(default="all"),
    mobile: str | None = Query(default=None),
) -> HTMLResponse:
    conn = await get_connection()
    try:
        rows = await conn.fetch(
            """
            SELECT weigh_date, weight_kg
            FROM weigh_ins
            WHERE user_id = $1
            ORDER BY weigh_date;
            """,
            USER_ID,
        )
    finally:
        await release_connection(conn)

    if not rows:
        return HTMLResponse("<p>No weight data yet.</p>")

    df = pd.DataFrame(rows_to_dicts(rows))
    if df.empty:
        return HTMLResponse("<p>Not enough weight data yet.</p>")

    df["weigh_date"] = pd.to_datetime(df["weigh_date"])
    df = apply_date_window(df, "weigh_date", start_date, end_date)
    df["weight_kg"] = pd.to_numeric(df["weight_kg"], errors="coerce")
    df = df.sort_values("weigh_date").dropna(subset=["weight_kg"]).reset_index(drop=True)
    if df.empty:
        return HTMLResponse("<p>No weight data for the selected filters.</p>")

    _ = normalize_exercise_filter(exercise)
    df["delta"] = df["weight_kg"].diff().fillna(0).round(1)

    min_w = float(df["weight_kg"].min())
    max_w = float(df["weight_kg"].max())
    y_min = int((min_w - 2) // 5 * 5)
    y_max = int((max_w + 2 + 4) // 5 * 5)

    is_mobile = is_mobile_request(request, mobile)
    series_data = [
        [d.strftime("%Y-%m-%d"), float(v)]
        for d, v in zip(df["weigh_date"], df["weight_kg"])
    ]
    option: dict[str, Any] = {
        "backgroundColor": "transparent",
        "animationDuration": 450,
        "title": {
            "text": "Weight Trend",
            "left": 0,
            "top": 0,
            "textStyle": {"fontSize": 16 if is_mobile else 18, "fontWeight": 700, "color": "#16313a"},
        },
        "grid": {"left": 14, "right": 14, "top": 48, "bottom": 34, "containLabel": True},
        "tooltip": {"trigger": "axis"},
        "xAxis": {
            "type": "time",
            "axisLabel": {"fontSize": 11 if is_mobile else 12, "hideOverlap": True},
        },
        "yAxis": {
            "type": "value",
            "min": y_min,
            "max": y_max,
            "interval": 5,
            "splitLine": {"lineStyle": {"color": "rgba(88,110,117,0.22)"}},
        },
        "series": [
            {
                "name": "Weight",
                "type": "line",
                "smooth": 0.35,
                "showSymbol": not is_mobile,
                "symbol": "circle",
                "symbolSize": 6,
                "lineStyle": {"width": 3, "color": "#1e355b"},
                "areaStyle": {"color": "rgba(100,144,199,0.18)"},
                "data": series_data,
            }
        ],
    }
    return render_echarts_response(option, height=320 if is_mobile else 360)


@app.get("/charts/workout-heatmap", response_class=HTMLResponse)
async def workout_heatmap_chart(
    request: Request,
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    exercise: str = Query(default="all"),
    mobile: str | None = Query(default=None),
) -> HTMLResponse:
    conn = await get_connection()
    try:
        rows = await conn.fetch(
            """
            SELECT workout_date, workout_type, COALESCE(workout_value_gbp, 0) AS workout_value_gbp
            FROM workouts
            WHERE user_id = $1
            ORDER BY workout_date;
            """,
            USER_ID,
        )
    finally:
        await release_connection(conn)

    if not rows:
        return HTMLResponse("<p>No workout data yet.</p>")

    selected_exercise = normalize_exercise_filter(exercise)
    df = pd.DataFrame(rows_to_dicts(rows))
    df["workout_date"] = pd.to_datetime(df["workout_date"])
    df["workout_value_gbp"] = pd.to_numeric(df["workout_value_gbp"], errors="coerce").fillna(0.0)
    df = apply_date_window(df, "workout_date", start_date, end_date)
    df["bucket"] = df["workout_type"].apply(workout_bucket)
    df = apply_workout_exercise_filter(df, selected_exercise)
    if df.empty:
        return HTMLResponse("<p>No workout data for the selected filters.</p>")

    is_mobile = is_mobile_request(request, mobile)

    df["month"] = df["workout_date"].dt.strftime("%b")
    df["day"] = df["workout_date"].dt.day
    grouped = (
        df.groupby(["month", "day"], as_index=False)
        .size()
        .rename(columns={"size": "count"})
    )
    grouped_labels = (
        df.groupby(["month", "day"])["workout_type"]
        .agg(lambda s: compact_workout_label(s.tolist(), mobile=is_mobile))
        .reset_index(name="label")
    )

    month_order = (
        df.assign(month_key=df["workout_date"].dt.to_period("M").astype(str))
        .sort_values("workout_date")["month"]
        .drop_duplicates()
        .tolist()
    )
    days = list(range(1, 32))

    z = [[0 for _ in month_order] for _ in days]

    month_idx = {m: i for i, m in enumerate(month_order)}
    for _, row in grouped.iterrows():
        m = row["month"]
        d = int(row["day"])
        z[d - 1][month_idx[m]] = int(row["count"])

    max_count = int(grouped["count"].max()) if not grouped.empty else 1
    label_lookup = {
        (str(row["month"]), int(row["day"])): str(row["label"])
        for _, row in grouped_labels.iterrows()
    }
    heatmap_points: list[list[Any]] = []
    for y_idx, day in enumerate(days):
        for x_idx, month in enumerate(month_order):
            count_val = int(z[y_idx][x_idx])
            label = label_lookup.get((month, day), "")
            heatmap_points.append([x_idx, y_idx, count_val, label])

    option = {
        "backgroundColor": "transparent",
        "animation": False,
        "title": {
            "text": "Workout Day Heatmap",
            "left": 0,
            "top": 0,
            "textStyle": {"fontSize": 16 if is_mobile else 18, "fontWeight": 700, "color": "#16313a"},
        },
        "grid": {"left": 10, "right": 10, "top": 44, "bottom": 20, "containLabel": True},
        "tooltip": {"position": "top"},
        "xAxis": {
            "type": "category",
            "data": month_order,
            "splitArea": {"show": False},
            "axisLabel": {"fontSize": 11 if is_mobile else 12},
        },
        "yAxis": {
            "type": "category",
            "data": days,
            "inverse": True,
            "splitArea": {"show": False},
            "axisLabel": {"fontSize": 10 if is_mobile else 11},
        },
        "visualMap": {
            "show": False,
            "min": 0,
            "max": max(1, max_count),
            "inRange": {"color": ["#f6f0db", "#dfeedd", "#b8dcc2", "#6fa783", "#2f6f4f"]},
        },
        "series": [
            {
                "name": "Workouts",
                "type": "heatmap",
                "data": heatmap_points,
                "label": {
                    "show": True,
                    "fontSize": 8 if is_mobile else 10,
                    "color": "#10363f",
                    "formatter": "{@[3]}",
                },
                "emphasis": {"itemStyle": {"shadowBlur": 8, "shadowColor": "rgba(0, 0, 0, 0.2)"}},
            },
        ],
    }
    return render_echarts_response(option, height=380 if is_mobile else 430)


@app.get("/charts/workout-mix", response_class=HTMLResponse)
async def workout_mix_chart(
    request: Request,
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    exercise: str = Query(default="all"),
    mobile: str | None = Query(default=None),
) -> HTMLResponse:
    conn = await get_connection()
    try:
        rows = await conn.fetch(
            """
            SELECT workout_date, workout_type, COALESCE(workout_value_gbp, 0) AS workout_value_gbp
            FROM workouts
            WHERE user_id = $1
            ORDER BY workout_date;
            """,
            USER_ID,
        )
    finally:
        await release_connection(conn)

    if not rows:
        return HTMLResponse("<p>No workout data yet.</p>")

    selected_exercise = normalize_exercise_filter(exercise)
    df = pd.DataFrame(rows_to_dicts(rows))
    df["workout_date"] = pd.to_datetime(df["workout_date"])
    df["workout_value_gbp"] = pd.to_numeric(df["workout_value_gbp"], errors="coerce").fillna(0.0)
    df = apply_date_window(df, "workout_date", start_date, end_date)
    df["month"] = df["workout_date"].dt.to_period("M").astype(str)
    df["bucket"] = df["workout_type"].apply(workout_bucket)
    df = apply_workout_exercise_filter(df, selected_exercise)
    if df.empty:
        return HTMLResponse("<p>No workout data for the selected filters.</p>")

    monthly = (
        df.groupby(["month", "bucket"], as_index=False)
        .size()
        .rename(columns={"size": "count"})
    )
    pivot = monthly.pivot(index="month", columns="bucket", values="count").fillna(0)
    for col in ["Gym", "Pool Swim", "Lido/Res Swim"]:
        if col not in pivot.columns:
            pivot[col] = 0
    pivot = pivot[["Gym", "Pool Swim", "Lido/Res Swim"]]

    month_x = pd.PeriodIndex(pivot.index, freq="M").to_timestamp()
    month_labels = [ts.strftime("%b %y") for ts in month_x]
    totals = pivot.sum(axis=1).replace(0, 1)
    gym_pct = (pivot["Gym"] / totals * 100).round(2).tolist()
    pool_pct = (pivot["Pool Swim"] / totals * 100).round(2).tolist()
    lido_pct = (pivot["Lido/Res Swim"] / totals * 100).round(2).tolist()

    is_mobile = is_mobile_request(request, mobile)
    option = {
        "backgroundColor": "transparent",
        "animationDuration": 500,
        "title": {
            "text": "Workout Mix by Month",
            "left": 0,
            "top": 0,
            "textStyle": {"fontSize": 16 if is_mobile else 18, "fontWeight": 700, "color": "#16313a"},
        },
        "grid": {"left": 14, "right": 14, "top": 50, "bottom": 46, "containLabel": True},
        "tooltip": {"trigger": "axis", "axisPointer": {"type": "line"}},
        "legend": {
            "bottom": 0,
            "left": 0,
            "itemWidth": 12,
            "itemHeight": 8,
            "textStyle": {"fontSize": 10 if is_mobile else 11},
        },
        "xAxis": {
            "type": "category",
            "data": month_labels,
            "axisLabel": {"fontSize": 10 if is_mobile else 11, "hideOverlap": True},
        },
        "yAxis": {
            "type": "value",
            "max": 100,
            "axisLabel": {"formatter": "{value}%"},
            "splitLine": {"lineStyle": {"color": "rgba(88,110,117,0.22)"}},
        },
        "series": [
            {
                "name": "Gym",
                "type": "line",
                "stack": "total",
                "smooth": True,
                "symbol": "none",
                "lineStyle": {"width": 2, "color": "#a8c0e9"},
                "areaStyle": {"color": "rgba(168,192,233,0.35)"},
                "data": gym_pct,
            },
            {
                "name": "Pool Swim",
                "type": "line",
                "stack": "total",
                "smooth": True,
                "symbol": "none",
                "lineStyle": {"width": 2, "color": "#3f85c8"},
                "areaStyle": {"color": "rgba(63,133,200,0.30)"},
                "data": pool_pct,
            },
            {
                "name": "Lido/Res Swim",
                "type": "line",
                "stack": "total",
                "smooth": True,
                "symbol": "none",
                "lineStyle": {"width": 2, "color": "#4f9a80"},
                "areaStyle": {"color": "rgba(79,154,128,0.28)"},
                "data": lido_pct,
            },
        ],
    }
    return render_echarts_response(option, height=320 if is_mobile else 360)


@app.get("/tables/monthly-summary", response_class=HTMLResponse)
async def monthly_summary_table(
    request: Request,
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    exercise: str = Query(default="all"),
) -> HTMLResponse:
    conn = await get_connection()
    try:
        rows = await conn.fetch(
            """
            SELECT workout_date, workout_type, COALESCE(workout_value_gbp, 0) AS workout_value_gbp
            FROM workouts
            WHERE user_id = $1
            ORDER BY workout_date;
            """,
            USER_ID,
        )
    finally:
        await release_connection(conn)

    if not rows:
        return HTMLResponse("<p>No monthly data yet.</p>")

    selected_exercise = normalize_exercise_filter(exercise)
    df = pd.DataFrame(rows_to_dicts(rows))
    df["workout_date"] = pd.to_datetime(df["workout_date"])
    df = apply_date_window(df, "workout_date", start_date, end_date)
    df["month"] = df["workout_date"].dt.to_period("M").astype(str)
    df["bucket"] = df["workout_type"].apply(workout_bucket)
    df = apply_workout_exercise_filter(df, selected_exercise)
    if df.empty:
        return HTMLResponse("<p>No monthly data for the selected filters.</p>")

    df["workout_value_gbp"] = pd.to_numeric(df["workout_value_gbp"], errors="coerce").fillna(0.0)
    table_rows = build_monthly_summary_rows(df)

    return templates.TemplateResponse(
        request=request,
        name="partials/monthly_summary_table.html",
        context={"request": request, "rows": table_rows},
    )


@app.get("/api/insights/concentration")
async def concentration_data(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    exercise: str = Query(default="all"),
) -> dict[str, Any]:
    start_date, end_date = apply_default_insights_window(start_date, end_date)
    conn = await get_connection()
    try:
        rows = await conn.fetch(
            """
            SELECT injection_date, dose_mg
            FROM injections
            WHERE user_id = $1
              AND ($2::date IS NULL OR injection_date >= $2)
              AND ($3::date IS NULL OR injection_date <= $3)
            ORDER BY injection_date;
            """,
            USER_ID,
            start_date,
            end_date,
        )
    finally:
        await release_connection(conn)

    selected_exercise = normalize_exercise_filter(exercise)
    if not rows:
        return {
            "meta": {
                "exercise": selected_exercise,
                "start_date": to_iso(start_date),
                "end_date": to_iso(end_date),
            },
            "points": [],
        }

    df = pd.DataFrame(rows_to_dicts(rows))
    df["injection_date"] = pd.to_datetime(df["injection_date"])
    df = apply_date_window(df, "injection_date", start_date, end_date)
    if df.empty:
        return {
            "meta": {
                "exercise": selected_exercise,
                "start_date": to_iso(start_date),
                "end_date": to_iso(end_date),
            },
            "points": [],
        }

    curve = calculate_concentration(df, days_forecast=21).sort_values("date")
    points = [
        {
            "date": ts.strftime("%Y-%m-%d"),
            "estimated_concentration": float(val),
        }
        for ts, val in zip(curve["date"], curve["estimated_concentration"])
    ]
    curve_lookup = {
        ts.strftime("%Y-%m-%d"): float(val)
        for ts, val in zip(curve["date"], curve["estimated_concentration"])
    }
    injections = [
        {
            "date": ts.strftime("%Y-%m-%d"),
            "dose_mg": float(dose),
            "estimated_concentration": float(curve_lookup.get(ts.strftime("%Y-%m-%d"), 0.0)),
        }
        for ts, dose in zip(df["injection_date"], df["dose_mg"])
    ]
    return {
        "meta": {
            "exercise": selected_exercise,
            "start_date": to_iso(start_date),
            "end_date": to_iso(end_date),
        },
        "points": points,
        "injections": injections,
    }


@app.get("/api/insights/weight-trend")
async def weight_trend_data(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    exercise: str = Query(default="all"),
) -> dict[str, Any]:
    start_date, end_date = apply_default_insights_window(start_date, end_date)
    conn = await get_connection()
    try:
        rows = await conn.fetch(
            """
            SELECT weigh_date, weight_kg
            FROM weigh_ins
            WHERE user_id = $1
              AND ($2::date IS NULL OR weigh_date >= $2)
              AND ($3::date IS NULL OR weigh_date <= $3)
            ORDER BY weigh_date;
            """,
            USER_ID,
            start_date,
            end_date,
        )
    finally:
        await release_connection(conn)

    selected_exercise = normalize_exercise_filter(exercise)
    if not rows:
        return {
            "meta": {
                "exercise": selected_exercise,
                "start_date": to_iso(start_date),
                "end_date": to_iso(end_date),
            },
            "points": [],
        }

    df = pd.DataFrame(rows_to_dicts(rows))
    df["weigh_date"] = pd.to_datetime(df["weigh_date"])
    df = apply_date_window(df, "weigh_date", start_date, end_date)
    df["weight_kg"] = pd.to_numeric(df["weight_kg"], errors="coerce")
    df = df.sort_values("weigh_date").dropna(subset=["weight_kg"]).reset_index(drop=True)
    if df.empty:
        return {
            "meta": {
                "exercise": selected_exercise,
                "start_date": to_iso(start_date),
                "end_date": to_iso(end_date),
            },
            "points": [],
        }

    df["delta"] = df["weight_kg"].diff().fillna(0).round(2)
    weekly_diffs: list[float | None] = []
    for _, row in df.iterrows():
        target_date = row["weigh_date"] - pd.Timedelta(days=7)
        prev = df[df["weigh_date"] <= target_date]
        if prev.empty:
            weekly_diffs.append(None)
        else:
            prev_weight = float(prev.iloc[-1]["weight_kg"])
            weekly_diffs.append(round(float(row["weight_kg"]) - prev_weight, 2))

    latest_weekly_diff = next((val for val in reversed(weekly_diffs) if val is not None), None)
    points = [
        {
            "date": ts.strftime("%Y-%m-%d"),
            "weight_kg": float(weight),
            "delta": float(delta),
            "weekly_diff_kg": weekly,
        }
        for ts, weight, delta, weekly in zip(df["weigh_date"], df["weight_kg"], df["delta"], weekly_diffs)
    ]
    return {
        "meta": {
            "exercise": selected_exercise,
            "start_date": to_iso(start_date),
            "end_date": to_iso(end_date),
            "latest_weekly_diff_kg": latest_weekly_diff,
        },
        "points": points,
    }


@app.get("/api/insights/workout-heatmap")
async def workout_heatmap_data(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    exercise: str = Query(default="all"),
) -> dict[str, Any]:
    start_date, end_date = apply_default_insights_window(start_date, end_date)
    conn = await get_connection()
    try:
        rows = await conn.fetch(
            """
            SELECT workout_date, workout_type, COALESCE(workout_value_gbp, 0) AS workout_value_gbp
            FROM workouts
            WHERE user_id = $1
              AND ($2::date IS NULL OR workout_date >= $2)
              AND ($3::date IS NULL OR workout_date <= $3)
            ORDER BY workout_date;
            """,
            USER_ID,
            start_date,
            end_date,
        )
    finally:
        await release_connection(conn)

    selected_exercise = normalize_exercise_filter(exercise)
    if not rows:
        return {
            "meta": {
                "exercise": selected_exercise,
                "start_date": to_iso(start_date),
                "end_date": to_iso(end_date),
            },
            "months": [],
            "days": list(range(1, 32)),
            "cells": [],
        }

    df = pd.DataFrame(rows_to_dicts(rows))
    df["workout_date"] = pd.to_datetime(df["workout_date"])
    df["workout_value_gbp"] = pd.to_numeric(df["workout_value_gbp"], errors="coerce").fillna(0.0)
    df = apply_date_window(df, "workout_date", start_date, end_date)
    df["bucket"] = df["workout_type"].apply(workout_bucket)
    df = apply_workout_exercise_filter(df, selected_exercise)
    if df.empty:
        return {
            "meta": {
                "exercise": selected_exercise,
                "start_date": to_iso(start_date),
                "end_date": to_iso(end_date),
            },
            "months": [],
            "days": list(range(1, 32)),
            "cells": [],
        }

    df["month"] = df["workout_date"].dt.to_period("M").astype(str)
    df["day"] = df["workout_date"].dt.day

    month_order = (
        df.sort_values("workout_date")["month"]
        .drop_duplicates()
        .tolist()
    )

    grouped = (
        df.groupby(["month", "day"], as_index=False)
        .size()
        .rename(columns={"size": "count"})
    )
    grouped_labels = (
        df.groupby(["month", "day"])["workout_type"]
        .agg(lambda s: compact_workout_label(s.tolist(), mobile=False))
        .reset_index(name="label")
    )
    grouped_value = (
        df.groupby(["month", "day"])["workout_value_gbp"]
        .sum()
        .reset_index(name="value_gbp")
    )
    grouped_types = (
        df.groupby(["month", "day", "workout_type"], as_index=False)
        .size()
        .rename(columns={"size": "count"})
    )
    label_lookup = {
        (str(row["month"]), int(row["day"])): str(row["label"])
        for _, row in grouped_labels.iterrows()
    }
    value_lookup = {
        (str(row["month"]), int(row["day"])): round(float(row["value_gbp"]), 2)
        for _, row in grouped_value.iterrows()
    }
    types_lookup: dict[tuple[str, int], dict[str, int]] = {}
    for _, row in grouped_types.iterrows():
        key = (str(row["month"]), int(row["day"]))
        if key not in types_lookup:
            types_lookup[key] = {}
        types_lookup[key][str(row["workout_type"])] = int(row["count"])

    cells: list[dict[str, Any]] = []
    for _, row in grouped.iterrows():
        month = str(row["month"])
        day = int(row["day"])
        cells.append(
            {
                "month": month,
                "day": day,
                "count": int(row["count"]),
                "label": label_lookup.get((month, day), ""),
                "value_gbp": value_lookup.get((month, day), 0.0),
                "workout_types": types_lookup.get((month, day), {}),
            }
        )

    return {
        "meta": {
            "exercise": selected_exercise,
            "start_date": to_iso(start_date),
            "end_date": to_iso(end_date),
        },
        "months": month_order,
        "days": list(range(1, 32)),
        "cells": cells,
    }


@app.get("/api/insights/workout-mix")
async def workout_mix_data(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    exercise: str = Query(default="all"),
) -> dict[str, Any]:
    start_date, end_date = apply_default_insights_window(start_date, end_date)
    conn = await get_connection()
    try:
        rows = await conn.fetch(
            """
            SELECT workout_date, workout_type
            FROM workouts
            WHERE user_id = $1
              AND ($2::date IS NULL OR workout_date >= $2)
              AND ($3::date IS NULL OR workout_date <= $3)
            ORDER BY workout_date;
            """,
            USER_ID,
            start_date,
            end_date,
        )
    finally:
        await release_connection(conn)

    selected_exercise = normalize_exercise_filter(exercise)
    if not rows:
        return {
            "meta": {
                "exercise": selected_exercise,
                "start_date": to_iso(start_date),
                "end_date": to_iso(end_date),
            },
            "points": [],
        }

    df = pd.DataFrame(rows_to_dicts(rows))
    df["workout_date"] = pd.to_datetime(df["workout_date"])
    df = apply_date_window(df, "workout_date", start_date, end_date)
    df["month"] = df["workout_date"].dt.to_period("M").astype(str)
    df["bucket"] = df["workout_type"].apply(workout_bucket)
    df = apply_workout_exercise_filter(df, selected_exercise)
    if df.empty:
        return {
            "meta": {
                "exercise": selected_exercise,
                "start_date": to_iso(start_date),
                "end_date": to_iso(end_date),
            },
            "points": [],
        }

    monthly = (
        df.groupby(["month", "bucket"], as_index=False)
        .size()
        .rename(columns={"size": "count"})
    )
    pivot = monthly.pivot(index="month", columns="bucket", values="count").fillna(0)
    for col in ["Gym", "Pool Swim", "Lido/Res Swim"]:
        if col not in pivot.columns:
            pivot[col] = 0
    pivot = pivot[["Gym", "Pool Swim", "Lido/Res Swim"]]

    points: list[dict[str, Any]] = []
    for month, row in pivot.iterrows():
        total = max(float(row.sum()), 1.0)
        points.append(
            {
                "month": str(month),
                "gym_pct": round(float(row["Gym"]) / total * 100.0, 2),
                "pool_swim_pct": round(float(row["Pool Swim"]) / total * 100.0, 2),
                "lido_res_swim_pct": round(float(row["Lido/Res Swim"]) / total * 100.0, 2),
            }
        )

    return {
        "meta": {
            "exercise": selected_exercise,
            "start_date": to_iso(start_date),
            "end_date": to_iso(end_date),
        },
        "points": points,
    }


@app.get("/api/insights/monthly-summary")
async def monthly_summary_data(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    exercise: str = Query(default="all"),
) -> dict[str, Any]:
    start_date, end_date = apply_default_insights_window(start_date, end_date)
    conn = await get_connection()
    try:
        rows = await conn.fetch(
            """
            SELECT workout_date, workout_type, COALESCE(workout_value_gbp, 0) AS workout_value_gbp
            FROM workouts
            WHERE user_id = $1
              AND ($2::date IS NULL OR workout_date >= $2)
              AND ($3::date IS NULL OR workout_date <= $3)
            ORDER BY workout_date;
            """,
            USER_ID,
            start_date,
            end_date,
        )
    finally:
        await release_connection(conn)

    selected_exercise = normalize_exercise_filter(exercise)
    if not rows:
        return {
            "meta": {
                "exercise": selected_exercise,
                "start_date": to_iso(start_date),
                "end_date": to_iso(end_date),
            },
            "rows": [],
        }

    df = pd.DataFrame(rows_to_dicts(rows))
    df["workout_date"] = pd.to_datetime(df["workout_date"])
    df = apply_date_window(df, "workout_date", start_date, end_date)
    df["month"] = df["workout_date"].dt.to_period("M").astype(str)
    df["bucket"] = df["workout_type"].apply(workout_bucket)
    df = apply_workout_exercise_filter(df, selected_exercise)
    if df.empty:
        return {
            "meta": {
                "exercise": selected_exercise,
                "start_date": to_iso(start_date),
                "end_date": to_iso(end_date),
            },
            "rows": [],
        }

    df["workout_value_gbp"] = pd.to_numeric(df["workout_value_gbp"], errors="coerce").fillna(0.0)
    table_rows = build_monthly_summary_rows(df)
    return {
        "meta": {
            "exercise": selected_exercise,
            "start_date": to_iso(start_date),
            "end_date": to_iso(end_date),
        },
        "rows": table_rows,
    }


@app.get("/api/insights/bundle")
async def insights_bundle(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    exercise: str = Query(default="all"),
) -> dict[str, Any]:
    defaults: dict[str, Any] = {
        "conc": {"points": [], "injections": [], "meta": {}},
        "weight": {"points": [], "meta": {}},
        "mix": {"points": [], "meta": {}},
        "heatmap": {"months": [], "days": list(range(1, 32)), "cells": [], "meta": {}},
        "summary": {"rows": [], "meta": {}},
        "dashboard": {"month_label": "", "month_workouts": 0, "month_weigh_ins": 0, "month_value_gbp": 0.0},
    }

    jobs: list[tuple[str, Any]] = [
        ("conc", concentration_data(start_date=start_date, end_date=end_date, exercise=exercise)),
        ("weight", weight_trend_data(start_date=start_date, end_date=end_date, exercise=exercise)),
        ("mix", workout_mix_data(start_date=start_date, end_date=end_date, exercise=exercise)),
        ("heatmap", workout_heatmap_data(start_date=start_date, end_date=end_date, exercise=exercise)),
        ("summary", monthly_summary_data(start_date=start_date, end_date=end_date, exercise=exercise)),
        ("dashboard", dashboard_summary()),
    ]

    results = await asyncio.gather(*(job for _, job in jobs), return_exceptions=True)
    payload: dict[str, Any] = {}
    errors: dict[str, str] = {}

    for (key, _), result in zip(jobs, results):
        if isinstance(result, Exception):
            payload[key] = defaults[key]
            errors[key] = str(result)
        else:
            payload[key] = result

    if len(errors) == len(jobs):
        raise HTTPException(status_code=503, detail="Could not load insights data.")

    payload["_errors"] = errors
    return payload


@app.get("/api/history")
async def recent_history_data(limit: int = Query(default=20, ge=1, le=100)) -> dict[str, Any]:
    conn = await get_connection()
    try:
        weigh_rows = await conn.fetch(
            """
            SELECT weigh_in_id, weigh_date, weight_kg
            FROM weigh_ins
            WHERE user_id = $1
            ORDER BY weigh_date DESC, weigh_in_id DESC
            LIMIT $2;
            """,
            USER_ID,
            limit,
        )
        injection_rows = await conn.fetch(
            """
            SELECT injection_id, injection_date, dose_mg
            FROM injections
            WHERE user_id = $1
            ORDER BY injection_date DESC, injection_id DESC
            LIMIT $2;
            """,
            USER_ID,
            limit,
        )
        workout_rows = await conn.fetch(
            """
            SELECT workout_id, workout_date, workout_type, COALESCE(workout_value_gbp, 0) AS workout_value_gbp
            FROM workouts
            WHERE user_id = $1
            ORDER BY workout_date DESC, workout_id DESC
            LIMIT $2;
            """,
            USER_ID,
            limit,
        )
    finally:
        await release_connection(conn)

    weigh = [
        {
            "id": int(r["weigh_in_id"]),
            "date": str(r["weigh_date"]),
            "weight_kg": float(r["weight_kg"]),
        }
        for r in rows_to_dicts(weigh_rows)
    ]
    injections = [
        {
            "id": int(r["injection_id"]),
            "date": str(r["injection_date"]),
            "dose_mg": float(r["dose_mg"]),
        }
        for r in rows_to_dicts(injection_rows)
    ]
    workouts = [
        {
            "id": int(r["workout_id"]),
            "date": str(r["workout_date"]),
            "workout_type": str(r["workout_type"]),
            "workout_value_gbp": float(r["workout_value_gbp"]),
        }
        for r in rows_to_dicts(workout_rows)
    ]

    return {
        "weigh_ins": weigh,
        "injections": injections,
        "workouts": workouts,
    }
