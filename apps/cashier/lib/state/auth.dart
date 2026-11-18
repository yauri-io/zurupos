// Device pairing and the staff PIN session (SPEC §5.2, §5.3).
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_error.dart';
import '../api/models.dart';
import 'menu.dart';
import 'printing.dart';
import 'providers.dart';

class UnsentOrderException implements Exception {
  const UnsentOrderException();
}

sealed class AuthState {
  const AuthState();
}

class AuthLoading extends AuthState {
  const AuthLoading();
}

class Unpaired extends AuthState {
  const Unpaired();
}

/// Paired, nobody signed in: the staff picker.
class Paired extends AuthState {
  const Paired();
}

class SignedIn extends AuthState {
  const SignedIn(this.user);
  final StaffMember user;
}

class AuthController extends Notifier<AuthState> {
  @override
  AuthState build() {
    Future.microtask(_load);
    return const AuthLoading();
  }

  Future<void> _load() async {
    final token = await ref.read(tokenStoreProvider).read();
    ref.read(credentialsProvider).deviceToken = token;
    state = token == null ? const Unpaired() : const Paired();
  }

  Future<String> pair({required String email, required String password, required String deviceName}) async {
    final r = await ref.read(apiProvider).pair(email: email, password: password, deviceName: deviceName);
    await ref.read(tokenStoreProvider).write(r.deviceToken);
    ref.read(credentialsProvider).deviceToken = r.deviceToken;
    state = const Paired();
    return r.shopName;
  }

  /// Throws [ApiException] (`UNAUTHENTICATED` wrong PIN, `PIN_LOCKED`, `RATE_LIMITED`).
  Future<void> signIn(String userId, String pin) async {
    final r = await ref.read(apiProvider).pinLogin(userId, pin);
    ref.read(credentialsProvider).staffToken = r.staffToken;
    state = SignedIn(r.user);
  }

  /// *Switch user* and idle lock: revoke the session on the server too (best effort).
  Future<void> signOut() async {
    final creds = ref.read(credentialsProvider);
    if (creds.staffToken != null) {
      try {
        await ref.read(apiProvider).logout();
      } on ApiException {
        // Offline or already expired: the 12 h expiry ends it server-side.
      }
    }
    creds.staffToken = null;
    if (state is SignedIn) state = const Paired();
  }

  /// D-048: an owner/manager unpairs this device, e.g. to pair it to another shop.
  /// Refused while an order is still waiting to be sent: it belongs to this shop.
  /// Throws [ApiException]; [UnsentOrderException] if an order is pending.
  Future<void> unpair() async {
    if (await ref.read(localStoreProvider).pendingOrder() != null) throw const UnsentOrderException();
    await ref.read(apiProvider).unpairDevice();
    await forgetDevice();
  }

  /// The device token was rejected (revoked in the dashboard) or unpaired: pair again.
  /// A pending order is kept: re-pairing to the same shop retries it with the same id.
  Future<void> forgetDevice() async {
    await ref.read(localStoreProvider).clearShopData();
    ref.invalidate(menuProvider);
    ref.invalidate(printQueueProvider);
    await ref.read(tokenStoreProvider).clear();
    final creds = ref.read(credentialsProvider);
    creds.deviceToken = null;
    creds.staffToken = null;
    state = const Unpaired();
  }

  /// A request came back 401: decide whether the staff session or the device ended.
  Future<void> handleUnauthenticated() async {
    ref.read(credentialsProvider).staffToken = null;
    try {
      await ref.read(apiProvider).staff();
      state = const Paired();
    } on ApiException catch (e) {
      if (e.status == 401) {
        await forgetDevice();
      } else {
        state = const Paired();
      }
    }
  }
}

final authProvider = NotifierProvider<AuthController, AuthState>(AuthController.new);

/// The signed-in user, or null.
final currentUserProvider = Provider<StaffMember?>((ref) {
  final s = ref.watch(authProvider);
  return s is SignedIn ? s.user : null;
});
