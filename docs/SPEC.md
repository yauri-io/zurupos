# ZuruPOS — Technical Specification (MVP)

| | |
|---|---|
| **Version** | 1.0 — final for MVP build |
| **Date** | 2026-11-16 |
| **Companion doc** | `docs/PRD.md` (read it first — this spec implements it) |
| **Audience** | The build agent and any engineer working on ZuruPOS |

---

## 0. Rules for the build agent

1. **Do not deploy** anything to any server, and do not connect to any remote host, unless the user explicitly asks in that moment. Local development only (Docker Compose on the dev machine).
2. Correctness of **money, stock and tenant isolation** outranks speed. Any change touching §3, §6, §7 or §8 must come with tests.
3. Code style: **functional over OOP** (plain functions and modules, no class hierarchies for business logic), **strict file separation** (one concern per file; route handlers, validation schemas, services and SQL queries in separate files), **small single-purpose commits** with clear messages.
4. Follow the milestone order in §16. Each milestone has exit criteria; don't start the next one until they pass.
5. When this spec is ambiguous, choose the option that is simpler and safer for money/stock, write the decision in `docs/DECISIONS.md`, and continue.
6. Never weaken an RLS rule, a test, or a validation to make something pass.

---

## 1. Architecture overview

```
┌──────────────────────────┐        ┌──────────────────────────┐
│  Cashier app (Flutter)   │        │  Dashboard (Nuxt 4)      │
│  Android tablet/phone    │        │  owner + manager, web    │
│  - ordering, payments    │        │  - reports, menu, stock  │
│  - PIN staff sessions    │        │  - settings, users       │
│  - BT / LAN printing     │        │                          │
└────────────┬─────────────┘        └────────────┬─────────────┘
             │ HTTPS JSON (/v1)                   │ HTTPS JSON (/v1, cookie session)
             └──────────────┬─────────────────────┘
                            ▼
              ┌──────────────────────────┐
              │  API (Node + Fastify)    │──────► Email provider (HTTP API)
              │  - auth, RLS context     │            ▲
              │  - pricing + stock txns  │            │
              │  - outbox worker         │────────────┘
              └────────────┬─────────────┘
                           ▼
              ┌──────────────────────────┐
              │  PostgreSQL 16+          │
              │  RLS on every tenant tbl │
              └──────────────────────────┘
```

- The **API is the only thing that talks to Postgres.** Both clients are untrusted.
- The **server is authoritative** for prices, totals, stock and permissions. The cashier app computes the same totals locally for instant display using the identical algorithm (§6), verified by shared test fixtures.
- One API process runs both HTTP and the outbox worker in MVP (worker can be split out later).

## 2. Tech stack and repository layout

### Stack

| Layer | Choice |
|---|---|
| API runtime | Node.js 22 LTS, TypeScript (strict) |
| HTTP framework | Fastify 5, schemas with TypeBox, `@fastify/swagger` to emit OpenAPI 3.1 |
| DB access | Kysely + `pg` (node-postgres). Raw `sql` template where needed. No heavy ORM. |
| Migrations | `dbmate` with plain `.sql` files (RLS policies live in SQL) |
| Database | PostgreSQL 16+ |
| Password/PIN hashing | `argon2` (argon2id) |
| Logging | `pino` (Fastify default), request id on every log line |
| Email | `EmailProvider` interface; default implementation: Resend HTTP API; second implementation: SMTP via `nodemailer` |
| Dashboard | Nuxt 4, Nuxt UI, TailwindCSS, `@nuxtjs/i18n` (id default, en), charts via a lightweight lib (e.g. `vue-echarts` or Chart.js wrapper) |
| Cashier app | Flutter (current stable), Dart 3, Riverpod for state, `dio` for HTTP, `drift` (SQLite) for local cache/outbox, `flutter_secure_storage` for device token, `intl` for formatting/i18n |
| Printing | ESC/POS byte generation (e.g. `esc_pos_utils_plus` or equivalent); Bluetooth classic SPP plugin for Android (evaluate maintained options, wrap behind interface); `dart:io` `Socket` for network printers |
| API tests | Vitest; integration tests against a real Postgres (Docker) — never mocks for DB |
| Flutter tests | `flutter_test`, widget tests for cart/payment |
| Local dev | Docker Compose: `postgres`, `api`, `dashboard`, `mailpit` (catches emails locally) |

### Repository layout (monorepo)

```
zurupos/
  docs/
    PRD.md
    SPEC.md
    DECISIONS.md
  db/
    migrations/            # dbmate .sql files
    seeds/                 # dev + demo seed (sample coffee shop)
  apps/
    api/
      src/
        app.ts             # fastify instance, plugins
        server.ts          # entrypoint
        config/            # env parsing (validated)
        db/                # kysely instance, types, withTenant()
        auth/              # dashboard sessions, device pairing, PIN sessions, guards
        modules/
          menu/            # routes.ts, schemas.ts, service.ts, queries.ts
          inventory/
          recipes/
          orders/
          discounts/
          reports/
          users/
          devices/
          settings/
        domain/
          pricing.ts       # pure functions, §6
          recipe-resolve.ts# pure functions, §7
          avg-cost.ts      # pure functions, §7.4
        outbox/            # enqueue + worker + email templates
      test/
        fixtures/pricing-cases.json   # shared with Flutter
        rls/               # isolation suite, §3.6
    dashboard/             # Nuxt 4 app
    cashier/               # Flutter app
  packages/
    api-client-ts/         # generated from OpenAPI for dashboard
  docker-compose.yml
  .env.example
```

- OpenAPI emitted by the API is the **contract**. Generate the TS client for the dashboard from it; the Dart client can be generated (`openapi-generator` dart-dio) or hand-written from it — keep it in `apps/cashier/lib/api/`.
- `apps/api/test/fixtures/pricing-cases.json` is copied/symlinked into the Flutter test folder by a script so both sides test the same cases.

## 3. Multi-tenancy and Row Level Security

Every shop is a **tenant**. Every tenant-owned row has `tenant_id uuid not null`. Isolation is enforced twice: by the API (every query filters by tenant) and by Postgres RLS (safety net that must hold even if the API has a bug).

### 3.1 Database roles

| Role | Purpose | Attributes |
|---|---|---|
| `zuru_owner` | Owns schema, runs migrations | `NOLOGIN` in prod (migrations run via a login role that `SET ROLE zuru_owner`), owns all tables |
| `zuru_app` | The API's runtime login | `LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`, **does not own any table** |

- `zuru_app` gets only `SELECT, INSERT, UPDATE` (and `DELETE` only where explicitly listed) on tenant tables, `USAGE` on sequences, `EXECUTE` on the `auth.*` functions in §3.4.
- **Never** connect the API as `postgres`, as a superuser, or as the table owner. Superusers and table owners bypass RLS silently.
- **Startup guard (D-024):** on boot the API (and the worker) checks `current_user` and refuses to start if the role is superuser, has `BYPASSRLS`, is a member of `zuru_owner`, or owns any table in `public`/`auth`. `zuru_app` and `zuru_worker` have no `CREATE` on schemas `public` and `auth`.

### 3.2 Table rules

For **every** tenant table:

```sql
alter table <t> enable row level security;
alter table <t> force row level security;

create policy tenant_isolation on <t>
  using (tenant_id = app_current_tenant())
  with check (tenant_id = app_current_tenant());
```

Helper (owned by `zuru_owner`, `SECURITY INVOKER`, `STABLE`):

```sql
create function app_current_tenant() returns uuid
language sql stable as $$
  select nullif(current_setting('app.tenant_id', true), '')::uuid
$$;
```

- `current_setting(..., true)` returns NULL when unset → `tenant_id = NULL` is never true → **no rows visible and no writes allowed without a tenant context.** This is the intended fail-closed behaviour.
- The `tenants` table uses `using (id = app_current_tenant())`.
- All views must be created `with (security_invoker = true)`.
- **No `SECURITY DEFINER` functions** touch tenant data, except the explicitly reviewed `auth.*` functions in §3.4.
- Child tables carry their own `tenant_id` (denormalised) and composite foreign keys `(tenant_id, parent_id) references parent(tenant_id, id)` so a child can never point at another tenant's parent. Parents therefore need `unique (tenant_id, id)`.

### 3.3 Request lifecycle

Every authenticated request that touches tenant data runs inside `withTenant(tenantId, fn)`:

```ts
// apps/api/src/db/with-tenant.ts
export const withTenant = <T>(db: Kysely<DB>, tenantId: string, fn: (trx: Transaction<DB>) => Promise<T>) =>
  db.transaction().execute(async (trx) => {
    await sql`select set_config('app.tenant_id', ${tenantId}, true)`.execute(trx); // true = LOCAL to this txn
    return fn(trx);
  });
```

- `set_config(..., true)` is equivalent to `SET LOCAL`: the value disappears at commit/rollback, so a pooled connection can never carry one tenant's context into another request. **Never use session-level `SET`.**
- `tenantId` comes **only** from the verified session/device token, never from the request body, query or path.
- Route handlers never receive a raw `db`; they receive `trx` from `withTenant`. Enforce with a Fastify decorator, e.g. `request.tenantTx(fn)`.
- Queries still include `where tenant_id = :tenantId` (defence in depth).

### 3.4 Pre-tenant lookups (the only RLS exceptions)

Login and token verification happen before a tenant is known. These use a small set of `SECURITY DEFINER` functions in a dedicated `auth` schema, owned by `zuru_owner`, with `set search_path = pg_catalog, public, pg_temp` pinned (`pg_temp` last), each returning the minimum columns needed:

| Function | Returns |
|---|---|
| `auth.find_login_by_email(email text)` | `user_id, tenant_id, role, password_hash, is_active` for owner/manager |
| `auth.find_session(token_hash bytea)` | `session_id, user_id, tenant_id, role, kind, device_id, expires_at, revoked_at` |
| `auth.find_device(token_hash bytea)` | `device_id, tenant_id, revoked_at` |
| `auth.find_password_reset(token_hash bytea)` | `user_id, tenant_id, expires_at, used_at` |

Because §3.2 forces RLS on the owner too, each looked-up table (`users`, `sessions`, `devices`, `password_resets`) has one extra policy, `auth_definer_lookup`: `for select to zuru_owner using (true)`. It is SELECT-only and only for the NOLOGIN owner role; `zuru_app` is never a member of `zuru_owner` (see D-024).

After the lookup, all further work (PIN check, session creation, etc.) runs inside `withTenant`. These four functions are the **complete** list of exceptions; adding one requires a `DECISIONS.md` entry and an isolation test. (Approved, added in R3: a fifth, `auth.report_schedule()`, for the report email scheduler, D-075. Until R3 ships, the four above are the complete list.)

### 3.5 System tables (no tenant RLS)

- `outbox` (§10): `zuru_app` gets `INSERT` only. The worker uses a separate login role `zuru_worker` with `SELECT, UPDATE` on `outbox` only and no access to tenant tables. Email content is fully rendered at enqueue time inside the tenant transaction.
- `schema_migrations` (dbmate).

### 3.6 Mandatory isolation test suite

Location: `apps/api/test/rls/`. Runs in CI against real Postgres as `zuru_app`. Must pass before any milestone after M1 is considered done.

1. **DB-level:** with no `app.tenant_id` set, `select count(*)` on every tenant table returns 0, and every `insert` fails.
2. **DB-level:** with tenant A set, rows of tenant B are invisible; `update`/`delete` targeting B's ids affect 0 rows; `insert` with `tenant_id = B` fails the `with check`.
3. **DB-level:** a script enumerates `pg_class` for all tables in `public` and asserts every table except the allowlist (`outbox`, `schema_migrations`) has `relrowsecurity = true` and `relforcerowsecurity = true`. New tables without RLS fail the build.
4. **DB-level:** assert `zuru_app` is not superuser, has no `BYPASSRLS`, owns no tables, is not a member of `zuru_owner`, and neither `zuru_app` nor `zuru_worker` has `CREATE` on schemas `public` or `auth`.
5. **DB-level:** assert the only `SECURITY DEFINER` functions are the four in §3.4.
6. **API-level:** create shops A and B with full data. For **every** route in the OpenAPI document, call it with A's credentials using B's resource ids → expect 404 (never 200, never B's data). The test iterates the OpenAPI spec so new routes are covered automatically.
7. **API-level:** a device token from shop A plus a PIN of a user from shop B → rejected.
8. **Pooling:** run 50 concurrent requests alternating tenants A/B on a small pool (size 2); every response contains only its own tenant's data.

## 4. Data model

Conventions:
- Primary keys `uuid` (generated by `gen_random_uuid()` server-side, or supplied by client where noted for idempotency/offline readiness).
- **Money:** `bigint`, whole rupiah. Never floats, never `numeric` for money.
- **Percentages:** integer **basis points** (`1000` = 10.00%).
- **Ingredient quantities:** `numeric(14,3)` in the ingredient's base unit.
- **Unit cost:** `numeric(16,4)` rupiah per base unit (only cost may have fractions; converted to whole rupiah when it becomes money in reports, rounded half-up).
- Timestamps `timestamptz`, stored UTC. Business dates are `date` computed in the tenant's timezone (§12.1).
- `created_at`, `updated_at` on every table; `updated_at` maintained by trigger (needed later for offline sync).
- Soft delete via `archived_at` for menu entities and ingredients referenced by history. Never hard-delete rows referenced by orders or movements.
- Every tenant table: `tenant_id uuid not null references tenants(id)`, RLS per §3.2, `unique (tenant_id, id)`.

### 4.1 Tables

**tenants**
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| name, address, phone | text | |
| timezone | text | default `Asia/Jakarta`; validated against IANA list |
| business_day_cutoff_hour | smallint | 0–6, default 0 (orders before cutoff count to previous day) |
| receipt_header, receipt_footer | text | |
| service_charge_enabled | bool | default false |
| service_charge_bps | int | 0–10000 |
| tax_enabled | bool | default false |
| tax_name | text | default `PB1` |
| tax_bps | int | 0–10000 |
| tax_on_service_charge | bool | default true |
| enabled_payment_methods | text[] | default all six |
| low_stock_alerts_enabled | bool | default true |
| alert_extra_emails | text[] | default `{}` |
| idle_lock_minutes | smallint | default 15; 0 = off |
| daily_summary_enabled, weekly_summary_enabled | bool | default true; report emails (§12.6, R3) |

**users**
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| tenant_id | uuid | |
| name | text | |
| role | text | check in (`owner`,`manager`,`cashier`,`employee`) |
| email | citext null | required for owner/manager; **globally unique** where not null (MVP: one email = one shop) |
| password_hash | text null | owner/manager only |
| pin_hash | text | argon2id of 4–6 digit PIN |
| locale | text | `id` (default) \| `en` — UI and email language |
| is_active | bool | |
| last_login_at | timestamptz null | |
- Exactly one active `owner` per tenant (partial unique index).

**pin_attempts** — `tenant_id, user_id, device_id, failed_count, locked_until` (unique on user+device).

**devices** — `id, tenant_id, name, token_hash bytea unique, paired_by_user_id, last_seen_at, revoked_at, app_version`.

**sessions** — `id, tenant_id, user_id, kind ('dashboard'|'staff'), device_id null, token_hash bytea unique, expires_at, revoked_at, last_used_at`.

**password_resets / invites** — `id, tenant_id, user_id, token_hash, purpose ('reset'|'invite'), expires_at, used_at`.

**categories** — `id, tenant_id, name, sort, is_active, archived_at`.

**items**
| column | type | notes |
|---|---|---|
| id, tenant_id | uuid | |
| category_id | uuid | composite FK |
| name | text | |
| price | bigint | ≥ 0, excludes tax |
| color | text | tile colour token |
| sort | int | |
| is_active | bool | shown in POS at all |
| is_available | bool | sold-out toggle |
| archived_at | timestamptz null | |

**modifier_groups** — `id, tenant_id, name, selection ('single'|'multiple'), min_select int, max_select int, sort, archived_at`. Validation: `0 ≤ min ≤ max`; single ⇒ `max = 1`; required ⇔ `min ≥ 1`.

**modifier_options** — `id, tenant_id, group_id, name, price_delta bigint (may be 0; negative not allowed in MVP), is_default bool, sort, is_active, archived_at`. Single-select groups: at most one default.

**item_modifier_groups** — `tenant_id, item_id, group_id, sort`, pk `(item_id, group_id)`.

**ingredients**
| column | type | notes |
|---|---|---|
| id, tenant_id | uuid | |
| name | text | unique per tenant among non-archived |
| base_unit | text | check in (`g`,`ml`,`pcs`) |
| stock_qty | numeric(14,3) | may be negative |
| low_stock_threshold | numeric(14,3) | ≥ 0; 0 disables alerts for this ingredient |
| avg_cost | numeric(16,4) | rupiah per base unit, ≥ 0 |
| purchase_unit_name | text null | e.g. `Karton` |
| purchase_unit_size | numeric(14,3) null | base units per purchase unit, > 0 |
| low_stock_alerted_at | timestamptz null | §8 |
| archived_at | timestamptz null | |

**recipe_lines** — `id, tenant_id, item_id, ingredient_id, qty numeric(14,3) > 0`, unique `(item_id, ingredient_id)`.

**modifier_option_effects**
| column | type | notes |
|---|---|---|
| id, tenant_id | uuid | |
| option_id | uuid | |
| effect | text | `add` \| `remove` \| `replace` |
| ingredient_id | uuid | for `add`: ingredient to add; for `remove`: ingredient to remove; for `replace`: the **new** ingredient |
| target_ingredient_id | uuid null | for `replace` only: the ingredient being replaced |
| qty | numeric(14,3) null | `add`: required > 0. `remove`: null. `replace`: null = keep original qty, else new qty |
| sort | int | |

**discounts** — `id, tenant_id, name, kind ('percent'|'fixed'), value bigint (bps for percent, rupiah for fixed), scope ('item'|'order'), is_active, archived_at`.

**order_counters** — `tenant_id, business_date, last_number int`, pk `(tenant_id, business_date)`.

**orders**
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| tenant_id | uuid | |
| client_order_id | uuid | generated by device; `unique (tenant_id, client_order_id)` — idempotency key |
| order_number | int | daily sequence |
| business_date | date | |
| status | text | `paid` \| `voided` (check constraint; must stay extensible — see §14.2) |
| source | text | `pos` (only value in MVP); `qr` reserved for QR table ordering |
| order_type | text | `dine_in` \| `takeaway` |
| customer_name, note | text null | |
| subtotal | bigint | Σ line gross |
| item_discount_total | bigint | |
| order_discount_id | uuid null | |
| order_discount_name | text null | snapshot |
| order_discount_kind / value | text / bigint null | snapshot (custom discounts have null id) |
| order_discount_amount | bigint | |
| net_sales | bigint | |
| service_charge_bps / amount | int / bigint | snapshot + result |
| tax_name / tax_bps / tax_on_service_charge / tax_amount | | snapshot + result |
| total | bigint | |
| paid_total | bigint | = total |
| change_due | bigint | |
| cogs_total | bigint | Σ line cogs, rounded |
| created_by_user_id | uuid | |
| device_id | uuid | |
| client_created_at | timestamptz | device clock, informational |
| paid_at | timestamptz | server time |
| voided_at, voided_by_user_id, void_approved_by_user_id, void_reason, void_restock | | |

**order_lines** — `id, tenant_id, order_id, line_no, item_id, item_name (snapshot), category_name (snapshot), unit_price (item price snapshot), modifiers_unit_total, qty int > 0, line_gross, discount_id null, discount_name null, discount_kind null, discount_value null, discount_amount, line_net (= line_gross − discount_amount), note, cogs numeric(16,4)`.

**order_line_modifiers** — `id, tenant_id, order_line_id, option_id, group_name (snapshot), option_name (snapshot), price_delta (snapshot)`.

**payments** — `id, tenant_id, order_id, seq, method ('cash'|'qris'|'debit'|'credit'|'transfer'|'other'), amount bigint > 0, tendered bigint null (cash only, ≥ amount), provider text null, reference text null`.

**stock_movements** (append-only: `zuru_app` has no `UPDATE`/`DELETE` grant)
| column | type | notes |
|---|---|---|
| id, tenant_id | uuid | |
| ingredient_id | uuid | |
| type | text | `sale` \| `void_return` \| `stock_in` \| `waste` \| `count_adjust` |
| qty_delta | numeric(14,3) | negative for sale/waste |
| unit_cost | numeric(16,4) | avg cost at time (or purchase unit cost for stock_in) |
| total_cost | bigint null | stock_in: amount paid |
| balance_after | numeric(14,3) | |
| order_id | uuid null | sale / void_return |
| reason | text null | waste reason code / note |
| counted_qty | numeric(14,3) null | count_adjust |
| created_by_user_id | uuid | |
| created_at | timestamptz | |

**audit_log** (append-only) — `id, tenant_id, actor_user_id, action, entity_type, entity_id, data jsonb, created_at`. Actions logged at minimum: void, custom discount, price change, recipe change, user create/deactivate/role change/PIN reset, device pair/revoke, settings change, stock count.

**outbox** (system table, §3.5) — `id, tenant_id, kind, to_addresses text[], subject, html, text, status ('pending'|'sent'|'failed'), attempts, next_attempt_at, last_error, created_at, sent_at`.

## 5. Authentication and authorization

### 5.1 Dashboard (owner, manager)
- `POST /v1/auth/login` email + password → argon2id verify → create `sessions(kind='dashboard')`, 30-day sliding expiry → httpOnly, `Secure`, `SameSite=Lax` cookie containing a random 32-byte token (DB stores SHA-256 hash only).
- CSRF: state-changing requests require header `X-Requested-With: zuru` and same-origin check.
- Login rate-limited per IP and per email (e.g. 10/15 min). Generic error message.
- Password rules: ≥ 8 chars, checked against a small common-password list.
- Password reset and manager invite via emailed single-use token (expires 1 h / 72 h).

### 5.2 Device pairing
1. Cashier app first launch → *Pair this device* → owner/manager enters email + password and a device name.
2. `POST /v1/devices/pair` → verifies credentials and role → creates `devices` row → returns a random 32-byte **device token** once. DB stores SHA-256 hash.
3. App stores token in `flutter_secure_storage`. Every request from the app sends `X-Device-Token`.
4. Owner can revoke a device in the dashboard → all its staff sessions are revoked immediately.

### 5.3 Staff PIN sessions (on a paired device)
- `GET /v1/device/staff` (device token only) → list of active users `{id, name, role}` for the picker. No other data.
- `POST /v1/device/sessions` `{user_id, pin}` + device token → checks `pin_attempts`; on success creates `sessions(kind='staff', device_id)` valid 12 h, returns staff token (sent as `Authorization: Bearer`). Every app request then carries **both** device token and staff token; both must be valid and belong to the same tenant.
- 5 consecutive failures for (user, device) → `locked_until = now + 5 min`; reset on success. Also rate-limit per device (30 attempts / 5 min).
- *Switch user* and idle auto-lock revoke the current staff session client-side and server-side (`DELETE /v1/device/sessions/current`).
- PINs: 4–6 digits, argon2id hashed, not required to be unique (user is picked first). Reject trivially weak PINs (`0000`, `1234`, `1111`… list).

### 5.4 Manager approval (step-up)
For actions a cashier can't do alone (void), the request includes `approval: {user_id, pin}`. The API verifies, inside the tenant transaction, that the approver is an active owner/manager of the same tenant, the PIN matches (same lockout rules on that device), and records `void_approved_by_user_id` + audit log. Approval is single-use per request.

### 5.5 Authorization
- Implement the PRD §6 permission matrix as one table in code: `apps/api/src/auth/permissions.ts` mapping `permission → roles[]`. Routes declare `requires: 'orders.void'` etc. One guard function checks it. No inline role checks scattered in handlers.
- Owner-only data (avg cost, cogs, margin, stock value, sales reports) is **removed from responses** for other roles (separate response schemas), not just hidden in UI.

## 6. Pricing engine (pure functions)

`apps/api/src/domain/pricing.ts` and a Dart port `apps/cashier/lib/domain/pricing.dart`. Identical behaviour, verified by `pricing-cases.json` (≥ 40 cases: no tax, tax only, service only, both, tax on/off service, percent/fixed item and order discounts, discount larger than line, multi-qty, rounding .5 boundaries, zero-price items, split payments).

### 6.1 Rounding
All money results are integers. Percentage application:
```
pct(amount, bps) = floor((amount * bps + 5000) / 10000)   // half-up, amount ≥ 0
```
Use `bigint` in TS and `int` (64-bit) in Dart. No floating point anywhere in money paths.

### 6.2 Line
```
modifiers_unit_total = Σ selected option.price_delta
unit_total          = item.price + modifiers_unit_total
line_gross          = unit_total * qty
line_discount:
  none     → 0
  percent  → pct(line_gross, value)
  fixed    → min(value * qty, line_gross)       // fixed item discount is per unit
line_net            = line_gross − line_discount
```

### 6.3 Order
```
subtotal            = Σ line_gross
item_discount_total = Σ line_discount
after_items         = subtotal − item_discount_total
order_discount:
  none     → 0
  percent  → pct(after_items, value)
  fixed    → min(value, after_items)
net_sales           = after_items − order_discount
service_charge      = service_enabled ? pct(net_sales, service_bps) : 0
tax_base            = net_sales + (tax_on_service_charge ? service_charge : 0)
tax                 = tax_enabled ? pct(tax_base, tax_bps) : 0
total               = net_sales + service_charge + tax
```

### 6.4 Payments validation
- `Σ payment.amount == total` exactly (reject otherwise with `PAYMENT_MISMATCH`).
- Cash lines: `tendered ≥ amount`; `change_due = Σ (tendered − amount)` over cash lines.
- Non-cash lines: `tendered` must be null.
- Method must be in tenant's `enabled_payment_methods`.
- `total == 0` (fully discounted) → zero payment lines allowed; record method-less order.
- UI helper for split: the remaining amount pre-fills the next payment line.

### 6.5 Validation of selections
- Item must be active, available, not archived, same tenant.
- Every modifier group attached to the item: selected count within `[min_select, max_select]`; options must belong to that group and be active.
- Options from groups not attached to the item → reject.
- Discount: preset must be active and match scope; custom discount allowed only for owner/manager sessions; percent `1..10000` bps, fixed `> 0`.
- `qty` integer 1–999.

## 7. Recipes and stock

### 7.1 Recipe resolution (pure function)
`resolveIngredients(itemRecipe, selectedOptionsWithEffects, qty) → Map<ingredient_id, qty>`

1. Start: `M = { ingredient_id → qty }` from `recipe_lines` of the item.
2. Order selected options by `(group sort, option sort)`; within each option order effects by `sort`. Apply effects in **three passes** across all selected options: all `remove`, then all `replace`, then all `add`:
   - `remove(ing)`: delete `M[ing]` (no-op if absent).
   - `replace(target → ing, qty?)`: if `M[target]` exists: `q = qty ?? M[target]`; delete `M[target]`; `M[ing] = (M[ing] ?? 0) + q`. If `target` absent: no-op (log at debug).
   - `add(ing, qty)`: if `ing` was the `target` of a `replace` applied in this resolution, redirect to that replace's new ingredient (`ing = replacement`). Then `M[ing] = (M[ing] ?? 0) + qty`. (So *Large* "+50 ml fresh milk" combined with *Oat milk* adds 50 ml **oat** milk.)
3. Multiply every value by line `qty`.
4. Drop zero entries. Values are never negative (inputs are validated `> 0`).

Examples that must be unit tests:
- Kopi Susu (beans 18, milk 150, aren 20, cup12 1, lid 1) + *Oat milk* (replace milk→oat, qty null) + *Extra shot* (add beans 18) + *Less sugar* (replace aren→aren qty 10) ×2 → beans 72, oat 300, aren 20, cup12 2, lid 2.
- Kopi Susu ×1 + *Large* (replace cup12→cup16; add fresh milk 50) + *Oat milk* (replace milk→oat) → beans 18, **oat 200, fresh milk 0** (add redirected), aren 20, cup16 1, lid 1. Test this explicitly.
- If a modifier adds an ingredient that was **not** replaced (e.g. *Vanilla syrup* add 15 ml), it is simply added.
- Item with no recipe → empty map.

The dashboard recipe editor shows a **preview**: pick modifier options → see exact deduction for 1 unit (calls the same resolution via `POST /v1/recipes/preview`).

### 7.2 Order completion transaction (`POST /v1/orders`)
Single DB transaction inside `withTenant`:

1. **Idempotency:** `select` by `(tenant_id, client_order_id)`. If found → return the existing order (HTTP 200, same body). Otherwise continue; the unique constraint also guards races (on conflict → re-read and return existing).
2. Load items, options, effects, recipes, discounts referenced; validate (§6.5).
3. Compute pricing (§6) server-side. If the client sent `expected_total` and it differs → reject `PRICE_CHANGED` with the new breakdown (menu changed between cache and submit; the app shows the new total and asks the cashier to confirm).
4. Validate payments (§6.4).
5. Compute `business_date` (§12.1). Allocate order number:
   ```sql
   insert into order_counters (tenant_id, business_date, last_number) values ($1, $2, 1)
   on conflict (tenant_id, business_date) do update set last_number = order_counters.last_number + 1
   returning last_number;
   ```
6. Insert `orders`, `order_lines`, `order_line_modifiers`, `payments`.
7. Resolve ingredients per line (§7.1); aggregate across lines into `{ingredient_id → total_qty}`.
8. Lock ingredient rows **in ascending id order** (`select … for update` ordered by id) to avoid deadlocks.
9. For each ingredient: `stock_qty -= qty`; insert `stock_movements(type='sale', qty_delta=-qty, unit_cost=avg_cost, balance_after, order_id)`.
10. Line COGS = Σ(ingredient qty × avg_cost) for that line; `orders.cogs_total = round_half_up(Σ line cogs)`.
11. Low-stock check (§8) for touched ingredients; enqueue alert email in the same transaction.
12. Commit. Return full order (lines, payments, totals, order number) for printing.

Stock never blocks a sale. Archived ingredients still deduct (recipes keep working until edited).

### 7.3 Void (`POST /v1/orders/:id/void`)
Body: `{reason, restock: bool, approval?}`. Transaction:
1. Lock the order row; must be `paid`.
2. Permission: owner/manager directly; cashier requires valid `approval` (§5.4).
3. Set `status='voided'`, voided fields.
4. If `restock`: for each `sale` movement of this order, lock ingredient (id order), add back qty, insert `void_return` movement with the **original** `unit_cost`. Avg cost is not recalculated on void return.
5. Low-stock check for touched ingredients (may clear alert state).
6. Audit log.

### 7.4 Stock-in, waste, count
- **Stock-in** `{ingredient_id, qty (base units) | purchase_qty, total_cost (rupiah)}`:
  - `qty = purchase_qty × purchase_unit_size` when purchase units are used.
  - Weighted average: `on_hand = max(stock_qty, 0)`; `new_avg = (on_hand × avg_cost + total_cost) / (on_hand + qty)` (numeric, 4 dp). If `on_hand + qty = 0` → `new_avg = total_cost/qty`.
  - `stock_qty += qty`; movement `stock_in` with `unit_cost = total_cost/qty`, `total_cost`.
- **Waste** `{ingredient_id, qty > 0, reason ('spilled'|'expired'|'mistake'|'other'), note?}` → `stock_qty -= qty`, movement `waste` at `avg_cost`.
- **Stock count** `{counts: [{ingredient_id, counted_qty ≥ 0}], note?}` → for each, `delta = counted_qty − stock_qty`; if `delta ≠ 0` insert `count_adjust` with `counted_qty`, set `stock_qty = counted_qty`. One audit log entry for the count.
- All three lock ingredient rows in id order, run the low-stock check, and record `created_by_user_id`.
- `zuru_app` cannot `update` `stock_qty` except through these service functions — enforce by code review + a test that every `stock_qty` change has a matching movement (sum of movements == stock_qty for every ingredient; run as an invariant check in integration tests and as an admin endpoint).

## 8. Low-stock alerts

Run after any stock change, inside the same transaction, for the touched ingredients:

```
for each ingredient where low_stock_threshold > 0:
  if stock_qty <= threshold and low_stock_alerted_at is null:
      set low_stock_alerted_at = now(); add to `crossed` list
  elif stock_qty > threshold and low_stock_alerted_at is not null:
      set low_stock_alerted_at = null      // re-arm
if crossed non-empty and tenant.low_stock_alerts_enabled:
   enqueue ONE outbox email listing all crossed ingredients
```

- Recipients: the active owner's email + `alert_extra_emails` (deduplicated).
- Subject (id): `[ZuruPOS] Stok menipis: {names, max 3, "+n lainnya"}`.
- Body: table of ingredient, current stock (formatted with unit; show kg/L when ≥ 1000 g/ml), threshold, link to `/{dashboard}/inventory`.
- Emails are rendered (HTML + text) at enqueue time — see §10.

## 9. API

Base path `/v1`. JSON. Errors:
```json
{ "error": { "code": "PAYMENT_MISMATCH", "message": "Human readable (id/en by Accept-Language)", "details": {} } }
```
Codes include: `VALIDATION`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `PIN_LOCKED`, `PAYMENT_MISMATCH`, `PRICE_CHANGED`, `ITEM_UNAVAILABLE`, `RATE_LIMITED`.
Cross-tenant ids always return `NOT_FOUND`. List endpoints use cursor pagination (`?cursor=&limit=`, max 100).

Auth headers: dashboard = cookie; cashier app = `X-Device-Token` + `Authorization: Bearer <staff token>` (except pairing/staff list/PIN login).

| Area | Endpoints (permission) |
|---|---|
| Auth | `POST /auth/signup` (flag-gated), `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/password/forgot`, `POST /auth/password/reset`, `POST /auth/invite/accept` |
| Devices | `POST /devices/pair` (owner, manager creds), `GET /devices` (owner), `POST /devices/:id/revoke` (owner), `GET /device/staff` (device token), `POST /device/sessions`, `DELETE /device/sessions/current`, `POST /device/heartbeat` |
| Bootstrap | `GET /device/bootstrap` → tenant settings subset, categories, items, groups, options, item-group links, discounts, `menu_version` (max `updated_at`). Cached by the app. `GET /device/bootstrap?since=<menu_version>` → 304 if unchanged. |
| Users | `GET/POST /users`, `PATCH /users/:id`, `POST /users/:id/reset-pin`, `POST /users/:id/deactivate` (owner) |
| Settings | `GET/PATCH /settings` (owner; GET subset for others) |
| Menu | CRUD `/categories`, `/items`, `/modifier-groups`, `/modifier-options`, `PUT /items/:id/modifier-groups`, `PUT /modifier-groups/:id/items` (D-054), `PATCH /items/:id/availability` (owner, manager; availability also cashier) |
| Ingredients | CRUD `/ingredients` (owner, manager; cost fields owner-only), `GET /ingredients/:id/movements` |
| Recipes | `GET/PUT /items/:id/recipe`, `GET/PUT /modifier-options/:id/effects`, `POST /recipes/preview` (owner, manager) |
| Stock | `POST /stock/in`, `POST /stock/waste`, `POST /stock/count` (owner, manager, employee) |
| Discounts | CRUD `/discounts` (owner, manager) |
| Orders | `POST /orders` (owner, manager, cashier), `GET /orders` (filters: date range, status, method, user, q), `GET /orders/:id`, `POST /orders/:id/void`, `GET /orders/today` (device: all roles, employee gets no money fields beyond totals) |
| Reports (owner) | `GET /reports/summary?from&to`, `/reports/daily`, `/reports/hourly`, `/reports/items`, `/reports/categories`, `/reports/payments`, `/reports/margin`, `/reports/voids`, `/reports/stock-value`, `/reports/heatmap` (§12.4), `/reports/menu-matrix` (§12.5) |
| Admin | `GET /admin/stock-invariant` (owner; returns ingredients where Σ movements ≠ stock_qty — should always be empty) |

`POST /orders` request:
```json
{
  "client_order_id": "uuid",
  "client_created_at": "2026-11-28T08:15:02+07:00",
  "order_type": "takeaway",
  "customer_name": "Dina",
  "note": null,
  "lines": [
    { "item_id": "uuid", "qty": 2, "option_ids": ["uuid","uuid"], "note": "less ice",
      "discount": { "discount_id": "uuid" } }
  ],
  "order_discount": { "kind": "percent", "value": 1000 },
  "payments": [
    { "method": "cash", "amount": 20000, "tendered": 20000 },
    { "method": "qris", "amount": 34400, "provider": "GoPay", "reference": "8821" }
  ],
  "expected_total": 54400
}
```

## 10. Outbox and email

- `enqueueEmail(trx, {tenantId, kind, to, subject, html, text})` inserts into `outbox` inside the caller's transaction (atomic with the business change).
- Worker loop (every 5 s): `select … from outbox where status='pending' and next_attempt_at <= now() order by created_at limit 10 for update skip locked` → send via `EmailProvider` → `sent` or retry with backoff (1 m, 5 m, 30 m, 2 h, 6 h) → `failed` after 6 attempts (logged at error).
- Templates in `apps/api/src/outbox/templates/` as plain functions returning `{subject, html, text}`; Bahasa Indonesia default, English if the recipient user's locale is `en`.
- Kinds in MVP: `low_stock`, `password_reset`, `manager_invite`. Post-pilot (R3, §12.6): `daily_summary`, `weekly_summary`.
- Local dev: SMTP to Mailpit. Config via env: `EMAIL_PROVIDER=resend|smtp`, `EMAIL_FROM`, `RESEND_API_KEY`, `SMTP_URL`.

## 11. Cashier app (Flutter)

### 11.1 Screens
1. **Pair device** — email, password, device name.
2. **Staff picker** — grid of names with role badges → **PIN pad** (large keys). Lockout message with countdown.
3. **Order screen** (cashier/manager/owner) — tablet landscape: left = category tabs + item grid (colour tiles, sold-out greyed with label); right = cart (lines with modifiers summary, qty stepper, line note, swipe/delete, line discount), order type toggle, customer name, totals, big **Bayar (Pay)** button. Phone portrait: grid full screen, cart as bottom sheet with total bar.
4. **Modifier sheet** — groups in order, required marked, defaults pre-selected, price deltas shown, qty, note, *Add* disabled until valid.
5. **Payment screen** — total large; method buttons (enabled methods only); cash: quick amounts + numeric pad + change; non-cash: optional provider chips + reference; *Add split payment*; remaining amount shown; *Selesai (Complete)* enabled only when fully covered and online.
6. **Done screen** — order number huge, change due huge (if cash), print status per printer with *Retry*, *New order* (auto-return after 5 s configurable).
7. **Orders today** — list, search, detail, reprint, void (with approval PIN sheet for cashier).
8. **Stock** (employee, manager, owner) — ingredient list with levels and low/negative badges; actions: stock-in, waste, stock count (count mode = list with number inputs, submit all).
9. **Settings** (manager/owner on device) — printers, auto-print, paper width, idle lock, language, sold-out toggles.
10. **Employee home** — Orders today (read-only, ticket reprint only) + Stock. No order screen.

Role determines navigation; the API enforces it regardless.

### 11.2 Local data and offline readiness
- `drift` database tables: `menu_cache` (bootstrap payload + `menu_version`), `pending_orders` (full `POST /orders` payload + status), `print_jobs` (rendered ESC/POS bytes + status), `settings`.
- On *Complete*: write the order payload to `pending_orders` **first**, then POST. On success mark synced and enqueue print jobs from the server response. On network error: keep it pending, show *"Menunggu koneksi…"* with retry; the cashier cannot start a new paid order until it's resolved in MVP (prevents stacking unsynced orders before offline mode exists). Retries reuse the same `client_order_id`.
- Bootstrap refresh: on app start, on staff login, every 5 min, and on `PRICE_CHANGED`.
- Connection indicator: heartbeat every 30 s + dio error tracking. Offline → banner + *Pay* disabled.

### 11.3 Printing
- `PrinterTransport` interface: `connect()`, `write(Uint8List)`, `disconnect()`, `status()`. Implementations: `BluetoothClassicTransport` (Android SPP; handle Android 12+ `BLUETOOTH_CONNECT`/`BLUETOOTH_SCAN` runtime permissions; pair via system settings, select from bonded devices list) and `NetworkTransport` (`Socket.connect(ip, port=9100, timeout 3 s)`).
- `PrinterConfig`: `{id, name, transport, address, paper: 58|80, roles: {receipt, ticket}, autoPrint: {receipt, ticket}}`; up to 2 printers.
- Rendering functions (pure): `renderReceipt(order, tenant, paper) → bytes`, `renderTicket(order, paper) → bytes`. Char widths: 58 mm = 32 cols, 80 mm = 48 cols. Text only (no images) in MVP; codepage handling for Indonesian text (ASCII-safe; strip unsupported chars).
- **Receipt:** shop name (double size), address, phone, header text; order no., date/time (tenant tz), cashier name, order type, customer name; lines `qty x name ... line_gross`, modifiers indented with deltas, line discount; subtotal, discounts, service charge (with %), tax name (with %), **TOTAL**; payments per line (method, provider, amount), tendered/change for cash; footer text; *"VOID"* banner on reprint of voided order.
- **Barista ticket:** order no. (quad size), customer name (double), order type, time; lines `qty x name` with each modifier on its own line and notes in bold; no prices.
- No cash-drawer kick: the app never sends `ESC p` (D-067).
- Print jobs run after order commit, async, with timeout; failures shown on Done screen and in Orders today. **Never** roll back or block an order on print failure.
- Test print button prints a sample receipt with column ruler.

### 11.4 UX requirements
- Touch targets ≥ 48 dp; item tiles ≥ 96 dp on tablet.
- Typical 2-item order with modifiers + cash payment ≤ 20 s for a trained cashier (≤ 8 taps for a default item + exact cash).
- IDR formatting `Rp 25.000` everywhere via one formatter.
- Bahasa Indonesia default; English toggle in settings.
- Keep screen awake while on order screen.

## 12. Dashboard (Nuxt 4)

### 12.1 Business day
`business_date = date((paid_at at time zone tenant.timezone) - interval 'cutoff_hour hours')`. Computed in the API; reports filter on `orders.business_date`. Hourly report uses local hour of `paid_at`.

### 12.2 Report definitions (exclude voided orders unless stated)
| Metric | Definition |
|---|---|
| Gross sales | Σ `subtotal` |
| Discounts | Σ (`item_discount_total` + `order_discount_amount`) |
| Net sales | Σ `net_sales` |
| Service charge | Σ `service_charge_amount` |
| Tax | Σ `tax_amount` |
| Total collected | Σ `total` |
| Orders | count |
| Average order value | Net sales / orders (integer, half-up) |
| By payment method | Σ `payments.amount` grouped by method (and provider) |
| Item sales | Σ qty and Σ `line_net` per `item_id` (name = latest snapshot) |
| Item net sales after order discount | order discount allocated to lines proportionally to `line_net` for item/category reports; rounding remainder to the largest line |
| COGS | Σ `cogs_total` |
| Gross margin | Net sales − COGS; margin % = margin / net sales |
| Voids | count and Σ `total` of voided orders, with reason, voider, approver |
| Stock value | Σ `max(stock_qty,0) × avg_cost` (owner) |

### 12.3 Pages
- `/login`, `/forgot`, `/reset`, `/invite/:token`
- `/` Home (today; auto-refresh 60 s) — owner; managers land on `/menu`
- `/reports/sales`, `/reports/payments`, `/reports/items`, `/reports/margin`, `/reports/voids` — owner
- `/reports/heatmap` (§12.4, R1), `/reports/menu` (§12.5, R2) — owner
- `/orders`, `/orders/:id` — owner
- `/inventory` (levels), `/inventory/:id` (movements), `/inventory/stock-in`, `/inventory/waste`, `/inventory/count` — owner, manager
- `/menu` (categories + items), `/menu/items/:id` (details, modifier groups, recipe with preview), `/menu/modifiers` (groups, options, effects) — owner, manager
- `/ingredients` — owner, manager (cost columns owner only)
- `/discounts` — owner, manager
- `/users`, `/devices` — owner
- `/settings` — owner (profile, tax & service with live example calculation, payment methods, receipt text, alerts, business day cutoff, timezone)

Mobile-first: every page usable at 375 px width; tables collapse to cards. Use Nuxt UI components; date range picker with presets (Hari ini, Kemarin, 7 hari, Bulan ini, Bulan lalu).

### 12.4 Operational heatmap (PRD F15, D-071)

`GET /v1/reports/heatmap?from&to` (owner). `from`/`to` are business dates, inclusive, at most 92 days apart. The page defaults to the 28 business days ending yesterday, with presets 4, 8 and 12 weeks.

Integer division with half-up rounding, used in §12.4–12.6:
```
div(a, b) = floor((2·a + b) / (2·b))   // b > 0; floor, not truncation, so negative a rounds correctly
```
It equals `pct` (§6.1) for non-negative values. No floating point.

- **Source:** paid orders with `business_date` in range.
- **Row:** ISO weekday of `business_date` (1 = Monday … 7 = Sunday). **Column:** local hour of `paid_at` in the tenant timezone.
- **Hour order:** `cutoff_hour … 23`, then `0 … cutoff_hour − 1`, so orders after midnight that belong to the previous business day sit at the end of that day's row. Only hours from the first to the last one with any order in range are returned; empty hours in between are 0.
- `trading_days[w]` = number of distinct business dates in range with weekday `w` and at least one paid order. Closed days don't lower the averages.
- **Cell** (`w`, `h`): `orders` = count, `net_sales` = Σ `net_sales`, `avg_orders_x10 = div(orders × 10, trading_days[w])` (one decimal, as tenths), `avg_net_sales = div(net_sales, trading_days[w])`. A weekday with `trading_days = 0` has all cells `null` ("tidak ada data").
- `weeks_of_data` = min of `trading_days[w]` over weekdays with `trading_days > 0`; `reliable = weeks_of_data ≥ 3`.
- **Insight**, per metric, only when `reliable`: `busiest` = the cell with the highest average, `quietest` = the cell with the lowest **non-zero** average (ties: earlier weekday, then earlier hour in display order); `ratio = div(busiest avg, quietest avg)` when `busiest avg ≥ 2 × quietest avg` (compared exactly, so 1.6× never shows as 2×), else `null`. The dashboard renders the sentence from these fields through i18n keys.
- Response: `{ from, to, cutoff_hour, hours: int[], weekdays: [{ weekday, trading_days, cells: [{ hour, orders, net_sales, avg_orders_x10, avg_net_sales } | null] }], weeks_of_data, reliable, insight: { orders, net_sales } }` with `insight.*` = `{ busiest: { weekday, hour, avg }, quietest: { weekday, hour, avg }, ratio } | null`.
- **Page:** grid with a metric switch (*Jumlah pesanan* / *Penjualan bersih*), the sentence above it, the trading days per row, and a banner when not `reliable`. Cells are shaded by rank among the non-empty cells (4 shades), not linearly against the maximum, so one unusually big order doesn't flatten the rest; tapping a cell shows its averages and the number of days behind them. At 375 px the grid scrolls sideways inside its card (the page itself doesn't), with the weekday column pinned.

### 12.5 Menu matrix (PRD F16, D-073)

`GET /v1/reports/menu-matrix?from&to&category_id` (owner). Same range rules as §12.4; the page defaults to the 30 business days ending yesterday and to the category with the highest net sales. Items are grouped by their **current** category (archived items still appear if they sold in range).

- **Lines:** order lines of paid orders in range with the order discount allocated (§12.2, "Item net sales after order discount"). Per item: `qty` = Σ qty, `net` = Σ net after order discount, `cogs` = round(Σ `cogs`), `margin = net − cogs` (may be negative), `margin_per_portion = div(margin, qty)`.
- **Cost complete** (all three must hold, otherwise the item goes to `incomplete` with every reason that applies):
  1. the item has at least one `recipe_lines` row now (else `no_recipe`);
  2. every ingredient in its recipe, and every `ingredient_id` in the effects of the active options of the modifier groups currently linked to it, has `avg_cost > 0` (else `ingredient_without_cost`, with those ingredient names);
  3. no line of the item in range has `cogs = 0` (else `sold_without_cost`).
- **Included set I** = cost-complete items with `qty > 0`. `N = |I|`, `Q = Σ qty`, `M = Σ margin` over I.
- `coverage_bps = div(Σ net over I × 10000, Σ net over all items sold in the category)`; `null` when that total is 0.
- `state`: `incomplete_costs` if `coverage_bps < 5000`; else `too_few_items` if `N < 3`; else `ok`. Only `ok` returns quadrants.
- **Popular** iff `qty_i × N × 10 ≥ Q × 7` (share ≥ 70% of an equal share). **High margin** iff `margin_i × Q ≥ M × qty_i` (margin per portion ≥ the weighted average, cross-multiplied, no division).
- **Quadrant:** `andalan` (popular, high), `naikkan_harga` (popular, low), `promosikan` (not popular, high), `evaluasi` (not popular, low). UI labels *Andalan*, *Naikkan harga*, *Promosikan*, *Evaluasi*, each with a one-line explanation (i18n). Never the classic English names.
- `avg_margin_per_portion = div(M, Q)`. For `naikkan_harga` items only: `gap = max(avg_margin_per_portion − margin_per_portion, 0)`, `suggested_increase` = `gap` rounded **up** to a multiple of Rp 1.000, at least Rp 1.000; `extra_30d = div(suggested_increase × qty × 30, days_in_range)`. The UI labels it as an estimate "jika jumlah terjual tetap".
- Response: `{ from, to, category_id, state, coverage_bps, avg_margin_per_portion, items: [{ item_id, name, archived, qty, net, cogs, margin, margin_per_portion, quadrant, suggested_increase?, extra_30d? }], incomplete: [{ item_id, name, net, reasons: [...], ingredients: [names] }] }`.
- **Page:** a category picker, the coverage line ("HPP lengkap untuk X dari Y menu, Z% dari penjualan"), the four groups as lists (a scatter chart is optional; the lists are the source of truth and work at 375 px), and the *HPP belum lengkap* list linking to each item's recipe. `incomplete_costs` shows *Lengkapi HPP dulu* with that list instead of the groups.

### 12.6 Report emails (PRD F17, D-074, D-075)

Two outbox kinds, rendered at enqueue time like every email (§10):

| Kind | When (shop time) | Covers | Skipped when |
|---|---|---|---|
| `daily_summary` | 07:00 | the previous business date `D` | never (sent also when `D` has no paid orders) |
| `weekly_summary` | Monday 07:30 | the previous Monday–Sunday business dates | the week has no paid orders |

- **Daily content:** net sales, orders, average order value for `D`; change against `D − 7` (same weekday), as a whole percent with `div`, or "—" when `D − 7` had no orders; totals per payment method; top 3 items by net after order discount; voids count and total when > 0; number of ingredients at or below threshold now; a link to the dashboard Home. When `D` has no paid orders the email says *Tidak ada transaksi tercatat* instead of the sales figures, and still shows the comparison with `D − 7`, voids and the low-stock count.
- **Weekly content:** net sales and orders against the week before; the §12.4 insight over the 4 weeks ending that Sunday (left out when not reliable); up to 3 menu actions from §12.5 over the same 4 weeks, taken from every category whose state is `ok` (`naikkan_harga` items by `extra_30d` desc, then `promosikan` by `qty` asc); a coverage nudge when any category with sales is `incomplete_costs`.
- Money through the API's one IDR formatter. Subject (id): `[ZuruPOS] Ringkasan {Kamis, 26 Nov}: Rp …` and `[ZuruPOS] Ringkasan minggu {23–29 Nov}`. Locale of the owner.
- **Recipient:** the active owner only (not `alert_extra_emails`).
- **Settings:** `tenants.daily_summary_enabled`, `tenants.weekly_summary_enabled` (bool, default true), in Settings → Alerts.
- **Once only:** tenant table `report_email_runs` — `tenant_id, kind, period_start date, created_at`, pk `(tenant_id, kind, period_start)`, normal RLS (§3.2). The run row and the outbox row are inserted in the same `withTenant` transaction; a conflict means already sent, and the transaction does nothing.
- **Scheduler:** a separate process (`node dist/scheduler/scheduler.js`, Compose service `scheduler`) connecting as `zuru_app` with the startup role guard. Every 5 minutes it gets the list of shops and their schedule fields from `auth.report_schedule()` (see D-075), works out which periods are due with a pure function (`domain/report-schedule`), and handles each shop in its own `withTenant` transaction. Catch-up is bounded: a daily summary is sent at most 24 h late and a weekly at most 72 h late; older periods are skipped, so a long outage never sends a backlog.
- Needs a fifth reviewed `auth.*` function (§3.4, D-075, approved 2026-11-25), added with its isolation tests in R3.

## 13. Seed data

`db/seeds/demo.sql` (dev only): one shop *"Kopi Demo"* with timezone Asia/Jakarta, PB1 10% and service 5% **off** by default, users (owner, manager, cashier, employee with known dev PINs), ~12 ingredients (espresso beans, fresh milk, oat milk, palm sugar syrup, vanilla syrup, caramel syrup, ice, cup 12oz, cup 16oz, lid, straw, water bottle), categories (Kopi, Non-Kopi, Makanan), ~10 items (Americano, Kopi Susu Gula Aren, Latte, Cappuccino, Matcha Latte, Chocolate, Croissant, Air Mineral …), modifier groups (Ukuran, Gula, Es, Susu, Tambahan) with effects as in §7.1 examples, two preset discounts, and ~200 historical orders over 14 days for dashboard development.

## 14. Next-phase readiness (design constraints now, features later)

### 14.1 Offline readiness

The MVP is online-only, but these constraints keep offline mode a feature addition rather than a rewrite:
1. Orders are created with **client-generated UUIDs** (`client_order_id`) and submitted idempotently.
2. The client already computes totals with the same pricing engine and fixture tests.
3. The client already persists the full order payload locally before sending (`pending_orders`).
4. Stock may go negative, so late-synced sales never fail on stock.
5. Every table has `updated_at`; bootstrap supports `since` for delta sync later.
6. Order numbers are assigned by the server today. **Future offline plan** (do not build now): device shows a provisional number `A-017` from a per-device local counter; server keeps the daily number; receipts show both if they differ. Keep `order_number` server-side and nothing in the client may assume it is known before sync except in the Done screen after success.
7. `paid_at` is server time; `client_created_at` is stored separately so offline orders can later be reported by their real time.

### 14.2 QR table ordering readiness (deferred until the pilot shows the need, D-069 — do not build now)

Planned feature: the owner defines tables; ZuruPOS generates one **static QR code per table**; customers scan, browse the menu on their phone, and submit an order tagged with the table; the order appears on the counter device; the cashier records payment as usual.

Constraints to respect in the MVP so this is an addition, not a rewrite:
1. `orders.source` exists now (`pos` only). QR orders will use `qr`.
2. `orders.status` is a check-constrained text column, not a Postgres enum, so new states (e.g. `pending`, `accepted`) can be added by migration. Report queries must filter on `status = 'paid'` explicitly, never on "not voided".
3. Pricing (§6) and recipe resolution (§7.1) are pure functions independent of who submits the order, so a public QR ordering endpoint can reuse them.
4. Stock deduction stays tied to the **paid** transition (§7.2), not to order creation, so unpaid QR orders won't move stock.
5. The future `tables` table will be a normal tenant table (`id, tenant_id, name, qr_token, is_active`). The QR encodes a URL with an unguessable `qr_token` (random, ≥ 128 bits), never a sequential id or tenant id; the public endpoint resolves the token via a reviewed `auth.*` function (§3.4 process).
6. The `/device/bootstrap` menu payload shape should be reusable for the public QR menu (minus staff-only fields).

## 15. Non-functional, security and operations

- HTTPS only (TLS terminated by reverse proxy in deployment — not part of this build). HSTS on dashboard.
- Security headers via `@fastify/helmet`; CORS: dashboard origin only (app uses tokens, not cookies).
- All input validated by TypeBox schemas; unknown properties rejected.
- Rate limits: login, PIN, password reset, signup.
- Secrets only from env; `.env.example` documents all vars. Never commit secrets.
- Structured logs; never log PINs, passwords, tokens or full request bodies of auth routes.
- Health endpoint `GET /healthz` (db ping).
- Dockerfiles for `api` and `dashboard`; `docker-compose.yml` for local dev only. Backups/deployment are documented in `docs/DEPLOY.md` as a later task — **not executed by the agent**.

## 16. Build plan and milestones

Each milestone ends with its tests green and a short note appended to `docs/PROGRESS.md`.

| # | Milestone | Exit criteria |
|---|---|---|
| M0 | Repo scaffold: monorepo, Docker Compose (postgres, mailpit), API skeleton with `/healthz`, Nuxt skeleton, Flutter skeleton, lint/format/typecheck, CI workflow running tests | `docker compose up` works; CI green |
| M1 | DB roles, migrations for all §4 tables, RLS (§3), `withTenant`, auth (§5.1–5.3), permission table, audit log helper | **§3.6 isolation suite passes**; auth tests pass |
| M2 | Menu, modifiers, ingredients, recipes, discounts, settings APIs + dashboard pages; recipe resolution + preview | Unit tests for §7.1 examples; CRUD integration tests; owner can build the demo menu in the dashboard |
| M3 | Pricing engine (TS) + fixtures; `POST /orders` transaction; void; stock-in/waste/count; low-stock outbox + worker + email templates | ≥ 40 pricing fixtures pass; order/void/stock integration tests incl. **concurrency** (20 parallel orders on the same ingredients → exact final stock, no deadlocks) and **idempotency** (same `client_order_id` ×5 → one order); stock invariant holds; low-stock email arrives in Mailpit exactly once per crossing |
| M4 | Flutter: pairing, staff picker + PIN, bootstrap cache, order screen, modifier sheet, cart, Dart pricing port (same fixtures), payment screen with split, done screen, orders today, void with approval, employee stock screens, offline banner + pending order retry | Dart fixture tests pass; widget tests for cart and payment; manual run against local API completes orders |
| M5 | Printing: transports, receipt + ticket renderers, printer settings, auto-print, reprint, drawer kick (removed later, D-067), test print | Renderer golden tests (byte output for sample orders at 58/80 mm); manual test on one Bluetooth and one network printer; print failure doesn't block order |
| M6 | Dashboard reports (§12.2–12.3), home, orders, inventory pages, users/devices, settings with live tax example | Report integration tests against seeded data with hand-computed expected values; mobile layout check at 375 px |
| M7 | Hardening: full regression, seed demo, `docs/USER_GUIDE.id.md` (short owner setup guide in Bahasa Indonesia), UAT checklist run | §17 UAT checklist passes; no open P0 bugs |

**Post-pilot reporting** (PRD F15–F17), in order, local only until the user asks to deploy:

| # | Milestone | Exit criteria |
|---|---|---|
| R1 | Operational heatmap (§12.4): API + `/reports/heatmap` | Integration tests on seeded orders with hand-computed cells, incl. a cutoff of 2 (01:30 order lands at the end of the previous day's row), a closed weekday (null row), 5 vs 4 occurrences of a weekday (averages, not sums), a non-Jakarta timezone and the `reliable` threshold; RLS suite green (new route covered); 375 px check |
| R2 | Menu matrix (§12.5): API + `/reports/menu` | Integration tests for each quadrant boundary (exactly 70% share, exactly the average margin), each `incomplete` reason, the 50% coverage state, `N < 3`, a negative margin, and `suggested_increase` / `extra_30d` by hand; RLS suite green; 375 px check |
| R3 | Report emails (§12.6) | D-075 approved 2026-11-25. Unit tests for `domain/report-schedule` (timezones, cutoff, Monday rollover, bounded catch-up); integration tests: one email per period even with two scheduler passes in parallel, an empty day still sends its email (weekly: skipped), toggles respected, owner-only recipient; the §3.6 suite updated for the fifth `auth.*` function and still green; both emails arrive in Mailpit |

## 17. UAT checklist (pilot readiness)

Run end-to-end on a real Android tablet + the owner's printer(s):

1. Owner signs up, sets shop profile, PB1 10% on, service charge off; settings preview shows correct example.
2. Owner creates manager (invite email received, password set), cashier, employee with PINs.
3. Manager builds menu with modifiers and recipes from the dashboard; recipe preview shows correct deductions for *Large + Oat + Extra shot*.
4. Owner enters stock-in for all ingredients with purchase units and prices; avg costs look right.
5. Device paired by manager; staff switch via PIN; wrong PIN ×5 locks for 5 min.
6. Cashier: 2× Kopi Susu (Large, Oat, Less sugar) + 1 Croissant, preset 10% item discount on croissant, split Rp 20.000 cash + rest QRIS with reference → totals match hand calculation; receipt + ticket print; stock deducted exactly.
7. Wifi switched off before *Complete* → Pay blocked / pending shown; wifi on → retry → exactly one order exists.
8. Cashier voids an order with manager PIN approval, restock = yes → stock restored, void appears in report with approver.
9. Employee logs in: cannot open order screen, can record waste and do a stock count; count adjusts stock and appears in movements.
10. Push an ingredient below threshold with sales → exactly one low-stock email; more sales → no new email; stock-in above threshold then sell below again → new email.
11. Owner on phone (4G, away from shop): home shows today's numbers; payments report per method matches the day's test orders; margin report shows COGS.
12. Manager on dashboard cannot see reports, costs, users or settings (UI and API both).
13. Unplug/turn off printer → order completes, print failure shown, retry works after printer is back.
14. Two shops on the same server: shop B's owner sees none of shop A's data anywhere.

## 18. Out of scope for this build

Everything listed in PRD §5 non-goals and §11 roadmap. If tempted to add one, write it in `docs/DECISIONS.md` as a proposal instead.
