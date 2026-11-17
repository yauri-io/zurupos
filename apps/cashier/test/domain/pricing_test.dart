// SPEC §6 — every shared fixture, the same file the TS engine runs.
// test/fixtures/pricing-cases.json is a copy made by `pnpm cashier:fixtures`.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:zurupos_cashier/domain/pricing.dart';

Discount? _discount(Object? json) {
  if (json == null) return null;
  final d = json as Map<String, dynamic>;
  return Discount(DiscountKind.values.byName(d['kind'] as String), d['value'] as int);
}

String _problemCode(PaymentProblem p) => switch (p) {
  PaymentProblem.paymentMismatch => 'PAYMENT_MISMATCH',
  PaymentProblem.validation => 'VALIDATION',
  PaymentProblem.methodDisabled => 'METHOD_DISABLED',
};

void main() {
  final file = File('test/fixtures/pricing-cases.json');
  final cases = ((jsonDecode(file.readAsStringSync()) as Map<String, dynamic>)['cases'] as List<dynamic>)
      .cast<Map<String, dynamic>>();

  test('has at least 40 cases (SPEC §6)', () => expect(cases.length, greaterThanOrEqualTo(40)));

  test('is the same file the API tests run', () {
    final api = File('../api/test/fixtures/pricing-cases.json');
    if (!api.existsSync()) return markTestSkipped('API fixtures not present');
    expect(file.readAsStringSync(), api.readAsStringSync(), reason: 'run `pnpm cashier:fixtures`');
  });

  for (final c in cases) {
    test(c['name'] as String, () {
      final s = c['settings'] as Map<String, dynamic>;
      final result = priceOrder(
        (c['lines'] as List<dynamic>).cast<Map<String, dynamic>>().map((l) {
          return LineInput(
            unitPrice: l['unit_price'] as int,
            optionDeltas: (l['option_deltas'] as List<dynamic>).cast<int>(),
            qty: l['qty'] as int,
            discount: _discount(l['discount']),
          );
        }).toList(),
        _discount(c['order_discount']),
        PricingSettings(
          serviceChargeEnabled: s['service_charge_enabled'] as bool,
          serviceChargeBps: s['service_charge_bps'] as int,
          taxEnabled: s['tax_enabled'] as bool,
          taxBps: s['tax_bps'] as int,
          taxOnServiceCharge: s['tax_on_service_charge'] as bool,
        ),
      );
      final actual = <String, Object?>{
        'lines': [
          for (final l in result.lines)
            {
              'modifiers_unit_total': l.modifiersUnitTotal,
              'unit_total': l.unitTotal,
              'line_gross': l.lineGross,
              'discount_amount': l.discountAmount,
              'line_net': l.lineNet,
            },
        ],
        'subtotal': result.subtotal,
        'item_discount_total': result.itemDiscountTotal,
        'order_discount_amount': result.orderDiscountAmount,
        'net_sales': result.netSales,
        'service_charge_amount': result.serviceChargeAmount,
        'tax_amount': result.taxAmount,
        'total': result.total,
      };
      final payments = c['payments'] as List<dynamic>?;
      if (payments != null) {
        final check = checkPayments(
          result.total,
          payments.cast<Map<String, dynamic>>().map((p) {
            return PaymentInput(
              method: p['method'] as String,
              amount: p['amount'] as int,
              tendered: p['tendered'] as int?,
            );
          }).toList(),
          (c['enabled_payment_methods'] as List<dynamic>).cast<String>(),
        );
        actual['payments'] = check.ok
            ? {'change_due': check.changeDue}
            : {'error': _problemCode(check.problem!)};
      }
      expect(actual, c['expected']);
    });
  }

  group('pct', () {
    test('rounds half up', () {
      expect(pct(5, 1000), 1); // 0.5 → 1
      expect(pct(4, 1000), 0); // 0.4 → 0
      expect(pct(15, 1000), 2); // 1.5 → 2
    });
    test('rejects negative amounts and out-of-range bps', () {
      expect(() => pct(-1, 1000), throwsArgumentError);
      expect(() => pct(1, 10001), throwsArgumentError);
    });
  });
}
