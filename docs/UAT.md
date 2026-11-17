# UAT checklist (SPEC §17)

The checklist is meant to run on a real Android tablet with the shop's printer(s); that run is for the owner and the developer together. This page lists, for each item, what the automated tests already prove and what needs to be checked by hand.

Legend: ✅ covered by automated tests · 👤 needs the manual run

| # | Item | Automated evidence | Manual |
|---|---|---|---|
| 1 | Signup, profile, PB1 10% on, service off; settings preview correct | `e2e/signup.spec.ts`; `test/dates.test.ts` (`exampleTotals`); settings page in `e2e/reports-pages.spec.ts` | 👤 check the preview numbers on the phone |
| 2 | Manager invite email + password, cashier, employee PINs | `apps/api/test/auth/*` (invite accept), `test/worker/outbox.test.ts` (Mailpit delivery) | 👤 real email arrives (Resend in production is untested locally) |
| 3 | Menu with modifiers and recipes; preview for Large + Oat + Extra shot | `e2e/build-menu.spec.ts` (36 g beans, 200 ml oat, 20 ml aren, cup 16oz, lid) | — |
| 4 | Stock-in with purchase units and prices; avg cost | `apps/api/test/stock/operations.test.ts`, `test/domain/avg-cost.test.ts`; stock-in form in `e2e/reports-pages.spec.ts` | 👤 enter the real opening stock |
| 5 | Device pairing by manager; PIN switch; 5 wrong PINs lock 5 min | `apps/api/test/auth/device.test.ts`; app `test/app_test.dart` (lockout countdown) | 👤 on the tablet |
| 6 | 2× Kopi Susu (Large, Oat, Less sugar) + Croissant with 10% item discount, split Rp 20.000 cash + QRIS with reference; totals, receipt + ticket, exact stock | pricing fixture "UAT #6" (TS + Dart); `apps/api/test/orders/create.test.ts`; app `payment_test.dart` (split), `printing_test.dart` (receipt + ticket) | 👤 printed output on the real printers |
| 7 | Wi-Fi off before *Complete* → pending; on → retry → exactly one order | app `payment_test.dart` (pending + retry with the same id); API idempotency ×5 tests; `test/integration/local_api_test.dart` | 👤 real Wi-Fi off/on |
| 8 | Cashier void with manager PIN, restock → stock restored; in report with approver | `apps/api/test/orders/void.test.ts`; `test/reports/reports.test.ts` (voids); app `orders_stock_test.dart`; integration test | — |
| 9 | Employee: no order screen; waste and count; movements | app `app_test.dart` (employee home), `orders_stock_test.dart`; API stock tests | 👤 on the tablet |
| 10 | Low-stock email exactly once per crossing; re-arms after stock-in | `apps/api/test/stock/low-stock.test.ts`, `test/worker/outbox.test.ts` | 👤 email arrives in the owner's inbox |
| 11 | Owner on phone over 4G: home today, payments report, margin with COGS | `test/reports/reports.test.ts` (hand-computed); `e2e/reports-pages.spec.ts` at 375 px | 👤 needs a deployed server (not part of this build) |
| 12 | Manager can't see reports, costs, users, settings (UI and API) | `apps/api/test/auth/permissions.test.ts`, report 403 tests; dashboard route guard + hidden nav | 👤 quick click-through |
| 13 | Printer off → order completes, failure shown, retry works | app `printing_test.dart` (unreachable, timeout, retry) | 👤 with the real printer |
| 14 | Two shops: B sees none of A's data | the isolation suite `apps/api/test/rls/*` (every route, including number-only reports) | — |

## Running it

1. Start the stack: `docker compose up -d --build --wait`. For a demo shop to explore first, run `pnpm db:seed` (it prints the logins).
2. Build the app for the tablet: `cd apps/cashier && flutter run --dart-define=API_BASE_URL=http://<this-computer's-LAN-IP>:4000`.
3. Go through items 1–14 on the tablet, phone and printers. Record anything that fails here with the steps, and mark it P0 if it blocks the pilot.

Items 2, 10 and 11 involve real email and a public server; locally, email goes to Mailpit (http://localhost:8025) and "away from the shop" can only be simulated on the LAN.

## Results

| Date | Tester | Device / printers | Result | Notes |
|---|---|---|---|---|
| | | | | |
