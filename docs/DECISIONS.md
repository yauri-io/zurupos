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
