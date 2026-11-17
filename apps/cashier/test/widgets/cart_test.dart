// SPEC §16 M4: widget tests for the cart.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/fake_api.dart';
import '../support/harness.dart';
import '../support/menu.dart';

String _total(WidgetTester tester) => tester.widget<Text>(find.byKey(const Key('cart-total'))).data!;

Future<Harness> _signedIn(WidgetTester tester, {FakeApi? api, Size size = const Size(1280, 800)}) async {
  final h = Harness(api: api);
  await h.pump(tester, size: size);
  await h.signIn(tester, 'u-kasir', '4826');
  return h;
}

void main() {
  testWidgets('an item without modifiers goes straight in; tapping again bumps qty', (tester) async {
    final h = await _signedIn(tester);
    await tester.tap(find.byKey(const Key('item-americano')));
    await tester.pumpAndSettle();
    expect(_total(tester), 'Rp 22.000'); // 20 000 + PB1 10%
    await tester.tap(find.byKey(const Key('item-americano')));
    await tester.pumpAndSettle();
    expect(find.text('2'), findsOneWidget);
    expect(_total(tester), 'Rp 44.000');
    await h.dispose(tester);
  });

  testWidgets('modifier sheet: defaults pre-selected, deltas priced, Add adds the line', (tester) async {
    final h = await _signedIn(tester);
    await tester.tap(find.byKey(const Key('item-kopi-susu')));
    await tester.pumpAndSettle();
    expect(find.text('Tambah — Rp 25.000'), findsOneWidget);

    await tester.tap(find.byKey(const Key('option-o-large')));
    await tester.tap(find.byKey(const Key('option-o-oat')));
    await tester.tap(find.byKey(const Key('option-o-shot')));
    await tester.pump();
    expect(find.text('Tambah — Rp 41.000'), findsOneWidget);
    await tester.tap(find.byKey(const Key('qty-plus')).last);
    await tester.enterText(find.byKey(const Key('line-note')), 'less ice');
    await tester.pump();
    expect(find.text('Tambah — Rp 82.000'), findsOneWidget);

    await tester.tap(find.byKey(const Key('modifier-add')));
    await tester.pumpAndSettle();
    expect(find.textContaining('Large · Normal · Oat milk · Extra shot · “less ice”'), findsOneWidget);
    expect(_total(tester), 'Rp 90.200'); // 82 000 + 8 200
    await h.dispose(tester);
  });

  testWidgets('a required group left empty keeps Add disabled', (tester) async {
    final menu = kopiBootstrapJson();
    // No default size: the cashier must choose.
    final size = (menu['modifier_groups'] as List<dynamic>).first as Map<String, dynamic>;
    size['options'] = [
      for (final o in (size['options'] as List<dynamic>).cast<Map<String, dynamic>>())
        {...o, 'is_default': false},
    ];
    final h = await _signedIn(tester, api: FakeApi(menu: menu));
    await tester.tap(find.byKey(const Key('item-kopi-susu')));
    await tester.pumpAndSettle();
    FilledButton add() => tester.widget<FilledButton>(find.byKey(const Key('modifier-add')));
    expect(add().onPressed, isNull);
    await tester.tap(find.byKey(const Key('option-o-regular')));
    await tester.pump();
    expect(add().onPressed, isNotNull);
    await tester.tap(find.byKey(const Key('modifier-add')));
    await tester.pumpAndSettle();
    await h.dispose(tester);
  });

  testWidgets('sold-out items are greyed and can’t be added', (tester) async {
    final h = await _signedIn(tester, api: FakeApi(menu: kopiBootstrapJson(croissantAvailable: false)));
    expect(
      find.descendant(of: find.byKey(const Key('item-croissant')), matching: find.text('Habis')),
      findsOneWidget,
    );
    await tester.tap(find.byKey(const Key('item-croissant')));
    await tester.pumpAndSettle();
    expect(_total(tester), 'Rp 0');
    expect(find.textContaining('Croissant: Habis'), findsOneWidget);
    await h.dispose(tester);
  });

  testWidgets('qty stepper to 0 removes the line; a cashier picks an item discount', (tester) async {
    final h = await _signedIn(tester);
    await tester.tap(find.byKey(const Key('item-americano')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Americano').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Diskon'));
    await tester.pumpAndSettle();
    // Presets only: custom discounts are for owners and managers (SPEC §6.5).
    expect(find.text('Diskon % lain'), findsNothing);
    await tester.tap(find.byKey(const Key('discount-d-item10')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Simpan'));
    await tester.pumpAndSettle();
    expect(_total(tester), 'Rp 19.800'); // 18 000 + 1 800
    await tester.tap(find.byKey(const Key('qty-minus')));
    await tester.pumpAndSettle();
    expect(find.text('Keranjang kosong. Ketuk menu untuk menambah.'), findsOneWidget);
    await h.dispose(tester);
  });

  testWidgets('owners can give a custom order discount', (tester) async {
    final h = Harness();
    await h.pump(tester);
    await h.signIn(tester, 'u-dina', '2580');
    await tester.tap(find.byKey(const Key('item-americano')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('order-discount')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Potongan Rp lain'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('custom-discount')), '5.000');
    await tester.pump();
    await tester.tap(find.text('Simpan'));
    await tester.pumpAndSettle();
    expect(_total(tester), 'Rp 16.500'); // (20 000 − 5 000) + 1 500
    await h.dispose(tester);
  });

  testWidgets('offline: banner shown and Pay disabled', (tester) async {
    final h = await _signedIn(tester);
    await tester.tap(find.byKey(const Key('item-americano')));
    await tester.pumpAndSettle();
    FilledButton pay() => tester.widget<FilledButton>(find.byKey(const Key('pay')));
    expect(pay().onPressed, isNotNull);
    h.api.online = false;
    await tester.pump(const Duration(seconds: 31)); // next heartbeat
    await tester.pumpAndSettle();
    expect(find.textContaining('Offline'), findsOneWidget);
    expect(pay().onPressed, isNull);
    h.api.online = true;
    await tester.tap(find.text('Coba lagi'));
    await tester.pumpAndSettle();
    expect(pay().onPressed, isNotNull);
    await h.dispose(tester);
  });

  testWidgets('phone portrait: the cart opens from the total bar', (tester) async {
    final h = await _signedIn(tester, size: const Size(400, 860));
    await tester.tap(find.byKey(const Key('item-americano')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('pay')), findsNothing);
    expect(
      find.descendant(of: find.byKey(const Key('cart-bar')), matching: find.text('Rp 22.000')),
      findsOneWidget,
    );
    await tester.tap(find.byKey(const Key('cart-bar')));
    await tester.pumpAndSettle();
    expect(find.text('Bayar Rp 22.000'), findsOneWidget);
    await h.dispose(tester);
  });
}
