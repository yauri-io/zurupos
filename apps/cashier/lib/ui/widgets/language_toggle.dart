import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/locale.dart';
import '../common.dart';

/// Bahasa Indonesia default; English toggle (SPEC §11.4).
class LanguageToggle extends ConsumerWidget {
  const LanguageToggle({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l10n;
    final current = ref.watch(localeProvider).languageCode;
    return PopupMenuButton<String>(
      key: const Key('language'),
      tooltip: l.language,
      icon: const Icon(Icons.translate),
      initialValue: current,
      onSelected: (code) => ref.read(localeProvider.notifier).set(code),
      itemBuilder: (_) => [
        PopupMenuItem(value: 'id', child: Text(l.languageId)),
        PopupMenuItem(value: 'en', child: Text(l.languageEn)),
      ],
    );
  }
}
