// Wiring: the I/O dependencies the rest of the app reads. Tests override these.
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../api/http_api.dart';
import '../api/zuru_api.dart';
import '../data/database.dart';
import '../data/local_store.dart';
import '../data/token_store.dart';

/// Set at build time: `flutter run --dart-define=API_BASE_URL=http://192.168.1.10:4000`.
/// The default reaches the host's localhost from the Android emulator.
const apiBaseUrl = String.fromEnvironment('API_BASE_URL', defaultValue: 'http://10.0.2.2:4000');

final credentialsProvider = Provider<Credentials>((ref) => Credentials());

final apiProvider = Provider<ZuruApi>(
  (ref) => HttpZuruApi(baseUrl: apiBaseUrl, credentials: ref.watch(credentialsProvider)),
);

final localStoreProvider = Provider<LocalStore>((ref) => DriftLocalStore(AppDatabase()));

final tokenStoreProvider = Provider<TokenStore>((ref) => SecureTokenStore());

/// A fresh client order id (UUID v4). Overridable so tests are deterministic.
final newIdProvider = Provider<String Function()>((ref) => const Uuid().v4);

/// The current time. Overridable so tests can fix the business date.
final clockProvider = Provider<DateTime Function()>((ref) => DateTime.now);
