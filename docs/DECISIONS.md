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
