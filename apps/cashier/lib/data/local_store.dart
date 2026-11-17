import '../api/models.dart';

/// An order payload written before it's sent (SPEC §11.2), so a lost connection
/// never loses a paid order. Retries reuse the same `client_order_id`.
class PendingOrder {
  const PendingOrder({
    required this.clientOrderId,
    required this.payload,
    required this.createdAt,
    this.lastError,
  });

  final String clientOrderId;
  final Json payload;
  final DateTime createdAt;
  final String? lastError;

  int get total => payload['expected_total'] as int;
}

/// The app's local data (SPEC §11.2). `DriftLocalStore` keeps it in SQLite;
/// tests use `MemoryLocalStore`.
abstract interface class LocalStore {
  Future<({String version, Json payload})?> menu();
  Future<void> saveMenu(String version, Json payload);

  /// The oldest order not yet accepted by the server, if any.
  Future<PendingOrder?> pendingOrder();
  Future<void> savePending(String clientOrderId, Json payload);
  Future<void> markPendingError(String clientOrderId, String error);

  /// The server accepted it (or rejected it for good): it no longer blocks new orders.
  Future<void> resolvePending(String clientOrderId, {required bool synced});

  Future<String?> setting(String key);
  Future<void> setSetting(String key, String value);
}

class MemoryLocalStore implements LocalStore {
  ({String version, Json payload})? _menu;
  final _pending = <String, PendingOrder>{};
  final _settings = <String, String>{};

  @override
  Future<({String version, Json payload})?> menu() async => _menu;

  @override
  Future<void> saveMenu(String version, Json payload) async => _menu = (version: version, payload: payload);

  @override
  Future<PendingOrder?> pendingOrder() async {
    final all = _pending.values.toList()..sort((a, b) => a.createdAt.compareTo(b.createdAt));
    return all.firstOrNull;
  }

  @override
  Future<void> savePending(String clientOrderId, Json payload) async => _pending[clientOrderId] =
      PendingOrder(clientOrderId: clientOrderId, payload: payload, createdAt: DateTime.now());

  @override
  Future<void> markPendingError(String clientOrderId, String error) async {
    final p = _pending[clientOrderId];
    if (p == null) return;
    _pending[clientOrderId] = PendingOrder(
      clientOrderId: p.clientOrderId,
      payload: p.payload,
      createdAt: p.createdAt,
      lastError: error,
    );
  }

  @override
  Future<void> resolvePending(String clientOrderId, {required bool synced}) async =>
      _pending.remove(clientOrderId);

  @override
  Future<String?> setting(String key) async => _settings[key];

  @override
  Future<void> setSetting(String key, String value) async => _settings[key] = value;
}
