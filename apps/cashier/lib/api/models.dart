// JSON shapes from the API (packages/api-client/openapi.json is the contract).
// Money is whole rupiah (int); quantities are decimal strings (D-028).

typedef Json = Map<String, dynamic>;

List<T> _list<T>(Object? value, T Function(Json) parse) =>
    (value as List<dynamic>).cast<Json>().map(parse).toList(growable: false);

enum Role { owner, manager, cashier, employee }

class StaffMember {
  const StaffMember({required this.id, required this.name, required this.role});

  factory StaffMember.fromJson(Json j) => StaffMember(
    id: j['id'] as String,
    name: j['name'] as String,
    role: Role.values.byName(j['role'] as String),
  );

  final String id;
  final String name;
  final Role role;

  bool get canApprove => role == Role.owner || role == Role.manager;
  bool get takesOrders => role != Role.employee;
}

class ShopSettings {
  const ShopSettings({
    required this.name,
    required this.address,
    required this.phone,
    required this.timezone,
    required this.businessDayCutoffHour,
    required this.receiptHeader,
    required this.receiptFooter,
    required this.serviceChargeEnabled,
    required this.serviceChargeBps,
    required this.taxEnabled,
    required this.taxName,
    required this.taxBps,
    required this.taxOnServiceCharge,
    required this.enabledPaymentMethods,
    required this.idleLockMinutes,
  });

  factory ShopSettings.fromJson(Json j) => ShopSettings(
    name: j['name'] as String,
    address: j['address'] as String?,
    phone: j['phone'] as String?,
    timezone: j['timezone'] as String,
    businessDayCutoffHour: j['business_day_cutoff_hour'] as int,
    receiptHeader: j['receipt_header'] as String?,
    receiptFooter: j['receipt_footer'] as String?,
    serviceChargeEnabled: j['service_charge_enabled'] as bool,
    serviceChargeBps: j['service_charge_bps'] as int,
    taxEnabled: j['tax_enabled'] as bool,
    taxName: j['tax_name'] as String,
    taxBps: j['tax_bps'] as int,
    taxOnServiceCharge: j['tax_on_service_charge'] as bool,
    enabledPaymentMethods: (j['enabled_payment_methods'] as List<dynamic>).cast<String>(),
    idleLockMinutes: j['idle_lock_minutes'] as int,
  );

  final String name;
  final String? address;
  final String? phone;
  final String timezone;
  final int businessDayCutoffHour;
  final String? receiptHeader;
  final String? receiptFooter;
  final bool serviceChargeEnabled;
  final int serviceChargeBps;
  final bool taxEnabled;
  final String taxName;
  final int taxBps;
  final bool taxOnServiceCharge;
  final List<String> enabledPaymentMethods;
  final int idleLockMinutes;
}

class Category {
  const Category({required this.id, required this.name});
  factory Category.fromJson(Json j) => Category(id: j['id'] as String, name: j['name'] as String);

  final String id;
  final String name;
}

class MenuItem {
  const MenuItem({
    required this.id,
    required this.categoryId,
    required this.name,
    required this.price,
    required this.color,
    required this.isAvailable,
    required this.groupIds,
  });

  factory MenuItem.fromJson(Json j) => MenuItem(
    id: j['id'] as String,
    categoryId: j['category_id'] as String,
    name: j['name'] as String,
    price: j['price'] as int,
    color: j['color'] as String,
    isAvailable: j['is_available'] as bool,
    groupIds: (j['modifier_group_ids'] as List<dynamic>).cast<String>(),
  );

  final String id;
  final String categoryId;
  final String name;
  final int price;
  final String color;
  final bool isAvailable;

  /// In modifier-sheet order (D-033).
  final List<String> groupIds;
}

class ModifierOption {
  const ModifierOption({
    required this.id,
    required this.name,
    required this.priceDelta,
    required this.isDefault,
  });

  factory ModifierOption.fromJson(Json j) => ModifierOption(
    id: j['id'] as String,
    name: j['name'] as String,
    priceDelta: j['price_delta'] as int,
    isDefault: j['is_default'] as bool,
  );

  final String id;
  final String name;
  final int priceDelta;
  final bool isDefault;
}

class ModifierGroup {
  const ModifierGroup({
    required this.id,
    required this.name,
    required this.single,
    required this.minSelect,
    required this.maxSelect,
    required this.options,
  });

  factory ModifierGroup.fromJson(Json j) => ModifierGroup(
    id: j['id'] as String,
    name: j['name'] as String,
    single: j['selection'] == 'single',
    minSelect: j['min_select'] as int,
    maxSelect: j['max_select'] as int,
    options: _list(j['options'], ModifierOption.fromJson),
  );

  final String id;
  final String name;
  final bool single;
  final int minSelect;
  final int maxSelect;
  final List<ModifierOption> options;

  bool get required => minSelect >= 1;
}

class PresetDiscount {
  const PresetDiscount({
    required this.id,
    required this.name,
    required this.percent,
    required this.value,
    required this.orderScope,
  });

  factory PresetDiscount.fromJson(Json j) => PresetDiscount(
    id: j['id'] as String,
    name: j['name'] as String,
    percent: j['kind'] == 'percent',
    value: j['value'] as int,
    orderScope: j['scope'] == 'order',
  );

  final String id;
  final String name;
  final bool percent;

  /// Basis points for percent, rupiah for fixed.
  final int value;
  final bool orderScope;
}

class Bootstrap {
  const Bootstrap({
    required this.menuVersion,
    required this.settings,
    required this.categories,
    required this.items,
    required this.groups,
    required this.discounts,
  });

  factory Bootstrap.fromJson(Json j) => Bootstrap(
    menuVersion: j['menu_version'] as String,
    settings: ShopSettings.fromJson(j['settings'] as Json),
    categories: _list(j['categories'], Category.fromJson),
    items: _list(j['items'], MenuItem.fromJson),
    groups: {for (final g in _list(j['modifier_groups'], ModifierGroup.fromJson)) g.id: g},
    discounts: _list(j['discounts'], PresetDiscount.fromJson),
  );

  final String menuVersion;
  final ShopSettings settings;
  final List<Category> categories;
  final List<MenuItem> items;
  final Map<String, ModifierGroup> groups;
  final List<PresetDiscount> discounts;

  /// The item's groups in sheet order; groups that no longer exist are skipped.
  List<ModifierGroup> groupsOf(MenuItem item) => [for (final id in item.groupIds) ?groups[id]];
}

class UserRef {
  const UserRef({required this.id, required this.name});
  factory UserRef.fromJson(Json j) => UserRef(id: j['id'] as String, name: j['name'] as String);

  final String id;
  final String name;
}

class AppliedDiscount {
  const AppliedDiscount({
    required this.name,
    required this.percent,
    required this.value,
    required this.amount,
  });

  factory AppliedDiscount.fromJson(Json j) => AppliedDiscount(
    name: j['name'] as String?,
    percent: j['kind'] == 'percent',
    value: j['value'] as int,
    amount: j['amount'] as int,
  );

  /// Null for a custom (non-preset) discount (D-036).
  final String? name;
  final bool percent;
  final int value;
  final int amount;
}

class OrderLineModifier {
  const OrderLineModifier({required this.groupName, required this.optionName, required this.priceDelta});

  factory OrderLineModifier.fromJson(Json j) => OrderLineModifier(
    groupName: j['group_name'] as String,
    optionName: j['option_name'] as String,
    priceDelta: j['price_delta'] as int,
  );

  final String groupName;
  final String optionName;
  final int priceDelta;
}

class OrderLine {
  const OrderLine({
    required this.itemName,
    required this.qty,
    required this.unitPrice,
    required this.lineGross,
    required this.lineNet,
    required this.discount,
    required this.note,
    required this.modifiers,
  });

  factory OrderLine.fromJson(Json j) => OrderLine(
    itemName: j['item_name'] as String,
    qty: j['qty'] as int,
    unitPrice: j['unit_price'] as int,
    lineGross: j['line_gross'] as int,
    lineNet: j['line_net'] as int,
    discount: j['discount'] == null ? null : AppliedDiscount.fromJson(j['discount'] as Json),
    note: j['note'] as String?,
    modifiers: _list(j['modifiers'], OrderLineModifier.fromJson),
  );

  final String itemName;
  final int qty;
  final int unitPrice;
  final int lineGross;
  final int lineNet;
  final AppliedDiscount? discount;
  final String? note;
  final List<OrderLineModifier> modifiers;
}

class OrderPayment {
  const OrderPayment({
    required this.method,
    required this.amount,
    required this.tendered,
    required this.provider,
    required this.reference,
  });

  factory OrderPayment.fromJson(Json j) => OrderPayment(
    method: j['method'] as String,
    amount: j['amount'] as int,
    tendered: j['tendered'] as int?,
    provider: j['provider'] as String?,
    reference: j['reference'] as String?,
  );

  final String method;
  final int amount;
  final int? tendered;
  final String? provider;
  final String? reference;
}

class VoidInfo {
  const VoidInfo({required this.voidedAt, required this.voidedBy, required this.reason});

  factory VoidInfo.fromJson(Json j) => VoidInfo(
    voidedAt: DateTime.parse(j['voided_at'] as String),
    voidedBy: UserRef.fromJson(j['voided_by'] as Json),
    reason: j['reason'] as String,
  );

  final DateTime voidedAt;
  final UserRef voidedBy;
  final String reason;
}

/// `POST /orders` and `GET /orders/:id`.
class Order {
  const Order({
    required this.id,
    required this.clientOrderId,
    required this.orderNumber,
    required this.voided,
    required this.orderType,
    required this.customerName,
    required this.subtotal,
    required this.itemDiscountTotal,
    required this.orderDiscount,
    required this.serviceChargeBps,
    required this.serviceChargeAmount,
    required this.taxName,
    required this.taxBps,
    required this.taxAmount,
    required this.total,
    required this.changeDue,
    required this.createdBy,
    required this.paidAt,
    required this.lines,
    required this.payments,
    required this.voidInfo,
  });

  factory Order.fromJson(Json j) => Order(
    id: j['id'] as String,
    clientOrderId: j['client_order_id'] as String,
    orderNumber: j['order_number'] as int,
    voided: j['status'] == 'voided',
    orderType: j['order_type'] as String,
    customerName: j['customer_name'] as String?,
    subtotal: j['subtotal'] as int,
    itemDiscountTotal: j['item_discount_total'] as int,
    orderDiscount: j['order_discount'] == null ? null : AppliedDiscount.fromJson(j['order_discount'] as Json),
    serviceChargeBps: j['service_charge_bps'] as int,
    serviceChargeAmount: j['service_charge_amount'] as int,
    taxName: j['tax_name'] as String?,
    taxBps: j['tax_bps'] as int,
    taxAmount: j['tax_amount'] as int,
    total: j['total'] as int,
    changeDue: j['change_due'] as int,
    createdBy: UserRef.fromJson(j['created_by'] as Json),
    paidAt: DateTime.parse(j['paid_at'] as String),
    lines: _list(j['lines'], OrderLine.fromJson),
    payments: _list(j['payments'], OrderPayment.fromJson),
    voidInfo: j['void'] == null ? null : VoidInfo.fromJson(j['void'] as Json),
  );

  final String id;
  final String clientOrderId;
  final int orderNumber;
  final bool voided;
  final String orderType;
  final String? customerName;
  final int subtotal;
  final int itemDiscountTotal;
  final AppliedDiscount? orderDiscount;
  final int serviceChargeBps;
  final int serviceChargeAmount;
  final String? taxName;
  final int taxBps;
  final int taxAmount;
  final int total;
  final int changeDue;
  final UserRef createdBy;
  final DateTime paidAt;
  final List<OrderLine> lines;
  final List<OrderPayment> payments;
  final VoidInfo? voidInfo;
}

/// `GET /orders/today` entry. Employees get no payment methods (PRD §6).
class OrderSummary {
  const OrderSummary({
    required this.id,
    required this.orderNumber,
    required this.voided,
    required this.orderType,
    required this.customerName,
    required this.total,
    required this.paidAt,
    required this.createdBy,
    required this.items,
    required this.paymentMethods,
  });

  factory OrderSummary.fromJson(Json j) => OrderSummary(
    id: j['id'] as String,
    orderNumber: j['order_number'] as int,
    voided: j['status'] == 'voided',
    orderType: j['order_type'] as String,
    customerName: j['customer_name'] as String?,
    total: j['total'] as int,
    paidAt: DateTime.parse(j['paid_at'] as String),
    createdBy: UserRef.fromJson(j['created_by'] as Json),
    items: _list(j['items'], (i) {
      return (
        name: i['name'] as String,
        qty: i['qty'] as int,
        modifiers: (i['modifiers'] as List<dynamic>).cast<String>(),
        note: i['note'] as String?,
      );
    }),
    paymentMethods: (j['payment_methods'] as List<dynamic>?)?.cast<String>(),
  );

  final String id;
  final int orderNumber;
  final bool voided;
  final String orderType;
  final String? customerName;
  final int total;
  final DateTime paidAt;
  final UserRef createdBy;
  final List<({String name, int qty, List<String> modifiers, String? note})> items;
  final List<String>? paymentMethods;
}

class Ingredient {
  const Ingredient({
    required this.id,
    required this.name,
    required this.baseUnit,
    required this.stockQty,
    required this.lowStockThreshold,
    required this.purchaseUnitName,
    required this.purchaseUnitSize,
    required this.isLow,
  });

  factory Ingredient.fromJson(Json j) => Ingredient(
    id: j['id'] as String,
    name: j['name'] as String,
    baseUnit: j['base_unit'] as String,
    stockQty: j['stock_qty'] as String,
    lowStockThreshold: j['low_stock_threshold'] as String,
    purchaseUnitName: j['purchase_unit_name'] as String?,
    purchaseUnitSize: j['purchase_unit_size'] as String?,
    isLow: j['is_low'] as bool,
  );

  final String id;
  final String name;
  final String baseUnit;
  final String stockQty;
  final String lowStockThreshold;
  final String? purchaseUnitName;
  final String? purchaseUnitSize;
  final bool isLow;

  bool get isNegative => stockQty.startsWith('-');
}

/// One business day from the owner reports (SPEC §12.2): `/reports/summary`,
/// `/payments`, `/items` and `/voids` with from = to = [day]. Owner only.
class DayReport {
  const DayReport({
    required this.day,
    required this.totalCollected,
    required this.orders,
    required this.averageOrderValue,
    required this.grossSales,
    required this.discounts,
    required this.netSales,
    required this.serviceCharge,
    required this.tax,
    required this.payments,
    required this.items,
    required this.voidCount,
    required this.voidTotal,
  });

  factory DayReport.fromJson({
    required String day,
    required Json summary,
    required Json payments,
    required Json items,
    required Json voids,
  }) => DayReport(
    day: day,
    totalCollected: summary['total_collected'] as int,
    orders: summary['orders'] as int,
    averageOrderValue: summary['average_order_value'] as int,
    grossSales: summary['gross_sales'] as int,
    discounts: summary['discounts'] as int,
    netSales: summary['net_sales'] as int,
    serviceCharge: summary['service_charge'] as int,
    tax: summary['tax'] as int,
    payments: _list(
      payments['methods'],
      (m) => (
        method: m['method'] as String,
        provider: m['provider'] as String?,
        count: m['count'] as int,
        amount: m['amount'] as int,
      ),
    ),
    items: _list(items['items'], (i) => (name: i['name'] as String, qty: i['qty'] as int)),
    voidCount: voids['count'] as int,
    voidTotal: voids['total'] as int,
  );

  /// Business date, `YYYY-MM-DD`.
  final String day;
  final int totalCollected;
  final int orders;
  final int averageOrderValue;
  final int grossSales;
  final int discounts;
  final int netSales;
  final int serviceCharge;
  final int tax;
  final List<({String method, String? provider, int count, int amount})> payments;
  final List<({String name, int qty})> items;
  final int voidCount;
  final int voidTotal;
}
