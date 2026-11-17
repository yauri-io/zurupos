#!/usr/bin/env python3
"""Generates apps/api/test/fixtures/pricing-cases.json.

An independent implementation of SPEC §6 (Python, integers only) produces the
expected values, so the TS and Dart engines are checked against something other
than themselves. Run: python3 apps/api/scripts/pricing-cases.py
"""
import json
from pathlib import Path


def pct(amount, bps):
    assert amount >= 0 and isinstance(amount, int) and isinstance(bps, int)
    return (amount * bps + 5000) // 10000


def line_discount(gross, qty, d):
    if d is None:
        return 0
    if d["kind"] == "percent":
        return pct(gross, d["value"])
    return min(d["value"] * qty, gross)


def price(case):
    lines_out = []
    for l in case["lines"]:
        mods = sum(l.get("option_deltas", []))
        unit_total = l["unit_price"] + mods
        gross = unit_total * l["qty"]
        disc = line_discount(gross, l["qty"], l.get("discount"))
        lines_out.append({
            "modifiers_unit_total": mods,
            "unit_total": unit_total,
            "line_gross": gross,
            "discount_amount": disc,
            "line_net": gross - disc,
        })
    subtotal = sum(x["line_gross"] for x in lines_out)
    item_disc = sum(x["discount_amount"] for x in lines_out)
    after = subtotal - item_disc
    od = case.get("order_discount")
    if od is None:
        order_disc = 0
    elif od["kind"] == "percent":
        order_disc = pct(after, od["value"])
    else:
        order_disc = min(od["value"], after)
    net = after - order_disc
    s = case["settings"]
    service = pct(net, s["service_charge_bps"]) if s["service_charge_enabled"] else 0
    tax_base = net + (service if s["tax_on_service_charge"] else 0)
    tax = pct(tax_base, s["tax_bps"]) if s["tax_enabled"] else 0
    total = net + service + tax
    return {
        "lines": lines_out,
        "subtotal": subtotal,
        "item_discount_total": item_disc,
        "order_discount_amount": order_disc,
        "net_sales": net,
        "service_charge_amount": service,
        "tax_amount": tax,
        "total": total,
    }


def payments(total, pays, enabled):
    """SPEC §6.4. Returns {"change_due": n} or {"error": code}."""
    if total == 0 and len(pays) == 0:
        return {"change_due": 0}
    for p in pays:
        if p["method"] not in enabled:
            return {"error": "METHOD_DISABLED"}
        if p["amount"] <= 0:
            return {"error": "VALIDATION"}
        if p["method"] == "cash":
            if p.get("tendered") is None or p["tendered"] < p["amount"]:
                return {"error": "VALIDATION"}
        elif p.get("tendered") is not None:
            return {"error": "VALIDATION"}
    if sum(p["amount"] for p in pays) != total:
        return {"error": "PAYMENT_MISMATCH"}
    return {"change_due": sum(p["tendered"] - p["amount"] for p in pays if p["method"] == "cash")}


ALL = ["cash", "qris", "debit", "credit", "transfer", "other"]
NONE = dict(service_charge_enabled=False, service_charge_bps=0, tax_enabled=False, tax_bps=0, tax_on_service_charge=True)
PB1 = dict(NONE, tax_enabled=True, tax_bps=1000)
SVC5 = dict(NONE, service_charge_enabled=True, service_charge_bps=500)
BOTH = dict(PB1, service_charge_enabled=True, service_charge_bps=500)
BOTH_NO_TOS = dict(BOTH, tax_on_service_charge=False)


def L(price, qty=1, deltas=(), discount=None):
    out = {"unit_price": price, "qty": qty, "option_deltas": list(deltas)}
    if discount:
        out["discount"] = discount
    return out


P = lambda bps: {"kind": "percent", "value": bps}
F = lambda rp: {"kind": "fixed", "value": rp}
cash = lambda amount, tendered=None: {"method": "cash", "amount": amount, "tendered": amount if tendered is None else tendered}
non = lambda method, amount, **kw: {"method": method, "amount": amount, **kw}

# (name, settings, lines, order_discount, payments-or-None, enabled methods)
CASES = [
    ("single item, no tax or service", NONE, [L(25000)], None, None),
    ("multi-qty line", NONE, [L(25000, 3)], None, None),
    ("item with modifiers", NONE, [L(25000, 1, [5000, 6000])], None, None),
    ("modifiers × qty", NONE, [L(25000, 2, [5000, 6000, 0])], None, None),
    ("several lines", NONE, [L(25000, 2), L(22000), L(8000, 3)], None, None),
    ("zero-price item", NONE, [L(0)], None, None),
    ("zero-price item with paid modifier", NONE, [L(0, 2, [3000])], None, None),
    ("tax only (PB1 10%)", PB1, [L(25000)], None, None),
    ("tax only, rounding .5 up", PB1, [L(12345)], None, None),
    ("tax only, rounding .4 down", PB1, [L(12344)], None, None),
    ("tax 11%", dict(PB1, tax_bps=1100), [L(18500, 2)], None, None),
    ("service only 5%", SVC5, [L(25000)], None, None),
    ("service only, rounding .5 boundary", SVC5, [L(10010)], None, None),
    ("service only, below .5", SVC5, [L(10009)], None, None),
    ("tax and service, tax on service", BOTH, [L(25000, 2), L(22000)], None, None),
    ("tax and service, tax not on service", BOTH_NO_TOS, [L(25000, 2), L(22000)], None, None),
    ("tax on service rounding chain", BOTH, [L(9999)], None, None),
    ("tax disabled but bps set", dict(NONE, tax_bps=1000), [L(25000)], None, None),
    ("service disabled but bps set", dict(NONE, service_charge_bps=500), [L(25000)], None, None),
    ("percent item discount", NONE, [L(25000, 1, (), P(1000))], None, None),
    ("percent item discount rounding .5", NONE, [L(12345, 1, (), P(1000))], None, None),
    ("percent item discount on multi-qty", NONE, [L(25000, 3, [5000], P(1500))], None, None),
    ("fixed item discount is per unit", NONE, [L(25000, 2, (), F(3000))], None, None),
    ("fixed item discount larger than line", NONE, [L(5000, 1, (), F(8000))], None, None),
    ("fixed item discount larger than line × qty", NONE, [L(5000, 3, (), F(6000))], None, None),
    ("100% item discount", NONE, [L(25000, 1, (), P(10000))], None, None),
    ("percent order discount", NONE, [L(25000, 2), L(22000)], P(1000), None),
    ("percent order discount rounding", NONE, [L(33333)], P(1500), None),
    ("fixed order discount", NONE, [L(25000, 2)], F(10000), None),
    ("fixed order discount larger than subtotal", NONE, [L(25000)], F(50000), None),
    ("item and order discounts combined", NONE, [L(25000, 2, (), P(1000)), L(22000, 1, (), F(2000))], P(500), None),
    ("discounts then service then tax", BOTH, [L(25000, 2, [5000], P(1000)), L(22000)], F(5000), None),
    ("discounts, tax not on service", BOTH_NO_TOS, [L(25000, 2, [5000], P(1000)), L(22000)], F(5000), None),
    ("fully discounted order, tax on", BOTH, [L(25000)], P(10000), None),
    ("rounding at every step", BOTH, [L(13333, 3, [1667], P(333))], P(777), None),
    ("large order", BOTH, [L(150000, 40, [25000]), L(999999, 7)], P(250), None),
    ("max qty", PB1, [L(25000, 999, [5000])], None, None),
    ("UAT #6: 2× Kopi Susu (Large, Oat, Less sugar) + Croissant with 10% item discount, PB1",
     PB1, [L(25000, 2, [5000, 6000, 0]), L(22000, 1, (), P(1000))], None, None),
    # Payments (SPEC §6.4)
    ("exact cash", PB1, [L(25000)], None, ([cash(27500)], ALL)),
    ("cash with change", PB1, [L(25000)], None, ([cash(27500, 50000)], ALL)),
    ("split cash + QRIS (UAT #6 style)", PB1, [L(25000, 2, [5000, 6000]), L(22000, 1, (), P(1000))], None,
     ([cash(20000, 20000), non("qris", 80980, provider="GoPay", reference="8821")], ALL)),
    ("split two cash lines with change on both", NONE, [L(30000)], None, ([cash(10000, 20000), cash(20000, 50000)], ALL)),
    ("non-cash only", SVC5, [L(25000)], None, ([non("debit", 26250, provider="BCA", reference="1234")], ALL)),
    ("payment short of total", NONE, [L(25000)], None, ([cash(20000)], ALL)),
    ("payment over total", NONE, [L(25000)], None, ([non("qris", 26000)], ALL)),
    ("cash tendered below amount", NONE, [L(25000)], None, ([cash(25000, 20000)], ALL)),
    ("non-cash with tendered", NONE, [L(25000)], None, ([non("qris", 25000, tendered=25000)], ALL)),
    ("cash without tendered (D-025)", NONE, [L(25000)], None, ([{"method": "cash", "amount": 25000, "tendered": None}], ALL)),
    ("disabled method", NONE, [L(25000)], None, ([non("credit", 25000)], ["cash", "qris"])),
    ("zero total, no payments", NONE, [L(0)], None, ([], ALL)),
    ("fully discounted, no payments", BOTH, [L(25000)], P(10000), ([], ALL)),
    ("zero total with a payment line is a mismatch", NONE, [L(0)], None, ([cash(1000)], ALL)),
    ("no payments for a non-zero total", NONE, [L(25000)], None, ([], ALL)),
]


def build():
    out = []
    for name, settings, lines, order_discount, pay in CASES:
        case = {"name": name, "settings": settings, "lines": lines}
        if order_discount:
            case["order_discount"] = order_discount
        expected = price(case)
        if pay is not None:
            pays, enabled = pay
            case["payments"] = pays
            case["enabled_payment_methods"] = enabled
            expected["payments"] = payments(expected["total"], pays, enabled)
        case["expected"] = expected
        out.append(case)
    return out


if __name__ == "__main__":
    cases = build()
    path = Path(__file__).resolve().parents[1] / "test" / "fixtures" / "pricing-cases.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    doc = {
        "about": "SPEC §6 pricing fixtures shared by the TS and Dart engines. Generated by apps/api/scripts/pricing-cases.py; do not edit by hand.",
        "cases": cases,
    }
    path.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {len(cases)} cases to {path}")
