// An in-memory stand-in for the API, shaped like the real responses.
import 'package:zurupos_cashier/api/api_error.dart';
import 'package:zurupos_cashier/api/models.dart';
import 'package:zurupos_cashier/api/zuru_api.dart';
import 'package:zurupos_cashier/domain/pricing.dart';

import 'menu.dart';

const kasir = {'id': 'u-kasir', 'name': 'Kasir', 'role': 'cashier'};
const dina = {'id': 'u-dina', 'name': 'Dina', 'role': 'owner'};
const rina = {'id': 'u-rina', 'name': 'Rina', 'role': 'manager'};
const barista = {'id': 'u-barista', 'name': 'Barista', 'role': 'employee'};

class FakeApi implements ZuruApi {
  FakeApi({Json? menu}) : menu = menu ?? kopiBootstrapJson();

  Json menu;
  List<Json> staffList = [kasir, dina, rina, barista];
  Map<String, String> pins = {'u-kasir': '4826', 'u-dina': '2580', 'u-rina': '1357', 'u-barista': '7319'};
  final List<Json> orderPayloads = [];
  final List<({String id, Json body})> voids = [];
  final List<Json> stockCalls = [];
  final Map<String, Json> orders = {};

  /// Fail the next createOrder / pinLogin calls with these (then behave normally).
  final List<ApiException> createErrors = [];
  final List<ApiException> pinErrors = [];

  /// Set to make the device token invalid (revoked in the dashboard).
  bool revoked = false;
  bool online = true;
  int _number = 0;

  void _net() {
    if (!online) throw const ApiException('NETWORK');
  }

  @override
  Future<({String deviceToken, String shopName})> pair({
    required String email,
    required String password,
    required String deviceName,
  }) async {
    _net();
    if (password != 'kopi-susu-aren-2026') throw const ApiException('UNAUTHENTICATED', status: 401);
    return (deviceToken: 'device-token', shopName: 'Kopi Demo');
  }

  @override
  Future<List<StaffMember>> staff() async {
    _net();
    if (revoked) throw const ApiException('UNAUTHENTICATED', status: 401);
    return staffList.map(StaffMember.fromJson).toList();
  }

  @override
  Future<({String staffToken, StaffMember user})> pinLogin(String userId, String pin) async {
    _net();
    if (pinErrors.isNotEmpty) throw pinErrors.removeAt(0);
    if (pins[userId] != pin) throw const ApiException('UNAUTHENTICATED', status: 401);
    return (
      staffToken: 'staff-$userId',
      user: StaffMember.fromJson(staffList.firstWhere((s) => s['id'] == userId)),
    );
  }

  @override
  Future<void> heartbeat() async => _net();

  @override
  Future<void> logout() async {}

  bool unpaired = false;

  @override
  Future<void> unpairDevice() async {
    _net();
    unpaired = true;
  }

  @override
  Future<Json?> bootstrapJson({String? since}) async {
    _net();
    return since == menu['menu_version'] ? null : menu;
  }

  @override
  Future<ShopSettings> settings() async => ShopSettings.fromJson(menu['settings'] as Json);

  @override
  Future<Order> createOrder(Json payload) async {
    orderPayloads.add(payload);
    _net();
    if (createErrors.isNotEmpty) throw createErrors.removeAt(0);
    final existing = orders[payload['client_order_id']];
    if (existing != null) return Order.fromJson(existing);
    final b = Bootstrap.fromJson(menu);
    final items = {for (final i in b.items) i.id: i};
    final opts = {
      for (final g in b.groups.values)
        for (final o in g.options) o.id: o,
    };
    final lines = (payload['lines'] as List<dynamic>).cast<Json>();
    final s = b.settings;
    final priced = priceOrder(
      [
        for (final l in lines)
          LineInput(
            unitPrice: items[l['item_id']]!.price,
            optionDeltas: [
              for (final id in (l['option_ids'] as List<dynamic>).cast<String>()) opts[id]!.priceDelta,
            ],
            qty: l['qty'] as int,
          ),
      ],
      null,
      PricingSettings(
        serviceChargeEnabled: s.serviceChargeEnabled,
        serviceChargeBps: s.serviceChargeBps,
        taxEnabled: s.taxEnabled,
        taxBps: s.taxBps,
        taxOnServiceCharge: s.taxOnServiceCharge,
      ),
    );
    final payments = (payload['payments'] as List<dynamic>).cast<Json>();
    final change = payments.fold<int>(
      0,
      (c, p) => c + ((p['tendered'] as int?) ?? (p['amount'] as int)) - (p['amount'] as int),
    );
    final id = 'order-${++_number}';
    final order = <String, dynamic>{
      'id': id,
      'client_order_id': payload['client_order_id'],
      'order_number': _number,
      'status': 'paid',
      'order_type': payload['order_type'],
      'customer_name': payload['customer_name'],
      'subtotal': priced.subtotal,
      'item_discount_total': 0,
      'order_discount': null,
      'service_charge_bps': 0,
      'service_charge_amount': 0,
      'tax_name': s.taxName,
      'tax_bps': s.taxBps,
      'tax_amount': priced.taxAmount,
      'total': priced.total,
      'change_due': change,
      'created_by': {'id': kasir['id'], 'name': kasir['name']},
      'paid_at': '2026-11-28T01:15:02.000Z',
      'void': null,
      'lines': [
        for (final (i, l) in lines.indexed)
          {
            'item_name': items[l['item_id']]!.name,
            'qty': l['qty'],
            'unit_price': items[l['item_id']]!.price,
            'line_gross': priced.lines[i].lineGross,
            'line_net': priced.lines[i].lineNet,
            'discount': null,
            'note': l['note'],
            'modifiers': [
              for (final id in (l['option_ids'] as List<dynamic>).cast<String>())
                {'group_name': 'G', 'option_name': opts[id]!.name, 'price_delta': opts[id]!.priceDelta},
            ],
          },
      ],
      'payments': payments.map((p) => {'tendered': null, 'provider': null, 'reference': null, ...p}).toList(),
    };
    orders[payload['client_order_id'] as String] = order;
    return Order.fromJson(order);
  }

  @override
  Future<List<OrderSummary>> today() async {
    _net();
    return [
      for (final o in orders.values)
        OrderSummary.fromJson({
          ...o,
          'items': [
            for (final l in (o['lines'] as List<dynamic>).cast<Json>())
              {'name': l['item_name'], 'qty': l['qty'], 'modifiers': <String>[], 'note': l['note']},
          ],
        }),
    ];
  }

  @override
  Future<Order> order(String id) async {
    _net();
    return Order.fromJson(orders.values.firstWhere((o) => o['id'] == id));
  }

  @override
  Future<Order> voidOrder(String id, {required String reason, required bool restock, Json? approval}) async {
    _net();
    voids.add((id: id, body: {'reason': reason, 'restock': restock, 'approval': approval}));
    if (approval != null && pins[approval['user_id']] != approval['pin']) {
      throw const ApiException('FORBIDDEN', status: 403, details: {'reason': 'approval_invalid_pin'});
    }
    final key = orders.keys.firstWhere((k) => orders[k]!['id'] == id);
    orders[key] = {
      ...orders[key]!,
      'status': 'voided',
      'void': {
        'voided_at': '2026-11-28T02:00:00.000Z',
        'voided_by': {'id': kasir['id'], 'name': kasir['name']},
        'approved_by': null,
        'reason': reason,
        'restock': restock,
      },
    };
    return Order.fromJson(orders[key]!);
  }

  @override
  Future<void> setAvailability(String itemId, bool available) async {
    _net();
    menu = {
      ...menu,
      'menu_version': 'v${DateTime.now().microsecondsSinceEpoch}',
      'items': [
        for (final i in (menu['items'] as List<dynamic>).cast<Json>())
          i['id'] == itemId ? {...i, 'is_available': available} : i,
      ],
    };
  }

  List<Json> ingredientList = [
    {
      'id': 'ing-beans',
      'name': 'Biji Kopi',
      'base_unit': 'g',
      'stock_qty': '1500.000',
      'low_stock_threshold': '500',
      'purchase_unit_name': 'Bag',
      'purchase_unit_size': '1000',
      'is_low': false,
      'archived': false,
    },
    {
      'id': 'ing-oat',
      'name': 'Susu Oat',
      'base_unit': 'ml',
      'stock_qty': '-200.000',
      'low_stock_threshold': '1000',
      'purchase_unit_name': null,
      'purchase_unit_size': null,
      'is_low': true,
      'archived': false,
    },
  ];

  @override
  Future<List<Ingredient>> ingredients() async {
    _net();
    return ingredientList.map(Ingredient.fromJson).toList();
  }

  @override
  Future<void> stockIn(Json body) async => stockCalls.add({'kind': 'in', ...body});

  @override
  Future<void> waste(Json body) async => stockCalls.add({'kind': 'waste', ...body});

  @override
  Future<void> count(Json body) async => stockCalls.add({'kind': 'count', ...body});
}
