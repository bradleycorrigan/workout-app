import os
from calendar import monthrange
from datetime import date
from typing import Any

import asyncpg
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from dotenv import load_dotenv
from fastapi import FastAPI, Form, Query, Request
from fastapi import HTTPException
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

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

app = FastAPI(title="Workout Dashboard")
templates = Jinja2Templates(directory="templates")

THEME = {
    "bg": "rgba(253, 246, 227, 0.68)",
    "panel": "rgba(255, 255, 255, 0.35)",
    "ink": "#10363f",
    "grid": "rgba(88, 110, 117, 0.2)",
    "green": "#2f6f4f",
}
CHART_TITLE_SIZE = 16


async def get_connection() -> asyncpg.Connection:
    return await asyncpg.connect(DATABASE_URL, statement_cache_size=0)


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


@app.get("/", response_class=HTMLResponse)
async def home(request: Request) -> HTMLResponse:
    conn = await get_connection()
    try:
        weigh_history = rows_to_dicts(
            await conn.fetch(
                """
                SELECT weigh_in_id, weigh_date, weight_kg
                FROM weigh_ins
                WHERE user_id = $1
                ORDER BY weigh_date DESC
                """,
                USER_ID,
            )
        )

        injection_history = rows_to_dicts(
            await conn.fetch(
                """
                SELECT injection_id, injection_date, dose_mg
                FROM injections
                WHERE user_id = $1
                ORDER BY injection_date DESC
                """,
                USER_ID,
            )
        )

        workout_history = rows_to_dicts(
            await conn.fetch(
                """
                SELECT workout_id, workout_date, workout_type, COALESCE(workout_value_gbp, 0) AS workout_value_gbp, notes
                FROM workouts
                WHERE user_id = $1
                ORDER BY workout_date DESC, workout_id DESC
                """,
                USER_ID,
            )
        )

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
        await conn.close()

    if summary_row is None:
        raise RuntimeError("Failed to load summary metrics.")

    context = {
        "request": request,
        "workout_options": [
            {"value": key, "price": price}
            for key, price in WORKOUT_PRICES_GBP.items()
        ],
        "month_label": str(summary_row["month_label"]),
        "weigh_history": weigh_history,
        "injection_history": injection_history,
        "workout_history": workout_history,
        "month_workouts": int(summary_row["month_workouts"]),
        "month_weigh_ins": int(summary_row["month_weigh_ins"]),
        "month_value_gbp": float(summary_row["month_value_gbp"]),
    }
    return templates.TemplateResponse(request=request, name="index.html", context=context)


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
        await conn.close()

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
        await conn.close()

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
        await conn.close()

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
        await conn.close()

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
        await conn.close()

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
        await conn.close()

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
        await conn.close()

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
        await conn.close()

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
        await conn.close()

    if updated == "UPDATE 0":
        raise HTTPException(status_code=404, detail="Workout not found.")

    return templates.TemplateResponse(
        request=request,
        name="_save_success.html",
        context={"request": request, "message": "Updated workout"},
    )


@app.get("/charts/concentration", response_class=HTMLResponse)
async def concentration_chart(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    exercise: str = Query(default="all"),
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
        await conn.close()

    if not rows:
        return HTMLResponse("<p>No injection data yet.</p>")

    df = pd.DataFrame(rows_to_dicts(rows))
    df["injection_date"] = pd.to_datetime(df["injection_date"])
    df = apply_date_window(df, "injection_date", start_date, end_date)
    if df.empty:
        return HTMLResponse("<p>No injection data for the selected filters.</p>")

    _ = normalize_exercise_filter(exercise)
    curve = calculate_concentration(df, days_forecast=21)

    fig = px.line(
        curve,
        x="date",
        y="estimated_concentration",
        title="",
        markers=True,
        line_shape="spline",
    )
    fig.update_traces(
        line=dict(color="#1f5a3f", width=4),
        marker=dict(size=6, color="#2d7a56", line=dict(color="#fdf6e3", width=1.5)),
    )
    apply_chart_theme(fig, "🧬 Estimated Concentration", "Estimated level")
    fig.update_xaxes(title="Date")
    return HTMLResponse(fig.to_html(full_html=False, include_plotlyjs=False))


@app.get("/charts/weight-trend", response_class=HTMLResponse)
async def weight_trend_chart(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    exercise: str = Query(default="all"),
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
        await conn.close()

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

    delta_labels = [
        "0" if i == 0 else (f"+{d}" if d > 0 else f"{d}")
        for i, d in enumerate(df["delta"].tolist())
    ]

    fig = go.Figure()
    fig.add_trace(
        go.Scatter(
            x=df["weigh_date"],
            y=df["weight_kg"],
            name="Weight (kg)",
            mode="lines+markers",
            line=dict(color="#1e355b", width=4, shape="spline", smoothing=0.6),
            marker=dict(size=8, symbol="x", color="#1e355b"),
            fill="tozeroy",
            fillcolor="rgba(100, 144, 199, 0.16)",
        ),
    )
    fig.add_trace(
        go.Scatter(
            x=df["weigh_date"],
            y=df["weight_kg"] - 0.8,
            mode="text",
            text=delta_labels,
            textfont=dict(color="#2f6f4f", size=14, family="Inter, sans-serif"),
            textposition="bottom center",
            name="Difference",
            hoverinfo="skip",
        )
    )
    fig.update_layout(
        title=dict(
            text="⚖️ Weight (kg) and Difference",
            x=0.02,
            xanchor="left",
            font=dict(family="Fraunces, Georgia, serif", size=CHART_TITLE_SIZE, color=THEME["ink"]),
        ),
        margin=dict(l=18, r=18, t=54, b=40),
        height=360,
        paper_bgcolor=THEME["bg"],
        plot_bgcolor=THEME["panel"],
        font=dict(color="#122033", size=16, family="Inter, Avenir Next, Segoe UI, sans-serif"),
        showlegend=False,
        xaxis=dict(title="Date", tickformat="%b %-d", gridcolor="#c6c0ad"),
        yaxis=dict(title="", range=[y_min, y_max], dtick=5, gridcolor="#bfb8a6"),
    )
    return HTMLResponse(fig.to_html(full_html=False, include_plotlyjs=False))


@app.get("/charts/workout-heatmap", response_class=HTMLResponse)
async def workout_heatmap_chart(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    exercise: str = Query(default="all"),
) -> HTMLResponse:
    conn = await get_connection()
    try:
        rows = await conn.fetch(
            """
            SELECT workout_date, workout_type
            FROM workouts
            WHERE user_id = $1
            ORDER BY workout_date;
            """,
            USER_ID,
        )
    finally:
        await conn.close()

    if not rows:
        return HTMLResponse("<p>No workout data yet.</p>")

    selected_exercise = normalize_exercise_filter(exercise)
    df = pd.DataFrame(rows_to_dicts(rows))
    df["workout_date"] = pd.to_datetime(df["workout_date"])
    df = apply_date_window(df, "workout_date", start_date, end_date)
    df["bucket"] = df["workout_type"].apply(workout_bucket)
    df = apply_workout_exercise_filter(df, selected_exercise)
    if df.empty:
        return HTMLResponse("<p>No workout data for the selected filters.</p>")

    df["month"] = df["workout_date"].dt.strftime("%b")
    df["day"] = df["workout_date"].dt.day
    grouped = (
        df.groupby(["month", "day"], sort=False)["workout_type"]
        .apply(lambda s: " + ".join([WORKOUT_DISPLAY.get(str(x), str(x)) for x in s.tolist()]))
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
    text = [["" for _ in month_order] for _ in days]

    month_idx = {m: i for i, m in enumerate(month_order)}
    for _, row in grouped.iterrows():
        m = row["month"]
        d = int(row["day"])
        label = row["label"]
        bucket_val = 1
        l = label.lower()
        if "gym" in l and ("swim" in l or "lido" in l or "reservoir" in l or "sauna" in l):
            bucket_val = 3
        elif "gym" in l:
            bucket_val = 1
        elif "swim" in l and "pool" in l:
            bucket_val = 2
        else:
            bucket_val = 4

        text[d - 1][month_idx[m]] = label
        z[d - 1][month_idx[m]] = bucket_val

    fig = go.Figure(
        data=go.Heatmap(
            z=z,
            x=month_order,
            y=days,
            text=text,
            texttemplate="%{text}",
            textfont=dict(family="Inter, Avenir Next, Segoe UI, sans-serif", size=9, color="#123b33"),
            hovertemplate="Month %{x}<br>Day %{y}<br>%{text}<extra></extra>",
            colorscale=[
                [0.0, "#f6f0db"],
                [0.25, "#dfeedd"],
                [0.5, "#b8dcc2"],
                [0.75, "#6fa783"],
                [1.0, "#2f6f4f"],
            ],
            zmin=0,
            zmax=4,
            showscale=False,
        )
    )
    apply_chart_theme(fig, "🗓️ Workout Day Heatmap", "")
    fig.update_layout(height=430, margin=dict(l=16, r=16, t=50, b=20))
    fig.update_xaxes(title="", side="top")
    fig.update_yaxes(title="", autorange="reversed", dtick=1)
    return HTMLResponse(fig.to_html(full_html=False, include_plotlyjs=False))


@app.get("/charts/workout-mix", response_class=HTMLResponse)
async def workout_mix_chart(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    exercise: str = Query(default="all"),
) -> HTMLResponse:
    conn = await get_connection()
    try:
        rows = await conn.fetch(
            """
            SELECT workout_date, workout_type
            FROM workouts
            WHERE user_id = $1
            ORDER BY workout_date;
            """,
            USER_ID,
        )
    finally:
        await conn.close()

    if not rows:
        return HTMLResponse("<p>No workout data yet.</p>")

    selected_exercise = normalize_exercise_filter(exercise)
    df = pd.DataFrame(rows_to_dicts(rows))
    df["workout_date"] = pd.to_datetime(df["workout_date"])
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

    fig = go.Figure()
    month_x = pd.PeriodIndex(pivot.index, freq="M").to_timestamp()

    fig.add_trace(
        go.Scatter(
            x=month_x,
            y=pivot["Gym"],
            stackgroup="one",
            groupnorm="percent",
            mode="lines",
            name="Gym",
            line=dict(width=2, color="#a8c0e9", shape="spline", smoothing=0.6),
        )
    )
    fig.add_trace(
        go.Scatter(
            x=month_x,
            y=pivot["Pool Swim"],
            stackgroup="one",
            groupnorm="percent",
            mode="lines",
            name="Pool Swim",
            line=dict(width=2, color="#3f85c8", shape="spline", smoothing=0.6),
        )
    )
    fig.add_trace(
        go.Scatter(
            x=month_x,
            y=pivot["Lido/Res Swim"],
            stackgroup="one",
            groupnorm="percent",
            mode="lines",
            name="Lido/Res Swim",
            line=dict(width=2, color="#4f9a80", shape="spline", smoothing=0.6),
        )
    )
    apply_chart_theme(fig, "📈 Workout Mix by Month", "Share of monthly workouts (%)")
    month_labels = [ts.strftime("%b %y") for ts in month_x]
    fig.update_xaxes(
        title="Month",
        tickmode="array",
        tickvals=month_x,
        ticktext=month_labels,
    )
    fig.update_layout(
        legend=dict(
            orientation="h",
            yanchor="top",
            y=-0.24,
            xanchor="left",
            x=0,
            font=dict(size=11),
            bgcolor="rgba(255,255,255,0.35)",
            bordercolor="rgba(47,111,79,0.25)",
            borderwidth=1,
        ),
        margin=dict(l=18, r=18, t=58, b=92),
    )
    fig.update_yaxes(range=[0, 100], ticksuffix="%")
    return HTMLResponse(fig.to_html(full_html=False, include_plotlyjs=False))


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
        await conn.close()

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

    merged = merged.sort_values("month")

    table_rows = []
    for _, row in merged.iterrows():
        table_rows.append(
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

    return templates.TemplateResponse(
        request=request,
        name="partials/monthly_summary_table.html",
        context={"request": request, "rows": table_rows},
    )
