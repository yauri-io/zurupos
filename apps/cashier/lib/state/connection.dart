// Online indicator (SPEC §11.2): heartbeat every 30 s plus request outcomes.
import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_error.dart';
import 'providers.dart';

class ConnectionController extends Notifier<bool> {
  Timer? _timer;

  @override
  bool build() {
    ref.onDispose(() => _timer?.cancel());
    return true;
  }

  void start() {
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 30), (_) => check());
    unawaited(check());
  }

  void stop() => _timer?.cancel();

  Future<void> check() async {
    try {
      await ref.read(apiProvider).heartbeat();
      if (ref.mounted) state = true;
    } on ApiException catch (e) {
      if (ref.mounted) state = !e.isNetwork;
    }
  }

  /// Feed every API outcome in, so the banner reacts before the next heartbeat.
  void report(Object? error) {
    if (error == null) {
      state = true;
    } else if (error is ApiException && error.isNetwork) {
      state = false;
    }
  }
}

final onlineProvider = NotifierProvider<ConnectionController, bool>(ConnectionController.new);
