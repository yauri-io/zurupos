// SPEC §6: pricing as pure functions over 64-bit int rupiah. No doubles anywhere.
// A port of apps/api/src/domain/pricing.ts; both run test/fixtures/pricing-cases.json.

enum DiscountKind { percent, fixed }

class Discount {
  const Discount(this.kind, this.value);

  final DiscountKind kind;

  /// Basis points for percent, rupiah for fixed.
  final int value;
}

class PricingSettings {
  const PricingSettings({
    required this.serviceChargeEnabled,
    required this.serviceChargeBps,
    required this.taxEnabled,
    required this.taxBps,
    required this.taxOnServiceCharge,
  });

  final bool serviceChargeEnabled;
  final int serviceChargeBps;
  final bool taxEnabled;
  final int taxBps;
  final bool taxOnServiceCharge;
}

class LineInput {
  const LineInput({required this.unitPrice, required this.optionDeltas, required this.qty, this.discount});

  final int unitPrice;
  final List<int> optionDeltas;
  final int qty;
  final Discount? discount;
}

class PricedLine {
  const PricedLine({
    required this.modifiersUnitTotal,
    required this.unitTotal,
    required this.lineGross,
    required this.discountAmount,
    required this.lineNet,
  });

  final int modifiersUnitTotal;
  final int unitTotal;
  final int lineGross;
  final int discountAmount;
  final int lineNet;
}

class PricedOrder {
  const PricedOrder({
    required this.lines,
    required this.subtotal,
    required this.itemDiscountTotal,
    required this.orderDiscountAmount,
    required this.netSales,
    required this.serviceChargeAmount,
    required this.taxAmount,
    required this.total,
  });

  final List<PricedLine> lines;
  final int subtotal;
  final int itemDiscountTotal;
  final int orderDiscountAmount;
  final int netSales;
  final int serviceChargeAmount;
  final int taxAmount;
  final int total;
}

/// §6.1: half-up percentage of a non-negative amount.
int pct(int amount, int bps) {
  if (amount < 0) throw ArgumentError.value(amount, 'amount', 'must be non-negative');
  if (bps < 0 || bps > 10000) throw ArgumentError.value(bps, 'bps', 'out of range');
  return (amount * bps + 5000) ~/ 10000;
}

int _discountAmount(int base, Discount? discount, int units) {
  if (discount == null) return 0;
  if (discount.kind == DiscountKind.percent) return pct(base, discount.value);
  final amount = discount.value * units;
  return amount < base ? amount : base;
}

/// §6.2. A fixed item discount is per unit, capped at the line.
PricedLine priceLine(LineInput line) {
  if (line.qty < 1) throw ArgumentError.value(line.qty, 'qty', 'must be a positive integer');
  final modifiersUnitTotal = line.optionDeltas.fold<int>(0, (sum, d) => sum + d);
  final unitTotal = line.unitPrice + modifiersUnitTotal;
  final lineGross = unitTotal * line.qty;
  final amount = _discountAmount(lineGross, line.discount, line.qty);
  return PricedLine(
    modifiersUnitTotal: modifiersUnitTotal,
    unitTotal: unitTotal,
    lineGross: lineGross,
    discountAmount: amount,
    lineNet: lineGross - amount,
  );
}

/// §6.3
PricedOrder priceOrder(List<LineInput> lines, Discount? orderDiscount, PricingSettings settings) {
  final priced = lines.map(priceLine).toList(growable: false);
  final subtotal = priced.fold<int>(0, (s, l) => s + l.lineGross);
  final itemDiscountTotal = priced.fold<int>(0, (s, l) => s + l.discountAmount);
  final afterItems = subtotal - itemDiscountTotal;
  final orderDiscountAmount = _discountAmount(afterItems, orderDiscount, 1);
  final netSales = afterItems - orderDiscountAmount;
  final serviceChargeAmount = settings.serviceChargeEnabled ? pct(netSales, settings.serviceChargeBps) : 0;
  final taxBase = netSales + (settings.taxOnServiceCharge ? serviceChargeAmount : 0);
  final taxAmount = settings.taxEnabled ? pct(taxBase, settings.taxBps) : 0;
  return PricedOrder(
    lines: priced,
    subtotal: subtotal,
    itemDiscountTotal: itemDiscountTotal,
    orderDiscountAmount: orderDiscountAmount,
    netSales: netSales,
    serviceChargeAmount: serviceChargeAmount,
    taxAmount: taxAmount,
    total: netSales + serviceChargeAmount + taxAmount,
  );
}

class PaymentInput {
  const PaymentInput({required this.method, required this.amount, this.tendered});

  final String method;
  final int amount;

  /// Cash only (D-025); null for every other method.
  final int? tendered;
}

enum PaymentProblem { paymentMismatch, validation, methodDisabled }

class PaymentCheck {
  const PaymentCheck.ok(this.changeDue) : problem = null, index = null;
  const PaymentCheck.fail(PaymentProblem this.problem, {this.index}) : changeDue = 0;

  final int changeDue;
  final PaymentProblem? problem;
  final int? index;

  bool get ok => problem == null;
}

/// §6.4 (+ D-025: cash lines must carry tendered).
PaymentCheck checkPayments(int total, List<PaymentInput> payments, List<String> enabledMethods) {
  if (total == 0 && payments.isEmpty) return const PaymentCheck.ok(0);
  for (var i = 0; i < payments.length; i++) {
    final p = payments[i];
    if (!enabledMethods.contains(p.method)) {
      return PaymentCheck.fail(PaymentProblem.methodDisabled, index: i);
    }
    if (p.amount <= 0) return PaymentCheck.fail(PaymentProblem.validation, index: i);
    if (p.method == 'cash') {
      final tendered = p.tendered;
      if (tendered == null || tendered < p.amount) {
        return PaymentCheck.fail(PaymentProblem.validation, index: i);
      }
    } else if (p.tendered != null) {
      return PaymentCheck.fail(PaymentProblem.validation, index: i);
    }
  }
  final paid = payments.fold<int>(0, (s, p) => s + p.amount);
  if (paid != total) return const PaymentCheck.fail(PaymentProblem.paymentMismatch);
  final changeDue = payments.fold<int>(
    0,
    (s, p) => p.method == 'cash' && p.tendered != null ? s + (p.tendered! - p.amount) : s,
  );
  return PaymentCheck.ok(changeDue);
}
