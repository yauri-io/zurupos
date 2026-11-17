// The app's one IDR formatter (CLAUDE.md): whole rupiah → "Rp 25.000".
// Matches apps/dashboard/app/utils/money.ts.

String formatIdr(int rupiah) {
  final digits = rupiah.abs().toString();
  final buf = StringBuffer();
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) buf.write('.');
    buf.write(digits[i]);
  }
  return '${rupiah < 0 ? '-' : ''}Rp $buf';
}

/// Basis points → "10%", "2,5%".
String formatBps(int bps) {
  final whole = bps ~/ 100;
  final frac = (bps % 100).toString().padLeft(2, '0').replaceFirst(RegExp(r'0+$'), '');
  return '$whole${frac.isEmpty ? '' : ',$frac'}%';
}

/// What a person typed ("25.000", "Rp 25000") → whole rupiah, or null.
int? parseRupiah(String input) {
  final digits = input
      .replaceFirst(RegExp(r'^\s*rp\.?\s*', caseSensitive: false), '')
      .replaceAll(RegExp(r'[.\s]'), '');
  if (!RegExp(r'^\d{1,12}$').hasMatch(digits)) return null;
  return int.parse(digits);
}
