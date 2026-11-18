// SPEC §16 M4: widget tests for payment, the Done screen and pending-order retry.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zurupos_cashier/api/api_error.dart';

import '../support/fake_api.dart';
import '../support/harness.dart';
import '../support/menu.dart';

Future<Harness> _withKopiInCart(WidgetTester tester, {FakeApi? api}) async {
  final h = Harness(api: api);
  await h.pump(tester);
  await h.signIn(tester, 'u-kasir', '4826');
  await tester.tap(find.byKey(const Key('item-kopi-susu')));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('option-o-large')));
  await tester.pump();
  await tester.tap(find.byKey(const Key('modifier-add')));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('item-croissant')));
  await tester.pumpAndSettle();
  // (25 000 + 5 000) + 22 000 = 52 000; PB1 5 200 → 57 200.
  await tester.tap(find.byKey(const Key('pay')));
  await tester.pumpAndSettle();
  return h;
}

FilledButton _complete(WidgetTester tester) =>
    tester.widget<FilledButton>(find.byKey(const Key('pay-complete')));

void main() {
  testWidgets('cash with a quick amount: change shown, order sent, Done screen, cart cleared', (
    tester,
  ) async {
    final h = await _withKopiInCart(tester);
    expect(find.text('Rp 57.200'), findsWidgets);
    expect(_complete(tester).onPressed, isNull);

    expect(find.byKey(const Key('quick-57200')), findsOneWidget); // exact
    await tester.tap(find.byKey(const Key('quick-100000')));
    await tester.pumpAndSettle();
    expect(find.text('Lunas'), findsOneWidget);
    expect(find.text('Kembalian Rp 42.800'), findsWidgets);
    expect(_complete(tester).onPressed, isNotNull);

    await tester.tap(find.byKey(const Key('pay-complete')));
    await tester.pumpAndSettle();

    final payload = h.api.orderPayloads.single;
    expect(payload['expected_total'], 57200);
    expect(payload['payments'], [
      {'method': 'cash', 'amount': 57200, 'tendered': 100000},
    ]);
    expect((payload['lines'] as List<dynamic>).first, {
      'item_id': 'kopi-susu',
      'qty': 1,
      'option_ids': ['o-large', 'o-normal', 'o-fresh'],
      'note': null,
      'discount': null,
    });
    expect(find.text('No. 1'), findsOneWidget);
    expect(find.byKey(const Key('done-change')), findsOneWidget);
    expect(find.text('Rp 42.800'), findsOneWidget);
    expect(await h.store.pendingOrder(), isNull);

    await tester.tap(find.byKey(const Key('done-new')));
    await tester.pumpAndSettle();
    expect(find.text('Keranjang kosong. Ketuk menu untuk menambah.'), findsOneWidget);
    await h.dispose(tester);
  });

  testWidgets('split: QRIS part with provider + reference, then exact cash for the rest', (tester) async {
    final h = await _withKopiInCart(tester);
    await tester.tap(find.byKey(const Key('method-qris')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('noncash-amount')), findsOneWidget);
    expect(tester.widget<Text>(find.byKey(const Key('noncash-amount'))).data, 'Rp 57.200');
    for (final k in ['2', '0', '00', '0']) {
      await tester.tap(find.byKey(Key('key-$k')));
    }
    await tester.tap(find.text('GoPay'));
    await tester.enterText(find.byKey(const Key('reference')), '8821');
    await tester.pump();
    expect(tester.widget<Text>(find.byKey(const Key('noncash-amount'))).data, 'Rp 20.000');
    await tester.tap(find.byKey(const Key('noncash-add')));
    await tester.pumpAndSettle();
    expect(find.text('Sisa Rp 37.200'), findsOneWidget);
    expect(_complete(tester).onPressed, isNull);

    await tester.tap(find.byKey(const Key('method-cash')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('quick-37200')));
    await tester.pumpAndSettle();
    expect(_complete(tester).onPressed, isNotNull);
    await tester.tap(find.byKey(const Key('pay-complete')));
    await tester.pumpAndSettle();

    expect(h.api.orderPayloads.single['payments'], [
      {'method': 'qris', 'amount': 20000, 'provider': 'GoPay', 'reference': '8821'},
      {'method': 'cash', 'amount': 37200, 'tendered': 37200},
    ]);
    expect(find.text('No. 1'), findsOneWidget);
    expect(find.text('Tanpa kembalian'), findsOneWidget);
    await h.dispose(tester);
  });

  testWidgets('Other provider: the cashier types the name (D-047)', (tester) async {
    final h = await _withKopiInCart(tester);
    await tester.tap(find.byKey(const Key('method-qris')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('provider-other-text')), findsNothing);
    await tester.tap(find.byKey(const Key('provider-other')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('provider-other-text')), '  Bank Jago ');
    await tester.tap(find.byKey(const Key('noncash-add')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('provider-other-text')), findsNothing);
    await tester.tap(find.byKey(const Key('pay-complete')));
    await tester.pumpAndSettle();
    expect(h.api.orderPayloads.single['payments'], [
      {'method': 'qris', 'amount': 57200, 'provider': 'Bank Jago'},
    ]);
    await h.dispose(tester);
  });

  testWidgets('typed cash below the total becomes a partial line', (tester) async {
    final h = await _withKopiInCart(tester);
    for (final k in ['5', '0', '00', '0']) {
      await tester.tap(find.byKey(Key('key-$k')));
    }
    await tester.pump();
    await tester.tap(find.byKey(const Key('cash-add')));
    await tester.pumpAndSettle();
    expect(find.text('Sisa Rp 7.200'), findsOneWidget);
    // Remove it again.
    await tester.tap(find.byTooltip('Hapus'));
    await tester.pumpAndSettle();
    expect(find.text('Sisa Rp 57.200'), findsOneWidget);
    await h.dispose(tester);
  });

  testWidgets('no connection: the order stays pending, blocks new payments, and retries with the same id', (
    tester,
  ) async {
    final h = await _withKopiInCart(tester);
    await tester.tap(find.byKey(const Key('quick-57200')));
    await tester.pumpAndSettle();
    h.api.createErrors.add(const ApiException('NETWORK'));
    await tester.tap(find.byKey(const Key('pay-complete')));
    await tester.pumpAndSettle();

    // Back on the register with the pending banner; the cart was cleared.
    expect(find.text('Pesanan belum terkirim'), findsOneWidget);
    expect((await h.store.pendingOrder())?.clientOrderId, h.api.orderPayloads.single['client_order_id']);
    await tester.tap(find.byKey(const Key('item-americano')));
    await tester.pumpAndSettle();
    expect(tester.widget<FilledButton>(find.byKey(const Key('pay'))).onPressed, isNull);
    expect(find.text('Selesaikan pesanan yang tertunda sebelum menerima pembayaran baru.'), findsOneWidget);

    await tester.tap(find.byKey(const Key('pending-retry')));
    await tester.pumpAndSettle();
    expect(h.api.orderPayloads, hasLength(2));
    expect(h.api.orderPayloads[1]['client_order_id'], h.api.orderPayloads[0]['client_order_id']);
    expect(find.text('No. 1'), findsOneWidget);
    expect(await h.store.pendingOrder(), isNull);

    // Done auto-returns to the register after 5 s.
    await tester.pump(const Duration(seconds: 6));
    await tester.pumpAndSettle();
    expect(find.text('Pesanan belum terkirim'), findsNothing);
    expect(tester.widget<FilledButton>(find.byKey(const Key('pay'))).onPressed, isNotNull);
    await h.dispose(tester);
  });

  testWidgets('PRICE_CHANGED: back to the cart with the refreshed price', (tester) async {
    final api = FakeApi();
    final h = await _withKopiInCart(tester, api: api);
    await tester.tap(find.byKey(const Key('quick-57200')));
    await tester.pumpAndSettle();
    final menu = kopiBootstrapJson();
    menu['menu_version'] = 'v2';
    (menu['items'] as List<dynamic>).cast<Map<String, dynamic>>().firstWhere(
      (i) => i['id'] == 'croissant',
    )['price'] = 24000;
    api.menu = menu;
    api.createErrors.add(const ApiException('PRICE_CHANGED', status: 409));
    await tester.tap(find.byKey(const Key('pay-complete')));
    await tester.pumpAndSettle();

    expect(find.textContaining('Harga berubah'), findsOneWidget);
    expect(await h.store.pendingOrder(), isNull);
    // (30 000 + 24 000) + 5 400 = 59 400
    expect(find.text('Bayar Rp 59.400'), findsOneWidget);
    await h.dispose(tester);
  });
}
