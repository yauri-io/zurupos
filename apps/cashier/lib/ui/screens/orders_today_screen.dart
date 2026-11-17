// SPEC §11.1 #7: today's orders — list, search, detail, void (approval PIN for
// cashiers). Employees see the list only (PRD §6). Reprint arrives with M5.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../api/api_error.dart';
import '../../api/models.dart';
import '../../domain/money.dart';
import '../../domain/permissions.dart';
import '../../printing/render.dart';
import '../../state/auth.dart';
import '../../state/printing.dart';
import '../../state/providers.dart';
import '../common.dart';
import '../widgets/controls.dart';
import '../widgets/print_status.dart';
import 'staff_screen.dart' show staffListProvider;

final todayProvider = FutureProvider.autoDispose<List<OrderSummary>>((ref) => ref.read(apiProvider).today());

final orderDetailProvider = FutureProvider.autoDispose.family<Order, String>(
  (ref, id) => ref.read(apiProvider).order(id),
);

String _time(DateTime t) => DateFormat.Hm().format(t.toLocal());

class OrdersTodayScreen extends ConsumerStatefulWidget {
  const OrdersTodayScreen({super.key});

  @override
  ConsumerState<OrdersTodayScreen> createState() => _OrdersTodayScreenState();
}

class _OrdersTodayScreenState extends ConsumerState<OrdersTodayScreen> {
  String _query = '';

  bool _matches(OrderSummary o) {
    final q = _query.trim().toLowerCase();
    if (q.isEmpty) return true;
    return '${o.orderNumber}' == q ||
        (o.customerName?.toLowerCase().contains(q) ?? false) ||
        o.items.any((i) => i.name.toLowerCase().contains(q));
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final orders = ref.watch(todayProvider);
    final user = ref.watch(currentUserProvider);
    final canOpen = user != null && can(user.role, 'orders.view_detail');
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: TextField(
            key: const Key('today-search'),
            decoration: InputDecoration(prefixIcon: const Icon(Icons.search), hintText: l.todaySearch),
            onChanged: (v) => setState(() => _query = v),
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () => ref.refresh(todayProvider.future),
            child: orders.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => ListView(
                children: [
                  Padding(padding: const EdgeInsets.all(24), child: Text(errorText(l, e))),
                  Center(
                    child: FilledButton(
                      onPressed: () => ref.invalidate(todayProvider),
                      child: Text(l.commonRetry),
                    ),
                  ),
                ],
              ),
              data: (list) {
                final shown = list.where(_matches).toList();
                if (shown.isEmpty) return ListView(children: [ListTile(title: Text(l.todayEmpty))]);
                return ListView.separated(
                  itemCount: shown.length,
                  separatorBuilder: (_, _) => const Divider(height: 1),
                  itemBuilder: (context, i) {
                    final o = shown[i];
                    final items = o.items.map((it) => '${it.qty}× ${it.name}').join(', ');
                    return ListTile(
                      key: Key('today-${o.orderNumber}'),
                      leading: CircleAvatar(child: Text('${o.orderNumber}')),
                      title: Text(
                        [_time(o.paidAt), ?o.customerName, if (o.voided) l.orderVoided].join(' · '),
                        style: o.voided ? const TextStyle(decoration: TextDecoration.lineThrough) : null,
                      ),
                      subtitle: Text(items, maxLines: 2, overflow: TextOverflow.ellipsis),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(formatIdr(o.total), style: Theme.of(context).textTheme.titleMedium),
                          if (!canOpen)
                            IconButton(
                              key: Key('ticket-${o.orderNumber}'),
                              tooltip: l.printReprintTicket,
                              icon: const Icon(Icons.print_outlined),
                              onPressed: () => _reportQueued(
                                context,
                                ref
                                    .read(printQueueProvider.notifier)
                                    .reprintTicket(TicketData.fromSummary(o), o.id, o.paidAt),
                              ),
                            ),
                        ],
                      ),
                      onTap: canOpen
                          ? () async {
                              await Navigator.of(context).push(
                                MaterialPageRoute<void>(builder: (_) => OrderDetailScreen(orderId: o.id)),
                              );
                              ref.invalidate(todayProvider);
                            }
                          : null,
                    );
                  },
                );
              },
            ),
          ),
        ),
      ],
    );
  }
}

void _reportQueued(BuildContext context, int jobs) {
  final l = context.l10n;
  showMessage(context, jobs == 0 ? l.printNoPrinters : l.printSent, error: jobs == 0);
}

class OrderDetailScreen extends ConsumerWidget {
  const OrderDetailScreen({super.key, required this.orderId});

  final String orderId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l10n;
    final order = ref.watch(orderDetailProvider(orderId));
    final user = ref.watch(currentUserProvider);
    final canVoid =
        user != null && (can(user.role, 'orders.void') || can(user.role, 'orders.void_with_approval'));
    return Scaffold(
      appBar: AppBar(title: Text(order.value == null ? '' : l.doneOrderNumber(order.value!.orderNumber))),
      body: order.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text(errorText(l, e))),
        data: (o) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              [
                _time(o.paidAt),
                o.orderType == 'dine_in' ? l.orderDineIn : l.orderTakeaway,
                ?o.customerName,
                l.orderBy(o.createdBy.name),
              ].join(' · '),
            ),
            if (o.voidInfo != null)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Text(
                  l.orderVoidedBy(o.voidInfo!.voidedBy.name, o.voidInfo!.reason),
                  key: const Key('void-info'),
                  style: TextStyle(color: Theme.of(context).colorScheme.error, fontWeight: FontWeight.bold),
                ),
              ),
            const Divider(),
            for (final line in o.lines)
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text('${line.qty}× ${line.itemName}'),
                subtitle: Text(
                  [
                    for (final m in line.modifiers)
                      m.priceDelta > 0 ? '${m.optionName} +${formatIdr(m.priceDelta)}' : m.optionName,
                    if (line.note != null) '“${line.note}”',
                    if (line.discount != null)
                      '${line.discount!.name ?? l.discountCustomLabel} −${formatIdr(line.discount!.amount)}',
                  ].join(' · '),
                ),
                trailing: Text(formatIdr(line.lineNet)),
              ),
            const Divider(),
            _row(l.subtotal, o.subtotal),
            if (o.itemDiscountTotal > 0) _row(l.itemDiscounts, -o.itemDiscountTotal),
            if (o.orderDiscount != null) _row(l.orderDiscount, -o.orderDiscount!.amount),
            if (o.serviceChargeAmount > 0)
              _row(l.serviceCharge(formatBps(o.serviceChargeBps)), o.serviceChargeAmount),
            if (o.taxAmount > 0) _row(l.taxLine(o.taxName ?? '', formatBps(o.taxBps)), o.taxAmount),
            _row(l.total, o.total, strong: true),
            const Divider(),
            Text(l.orderPayments, style: Theme.of(context).textTheme.titleMedium),
            for (final p in o.payments)
              _row([methodLabel(l, p.method), ?p.provider, ?p.reference].join(' · '), p.amount),
            if (o.changeDue > 0) _row(l.doneChange, o.changeDue),
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                if (user != null && can(user.role, 'orders.reprint_receipt'))
                  OutlinedButton.icon(
                    key: const Key('reprint-receipt'),
                    onPressed: () =>
                        _reportQueued(context, ref.read(printQueueProvider.notifier).reprintReceipt(o)),
                    icon: const Icon(Icons.receipt_long),
                    label: Text(l.printReprintReceipt),
                  ),
                OutlinedButton.icon(
                  key: const Key('reprint-ticket'),
                  onPressed: () => _reportQueued(
                    context,
                    ref
                        .read(printQueueProvider.notifier)
                        .reprintTicket(TicketData.fromOrder(o), o.id, o.paidAt),
                  ),
                  icon: const Icon(Icons.local_cafe_outlined),
                  label: Text(l.printReprintTicket),
                ),
              ],
            ),
            PrintStatusList(orderId: o.id),
            const SizedBox(height: 24),
            if (canVoid && !o.voided)
              OutlinedButton.icon(
                key: const Key('void-open'),
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size.fromHeight(52),
                  foregroundColor: Theme.of(context).colorScheme.error,
                ),
                onPressed: () async {
                  final done = await showDialog<bool>(
                    context: context,
                    builder: (_) => VoidDialog(order: o, needsApproval: !can(user.role, 'orders.void')),
                  );
                  if (done == true) {
                    ref.invalidate(orderDetailProvider(orderId));
                    if (context.mounted) showMessage(context, l.voidDone);
                  }
                },
                icon: const Icon(Icons.block),
                label: Text(l.voidButton),
              ),
          ],
        ),
      ),
    );
  }

  Widget _row(String label, int amount, {bool strong = false}) => Builder(
    builder: (context) {
      final style = strong ? Theme.of(context).textTheme.titleLarge : null;
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(
          children: [
            Expanded(child: Text(label, style: style)),
            Text(formatIdr(amount), style: style),
          ],
        ),
      );
    },
  );
}

/// SPEC §7.3, §5.4: reason + restock; a cashier needs an owner/manager PIN.
class VoidDialog extends ConsumerStatefulWidget {
  const VoidDialog({super.key, required this.order, required this.needsApproval});

  final Order order;
  final bool needsApproval;

  @override
  ConsumerState<VoidDialog> createState() => _VoidDialogState();
}

class _VoidDialogState extends ConsumerState<VoidDialog> {
  final _reason = TextEditingController();
  bool _restock = true;
  String? _approverId;
  String _pin = '';
  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  bool get _ready =>
      _reason.text.trim().isNotEmpty && (!widget.needsApproval || (_approverId != null && _pin.length >= 4));

  Future<void> _submit() async {
    final l = context.l10n;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(apiProvider)
          .voidOrder(
            widget.order.id,
            reason: _reason.text.trim(),
            restock: _restock,
            approval: widget.needsApproval ? {'user_id': _approverId, 'pin': _pin} : null,
          );
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (e) {
      setState(() {
        _pin = '';
        _error = switch (e.details['reason']) {
          'approval_invalid_pin' => l.voidApprovalWrong,
          _ when e.code == 'PIN_LOCKED' => l.pinLocked(
            (DateTime.tryParse(e.details['locked_until'] as String? ?? '')
                        ?.difference(DateTime.now())
                        .inSeconds ??
                    0) +
                1,
          ),
          _ => errorText(l, e),
        };
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final me = ref.watch(currentUserProvider);
    final approvers = widget.needsApproval
        ? (ref.watch(staffListProvider).value ?? const <StaffMember>[])
              .where((s) => s.canApprove && s.id != me?.id)
              .toList()
        : const <StaffMember>[];
    return AlertDialog(
      title: Text(l.voidTitle(widget.order.orderNumber)),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(
              key: const Key('void-reason'),
              controller: _reason,
              maxLength: 500,
              decoration: InputDecoration(labelText: l.voidReason),
              onChanged: (_) => setState(() {}),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(l.voidRestock),
              value: _restock,
              onChanged: (v) => setState(() => _restock = v),
            ),
            if (widget.needsApproval) ...[
              Text(l.voidApprovalNeeded),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                key: const Key('void-approver'),
                initialValue: _approverId,
                decoration: InputDecoration(labelText: l.voidApprover),
                items: [
                  for (final a in approvers)
                    DropdownMenuItem(value: a.id, child: Text('${a.name} (${roleLabel(l, a.role)})')),
                ],
                onChanged: (v) => setState(() => _approverId = v),
              ),
              const SizedBox(height: 8),
              Text('${l.voidApproverPin}: ${'•' * _pin.length}', key: const Key('void-pin')),
              Center(
                child: NumberPad(
                  keySize: 52,
                  onKey: (k) => setState(() {
                    if (k == '⌫') {
                      if (_pin.isNotEmpty) _pin = _pin.substring(0, _pin.length - 1);
                    } else if (_pin.length < 6) {
                      _pin += k;
                    }
                  }),
                ),
              ),
            ],
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
              ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: Text(l.commonCancel)),
        FilledButton(
          key: const Key('void-submit'),
          style: FilledButton.styleFrom(backgroundColor: Theme.of(context).colorScheme.error),
          onPressed: _ready && !_busy ? _submit : null,
          child: Text(l.voidButton),
        ),
      ],
    );
  }
}
