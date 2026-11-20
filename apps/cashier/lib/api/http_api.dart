import 'package:dio/dio.dart';

import 'api_error.dart';
import 'models.dart';
import 'zuru_api.dart';

/// Tokens the HTTP client attaches. The device token lives in secure storage;
/// the staff token only in memory (a restart asks for the PIN again).
class Credentials {
  String? deviceToken;
  String? staffToken;
  String locale = 'id';
}

class HttpZuruApi implements ZuruApi {
  HttpZuruApi({required String baseUrl, required this.credentials, Dio? dio})
    : _dio =
          dio ??
          Dio(BaseOptions(baseUrl: '$baseUrl/v1', connectTimeout: _timeout, receiveTimeout: _timeout)) {
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          // D-026: on every request, including pairing.
          options.headers['X-Requested-With'] = 'zuru';
          options.headers['Accept-Language'] = credentials.locale;
          final device = credentials.deviceToken;
          final staff = credentials.staffToken;
          if (device != null) options.headers['X-Device-Token'] = device;
          if (staff != null) options.headers['Authorization'] = 'Bearer $staff';
          handler.next(options);
        },
      ),
    );
  }

  static const _timeout = Duration(seconds: 10);

  final Dio _dio;
  final Credentials credentials;

  Future<Response<dynamic>> _send(String method, String path, {Object? body, Json? query}) async {
    try {
      return await _dio.request<dynamic>(
        path,
        data: body,
        queryParameters: query,
        options: Options(method: method, validateStatus: (s) => s != null && s < 400),
      );
    } on DioException catch (e) {
      final res = e.response;
      if (res == null) throw ApiException('NETWORK', message: e.message ?? '');
      final error = res.data is Map ? (res.data as Json)['error'] : null;
      if (error is Map) {
        throw ApiException(
          error['code'] as String? ?? 'UNKNOWN',
          status: res.statusCode,
          message: error['message'] as String? ?? '',
          details: (error['details'] as Json?) ?? const {},
        );
      }
      throw ApiException('UNKNOWN', status: res.statusCode);
    }
  }

  Future<Json> _json(String method, String path, {Object? body, Json? query}) async =>
      (await _send(method, path, body: body, query: query)).data as Json;

  @override
  Future<({String deviceToken, String shopName})> pair({
    required String email,
    required String password,
    required String deviceName,
  }) async {
    final j = await _json(
      'POST',
      '/devices/pair',
      body: {'email': email, 'password': password, 'device_name': deviceName},
    );
    return (deviceToken: j['device_token'] as String, shopName: (j['shop'] as Json)['name'] as String);
  }

  @override
  Future<List<StaffMember>> staff() async => ((await _json('GET', '/device/staff'))['staff'] as List<dynamic>)
      .cast<Json>()
      .map(StaffMember.fromJson)
      .toList();

  @override
  Future<({String staffToken, StaffMember user})> pinLogin(String userId, String pin) async {
    final j = await _json('POST', '/device/sessions', body: {'user_id': userId, 'pin': pin});
    return (staffToken: j['staff_token'] as String, user: StaffMember.fromJson(j['user'] as Json));
  }

  @override
  Future<void> heartbeat() => _send('POST', '/device/heartbeat', body: <String, Object>{});

  @override
  Future<void> logout() => _send('DELETE', '/device/sessions/current');

  @override
  Future<void> unpairDevice() => _send('DELETE', '/device');

  @override
  Future<Json?> bootstrapJson({String? since}) async {
    final res = await _send('GET', '/device/bootstrap', query: since == null ? null : {'since': since});
    if (res.statusCode == 304) return null;
    return res.data as Json;
  }

  @override
  Future<ShopSettings> settings() async => ShopSettings.fromJson(await _json('GET', '/settings'));

  @override
  Future<Order> createOrder(Json payload) async =>
      Order.fromJson(await _json('POST', '/orders', body: payload));

  @override
  Future<List<OrderSummary>> today() async =>
      ((await _json('GET', '/orders/today'))['orders'] as List<dynamic>)
          .cast<Json>()
          .map(OrderSummary.fromJson)
          .toList();

  @override
  Future<Order> order(String id) async => Order.fromJson(await _json('GET', '/orders/$id'));

  @override
  Future<Order> voidOrder(String id, {required String reason, required bool restock, Json? approval}) async =>
      Order.fromJson(
        await _json(
          'POST',
          '/orders/$id/void',
          body: {'reason': reason, 'restock': restock, 'approval': ?approval},
        ),
      );

  @override
  Future<void> setAvailability(String itemId, bool available) =>
      _send('PATCH', '/items/$itemId/availability', body: {'is_available': available});

  @override
  Future<List<Ingredient>> ingredients() async =>
      ((await _json('GET', '/ingredients'))['ingredients'] as List<dynamic>)
          .cast<Json>()
          .map(Ingredient.fromJson)
          .toList();

  @override
  Future<void> stockIn(Json body) => _send('POST', '/stock/in', body: body);

  @override
  Future<void> waste(Json body) => _send('POST', '/stock/waste', body: body);

  @override
  Future<void> count(Json body) => _send('POST', '/stock/count', body: body);

  @override
  Future<DayReport> dayReport(String day) async {
    final range = {'from': day, 'to': day};
    final [summary, payments, items, voids] = await Future.wait([
      for (final r in ['summary', 'payments', 'items', 'voids']) _json('GET', '/reports/$r', query: range),
    ]);
    return DayReport.fromJson(day: day, summary: summary, payments: payments, items: items, voids: voids);
  }
}
