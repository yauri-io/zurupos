import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/generated/app_localizations.dart';
import '../../printing/print_job.dart';
import '../../state/printing.dart';
import '../common.dart';

String printErrorText(AppLocalizations l, String? code) => switch (code) {
  'bluetooth_permission' => l.printErrorPermission,
  'bluetooth_off' => l.printErrorBluetoothOff,
  'connect_failed' => l.printErrorConnect,
  'timeout' => l.printErrorTimeout,
  _ => l.printErrorWrite,
};

String printKindLabel(AppLocalizations l, PrintKind k) => switch (k) {
  PrintKind.receipt => l.printerRoleReceipt,
  PrintKind.ticket => l.printerRoleTicket,
  PrintKind.test => l.printerTest,
};

/// One row per print job of an order, with *Retry* on failures (SPEC §11.1 #6).
class PrintStatusList extends ConsumerWidget {
  const PrintStatusList({super.key, required this.orderId});

  final String orderId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l10n;
    final jobs = ref.watch(printQueueProvider).where((j) => j.orderId == orderId).toList();
    if (jobs.isEmpty) return const SizedBox.shrink();
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (final j in jobs)
          ListTile(
            key: Key('print-${j.id}'),
            dense: true,
            leading: switch (j.status) {
              JobStatus.done => Icon(Icons.check_circle, color: Colors.green[700]),
              JobStatus.failed => Icon(Icons.error, color: Theme.of(context).colorScheme.error),
              _ => const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2)),
            },
            title: Text('${j.printerName} · ${printKindLabel(l, j.kind)}'),
            subtitle: Text(switch (j.status) {
              JobStatus.queued => l.printStatusQueued,
              JobStatus.printing => l.printStatusPrinting,
              JobStatus.done => l.printStatusDone,
              JobStatus.failed => '${l.printStatusFailed}: ${printErrorText(l, j.error)}',
            }),
            trailing: j.status == JobStatus.failed
                ? OutlinedButton(
                    key: Key('print-retry-${j.id}'),
                    onPressed: () => ref.read(printQueueProvider.notifier).retry(j.id),
                    child: Text(l.commonRetry),
                  )
                : null,
          ),
      ],
    );
  }
}
