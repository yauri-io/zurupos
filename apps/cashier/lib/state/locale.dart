import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'providers.dart';

/// The device's UI language, kept in local settings; also sent as Accept-Language.
class LocaleController extends Notifier<Locale> {
  @override
  Locale build() {
    Future.microtask(() async {
      final saved = await ref.read(localStoreProvider).setting('locale');
      if (saved != null && ref.mounted) _apply(saved);
    });
    return const Locale('id');
  }

  void _apply(String code) {
    ref.read(credentialsProvider).locale = code;
    state = Locale(code);
  }

  Future<void> set(String code) async {
    _apply(code);
    await ref.read(localStoreProvider).setSetting('locale', code);
  }
}

final localeProvider = NotifierProvider<LocaleController, Locale>(LocaleController.new);
