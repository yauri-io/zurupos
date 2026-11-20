// SPEC §12.1 business dates, same cases as apps/dashboard/test/dates.test.ts.
import 'package:flutter_test/flutter_test.dart';
import 'package:zurupos_cashier/domain/business_day.dart';

void main() {
  test('the business date is the local date in the shop’s time zone', () {
    // 17:30 UTC is 00:30 the next day in Jakarta (UTC+7).
    final now = DateTime.utc(2026, 11, 20, 17, 30);
    expect(businessToday(now, 'Asia/Jakarta', 0), '2026-11-21');
    expect(businessToday(now, 'Asia/Makassar', 0), '2026-11-21');
    expect(businessToday(DateTime.utc(2026, 11, 20, 16, 59), 'Asia/Jakarta', 0), '2026-11-20');
  });

  test('sales before the cutoff hour belong to the previous day', () {
    final now = DateTime.utc(2026, 11, 20, 17, 30); // 00:30 WIB
    expect(businessToday(now, 'Asia/Jakarta', 2), '2026-11-20');
    expect(businessToday(DateTime.utc(2026, 11, 20, 19), 'Asia/Jakarta', 2), '2026-11-21'); // 02:00 WIB
  });

  test('addDays crosses months and years', () {
    expect(addDays('2026-12-01', -1), '2026-11-30');
    expect(addDays('2027-01-01', -1), '2026-12-31');
    expect(addDays('2028-02-28', 1), '2028-02-29');
  });
}
