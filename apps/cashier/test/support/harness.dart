import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zurupos_cashier/app.dart';
import 'package:zurupos_cashier/data/local_store.dart';
import 'package:zurupos_cashier/data/token_store.dart';
import 'package:zurupos_cashier/state/providers.dart';

import 'fake_api.dart';

class Harness {
  Harness({FakeApi? api, String? deviceToken = 'device-token'})
    : api = api ?? FakeApi(),
      store = MemoryLocalStore(),
      tokens = MemoryTokenStore(deviceToken);

  final FakeApi api;
  final MemoryLocalStore store;
  final MemoryTokenStore tokens;
  int _ids = 0;

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
