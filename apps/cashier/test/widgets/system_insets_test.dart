// D-068: on Android 15+ the app is drawn edge to edge, so the system navigation
// bar sits on top of the bottom of the window. No button may end up under it.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/harness.dart';

/// Android's 3-button navigation bar.
const _navBar = 48.0;

Future<Harness> _start(WidgetTester tester, {Size size = const Size(1280, 800), String user = 'u-kasir'}) async {
  final h = Harness();
  await h.pump(tester, size: size);
  tester.view.padding = const FakeViewPadding(bottom: _navBar);
  tester.view.viewPadding = const FakeViewPadding(bottom: _navBar);
  await tester.pumpAndSettle();
  await h.signIn(tester, user, user == 'u-kasir' ? '4826' : '1357');
  return h;
}

void _expectClear(WidgetTester tester, String key) {
  final rect = tester.getRect(find.byKey(Key(key)).last);
  final limit = tester.view.physicalSize.height / tester.view.devicePixelRatio - _navBar;
  expect(rect.bottom, lessThanOrEqualTo(limit), reason: '$key ends at ${rect.bottom}, nav bar starts at $limit');
}

void main() {
  testWidgets('modifier sheet: Add sits above the navigation bar', (tester) async {
    final h = await _start(tester);
    await tester.tap(find.byKey(const Key('item-kopi-susu')));
    await tester.pumpAndSettle();
    _expectClear(tester, 'modifier-add');
    await h.dispose(tester);
  });

  testWidgets('register (tablet): Pay sits above the navigation bar', (tester) async {
    final h = await _start(tester);
    await tester.tap(find.byKey(const Key('item-americano')));
    await tester.pumpAndSettle();
    _expectClear(tester, 'pay');
    await h.dispose(tester);
  });

  testWidgets('register (phone): the cart bar sits above the navigation bar', (tester) async {
    final h = await _start(tester, size: const Size(400, 800));
    _expectClear(tester, 'cart-bar');
    await h.dispose(tester);
  });

  testWidgets('printer settings: test print and save sit above the navigation bar', (tester) async {
    final h = await _start(tester, user: 'u-rina');
    await tester.tap(find.text('Pengaturan').first);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('printer-add')));
    await tester.pumpAndSettle();
    // Short enough that the form scrolls.
    tester.view.physicalSize = const Size(1280, 560);
    await tester.pumpAndSettle();
    await tester.drag(find.byType(ListView).last, const Offset(0, -2000));
    await tester.pumpAndSettle();
    _expectClear(tester, 'printer-test');
    _expectClear(tester, 'printer-save');
    await h.dispose(tester);
  });
}
