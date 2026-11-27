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

Keep this section current. Flutter SDK on this machine: `/Volumes/PBox/sdk/flutter/flutter/bin` (add to `PATH`).

```sh
# First time
cp .env.example .env
pnpm install

# Whole stack (postgres :55432, migrate, mailpit :8025, api :4000, worker, scheduler, dashboard :3000, menu :3001)
docker compose up -d --build --wait
docker compose down            # stop (add -v to wipe the database volume)

# Just the database + mailpit, then run the API on the host with reload
docker compose up -d --wait postgres mailpit
pnpm db:migrate                # dev db `zuru`, as zuru_migrator
pnpm --filter @zurupos/api dev
pnpm --filter @zurupos/api worker   # outbox worker (sends email to Mailpit)
pnpm --filter @zurupos/api scheduler   # report email scheduler (daily/weekly summaries, SPEC §12.6)

# Migrations (dbmate, plain SQL in db/migrations)
pnpm db:new <name>             # new migration file
pnpm db:migrate:test           # test db `zuru_test`
pnpm db:reset:test             # drop everything in zuru_test and re-migrate
pnpm db:types                  # regenerate apps/api/src/db/types.ts after a migration

# API tests (real Postgres, as zuru_app; needs postgres up + test db migrated)
pnpm --filter @zurupos/api test           # everything
pnpm --filter @zurupos/api test:rls       # SPEC §3.6 isolation suite only
pnpm --filter @zurupos/api test test/auth # auth tests only
pnpm --filter @zurupos/api test test/orders test/stock test/worker  # M3: orders, stock, email
pnpm --filter @zurupos/api test test/scheduler test/reports  # R1–R3: reports and report emails
pnpm --filter @zurupos/api test test/online-menu test/media  # O1: online menu, uploads, image pipeline
pnpm --filter @zurupos/api test test/public-menu test/rls     # O2: public menu read, preview, sixth definer function
python3 apps/api/scripts/pricing-cases.py # regenerate pricing fixtures (never edit by hand)

# Lint / typecheck / format (all JS workspaces)
pnpm lint && pnpm typecheck && pnpm format:check

# Dashboard
pnpm --filter @zurupos/dashboard dev      # http://localhost:3000
pnpm --filter @zurupos/dashboard build
pnpm --filter @zurupos/dashboard test     # unit tests (formatters)
pnpm --filter @zurupos/dashboard test:e2e e2e/<file>.spec.ts  # one spec, Playwright vs the running stack (installed Chrome)
pnpm --filter @zurupos/dashboard test:e2e:each  # whole suite, one spec per API restart (signup limit)

# API client types (after changing routes/schemas; CI checks they're current)
pnpm api:client

# Cashier app (apps/cashier)
flutter pub get && flutter analyze && flutter test
ZURU_API_URL=http://localhost:4000 flutter test test/integration   # against the running stack
pnpm cashier:fixtures          # copy pricing-cases.json into the app after regenerating it
dart run build_runner build    # regenerate drift code after changing lib/data/database.dart
flutter run --dart-define=API_BASE_URL=http://<host-ip>:4000      # on a tablet (emulator default: 10.0.2.2)
flutter build apk --debug

# Online menu (SPEC §12.7): page package and the public SSR app (http://localhost:3001/<slug>)
pnpm --filter @zurupos/menu-ui test       # accent, hours, SEO, server-rendered templates
pnpm --filter @zurupos/menu dev           # on the host, against the API on :4000
pnpm --filter @zurupos/menu build

# Landing site (apps/landing, static; D-059, D-060)
node --test apps/landing/test/*.test.mjs   # HPP calculator math
cd apps/landing && python3 -m http.server 8765   # preview at http://localhost:8765

# Demo shop (dev database only; prints the logins and PINs; D-046)
pnpm db:seed

# Production stack (docs/DEPLOY.md; never run against a server unless asked)
deploy/prod.sh up -d --build --wait            # on the server, with deploy/.env.prod
ZURU_REHEARSAL=1 ZURU_ENV_FILE=deploy/.env.rehearsal deploy/prod.sh up -d --build --wait  # local rehearsal, :9443
pnpm --filter @zurupos/dashboard test:e2e:rehearsal
deploy/restore.sh check <dump>                 # verify a backup in a scratch database
deploy/prod.sh exec -T backup rclone lsl r2:zurupos-backups   # dumps copied off the server (R2; rehearsal: local S3)
apps/cashier/tool/build_release.sh https://api.zurupos.com   # signed release APK (needs android/key.properties)
```

Note: signup is rate-limited to 5 per IP per hour in the running API, and the e2e and cashier integration tests each sign up a shop. The full e2e suite needs more than 5, so run it with `test:e2e:each`; otherwise, if something fails with 429, run `docker compose restart api`.
