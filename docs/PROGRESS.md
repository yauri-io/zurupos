# Build Progress

Update this file at the end of every milestone (SPEC §16). Keep entries short: what's done, how to run/verify it, known issues.

| # | Milestone | Status | Review stop |
|---|---|---|---|
| M0 | Repo scaffold, Docker Compose, skeletons, CI | ✅ Done | |
| M1 | DB roles, migrations, RLS, auth, permissions | ✅ Done (reviewed) | **User review required** |
| M2 | Menu, modifiers, ingredients, recipes, discounts, settings | ✅ Done | |
| M3 | Pricing engine, orders, void, stock ops, low-stock email | ✅ Done (reviewed) | **User review required** |
| M4 | Flutter cashier app | ✅ Done | |
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

### M3 — 2026-11-17
- Done:
  - `src/domain/pricing.ts` (SPEC §6, bigint only) + `test/fixtures/pricing-cases.json` (53 cases incl. payments). Expected values come from an independent Python implementation (`apps/api/scripts/pricing-cases.py`).
  - `src/domain/avg-cost.ts` (weighted average, 4 dp half-up), `src/stock/ledger.ts` (the only writer of `stock_qty`: row + movement together, locks in id order), `src/stock/low-stock.ts` (§8).
  - `POST /orders` (§7.2: idempotent on `client_order_id`, server pricing, `PRICE_CHANGED`, payments §6.4, business date §12.1, daily numbering, snapshots, stock deduction, COGS, low-stock), `GET /orders/today`, `GET /orders/:id`, `POST /orders/:id/void` (restock at original cost, cashier approval by manager PIN with lockout), `POST /stock/in|waste|count`, `GET /admin/stock-invariant`.
  - Outbox worker (`src/worker`, Compose service `worker`) with retry backoff; SMTP to Mailpit locally, Resend in production. Low-stock email template (id/en).
- Tests: API 564 passing (29 files). Exit criteria:
  - ≥ 40 pricing fixtures: 53 (`test/domain/pricing.test.ts`).
  - Concurrency: 20 parallel orders on the same ingredients (lines in opposite orders) → exact final stock, order numbers 1–20, no deadlocks (`test/orders/concurrency.test.ts`).
  - Idempotency: same `client_order_id` ×5 sequentially and ×5 in parallel → one order, stock deducted once (`test/orders/create.test.ts`).
  - Stock invariant (Σ movements = stock_qty) checked after orders, voids, stock ops and concurrency.
  - Low-stock email arrives in Mailpit exactly once per crossing, and again after re-arming (`test/worker/outbox.test.ts`).
  - Isolation suite covers every M3 route, including B's ids in order bodies.
- Run: `docker compose up -d --build --wait && pnpm db:migrate:test && pnpm --filter @zurupos/api test` (the worker test needs Mailpit on :8025).
- Known issues / notes: `GET /orders` (filtered list) is M6 (D-034). Changing an ingredient's threshold doesn't send an alert by itself; the next stock change does. The Dart pricing port (same fixtures) is M4. The 20-order concurrency test uses a 20-connection pool; production uses `DATABASE_POOL_MAX` (10).

### M3 review — 2026-11-17
- User reviewed M3 and approved continuing. Stock-in/waste/count dashboard pages stay in M6 as planned (the API exists since M3).

### M4 — 2026-11-18
- Done:
  - API: `GET /device/bootstrap` with a content-hash `menu_version` and `?since` → 304 (D-040).
  - Flutter app (`apps/cashier`):
    - Screens: pairing; staff picker with PIN pad and lockout countdown; register (category tabs, colour tiles, sold-out greyed, cart with qty stepper, swipe delete, line note/discount, order type, customer name, order discount, totals, Pay); modifier sheet; payment (enabled methods, cash quick amounts + pad + change, provider chips + reference, split payments); Done (order number, change, 5 s auto-return); orders today (search, detail, void with owner/manager PIN approval for cashiers); stock (levels with low/negative badges, stock-in in base or purchase units, waste, count); settings (language, sold-out toggles). Employee home is orders today + stock.
    - Dart pricing port (`lib/domain/pricing.dart`) passing all 53 shared fixtures; the app's copy is checked against the API's.
    - drift local store: menu cache, pending orders (written before sending, retried with the same `client_order_id`, D-042), settings. Device token in secure storage.
    - Heartbeat every 30 s + offline banner (Pay disabled); menu refresh on login, every 5 min and on `PRICE_CHANGED`; idle auto-lock; screen kept awake on the register.
- Tests: API 572 passing. Flutter 104 passing (`flutter test`): 53 pricing fixtures, domain (cart, selection, payment, formatting), drift store, and widget tests for pairing/PIN/roles, the cart, payment (cash, split, partial cash, pending + retry, `PRICE_CHANGED`), orders today + void with approval, and the stock screens.
- Against the local API: `ZURU_API_URL=http://localhost:4000 flutter test test/integration` (2 tests, passing) pairs, signs in, loads bootstrap (and a 304), takes a split-paid order whose server total matches the app's, retries it idempotently, checks stock deduction, voids it with owner approval and restock, and recovers from a price change.
- Run: see `apps/cashier/README.md` and CLAUDE.md commands.
- Manual checks for the user (no emulator or tablet on this machine, D-043):
  1. `docker compose up -d --build --wait`; create a shop (signup API) and its menu in the dashboard.
  2. `cd apps/cashier && flutter run --dart-define=API_BASE_URL=http://<this-mac's-LAN-IP>:4000` on the tablet.
  3. Pair with the owner's email/password, sign in as a cashier, take a cash order and a split order, see them in the dashboard API / orders today, void one with the owner's PIN.
  4. Turn Wi-Fi off before *Selesai*: the order stays pending with *Coba lagi*; turn it back on and retry: one order, same number.
- Known issues / notes: reprint and print status are M5. Done-screen auto-return isn't configurable yet (M5 device settings). CI runs `flutter analyze` and `flutter test` (the integration test skips without `ZURU_API_URL`); CI still hasn't run on GitHub.
