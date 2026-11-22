import 'package:flutter/widgets.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

import '../api/api_error.dart';

/// Crash and error reporting (D-053). Off unless the app is built with
/// `--dart-define=SENTRY_DSN=...`, so debug builds and tests send nothing.
const sentryDsn = String.fromEnvironment('SENTRY_DSN');
const sentryEnvironment = String.fromEnvironment('SENTRY_ENVIRONMENT', defaultValue: 'production');

/// Drops expected failures: the server's 4xx answers, and lost connections (the
/// offline banner already tells the cashier). The API reports its own 5xx.
SentryEvent? filterEvent(SentryEvent event, Hint hint) {
  final error = event.throwable;
  if (error is ApiException && (error.isNetwork || (error.status ?? 500) < 500)) return null;
  return event;
}

/// Runs the app, inside Sentry when a DSN was given at build time. No
/// screenshots or view hierarchy: the screen shows orders, amounts and names.
/// The view hierarchy is off by Sentry's default (the option is experimental,
/// so it isn't set here); a test checks that default.
Future<void> runWithSentry(Widget app) async {
  if (sentryDsn.isEmpty) {
    runApp(app);
    return;
  }
  await SentryFlutter.init((options) {
    options.dsn = sentryDsn;
    options.environment = sentryEnvironment;
    options.sendDefaultPii = false;
    options.attachScreenshot = false;
    options.beforeSend = filterEvent;
  }, appRunner: () => runApp(app));
}
