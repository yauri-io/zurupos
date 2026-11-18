import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zurupos_cashier/app.dart';
import 'package:zurupos_cashier/data/local_store.dart';
import 'package:zurupos_cashier/data/token_store.dart';
import 'package:zurupos_cashier/printing/printer_config.dart';
import 'package:zurupos_cashier/state/printing.dart';
import 'package:zurupos_cashier/state/providers.dart';
import 'package:zurupos_cashier/ui/screens/printer_page.dart';

import 'fake_api.dart';
import 'fake_printer.dart';

class Harness {
  Harness({FakeApi? api, String? deviceToken = 'device-token'})
    : api = api ?? FakeApi(),
      store = MemoryLocalStore(),
      tokens = MemoryTokenStore(deviceToken);

  final FakeApi api;
  final MemoryLocalStore store;
  final MemoryTokenStore tokens;
  final printers = FakePrinters();

  /// Printers paired in Android settings; tests add to it to simulate pairing.
  final bonded = <({String name, String address})>[(name: 'RPP02N', address: 'AA:BB:CC:DD:EE:FF')];
  int _ids = 0;

  /// Printers configured on the device before the app starts.
  Future<void> setPrinters(List<PrinterConfig> list) => store.setSetting('printers', encodePrinters(list));

  /// Tablet landscape unless [size] says otherwise.
  Future<void> pump(WidgetTester tester, {Size size = const Size(1280, 800)}) async {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiProvider.overrideWithValue(api),
          localStoreProvider.overrideWithValue(store),
          tokenStoreProvider.overrideWithValue(tokens),
          newIdProvider.overrideWithValue(() => 'id-${++_ids}'),
          transportFactoryProvider.overrideWithValue(printers.transport),
          bondedPrintersProvider.overrideWith((ref) async => [...bonded]),
        ],
        child: const ZuruApp(),
      ),
    );
    await tester.pumpAndSettle();
  }

  /// Picks [name] on the staff screen and types [pin].
  Future<void> signIn(WidgetTester tester, String userId, String pin) async {
    await tester.tap(find.byKey(Key('staff-$userId')));
    await tester.pumpAndSettle();
    for (final d in pin.split('')) {
      await tester.tap(find.byKey(Key('key-$d')).last);
    }
    await tester.pump();
    await tester.tap(find.byKey(const Key('pin-submit')));
    await tester.pumpAndSettle();
  }

  /// Unmount so timers (heartbeat, menu refresh, idle lock) are cancelled.
  Future<void> dispose(WidgetTester tester) async {
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 6));
  }
}
