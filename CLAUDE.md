# ZuruPOS — Agent Instructions

ZuruPOS is a POS for small counter-service F&B shops in Indonesia (coffee shops, warung kopi, boba, bakeries). It **records** payments; it never processes them. MVP pilot: one coffee shop opening end of November 2026.

## Source of truth

Read these before doing anything, and re-read the relevant section before each milestone:

1. `docs/SPEC.md`: the technical specification. **This is what you build.**
2. `docs/PRD.md`: the product requirements. The reason behind the spec.
3. `docs/DECISIONS.md`: decisions already made, plus any you add.
4. `docs/PROGRESS.md`: where the build currently is. Update it as you go.

If the spec and PRD disagree, the spec wins for implementation details; flag the conflict in `DECISIONS.md`.

## Hard rules (never break these)

1. **Never deploy, and never connect to any remote server or VPS**, unless the user explicitly asks in that same message. Local development only (Docker Compose).
2. **Tenant isolation:** follow SPEC §3 exactly. The API connects as `zuru_app` (not superuser, not table owner, `NOBYPASSRLS`). Every tenant table has `ENABLE` + `FORCE ROW LEVEL SECURITY`. Tenant context is set only with `set_config('app.tenant_id', $id, true)` inside a transaction, never session-level `SET`. `tenant_id` comes only from the verified session/device token. No new `SECURITY DEFINER` functions beyond SPEC §3.4.
3. **Money:** whole rupiah as `bigint` / 64-bit int. Percentages in basis points. No floating point in any money path. Rounding exactly as SPEC §6.1.
4. **Stock:** every change to `ingredients.stock_qty` happens in the same transaction as a `stock_movements` insert. Lock ingredient rows in ascending id order. Stock never blocks a sale.
5. **Server is authoritative** for prices, totals, stock and permissions. Clients are untrusted.
6. **Never weaken** an RLS policy, a test, a validation or a permission check to make something pass. If something seems wrong in the spec, stop and write it in `DECISIONS.md`.
7. **No secrets in git.** Env vars only; document every var in `.env.example`.
8. **Don't build next-phase features** (offline ordering, QR table ordering, barista queue, shifts, kasbon, billing). Do respect the readiness constraints in SPEC §14.

## How to work

- Follow the milestones in SPEC §16 **in order** (M0 → M7). A milestone is done only when its exit criteria pass.
- **Mandatory review stops:** after **M1** (RLS + auth) and after **M3** (orders, pricing, stock), stop and ask the user to review before continuing. Give a short summary: what was built, how to run the tests, anything you were unsure about.
- At the end of every milestone: all tests green → update `docs/PROGRESS.md` (what's done, how to run it, known issues) → commit.
- When the spec is ambiguous: choose the simpler option that's safer for money, stock and data isolation, record it in `docs/DECISIONS.md` (next `D-xxx` number), and continue.
- Hardware-dependent work (Bluetooth/network printing, M5): build and golden-test the renderers and transports; list the manual tests for the user to run on the real printer.

## Code conventions

- **Functional over OOP:** plain functions and modules. No class hierarchies for business logic. Pure functions for domain logic (`domain/pricing`, `domain/recipe-resolve`, `domain/avg-cost`).
- **Strict file separation:** one concern per file. In the API, each module has separate `routes.ts`, `schemas.ts`, `service.ts`, `queries.ts`.
- **Small, single-purpose commits** with clear messages (e.g. `api: add withTenant transaction helper`). Don't bundle unrelated changes.
- TypeScript `strict` everywhere. No `any` without a comment explaining why.
- Code, comments, commit messages and docs in **English**. User-facing UI text in **Bahasa Indonesia** (default) and English, always through i18n keys, never hard-coded.
- One IDR formatter per app (`Rp 25.000`). Never format money ad hoc.

## Testing expectations

- API integration tests run against a **real Postgres** (Docker), connecting as `zuru_app`. Never mock the database.
- The RLS isolation suite (SPEC §3.6) must stay green from M1 onward.
- `pricing-cases.json` is shared by the TS and Dart pricing engines; both must pass all cases.
- Any change touching SPEC §3, §6, §7 or §8 needs tests in the same commit.

## Repo layout

See SPEC §2. Summary:

```
docs/          PRD, SPEC, DECISIONS, PROGRESS, KICKOFF
db/            migrations (dbmate, plain SQL) + seeds
apps/api/      Fastify + Kysely API (TypeScript)
apps/dashboard/ Nuxt 4 + Nuxt UI owner dashboard
apps/cashier/  Flutter Android cashier app
packages/      generated API client(s)
```

## Commands

_To be filled in during M0. Keep this section current: how to start the stack, run migrations, seed, run each test suite, lint and typecheck._
