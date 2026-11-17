// SPEC §11.1 #3: item grid + cart. Tablet landscape side by side; phone portrait
// grid with the cart as a bottom sheet behind a total bar.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

import '../../api/models.dart';
import '../../domain/cart.dart';
import '../../domain/money.dart';
import '../../domain/permissions.dart';
import '../../state/auth.dart';
import '../../state/cart.dart';
import '../../state/checkout.dart';
import '../../state/connection.dart';
import '../../state/menu.dart';
import '../common.dart';
import '../widgets/discount_picker.dart';
import '../widgets/controls.dart';
import 'modifier_sheet.dart';
import 'payment_screen.dart';

const _wideBreakpoint = 840.0;

class OrderScreen extends ConsumerStatefulWidget {
  const OrderScreen({super.key});

  @override
  ConsumerState<OrderScreen> createState() => _OrderScreenState();
}

class _OrderScreenState extends ConsumerState<OrderScreen> {
  @override
  void initState() {
    super.initState();
    // Keep the screen awake while on the order screen (SPEC §11.4).
    WakelockPlus.enable().ignore();
  }

  @override
  void dispose() {
    WakelockPlus.disable().ignore();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final menu = ref.watch(menuProvider).value;
    final l = context.l10n;
    if (menu == null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(l.menuNotLoaded),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: () => ref.read(menuProvider.notifier).refresh(),
              child: Text(l.commonRetry),
            ),
          ],
        ),
      );
    }
    return LayoutBuilder(
      builder: (context, constraints) {
        if (constraints.maxWidth >= _wideBreakpoint) {
          return Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(child: MenuGrid(menu: menu)),
              const VerticalDivider(width: 1),
              SizedBox(width: 400, child: CartPanel(menu: menu)),
            ],
          );
        }
        return Column(
          children: [
            Expanded(child: MenuGrid(menu: menu)),
            _CartBar(menu: menu),
          ],
        );
      },
    );
  }
}

class MenuGrid extends ConsumerStatefulWidget {
  const MenuGrid({super.key, required this.menu});

  final Bootstrap menu;

  @override
  ConsumerState<MenuGrid> createState() => _MenuGridState();
}

class _MenuGridState extends ConsumerState<MenuGrid> {
  String? _category;

  Future<void> _tap(MenuItem item) async {
    final l = context.l10n;
    if (!item.isAvailable) {
      showMessage(context, '${item.name}: ${l.itemSoldOut}');
      return;
    }
    final groups = widget.menu.groupsOf(item);
    final cart = ref.read(cartProvider.notifier);
    if (groups.isEmpty) {
      cart.add(item, const []);
      return;
    }
    final result = await showModifierSheet(context, item, groups);
    if (result != null) cart.add(item, result.options, qty: result.qty, note: result.note);
  }

  Future<void> _toggleAvailability(MenuItem item) async {
    final user = ref.read(currentUserProvider);
    if (user == null || !can(user.role, 'menu.availability')) return;
    final l = context.l10n;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(item.name),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text(l.commonCancel)),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(item.isAvailable ? l.itemMarkSoldOut : l.itemMarkAvailable),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref.read(menuProvider.notifier).setAvailability(item.id, !item.isAvailable);
    } catch (e) {
      if (mounted) showMessage(context, errorText(l, e), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final menu = widget.menu;
    final items = _category == null
        ? menu.items
        : menu.items.where((i) => i.categoryId == _category).toList();
    if (menu.items.isEmpty) return Center(child: Text(l.menuEmpty));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SizedBox(
          height: 64,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            children: [
              for (final c in [null, ...menu.categories])
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    key: Key('category-${c?.id ?? 'all'}'),
                    label: Text(c?.name ?? l.categoryAll),
                    selected: _category == c?.id,
                    onSelected: (_) => setState(() => _category = c?.id),
                  ),
                ),
            ],
          ),
        ),
        Expanded(
          child: GridView.builder(
            padding: const EdgeInsets.all(12),
            gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
              maxCrossAxisExtent: 180,
              mainAxisExtent: 112,
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
            ),
            itemCount: items.length,
            itemBuilder: (context, i) => _ItemTile(
              item: items[i],
              onTap: () => _tap(items[i]),
              onLongPress: () => _toggleAvailability(items[i]),
            ),
          ),
        ),
      ],
    );
  }
}

class _ItemTile extends StatelessWidget {
  const _ItemTile({required this.item, required this.onTap, required this.onLongPress});

  final MenuItem item;
  final VoidCallback onTap;
  final VoidCallback onLongPress;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final soldOut = !item.isAvailable;
    return Material(
      key: Key('item-${item.id}'),
      color: soldOut ? theme.disabledColor.withValues(alpha: 0.12) : itemColor(item.color),
      borderRadius: BorderRadius.circular(12),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        onLongPress: onLongPress,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  item.name,
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.titleSmall?.copyWith(
                    color: soldOut ? theme.disabledColor : Colors.black87,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      formatIdr(item.price),
                      style: TextStyle(color: soldOut ? theme.disabledColor : Colors.black87),
                    ),
                  ),
                  if (soldOut)
                    Text(
                      context.l10n.itemSoldOut,
                      style: TextStyle(color: theme.colorScheme.error, fontWeight: FontWeight.bold),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Phone portrait: total bar that opens the cart.
class _CartBar extends ConsumerWidget {
  const _CartBar({required this.menu});

  final Bootstrap menu;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cart = ref.watch(cartProvider);
    final total = cart.price(menu.settings).total;
    final l = context.l10n;
    return Material(
      elevation: 8,
      child: SafeArea(
        top: false,
        child: ListTile(
          key: const Key('cart-bar'),
          minTileHeight: 64,
          leading: Badge(label: Text('${cart.itemCount}'), child: const Icon(Icons.shopping_basket_outlined)),
          title: Text(l.itemsCount(cart.itemCount)),
          trailing: Text(formatIdr(total), style: Theme.of(context).textTheme.titleLarge),
          onTap: () => showModalBottomSheet<void>(
            context: context,
            isScrollControlled: true,
            useSafeArea: true,
            builder: (_) => FractionallySizedBox(heightFactor: 0.9, child: CartPanel(menu: menu)),
          ),
        ),
      ),
    );
  }
}

class CartPanel extends ConsumerWidget {
  const CartPanel({super.key, required this.menu});

  final Bootstrap menu;

  Future<void> _pickOrderDiscount(BuildContext context, WidgetRef ref, bool allowCustom) async {
    final picked = await pickDiscount(
      context,
      presets: menu.discounts.where((d) => d.orderScope).toList(),
      allowCustom: allowCustom,
    );
    if (picked is DiscountChoice) ref.read(cartProvider.notifier).setOrderDiscount(picked);
    if (picked is NoDiscount) ref.read(cartProvider.notifier).setOrderDiscount(null);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l10n;
    final theme = Theme.of(context);
    final cart = ref.watch(cartProvider);
    final online = ref.watch(onlineProvider);
    final pending = ref.watch(checkoutProvider).pending != null;
    final user = ref.watch(currentUserProvider);
    final allowCustom = user != null && can(user.role, 'discounts.apply_custom');
    final s = menu.settings;
    final priced = cart.price(s);
    final notifier = ref.read(cartProvider.notifier);
    final canPay = !cart.isEmpty && online && !pending;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
          child: SegmentedButton<OrderType>(
            segments: [
              ButtonSegment(value: OrderType.takeaway, label: Text(l.orderTakeaway)),
              ButtonSegment(value: OrderType.dineIn, label: Text(l.orderDineIn)),
            ],
            selected: {cart.orderType},
            onSelectionChanged: (v) => notifier.setOrderType(v.first),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
          child: _CustomerField(value: cart.customerName, onChanged: notifier.setCustomerName),
        ),
        Expanded(
          child: cart.isEmpty
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(l.cartEmpty, textAlign: TextAlign.center),
                  ),
                )
              : ListView.separated(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  itemCount: cart.lines.length,
                  separatorBuilder: (_, _) => const Divider(height: 1),
                  itemBuilder: (context, i) {
                    final line = cart.lines[i];
                    final p = priced.lines[i];
                    return _CartLineTile(
                      line: line,
                      lineNet: p.lineNet,
                      lineGross: p.lineGross,
                      onQty: (q) => notifier.setQty(line.key, q),
                      onEdit: () => _editLine(context, ref, line, allowCustom),
                    );
                  },
                ),
        ),
        const Divider(height: 1),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          child: Column(
            children: [
              _TotalRow(l.subtotal, priced.subtotal),
              if (priced.itemDiscountTotal > 0) _TotalRow(l.itemDiscounts, -priced.itemDiscountTotal),
              InkWell(
                key: const Key('order-discount'),
                onTap: cart.isEmpty ? null : () => _pickOrderDiscount(context, ref, allowCustom),
                child: _TotalRow(
                  cart.orderDiscount == null
                      ? '${l.orderDiscount} +'
                      : '${l.orderDiscount}: ${discountLabel(context, cart.orderDiscount!)}',
                  -priced.orderDiscountAmount,
                ),
              ),
              if (s.serviceChargeEnabled)
                _TotalRow(l.serviceCharge(formatBps(s.serviceChargeBps)), priced.serviceChargeAmount),
              if (s.taxEnabled) _TotalRow(l.taxLine(s.taxName, formatBps(s.taxBps)), priced.taxAmount),
              _TotalRow(l.total, priced.total, strong: true),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(12),
          child: FilledButton(
            key: const Key('pay'),
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(64),
              textStyle: theme.textTheme.titleLarge,
            ),
            onPressed: canPay
                ? () => Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => PaymentScreen(cart: cart, settings: s),
                    ),
                  )
                : null,
            child: Text(l.payButton(formatIdr(priced.total))),
          ),
        ),
        if (pending)
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
            child: Text(l.pendingBlocks, style: TextStyle(color: theme.colorScheme.error)),
          ),
      ],
    );
  }

  Future<void> _editLine(BuildContext context, WidgetRef ref, CartLine line, bool allowCustom) =>
      showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        builder: (_) => _LineEditSheet(
          line: line,
          presets: menu.discounts.where((d) => !d.orderScope).toList(),
          allowCustom: allowCustom,
        ),
      );
}

class _CustomerField extends StatefulWidget {
  const _CustomerField({required this.value, required this.onChanged});

  final String value;
  final ValueChanged<String> onChanged;

  @override
  State<_CustomerField> createState() => _CustomerFieldState();
}

class _CustomerFieldState extends State<_CustomerField> {
  late final _controller = TextEditingController(text: widget.value);

  @override
  void didUpdateWidget(covariant _CustomerField old) {
    super.didUpdateWidget(old);
    // Cleared after an order.
    if (widget.value != _controller.text) _controller.text = widget.value;
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => TextField(
    key: const Key('customer-name'),
    controller: _controller,
    maxLength: 60,
    decoration: InputDecoration(
      labelText: context.l10n.customerName,
      isDense: true,
      counterText: '',
      prefixIcon: const Icon(Icons.person_outline),
    ),
    onChanged: widget.onChanged,
  );
}

class _CartLineTile extends StatelessWidget {
  const _CartLineTile({
    required this.line,
    required this.lineNet,
    required this.lineGross,
    required this.onQty,
    required this.onEdit,
  });

  final CartLine line;
  final int lineNet;
  final int lineGross;
  final ValueChanged<int> onQty;
  final VoidCallback onEdit;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final details = [
      ...line.options.map((o) => o.name),
      if (line.note != null) '“${line.note}”',
      if (line.discount != null) discountLabel(context, line.discount!),
    ].join(' · ');
    return Dismissible(
      key: Key('line-${line.key}'),
      direction: DismissDirection.endToStart,
      background: Container(
        color: theme.colorScheme.errorContainer,
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 24),
        child: const Icon(Icons.delete_outline),
      ),
      onDismissed: (_) => onQty(0),
      child: InkWell(
        onTap: onEdit,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(line.item.name, style: theme.textTheme.titleSmall),
                    if (details.isNotEmpty) Text(details, style: theme.textTheme.bodySmall),
                    Text(
                      formatIdr(lineNet),
                      key: Key('line-total-${line.key}'),
                      style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
              ),
              QtyStepper(qty: line.qty, onChanged: onQty),
            ],
          ),
        ),
      ),
    );
  }
}

class _TotalRow extends StatelessWidget {
  const _TotalRow(this.label, this.amount, {this.strong = false});

  final String label;
  final int amount;
  final bool strong;

  @override
  Widget build(BuildContext context) {
    final style = strong ? Theme.of(context).textTheme.titleLarge : Theme.of(context).textTheme.bodyMedium;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        children: [
          Expanded(child: Text(label, style: style)),
          Text(formatIdr(amount), key: strong ? const Key('cart-total') : null, style: style),
        ],
      ),
    );
  }
}

/// Line note, discount, remove.
class _LineEditSheet extends ConsumerStatefulWidget {
  const _LineEditSheet({required this.line, required this.presets, required this.allowCustom});

  final CartLine line;
  final List<PresetDiscount> presets;
  final bool allowCustom;

  @override
  ConsumerState<_LineEditSheet> createState() => _LineEditSheetState();
}

class _LineEditSheetState extends ConsumerState<_LineEditSheet> {
  late final _note = TextEditingController(text: widget.line.note ?? '');

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final cart = ref.read(cartProvider.notifier);
    final line = ref.watch(cartProvider).lines.where((x) => x.key == widget.line.key).firstOrNull;
    if (line == null) return const SizedBox.shrink();
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + MediaQuery.viewInsetsOf(context).bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('${l.lineEdit}: ${line.item.name}', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 12),
          TextField(
            controller: _note,
            maxLength: 200,
            decoration: InputDecoration(labelText: l.commonNote),
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.local_offer_outlined),
            title: Text(line.discount == null ? l.discountAdd : discountLabel(context, line.discount!)),
            onTap: () async {
              final picked = await pickDiscount(
                context,
                presets: widget.presets,
                allowCustom: widget.allowCustom,
              );
              if (picked is DiscountChoice) cart.setLineDiscount(line.key, picked);
              if (picked is NoDiscount) cart.setLineDiscount(line.key, null);
            },
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              TextButton.icon(
                onPressed: () {
                  cart.remove(line.key);
                  Navigator.pop(context);
                },
                icon: const Icon(Icons.delete_outline),
                label: Text(l.commonRemove),
              ),
              const Spacer(),
              FilledButton(
                onPressed: () {
                  cart.setNote(line.key, _note.text);
                  Navigator.pop(context);
                },
                child: Text(l.commonSave),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
