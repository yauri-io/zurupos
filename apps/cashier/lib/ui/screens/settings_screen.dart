// SPEC §11.1 #9 (manager/owner): language, sold-out toggles. Printers arrive with M5.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/models.dart';
import '../../state/locale.dart';
import '../../state/menu.dart';
import '../../state/providers.dart';
import '../common.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l10n;
    final menu = ref.watch(menuProvider).value;
    final locale = ref.watch(localeProvider).languageCode;
    final theme = Theme.of(context);
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(l.language, style: theme.textTheme.titleMedium),
        const SizedBox(height: 8),
        SegmentedButton<String>(
          segments: [
            ButtonSegment(value: 'id', label: Text(l.languageId)),
            ButtonSegment(value: 'en', label: Text(l.languageEn)),
          ],
          selected: {locale},
          onSelectionChanged: (v) => ref.read(localeProvider.notifier).set(v.first),
        ),
        const SizedBox(height: 24),
        Text(l.settingsAvailability, style: theme.textTheme.titleMedium),
        for (final MenuItem item in menu?.items ?? const <MenuItem>[])
          SwitchListTile(
            key: Key('availability-${item.id}'),
            title: Text(item.name),
            subtitle: item.isAvailable ? null : Text(l.itemSoldOut),
            value: item.isAvailable,
            onChanged: (v) async {
              try {
                await ref.read(menuProvider.notifier).setAvailability(item.id, v);
              } catch (e) {
                if (context.mounted) showMessage(context, errorText(l, e), error: true);
              }
            },
          ),
        const SizedBox(height: 24),
        Text(l.settingsPrinters, style: theme.textTheme.titleMedium),
        Text(l.settingsPrintersLater),
        const SizedBox(height: 24),
        Text(l.settingsDevice, style: theme.textTheme.titleMedium),
        if (menu != null) Text(menu.settings.name),
        Text(l.settingsServer(apiBaseUrl)),
      ],
    );
  }
}
