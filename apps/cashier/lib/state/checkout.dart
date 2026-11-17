// Completing an order (SPEC §11.2): write the payload locally first, then POST.
// A network failure keeps it pending; the cashier retries with the same
// client_order_id and can't start another paid order until it resolves.
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_error.dart';
import '../api/models.dart';
import '../data/local_store.dart';
import 'auth.dart';
import 'cart.dart';
import 'connection.dart';
import 'menu.dart';
import 'printing.dart';
import 'providers.dart';

class CheckoutState {
  const CheckoutState({this.pending, this.sending = false});

  /// An order the server hasn't accepted yet. Blocks new paid orders.
  final PendingOrder? pending;
  final bool sending;
}

sealed class SendResult {
  const SendResult();
}

class Sent extends SendResult {
  const Sent(this.order);
  final Order order;
}

/// Not reached, or the server failed: still pending, retry later.
class StillPending extends SendResult {
  const StillPending(this.error);
  final ApiException error;
}

/// The server refused it (e.g. PRICE_CHANGED, sold out). It's dropped; fix the cart and pay again.
class Rejected extends SendResult {
  const Rejected(this.error);
  final ApiException error;
}

class CheckoutController extends Notifier<CheckoutState> {
  @override
  CheckoutState build() {
    Future.microtask(_load);
    return const CheckoutState();
  }

  Future<void> _load() async {
    final p = await ref.read(localStoreProvider).pendingOrder();
    if (ref.mounted) state = CheckoutState(pending: p);
  }

  Future<SendResult> complete(Json payload) async {
    final id = payload['client_order_id'] as String;
    await ref.read(localStoreProvider).savePending(id, payload);
    state = CheckoutState(
      pending: PendingOrder(clientOrderId: id, payload: payload, createdAt: DateTime.now()),
    );
    return retry();
  }

  Future<SendResult> retry() async {
    final p = state.pending;
    if (p == null) throw StateError('nothing pending');
    final store = ref.read(localStoreProvider);
    state = CheckoutState(pending: p, sending: true);
    try {
      final order = await ref.read(apiProvider).createOrder(p.payload);
      ref.read(onlineProvider.notifier).report(null);
      await store.resolvePending(p.clientOrderId, synced: true);
      state = const CheckoutState();
      // After commit, never before; a print failure can't affect the order (SPEC §11.3).
      ref.read(printQueueProvider.notifier).autoPrint(order);
      return Sent(order);
    } on ApiException catch (e) {
      ref.read(onlineProvider.notifier).report(e);
      if (e.isRetryable) {
        await store.markPendingError(p.clientOrderId, e.code);
        state = CheckoutState(pending: p);
        return StillPending(e);
      }
      if (e.status == 401) {
        // Not accepted; keep it for whoever signs in next to retry.
        state = CheckoutState(pending: p);
        await ref.read(authProvider.notifier).handleUnauthenticated();
        return StillPending(e);
      }
      await store.resolvePending(p.clientOrderId, synced: false);
      state = const CheckoutState();
      if (e.code == 'PRICE_CHANGED' || e.code == 'ITEM_UNAVAILABLE') {
        await ref.read(menuProvider.notifier).refresh();
        final menu = ref.read(menuProvider).value;
        if (menu != null) ref.read(cartProvider.notifier).reprice(menu);
      }
      return Rejected(e);
    }
  }
}

final checkoutProvider = NotifierProvider<CheckoutController, CheckoutState>(CheckoutController.new);
