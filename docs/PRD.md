# ZuruPOS — Product Requirements Document (MVP)

| | |
|---|---|
| **Version** | 1.0 — final for MVP build |
| **Date** | 2026-11-16 |
| **Companion doc** | `docs/SPEC.md` (technical specification for the build agent) |
| **Pilot** | Design-partner coffee shop, opening end of November 2026 |

---

## 1. Summary

ZuruPOS is a point-of-sale system for small counter-service food & beverage businesses in Indonesia — coffee shops, warung kopi, boba/tea stalls, bakeries and small counter-service restaurants. The customer orders at the counter, pays first, and the order is then prepared.

ZuruPOS **records** payments; it does **not process** them. The merchant keeps using their existing QRIS sticker, EDC machine and cash drawer. The cashier records how the order was paid (cash, QRIS, debit, transfer, split), and ZuruPOS turns that into reports the owner can reconcile against their bank app and cash drawer.

The MVP covers ordering, payment recording, ingredient-level inventory with recipes, staff roles with PIN login, Bluetooth/network receipt printing, low-stock email alerts, and a web dashboard the owner can open from anywhere.

## 2. Problem

- Existing Indonesian POS products (Moka, Majoo, Pawoon, Qasir, Olsera, etc.) target every merchant size at once. Small merchants pay for — and wade through — features built for chains.
- Their free tiers exist but are limited; the most useful features (remote reports, inventory) sit behind paid tiers and add-ons.
- Small coffee shop owners are often not physically at the shop. They want to know, from their phone: how much did we sell today, how was it paid, what's running low, and is the cash right.
- Ingredient costs (beans, milk, syrup, cups) drive margin, but most small shops have no idea of their per-drink cost or when they'll run out of milk.

## 3. Positioning and pricing principles

- **Built for counter service, not for everyone.** The product is defined by the workflow (order → pay → prepare), not a cuisine. The MVP has no tables, open bills or kitchen routing (QR table ordering is deferred until the pilot shows the need — §11, D-069).
- **One plan, one flat price, everything included.** No tiers, no add-ons, no feature gating. Small merchants should not fund enterprise R&D. Every new feature must pass the **marginal-cost test**: if it costs us more for each shop or each message (WhatsApp, SMS, paid AI calls), it needs a design that stays free to run, or it doesn't ship (D-070).
- **Record, don't process.** No payment licensing, no MDR fees, no settlement delays. Value lives in recording and reconciliation.
- Billing/subscription is **not** part of the MVP. The pilot is free.

## 4. Pilot context (design partner)

- A friend's coffee shop, not yet open; target opening **end of November 2026**.
- Staffing: **one cashier and one barista**. One device at the counter.
- The owner's explicit request: **open reports online**, remotely.
- Starting from zero: no menu or data to migrate.

### Timeline

| Date | Milestone |
|---|---|
| 2026-11-16 | PRD + SPEC final |
| ~2026-11-23 | MVP build in the owner's hands for testing (menu setup, trial orders, printer setup) |
| 2026-11-23 → 11-29 | Owner testing; bug fixes; real menu and recipes entered |
| ~2026-11-30 | Shop opens on ZuruPOS |

Quality over speed: the date may move if needed. The MVP must be free of major bugs before the shop opens. Money and stock correctness are non-negotiable.

## 5. Goals and non-goals

### Goals (MVP)
1. A cashier can take an order with coffee-style modifiers, record payment (including split payments) and print a receipt and barista ticket in **under 20 seconds** for a typical 2-item order.
2. Every paid order deducts ingredients accurately via recipes, including modifier adjustments (extra shot, oat milk, size).
3. The owner can see sales, payment-method totals, best sellers, margin and stock levels from their phone, anywhere.
4. The owner gets an email when an ingredient falls below its threshold.
5. Staff access is controlled by role, with fast PIN switching on the shared counter device.
6. Tenant data is strictly isolated (multi-tenant from day one, enforced by Postgres RLS).

### Non-goals (MVP)
- Payment processing or payment-gateway integration of any kind.
- Offline ordering (online required in MVP; architecture must be ready for it — see SPEC §14).
- Multiple screens / barista queue display (planned post-MVP as an **optional** flow).
- Shifts, cash drawer open/close, shift reports.
- Kasbon (pay later), partial refunds, tables, open bills. (QR table ordering is the planned next phase — see §11.)
- GoFood / GrabFood / ShopeeFood integration.
- Loyalty, customer database, promotions engine beyond preset discounts.
- Multi-outlet.
- WhatsApp notifications (explicitly avoided).
- Item photos, supplier management, purchase orders.
- Subscription billing.

## 6. Users and roles

Four fixed roles. Owners cannot create custom roles.

| Role | Who | Where they work |
|---|---|---|
| **Owner** | Shop owner. One per shop in MVP. | Dashboard (email + password) and counter device (PIN) |
| **Manager** | Trusted senior staff / co-founder. | Dashboard (email + password) and counter device (PIN) |
| **Cashier** | Takes orders and records payment. | Counter device (PIN) |
| **Employee** | Barista / helper. Handles stock, doesn't touch money. | Counter device (PIN) |

### Permission matrix

| Action | Owner | Manager | Cashier | Employee |
|---|:-:|:-:|:-:|:-:|
| Take orders, record payments | ✓ | ✓ | ✓ | ✗ |
| Apply preset discount | ✓ | ✓ | ✓ | ✗ |
| Apply custom (ad-hoc) discount | ✓ | ✓ | ✗ | ✗ |
| Void a paid order | ✓ | ✓ | with manager/owner PIN approval | ✗ |
| View today's orders, reprint | ✓ | ✓ | ✓ | ✓ (view only, no reprint of receipts) |
| Stock-in, waste, stock count | ✓ | ✓ | ✗ | ✓ |
| View stock levels | ✓ | ✓ | ✓ | ✓ |
| Edit menu, modifiers, recipes, prices, ingredients, discounts | ✓ | ✓ | ✗ | ✗ |
| View sales reports, payment reports | ✓ | ✗ | ✗ | ✗ |
| View costs, average cost, margins | ✓ | ✗ | ✗ | ✗ |
| Manage users (create, deactivate, reset PIN) | ✓ | ✗ | ✗ | ✗ |
| Pair / revoke counter devices | ✓ | ✓ (pair only) | ✗ | ✗ |
| Shop settings (tax, service charge, receipt, alerts) | ✓ | ✗ | ✗ | ✗ |
| Access web dashboard | ✓ | ✓ (menu, recipes, ingredients, stock, discounts only) | ✗ | ✗ |

**All roles have a PIN** (4–6 digits) for the counter device. Owner and manager additionally have email + password for the dashboard and for pairing devices.

## 7. Functional requirements

Priority: **P0** = must ship for pilot. **P1** = ship if time allows before opening; otherwise first update.

### F1. Shop onboarding (P0)
- Owner signs up with name, email, password, shop name. (Signup can be restricted to invite/flag during pilot.)
- Shop profile: name, address, phone, timezone (default `Asia/Jakarta`; WITA/WIT selectable), receipt header and footer text.
- Password reset by email.

### F2. Users, PINs and devices (P0)
- Owner creates users with name, role, PIN; managers additionally need an email (they receive an invite to set a password).
- Owner can deactivate users and reset PINs. Deactivated users cannot log in anywhere; their history remains.
- **Device pairing:** the counter device (Android tablet/phone) is paired once by an owner or manager signing in with email + password. Afterwards staff switch with **pick name → enter PIN**.
- PINs only work on paired devices. Wrong PIN 5× → that user is locked on that device for 5 minutes.
- "Switch user" is always one tap away. The device auto-locks after a configurable idle time (default 15 min, can be off).
- Owner can see and revoke paired devices from the dashboard.

### F3. Menu (P0)
- Categories (name, sort order, active).
- Items: name, category, price (IDR, excluding tax), active/inactive, available/sold-out toggle (sold-out is quick-toggled from the counter device by owner/manager/cashier), sort order, colour tile.
- Modifier groups (e.g. *Size*, *Sugar level*, *Ice*, *Milk*, *Extras*): single- or multi-select, required or optional, min/max selections.
- Modifier options: name, price delta (can be 0), default selected, sort order.
- Groups are reusable across items.

### F4. Ingredients and inventory (P0)
- Ingredients: name, base unit (`g`, `ml`, `pcs`), current stock, low-stock threshold, average cost per unit (owner only), optional purchase unit (e.g. *Carton = 1000 ml*, *Bag = 1000 g*) to make stock-in entry fast.
- Stock movements (append-only history): sale, void return, stock-in, waste, stock count adjustment.
- **Stock-in:** quantity (in base or purchase unit) and total price paid → updates stock and weighted average cost.
- **Waste:** quantity + reason (spilled, expired, mistake, other).
- **Stock count (opname):** enter actual counted quantity per ingredient → system records the difference as an adjustment.
- Stock may go negative (sales are never blocked by stock). Negative stock is highlighted.
- Stock levels visible to all roles; cost/value visible to owner only.

### F5. Recipes (P0)
- Each item can have a recipe: list of ingredients and quantities per 1 unit sold (e.g. *Kopi Susu Gula Aren* = 18 g espresso beans + 150 ml fresh milk + 20 ml palm sugar syrup + 1 cup 12oz + 1 lid).
- Each modifier option can adjust the recipe:
  - **Add** an ingredient amount (*Extra shot* → +18 g beans).
  - **Remove** an ingredient (*No sugar* → remove palm sugar syrup).
  - **Replace** one ingredient with another (*Oat milk* → replace fresh milk with oat milk, same or different qty; *Large* → replace cup 12oz with cup 16oz and add +50 ml milk).
- Items without a recipe simply don't affect stock.
- Dashboard shows per-item **theoretical cost** and **margin** using current average costs (owner only).

### F6. Ordering at the counter (P0)
- Category tabs + item grid; tap item → modifier sheet (defaults pre-selected, required groups enforced) → add to cart.
- Cart: quantity +/−, per-line note, remove line, per-line preset discount.
- Order fields: order type (*Dine-in* / *Take away*), customer name (optional, printed big on barista ticket), order note.
- Live totals: subtotal, discounts, service charge, tax, total.
- Daily order number (resets every business day), shown on screen and tickets.

### F7. Discounts (P0)
- Owner/manager define preset discounts: name, percentage or fixed IDR, applies to *item* or *order*.
- Cashier can apply presets only. Owner/manager can also enter a custom percentage or amount at the counter.
- Max one discount per line and one order-level discount.

### F8. Tax and service charge (P0)
- Both optional, configured per shop by the owner.
- **Item prices exclude tax.** Tax and service charge are added on top.
- Service charge: on/off + percentage. Tax: on/off + name (default *PB1*) + percentage + whether tax is calculated on top of service charge (default yes).
- Calculation order and rounding are defined precisely in SPEC §6.

### F9. Payment recording (P0)
- Methods: **Cash, QRIS, Debit card, Credit card, Bank transfer, Other.** Owner can hide methods the shop doesn't use.
- Cash: enter amount tendered (quick buttons: *Exact*, Rp 20.000, 50.000, 100.000) → change shown.
- Non-cash: optional reference (e.g. last digits / ref no.) and optional provider label (e.g. *BCA*, *GoPay*, *ShopeePay*) to help reconciliation.
- **Split payments:** multiple payment lines until the total is covered (e.g. Rp 20.000 cash + rest QRIS).
- An order is saved only when fully paid. No unpaid / pay-later orders in MVP.
- Paying completes the order and deducts stock.

### F10. Order history and voids (P0)
- Today's orders list on the device (search by number/customer name); order detail; reprint receipt/ticket.
- **Void** a paid order: reason required; cashier needs a manager/owner to enter their PIN on the device to approve. Voider chooses whether ingredients go **back to stock** (not made) or stay deducted (already made).
- Voided orders are excluded from sales and shown in a separate voids report. All voids are audit-logged.
- No partial refunds in MVP.

### F11. Printing (P0)
- Supports **Bluetooth** (classic, ESC/POS) and **network** (LAN, ESC/POS on TCP 9100) thermal printers, 58 mm and 80 mm.
- Up to two printers per device (e.g. receipt printer at cashier, ticket printer at the bar), each assigned *receipt*, *barista ticket*, or both.
- Auto-print on payment toggle per ticket type; manual reprint from order history; test print in settings.
- ~~Optional cash-drawer kick on cash payments~~ — removed (D-067); the cashier opens the drawer by hand.
- **Printing failure never blocks or undoes an order.** The cashier sees a clear "print failed — retry" prompt.
- Receipt and ticket contents defined in SPEC §11.

### F12. Owner dashboard — web, mobile-first (P0)
- **Home (today):** net sales, order count, average order value, sales by payment method, top 5 items, low-stock list, voids count. Auto-refresh.
- **Sales report:** date range picker; gross sales, discounts, net sales, service charge, tax, total collected; daily breakdown; by hour; by item; by category.
- **Payments report:** totals per method per day — the reconciliation view (compare with bank app / cash drawer).
- **Margin report (owner):** per item quantity sold, net sales, cost of goods, gross margin, margin %.
- **Orders:** searchable list with filters (date, status, payment method, staff), order detail, void history with reasons and approvers.
- **Inventory:** stock levels (negative and low highlighted), stock value (owner), movement history per ingredient, stock-in / waste / stock count forms.
- **Menu, modifiers, recipes, ingredients, discounts:** full CRUD (owner + manager).
- **Users and devices** (owner). **Settings** (owner): shop profile, tax, service charge, payment methods, receipt text, alert recipients, business day cutoff.
- Manager sees only menu, recipes, ingredients, inventory, discounts.

### F13. Low-stock email alerts (P0)
- When an ingredient's stock falls to or below its threshold, email the owner (plus any extra addresses in settings).
- Alert once per crossing; no repeat until stock is replenished above threshold and falls again.
- Multiple ingredients crossing in the same moment → one combined email.
- Email in Bahasa Indonesia, listing ingredient, current stock, threshold, and a link to the dashboard inventory page.

### F14. Connectivity behaviour (P0)
- Online is required in MVP.
- Device shows a persistent connection indicator. When offline, the *Pay* button is disabled with a clear message; the cart is kept so nothing is lost; the order is submitted when the connection returns.
- Retries of the same order never create duplicates (idempotent submission).

### P1 items (if time allows before opening)
- CSV export for orders and sales report.
- CSV import for ingredients and menu items (speeds up owner setup).
- Daily summary email to the owner at business-day close. (Not built before opening; now part of F17.)

### Post-pilot reporting (F15–F17)

Scope agreed on 2026-11-25 (D-071 to D-075). The owner already gets the numbers (F12); these turn them into decisions and bring them to the owner. Each report ends in a plain sentence in Bahasa Indonesia, not just a chart. Built and released in the order F15 → F16 → F17 (SPEC §16, R1–R3). All are owner-only and included in the flat price.

#### F15. Operational heatmap
- **Question it answers:** "When is my shop busy, and when do I need two people behind the counter?"
- A grid of weekday × hour showing **average orders** or **average net sales** per trading day (switchable), by business day in the shop's timezone. Hours after midnight that belong to the previous business day sit at the end of that day's row.
- Default range: the last 4 weeks; presets 4, 8 and 12 weeks.
- Shows how much data each weekday is based on ("berdasarkan 4 Sabtu"). Below 3 weeks of data, a banner says the pattern isn't reliable yet and the summary sentence is hidden.
- One summary sentence: the busiest and the quietest time, and how they compare (e.g. "Sabtu 15.00–17.00 rata-rata 3× lebih ramai daripada Selasa siang").

#### F16. Menu matrix
- **Question it answers:** "Which items should I keep, re-price, promote or drop?"
- Per category, each item is placed by **popularity** (share of portions sold) and **margin per portion in rupiah** (net sales after discounts − cost of goods, from what was actually sold). Four groups with action names: **Andalan** (popular, high margin: keep), **Naikkan harga** (popular, low margin: raise the price a little or lower the cost), **Promosikan** (less popular, high margin: put it forward), **Evaluasi** (less popular, low margin: rework or drop).
- **Incomplete cost guard:** items without a recipe or with an ingredient that has no cost are never placed in the matrix; they are listed under *HPP belum lengkap* with a link to fix them. A coverage line shows how complete the costs are. If items with incomplete costs make up more than half of the category's sales, the matrix is replaced by a *Lengkapi HPP dulu* state.
- For *Naikkan harga* items: the gap to the category's average margin per portion, and what a price rise would add over 30 days if the number sold stayed the same (labelled as an estimate).
- Default range: the last 30 days.

#### F17. Report emails
- **Daily summary** (07:00 shop time, for the previous business day): net sales, orders, average order value, change against the same weekday last week, totals per payment method, top 3 items, voids if any, low-stock count, and a link to the dashboard. Not sent for a day without orders.
- **Weekly summary** (Monday 07:30 shop time, for the previous Monday–Sunday): net sales and orders against the week before, the busiest and quietest times (F15), up to 3 menu actions (F16), and a nudge to complete costs if the coverage is low.
- To the shop owner only (not the extra low-stock alert addresses, because these emails contain the shop's money figures). Each email can be turned off in Settings; both are on by default.
- Email only. No WhatsApp (D-072).

## 8. Non-functional requirements

- **Language:** Bahasa Indonesia default UI; English available. All copy externalised for i18n.
- **Currency:** IDR, whole rupiah only, formatted `Rp 25.000`.
- **Devices:** counter app on Android 9+ phones and tablets (landscape tablet is primary; phone portrait supported). Dashboard on any modern mobile/desktop browser.
- **Performance:** order submission < 1 s p95 on normal shop wifi; menu screen opens instantly from local cache; dashboard home < 2 s.
- **Reliability:** no lost or duplicated orders; stock and money calculations are server-authoritative and tested.
- **Security:** strict tenant isolation (RLS), hashed passwords and PINs, paired-device tokens, HTTPS only, audit log for sensitive actions.
- **Time:** all reporting by business day in the shop's timezone.

## 9. Success criteria for the pilot

- The shop runs its full opening week on ZuruPOS with **zero lost or duplicated orders** and **zero incorrect totals**.
- Owner checks the dashboard remotely at least once a day during opening week.
- Payments report matches the bank app and the cash in the drawer at day end (any difference explained by human error, not system error).
- After the first stock count, the theoretical vs. actual stock difference for key ingredients (beans, milk) is explainable (waste, mis-measuring) — i.e. recipes are trusted.
- No P0 bug open at opening day.
- Qualitative: owner and staff say it's faster/easier than what they'd otherwise use.

## 10. Risks

| Risk | Mitigation |
|---|---|
| Recipe/modifier stock logic is wrong → owner stops trusting stock | Precise rules in SPEC §7, unit-tested resolution, recipe preview in dashboard showing exact deduction per modifier combo |
| Bluetooth printing flaky on specific printer models | Test on the owner's actual printer during test week; network printer fallback; printing never blocks orders |
| Shop wifi drops during rush | Clear offline state, cart preserved, idempotent retry; offline mode is first post-MVP item |
| Owner can't finish menu + recipe setup before opening | Seed a sample coffee menu; P1 CSV import; help the owner enter it during test week |
| RLS misconfiguration leaks data across shops | Hard rules in SPEC §3 + mandatory automated isolation test suite |
| Tight two-week window to opening | Build order produces something testable at each milestone; P1 items are cut first |

## 11. Post-MVP roadmap (not in scope now)

**Next phase** (directly after MVP):
1. **Post-pilot reporting**: operational heatmap, menu matrix, daily and weekly summary emails (F15–F17).
2. **Offline ordering** with sync.

**Deferred until the pilot shows the need** (D-069):
- **QR table ordering.** The owner sets up tables in the dashboard. ZuruPOS generates one **static QR code per table** (printable sheet / downloadable PNG). A customer scans it, sees the menu on their phone, and places an order tagged with that table. The order arrives at the counter device. Payment is still recorded by the cashier, not processed online. Open questions for that phase: pay-at-counter vs. pay-before-prepare, how QR orders are confirmed by staff, spam/abuse protection on a public ordering page, and whether QR codes can be regenerated if leaked.

**Later:**
3. Optional second screen: barista queue (new → making → done).
4. Shifts: open/close with cash count and variance.
5. Kasbon (pay later) and customer list.
6. Partial refunds.
7. Web push notifications. (Daily and weekly report emails moved to the next phase as F17.)
8. Subscription billing (single plan).
9. Multi-outlet.
