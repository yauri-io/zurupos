import 'package:flutter_test/flutter_test.dart';
import 'package:zurupos_cashier/api/models.dart';
import 'package:zurupos_cashier/domain/cart.dart';
import 'package:zurupos_cashier/domain/payment.dart';
import 'package:zurupos_cashier/domain/selection.dart';

import '../support/menu.dart';

void main() {
  final b = kopiBootstrap();
  final kopi = b.items.firstWhere((i) => i.id == 'kopi-susu');
  final croissant = b.items.firstWhere((i) => i.id == 'croissant');
  final groups = b.groupsOf(kopi);
  ModifierOption opt(String id) => b.groups.values.expand((g) => g.options).firstWhere((o) => o.id == id);
  final plain = selectedOptions(defaultSelection(groups), groups);

  group('selection', () {
    test('defaults pre-select the default of every group and are valid', () {
      final s = defaultSelection(groups);
      expect(s, {
        'g-size': {'o-regular'},
        'g-sugar': {'o-normal'},
        'g-milk': {'o-fresh'},
        'g-extra': <String>{},
      });
      expect(selectionValid(s, groups), isTrue);
    });

    test('single-select replaces; a required single can’t be emptied', () {
      final size = groups[0];
      var s = toggleOption(defaultSelection(groups), size, 'o-large');
      expect(s['g-size'], {'o-large'});
      s = toggleOption(s, size, 'o-large');
      expect(s['g-size'], {'o-large'});
    });

    test('multi-select toggles up to max_select', () {
      final extra = groups[3];
      var s = defaultSelection(groups);
      s = toggleOption(s, extra, 'o-shot');
      s = toggleOption(s, extra, 'o-vanilla');
      s = toggleOption(s, extra, 'o-caramel'); // over max 2: ignored
      expect(s['g-extra'], {'o-shot', 'o-vanilla'});
      s = toggleOption(s, extra, 'o-shot');
      expect(s['g-extra'], {'o-vanilla'});
    });

    test('a missing required choice makes the selection invalid', () {
      final s = {...defaultSelection(groups), 'g-milk': <String>{}};
      expect(selectionValid(s, groups), isFalse);
    });

    test('selected options come back in sheet order', () {
      var s = defaultSelection(groups);
      s = toggleOption(s, groups[3], 'o-shot');
      s = toggleOption(s, groups[2], 'o-oat');
      s = toggleOption(s, groups[0], 'o-large');
      expect(selectedOptions(s, groups).map((o) => o.id), ['o-large', 'o-normal', 'o-oat', 'o-shot']);
    });
  });

  group('cart', () {
    test('adding the same item and options again bumps qty', () {
      var c = const Cart().add('a', kopi, plain).add('b', kopi, plain);
      expect(c.lines, hasLength(1));
      expect(c.lines.single.qty, 2);
      c = c.add('c', kopi, [...plain, opt('o-shot')]);
      expect(c.lines, hasLength(2));
      c = c.add('d', kopi, plain, note: 'less ice');
      expect(c.lines, hasLength(3));
    });

    test('qty below 1 removes the line; qty is capped at 999', () {
      var c = const Cart().add('a', kopi, plain);
      c = c.setQty('a', 1200);
      expect(c.lines.single.qty, 999);
      c = c.setQty('a', 0);
      expect(c.isEmpty, isTrue);
    });

    test('prices with the shared engine (Large + Oat + Shot, PB1 10%)', () {
      final c = const Cart()
          .add('a', kopi, [opt('o-large'), opt('o-normal'), opt('o-oat'), opt('o-shot')])
          .add('b', croissant, const []);
      final p = c.price(b.settings);
      expect(p.lines.first.unitTotal, 41000);
      expect(p.subtotal, 63000);
      expect(p.taxAmount, 6300);
      expect(p.total, 69300);
    });

    test('line and order discounts', () {
      final item10 = b.discounts.firstWhere((d) => d.id == 'd-item10');
      final order5k = b.discounts.firstWhere((d) => d.id == 'd-order5k');
      final c = const Cart()
          .add('a', kopi, plain, qty: 2)
          .setLineDiscount('a', DiscountChoice.preset(item10))
          .copyWith(orderDiscount: DiscountChoice.preset(order5k));
      final p = c.price(b.settings);
      // 50 000 − 5 000 (10%) − 5 000 = 40 000; PB1 4 000.
      expect(
        [p.subtotal, p.itemDiscountTotal, p.orderDiscountAmount, p.netSales, p.total],
        [50000, 5000, 5000, 40000, 44000],
      );
    });

    test('builds the POST /orders payload (SPEC §9)', () {
      final c = const Cart(orderType: OrderType.dineIn, customerName: ' Dina ')
          .add('a', kopi, plain, note: 'less ice')
          .copyWith(orderDiscount: const DiscountChoice.custom(percent: true, value: 1000));
      final payload = c.toOrderPayload(
        clientOrderId: 'uuid-1',
        clientCreatedAt: DateTime.utc(2026, 11, 28, 1, 15, 2),
        payments: [const PaymentDraft(method: 'cash', amount: 24750, tendered: 50000).toJson()],
        expectedTotal: 24750,
      );
      expect(payload, {
        'client_order_id': 'uuid-1',
        'client_created_at': '2026-11-28T01:15:02.000Z',
        'order_type': 'dine_in',
        'customer_name': 'Dina',
        'note': null,
        'lines': [
          {
            'item_id': 'kopi-susu',
            'qty': 1,
            'option_ids': ['o-regular', 'o-normal', 'o-fresh'],
            'note': 'less ice',
            'discount': null,
          },
        ],
        'order_discount': {'kind': 'percent', 'value': 1000},
        'payments': [
          {'method': 'cash', 'amount': 24750, 'tendered': 50000},
        ],
        'expected_total': 24750,
      });
    });
  });

  group('payment', () {
    test('quick cash: exact first, then notes that cover it', () {
      expect(quickCashAmounts(27500), [27500, 30000, 50000, 100000]);
      expect(quickCashAmounts(44000), [44000, 45000, 50000, 100000]);
      expect(quickCashAmounts(50000), [50000, 100000]);
      expect(quickCashAmounts(0), isEmpty);
    });

    test('remaining pre-fills the next split line', () {
      const qris = PaymentDraft(method: 'qris', amount: 20000);
      expect(remainingOf(54400, [qris]), 34400);
      expect(remainingOf(10000, [qris]), 0);
    });

    test('complete only when fully covered; cash change', () {
      const methods = ['cash', 'qris'];
      expect(checkDrafts(54400, const [PaymentDraft(method: 'qris', amount: 20000)], methods).ok, isFalse);
      final check = checkDrafts(54400, const [
        PaymentDraft(method: 'qris', amount: 34400, provider: 'GoPay'),
        PaymentDraft(method: 'cash', amount: 20000, tendered: 50000),
      ], methods);
      expect(check.ok, isTrue);
      expect(check.changeDue, 30000);
    });

    test('non-cash lines send provider/reference but never tendered', () {
      expect(const PaymentDraft(method: 'qris', amount: 1, provider: ' GoPay ', reference: '').toJson(), {
        'method': 'qris',
        'amount': 1,
        'provider': 'GoPay',
      });
    });
  });
}
