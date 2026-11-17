// SPEC §11.1 #7 (orders today + void with approval) and #8 (stock screens).
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/harness.dart';

Future<void> _placeOrder(Harness h) async {
  await h.api.createOrder({
    'client_order_id': 'seed-1',
    'order_type': 'takeaway',
    'customer_name': 'Budi',
    'lines': [
      {'item_id': 'americano', 'qty': 2, 'option_ids': <String>[], 'note': null, 'discount': null},
    ],
    'payments': [
      {'method': 'qris', 'amount': 44000},
    ],
  });
}

Future<void> _open(WidgetTester tester, String label) async {
  await tester.tap(find.text(label).first);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('a cashier voids with a manager’s PIN; a wrong PIN is refused', (tester) async {
    final h = Harness();
    await _placeOrder(h);
    await h.pump(tester);
    await h.signIn(tester, 'u-kasir', '4826');
    await _open(tester, 'Pesanan hari ini');
    expect(find.textContaining('2× Americano'), findsOneWidget);
    await tester.tap(find.byKey(const Key('today-1')));
    await tester.pumpAndSettle();
    expect(find.textContaining('QRIS'), findsOneWidget);

    await tester.tap(find.byKey(const Key('void-open')));
    await tester.pumpAndSettle();
    expect(find.text('Kasir perlu persetujuan pemilik atau manajer.'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('void-reason')), 'Salah input');
    await tester.tap(find.byKey(const Key('void-approver')));
    await tester.pumpAndSettle();
    // Only owners/managers, and never the requester.
    expect(find.text('Barista (Karyawan)'), findsNothing);
    await tester.tap(find.text('Rina (Manajer)').last);
    await tester.pumpAndSettle();
    for (final d in '9999'.split('')) {
      await tester.tap(find.byKey(Key('key-$d')).last);
    }
    await tester.pump();
    await tester.tap(find.byKey(const Key('void-submit')));
    await tester.pumpAndSettle();
    expect(find.text('PIN penyetuju salah.'), findsOneWidget);

    for (final d in '1357'.split('')) {
      await tester.tap(find.byKey(Key('key-$d')).last);
    }
    await tester.pump();
    await tester.tap(find.byKey(const Key('void-submit')));
    await tester.pumpAndSettle();
    expect(h.api.voids.last.body, {
      'reason': 'Salah input',
      'restock': true,
      'approval': {'user_id': 'u-rina', 'pin': '1357'},
    });
    expect(find.byKey(const Key('void-info')), findsOneWidget);
    expect(find.byKey(const Key('void-open')), findsNothing);
    await h.dispose(tester);
  });

  testWidgets('a manager voids without approval', (tester) async {
    final h = Harness();
    await _placeOrder(h);
    await h.pump(tester);
    await h.signIn(tester, 'u-rina', '1357');
    await _open(tester, 'Pesanan hari ini');
    await tester.tap(find.byKey(const Key('today-1')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('void-open')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('void-approver')), findsNothing);
    await tester.enterText(find.byKey(const Key('void-reason')), 'Pelanggan batal');
    await tester.tap(find.text('Kembalikan stok bahan'));
    await tester.pump();
    await tester.tap(find.byKey(const Key('void-submit')));
    await tester.pumpAndSettle();
    expect(h.api.voids.single.body, {'reason': 'Pelanggan batal', 'restock': false, 'approval': null});
    await h.dispose(tester);
  });

  testWidgets('employees see today’s list but can’t open orders; stock shows badges and posts stock-in', (
    tester,
  ) async {
    final h = Harness();
    await _placeOrder(h);
    await h.pump(tester);
    await h.signIn(tester, 'u-barista', '7319');
    expect(find.textContaining('2× Americano'), findsOneWidget);
    await tester.tap(find.byKey(const Key('today-1')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('void-open')), findsNothing);

    await _open(tester, 'Stok');
    expect(find.text('1.500 g'), findsOneWidget);
    expect(find.text('-200 ml'), findsOneWidget);
    expect(find.text('Minus'), findsOneWidget);

    await tester.tap(find.byKey(const Key('stock-in')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('stock-ingredient')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Biji Kopi (1.500 g)').last);
    await tester.pumpAndSettle();
    await tester.tap(find.textContaining('Pakai satuan beli'));
    await tester.enterText(find.byKey(const Key('stock-qty')), '2,5');
    await tester.enterText(find.byKey(const Key('stock-cost')), '450.000');
    await tester.pump();
    await tester.tap(find.byKey(const Key('stock-save')));
    await tester.pumpAndSettle();
    expect(h.api.stockCalls.single, {
      'kind': 'in',
      'ingredient_id': 'ing-beans',
      'purchase_qty': '2.5',
      'total_cost': 450000,
    });
    expect(find.text('Stok tersimpan.'), findsOneWidget);
    await h.dispose(tester);
  });

  testWidgets('stock count submits only the rows that were filled in', (tester) async {
    final h = Harness();
    await h.pump(tester);
    await h.signIn(tester, 'u-rina', '1357');
    await _open(tester, 'Stok');
    await tester.tap(find.byKey(const Key('stock-count')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('count-ing-oat')), '750');
    await tester.pump();
    await tester.tap(find.byKey(const Key('stock-save')));
    await tester.pumpAndSettle();
    expect(h.api.stockCalls.single, {
      'kind': 'count',
      'counts': [
        {'ingredient_id': 'ing-oat', 'counted_qty': '750'},
      ],
    });
    await h.dispose(tester);
  });

  testWidgets('waste rejects more than 3 decimals', (tester) async {
    final h = Harness();
    await h.pump(tester);
    await h.signIn(tester, 'u-rina', '1357');
    await _open(tester, 'Stok');
    await tester.tap(find.byKey(const Key('stock-waste')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('stock-ingredient')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Susu Oat (-200 ml)').last);
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('stock-qty')), '1,2345');
    await tester.pump();
    expect(find.text('Angka tidak valid (maks. 3 desimal).'), findsOneWidget);
    expect(tester.widget<FilledButton>(find.byKey(const Key('stock-save'))).onPressed, isNull);
    await tester.enterText(find.byKey(const Key('stock-qty')), '120');
    await tester.tap(find.text('Kedaluwarsa'));
    await tester.pump();
    await tester.tap(find.byKey(const Key('stock-save')));
    await tester.pumpAndSettle();
    expect(h.api.stockCalls.single, {
      'kind': 'waste',
      'ingredient_id': 'ing-oat',
      'qty': '120',
      'reason': 'expired',
    });
    await h.dispose(tester);
  });
}
