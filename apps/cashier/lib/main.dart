import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'observability/sentry.dart';

Future<void> main() => runWithSentry(const ProviderScope(child: ZuruApp()));
