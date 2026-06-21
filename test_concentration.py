import pandas as pd
from concentration import calculate_concentraction

def test_single_injection_starts_near_zero():
    """Day 0 should be near zero (absorption hasn't happened yet), not the full dose."""
    df = pd.DataFrame({'injection_date': ['2026-04-13'], 'dose_mg': [2.5]})
    result = calculate_concentraction(df, days_forecast=10)

    day_zero = result.iloc[0]['estimated_concentration']
    assert day_zero < 0.5, f"Expected near-zero on injection day, got {day_zero}"

def test_concentration_peaks_then_declines():
    """Concentration should rise to a peak, then fall — not jump straight to a value and decay."""
    df = pd.DataFrame({'injection_date': ['2026-04-13'], 'dose_mg': [2.5]})
    result = calculate_concentraction(df, days_forecast=10)

    values = result['estimated_concentration'].tolist()
    peak_index = values.index(max(values))

    assert peak_index > 0, "Peak should occur after day 0, not on it"
    assert values[-1] < max(values), "Concentration should be declining by the end of the window"

def test_empty_injections_returns_empty_frame():
    df = pd.DataFrame(columns=['injection_date', 'dose_mg'])
    result = calculate_concentraction(df)
    assert result.empty