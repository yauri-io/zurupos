# Kickoff prompt

Paste this into the coding agent, started at the repo root, to begin the build.

---

You're building ZuruPOS. Start by reading `CLAUDE.md`, then `docs/PRD.md` and `docs/SPEC.md` in full, then `docs/DECISIONS.md`.

Before writing any code, reply with:
1. A short summary of what you're building, in your own words (5 lines max).
2. Your plan for **M0** and **M1** (SPEC §16): files and folders you'll create, the database roles and migrations, and how you'll structure the RLS isolation test suite (SPEC §3.6).
3. Any questions, or spec ambiguities that block M0–M1. If something isn't blocking, decide it, log it in `docs/DECISIONS.md`, and don't ask.

Then wait for my go-ahead.

After I approve, build **M0** and **M1** only. Follow the hard rules in `CLAUDE.md`. In particular: no deploying and no remote connections; the API connects as `zuru_app`; use `set_config(..., true)` inside transactions; no extra `SECURITY DEFINER` functions. Commit in small steps.

When M1's exit criteria pass:
- update `docs/PROGRESS.md` and the Commands section of `CLAUDE.md`
- **stop** and give me a review summary: what was built, the exact commands to start the stack and run the RLS isolation suite and auth tests, and anything you were unsure about.

Don't start M2 until I say so.

---

## Later prompts (for reference)

**After M1 review:**
> M1 approved. Continue with M2 and M3 per SPEC §16. Stop after M3 for review, with the commands to run the pricing fixtures and the order / void / stock / concurrency / idempotency tests, plus how to see the low-stock email in Mailpit.

**After M3 review:**
> M3 approved. Continue with M4 through M7. For M5, build and golden-test the printer renderers and transports, then give me a manual test checklist for a real Bluetooth printer and a real network printer. Finish with the SPEC §17 UAT checklist status.
