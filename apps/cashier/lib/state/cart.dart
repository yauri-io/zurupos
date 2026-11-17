import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.dart';
import '../domain/cart.dart';
import 'providers.dart';

class CartController extends Notifier<Cart> {
  @override
  Cart build() => const Cart();

  void add(MenuItem item, List<ModifierOption> options, {int qty = 1, String? note}) =>
      state = state.add(ref.read(newIdProvider)(), item, options, qty: qty, note: note);

  void setQty(String key, int qty) => state = state.setQty(key, qty);
  void setNote(String key, String note) => state = state.setNote(key, note);
  void setLineDiscount(String key, DiscountChoice? d) => state = state.setLineDiscount(key, d);
  void remove(String key) => state = state.remove(key);
  void setOrderType(OrderType t) => state = state.copyWith(orderType: t);
  void setCustomerName(String name) => state = state.copyWith(customerName: name);
  void setOrderDiscount(DiscountChoice? d) =>
      state = state.copyWith(orderDiscount: d, clearOrderDiscount: d == null);
  void reprice(Bootstrap menu) => state = state.withMenu(menu);
  void clear() => state = const Cart();
}

final cartProvider = NotifierProvider<CartController, Cart>(CartController.new);
