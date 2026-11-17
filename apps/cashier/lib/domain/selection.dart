// Modifier sheet rules (SPEC §6.5, §11.1 #4) as pure functions.
// A selection maps group id → chosen option ids.
import '../api/models.dart';

typedef Selection = Map<String, Set<String>>;

/// Defaults pre-selected; a single-select group takes at most one.
Selection defaultSelection(List<ModifierGroup> groups) => {
  for (final g in groups)
    g.id: {for (final o in g.options.where((o) => o.isDefault).take(g.single ? 1 : g.maxSelect)) o.id},
};

/// Tapping an option: single-select replaces (or clears an optional group);
/// multi-select toggles while under max_select.
Selection toggleOption(Selection selection, ModifierGroup group, String optionId) {
  final current = selection[group.id] ?? const <String>{};
  final Set<String> next;
  if (current.contains(optionId)) {
    next = group.required && current.length <= group.minSelect && group.single
        ? current
        : ({...current}..remove(optionId));
  } else if (group.single) {
    next = {optionId};
  } else if (current.length < group.maxSelect) {
    next = {...current, optionId};
  } else {
    next = current;
  }
  return {...selection, group.id: next};
}

bool groupSatisfied(Selection selection, ModifierGroup group) {
  final n = selection[group.id]?.length ?? 0;
  return n >= group.minSelect && n <= group.maxSelect;
}

bool selectionValid(Selection selection, List<ModifierGroup> groups) =>
    groups.every((g) => groupSatisfied(selection, g));

/// Chosen options in sheet order: group order, then option order.
List<ModifierOption> selectedOptions(Selection selection, List<ModifierGroup> groups) => [
  for (final g in groups)
    for (final o in g.options)
      if (selection[g.id]?.contains(o.id) ?? false) o,
];
