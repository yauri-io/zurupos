# Seeds

The demo shop (SPEC §13) is created by `apps/api/scripts/seed-demo.ts`, not a SQL file (D-046):

```sh
docker compose up -d --build --wait     # empty dev database (docker compose down -v to start over)
pnpm db:seed
```

It prints the dashboard logins and the app PINs. Dev only: never run it against a real database.
