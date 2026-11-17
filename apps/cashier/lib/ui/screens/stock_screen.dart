// SPEC §11.1 #8: ingredient levels with low/negative badges; stock-in, waste,
// stock count (count mode = number inputs, submit all). Quantities are decimal
// strings (D-028); the server does the arithmetic.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/api_error.dart';
import '../../api/models.dart';
import '../../domain/money.dart';
import '../../domain/permissions.dart';
import '../../state/auth.dart';
import '../../state/providers.dart';
import '../common.dart';

final ingredientsProvider = FutureProvider.autoDispose<List<Ingredient>>(
  (ref) => ref.read(apiProvider).ingredients(),
);

class StockScreen extends ConsumerWidget {
  const StockScreen({super.key});

  Future<void> _open(BuildContext context, WidgetRef ref, Widget page) async {
    final saved = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => page));
    if (saved == true) {
      ref.invalidate(ingredientsProvider);
      if (context.mounted) showMessage(context, context.l10n.stockSaved);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l10n;
    final list = ref.watch(ingredientsProvider);
    final user = ref.watch(currentUserProvider);
    final canAdjust = user != null && can(user.role, 'stock.adjust');
    final ingredients = list.value ?? const <Ingredient>[];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (canAdjust)
          Padding(
            padding: const EdgeInsets.all(12),
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                FilledButton.icon(
                  key: const Key('stock-in'),
                  onPressed: ingredients.isEmpty
                      ? null
                      : () => _open(context, ref, StockInPage(ingredients: ingredients)),
                  icon: const Icon(Icons.add_box_outlined),
                  label: Text(l.stockIn),
                ),
                FilledButton.tonalIcon(
                  key: const Key('stock-waste'),
                  onPressed: ingredients.isEmpty
                      ? null
                      : () => _open(context, ref, WastePage(ingredients: ingredients)),
                  icon: const Icon(Icons.delete_sweep_outlined),
                  label: Text(l.stockWaste),
                ),
                FilledButton.tonalIcon(
                  key: const Key('stock-count'),
                  onPressed: ingredients.isEmpty
                      ? null
                      : () => _open(context, ref, CountPage(ingredients: ingredients)),
                  icon: const Icon(Icons.fact_check_outlined),
                  label: Text(l.stockCount),
                ),
              ],
            ),
          ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () => ref.refresh(ingredientsProvider.future),
            child: list.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => ListView(
                children: [Padding(padding: const EdgeInsets.all(24), child: Text(errorText(l, e)))],
              ),
              data: (items) => items.isEmpty
                  ? ListView(children: [ListTile(title: Text(l.stockEmpty))])
                  : ListView.separated(
                      itemCount: items.length,
                      separatorBuilder: (_, _) => const Divider(height: 1),
                      itemBuilder: (context, i) {
                        final ing = items[i];
                        return ListTile(
                          key: Key('ingredient-${ing.id}'),
                          title: Text(ing.name),
                          subtitle: ing.isNegative
                              ? _Badge(l.stockNegative, Theme.of(context).colorScheme.error)
                              : ing.isLow
                              ? _Badge(l.stockLow, Colors.orange[800]!)
                              : null,
                          trailing: Text(
                            formatQty(ing.stockQty, ing.baseUnit),
                            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                              color: ing.isNegative ? Theme.of(context).colorScheme.error : null,
                            ),
                          ),
                        );
                      },
                    ),
            ),
          ),
        ),
      ],
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge(this.text, this.color);

  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) => Align(
    alignment: Alignment.centerLeft,
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(8)),
      child: Text(
        text,
        style: TextStyle(color: color, fontWeight: FontWeight.w600),
      ),
    ),
  );
}

/// Shared shell: a form page that posts once and pops `true` on success.
class _StockForm extends ConsumerStatefulWidget {
  const _StockForm({required this.title, required this.builder, required this.submit});

  final String title;
  final List<Widget> Function(BuildContext context, VoidCallback changed) builder;

  /// Returns null when the form isn't ready.
  final Future<void> Function(WidgetRef ref)? Function() submit;

  @override
  ConsumerState<_StockForm> createState() => _StockFormState();
}

class _StockFormState extends ConsumerState<_StockForm> {
  bool _busy = false;
  String? _error;

  Future<void> _save(Future<void> Function(WidgetRef ref) action) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action(ref);
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = errorText(context.l10n, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final action = widget.submit();
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          ...widget.builder(context, () => setState(() {})),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ),
          const SizedBox(height: 16),
          FilledButton(
            key: const Key('stock-save'),
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(56)),
            onPressed: action == null || _busy ? null : () => _save(action),
            child: _busy ? const CircularProgressIndicator() : Text(context.l10n.commonSave),
          ),
        ],
      ),
    );
  }
}

Widget _ingredientPicker(
  BuildContext context,
  List<Ingredient> ingredients,
  Ingredient? value,
  ValueChanged<Ingredient?> onChanged,
) => DropdownButtonFormField<String>(
  key: const Key('stock-ingredient'),
  initialValue: value?.id,
  isExpanded: true,
  decoration: InputDecoration(labelText: context.l10n.stockIngredient),
  items: [
    for (final i in ingredients)
      DropdownMenuItem(value: i.id, child: Text('${i.name} (${formatQty(i.stockQty, i.baseUnit)})')),
  ],
  onChanged: (id) => onChanged(ingredients.where((i) => i.id == id).firstOrNull),
);

String? _qtyError(BuildContext context, String text) =>
    text.trim().isEmpty || parseQtyInput(text) != null ? null : context.l10n.stockQtyInvalid;

class StockInPage extends StatefulWidget {
  const StockInPage({super.key, required this.ingredients});

  final List<Ingredient> ingredients;

  @override
  State<StockInPage> createState() => _StockInPageState();
}

class _StockInPageState extends State<StockInPage> {
  Ingredient? _ingredient;
  bool _purchaseUnit = false;
  final _qty = TextEditingController();
  final _cost = TextEditingController();

  @override
  void dispose() {
    _qty.dispose();
    _cost.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return _StockForm(
      title: l.stockIn,
      builder: (context, changed) {
        final ing = _ingredient;
        final hasPurchase = ing?.purchaseUnitName != null && ing?.purchaseUnitSize != null;
        return [
          _ingredientPicker(context, widget.ingredients, ing, (v) {
            _ingredient = v;
            _purchaseUnit = false;
            changed();
          }),
          if (hasPurchase)
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(
                l.stockUsePurchaseUnit(
                  ing!.purchaseUnitName!,
                  formatQty(ing.purchaseUnitSize!, '').trim(),
                  ing.baseUnit,
                ),
              ),
              value: _purchaseUnit,
              onChanged: (v) {
                _purchaseUnit = v;
                changed();
              },
            ),
          TextField(
            key: const Key('stock-qty'),
            controller: _qty,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(
              labelText: l.stockQtyIn(_purchaseUnit ? ing!.purchaseUnitName! : (ing?.baseUnit ?? '')),
              errorText: _qtyError(context, _qty.text),
            ),
            onChanged: (_) => changed(),
          ),
          TextField(
            key: const Key('stock-cost'),
            controller: _cost,
            keyboardType: TextInputType.number,
            decoration: InputDecoration(labelText: l.stockTotalCost, prefixText: 'Rp '),
            onChanged: (_) => changed(),
          ),
        ];
      },
      submit: () {
        final ing = _ingredient;
        final qty = parseQtyInput(_qty.text);
        final cost = parseRupiah(_cost.text);
        if (ing == null || qty == null || cost == null) return null;
        return (ref) => ref.read(apiProvider).stockIn({
          'ingredient_id': ing.id,
          _purchaseUnit ? 'purchase_qty' : 'qty': qty,
          'total_cost': cost,
        });
      },
    );
  }
}

class WastePage extends StatefulWidget {
  const WastePage({super.key, required this.ingredients});

  final List<Ingredient> ingredients;

  @override
  State<WastePage> createState() => _WastePageState();
}

class _WastePageState extends State<WastePage> {
  Ingredient? _ingredient;
  String _reason = 'spilled';
  final _qty = TextEditingController();
  final _note = TextEditingController();

  @override
  void dispose() {
    _qty.dispose();
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final reasons = {
      'spilled': l.wasteSpilled,
      'expired': l.wasteExpired,
      'mistake': l.wasteMistake,
      'other': l.wasteOther,
    };
    return _StockForm(
      title: l.stockWaste,
      builder: (context, changed) => [
        _ingredientPicker(context, widget.ingredients, _ingredient, (v) {
          _ingredient = v;
          changed();
        }),
        TextField(
          key: const Key('stock-qty'),
          controller: _qty,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: InputDecoration(
            labelText: l.stockQtyIn(_ingredient?.baseUnit ?? ''),
            errorText: _qtyError(context, _qty.text),
          ),
          onChanged: (_) => changed(),
        ),
        const SizedBox(height: 12),
        Text(l.stockReason, style: Theme.of(context).textTheme.titleSmall),
        Wrap(
          spacing: 8,
          children: [
            for (final MapEntry(:key, :value) in reasons.entries)
              ChoiceChip(
                label: Text(value),
                selected: _reason == key,
                onSelected: (_) {
                  _reason = key;
                  changed();
                },
              ),
          ],
        ),
        TextField(
          controller: _note,
          maxLength: 150,
          decoration: InputDecoration(labelText: l.commonNote),
        ),
      ],
      submit: () {
        final ing = _ingredient;
        final qty = parseQtyInput(_qty.text);
        if (ing == null || qty == null || qty == '0') return null;
        return (ref) => ref.read(apiProvider).waste({
          'ingredient_id': ing.id,
          'qty': qty,
          'reason': _reason,
          if (_note.text.trim().isNotEmpty) 'note': _note.text.trim(),
        });
      },
    );
  }
}

class CountPage extends StatefulWidget {
  const CountPage({super.key, required this.ingredients});

  final List<Ingredient> ingredients;

  @override
  State<CountPage> createState() => _CountPageState();
}

class _CountPageState extends State<CountPage> {
  late final _fields = {for (final i in widget.ingredients) i.id: TextEditingController()};

  @override
  void dispose() {
    for (final c in _fields.values) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return _StockForm(
      title: l.stockCount,
      builder: (context, changed) => [
        Text(l.stockCountHint),
        const SizedBox(height: 8),
        for (final i in widget.ingredients)
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(i.name),
            subtitle: Text(formatQty(i.stockQty, i.baseUnit)),
            trailing: SizedBox(
              width: 140,
              child: TextField(
                key: Key('count-${i.id}'),
                controller: _fields[i.id],
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                textAlign: TextAlign.end,
                decoration: InputDecoration(
                  hintText: l.stockCounted,
                  suffixText: i.baseUnit,
                  errorText: _qtyError(context, _fields[i.id]!.text),
                ),
                onChanged: (_) => changed(),
              ),
            ),
          ),
      ],
      submit: () {
        final counts = <Json>[];
        for (final MapEntry(:key, :value) in _fields.entries) {
          if (value.text.trim().isEmpty) continue;
          final qty = parseQtyInput(value.text);
          if (qty == null) return null;
          counts.add({'ingredient_id': key, 'counted_qty': qty});
        }
        if (counts.isEmpty) return null;
        return (ref) => ref.read(apiProvider).count({'counts': counts});
      },
    );
  }
}
