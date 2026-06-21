import pandas as pd
import calendar

def weight_trend(weigh_ins_df: pd.DataFrame) -> pd.DataFrame:
    if weigh_ins_df.empty:
        return pd.DataFrame(columns=["weigh_date", "weight_kg", "change_kg"])
    df = weigh_ins_df.copy()
    df["weigh_date"] = pd.to_datetime(df["weigh_date"])
    df = df.sort_values("weigh_date").reset_index(drop=True)
    weekly = df.set_index("weigh_date").resample("W")["weight_kg"].mean().reset_index()
    weekly["change_kg"] = weekly["weight_kg"].diff().round(2)
    return weekly

def monthly_adherence(workouts_df: pd.DataFrame, year: int, month: int) -> float:
    if workouts_df.empty:
        return 0.0
    df = workouts_df.copy()
    df["workout_date"] = pd.to_datetime(df["workout_date"])
    month_mask = (df["workout_date"].dt.year == year) & (df["workout_date"].dt.month == month)
    days_with_workout = df.loc[month_mask, "workout_date"].dt.date.nunique()
    days_in_month = calendar.monthrange(year, month)[1]
    return round(days_with_workout / days_in_month, 3)

def adherence_by_month(workouts_df: pd.DataFrame, n_months: int = 6) -> pd.DataFrame:
    today = pd.Timestamp.now()
    months = pd.date_range(end=today, periods=n_months, freq="MS")
    rows = [
        {"month": m.strftime("%Y-%m"), "adherence": monthly_adherence(workouts_df, m.year, m.month)}
        for m in months
    ]
    return pd.DataFrame(rows)

def workout_value(workouts_df: pd.DataFrame) -> pd.DataFrame:
    """Normalize and enrich workout value data from public.workouts."""
    if workouts_df.empty:
        return pd.DataFrame(columns=["workout_date", "workout_type", "workout_value_gbp", "cumulative_value_gbp"])

    df = workouts_df.copy()
    df["workout_date"] = pd.to_datetime(df["workout_date"])

    if "workout_value_gbp" not in df.columns:
        df["workout_value_gbp"] = 0.0

    df["workout_value_gbp"] = pd.to_numeric(df["workout_value_gbp"], errors="coerce").fillna(0.0)
    df = df.sort_values("workout_date").reset_index(drop=True)
    df["cumulative_value_gbp"] = df["workout_value_gbp"].cumsum().round(2)
    return df

