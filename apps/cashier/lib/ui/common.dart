import 'package:flutter/material.dart';

import '../api/api_error.dart';
import '../api/models.dart';
import '../l10n/generated/app_localizations.dart';

extension L10nContext on BuildContext {
  AppLocalizations get l10n => AppLocalizations.of(this);
}

String roleLabel(AppLocalizations l, Role r) => switch (r) {
  Role.owner => l.roleOwner,
  Role.manager => l.roleManager,
  Role.cashier => l.roleCashier,
  Role.employee => l.roleEmployee,
};

String methodLabel(AppLocalizations l, String method) => switch (method) {
  'cash' => l.methodCash,
  'qris' => l.methodQris,
  'debit' => l.methodDebit,
  'credit' => l.methodCredit,
  'transfer' => l.methodTransfer,
  _ => l.methodOther,
};

/// One place that turns an API error into a sentence for staff.
String errorText(AppLocalizations l, Object error) {
  if (error is! ApiException) return l.errorGeneric;
  return switch (error.code) {
    'NETWORK' => l.errorNetwork,
    'FORBIDDEN' => l.errorForbidden,
    'RATE_LIMITED' => l.errorRateLimited,
    'VALIDATION' => l.errorValidation,
    'ITEM_UNAVAILABLE' => l.errorItemUnavailable,
    'PRICE_CHANGED' => l.errorPriceChanged,
    'PAYMENT_MISMATCH' => l.errorPaymentMismatch,
    _ => error.message.isNotEmpty ? error.message : l.errorGeneric,
  };
}

void showMessage(BuildContext context, String text, {bool error = false}) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        content: Text(text),
        backgroundColor: error ? Theme.of(context).colorScheme.error : null,
        behavior: SnackBarBehavior.floating,
      ),
    );
}

/// Tile colours for the dashboard's item colour tokens (apps/api ITEM_COLORS).
Color itemColor(String token) => switch (token) {
  'red' => const Color(0xFFFECACA),
  'orange' => const Color(0xFFFED7AA),
  'amber' => const Color(0xFFFDE68A),
  'yellow' => const Color(0xFFFEF08A),
  'lime' => const Color(0xFFD9F99D),
  'green' => const Color(0xFFBBF7D0),
  'teal' => const Color(0xFF99F6E4),
  'sky' => const Color(0xFFBAE6FD),
  'blue' => const Color(0xFFBFDBFE),
  'indigo' => const Color(0xFFC7D2FE),
  'violet' => const Color(0xFFDDD6FE),
  'pink' => const Color(0xFFFBCFE8),
  'brown' => const Color(0xFFE7D3C1),
  _ => const Color(0xFFE5E7EB),
};

/// Touch targets ≥ 48 dp (SPEC §11.4).
const minTouch = Size(48, 48);

/// Accepts "1,5" or "1.5"; returns the API's decimal string (D-028) or null.
String? parseQtyInput(String input) {
  final s = input.trim().replaceAll(',', '.');
  if (!RegExp(r'^\d{1,11}(\.\d{1,3})?$').hasMatch(s)) return null;
  return s;
}

/// "1500.000" → "1.500", "7.500" → "7,5" (Indonesian grouping).
String formatQty(String qty, String unit) {
  final negative = qty.startsWith('-');
  final parts = qty.replaceFirst('-', '').split('.');
  final whole = parts[0];
  final frac = parts.length > 1 ? parts[1].replaceFirst(RegExp(r'0+$'), '') : '';
  final buf = StringBuffer();
  for (var i = 0; i < whole.length; i++) {
    if (i > 0 && (whole.length - i) % 3 == 0) buf.write('.');
    buf.write(whole[i]);
  }
  return '${negative ? '-' : ''}$buf${frac.isEmpty ? '' : ',$frac'} $unit';
}
