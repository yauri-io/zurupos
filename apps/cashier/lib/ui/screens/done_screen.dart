// SPEC §11.1 #6: order number huge, change due huge, New order (auto-return).
// Print status per printer arrives with M5.
import 'dart:async';

import 'package:flutter/material.dart';

import '../../api/models.dart';
import '../../domain/money.dart';
import '../common.dart';

const autoReturnSeconds = 5;

class DoneScreen extends StatefulWidget {
  const DoneScreen({super.key, required this.order, this.autoReturn = autoReturnSeconds});

  final Order order;

  /// Seconds before returning to a new order; 0 disables it.
  final int autoReturn;

  @override
  State<DoneScreen> createState() => _DoneScreenState();
}

class _DoneScreenState extends State<DoneScreen> {
  late int _left = widget.autoReturn;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    if (widget.autoReturn > 0) {
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
                const SizedBox(height: 32),
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
