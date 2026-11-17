// SPEC §11.1 #9 (manager/owner): language, sold-out toggles. Printers arrive with M5.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/models.dart';
import '../../printing/printer_config.dart';
import '../../state/locale.dart';
import '../../state/printing.dart';
import '../../state/menu.dart';
import '../../state/providers.dart';
import '../common.dart';
import 'printer_page.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l10n;
    final menu = ref.watch(menuProvider).value;
    final locale = ref.watch(localeProvider).languageCode;
    final theme = Theme.of(context);
    final printers = ref.watch(printersProvider);
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
        Row(
          children: [
            Expanded(child: Text(l.settingsPrinters, style: theme.textTheme.titleMedium)),
            TextButton.icon(
              key: const Key('printer-add'),
              onPressed: printers.length >= maxPrinters
                  ? null
                  : () =>
                        Navigator.of(context)
                            .push(MaterialPageRoute<void>(builder: (_) => const PrinterPage())),
              icon: const Icon(Icons.add),
              label: Text(l.printersAdd),
            ),
          ],
        ),
        if (printers.isEmpty) Text(l.printersNone),
        if (printers.length >= maxPrinters) Text(l.printersMax),
        for (final p in printers)
          ListTile(
            key: Key('printer-${p.id}'),
            leading: Icon(p.transport == TransportKind.bluetooth ? Icons.bluetooth : Icons.lan_outlined),
            title: Text(p.name),
            subtitle: Text(
              [
                p.address,
                '${p.paper.mm} mm',
                if (p.receipt) l.printerRoleReceipt,
                if (p.ticket) l.printerRoleTicket,
              ].join(' · '),
            ),
            onTap: () =>
                Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => PrinterPage(existing: p))),
          ),
        const SizedBox(height: 8),
        _AutoReturnField(seconds: ref.watch(autoReturnProvider)),
        const SizedBox(height: 24),
        Text(l.settingsDevice, style: theme.textTheme.titleMedium),
        if (menu != null) Text(menu.settings.name),
        Text(l.settingsServer(apiBaseUrl)),
      ],
    );
  }
}

class _AutoReturnField extends ConsumerStatefulWidget {
  const _AutoReturnField({required this.seconds});

  final int seconds;

  @override
  ConsumerState<_AutoReturnField> createState() => _AutoReturnFieldState();
}

class _AutoReturnFieldState extends ConsumerState<_AutoReturnField> {
  late final _c = TextEditingController(text: '${widget.seconds}');

  @override
  void didUpdateWidget(covariant _AutoReturnField old) {
    super.didUpdateWidget(old);
    if (old.seconds != widget.seconds && int.tryParse(_c.text) != widget.seconds) {
      _c.text = '${widget.seconds}';
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => TextField(
    key: const Key('auto-return'),
    controller: _c,
    keyboardType: TextInputType.number,
    decoration: InputDecoration(labelText: context.l10n.doneAutoReturnSetting),
    onChanged: (v) {
      final n = int.tryParse(v);
      if (n != null) ref.read(autoReturnProvider.notifier).set(n);
    },
  );
}
