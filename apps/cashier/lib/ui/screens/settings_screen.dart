// SPEC §11.1 #9 (manager/owner): printers, menu availability, language.
// Printers come first; the per-item availability list has its own page because
// it grows with the menu.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/api_error.dart';
import '../../api/models.dart';
import '../../domain/permissions.dart';
import '../../printing/printer_config.dart';
import '../../state/auth.dart';
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
    final soldOut = menu?.items.where((i) => !i.isAvailable).length ?? 0;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
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
                if (p.receipt) p.autoReceipt ? l.printerRoleAuto(l.printerRoleReceipt) : l.printerRoleReceipt,
                if (p.ticket) p.autoTicket ? l.printerRoleAuto(l.printerRoleTicket) : l.printerRoleTicket,
              ].join(' · '),
            ),
            trailing: const Icon(Icons.chevron_right),
            onTap: () =>
                Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => PrinterPage(existing: p))),
          ),
        const SizedBox(height: 8),
        _AutoReturnField(seconds: ref.watch(autoReturnProvider)),
        const Divider(height: 32),
        ListTile(
          key: const Key('settings-availability'),
          contentPadding: EdgeInsets.zero,
          leading: const Icon(Icons.no_food_outlined),
          title: Text(l.settingsAvailability),
          subtitle: Text(l.settingsSoldOutCount(soldOut)),
          trailing: const Icon(Icons.chevron_right),
          onTap: () =>
              Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const AvailabilityPage())),
        ),
        const Divider(height: 32),
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
        const Divider(height: 32),
        Text(l.settingsDevice, style: theme.textTheme.titleMedium),
        if (menu != null) Text(menu.settings.name),
        Text(l.settingsServer(apiBaseUrl)),
        if (ref.watch(currentUserProvider) case final user? when can(user.role, 'devices.pair')) ...[
          const SizedBox(height: 12),
          Align(
            alignment: Alignment.centerLeft,
            child: OutlinedButton.icon(
              key: const Key('device-unpair'),
              style: OutlinedButton.styleFrom(foregroundColor: theme.colorScheme.error),
              onPressed: () => _unpair(context, ref, menu?.settings.name ?? ''),
              icon: const Icon(Icons.link_off),
              label: Text(l.unpairButton),
            ),
          ),
        ],
      ],
    );
  }

  Future<void> _unpair(BuildContext context, WidgetRef ref, String shop) async {
    final l = context.l10n;
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l.unpairTitle),
        content: Text(l.unpairBody(shop)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text(l.commonCancel)),
          FilledButton(
            key: const Key('device-unpair-confirm'),
            onPressed: () => Navigator.pop(context, true),
            child: Text(l.unpairButton),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await ref.read(authProvider.notifier).unpair();
    } on UnsentOrderException {
      if (context.mounted) showMessage(context, l.unpairPendingOrder, error: true);
    } on ApiException catch (e) {
      if (context.mounted) showMessage(context, errorText(l, e), error: true);
    }
  }
}

/// Sold-out toggles for every item, with a search box.
class AvailabilityPage extends ConsumerStatefulWidget {
  const AvailabilityPage({super.key});

  @override
  ConsumerState<AvailabilityPage> createState() => _AvailabilityPageState();
}

class _AvailabilityPageState extends ConsumerState<AvailabilityPage> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final items = ref.watch(menuProvider).value?.items ?? const <MenuItem>[];
    final q = _query.trim().toLowerCase();
    final shown = [
      for (final i in items)
        if (q.isEmpty || i.name.toLowerCase().contains(q)) i,
    ];
    return Scaffold(
      appBar: AppBar(title: Text(l.settingsAvailability)),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: TextField(
              key: const Key('availability-search'),
              decoration: InputDecoration(
                prefixIcon: const Icon(Icons.search),
                hintText: l.settingsSearchMenu,
              ),
              onChanged: (v) => setState(() => _query = v),
            ),
          ),
          Expanded(
            child: ListView(
              children: [
                for (final item in shown)
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
              ],
            ),
          ),
        ],
      ),
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
