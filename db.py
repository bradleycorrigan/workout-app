from __future__ import annotations

import os
import sqlite3
from sqlite3 import Connection


def get_connection() -> Connection:
    """Create a SQLite connection using DB_PATH from environment."""
    db_path = os.getenv("DB_PATH", "workout.db")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn
