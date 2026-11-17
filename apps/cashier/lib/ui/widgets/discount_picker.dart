import 'package:flutter/material.dart';

import '../../api/models.dart';
import '../../domain/cart.dart';
import '../../domain/money.dart';
import '../common.dart';

/// The cashier picked "no discount" (as opposed to dismissing the dialog).
class NoDiscount {
  const NoDiscount();
}

String discountLabel(BuildContext context, DiscountChoice d) {
  final p = d.preset;
  if (p != null) return p.name;
  return '${context.l10n.discountCustomLabel} ${d.percent ? formatBps(d.value) : formatIdr(d.value)}';
}

/// Presets of the right scope, plus custom % / Rp for owner and manager (SPEC §6.5).
/// Returns a [DiscountChoice], [NoDiscount], or null when dismissed.
Future<Object?> pickDiscount(
  BuildContext context, {
  required List<PresetDiscount> presets,
  required bool allowCustom,
}) => showDialog<Object>(
  context: context,
  builder: (context) {
    final l = context.l10n;
    return SimpleDialog(
      title: Text(l.discountAdd),
      children: [
        SimpleDialogOption(
          onPressed: () => Navigator.pop(context, const NoDiscount()),
          child: Text(l.discountNone),
        ),
        for (final p in presets)
          SimpleDialogOption(
            key: Key('discount-${p.id}'),
            onPressed: () => Navigator.pop(context, DiscountChoice.preset(p)),
            child: Text('${p.name} · ${p.percent ? formatBps(p.value) : formatIdr(p.value)}'),
          ),
        if (allowCustom) ...[
          SimpleDialogOption(
            onPressed: () async {
              final v = await _customValue(context, percent: true);
              if (v != null && context.mounted) {
                Navigator.pop(context, DiscountChoice.custom(percent: true, value: v));
              }
            },
            child: Text(l.discountCustomPercent),
          ),
          SimpleDialogOption(
            onPressed: () async {
              final v = await _customValue(context, percent: false);
              if (v != null && context.mounted) {
                Navigator.pop(context, DiscountChoice.custom(percent: false, value: v));
              }
            },
            child: Text(l.discountCustomFixed),
          ),
        ],
      ],
    );
  },
);

/// Percent → basis points ("2,5" → 250); rupiah → int.
Future<int?> _customValue(BuildContext context, {required bool percent}) {
  final controller = TextEditingController();
  final l = context.l10n;
  int? parse(String s) {
    if (!percent) {
      final v = parseRupiah(s);
      return v != null && v > 0 ? v : null;
    }
    final m = RegExp(r'^\s*(\d{1,3})(?:[.,](\d{1,2}))?\s*$').firstMatch(s);
    if (m == null) return null;
    final bps = int.parse(m[1]!) * 100 + int.parse((m[2] ?? '').padRight(2, '0'));
    return bps >= 1 && bps <= 10000 ? bps : null;
  }

  return showDialog<int>(
    context: context,
    builder: (context) => StatefulBuilder(
      builder: (context, setState) {
        final value = parse(controller.text);
        return AlertDialog(
          title: Text(percent ? l.discountCustomPercent : l.discountCustomFixed),
          content: TextField(
            key: const Key('custom-discount'),
            controller: controller,
            autofocus: true,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(hintText: percent ? l.discountPercentHint : l.discountFixedHint),
            onChanged: (_) => setState(() {}),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context), child: Text(l.commonCancel)),
            FilledButton(
              onPressed: value == null ? null : () => Navigator.pop(context, value),
              child: Text(l.commonSave),
            ),
          ],
        );
      },
    ),
  );
}
