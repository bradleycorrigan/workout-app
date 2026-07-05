# Pulseboard Productionization Plan

This plan is for productionization only.
Do not implement from this file yet.

## Objectives

- Move from single-user prototype to secure multi-user product.
- Add reliable email/password auth now, with social login later.
- Generalize workout modeling so the app is not tied to one person's preset types.
- Introduce onboarding that captures account details and starter workout list.
- Prepare Supabase-backed security model with strict row-level controls.

## Scope for This Plan

In scope:
- multi-user architecture
- login and signup UX
- onboarding flow and data model
- workout-type standardization
- Supabase auth, schema, and RLS strategy
- rollout, migration, and hardening

Out of scope right now:
- feature implementation
- pricing/paywall implementation
- social login implementation

## Product Decisions Locked for v1

- Auth method: email + password only.
- Social login: deferred to later milestone.
- Onboarding must include workout-list definition.
- Onboarding must not ask users to define workout costs.
- Cost configuration and monetization are postponed for future paywall phase.

## Target Architecture

### Identity and Access

- Use Supabase Auth as source of truth for users.
- Each app user maps to `auth.users.id` UUID.
- App tables reference `user_id` UUID and never trust client-supplied user IDs.

### Data Ownership Model

- Every user-owned row has `user_id` and `created_at`.
- All read/write access governed by RLS policies tied to `auth.uid()`.
- Service role is reserved for admin/server-only tasks.

### Domain Model Evolution

Current issue:
- workout types are too specific to one person.

Target:
- Introduce normalized workout catalog model:
  - `workout_types` (global defaults)
  - `user_workout_types` (user-enabled set / custom labels)
  - `workouts` references type IDs, not hardcoded strings
- Preserve backward compatibility during migration with a mapping layer.

## User Flows

### Signup Flow

Step 1:
- Feature-oriented signup screen explaining what users get:
  - fast logging
  - trend insights
  - progress context

Step 2:
- Email + password account creation.

Step 3:
- Verification handling (if email confirmation enabled).

Step 4:
- First-time onboarding kickoff.

### Login Flow

- Email + password login.
- Clear links for:
  - create account
  - forgot password
- Post-login redirect:
  - if onboarding incomplete -> onboarding
  - else -> log screen

### Onboarding Flow (Must Have)

- Intro: concise feature explanation and value.
- Workout setup:
  - choose from starter workout list
  - optionally enable/disable items
  - allow simple custom workout labels
- No workout cost setup in onboarding.
- Completion writes user preferences/profile flags.

## Security and Compliance Plan (Supabase)

### RLS Baseline

For every user-owned table:
- `SELECT`: allowed only where `user_id = auth.uid()`
- `INSERT`: allowed only where `user_id = auth.uid()`
- `UPDATE`: allowed only where `user_id = auth.uid()`
- `DELETE`: allowed only where `user_id = auth.uid()`

### API Security Rules

- Server must validate auth token for protected endpoints.
- Never accept `user_id` from request body/query for ownership decisions.
- Derive user identity from validated auth context only.
- Add centralized authorization checks to avoid route drift.

### Operational Hardening

- Environment separation for dev/staging/prod Supabase projects.
- Key hygiene:
  - anon key only in client
  - service key only in server secrets
- Add audit logging for auth failures and authorization denials.

## Delivery Plan (Phased)

### Phase 0: Production Readiness Design (1 week)

Deliverables:
- finalized auth and data model spec
- migration plan from single-user data
- RLS policy matrix by table
- onboarding UX wireframes and copy

Exit criteria:
- architecture and migration reviewed and approved

### Phase 1: Multi-User Foundation + Auth (1-2 weeks)

Deliverables:
- Supabase project + environments configured
- email/password signup/login/reset flows wired
- server-side auth validation in protected routes
- user context propagation throughout app

Exit criteria:
- two distinct users cannot see or mutate each other's records

### Phase 2: Workout Model Generalization (1-2 weeks)

Deliverables:
- workout type schema refactor and migration
- compatibility mapping for legacy workout rows
- UI reads available workout types from user-aware source

Exit criteria:
- no hardcoded personal workout assumptions in active log flow

### Phase 3: Onboarding (1 week)

Deliverables:
- guided onboarding flow after signup
- workout list selection/customization
- onboarding-complete flag and gating

Exit criteria:
- first-time user can complete onboarding and log first workout successfully

### Phase 4: Security Hardening + Launch Prep (1 week)

Deliverables:
- final RLS policy verification checklist
- auth error handling and session edge-case handling
- monitoring dashboard and runbook
- rollback and incident response notes

Exit criteria:
- security review passed
- staging signoff complete

## Migration Strategy

- Create new schema/tables first.
- Backfill existing user data to mapped model.
- Run dual-read compatibility window if needed.
- Cut over read paths, then write paths.
- Remove legacy assumptions after verification.

## Testing Plan

### Functional

- signup, login, logout, reset password
- onboarding completion and skip prevention
- workout creation/edit/delete across custom workout lists

### Security

- RLS isolation tests (user A cannot read/write user B)
- endpoint auth enforcement tests
- token/session expiry behavior tests

### Regression

- existing insights and log flows still work with user scoping
- old data remains visible to correct owner post-migration

## Risks and Mitigations

Risk:
- breaking existing single-user flows during migration
Mitigation:
- staged rollout with migration dry-runs and rollback script

Risk:
- incomplete RLS coverage
Mitigation:
- explicit policy matrix + automated policy checks per table

Risk:
- onboarding friction hurts activation
Mitigation:
- keep onboarding minimal and postpone nonessential inputs like costs

## Launch Checklist

- Supabase prod project configured with least-privilege keys
- all user-owned tables have RLS enabled and tested
- auth flows verified on mobile and desktop
- onboarding copy reviewed and approved
- monitoring alerts configured for auth/API failures

## Future (Post-v1)

- social login providers
- workout cost setup behind premium/paywall strategy
- team/coach sharing model
- advanced account and billing management
