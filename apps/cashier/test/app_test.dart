import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zurupos_cashier/app.dart';

void main() {
  testWidgets('renders Bahasa Indonesia by default', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: ZuruApp()));
    await tester.pumpAndSettle();
    expect(find.text('Aplikasi kasir. Segera hadir.'), findsOneWidget);
  });

  testWidgets('renders English when selected', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: ZuruApp(locale: Locale('en'))));
    await tester.pumpAndSettle();
    expect(find.text('Cashier app. Coming soon.'), findsOneWidget);
  });
}
