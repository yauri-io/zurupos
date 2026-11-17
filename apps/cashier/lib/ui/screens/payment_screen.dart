// SPEC §11.1 #5: total large; enabled methods; cash quick amounts + pad + change;
// non-cash provider chips + reference; split payments; Complete only when fully
// covered and online.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/models.dart';
import '../../domain/cart.dart';
import '../../domain/money.dart';
import '../../domain/payment.dart';
import '../../state/cart.dart';
import '../../state/checkout.dart';
import '../../state/connection.dart';
import '../../state/providers.dart';
import '../common.dart';
import '../widgets/controls.dart';
import 'done_screen.dart';

class PaymentScreen extends ConsumerStatefulWidget {
  const PaymentScreen({super.key, required this.cart, required this.settings});

  final Cart cart;
  final ShopSettings settings;

  @override
  ConsumerState<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends ConsumerState<PaymentScreen> {
  final _payments = <PaymentDraft>[];
  late String _method = widget.settings.enabledPaymentMethods.first;

  /// Digits typed on the pad: cash received (cash) or the amount (non-cash).
  String _entry = '';
  String? _provider;
  final _reference = TextEditingController();
  bool _busy = false;

  late final int _total = widget.cart.price(widget.settings).total;

  @override
  void dispose() {
    _reference.dispose();
    super.dispose();
  }

  int get _remaining => remainingOf(_total, _payments);
  int? get _entryValue => _entry.isEmpty ? null : int.tryParse(_entry);

  void _selectMethod(String m) => setState(() {
    _method = m;
    _entry = '';
    _provider = null;
    _reference.clear();
  });

  void _key(String k) => setState(() {
    if (k == '⌫') {
      if (_entry.isNotEmpty) _entry = _entry.substring(0, _entry.length - 1);
    } else if (_entry.length < 12 && !(_entry.isEmpty && (k == '0' || k == '00'))) {
      _entry += k;
    }
  });

  /// Cash: the amount applied is what's still due, capped at what was handed over.
  void _addCash(int tendered) {
    final due = _remaining;
    if (due == 0 || tendered <= 0) return;
    setState(() {
      _payments.add(
        PaymentDraft(method: 'cash', amount: tendered < due ? tendered : due, tendered: tendered),
      );
      _entry = '';
    });
  }

  void _addNonCash() {
    final amount = _entryValue ?? _remaining;
    if (amount <= 0 || amount > _remaining) return;
    setState(() {
      _payments.add(
        PaymentDraft(method: _method, amount: amount, provider: _provider, reference: _reference.text),
      );
      _entry = '';
      _provider = null;
      _reference.clear();
    });
  }

  Future<void> _complete() async {
    final l = context.l10n;
    final payload = widget.cart.toOrderPayload(
      clientOrderId: ref.read(newIdProvider)(),
      clientCreatedAt: DateTime.now(),
      payments: [for (final p in _payments) p.toJson()],
      expectedTotal: _total,
    );
    setState(() => _busy = true);
    final result = await ref.read(checkoutProvider.notifier).complete(payload);
    if (!mounted) return;
    setState(() => _busy = false);
    final nav = Navigator.of(context);
    switch (result) {
      case Sent(:final order):
        ref.read(cartProvider.notifier).clear();
        await nav.pushReplacement(MaterialPageRoute<void>(builder: (_) => DoneScreen(order: order)));
      case StillPending(:final error):
        // Saved on the device; the banner on the order screen retries it.
        ref.read(cartProvider.notifier).clear();
        showMessage(context, errorText(l, error), error: true);
        nav.pop();
      case Rejected(:final error):
        showMessage(context, errorText(l, error), error: true);
        if (error.code == 'PRICE_CHANGED' || error.code == 'ITEM_UNAVAILABLE') nav.pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final theme = Theme.of(context);
    final online = ref.watch(onlineProvider);
    final check = checkDrafts(_total, _payments, widget.settings.enabledPaymentMethods);
    final canComplete = check.ok && online && !_busy;
    final due = _remaining;

    final summary = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(l.total, style: theme.textTheme.titleMedium),
        Text(formatIdr(_total), key: const Key('pay-total'), style: theme.textTheme.displayMedium),
        const SizedBox(height: 8),
        Text(
          due > 0 ? l.payRemaining(formatIdr(due)) : (_total == 0 ? l.payNoPaymentNeeded : l.payPaidInFull),
          key: const Key('pay-remaining'),
          style: theme.textTheme.titleLarge?.copyWith(
            color: due > 0 ? theme.colorScheme.error : Colors.green[700],
          ),
        ),
        const SizedBox(height: 12),
        for (final (i, p) in _payments.indexed)
          ListTile(
            key: Key('payment-$i'),
            contentPadding: EdgeInsets.zero,
            title: Text([methodLabel(l, p.method), ?p.provider].join(' · ')),
            subtitle: p.isCash && p.change > 0 ? Text(l.payChange(formatIdr(p.change))) : null,
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(formatIdr(p.amount), style: theme.textTheme.titleMedium),
                IconButton(
                  tooltip: l.commonRemove,
                  onPressed: _busy ? null : () => setState(() => _payments.removeAt(i)),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
          ),
        if (check.ok && check.changeDue > 0)
          Text(
            l.payChange(formatIdr(check.changeDue)),
            key: const Key('pay-change'),
            style: theme.textTheme.headlineSmall,
          ),
        const SizedBox(height: 16),
        FilledButton(
          key: const Key('pay-complete'),
          style: FilledButton.styleFrom(
            minimumSize: const Size.fromHeight(64),
            textStyle: theme.textTheme.titleLarge,
          ),
          onPressed: canComplete ? _complete : null,
          child: _busy ? const CircularProgressIndicator() : Text(l.payComplete),
        ),
        if (!online) ...[
          const SizedBox(height: 8),
          Text(l.offlineBanner, style: TextStyle(color: theme.colorScheme.error)),
        ],
      ],
    );

    final entry = due == 0
        ? const SizedBox.shrink()
        : Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final m in widget.settings.enabledPaymentMethods)
                    ChoiceChip(
                      key: Key('method-$m'),
                      materialTapTargetSize: MaterialTapTargetSize.padded,
                      label: Text(methodLabel(l, m)),
                      selected: _method == m,
                      onSelected: (_) => _selectMethod(m),
                    ),
                ],
              ),
              const SizedBox(height: 12),
              if (_method == 'cash') ..._cashEntry(theme, due) else ..._nonCashEntry(theme, due),
            ],
          );

    return Scaffold(
      appBar: AppBar(title: Text(l.payTitle)),
      body: LayoutBuilder(
        builder: (context, c) {
          final wide = c.maxWidth >= 840;
          final children = [
            Padding(padding: const EdgeInsets.all(24), child: summary),
            Padding(padding: const EdgeInsets.all(24), child: entry),
          ];
          return wide
              ? Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(child: SingleChildScrollView(child: children[0])),
                    Expanded(child: SingleChildScrollView(child: children[1])),
                  ],
                )
              : ListView(children: [children[1], children[0]]);
        },
      ),
    );
  }

  List<Widget> _cashEntry(ThemeData theme, int due) {
    final typed = _entryValue;
    return [
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          for (final (i, a) in quickCashAmounts(due).indexed)
            FilledButton.tonal(
              key: Key('quick-$a'),
              style: FilledButton.styleFrom(minimumSize: const Size(120, 56)),
              onPressed: () => _addCash(a),
              child: Text(
                i == 0 ? '${context.l10n.payExact}\n${formatIdr(a)}' : formatIdr(a),
                textAlign: TextAlign.center,
              ),
            ),
        ],
      ),
      const SizedBox(height: 16),
      Text(context.l10n.payTendered, style: theme.textTheme.titleMedium),
      Text(
        typed == null ? '—' : formatIdr(typed),
        key: const Key('cash-entry'),
        style: theme.textTheme.headlineMedium,
      ),
      const SizedBox(height: 8),
      Center(child: NumberPad(onKey: _key, showDoubleZero: true, keySize: 64)),
      const SizedBox(height: 8),
      FilledButton(
        key: const Key('cash-add'),
        style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(56)),
        onPressed: typed == null || typed <= 0 ? null : () => _addCash(typed),
        child: Text(context.l10n.payAddCash(formatIdr(typed ?? 0))),
      ),
    ];
  }

  List<Widget> _nonCashEntry(ThemeData theme, int due) {
    final amount = _entryValue ?? due;
    final suggestions = providerSuggestions[_method] ?? const <String>[];
    return [
      Text(context.l10n.payAmount, style: theme.textTheme.titleMedium),
      Text(formatIdr(amount), key: const Key('noncash-amount'), style: theme.textTheme.headlineMedium),
      const SizedBox(height: 8),
      Center(child: NumberPad(onKey: _key, showDoubleZero: true, keySize: 56)),
      if (suggestions.isNotEmpty) ...[
        const SizedBox(height: 12),
        Text(context.l10n.payProvider, style: theme.textTheme.titleSmall),
        Wrap(
          spacing: 8,
          children: [
            for (final p in suggestions)
              ChoiceChip(
                label: Text(p),
                selected: _provider == p,
                onSelected: (on) => setState(() => _provider = on ? p : null),
              ),
          ],
        ),
      ],
      const SizedBox(height: 8),
      TextField(
        key: const Key('reference'),
        controller: _reference,
        maxLength: 60,
        decoration: InputDecoration(labelText: context.l10n.payReference),
      ),
      FilledButton(
        key: const Key('noncash-add'),
        style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(56)),
        onPressed: amount > 0 && amount <= due ? _addNonCash : null,
        child: Text('${context.l10n.payAddLine} · ${formatIdr(amount)}'),
      ),
    ];
  }
}
