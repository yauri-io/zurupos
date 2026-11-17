// SPEC §11.1 #2, §5.3: pick your name, enter your PIN.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/api_error.dart';
import '../../api/models.dart';
import '../../state/auth.dart';
import '../../state/providers.dart';
import '../common.dart';
import '../widgets/banners.dart';
import '../widgets/controls.dart';
import '../widgets/language_toggle.dart';

final staffListProvider = FutureProvider.autoDispose<List<StaffMember>>(
  (ref) => ref.read(apiProvider).staff(),
);

class StaffScreen extends ConsumerWidget {
  const StaffScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l10n;
    final staff = ref.watch(staffListProvider);
    return Scaffold(
      appBar: AppBar(title: Text(l.staffTitle), actions: const [LanguageToggle()]),
      body: Column(
        children: [
          const OfflineBanner(),
          Expanded(
            child: staff.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) {
                if (e is ApiException && e.status == 401) {
                  Future.microtask(() => ref.read(authProvider.notifier).forgetDevice());
                  return Center(child: Text(l.deviceRevoked));
                }
                return Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(errorText(l, e)),
                      const SizedBox(height: 12),
                      FilledButton(
                        onPressed: () => ref.invalidate(staffListProvider),
                        child: Text(l.commonRetry),
                      ),
                    ],
                  ),
                );
              },
              data: (list) => list.isEmpty
                  ? Center(child: Text(l.staffEmpty))
                  : GridView(
                      padding: const EdgeInsets.all(24),
                      gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                        maxCrossAxisExtent: 220,
                        mainAxisExtent: 136,
                        mainAxisSpacing: 16,
                        crossAxisSpacing: 16,
                      ),
                      children: [
                        for (final s in list)
                          Card(
                            key: Key('staff-${s.id}'),
                            clipBehavior: Clip.antiAlias,
                            child: InkWell(
                              onTap: () => showDialog<void>(
                                context: context,
                                builder: (_) => PinDialog(user: s),
                              ),
                              child: Padding(
                                padding: const EdgeInsets.all(12),
                                child: Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    CircleAvatar(
                                      radius: 24,
                                      child: Text(s.name.isEmpty ? '?' : s.name[0].toUpperCase()),
                                    ),
                                    const SizedBox(height: 8),
                                    Text(
                                      s.name,
                                      style: Theme.of(context).textTheme.titleMedium,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                    Text(
                                      roleLabel(l, s.role),
                                      style: Theme.of(context).textTheme.labelMedium,
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

/// PIN entry with large keys and a lockout countdown.
class PinDialog extends ConsumerStatefulWidget {
  const PinDialog({super.key, required this.user});

  final StaffMember user;

  @override
  ConsumerState<PinDialog> createState() => _PinDialogState();
}

class _PinDialogState extends ConsumerState<PinDialog> {
  String _pin = '';
  String? _error;

  /// Seconds left in a lockout, counted down by a ticker (the device clock may
  /// differ from the server's, so it's only read once).
  int _lockSeconds = 0;
  Timer? _ticker;
  bool _busy = false;

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  void _lock(DateTime until) {
    _lockSeconds = ((until.difference(DateTime.now()).inMilliseconds + 999) ~/ 1000).clamp(1, 3600);
    _ticker?.cancel();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() {
        _lockSeconds--;
        if (_lockSeconds <= 0) _ticker?.cancel();
      });
    });
  }

  Future<void> _key(String k) async {
    if (_busy || _lockSeconds > 0) return;
    setState(() {
      _error = null;
      if (k == '⌫') {
        if (_pin.isNotEmpty) _pin = _pin.substring(0, _pin.length - 1);
      } else if (_pin.length < 6) {
        _pin += k;
      }
    });
  }

  Future<void> _submit() async {
    final l = context.l10n;
    setState(() => _busy = true);
    try {
      await ref.read(authProvider.notifier).signIn(widget.user.id, _pin);
      if (mounted) Navigator.of(context).pop();
    } on ApiException catch (e) {
      setState(() {
        _pin = '';
        if (e.code == 'PIN_LOCKED') {
          final until = DateTime.tryParse(e.details['locked_until'] as String? ?? '');
          if (until != null) _lock(until);
          _error = null;
        } else {
          _error = e.status == 401 ? l.pinWrong : errorText(l, e);
        }
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final locked = _lockSeconds;
    return AlertDialog(
      title: Text('${widget.user.name} — ${l.pinTitle}'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (var i = 0; i < 6; i++)
                Padding(
                  padding: const EdgeInsets.all(6),
                  child: Icon(
                    i < _pin.length ? Icons.circle : Icons.circle_outlined,
                    size: 16,
                    color: i < 4 || i < _pin.length ? null : Theme.of(context).disabledColor,
                  ),
                ),
            ],
          ),
          SizedBox(
            height: 40,
            child: Center(
              child: Text(
                locked > 0 ? l.pinLocked(locked) : (_error ?? ''),
                key: const Key('pin-message'),
                textAlign: TextAlign.center,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ),
          ),
          NumberPad(onKey: _key),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: Text(l.commonCancel)),
        FilledButton(
          key: const Key('pin-submit'),
          onPressed: _pin.length >= 4 && !_busy && locked == 0 ? _submit : null,
          child: const Icon(Icons.arrow_forward),
        ),
      ],
    );
  }
}
