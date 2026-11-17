// SPEC §11.1 #6: order number huge, change due huge, print status per printer
// with Retry, New order (auto-return after the device's setting, default 5 s).
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/models.dart';
import '../../domain/money.dart';
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

  @override
  void initState() {
    super.initState();
    if (_left > 0) {
      _timer = Timer.periodic(const Duration(seconds: 1), (_) {
        setState(() => _left--);
        if (_left <= 0) _close();
      });
    }
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
    return Scaffold(
      body: GestureDetector(
        // Any touch stops the countdown.
        onTap: () => setState(() => _timer?.cancel()),
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
                const SizedBox(height: 16),
                FilledButton(
                  key: const Key('done-new'),
                  style: FilledButton.styleFrom(minimumSize: const Size(280, 64)),
                  onPressed: _close,
                  child: Text(l.doneNewOrder),
                ),
                if (_timer?.isActive ?? false) ...[const SizedBox(height: 8), Text(l.doneAutoReturn(_left))],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
