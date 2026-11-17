// The cached bootstrap (SPEC §11.2): from local storage first, then refreshed
// on staff login, every 5 min, and on PRICE_CHANGED.
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_error.dart';
import '../api/models.dart';
import 'connection.dart';
import 'providers.dart';

class MenuController extends AsyncNotifier<Bootstrap?> {
  @override
  Future<Bootstrap?> build() async {
    final cached = await ref.read(localStoreProvider).menu();
    return cached == null ? null : Bootstrap.fromJson(cached.payload);
  }

  /// Returns the error, if any; the cached menu stays in place on failure.
  Future<ApiException?> refresh() async {
    final current = state.value;
    try {
      final fresh = await ref.read(apiProvider).bootstrapJson(since: current?.menuVersion);
      ref.read(onlineProvider.notifier).report(null);
      if (fresh == null) return null;
      final parsed = Bootstrap.fromJson(fresh);
      await ref.read(localStoreProvider).saveMenu(parsed.menuVersion, fresh);
      state = AsyncData(parsed);
      return null;
    } on ApiException catch (e) {
      ref.read(onlineProvider.notifier).report(e);
      return e;
    }
  }

  /// Sold-out toggle (SPEC §11.1 #9): server first, then the fresh menu.
  Future<void> setAvailability(String itemId, bool available) async {
    await ref.read(apiProvider).setAvailability(itemId, available);
    await refresh();
  }
}

final menuProvider = AsyncNotifierProvider<MenuController, Bootstrap?>(MenuController.new);
