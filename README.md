# ZuruPOS

A simple, fairly priced POS for small counter-service F&B shops in Indonesia: coffee shops, warung kopi, boba stalls and bakeries. Payments are recorded, not processed.

- **Cashier app:** Flutter (Android), with Bluetooth and network receipt printing
- **Owner dashboard:** Nuxt 4 web app, works on mobile
- **API:** Fastify + Kysely on PostgreSQL with row-level security

## Docs

- [Product requirements](docs/PRD.md)
- [Technical specification](docs/SPEC.md)
- [Decisions](docs/DECISIONS.md)
- [Build progress](docs/PROGRESS.md)
- [Agent kickoff prompt](docs/KICKOFF.md)

## Getting started

```sh
cp .env.example .env
pnpm install
docker compose up -d --build --wait
curl localhost:4000/healthz
```

Dashboard: http://localhost:3000 · Mailpit: http://localhost:8025 · All commands: see the *Commands* section of [CLAUDE.md](CLAUDE.md).
