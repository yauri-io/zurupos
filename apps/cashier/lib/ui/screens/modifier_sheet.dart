// SPEC §11.1 #4: groups in order, required marked, defaults pre-selected, price
// deltas shown, qty, note, Add disabled until valid.
import 'package:flutter/material.dart';

import '../../api/models.dart';
import '../../domain/money.dart';
import '../../domain/selection.dart';
import '../common.dart';
import '../widgets/controls.dart';

typedef ModifierResult = ({List<ModifierOption> options, int qty, String? note});

Future<ModifierResult?> showModifierSheet(BuildContext context, MenuItem item, List<ModifierGroup> groups) =>
    showModalBottomSheet<ModifierResult>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => ModifierSheet(item: item, groups: groups),
    );

class ModifierSheet extends StatefulWidget {
  const ModifierSheet({super.key, required this.item, required this.groups});

  final MenuItem item;
  final List<ModifierGroup> groups;

  @override
  State<ModifierSheet> createState() => _ModifierSheetState();
}

class _ModifierSheetState extends State<ModifierSheet> {
  late Selection _selection = defaultSelection(widget.groups);
  int _qty = 1;
  final _note = TextEditingController();

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  String _rule(ModifierGroup g) {
    final l = context.l10n;
    if (g.single) return g.required ? l.modRequired : '';
    if (g.minSelect == 0) return l.modPickUpTo(g.maxSelect);
    return '${l.modRequired} · ${l.modPickBetween(g.minSelect, g.maxSelect)}';
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final theme = Theme.of(context);
    final options = selectedOptions(_selection, widget.groups);
    final unit = widget.item.price + options.fold<int>(0, (s, o) => s + o.priceDelta);
    final valid = selectionValid(_selection, widget.groups);
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ListTile(
            title: Text(widget.item.name, style: theme.textTheme.titleLarge),
            trailing: Text(formatIdr(widget.item.price), style: theme.textTheme.titleMedium),
          ),
          const Divider(height: 1),
          Flexible(
            child: ListView(
              shrinkWrap: true,
              padding: const EdgeInsets.all(16),
              children: [
                for (final g in widget.groups) ...[
                  Row(
                    children: [
                      Text(g.name, style: theme.textTheme.titleMedium),
                      const SizedBox(width: 8),
                      if (_rule(g).isNotEmpty)
                        Text(
                          _rule(g),
                          style: theme.textTheme.labelMedium?.copyWith(
                            color: groupSatisfied(_selection, g) ? null : theme.colorScheme.error,
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final o in g.options)
                        FilterChip(
                          key: Key('option-${o.id}'),
                          materialTapTargetSize: MaterialTapTargetSize.padded,
                          showCheckmark: !g.single,
                          label: Text(o.priceDelta > 0 ? '${o.name}  +${formatIdr(o.priceDelta)}' : o.name),
                          selected: _selection[g.id]?.contains(o.id) ?? false,
                          onSelected: (_) => setState(() => _selection = toggleOption(_selection, g, o.id)),
                        ),
                    ],
                  ),
                  const SizedBox(height: 16),
                ],
                Row(
                  children: [
                    Text(l.qty, style: theme.textTheme.titleMedium),
                    const Spacer(),
                    QtyStepper(qty: _qty, min: 1, onChanged: (q) => setState(() => _qty = q)),
                  ],
                ),
                const SizedBox(height: 8),
                TextField(
                  key: const Key('line-note'),
                  controller: _note,
                  maxLength: 200,
                  decoration: InputDecoration(labelText: l.commonNote),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: FilledButton(
              key: const Key('modifier-add'),
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(56)),
              onPressed: valid
                  ? () => Navigator.pop<ModifierResult>(context, (
                      options: options,
                      qty: _qty,
                      note: _note.text.trim().isEmpty ? null : _note.text.trim(),
                    ))
                  : null,
              child: Text(l.modAdd(formatIdr(unit * _qty))),
            ),
          ),
        ],
      ),
    );
  }
}
