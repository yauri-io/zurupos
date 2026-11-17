import 'models.dart';

/// An API error (SPEC §9 `{error: {code, message, details}}`), or `NETWORK` when
/// the server couldn't be reached (no status).
class ApiException implements Exception {
  const ApiException(this.code, {this.status, this.message = '', this.details = const {}});

  final String code;
  final int? status;
  final String message;
  final Json details;

  bool get isNetwork => code == 'NETWORK';

  /// The request may or may not have reached the server: retrying is the only safe move.
  bool get isRetryable => isNetwork || (status != null && status! >= 500);

  @override
  String toString() => 'ApiException($code, $status, $message)';
}
