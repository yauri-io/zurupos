import 'models.dart';

/// Everything the app asks the API (SPEC §9). One implementation talks HTTP
/// (`HttpZuruApi`); tests use a fake.
abstract interface class ZuruApi {
  // Device pairing and staff sessions (SPEC §5.2, §5.3): device token only.
  Future<({String deviceToken, String shopName})> pair({
    required String email,
    required String password,
    required String deviceName,
  });
  Future<List<StaffMember>> staff();
  Future<({String staffToken, StaffMember user})> pinLogin(String userId, String pin);
  Future<void> heartbeat();

  // Staff session (device + staff token).
  Future<void> logout();

  /// Null when [since] is still current (304).
  Future<Bootstrap?> bootstrap({String? since});
  Future<ShopSettings> settings();
  Future<Order> createOrder(Json payload);
  Future<List<OrderSummary>> today();
  Future<Order> order(String id);
  Future<Order> voidOrder(String id, {required String reason, required bool restock, Json? approval});
  Future<void> setAvailability(String itemId, bool available);
  Future<List<Ingredient>> ingredients();
  Future<void> stockIn(Json body);
  Future<void> waste(Json body);
  Future<void> count(Json body);
}
