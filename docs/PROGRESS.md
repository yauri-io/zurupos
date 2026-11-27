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
| R1 | Operational heatmap (SPEC §12.4) | ✅ Done, deployed 2026-11-25 | |
| R2 | Menu matrix (SPEC §12.5) | ✅ Done, deployed 2026-11-25 | |
| R3 | Report emails (SPEC §12.6) | ✅ Done, deployed 2026-11-25 | D-075 approved 2026-11-25 |

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
  - Auth (SPEC §5.1–5.3): signup (flag-gated), login/logout/me, CSRF, password reset and manager invite (enqueued to outbox), device pairing/list/revoke, staff picker, PIN sessions with per-device lockout, heartbeat, in-memory rate limits. Since 2026-11-24: optional Cloudflare Turnstile on dashboard login, off until `TURNSTILE_SECRET_KEY` and the site key are set (D-064; DEPLOY.md "Login bot check"). Not yet turned on in production.
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
  - Print queue (`state/printing.dart`): auto-print after the order is committed; one job at a time, 10 s timeout; status per printer on the Done screen with *Retry*; jobs stored in `print_jobs`. Reprint receipt/ticket from order detail; employees reprint tickets from today's list. Drawer kick (`ESC p 0 25 250`) after a receipt with cash when enabled. Settings: add/edit/remove printers, test print with a column ruler, auto-return seconds. Since 2026-11-24: new printers don't auto-print and the printer list marks auto-print roles (D-061); the Done screen's auto-return waits for this order's printing and stays off after a failure or a touch (D-062); roles without auto-print get a *Cetak struk* / *Cetak tiket* button on the Done screen (D-063).
  - API: `GET /orders/today` items include the line note (for ticket reprints).
- Tests: Flutter 133 passing (the live-API integration test is skipped without `ZURU_API_URL`). Golden byte files for receipt, voided receipt, ticket and test page at 58 and 80 mm (`test/goldens/*.bin` plus readable `.txt`), with a check that no line is wider than the paper. Widget tests: auto-print to two printers, drawer kick only with cash, a printer that's off (order done, failure shown, Retry prints), a printer that hangs (fails after 10 s), voided reprint with the VOID banner, employee ticket reprint, printer settings + test print, Bluetooth pick, auto-return off. `NetworkTransport` is tested against a real loopback TCP server. API 572 passing.
- Run: `cd apps/cashier && flutter test`; regenerate goldens after an intended layout change with `UPDATE_GOLDENS=1 flutter test test/printing` and review the `.txt` diff.
- **Manual printer tests for the user** (need real hardware):
  1. Bluetooth (58 mm, e.g. a common RPP02N/EPPOS-type printer): pair it in Android settings. In the app go to Settings → Add printer → Bluetooth → pick it, set it to Customer receipt, and press *Test print*. The ruler should show exactly 32 digits on one line.
  2. Network (80 mm, port 9100): add it by IP, set it to Barista ticket, and run *Test print* (48 digits).
  3. Take a cash order: the receipt prints on printer 1 and the ticket on printer 2. A drawer connected to the printer stays shut (drawer kick removed, D-067).
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


### Deployed — 2026-11-22
- The landing page is live at `https://zurupos.com`; `www` redirects to it. Its main action is *Chat via Whatsapp* (0851-9009-5200).
- The server runs `1b544bc`, and only Caddy was restarted.
- A backup taken just before the update reached R2 (10 dumps in the bucket).
- Checked through Cloudflare:
  - CSP and headers are set, with no console errors on desktop or a 375 px phone.
  - `/healthz` is ok and the dashboard login loads.
- Open: the page shows no price yet (BRAND.md: no "starting from").

### Monitoring live — 2026-11-22
- Set up by the owner (D-052): a Healthchecks.io check for the nightly backup (`BACKUP_PING_URL` in `deploy/.env.prod`) and UptimeRobot monitors on `/healthz` and the dashboard login.
- Sentry: the API project receives events (test event from the server). An earlier 403 was a setting on the Sentry side. The test command is in DEPLOY.md, "Error reporting".

### Menu setup feedback — 2026-11-23 (deployed 2026-11-24)
- The menu page keeps the open category in the URL and for the session: the item page's back button, the sidebar and a reload reopen it.
- Add-on groups can be put on many items at once (D-054): *Pakai di menu* on each group opens the items by category with a tick-all per category; `PUT /v1/modifier-groups/:id/items` saves it in one transaction.
- Tests: API catalog + RLS suites (287), dashboard e2e 5 (new `menu-setup.spec.ts`).

### Release automation — 2026-11-23
- Done: `.github/workflows/cashier-release.yml` builds, signs and publishes the cashier APK to R2 (`dl.zurupos.com`) and a GitHub Release when a `cashier-v*` tag is pushed (D-055). `build_release.sh` passes extra args (`--build-name`, `--build-number`) to `flutter build apk`.
- Run: one-time setup and release steps in `docs/DEPLOY.md` §5, "Automatic release".
- Verified: the first tagged release built on GitHub and published to R2 (after fixing the signer-digest check for build-tools 37).
- Landing page footer links to the latest APK ("Unduh aplikasi kasir (Android)"). Goes live with the next server update (DEPLOY.md §6).

### New-owner guidance — 2026-11-24
- Done (D-056): setup checklist on Home (signup lands there), teaching empty states on the menu, modifier, ingredient, stock, discount and device pages, and (?) help tips on settings, ingredient, modifier, item, staff and discount forms. The user guide mentions both.
- Run: `pnpm --filter @zurupos/dashboard test` (checklist rules in `test/setup.test.ts`), `pnpm --filter @zurupos/dashboard test:e2e` (signup now expects Home with the checklist).
- Tests: dashboard unit 43, e2e 5.
- Deployed 2026-11-24 00:30 WIB (backup `zuru-20261124-0030.dump` first). The dashboard rebuild also shipped the 2026-11-23 menu setup changes.

### Build version — 2026-11-24
- Done (D-057): `deploy/prod.sh` names each build `YYYY.MM.DD-<sha>` from git and bakes it into the API and dashboard images; `/healthz` returns it, the dashboard shows it (sidebar footer, login page), and open tabs offer **Muat ulang** when the server runs a newer build. Sentry's release defaults to it.
- Run: `pnpm --filter @zurupos/dashboard test:e2e` (`version.spec.ts`), `pnpm --filter @zurupos/api test test/health.test.ts test/observability`. Verified on the local rehearsal stack.
- Deployed 2026-11-24 12:54 WIB (backup `zuru-20261124-1254.dump` first): `/healthz` and the dashboard report `2026.11.24-4b2fce6`. `SENTRY_RELEASE` is still set in the server's `deploy/.env.prod`, so Sentry keeps that value until it is emptied.
- 2026-11-24 13:37 WIB: deployed `2026.11.24-851308f` (help tips green and next to their labels; backup `zuru-20261124-1337.dump` first).

### User guide downloads — 2026-11-25
- Done (D-066): `zurupos.com/panduan/` with download buttons for the three user guide PDFs, hosted on R2 at `dl.zurupos.com/panduan/`. Footer link on all landing pages, sitemap entry. The sales deck stays off the site.
- Run: `cd apps/landing && python3 -m http.server 8765`, open `/panduan/`.
- Not live yet: upload the three PDFs to R2 (D-066), then deploy the landing page (DEPLOY.md §6).

### Navigation bar overlap — 2026-11-25
- Fixed (D-068): on Android 15+ the system navigation bar covered the bottom of the cashier app (modifier sheet *Tambah*, tablet *Bayar*, printer *Tes cetak*/*Simpan*, the end of long lists). The whole app now lays out above it.
- Run: `cd apps/cashier && flutter test test/widgets/system_insets_test.dart`.
- Tests: cashier 165 passed. Ships with the next cashier release (`cashier-v*` tag, DEPLOY.md §5); worth a look on the pilot tablet with 3-button navigation.

### Post-pilot reporting scope — 2026-11-25
- Done (docs only): PRD F15–F17 and roadmap, SPEC §12.4–12.6 and milestones R1–R3, D-069 to D-075. QR table ordering is deferred (D-069).
- D-075 (a fifth `auth.*` function for the report scheduler) approved by the user on 2026-11-25. The daily email is sent also on days without orders (owner's choice).

### R1 Operational heatmap — 2026-11-25
- Done: `GET /v1/reports/heatmap` (pure `domain/heatmap.ts`), dashboard *Laporan → Jam ramai* (`/reports/heatmap`) with 4/8/12-week presets, orders / net sales switch, insight sentence once every trading weekday has 3 weeks of data, rank-based shading.
- Run: `pnpm --filter @zurupos/api test test/domain/heatmap.test.ts test/reports test/rls`, `pnpm --filter @zurupos/dashboard test`, `pnpm --filter @zurupos/dashboard test:e2e e2e/reports-pages.spec.ts` (heatmap at 375 px).
- Tests: API 652 (heatmap unit 10, integration 7, route sweep), dashboard unit 55, reports e2e green. Checked by eye on the demo shop (desktop and 375 px, light and dark).
- Known issues: the pilot has under a week of data, so the page shows the "Data baru" banner for its first weeks. Deployed with R2.

### R2 Menu matrix — 2026-11-25
- Done: `GET /v1/reports/menu-matrix` (pure `domain/menu-matrix.ts`, signed `divRound` in `domain/decimal.ts`), dashboard *Laporan → Evaluasi menu* (`/reports/menu`, owner only): category picker, cost coverage line, *Andalan / Naikkan harga / Promosikan / Evaluasi* with the price-rise estimate, *HPP belum lengkap* list with links.
- Run: `pnpm --filter @zurupos/api test test/domain/menu-matrix.test.ts test/reports test/rls`, `pnpm --filter @zurupos/dashboard test`, `pnpm --filter @zurupos/dashboard test:e2e e2e/reports-pages.spec.ts`.
- Tests: API 677 (matrix unit 17, integration 6, route sweep incl. a foreign `category_id` → 404), dashboard unit 56, reports e2e green. Checked by eye on the demo shop at desktop and 375 px.
- Decisions made while building (SPEC §12.5): coverage below half is compared exactly, not on the rounded percentage; without `category_id` the API picks the best-selling category and returns the category list for the picker; a `no_sales` state.
- User guide: sections *Jam ramai* and *Evaluasi menu* added (`docs/USER_GUIDE.id.md` §9). The published guide PDFs (D-066) don't have them until regenerated and re-uploaded.
- Deployed 2026-11-25 18:25 WIB (backup `zuru-20261125-1822.dump` first, copied to R2): `/healthz` reports `2026.11.25-44783ec`. No migrations, no Caddy or landing changes.

### R3 Report emails — 2026-11-25
- Done: migrations `20261125100000_report_emails` (summary switches on `tenants`, append-only `report_email_runs` with RLS, `auth.report_schedule()` per D-075) and `20261125100100_outbox_report_kinds`; scheduler process `dist/scheduler/scheduler.js` (Compose service `scheduler`, as `zuru_app`, every 5 min) with pure `domain/report-schedule.ts`; templates `daily-summary.ts` / `weekly-summary.ts` with the API's IDR formatter (`outbox/templates/format.ts`); switches in Settings (API + dashboard); `restore.sh` stops the scheduler too; DEPLOY.md and the user guide updated.
- D-076 (found while reading the first weekly email): suggested price rises capped at about 10 % of the selling price per portion; this changes the deployed *Evaluasi menu* as well.
- Run: `pnpm --filter @zurupos/api test test/scheduler test/domain test/rls test/menu/settings.test.ts`; locally `docker compose up -d --build --wait` and watch `docker compose logs scheduler` plus Mailpit (:8025).
- Tests: API 713 (RLS suite 270 incl. the new table and the fifth definer function; scheduler integration 8; schedule 8 and template 7 unit), dashboard unit 56, e2e 6. Checked in Mailpit: the demo owner got the daily (empty day) and weekly emails, owner only.
- Known issues: the guide PDFs (D-066) don't have the R1–R3 sections yet.
- Deployed 2026-11-25 20:55 WIB (backup `zuru-20261125-2051.dump` first, copied to R2): `/healthz` reports `2026.11.25-b159ed4`; both migrations applied; `scheduler` healthy. First pass: 2 daily summaries for 24 Nov queued and sent by the worker, 2 weekly summaries for 16–22 Nov skipped (no orders), 0 failures.

### Busy-hours net sales readability — 2026-11-26
- Fixed (D-077): on **Jam ramai → Penjualan bersih** the cells were shaded but blank, so the report looked empty. They now show the rounded average (`45rb`, `1,2jt`), with a line explaining it. The data was always there; recipes and ingredients don't affect this report.
- Run: `pnpm --filter @zurupos/dashboard test` (`formatIdrShort` in `test/format.test.ts`), `pnpm --filter @zurupos/dashboard test:e2e reports-pages`.
- Tests: dashboard unit 72, e2e reports-pages passed.
- Deployed 2026-11-26 01:03 WIB as `2026.11.26-184a390` (backup `zuru-20261126-0102.dump` first). The build also carries the cashier nav-bar fix (D-068) in git, but tablets only get it with the next `cashier-v*` release.

### Guide PDFs refreshed — 2026-11-26
- Done (D-066): the source Claude Doc *Panduan Pengguna ZuruPOS* got sections D5 *Jam ramai*, D6 *Evaluasi menu* and D7 *Email ringkasan* (figures D11–D15 from the demo shop), two rows in the D2 report table, an *Email ringkasan* line in A2, and no *Buka laci kas* step or switch in A8/A13 (D-067). Parts 1 and 3 re-exported (part 2 unchanged) and uploaded over the same names on `dl.zurupos.com/panduan/`; `/panduan/` shows part 3 as 22 pages, 3.9 MB (`c570761`, pulled on the server).

### Online menu scoped — 2026-11-27
- Scoped after a brainstorm with the owner (D-078 to D-083): a public, read-only menu with a mini shop profile at `menu.zurupos.com/<slug>` (PRD F18–F19, SPEC §12.7), built as milestones O1 (data, images, dashboard) → O2 (public page, three templates) → O3 (view counts). Item photos are now allowed, for the online menu only (D-079). The sixth `auth.*` function, `auth.find_public_menu`, was approved by the user on 2026-11-27 (D-081).
- Not built yet. Deploying it later needs DNS for `menu.` and `media.`, an R2 bucket for media and its keys, set up by the user.

### O1 Online menu: data, images and dashboard — 2026-11-27 (local; not deployed)
- Done (SPEC §12.7, D-078 to D-087):
  - Migration `20261127100000_online_menu`: `media`, `menu_profiles`, `menu_slugs`, `menu_hours`, `menu_gallery`, `menu_views_daily` (ENABLE + FORCE RLS, composite FKs to `media`), and `items.show_online`, `is_recommended`, `photo_media_id`. DELETE only on `media`, `menu_hours`, `menu_gallery` (D-084). No new `SECURITY DEFINER` function, no new definer policy.
  - `apps/api/src/media/`: `MediaStore` with `local` (folder served under `/media/m/*`) and `s3` (R2, SigV4 via `aws4fetch`) drivers; the sharp pipeline (signature check, JPEG/PNG/WebP only, 40 MP, first frame, EXIF rotate, no metadata, WebP q80 variants per purpose, never upscaled); process → put → transaction → delete replaced objects after commit, or the new ones on failure.
  - `modules/online-menu`: `GET/PATCH /online-menu`, `PUT /online-menu/hours`, publish/unpublish, `PUT/DELETE /online-menu/logo|cover`, `POST /online-menu/gallery`, `DELETE /online-menu/gallery/:id`, `PUT/DELETE /items/:id/photo`; `show_online` and `is_recommended` via `PATCH /items/:id`. Slug rules and the reserved list (`reserved-slugs.ts`), limits under the `menu_profiles` row lock, audit entries, permissions `online_menu.manage` (owner) and `online_menu.items` (owner, manager).
  - Bootstrap unchanged (no photo fields; `menu_version` doesn't move for online-only changes, D-085). The cashier's availability response keeps its old fields.
  - Dashboard: *Menu online* (`/online-menu`, owner): status with publish switch, link and copy, QR PNG 1024 px and a printable A6 card (`/online-menu/card`), *Tampilan*, *Profil*, *Jam buka*, *Galeri*. The item page's *Menu online* card: photo, *Tampilkan online*, *Rekomendasi* n/5. Photos are shrunk in the browser first. id + en.
  - Seed: `kopi-demo`, unpublished, *Papan*, description, hours, three recommended items, no photos.
  - `.env.example`, `docker-compose.yml` (a `media` volume) and the production compose/env example have every `MEDIA_*` var and `MENU_PUBLIC_BASE_URL`; the dashboard CSP allows `MEDIA_PUBLIC_BASE_URL`.
- Run:
  - `pnpm db:migrate && pnpm db:migrate:test`
  - `pnpm --filter @zurupos/api test test/online-menu test/media test/rls` (or the whole suite)
  - `pnpm --filter @zurupos/dashboard test`; with the stack up, `pnpm --filter @zurupos/dashboard test:e2e e2e/online-menu.spec.ts`
- Tests: API 888 (online-menu 99: profile/slug/hours/publish/permissions 74, uploads 18, items/limits/bootstrap 7; media pipeline + stores 24; RLS suite 322 with the six new tables, composite-FK and slug-visibility checks, and the route sweep over the new routes, uploads sent as real multipart). Dashboard unit 117, e2e 8 (all specs). Cashier integration 3 against the rebuilt stack. Checked by eye at 375 px and desktop.
- Found while building: the API image runs as `node`, so a fresh `media` volume was root-owned and uploads failed with `EACCES` in Docker; the image now creates `/data/media` owned by `node`. If an old local `zurupos_media` volume exists, `docker volume rm zurupos_media` once.
- Known issues / not in O1: no public page yet (O2), so *Buka halaman* and the QR point at `localhost:3001`/`menu.zurupos.com`, which don't answer until O2; no live preview (O2) or views card (O3). Deploying O1 needs the `zurupos-media` R2 bucket, its custom domain and token first (DEPLOY.md §3); the API won't start without `MEDIA_PUBLIC_BASE_URL` and `MENU_PUBLIC_BASE_URL`. The user guide has no *Menu online* section yet.

### O2 Online menu: public page — 2026-11-27 (local; IN PROGRESS, not deployed)
- Done and committed: `auth.find_public_menu` (D-081) with its DB tests (§3.6 #5 expects six); `GET /v1/public/menus/:slug` (read-only transaction, closed schemas, moved/404 rules, 120/min) and `GET /online-menu/preview`, with §3.6 #9 tests and public reads in the pool test; `packages/menu-ui` (page, three templates, `accent.ts`, tests); `apps/menu` (Nuxt SSR, 15 s cache, 308/302/404, head + JSON-LD, nonce CSP) and the compose `menu` service on :3001; the dashboard live preview; Caddy `MENU_DOMAIN` site and prod compose `menu` service (checked on the local rehearsal); CI `menu` job.
- Tests: API 911 green; menu-ui 63; `e2e/public-menu.spec.ts` passed (every template, no/all photos, 360 px and desktop, head/JSON-LD, 308 keeping `?s=qr`, ~81 KB gz page, 404 within 15 s of unpublishing).
- Open:
  - `e2e/run-each.sh` (new; runs each spec after an API restart because the suite needs more than 5 signups/hour): `build-menu.spec.ts` failed on its first run (timeout picking an option in a select listbox). Not investigated yet; it passed before the dashboard preview commit. Re-run, then fix before calling O2 done.
  - Still to write: DECISIONS entries for O2 choices (nonce CSP in the app rather than Caddy; menu-ui plain scoped CSS instead of Tailwind; `@zurupos/menu-ui/types`; cache-control `no-store` on the public API; e2e per-spec runner), DEPLOY.md (`menu.` DNS + Cloudflare origin rule, `MENU_DOMAIN`), the SPEC §3.4 sentence "the first five are live", CLAUDE.md commands, and a final full lint/typecheck/format pass.
