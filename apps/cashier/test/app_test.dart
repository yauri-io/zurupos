// Pairing, staff picker + PIN, language (SPEC §11.1 #1–2, §11.4).
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zurupos_cashier/api/api_error.dart';

import 'support/harness.dart';

void main() {
  testWidgets('an unpaired device shows pairing in Bahasa Indonesia, then the staff picker', (tester) async {
    final h = Harness(deviceToken: null);
    await h.pump(tester);
    expect(find.text('Pasangkan perangkat ini'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('pair-email')), 'dina@kopi.test');
    await tester.enterText(find.byKey(const Key('pair-password')), 'wrong-password');
    await tester.enterText(find.byKey(const Key('pair-device')), 'Kasir depan');
    await tester.tap(find.byKey(const Key('pair-submit')));
    await tester.pumpAndSettle();
    expect(find.textContaining('Email atau kata sandi salah'), findsOneWidget);
    expect(await h.tokens.read(), isNull);

    await tester.enterText(find.byKey(const Key('pair-password')), 'kopi-susu-aren-2026');
    await tester.tap(find.byKey(const Key('pair-submit')));
    await tester.pumpAndSettle();
    expect(await h.tokens.read(), 'device-token');
    expect(find.text('Siapa yang bertugas?'), findsOneWidget);
    expect(find.text('Kasir'), findsWidgets);
    await h.dispose(tester);
  });

  testWidgets('switching to English is remembered on the device', (tester) async {
    final h = Harness();
    await h.pump(tester);
    await tester.tap(find.byKey(const Key('language')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('English').last);
    await tester.pumpAndSettle();
    expect(find.text("Who's working?"), findsOneWidget);
    expect(await h.store.setting('locale'), 'en');
    await h.dispose(tester);
  });

  testWidgets('wrong PIN shows an error; a lockout counts down and blocks the pad', (tester) async {
    final h = Harness();
    await h.pump(tester);
    await h.signIn(tester, 'u-kasir', '1111');
    expect(find.text('PIN salah.'), findsOneWidget);

    final until = DateTime.now().add(const Duration(seconds: 30)).toUtc().toIso8601String();
    h.api.pinErrors.add(ApiException('PIN_LOCKED', status: 423, details: {'locked_until': until}));
    for (final d in '4826'.split('')) {
      await tester.tap(find.byKey(Key('key-$d')).last);
    }
    await tester.pump();
    await tester.tap(find.byKey(const Key('pin-submit')));
    await tester.pump();
    expect(find.textContaining('Coba lagi dalam 30 detik'), findsOneWidget);
    await tester.pump(const Duration(seconds: 1));
    expect(find.textContaining('Coba lagi dalam 29 detik'), findsOneWidget);
    // Keys do nothing while locked.
    await tester.tap(find.byKey(const Key('key-4')).last);
    await tester.pump();
    final submit = tester.widget<FilledButton>(find.byKey(const Key('pin-submit')));
    expect(submit.onPressed, isNull);
    await tester.tap(find.text('Batal'));
    await tester.pump(const Duration(seconds: 31));
    await h.dispose(tester);
  });

  testWidgets('the right PIN opens the register for a cashier', (tester) async {
    final h = Harness();
    await h.pump(tester);
    await h.signIn(tester, 'u-kasir', '4826');
    expect(find.text('Kopi Susu Gula Aren'), findsOneWidget);
    expect(find.byKey(const Key('pay')), findsOneWidget);
    // Cashiers: register + today's orders; no stock or settings.
    expect(find.text('Stok'), findsNothing);
    expect(find.text('Pengaturan'), findsNothing);
    await tester.tap(find.byKey(const Key('switch-user')));
    await tester.pumpAndSettle();
    expect(find.text('Siapa yang bertugas?'), findsOneWidget);
    await h.dispose(tester);
  });

  testWidgets('employees get today’s orders and stock, no register', (tester) async {
    final h = Harness();
    await h.pump(tester);
    await h.signIn(tester, 'u-barista', '7319');
    expect(find.byKey(const Key('pay')), findsNothing);
    expect(find.text('Pesanan hari ini'), findsWidgets);
    expect(find.text('Stok'), findsWidgets);
    await h.dispose(tester);
  });

  testWidgets('a revoked device goes back to pairing', (tester) async {
    final h = Harness();
    h.api.revoked = true;
    await h.pump(tester);
    expect(find.text('Pasangkan perangkat ini'), findsOneWidget);
    expect(await h.tokens.read(), isNull);
    await h.dispose(tester);
  });

  testWidgets('owner unpairs the device: back to pairing, shop data cleared, settings kept (D-048)', (
    tester,
  ) async {
    final h = Harness();
    await h.store.setSetting('printers', '[]');
    await h.pump(tester);
    await h.signIn(tester, 'u-dina', '2580');
    expect(await h.store.menu(), isNotNull);
    await tester.tap(find.text('Pengaturan').first);
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('device-unpair')));
    await tester.tap(find.byKey(const Key('device-unpair')));
    await tester.pumpAndSettle();
    expect(find.text('Lepas perangkat ini?'), findsOneWidget);
    await tester.tap(find.byKey(const Key('device-unpair-confirm')));
    await tester.pumpAndSettle();

    expect(h.api.unpaired, isTrue);
    expect(find.text('Pasangkan perangkat ini'), findsOneWidget);
    expect(await h.tokens.read(), isNull);
    expect(await h.store.menu(), isNull);
    expect(await h.store.setting('printers'), '[]');
    await h.dispose(tester);
  });

  testWidgets('unpair is refused while an order is still unsent', (tester) async {
    final h = Harness();
    await h.pump(tester);
    await h.signIn(tester, 'u-dina', '2580');
    await h.store.savePending('order-1', {'client_order_id': 'order-1'});
    await tester.tap(find.text('Pengaturan').first);
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('device-unpair')));
    await tester.tap(find.byKey(const Key('device-unpair')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('device-unpair-confirm')));
    await tester.pumpAndSettle();
    expect(h.api.unpaired, isFalse);
    expect(
      find.text('Masih ada pesanan yang belum terkirim. Kirim dulu sebelum melepas perangkat.'),
      findsOneWidget,
    );
    expect(await h.tokens.read(), isNotNull);
    await h.dispose(tester);
  });
}
