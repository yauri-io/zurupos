import 'package:intl/intl.dart';
import 'package:timezone/data/latest_10y.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

bool _loaded = false;

/// [utc] in the shop's time zone (SPEC §11.3: receipts show tenant-tz time).
/// Unknown zones fall back to Asia/Jakarta, the default.
DateTime inShopZone(DateTime utc, String timezone) {
  if (!_loaded) {
    tzdata.initializeTimeZones();
    _loaded = true;
  }
  tz.Location loc;
  try {
    loc = tz.getLocation(timezone);
  } on tz.LocationNotFoundException {
    loc = tz.getLocation('Asia/Jakarta');
  }
  return tz.TZDateTime.from(utc, loc);
}

String receiptTime(DateTime utc, String timezone) =>
    DateFormat('dd/MM/yyyy HH:mm').format(inShopZone(utc, timezone));

String ticketTime(DateTime utc, String timezone) => DateFormat('HH:mm').format(inShopZone(utc, timezone));
