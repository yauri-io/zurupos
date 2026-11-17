// The cart as an immutable value, priced with the shared engine (SPEC §6).
import '../api/models.dart';
import 'pricing.dart';

/// A discount the cashier picked: a preset, or (owner/manager only) a custom one.
class DiscountChoice {
  const DiscountChoice.preset(PresetDiscount this.preset) : percent = false, value = 0;
  const DiscountChoice.custom({required this.percent, required this.value}) : preset = null;

  final PresetDiscount? preset;
  final bool percent;
  final int value;

  Discount get pricing => switch (preset) {
    final p? => Discount(p.percent ? DiscountKind.percent : DiscountKind.fixed, p.value),
    null => Discount(percent ? DiscountKind.percent : DiscountKind.fixed, value),
  };

  Json toJson() => switch (preset) {
    final p? => {'discount_id': p.id},
    null => {'kind': percent ? 'percent' : 'fixed', 'value': value},
  };
}

class CartLine {
  const CartLine({
    required this.key,
    required this.item,
    required this.options,
    this.qty = 1,
    this.note,
    this.discount,
  });

  /// Local identity for editing; never sent.
  final String key;
  final MenuItem item;

  /// In sheet order.
  final List<ModifierOption> options;
  final int qty;
  final String? note;
  final DiscountChoice? discount;

  CartLine copyWith({int? qty, String? note, DiscountChoice? discount, bool clearDiscount = false}) =>
      CartLine(
        key: key,
        item: item,
        options: options,
        qty: qty ?? this.qty,
        note: note ?? this.note,
        discount: clearDiscount ? null : (discount ?? this.discount),
      );

  LineInput get pricing => LineInput(
    unitPrice: item.price,
    optionDeltas: [for (final o in options) o.priceDelta],
    qty: qty,
    discount: discount?.pricing,
  );

  /// Same item, same options, no note or discount: adding it again bumps qty.
  bool sameAs(MenuItem other, List<ModifierOption> otherOptions) =>
      item.id == other.id &&
      note == null &&
      discount == null &&
      options.length == otherOptions.length &&
      [for (var i = 0; i < options.length; i++) options[i].id == otherOptions[i].id].every((x) => x);
}

enum OrderType { takeaway, dineIn }

extension OrderTypeJson on OrderType {
  String get json => this == OrderType.dineIn ? 'dine_in' : 'takeaway';
}

const maxLineQty = 999;

class Cart {
  const Cart({
    this.lines = const [],
    this.orderType = OrderType.takeaway,
    this.customerName = '',
    this.note = '',
    this.orderDiscount,
  });

  final List<CartLine> lines;
  final OrderType orderType;
  final String customerName;
  final String note;
  final DiscountChoice? orderDiscount;

  bool get isEmpty => lines.isEmpty;
  int get itemCount => lines.fold(0, (n, l) => n + l.qty);

  Cart copyWith({
    List<CartLine>? lines,
    OrderType? orderType,
    String? customerName,
    String? note,
    DiscountChoice? orderDiscount,
    bool clearOrderDiscount = false,
  }) => Cart(
    lines: lines ?? this.lines,
    orderType: orderType ?? this.orderType,
    customerName: customerName ?? this.customerName,
    note: note ?? this.note,
    orderDiscount: clearOrderDiscount ? null : (orderDiscount ?? this.orderDiscount),
  );

  Cart add(String key, MenuItem item, List<ModifierOption> options, {int qty = 1, String? note}) {
    final trimmed = note?.trim();
    final cleanNote = trimmed == null || trimmed.isEmpty ? null : trimmed;
    if (cleanNote == null) {
      final i = lines.indexWhere((l) => l.sameAs(item, options));
      if (i >= 0) return setQty(lines[i].key, lines[i].qty + qty);
    }
    return copyWith(
      lines: [
        ...lines,
        CartLine(key: key, item: item, options: options, qty: qty.clamp(1, maxLineQty), note: cleanNote),
      ],
    );
  }

  Cart _update(String key, CartLine Function(CartLine) f) =>
      copyWith(lines: [for (final l in lines) l.key == key ? f(l) : l]);

  /// qty < 1 removes the line.
  Cart setQty(String key, int qty) =>
      qty < 1 ? remove(key) : _update(key, (l) => l.copyWith(qty: qty > maxLineQty ? maxLineQty : qty));

  Cart setNote(String key, String note) => _update(
    key,
    (l) => CartLine(
      key: l.key,
      item: l.item,
      options: l.options,
      qty: l.qty,
      note: note.trim().isEmpty ? null : note.trim(),
      discount: l.discount,
    ),
  );

  Cart setLineDiscount(String key, DiscountChoice? d) =>
      _update(key, (l) => l.copyWith(discount: d, clearDiscount: d == null));

  Cart remove(String key) => copyWith(
    lines: [
      for (final l in lines)
        if (l.key != key) l,
    ],
  );

  /// After a menu refresh (PRICE_CHANGED): current prices and names; lines whose
  /// item left the menu are dropped. Options that disappeared are dropped too, and
  /// the server's validation decides whether the line is still acceptable.
  Cart withMenu(Bootstrap menu) {
    final items = {for (final i in menu.items) i.id: i};
    final options = {
      for (final g in menu.groups.values)
        for (final o in g.options) o.id: o,
    };
    return copyWith(
      lines: [
        for (final l in lines)
          if (items[l.item.id] case final item?)
            CartLine(
              key: l.key,
              item: item,
              options: [for (final o in l.options) ?options[o.id]],
              qty: l.qty,
              note: l.note,
              discount: l.discount,
            ),
      ],
    );
  }

  PricedOrder price(ShopSettings s) => priceOrder(
    [for (final l in lines) l.pricing],
    orderDiscount?.pricing,
    PricingSettings(
      serviceChargeEnabled: s.serviceChargeEnabled,
      serviceChargeBps: s.serviceChargeBps,
      taxEnabled: s.taxEnabled,
      taxBps: s.taxBps,
      taxOnServiceCharge: s.taxOnServiceCharge,
    ),
  );

  /// The `POST /orders` body (SPEC §9). [expectedTotal] is what the device showed.
  Json toOrderPayload({
    required String clientOrderId,
    required DateTime clientCreatedAt,
    required List<Json> payments,
    required int expectedTotal,
  }) => {
    'client_order_id': clientOrderId,
    'client_created_at': clientCreatedAt.toUtc().toIso8601String(),
    'order_type': orderType.json,
    'customer_name': customerName.trim().isEmpty ? null : customerName.trim(),
    'note': note.trim().isEmpty ? null : note.trim(),
    'lines': [
      for (final l in lines)
        {
          'item_id': l.item.id,
          'qty': l.qty,
          'option_ids': [for (final o in l.options) o.id],
          'note': l.note,
          'discount': l.discount?.toJson(),
        },
    ],
    'order_discount': orderDiscount?.toJson(),
    'payments': payments,
    'expected_total': expectedTotal,
  };
}
