// D-053: expected API failures never reach Sentry; real crashes do, without
// screenshots or the view hierarchy.
import 'package:flutter_test/flutter_test.dart';
import 'package:sentry_flutter/sentry_flutter.dart';
import 'package:zurupos_cashier/api/api_error.dart';
import 'package:zurupos_cashier/observability/sentry.dart';

void main() {
  SentryEvent? filter(Object error) => filterEvent(SentryEvent(throwable: error), Hint());

  test('drops 4xx answers and lost connections', () {
    expect(filter(const ApiException('VALIDATION', status: 400)), isNull);
    expect(filter(const ApiException('NOT_FOUND', status: 404)), isNull);
    expect(filter(const ApiException('NETWORK')), isNull);
  });

  test('keeps 5xx answers and everything else', () {
    expect(filter(const ApiException('INTERNAL', status: 500)), isNotNull);
    expect(filter(StateError('boom')), isNotNull);
  });

  test('screenshots and the view hierarchy stay off', () {
    final options = SentryFlutterOptions();
    expect(options.attachScreenshot, isFalse);
    // ignore: experimental_member_use
    expect(options.attachViewHierarchy, isFalse);
  });
}
