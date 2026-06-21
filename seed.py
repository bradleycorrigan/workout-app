import os
import sys
import asyncio
from typing import Any, cast
import asyncpg
import pandas as pd
from dotenv import load_dotenv
from supabase import create_client

# Load variables from .env
load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY")
SUPABASE_KEY = SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY
USER_ID = os.environ.get("USER_ID")
DATABASE_URL = os.environ.get("DATABASE_URL")

if SUPABASE_URL is None or SUPABASE_KEY is None or USER_ID is None:
    raise ValueError(
        "Missing required environment variables. Required: "
        "SUPABASE_URL, USER_ID, and one of SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY."
    )

if DATABASE_URL is None:
    raise ValueError("Missing required environment variable: DATABASE_URL")

assert DATABASE_URL is not None

if SUPABASE_SERVICE_ROLE_KEY:
    print("Using SUPABASE_SERVICE_ROLE_KEY for seeding.")
else:
    print("Using SUPABASE_ANON_KEY for seeding (RLS may block inserts).")

# Initialize the Supabase Client
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


async def ensure_injections_fk_to_auth_users(database_url: str, user_id: str) -> None:
    """Point injections.user_id FK to auth.users(id) and verify USER_ID exists."""
    conn = await asyncpg.connect(database_url)
    try:
        constraint_names = await conn.fetch(
            """
            SELECT c.conname
            FROM pg_constraint c
            JOIN pg_class t ON t.oid = c.conrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
            WHERE c.contype = 'f'
              AND n.nspname = 'public'
              AND t.relname = 'injections'
              AND a.attname = 'user_id';
            """
        )

        for row in constraint_names:
            await conn.execute(
                f'ALTER TABLE public.injections DROP CONSTRAINT IF EXISTS "{row["conname"]}";'
            )

        await conn.execute(
            """
            ALTER TABLE public.injections
            ADD CONSTRAINT injections_user_id_fkey
            FOREIGN KEY (user_id)
            REFERENCES auth.users(id)
            ON UPDATE CASCADE
            ON DELETE CASCADE;
            """
        )

        user_exists = await conn.fetchval(
            "SELECT EXISTS(SELECT 1 FROM auth.users WHERE id = $1::uuid);",
            user_id,
        )
        if not user_exists:
            raise RuntimeError(
                f"USER_ID {user_id} does not exist in auth.users."
            )

        print("Verified injections.user_id foreign key points to auth.users(id).")
    finally:
        await conn.close()

# Define your DataFrame
injections_df = pd.DataFrame({
    'injection_date': [
        '2026-04-13', '2026-04-20', '2026-04-26', '2026-05-03', '2026-05-07', 
        '2026-05-12', '2026-05-17', '2026-05-25', '2026-05-29', '2026-06-02', 
        '2026-06-07', '2026-06-14', '2026-06-21', '2026-06-28', '2026-07-05'
    ],
    'dose_mg': [
        2.50, 2.50, 2.50, 2.50, 2.50, 
        2.50, 2.50, 2.50, 2.50, 2.50, 
        5.00, 5.00, 5.00, 5.00, 5.00
    ]
})

# Map the active user UUID to every row
injections_df['user_id'] = USER_ID

# Convert DataFrame rows into a format the REST API expects (list of dicts)
records = injections_df.to_dict(orient='records')

# Execute bulk insert over the Supabase REST API
try:
    asyncio.run(ensure_injections_fk_to_auth_users(DATABASE_URL, USER_ID))
    response = supabase.table("injections").insert(cast(Any, records)).execute()
    print("Successfully seeded historical data!")
    print(f"Uploaded {len(records)} injection records.")
except Exception as e:
    print(f"Error seeding data: {e}")
    error_text = str(e)
    if "42501" in error_text:
        print(
            "If you see an RLS policy error (42501), use SUPABASE_SERVICE_ROLE_KEY "
            "for seeding or add an insert policy that allows your authenticated user."
        )
    if "23503" in error_text and "injections_user_id_fkey" in error_text:
        print(
            "Foreign key failure on injections.user_id. "
            "Confirm USER_ID exists in auth.users and the FK references auth.users(id)."
        )
    sys.exit(1)