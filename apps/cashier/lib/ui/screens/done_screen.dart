// SPEC §11.1 #6: order number huge, change due huge, print status per printer
// with Retry, New order (auto-return after the device's setting, default 5 s).
// The countdown starts only once this order's print jobs have all printed; a
// failure or any touch turns it off for good (D-062).
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/models.dart';
import '../../domain/money.dart';
import '../../printing/print_job.dart';
import '../../printing/printer_config.dart';
import '../../state/printing.dart';
import '../common.dart';
import '../widgets/print_status.dart';

class DoneScreen extends ConsumerStatefulWidget {
  const DoneScreen({super.key, required this.order});

  final Order order;

  @override
  ConsumerState<DoneScreen> createState() => _DoneScreenState();
}

class _DoneScreenState extends ConsumerState<DoneScreen> {
  late int _left = ref.read(autoReturnProvider);
  Timer? _timer;

  /// Auto-return is off for this screen: the setting is 0, a print failed, or
  /// the cashier touched the screen. Nothing turns it back on.
  late bool _stopped = _left <= 0;

  /// setState isn't allowed while initState runs.
  bool _built = false;

  void _update(VoidCallback fn) => _built && mounted ? setState(fn) : fn();

  @override
  void initState() {
    super.initState();
    // Auto-print queues the jobs before this screen opens (checkout.dart).
    _onPrint(printPhase(ref.read(printQueueProvider.notifier).jobsFor(widget.order.id)));
    _built = true;
    ref.listenManual(
      printQueueProvider,
      (_, jobs) => _onPrint(printPhase(jobs.where((j) => j.orderId == widget.order.id))),
    );
  }

  void _onPrint(PrintPhase phase) {
    if (_stopped || _timer != null) return;
    switch (phase) {
      case PrintPhase.failed:
        _stop();
      case PrintPhase.none || PrintPhase.done:
        _update(
          () => _timer = Timer.periodic(const Duration(seconds: 1), (_) {
            setState(() => _left--);
            if (_left <= 0) _close();
          }),
        );
      case PrintPhase.printing:
        break;
    }
  }

  void _stop() {
    _timer?.cancel();
    _update(() => _stopped = true);
  }

  void _printManual(PrintKind kind) {
    // Tapping is a touch: the countdown stays off afterwards (D-063).
    _stop();
    ref.read(printQueueProvider.notifier).printManual(widget.order, kind);
  }

  void _close() {
    _timer?.cancel();
    if (mounted && Navigator.of(context).canPop()) Navigator.of(context).pop();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final theme = Theme.of(context);
    final o = widget.order;
    final printers = ref.watch(printersProvider);
    // A role's button hides once its manual printers have a job for this order
    // (an auto-print job on another printer doesn't count); Retry and Orders
    // today's reprint cover the rest.
    final printed = {
      for (final j in ref.watch(printQueueProvider))
        if (j.orderId == o.id) (j.printerId, j.kind),
    };
    final manual = [
      for (final k in [PrintKind.receipt, PrintKind.ticket])
        if (manualPrinters(printers, k).any((p) => !printed.contains((p.id, k)))) k,
    ];
    return Scaffold(
      body: GestureDetector(
        // Any touch stops the countdown.
        onTap: _stop,
        child: SafeArea(
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.check_circle, size: 72, color: Colors.green[700]),
                Text(
                  l.doneOrderNumber(o.orderNumber),
                  key: const Key('done-number'),
                  style: theme.textTheme.displayLarge?.copyWith(fontWeight: FontWeight.bold),
                ),
                if (o.customerName != null) Text(o.customerName!, style: theme.textTheme.headlineSmall),
                const SizedBox(height: 24),
                Text(o.changeDue > 0 ? l.doneChange : l.doneNoChange, style: theme.textTheme.titleLarge),
                if (o.changeDue > 0)
                  Text(
                    formatIdr(o.changeDue),
                    key: const Key('done-change'),
                    style: theme.textTheme.displayMedium?.copyWith(fontWeight: FontWeight.bold),
                  ),
                const SizedBox(height: 16),
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 480),
                  child: PrintStatusList(orderId: o.id),
                ),
                if (manual.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 12,
                    children: [
                      for (final k in manual)
                        OutlinedButton.icon(
                          key: Key('done-print-${k.name}'),
                          style: OutlinedButton.styleFrom(minimumSize: const Size(160, 56)),
                          onPressed: () => _printManual(k),
                          icon: const Icon(Icons.print),
                          label: Text(k == PrintKind.receipt ? l.donePrintReceipt : l.donePrintTicket),
                        ),
                    ],
                  ),
                ],
                const SizedBox(height: 16),
                FilledButton(
                  key: const Key('done-new'),
                  style: FilledButton.styleFrom(minimumSize: const Size(280, 64)),
                  onPressed: _close,
                  child: Text(l.doneNewOrder),
                ),
                if (!_stopped) ...[
                  const SizedBox(height: 8),
                  Text(
                    _timer == null ? l.doneAutoReturnAfterPrint : l.doneAutoReturn(_left),
                    key: const Key('done-auto-return'),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
