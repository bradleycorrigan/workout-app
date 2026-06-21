from datetime import datetime, timedelta
from typing import cast

import numpy as np
import pandas as pd
from scipy.optimize import brentq

HALF_LIFE_DAYS = 5.0
T_MAX_DAYS = 1.0
K_E = np.log(2) / HALF_LIFE_DAYS


def solve_k_a(k_e: float, t_max: float) -> float:
    """Find absorption rate constant k_a so peak occurs at t_max."""

    def tmax_equation(k_a: float) -> float:
        if abs(k_a - k_e) < 1e-9:
            return t_max - (1.0 / k_e)
        return t_max - (np.log(k_a / k_e) / (k_a - k_e))

    root = cast(float, brentq(tmax_equation, k_e + 1e-6, 50.0))
    return root


K_A = solve_k_a(K_E, T_MAX_DAYS)


def bateman(t_days: np.ndarray, dose: float, k_a: float, k_e: float) -> np.ndarray:
    """Concentration at t_days after one dose with absorption and elimination."""
    return (dose * k_a / (k_a - k_e)) * (np.exp(-k_e * t_days) - np.exp(-k_a * t_days))


def calculate_concentration(injections_df: pd.DataFrame, days_forecast: int = 7) -> pd.DataFrame:
    """Build a daily concentration curve from historical injections."""
    if injections_df.empty:
        return pd.DataFrame(columns=["date", "estimated_concentration"])

    frame = injections_df.copy()
    frame["injection_date"] = pd.to_datetime(frame["injection_date"])

    start = frame["injection_date"].min()
    end = datetime.now() + timedelta(days=days_forecast)
    timeline = pd.DataFrame({"date": pd.date_range(start, end, freq="D")})
    timeline["estimated_concentration"] = 0.0

    for _, row in frame.iterrows():
        days_elapsed = (timeline["date"] - row["injection_date"]).dt.days
        mask = days_elapsed >= 0
        timeline.loc[mask, "estimated_concentration"] += bateman(
            days_elapsed[mask].values,
            float(row["dose_mg"]),
            K_A,
            K_E,
        )

    timeline["estimated_concentration"] = timeline["estimated_concentration"].round(2)
    return timeline


def calculate_concentraction(injections_df: pd.DataFrame, days_forecast: int = 7) -> pd.DataFrame:
    """Backward-compatible alias for historical misspelling."""
    return calculate_concentration(injections_df, days_forecast=days_forecast)