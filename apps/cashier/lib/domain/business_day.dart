// SPEC §12.1: business_date = local date of (now − cutoff hours) in the shop's
// time zone. Matches businessToday in apps/dashboard/app/utils/dates.ts.
import '../printing/shop_time.dart';

String _day(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// The shop's business date at [now], `YYYY-MM-DD`.
String businessToday(DateTime now, String timezone, int cutoffHour) =>
    _day(inShopZone(now.toUtc().subtract(Duration(hours: cutoffHour)), timezone));

/// [day] plus [n] days. Done on UTC midnights so no zone shift moves a day.
String addDays(String day, int n) => _day(DateTime.parse('${day}T00:00:00Z').add(Duration(days: n)));
