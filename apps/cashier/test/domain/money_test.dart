import 'package:flutter_test/flutter_test.dart';
import 'package:zurupos_cashier/domain/money.dart';

void main() {
  test('formatIdr groups thousands with dots', () {
    expect(formatIdr(0), 'Rp 0');
    expect(formatIdr(500), 'Rp 500');
    expect(formatIdr(25000), 'Rp 25.000');
    expect(formatIdr(1234567), 'Rp 1.234.567');
    expect(formatIdr(-5000), '-Rp 5.000');
    expect(formatIdr(999999999999), 'Rp 999.999.999.999');
  });

  test('formatBps', () {
    expect(formatBps(1000), '10%');
    expect(formatBps(250), '2,5%');
    expect(formatBps(1), '0,01%');
  });

  test('parseRupiah', () {
    expect(parseRupiah('25.000'), 25000);
    expect(parseRupiah('Rp 25000'), 25000);
    expect(parseRupiah(''), isNull);
    expect(parseRupiah('-5'), isNull);
    expect(parseRupiah('2,5'), isNull);
  });
}
