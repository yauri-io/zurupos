// D-051: the owner's one-day summary on the tablet.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zurupos_cashier/api/models.dart';

import '../support/harness.dart';

// 00:30 WIB on 21 Nov 2026: the shop's business date is 2026-11-21.
final _now = DateTime.utc(2026, 11, 20, 17, 30);

DayReport _day(String day) => DayReport.fromJson(
  day: day,
  summary: {
    'total_collected': 151800,
    'orders': 4,
    'average_order_value': 34500,
    'gross_sales': 145000,
    'discounts': 7000,
    'net_sales': 138000,
    'service_charge': 0,
    'tax': 13800,
  },
  payments: {
    'methods': [
      {'method': 'cash', 'provider': null, 'count': 3, 'amount': 101800},
      {'method': 'qris', 'provider': 'GoPay', 'count': 1, 'amount': 50000},
    ],
  },
  items: {
    'items': [
      {'name': 'Croissant', 'qty': 1},
      {'name': 'Kopi Susu Gula Aren', 'qty': 5},
    ],
  },
  voids: {'count': 1, 'total': 22000},
);

void main() {
  testWidgets('the owner sees today’s totals, payments, top items and voids; yesterday on a tap', (
    tester,
  ) async {
    final h = Harness(now: _now);
    h.api.reports['2026-11-21'] = _day('2026-11-21');
    await h.pump(tester);
    await h.signIn(tester, 'u-dina', '2580');
    await tester.tap(find.text('Laporan').first);
    await tester.pumpAndSettle();

    expect(h.api.reportDays, ['2026-11-21']);
    expect(tester.widget<Text>(find.byKey(const Key('report-total'))).data, 'Rp 151.800');
    expect(
      tester.widget<Text>(find.byKey(const Key('report-orders'))).data,
      '4 pesanan · Rata-rata per pesanan Rp 34.500',
    );
    expect(find.text('-Rp 7.000'), findsOneWidget);
    expect(find.text('Pajak'), findsOneWidget);
    expect(find.text('Biaya layanan'), findsNothing);
    expect(
      find.descendant(of: find.byKey(const Key('report-method-cash')), matching: find.text('Rp 101.800')),
      findsOneWidget,
    );
    expect(find.text('QRIS · GoPay'), findsOneWidget);
    // Sorted by quantity sold.
    final kopi = tester.getTopLeft(find.text('Kopi Susu Gula Aren')).dy;
    final croissant = tester.getTopLeft(find.text('Croissant')).dy;
    expect(kopi, lessThan(croissant));
    expect(find.text('5 terjual'), findsOneWidget);
    await tester.scrollUntilVisible(find.byKey(const Key('report-voids')), 200);
    expect(
      find.descendant(of: find.byKey(const Key('report-voids')), matching: find.text('Rp 22.000')),
      findsOneWidget,
    );

    await tester.tap(find.byKey(const Key('report-yesterday')));
    await tester.pumpAndSettle();
    expect(h.api.reportDays.last, '2026-11-20');
    expect(find.text('Belum ada penjualan.'), findsOneWidget);
  });

  testWidgets('managers, cashiers and employees have no report section', (tester) async {
    final h = Harness(now: _now);
    await h.pump(tester);
    for (final (id, pin) in [('u-rina', '1357'), ('u-kasir', '4826'), ('u-barista', '7319')]) {
      await h.signIn(tester, id, pin);
      expect(find.text('Pesanan hari ini'), findsWidgets, reason: id);
      expect(find.text('Laporan'), findsNothing, reason: id);
      await tester.tap(find.byKey(const Key('switch-user')));
      await tester.pumpAndSettle();
    }
    expect(h.api.reportDays, isEmpty);
  });

  testWidgets('switching user leaves the report', (tester) async {
    final h = Harness(now: _now);
    h.api.reports['2026-11-21'] = _day('2026-11-21');
    await h.pump(tester);
    await h.signIn(tester, 'u-dina', '2580');
    await tester.tap(find.text('Laporan').first);
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('report-total')), findsOneWidget);
    await tester.tap(find.byKey(const Key('switch-user')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('report-total')), findsNothing);
    expect(find.byKey(const Key('staff-u-dina')), findsOneWidget);
  });
}
