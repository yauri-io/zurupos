// Payment screen rules (SPEC §6.4, §11.1 #5) as pure functions.
import '../api/models.dart';
import 'pricing.dart';

class PaymentDraft {
  const PaymentDraft({
    required this.method,
    required this.amount,
    this.tendered,
    this.provider,
    this.reference,
  });

  final String method;
  final int amount;

  /// Cash only (D-025).
  final int? tendered;
  final String? provider;
  final String? reference;

  bool get isCash => method == 'cash';
  int get change => isCash && tendered != null ? tendered! - amount : 0;

  Json toJson() => {
    'method': method,
    'amount': amount,
    if (isCash) 'tendered': tendered,
    if (!isCash && provider != null && provider!.trim().isNotEmpty) 'provider': provider!.trim(),
    if (!isCash && reference != null && reference!.trim().isNotEmpty) 'reference': reference!.trim(),
  };

  PaymentInput get input => PaymentInput(method: method, amount: amount, tendered: isCash ? tendered : null);
}

int paidSoFar(List<PaymentDraft> payments) => payments.fold(0, (s, p) => s + p.amount);

/// What the next payment line pre-fills with (§6.4 split helper).
int remainingOf(int total, List<PaymentDraft> payments) {
  final r = total - paidSoFar(payments);
  return r < 0 ? 0 : r;
}

/// Exact amount first, then common notes that cover it (next Rp 5.000, Rp 10.000, Rp 50.000, Rp 100.000).
List<int> quickCashAmounts(int due) {
  if (due <= 0) return const [];
  final amounts = <int>{due};
  for (final step in const [5000, 10000, 50000, 100000]) {
    final rounded = ((due + step - 1) ~/ step) * step;
    if (rounded > due) amounts.add(rounded);
    if (amounts.length >= 4) break;
  }
  return amounts.toList()..sort();
}

/// *Complete* is enabled only when the payments exactly cover the total.
PaymentCheck checkDrafts(int total, List<PaymentDraft> payments, List<String> enabledMethods) =>
    checkPayments(total, [for (final p in payments) p.input], enabledMethods);

/// Provider chips for non-cash methods (optional, free text allowed).
const providerSuggestions = <String, List<String>>{
  'qris': ['GoPay', 'OVO', 'DANA', 'ShopeePay', 'LinkAja'],
  'debit': ['BCA', 'Mandiri', 'BRI', 'BNI'],
  'credit': ['BCA', 'Mandiri', 'BRI', 'BNI'],
  'transfer': ['BCA', 'Mandiri', 'BRI', 'BNI'],
};
