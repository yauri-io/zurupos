# Decisions Log

Record every product or technical decision that isn't spelled out in `SPEC.md`, or that changes it. Newest at the bottom. Format:

```
## D-xxx — Short title (YYYY-MM-DD)
**Context:** why this came up
**Decision:** what was chosen
**Consequences:** what this affects / what to watch
```

---

## Decisions made during planning (2026-11-15/16)

## D-001: Record payments, never process them
**Decision:** ZuruPOS records how an order was paid (cash, QRIS, debit, credit, transfer, other, split). No payment gateway, no PJSP licensing, no MDR.
**Consequences:** Reconciliation (payments report vs. bank app and cash drawer) is a core value, not an afterthought.

## D-002: Counter-service workflow only for MVP
**Decision:** Order → pay → prepare. No tables, open bills or kitchen routing in MVP.
**Consequences:** Orders are created already paid. QR table ordering (next phase) will introduce unpaid states; see SPEC §14.2.

## D-003: One plan, one flat price, no tiers or add-ons
**Decision:** Single all-inclusive plan. Billing is not part of the MVP; the pilot is free.

## D-004: Inventory and recipes are in the MVP
**Decision:** Ingredient-level stock with recipes and modifier effects (add / remove / replace), weighted average cost, low-stock alerts.

## D-005: Single-screen counter flow
**Decision:** One cashier device; barista gets a printed ticket. Second-screen barista queue is post-MVP and optional.

## D-006: No shifts in MVP
**Decision:** No shift open/close or cash count. Accountability comes from recording the user on every order, void and stock movement.

## D-007: Four fixed roles, PIN for everyone
**Decision:** Owner, manager, cashier, employee. All use a PIN on the paired counter device; owner and manager also have email + password for the dashboard. No custom roles. Permission matrix: PRD §6.

## D-008: Self-hosted Postgres with RLS, no Supabase
**Decision:** Plain PostgreSQL 16+ on the user's own server, with RLS enforced per SPEC §3, plus a mandatory isolation test suite.

## D-009: Stack
**Decision:** Fastify + Kysely (TypeScript) API, Nuxt 4 + Nuxt UI dashboard, Flutter Android cashier app.
**Context:** User is tech-agnostic and prioritises cashier UX and reliable Bluetooth/network printing, which favours a native app.

## D-010: Online-first MVP, offline-ready design
**Decision:** MVP requires a connection; the architecture follows SPEC §14.1 so offline mode can be added later.

## D-011: Prices exclude tax; tax and service charge optional per shop
**Decision:** Item prices exclude tax. PB1 (name configurable) and service charge are optional percentages; tax on top of service charge by default.

## D-012: Low-stock alerts by email only
**Decision:** Email via a transactional provider. No WhatsApp (pricing).

## D-013: Next phase = offline mode + static per-table QR ordering
**Decision:** After MVP: offline ordering, then QR table ordering with one static QR code per table.

---

## Decisions made at build kickoff (2026-11-17)

## D-014: Database roles are bootstrapped outside migrations
**Context:** SPEC §3.1 wants `zuru_owner` (NOLOGIN) to own the schema, with migrations run by a login role that becomes `zuru_owner`. Roles are cluster-level objects, so they don't belong in per-database dbmate migrations.
**Decision:** A local-only init script (`db/init/`, run by the Postgres container entrypoint as superuser) creates `zuru_owner` (NOLOGIN), `zuru_migrator` (LOGIN, member of `zuru_owner`, with `ALTER ROLE zuru_migrator SET role = zuru_owner` so every object it creates, including `schema_migrations`, is owned by `zuru_owner`), `zuru_app` and `zuru_worker` (LOGIN, `NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`), and the `citext` extension. Passwords come from env. dbmate always connects as `zuru_migrator`. Production setup will be documented in `docs/DEPLOY.md` later (not executed).
**Consequences:** Migrations contain tables, RLS, grants and `auth.*` functions only. The isolation suite asserts role attributes and ownership (§3.6 #4).

## D-015: DELETE grants for `zuru_app`
**Context:** SPEC §3.1 says DELETE "only where explicitly listed" but lists none. Three endpoints replace a set of child rows (`PUT /items/:id/modifier-groups`, `PUT /items/:id/recipe`, `PUT /modifier-options/:id/effects`).
**Decision:** `zuru_app` gets DELETE on `item_modifier_groups`, `recipe_lines` and `modifier_option_effects` only. Everything else is archived/revoked, never deleted. `stock_movements` and `audit_log` get INSERT + SELECT only.
**Consequences:** A grants test asserts this exact list.

## D-016: Users and devices APIs are built in M1
**Context:** M1 includes auth (§5.1–5.3), but PIN login can't be exercised without staff users, and device revoke is part of §5.2. No milestone explicitly lists the users API.
**Decision:** M1 builds the backend for `/users` (create, update, reset PIN, deactivate) and `/devices` (pair, list, revoke). Dashboard pages for them stay in M6.

## D-017: Signup creates the tenant without a new SECURITY DEFINER function
**Context:** Signup has no tenant context yet.
**Decision:** The API generates the tenant uuid, opens `withTenant(newId)`, and inserts the tenant and owner in that transaction (the `with check` passes because the ids match). Email uniqueness is the global unique index on `users.email`; a violation returns `CONFLICT`. Signup also takes the owner's PIN (needed for the counter device). Gated by `SIGNUP_ENABLED` (default `false`).
**Consequences:** `CONFLICT` on signup reveals that an email is registered. That's acceptable while signup is flag-gated for the pilot; revisit before public signup.

## D-018: One `password_resets` table for resets and invites
**Decision:** The table is named `password_resets` with `purpose in ('reset','invite')`, matching `auth.find_password_reset`. Reset tokens expire in 1 h, invites in 72 h.

## D-019: Rate limits are in memory; PIN lockout is in the database
**Decision:** Login, signup, password-reset and per-device PIN rate limits use a small in-memory fixed-window limiter (`src/http/rate-limit.ts`; MVP runs one API process). The 5-failure PIN lockout (§5.3) lives in `pin_attempts`, so it survives restarts.
**Consequences:** Move the rate-limit store to Postgres or Redis if the API is ever scaled to more than one process.

## D-020: Dashboard session sliding expiry is written at most hourly
**Decision:** A dashboard session's `expires_at` (30 days) and `last_used_at` are refreshed only when the stored `last_used_at` is more than 1 h old, so authenticated reads don't each cost a write.

## D-021: Tooling choices
**Decision:** pnpm workspaces; Postgres 17 image (SPEC says 16+); dbmate runs from its Docker image via Compose (no host install needed); Kysely table types are generated with `kysely-codegen` from the local migrated DB and committed; GitHub Actions for CI. `COOKIE_SECURE` env var (default `true`; `false` in the dev `.env.example`, because Safari rejects `Secure` cookies on `http://localhost`).

## D-022: How the API-level isolation test (§3.6 #6) covers every route
**Decision:** The test loads the OpenAPI document from the running app. Every route with path params must have an entry in a registry that maps each param to a resource type of shop B. A meta-test fails if any route lacks one, so a new route can't go untested. Each mapped route is called with shop A's credentials and B's ids and must return 404. Every GET route without params is called as A, and the response must not contain any of B's ids or B's marker strings. Ids referenced in request bodies (e.g. `item_id` in `POST /orders`) are covered by per-module tests from M2 onward.

## D-023: How the DB-level insert test (§3.6 #1–2) avoids false passes
**Decision:** Each tenant table has a factory that builds a fully valid row, so an insert can only fail because of RLS. The test asserts SQLSTATE `42501` (RLS violation), not just "an error". A meta-test fails if any RLS table has no factory.

## D-024: The `auth.*` lookup functions need a `zuru_owner`-only SELECT policy (spec conflict)
**Context:** SPEC §3.4 says the four `auth.*` SECURITY DEFINER functions are owned by `zuru_owner`. SPEC §3.2 sets `FORCE ROW LEVEL SECURITY` on every tenant table. FORCE makes RLS apply to the table owner as well, and these lookups run with no tenant set, so as specified they would always return zero rows.
**Decision:** Keep `zuru_owner` as the function owner and keep FORCE RLS. Add one extra permissive policy per looked-up table (`users`, `sessions`, `devices`, `password_resets`): `create policy auth_definer_lookup on <t> for select to zuru_owner using (true)`. It grants SELECT only, and only to `zuru_owner`, which cannot log in. The only `zuru_owner` sessions are the four definer functions and migrations, which own the schema anyway.
**Consequences:** `zuru_app`'s isolation is unchanged. The isolation suite asserts that `zuru_app` is not a member of `zuru_owner` and that `auth_definer_lookup` policies exist only on those four tables, only for SELECT and only `TO zuru_owner`. Rejected alternative: a separate BYPASSRLS role owning the functions. It contradicts §3.4 and adds a role that bypasses RLS on whole tables.
**Approved by the user (2026-11-17) with hardening:** (1) `pg_temp` is last in each `auth.*` function's `search_path` (migration `…10_auth_functions_pg_temp`); (2) a startup guard (`apps/api/src/db/role-guard.ts`) makes the API refuse to boot when its DB role is superuser, has BYPASSRLS, is a member of `zuru_owner`, or owns any table in `public`/`auth`; (3) the isolation suite asserts `zuru_app` and `zuru_worker` have no CREATE on `public` and `auth`. SPEC §3.1, §3.4 and §3.6 #4 now reference this decision.

## D-025: Cash payment lines must record `tendered`
**Context:** SPEC §4.1 makes `payments.tendered` nullable ("cash only, ≥ amount"), and §6.4 computes `change_due` from cash lines.
**Decision:** `tendered` is required on cash lines (`≥ amount`) and must be null on non-cash lines, enforced by a CHECK constraint. The app's *Exact* button sends `tendered = amount`.
**Consequences:** `change_due` is always computable from stored rows; the drawer reconciliation never meets a cash line with an unknown tendered amount.
**Approved by the user (2026-11-17).**

## D-026: The cashier app sends `X-Requested-With: zuru` on every request
**Context:** The CSRF rule (SPEC §5.1) covers every state-changing request that has no device token. `POST /v1/devices/pair` comes from the app before it has a token.
**Decision:** The rule stays as written, with no route exemptions. The Flutter client sends `X-Requested-With: zuru` on every request. Native apps send no `Origin`, so the same-origin check passes.
**Consequences:** The M4 HTTP client must set the header globally.
**Approved by the user (2026-11-17).**

---

## Decisions made during M2 (2026-11-17)

## D-027: A `replace` effect may keep the same ingredient when it sets a quantity
**Context:** SPEC §7.1's *Less sugar* example is `replace aren → aren, qty 10`. The M1 CHECK on `modifier_option_effects` required `target_ingredient_id <> ingredient_id`, which rejects it.
**Decision:** Same-ingredient replace is allowed when `qty` is set (it changes the quantity). Without `qty` it would be a no-op and stays rejected.

## D-028: Quantities and unit costs are decimal strings in JSON; money is an integer
**Context:** `numeric(14,3)` quantities and `numeric(16,4)` costs must never pass through a float, and JSON numbers are floats in JS clients.
**Decision:** The API sends and accepts quantities and costs as decimal strings (`"150"`, `"7.5"`, at most 3 / 4 decimals). The domain parses them into scaled `bigint`s (`src/domain/decimal.ts`). Money (whole rupiah) is a JSON integer, capped at 999 999 999 999 (well inside 2^53), and converted to `bigint` at the API boundary.

## D-029: "CRUD" for menu entities means archive, not delete
**Context:** SPEC §4 says never hard-delete rows referenced by history; §9 lists CRUD.
**Decision:** `DELETE /categories/:id` (and items, modifier groups, modifier options, ingredients, discounts) sets `archived_at` and returns 204. Archived rows disappear from lists and can't be referenced by new menu links, recipes or effects. There is no unarchive in the MVP. Archiving a category with non-archived items is rejected (`CONFLICT`) so no item is orphaned from the POS grid. Archiving a modifier group also detaches it from items.

## D-030: Catalogue lists are not paginated
**Context:** §9 says list endpoints use cursor pagination. Menu, ingredient and discount lists are small per-shop configuration that the dashboard and the app need whole.
**Decision:** `GET /categories`, `/items`, `/modifier-groups`, `/ingredients`, `/discounts` return every non-archived row. Unbounded history lists (`/ingredients/:id/movements`, `/orders`) use cursor pagination (`?cursor=&limit=`, max 100).

## D-031: `GET /device/bootstrap` is built in M4
**Context:** §9 lists bootstrap; M2 builds the menu APIs and dashboard pages, M4 builds the app that consumes bootstrap.
**Decision:** Bootstrap ships with M4 together with its only consumer, so its payload is shaped by the real client. M3's `POST /orders` doesn't need it.

## D-032: An ingredient's `base_unit` is fixed after creation
**Context:** Recipe lines, effects, stock and movements are all expressed in the base unit. Changing `g` → `ml` would silently reinterpret every stored quantity.
**Decision:** `PATCH /ingredients/:id` doesn't accept `base_unit`, `stock_qty` or `avg_cost`. A wrong unit is fixed by archiving and creating a new ingredient. Stock and cost change only through stock operations (M3).

## D-033: Option order for recipe resolution follows the item's group order
**Context:** SPEC §7.1 orders selected options by "(group sort, option sort)". A group has its own `sort`, and the item→group link (`item_modifier_groups.sort`) also has one.
**Decision:** Groups are ordered by the item's link sort (the order set with `PUT /items/:id/modifier-groups`, which is also the modifier sheet order), then the group's own `sort`, then group id; options by `sort`. Selected options must belong to a group attached to the item; otherwise the request is rejected (`option_not_on_item`).

---

## Decisions made during M3 (2026-11-17)

## D-034: M3 order endpoints; the filtered order list is M6
**Context:** §9 lists `GET /orders` (filters), `GET /orders/:id`, `GET /orders/today`, `POST /orders/:id/void`. M3 is about the order transaction; the filtered list serves the M6 dashboard orders page.
**Decision:** M3 builds `POST /orders`, `GET /orders/today`, `GET /orders/:id` and `POST /orders/:id/void`. `GET /orders` with date/status/method/user/q filters ships with the M6 orders page.
- `GET /orders/:id`: the owner reads any order; managers and cashiers only orders of the current business day (for reprint and void). Employees use `GET /orders/today`, which gives them items and the total but no payment details (PRD §6 "view only").
- Cost fields (`cogs`, `cogs_total`, `avg_cost`, movement costs) only for `costs.view` (owner).

## D-035: `order_line_modifiers.seq`
**Context:** A line's modifiers are inserted in one transaction, so `created_at` can't order them, and receipts need a stable order.
**Decision:** New column `seq` (1-based), filled in modifier-sheet order (D-033). Reads order by it.

## D-036: Void approval failures and custom-discount snapshots
**Decision:**
- A wrong approval PIN returns `403 FORBIDDEN` with `details.reason = 'approval_invalid_pin'` (not 401, which the app treats as "your own session ended"). A locked approver returns `423 PIN_LOCKED`. The failure is committed so it counts towards the approver's 5-failure lockout on that device, like PIN login.
- The approver must be an active owner/manager of the same shop and not the requester. Owners/managers void without approval; an `approval` they send is ignored.
- Custom discounts are stored with `discount_id = null` and `name = null` (kind and value are kept); the app labels them at print time. Each order with a custom discount writes an `order.custom_discount` audit entry.

## D-037: Order validation errors
**Decision:** Unknown ids (or another shop's) → `404 NOT_FOUND`. Sold-out, inactive or archived items and options → `422 ITEM_UNAVAILABLE` with the id, so the app can refresh its menu. Modifier counts, options not on the item, discount scope and payment shape → `400 VALIDATION` with a `problem` code. `PRICE_CHANGED` (409) carries the server's full breakdown. Cash lines can't carry provider/reference.

## D-038: Waste note and reason share `stock_movements.reason`
**Context:** §7.4 waste takes a reason code and an optional note; the movement has one `reason` column.
**Decision:** Stored as `"<code>"` or `"<code>: <note>"`, so reports can group by the code prefix.

## D-039: Outbox worker
**Decision:** A separate process (`node dist/worker/worker.js`, Compose service `worker`) connects as `zuru_worker` and runs the same startup role guard as the API. Each pass claims up to 10 due rows with `for update skip locked`, sends them, and sets `sent`, or a retry after 1 m, 5 m, 30 m, 2 h, 6 h, or `failed` after 6 attempts. Only the error message is stored in `last_error`, never the email body. `EMAIL_PROVIDER=resend` uses Resend's HTTP API (not exercised locally; no network calls are made in dev or tests).

---

## Decisions made during M4 (2026-11-17)

## D-040: `GET /device/bootstrap` payload and `menu_version`
**Context:** §9 says `menu_version` is the max `updated_at`. Removing an item→group link deletes a row, and hiding an inactive category or option changes what the app should show without necessarily touching the rows it does show, so a max timestamp can stay the same while the menu changed.
**Decision:**
- `menu_version` is a SHA-256 (first 32 hex chars) of the payload itself. `?since=<menu_version>` → `304` with an empty body when it matches. Any visible change gives a new version, and nothing else does.
- The payload holds the settings subset (no alert settings), active non-archived categories and items (sold-out items included with `is_available: false`), each item's modifier group ids in sheet order (D-033), live groups with their active options, and active preset discounts. No costs, recipes or stock.
- Permission `orders.create` (owner, manager, cashier). Employees have no order screen; they use `GET /settings`, `/ingredients` and `/orders/today`.
**Consequences:** §14.1 #5 (delta sync later) still works: every table keeps `updated_at`; a delta endpoint can be added next to this one.

## D-041: Cashier app structure and tokens
**Decision:**
- Riverpod `Notifier`s per concern (`state/auth`, `menu`, `cart`, `checkout`, `connection`, `locale`); pure Dart domain in `lib/domain` (pricing port, cart, selection, payment); a hand-written client in `lib/api` (`ZuruApi` interface, `HttpZuruApi` over dio) per SPEC §2.
- The device token lives in `flutter_secure_storage`. The staff token is kept in memory only: restarting the app asks for the PIN again (the 12 h server session still ends on its own).
- The API address is a build-time setting: `--dart-define=API_BASE_URL=…` (default `http://10.0.2.2:4000`, the host's localhost from the Android emulator).
- Debug builds allow cleartext HTTP (`src/debug/AndroidManifest.xml`) so the app can reach the local Docker API; release builds keep Android's default and need HTTPS.
- The app mirrors the slice of the permission matrix it needs to choose screens (`lib/domain/permissions.dart`); the API stays the authority.

## D-042: What happens to an order the server didn't accept
**Context:** SPEC §11.2 says the payload is saved before sending and a network error keeps it pending.
**Decision:**
- Network error or 5xx: stays pending (`pending_orders.status = 'pending'`), the cart is cleared, a banner offers *Retry* with the same `client_order_id`, and *Pay* is disabled until it resolves.
- 4xx: the server refused the order for good, so the row becomes `rejected` and the cashier stays on (or returns to) the cart. `PRICE_CHANGED` and `ITEM_UNAVAILABLE` also refresh the menu and re-price the cart with the new prices.
- 401 (the staff session ended): stays pending and the app returns to the staff picker; whoever signs in next retries it. The server records that person as `created_by`, because the retry runs under their session.
- Synced and rejected rows are kept in SQLite for troubleshooting.

## D-043: M4 scope details
- **Sold out:** cashiers may toggle sold out (`menu.availability`), so besides the Settings list (owner, manager) a long press on an item tile toggles it.
- **Reprint and print status** (Orders today, Done screen) arrive with printing in M5. The Done screen's auto-return is fixed at 5 s until the device settings in M5 make it configurable.
- **"Manual run against the local API":** this machine has no Android emulator or device. The run is automated instead: `test/integration/local_api_test.dart` drives the app's own state layer and HTTP client against the Docker API (pair, PIN, bootstrap + 304, split-paid order, idempotent retry, stock deduction, void with approval and restock, `PRICE_CHANGED` refresh). A debug APK builds. Running it on a real tablet is listed for the user in PROGRESS.

---

## Decisions made during M5 (2026-11-18)

## D-044: Printing implementation
- **ESC/POS bytes** come from a small encoder in the app (`lib/printing/escpos.dart`) instead of a package, so the renderer output is exact and golden-testable. Text is ASCII-only: common accents and typographic quotes/dashes are transliterated, anything else prints as `?` (SPEC §11.3 "ASCII-safe").
- **Sizes:** "double" = double height (same 32/48 columns); "quad" = double width and height (16/24 columns). The receipt's shop name and TOTAL are double; the ticket's order number is quad and the customer name double.
- **Bluetooth:** `print_bluetooth_thermal` (Android SPP; most used and recently maintained of the options compared), wrapped in `BluetoothClassicTransport`. Android 12+ `BLUETOOTH_CONNECT`/`BLUETOOTH_SCAN` are requested at runtime via `permission_handler` (pinned to ^12: version 13 needs compileSdk 37, which the current Android Gradle plugin doesn't support). Printers are paired in Android settings and picked from the bonded list.
- **Network:** `Socket.connect(host, port default 9100, timeout 3 s)`.
- **Queue:** one job at a time (the Bluetooth plugin holds a single connection), 10 s limit for connect + write, then `failed` with a reason and a *Retry* button. Jobs are queued only after the server accepted the order, and run asynchronously; a failure never touches the order (SPEC §11.3). Jobs are stored in the `print_jobs` table (drift schema v2).
- **Language:** receipts and tickets use the device's language. A custom discount (no name, D-036) prints as "Diskon" plus its rate.
- **Times** print in the shop's time zone (`timezone` package; unknown zones fall back to Asia/Jakarta).
- **Device settings:** printers (up to 2) and the Done screen's auto-return seconds (default 5, 0 = off) are stored on the device, not on the server.
- **Reprint:** owner, manager and cashier reprint receipts and tickets from the order detail. Employees can't open order detail (D-034), so they reprint tickets from today's list; `GET /orders/today` items now include the line note for this.

---

## Decisions made during M6 (2026-11-18)

## D-045: Report details and charts
- **Charts** are plain CSS bars (`components/BarChart.vue`) instead of a chart library: the dashboard needs two simple bar charts (net sales by day and by hour), which this covers without adding a dependency.
- **Ranges** are inclusive business dates, at most 366 days, kept in the URL (`?from=&to=`). "Today" is the shop's business date (time zone and cutoff come from `/auth/me`).
- **Order-discount allocation** (§12.2): each line gets `floor(order_discount × line_net / Σ line_net)`; the remainder goes to the largest line (ties: lowest line number).
- **Categories** group by the category name stored on the order line (what was sold), not the item's current category. Items are named by their most recent sale.
- **Voids** are reported by the order's business date. **Margin %** is in basis points of net sales, half away from zero, and null when there were no sales. **Stock value** counts negative stock as zero and rounds each ingredient half-up.
- `/reports/margin` and `/reports/stock-value` need `costs.view`; the other reports need `reports.view` (both owner only today).
- `GET /orders` searches order number (exact), customer name and item name (literal text, `%` and `_` escaped), newest first, keyset-paged on `(paid_at, id)`.

---

## Decisions made during M7 (2026-11-18)

## D-046: The demo seed is a script that drives the API
**Context:** SPEC §13 names `db/seeds/demo.sql` with ~200 historical orders. Writing orders, lines, payments, COGS, stock movements and counters by hand in SQL would bypass the pricing, recipe and stock rules, and could break the money CHECKs or the stock invariant.
**Decision:** `pnpm db:seed` runs `apps/api/scripts/seed-demo.ts`, which builds the shop through the API in-process, so all ~200 orders are priced, costed and deducted by the real code. Afterwards, using the migration role, it moves the orders back over 14 days (`paid_at`, `business_date`, numbering per day, counters) and backdates the stock movements. Data is deterministic (fixed pseudo-random seed). Tax 10% and service 5% are configured but off, as §13 says. The script refuses to run if the demo owner already exists. `db/seeds/README.md` points to it.

---

## Decisions made during UAT (2026-11-18)

## D-047: Payment provider "Lainnya" with free text
**Context:** SPEC §11.1 #5 shows optional provider chips for non-cash payments, and `payments.provider` is free text (≤ 40 characters). In UAT the owner needed a provider outside the short chip list (e.g. a QRIS acquired by another bank).
**Decision:** every non-cash method shows its chips plus **Lainnya**, which opens a text field. The typed name (trimmed; empty means no provider) is sent as `provider`. The API already validates the length, and reports group by method and provider. Typed names are not saved as new chips; spelling differences show up as separate rows in the payments report.
