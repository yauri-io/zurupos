// SPEC §11.3 printer settings: transport, address, paper, roles, auto-print,
// drawer kick, test print. Bluetooth printers are paired in Android settings
// first and picked here from the bonded list.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../printing/escpos.dart';
import '../../printing/print_job.dart';
import '../../printing/printer_config.dart';
import '../../printing/transport.dart';
import '../../state/printing.dart';
import '../../state/providers.dart';
import '../common.dart';
import '../widgets/print_status.dart';

/// Overridable in tests (no Bluetooth there).
final bondedPrintersProvider = FutureProvider.autoDispose<List<({String name, String address})>>(
  (ref) => bondedPrinters(),
);

class PrinterPage extends ConsumerStatefulWidget {
  const PrinterPage({super.key, this.existing});

  final PrinterConfig? existing;

  @override
  ConsumerState<PrinterPage> createState() => _PrinterPageState();
}

class _PrinterPageState extends ConsumerState<PrinterPage> {
  late PrinterConfig _p =
      widget.existing ??
      PrinterConfig(id: ref.read(newIdProvider)(), name: '', transport: TransportKind.bluetooth, address: '');
  late final _name = TextEditingController(text: _p.name);
  late final _ip = TextEditingController(text: _p.transport == TransportKind.network ? _p.address : '');
  bool _testing = false;

  @override
  void dispose() {
    _name.dispose();
    _ip.dispose();
    super.dispose();
  }

  PrinterConfig get _current => _p.copyWith(
    name: _name.text.trim(),
    address: _p.transport == TransportKind.network ? _ip.text.trim() : _p.address,
  );

  bool get _valid => _current.name.isNotEmpty && _current.address.isNotEmpty && (_p.receipt || _p.ticket);

  Future<void> _save() async {
    await ref.read(printersProvider.notifier).upsert(_current);
    if (mounted) Navigator.pop(context);
  }

  Future<void> _test() async {
    final l = context.l10n;
    setState(() => _testing = true);
    final job = await ref.read(printQueueProvider.notifier).testPrint(_current);
    if (!mounted) return;
    setState(() => _testing = false);
    showMessage(
      context,
      job.status == JobStatus.done
          ? l.printStatusDone
          : '${l.printStatusFailed}: ${printErrorText(l, job.error)}',
      error: job.status != JobStatus.done,
    );
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final bluetooth = _p.transport == TransportKind.bluetooth;
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.existing == null ? l.printersAdd : _p.name),
        actions: [
          if (widget.existing != null)
            IconButton(
              tooltip: l.printerDelete,
              icon: const Icon(Icons.delete_outline),
              onPressed: () async {
                await ref.read(printersProvider.notifier).remove(_p.id);
                if (context.mounted) Navigator.pop(context);
              },
            ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          TextField(
            key: const Key('printer-name'),
            controller: _name,
            maxLength: 40,
            decoration: InputDecoration(labelText: l.printerName),
            onChanged: (_) => setState(() {}),
          ),
          Text(l.printerTransport, style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 8),
          SegmentedButton<TransportKind>(
            segments: [
              ButtonSegment(value: TransportKind.bluetooth, label: Text(l.printerBluetooth)),
              ButtonSegment(value: TransportKind.network, label: Text(l.printerNetwork)),
            ],
            selected: {_p.transport},
            onSelectionChanged: (v) => setState(() => _p = _p.copyWith(transport: v.first, address: '')),
          ),
          const SizedBox(height: 12),
          if (bluetooth)
            ref
                .watch(bondedPrintersProvider)
                .when(
                  loading: () => const LinearProgressIndicator(),
                  error: (e, _) => Text(
                    e is PrinterException ? printErrorText(l, e.code) : l.printNoPrinters,
                    style: TextStyle(color: Theme.of(context).colorScheme.error),
                  ),
                  data: (devices) => devices.isEmpty
                      ? Text(l.printerNoBonded)
                      : DropdownButtonFormField<String>(
                          key: const Key('printer-bonded'),
                          initialValue: devices.any((d) => d.address == _p.address) ? _p.address : null,
                          isExpanded: true,
                          decoration: InputDecoration(labelText: l.printerPickBonded),
                          items: [
                            for (final d in devices)
                              DropdownMenuItem(value: d.address, child: Text('${d.name} (${d.address})')),
                          ],
                          onChanged: (v) => setState(() {
                            final d = devices.firstWhere((x) => x.address == v);
                            _p = _p.copyWith(address: d.address);
                            if (_name.text.trim().isEmpty) _name.text = d.name;
                          }),
                        ),
                )
          else
            TextField(
              key: const Key('printer-ip'),
              controller: _ip,
              keyboardType: TextInputType.url,
              decoration: InputDecoration(labelText: l.printerAddressIp),
              onChanged: (_) => setState(() {}),
            ),
          const SizedBox(height: 16),
          Text(l.printerPaper, style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 8),
          SegmentedButton<Paper>(
            segments: const [
              ButtonSegment(value: Paper.mm58, label: Text('58 mm')),
              ButtonSegment(value: Paper.mm80, label: Text('80 mm')),
            ],
            selected: {_p.paper},
            onSelectionChanged: (v) => setState(() => _p = _p.copyWith(paper: v.first)),
          ),
          const SizedBox(height: 8),
          SwitchListTile(
            key: const Key('printer-receipt'),
            title: Text(l.printerRoleReceipt),
            value: _p.receipt,
            onChanged: (v) => setState(() => _p = _p.copyWith(receipt: v)),
          ),
          if (_p.receipt) ...[
            SwitchListTile(
              title: Text(l.printerAutoReceipt),
              value: _p.autoReceipt,
              onChanged: (v) => setState(() => _p = _p.copyWith(autoReceipt: v)),
            ),
            SwitchListTile(
              key: const Key('printer-drawer'),
              title: Text(l.printerDrawerKick),
              value: _p.drawerKick,
              onChanged: (v) => setState(() => _p = _p.copyWith(drawerKick: v)),
            ),
          ],
          SwitchListTile(
            key: const Key('printer-ticket'),
            title: Text(l.printerRoleTicket),
            value: _p.ticket,
            onChanged: (v) => setState(() => _p = _p.copyWith(ticket: v)),
          ),
          if (_p.ticket)
            SwitchListTile(
              title: Text(l.printerAutoTicket),
              value: _p.autoTicket,
              onChanged: (v) => setState(() => _p = _p.copyWith(autoTicket: v)),
            ),
          const SizedBox(height: 16),
          Row(
            children: [
              OutlinedButton.icon(
                key: const Key('printer-test'),
                onPressed: _current.address.isEmpty || _testing ? null : _test,
                icon: _testing
                    ? const SizedBox.square(dimension: 16, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.print),
                label: Text(l.printerTest),
              ),
              const Spacer(),
              FilledButton(
                key: const Key('printer-save'),
                onPressed: _valid ? _save : null,
                child: Text(l.commonSave),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
