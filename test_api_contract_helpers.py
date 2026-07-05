from datetime import date
import os

import pandas as pd

os.environ.setdefault("DATABASE_URL", "postgresql://localhost/test")
os.environ.setdefault("USER_ID", "00000000-0000-0000-0000-000000000000")

from main import build_monthly_summary_rows, compact_workout_label, to_iso


def test_compact_workout_label_desktop_and_mobile() -> None:
    labels = ["swim", "gym", "swim_kgx"]
    assert compact_workout_label(labels, mobile=False) == "Pool +2"
    assert compact_workout_label(labels, mobile=True) == "Pool +"


def test_to_iso_handles_none_and_date() -> None:
    assert to_iso(None) is None
    assert to_iso(date(2026, 7, 5)) == "2026-07-05"


def test_build_monthly_summary_rows_shape_and_metrics() -> None:
    df = pd.DataFrame(
        {
            "month": ["2026-06", "2026-06", "2026-06", "2026-07"],
            "workout_type": ["gym", "swim", "swim", "reservoir"],
            "workout_date": pd.to_datetime(["2026-06-01", "2026-06-01", "2026-06-02", "2026-07-05"]),
            "workout_value_gbp": [15.0, 6.8, 6.8, 13.15],
            "bucket": ["Gym", "Pool Swim", "Pool Swim", "Lido/Res Swim"],
        }
    )

    rows = build_monthly_summary_rows(df)

    assert len(rows) == 2
    july = rows[0]
    june = rows[1]

    assert july["month"] == "2026-07"
    assert july["value_gbp"] == 13.15
    assert july["gym"] == 0
    assert july["pool_swim"] == 0
    assert july["lido_res_swim"] == 1

    assert june["month"] == "2026-06"
    assert june["value_gbp"] == 28.6
    assert june["workout_days"] == 2
    assert june["total_sessions"] == 3
    assert june["gym"] == 1
    assert june["pool_swim"] == 2
    assert june["lido_res_swim"] == 0
