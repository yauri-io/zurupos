# Build Progress

Update this file at the end of every milestone (SPEC §16). Keep entries short: what's done, how to run/verify it, known issues.

| # | Milestone | Status | Review stop |
|---|---|---|---|
| M0 | Repo scaffold, Docker Compose, skeletons, CI | ✅ Done | |
| M1 | DB roles, migrations, RLS, auth, permissions | ✅ Done (reviewed) | **User review required** |
| M2 | Menu, modifiers, ingredients, recipes, discounts, settings | ✅ Done | |
| M3 | Pricing engine, orders, void, stock ops, low-stock email | 🟡 In progress | **User review required** |
| M4 | Flutter cashier app | ⬜ Not started | |
| M5 | Printing (Bluetooth + network) | ⬜ Not started | Manual printer test by user |
| M6 | Dashboard reports and remaining pages | ⬜ Not started | |
| M7 | Hardening, demo seed, user guide, UAT | ⬜ Not started | UAT with the shop owner |

Status legend: ⬜ Not started · 🟡 In progress · 🔍 Awaiting review · ✅ Done

---

## Log

<!-- Append entries like:
### M0 — 2026-11-16
- Done: ...
- Run: `...`
- Known issues: ...
-->

### M0 — 2026-11-17
- Done: pnpm monorepo (`apps/api`, `apps/dashboard`, `packages/`), Flutter app in `apps/cashier`; Docker Compose with postgres 17, dbmate `migrate` one-shot, mailpit, api, dashboard; local role bootstrap `db/init/00-roles.sh` (D-014); baseline migration; API skeleton (Fastify 5, TypeBox, swagger, pino request ids, SPEC §9 error shape, `/healthz`); Nuxt 4 + Nuxt UI + i18n skeleton; Flutter skeleton (Riverpod, id/en l10n); GitHub Actions CI (`.github/workflows/ci.yml`).
- Run: `cp .env.example .env && docker compose up -d --build --wait` → API http://localhost:4000/healthz, dashboard http://localhost:3000, Mailpit http://localhost:8025.
- Verified locally: api lint/typecheck/tests, dashboard lint/typecheck/build, `flutter analyze` + `flutter test`, prettier check.
- Known issues: CI has not run on GitHub yet (nothing pushed); the workflow runs the same commands that were verified locally. Dev Postgres is on host port 55432 (5432 was taken on this machine).

### M1 — 2026-11-17
- Done:
  - Roles (D-014). Migrations for every SPEC §4 table, with money identities as CHECK constraints. ENABLE + FORCE RLS and the `tenant_isolation` policy on all 22 tenant tables. Grants per D-015. The four `auth.*` SECURITY DEFINER functions, plus the D-024 lookup policy.
  - `withTenant` and `request.tenantTx`. Raw `db` is not reachable from route handlers.
  - Auth (SPEC §5.1–5.3): signup (flag-gated), login/logout/me, CSRF, password reset and manager invite (enqueued to outbox), device pairing/list/revoke, staff picker, PIN sessions with per-device lockout, heartbeat, in-memory rate limits.
  - `permissions.ts` (PRD §6 matrix) with one route guard, the audit log helper, and the users API (create, update, reset PIN, deactivate).
- Tests: 253 passing (`pnpm --filter @zurupos/api test`):
  - RLS suite (`test/rls`, all of SPEC §3.6 #1–#8), 190 tests.
  - Auth (`test/auth`), 61 tests.
  - Health, 2 tests.
  - Mutation check: disabling RLS on `users` makes 10 DB-level tests fail.
- Run: `docker compose up -d --wait postgres mailpit && pnpm db:migrate:test && pnpm --filter @zurupos/api test:rls`.
- Known issues / notes:
  - Password-reset and invite emails are written to `outbox` but not sent until the M3 worker exists, so they don't show in Mailpit yet. Tests read them from the outbox as `zuru_worker`.
  - CI has still not run on GitHub (nothing pushed).
  - The timezone is not validated in the DB; the settings API will validate it in M2.

### M1 review — 2026-11-17
- User approved D-024 (with hardening), D-025 and D-026.
- Hardening: `pg_temp` last in the `auth.*` functions' `search_path`; the API refuses to start if its DB role is superuser, has BYPASSRLS, is a member of `zuru_owner` or owns a table in `public`/`auth` (`src/db/role-guard.ts`, `test/db/role-guard.test.ts`); the isolation suite asserts no `CREATE` on `public`/`auth` for `zuru_app` and `zuru_worker`. SPEC §3.1/§3.4/§3.6 updated.
- Tests: 263 passing.

### M2 — 2026-11-17
- Done:
  - API modules (SPEC §9): settings, categories, items (incl. availability and modifier-group links), modifier groups/options, ingredients (+ movements, cursor-paginated), recipes, option effects, recipe preview, discounts. Archive instead of delete (D-029); quantities/costs as decimal strings, money as integers (D-028).
  - `src/domain/recipe-resolve.ts` (SPEC §7.1, three passes, add redirect) and `src/domain/decimal.ts` (fixed-point, no floats).
  - Dashboard: login/forgot/reset/invite, menu (categories + items), item page (recipe editor, modifier groups, live usage preview), modifiers (groups, options, effects editor), ingredients, discounts, settings. Bahasa Indonesia + English. One IDR formatter (`app/utils/money.ts`).
  - Generated API client types (`packages/api-client`, `pnpm api:client`); CI checks they're up to date.
- Tests: API 418 passing (incl. the §7.1 examples as unit tests and through `POST /recipes/preview`; every new route in the isolation registry, plus B's ids inside A's request bodies). Dashboard unit tests for formatting. Playwright e2e: an owner builds the demo menu in the dashboard and the preview shows Large + Oat + Extra shot = 36 g beans, 200 ml oat, 20 ml aren, 1 cup 16oz, 1 lid.
- Run: `docker compose up -d --build --wait && pnpm --filter @zurupos/dashboard test:e2e` (uses the installed Google Chrome).
- Fixed along the way: CORS only allowed GET/HEAD/POST (found by the e2e test, now covered by `test/cors.test.ts`).
- Known issues / notes: owner home with today's numbers, inventory pages, users/devices pages and the settings tax example are M6. `GET /device/bootstrap` is M4 (D-031). The e2e test needs the full stack running; it isn't in CI yet.
