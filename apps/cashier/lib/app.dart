import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'l10n/generated/app_localizations.dart';
import 'state/auth.dart';
import 'state/locale.dart';
import 'ui/home_shell.dart';
import 'ui/screens/pair_screen.dart';
import 'ui/screens/staff_screen.dart';

class ZuruApp extends ConsumerWidget {
  const ZuruApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);
    return MaterialApp(
      onGenerateTitle: (context) => AppLocalizations.of(context).appName,
      locale: ref.watch(localeProvider),
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      theme: ThemeData(colorSchemeSeed: const Color(0xFF6B4226), useMaterial3: true),
      // Android 15+ draws the app edge to edge, under the system navigation bar.
      // Keep every route, sheet and dialog clear of it (D-068). The top is left to
      // the app bars, which already pad for the status bar.
      builder: (context, child) => ColoredBox(
        color: Theme.of(context).colorScheme.surface,
        child: SafeArea(top: false, child: child!),
      ),
      // Keyed by state so signing out drops every pushed route.
      home: switch (auth) {
        AuthLoading() => const Scaffold(body: Center(child: CircularProgressIndicator())),
        Unpaired() => const PairScreen(key: ValueKey('pair')),
        Paired() => const StaffScreen(key: ValueKey('staff')),
        SignedIn(:final user) => HomeShell(key: ValueKey('home-${user.id}'), user: user),
      },
    );
  }
}
