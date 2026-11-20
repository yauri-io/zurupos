# Build Progress

Update this file at the end of every milestone (SPEC §16). Keep entries short: what's done, how to run/verify it, known issues.

| # | Milestone | Status | Review stop |
|---|---|---|---|
| M0 | Repo scaffold, Docker Compose, skeletons, CI | ✅ Done | |
| M1 | DB roles, migrations, RLS, auth, permissions | ✅ Done (reviewed) | **User review required** |
| M2 | Menu, modifiers, ingredients, recipes, discounts, settings | ✅ Done | |
| M3 | Pricing engine, orders, void, stock ops, low-stock email | ✅ Done (reviewed) | **User review required** |
| M4 | Flutter cashier app | ✅ Done | |
| M5 | Printing (Bluetooth + network) | ✅ Done (manual printer test pending) | Manual printer test by user |
| M6 | Dashboard reports and remaining pages | ✅ Done | |
| M7 | Hardening, demo seed, user guide, UAT | 🔍 Awaiting UAT with the owner | UAT with the shop owner |

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

### M5 — 2026-11-18
- Done:
  - `lib/printing`: ESC/POS encoder; pure renderers `renderReceipt`, `renderTicket`, `renderTestPage` (58 mm = 32 columns, 80 mm = 48); `PrinterTransport` with `BluetoothClassicTransport` (Android SPP, runtime permissions, bonded devices) and `NetworkTransport` (TCP 9100, 3 s connect timeout); `PrinterConfig` (up to 2 printers: transport, address, paper, receipt/ticket roles, auto-print per role, drawer kick).
  - Print queue (`state/printing.dart`): auto-print after the order is committed; one job at a time, 10 s timeout; status per printer on the Done screen with *Retry*; jobs stored in `print_jobs`. Reprint receipt/ticket from order detail; employees reprint tickets from today's list. Drawer kick (`ESC p 0 25 250`) after a receipt with cash when enabled. Settings: add/edit/remove printers, test print with a column ruler, auto-return seconds.
  - API: `GET /orders/today` items include the line note (for ticket reprints).
- Tests: Flutter 133 passing (the live-API integration test is skipped without `ZURU_API_URL`). Golden byte files for receipt, voided receipt, ticket and test page at 58 and 80 mm (`test/goldens/*.bin` plus readable `.txt`), with a check that no line is wider than the paper. Widget tests: auto-print to two printers, drawer kick only with cash, a printer that's off (order done, failure shown, Retry prints), a printer that hangs (fails after 10 s), voided reprint with the VOID banner, employee ticket reprint, printer settings + test print, Bluetooth pick, auto-return off. `NetworkTransport` is tested against a real loopback TCP server. API 572 passing.
- Run: `cd apps/cashier && flutter test`; regenerate goldens after an intended layout change with `UPDATE_GOLDENS=1 flutter test test/printing` and review the `.txt` diff.
- **Manual printer tests for the user** (need real hardware):
  1. Bluetooth (58 mm, e.g. a common RPP02N/EPPOS-type printer): pair it in Android settings. In the app go to Settings → Add printer → Bluetooth → pick it, set it to Customer receipt, and press *Test print*. The ruler should show exactly 32 digits on one line.
  2. Network (80 mm, port 9100): add it by IP, set it to Barista ticket, and run *Test print* (48 digits).
  3. Take a cash order: the receipt prints on printer 1 and the ticket on printer 2. With *Open the cash drawer* on and a drawer connected, the drawer opens after the receipt; a QRIS-only order doesn't open it.
  4. Turn the printer off and take an order. Done shows *Gagal* within about 10 s and the order is in Orders today. Turn it on and press *Coba lagi*: it prints.
  5. Reprint a receipt from Orders today; void an order and reprint it: the *** BATAL *** banner shows.
  6. Check that the Indonesian text and Rp amounts line up in the columns on both paper widths.
- Known issues / notes: no printer was available here, so the Bluetooth and network transports are verified only up to the plugin and socket boundaries. The `print_jobs` rows are not pruned yet (they're small).

### M6 — 2026-11-18
- Done:
  - API: owner reports `GET /reports/summary|daily|hourly|items|categories|payments|margin|voids|stock-value` (SPEC §12.2, D-045); `GET /orders` with range, status, method, user and text filters and cursor paging; `business_day_cutoff_hour` in `/auth/me`; line notes in `GET /orders/today`.
  - Dashboard: owner home with today's numbers (refreshes every 60 s); reports for sales (cards, by day, by hour), payments, items/categories, margin + stock value, voids; orders list + detail; inventory levels, movements, stock-in, waste, count; users (add, edit, reset PIN, deactivate); devices (revoke); live tax and service example in settings. Date range picker with the five presets. Managers still land on `/menu`.
- Tests:
  - API 612 passing. The report tests use a seeded shop whose expected values were worked out by hand (including the order-discount allocation and margins). A mutation check confirmed they catch a broken remainder rule.
  - The isolation suite covers every new route. Reports that return only numbers are checked against A's own figures, computed with an explicit tenant filter.
  - Dashboard: 32 unit tests and 2 Playwright tests. The new one visits all 16 owner pages at 375 px, checks there is no horizontal scroll and checks the figures, then does a stock-in through the form.
- Run: `docker compose up -d --build --wait && pnpm --filter @zurupos/dashboard test:e2e`.
- Known issues / notes: the e2e tests still aren't in CI (they need the whole stack).

### M7 — 2026-11-18
- Done:
  - Dashboard signup page (linked from login), with an e2e test.
  - Demo seed `pnpm db:seed` (D-046): "Kopi Demo" with 15 ingredients, 10 items, 5 modifier groups with §7.1 effects, 2 presets, owner/manager/cashier/employee, a paired tablet, and 207 orders over 14 days. Stock matches its movement history afterwards; the orders are numbered 1..n per day.
  - `docs/USER_GUIDE.id.md`: owner setup guide in Bahasa Indonesia.
  - `docs/UAT.md`: the §17 checklist, with the automated evidence and what remains manual for each item.
  - Hardening:
    - CI now starts Mailpit for the worker test; without it the API job would have failed on GitHub.
    - New CI job runs the Playwright tests against the Docker stack.
    - No stray logging or TODOs in app code.
- Full regression (2026-11-18):
  - API 612 tests from a fresh test database.
  - Flutter 133, plus 2 against the live API.
  - Dashboard: 32 unit tests and 3 Playwright tests.
  - Lint, typecheck and formatting clean.
  - The debug APK builds.
- Known issues / notes:
  - The §17 UAT must be run on the real tablet and printers with the owner; the results table is in `docs/UAT.md`.
  - CI has still never run on GitHub (nothing pushed).
  - The Resend email provider has never sent a real email.
  - Deployment (`docs/DEPLOY.md`) is a later task and was not started.
  - Two local e2e runs within an hour hit the signup rate limit (`docker compose restart api` clears it).

### UAT round 1 — 2026-11-18 (tester, Galaxy S25 + Lenovo TB125FU, RPP02 Bluetooth)
- Fixed:
  - Bluetooth printing always failed: the plugin rejects a `Uint8List` without logging anything. Bytes are now sent as a plain list, and the app waits for the link to drain before closing. Verified on a real RPP02.
  - Signup and staff forms showed "Data tidak valid" for a weak PIN or password. They now say why, and the PIN rule is written under the field.
  - Payment provider *Lainnya* with a typed name (D-047).
  - Owner home now has the PRD's low-stock list and today's voids.
  - App settings: printers first; the sold-out list moved to its own searchable page. The paired-printer list has a reload button and reloads when you return from Android settings.
  - Unpair the device from the app (D-048, `DELETE /v1/device`).
  - The outbox worker (and the API) crashed when Postgres restarted. Idle pool errors are now handled and compose restarts the services.
- Answered (by design): negative stock (PRD), PINs not unique (SPEC §5.3), staff logout = *Ganti pengguna*. Tablet reports are deferred to the owner's decision.
- Tests: API 615, app 141 (1 skipped), dashboard e2e signup + reports pages.

### Deployment prepared — 2026-11-18 (not deployed)
- `deploy/`: production compose (Postgres, migrate, API, worker, dashboard, Caddy, nightly backup), Caddyfile for Cloudflare-fronted TLS, `env.prod.example`, `prod.sh`, `restore.sh` (D-049). How-to in `docs/DEPLOY.md`.
- Cashier release signing from `android/key.properties`; `apps/cashier/tool/build_release.sh <https url>`.
- Rehearsed locally:
  - The production stack over HTTPS with a self-signed certificate.
  - Browser signup through the real domain names: CORS, the `Secure` cookie and the CSP all work.
  - A spoofed `X-Forwarded-For` is ignored.
  - Backup, then `restore.sh check` and `replace`: the restored database keeps its owner, grants and forced RLS, and `zuru_app` sees no rows without a tenant.
  - Release APK: fails without a key, and is signed with the given key when one exists.
- The VPS was inspected read-only (Ubuntu 24.04, Docker; ports 80/443 taken by another stack). Nothing was deployed or changed there.
- Still the owner's steps: Cloudflare setup and origin certificate, Resend domain, the release keystore, `deploy/.env.prod`, pushing the commits so the server can pull them, then the deploy itself.

### Deployed — 2026-11-19
- `app.zurupos.com` and `api.zurupos.com` run on the VPS as stack `zurupos-prod`, at commit `6842fdc`, behind Cloudflare (Origin Rule → 9443). The commits were copied to the server with a git bundle; GitHub was not pushed.
- Checked through Cloudflare:
  - `/healthz` is ok.
  - HSTS and CSP are set on the dashboard.
  - Signup is off (404).
  - The real client IP reaches the API.
  - The login page works in a browser.
  - The worker started with Resend.
- Open:
  - Create the pilot shop (signup on briefly).
  - First real email (UAT 2, 10).
  - Release APK with the owner's key.
  - Off-server backup copies.
  - Cloudflare Web Analytics injects a beacon that the CSP blocks; turn the analytics off in Cloudflare or allow it in the Caddyfile.
- 2026-11-19 updates:
  - The wrong-password message.
  - Cloudflare Web Analytics allowed in the CSP.
  - All dashboard icons bundled; the production CSP had blocked the ones fetched from the Iconify API.
  - The pilot shop is registered and signup is closed again.
  - The server runs `fc79ebf`.

### 2026-11-20 (local; not on the server yet)
- From the owner: pushed to GitHub. The release APK builds. Forgot-password and invite emails arrive. Shop setup, printer tests, UAT and the dry run are in progress.
- Cashier app: a **Laporan** section for the owner only (D-051). It shows today or yesterday: total collected, orders and average order, gross sales to net sales, service charge and tax, per payment method, top 5 items and voids. It uses the existing owner report endpoints; the API still refuses other roles. Tests:
  - Widget tests: the figures, the yesterday switch, no section for manager, cashier or employee, and *Ganti pengguna* leaves the screen.
  - Business-date unit tests.
  - An integration test against the real API: the owner reads the day, a cashier gets 403.
- Backups (D-052): the nightly dump is copied to Cloudflare R2 (`R2_*` in `deploy/.env.prod`), and failed uploads are retried the next night. A Healthchecks.io ping fires after each run (`BACKUP_PING_URL`, with `/fail` on failure). Rehearsed locally with `rclone serve s3` in place of R2:
  - Upload works.
  - A wrong secret fails the run (exit 1, `/fail` ping), and the next run uploads the missed dump.
  - A dump fetched back from the bucket passes `restore.sh check`.
- Monitoring: DEPLOY.md now sets up UptimeRobot on `/healthz` and the dashboard, and Healthchecks.io for the backups. These are accounts the owner creates.
- Tests: app 147 (1 skipped) plus 3 against the live API.
- To go live: the R2 bucket, token and lifecycle rule, plus the two monitors (DEPLOY.md sections 3 and 4), then deploy these commits.
- Error reporting with Sentry (D-053), off until a DSN is set:
  - API: 500s with the request id, tenant, method and route; the worker reports crashed batches and emails that failed for good.
  - Dashboard: uncaught errors, with invite and reset tokens cut out of URLs.
  - Cashier app: crashes and unexpected errors (`SENTRY_DSN=<dsn> tool/build_release.sh ...`).
  - Never sent: bodies, cookies, tokens, query strings, IPs, emails or screenshots. Unit tests cover the scrubbers. A live check against a stand-in Sentry endpoint (API with Postgres stopped, dashboard in Chrome on an invite link) showed the expected tags and no secrets.
  - To turn it on: three Sentry projects and their DSNs (DEPLOY.md, "Error reporting").

