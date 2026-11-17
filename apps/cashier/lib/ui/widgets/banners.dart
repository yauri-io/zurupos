import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../domain/money.dart';
import '../../state/checkout.dart';
import '../../state/connection.dart';
import '../common.dart';

/// SPEC §11.2: offline → banner + Pay disabled.
class OfflineBanner extends ConsumerWidget {
  const OfflineBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (ref.watch(onlineProvider)) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: scheme.errorContainer,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        child: Row(
          children: [
            Icon(Icons.cloud_off, color: scheme.onErrorContainer),
            const SizedBox(width: 12),
            Expanded(
              child: Text(context.l10n.offlineBanner, style: TextStyle(color: scheme.onErrorContainer)),
            ),
            TextButton(
              onPressed: () => ref.read(onlineProvider.notifier).check(),
              child: Text(context.l10n.commonRetry),
            ),
          ],
        ),
      ),
    );
  }
}

/// An order saved locally but not accepted by the server yet (SPEC §11.2).
class PendingOrderBanner extends ConsumerWidget {
  const PendingOrderBanner({super.key, required this.onSent});

  /// Called with the result of a successful retry, to show the Done screen.
  final void Function(Sent result) onSent;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final checkout = ref.watch(checkoutProvider);
    final pending = checkout.pending;
    if (pending == null) return const SizedBox.shrink();
    final l = context.l10n;
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: scheme.tertiaryContainer,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        child: Row(
          children: [
            Icon(Icons.hourglass_top, color: scheme.onTertiaryContainer),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(l.pendingTitle, style: const TextStyle(fontWeight: FontWeight.bold)),
                  Text(l.pendingWaiting(formatIdr(pending.total))),
                ],
              ),
            ),
            const SizedBox(width: 12),
            FilledButton.icon(
              key: const Key('pending-retry'),
              onPressed: checkout.sending
                  ? null
                  : () async {
                      final result = await ref.read(checkoutProvider.notifier).retry();
                      if (!context.mounted) return;
                      switch (result) {
                        case Sent():
                          onSent(result);
                        case StillPending(:final error):
                          showMessage(context, errorText(l, error), error: true);
                        case Rejected(:final error):
                          showMessage(context, errorText(l, error), error: true);
                      }
                    },
              icon: checkout.sending
                  ? const SizedBox.square(dimension: 16, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.refresh),
              label: Text(l.commonRetry),
            ),
          ],
        ),
      ),
    );
  }
}
