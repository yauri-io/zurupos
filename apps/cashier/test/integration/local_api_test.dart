// M4 exit criterion "run against the local API completes orders", automated:
// the app's own state layer and HTTP client against the real API from
// `docker compose up`. Skipped unless ZURU_API_URL is set:
//
//   ZURU_API_URL=http://localhost:4000 flutter test test/integration
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:uuid/uuid.dart';
import 'package:zurupos_cashier/api/api_error.dart';
import 'package:zurupos_cashier/api/http_api.dart';
import 'package:zurupos_cashier/api/models.dart';
import 'package:zurupos_cashier/data/local_store.dart';
import 'package:zurupos_cashier/data/token_store.dart';
import 'package:zurupos_cashier/domain/business_day.dart';
import 'package:zurupos_cashier/domain/cart.dart';
import 'package:zurupos_cashier/domain/payment.dart';
import 'package:zurupos_cashier/domain/selection.dart';
import 'package:zurupos_cashier/state/auth.dart';
import 'package:zurupos_cashier/state/cart.dart';
import 'package:zurupos_cashier/state/checkout.dart';
import 'package:zurupos_cashier/state/menu.dart';
import 'package:zurupos_cashier/state/providers.dart';

final baseUrl = Platform.environment['ZURU_API_URL'];
const origin = 'http://localhost:3000';
const password = 'kopi-susu-aren-2026';
const ownerPin = '2580';
const cashierPin = '4826';

/// The owner's dashboard session, used only to set the shop up.
class Dashboard {
  Dashboard(this.dio);

  final Dio dio;
  String? cookie;

  static Future<Dashboard> signup(String email) async {
    final d = Dashboard(
      Dio(
        BaseOptions(
          baseUrl: '$baseUrl/v1',
          headers: {'X-Requested-With': 'zuru', 'Origin': origin},
          validateStatus: (s) => s != null && s < 300,
        ),
      ),
    );
    final res = await d.dio.post<dynamic>(
      '/auth/signup',
      data: {
        'shop_name': 'Kopi Integrasi',
        'name': 'Dina',
        'email': email,
        'password': password,
        'pin': ownerPin,
      },
    );
    d.cookie = res.headers['set-cookie']!.first.split(';').first;
    d.dio.options.headers['Cookie'] = d.cookie;
    return d;
  }

  Future<String> post(String path, Json body) async =>
      ((await dio.post<dynamic>(path, data: body)).data as Json)['id'] as String;

  Future<void> put(String path, Json body) => dio.put<dynamic>(path, data: body);
  Future<void> patch(String path, Json body) => dio.patch<dynamic>(path, data: body);
}

void main() {
  if (baseUrl == null) {
    test('local API integration (set ZURU_API_URL to run)', () {}, skip: 'ZURU_API_URL not set');
    return;
  }

  late Dashboard owner;
  late Map<String, String> ids;
  late String ownerId;
  late String cashierId;
  final email = 'm4-${const Uuid().v4().substring(0, 8)}@test.zurupos.local';

  setUpAll(() async {
    owner = await Dashboard.signup(email);
    await owner.patch('/settings', {
      'tax_enabled': true,
      'tax_bps': 1000,
      'service_charge_enabled': true,
      'service_charge_bps': 500,
    });
    ownerId = (((await owner.dio.get<dynamic>('/auth/me')).data as Json)['user'] as Json)['id'] as String;
    cashierId = await owner.post('/users', {'name': 'Kasir', 'role': 'cashier', 'pin': cashierPin});
    final kopi = await owner.post('/categories', {'name': 'Kopi'});
    final food = await owner.post('/categories', {'name': 'Makanan'});
    ids = {
      'kopiSusu': await owner.post('/items', {'category_id': kopi, 'name': 'Kopi Susu', 'price': 25000}),
      'croissant': await owner.post('/items', {'category_id': food, 'name': 'Croissant', 'price': 22000}),
    };
    final size = await owner.post('/modifier-groups', {
      'name': 'Ukuran',
      'selection': 'single',
      'min_select': 1,
      'max_select': 1,
    });
    final extra = await owner.post('/modifier-groups', {
      'name': 'Tambahan',
      'selection': 'multiple',
      'min_select': 0,
      'max_select': 2,
    });
    ids['regular'] = await owner.post('/modifier-options', {
      'group_id': size,
      'name': 'Regular',
      'is_default': true,
    });
    ids['large'] = await owner.post('/modifier-options', {
      'group_id': size,
      'name': 'Large',
      'price_delta': 5000,
    });
    ids['shot'] = await owner.post('/modifier-options', {
      'group_id': extra,
      'name': 'Extra shot',
      'price_delta': 5000,
    });
    await owner.put('/items/${ids['kopiSusu']}/modifier-groups', {
      'group_ids': [size, extra],
    });
    ids['beans'] = await owner.post('/ingredients', {'name': 'Biji Kopi', 'base_unit': 'g'});
    await owner.put('/items/${ids['kopiSusu']}/recipe', {
      'lines': [
        {'ingredient_id': ids['beans'], 'qty': '18'},
      ],
    });
    await owner.put('/modifier-options/${ids['shot']}/effects', {
      'effects': [
        {'effect': 'add', 'ingredient_id': ids['beans'], 'qty': '18'},
      ],
    });
    await owner.dio.post<dynamic>(
      '/stock/in',
      data: {'ingredient_id': ids['beans'], 'qty': '1000', 'total_cost': 300000},
    );
    ids['item10'] = await owner.post('/discounts', {
      'name': 'Diskon 10%',
      'kind': 'percent',
      'value': 1000,
      'scope': 'item',
    });
  });

  ProviderContainer app() {
    final c = ProviderContainer(
      overrides: [
        apiProvider.overrideWith(
          (ref) => HttpZuruApi(baseUrl: baseUrl!, credentials: ref.watch(credentialsProvider)),
        ),
        localStoreProvider.overrideWithValue(MemoryLocalStore()),
        tokenStoreProvider.overrideWithValue(MemoryTokenStore()),
      ],
    );
    addTearDown(c.dispose);
    return c;
  }

  Future<String> beans(ProviderContainer c) async =>
      (await c.read(apiProvider).ingredients()).firstWhere((i) => i.id == ids['beans']).stockQty;

  test('pair, sign in, load the menu, take a split-paid order, retry it, void it with approval', () async {
    final c = app();
    c.listen(authProvider, (_, _) {});
    await Future<void>.delayed(Duration.zero);
    expect(c.read(authProvider), isA<Unpaired>());

    // Pairing: wrong password refused, then the owner pairs the tablet.
    await expectLater(
      c.read(authProvider.notifier).pair(email: email, password: 'nope-nope-nope', deviceName: 'Tablet'),
      throwsA(isA<ApiException>().having((e) => e.status, 'status', 401)),
    );
    expect(
      await c.read(authProvider.notifier).pair(email: email, password: password, deviceName: 'Tablet'),
      'Kopi Integrasi',
    );
    final staff = await c.read(apiProvider).staff();
    expect(staff.map((s) => s.name), containsAll(['Dina', 'Kasir']));

    // Wrong PIN, then the cashier signs in.
    await expectLater(c.read(authProvider.notifier).signIn(cashierId, '9999'), throwsA(isA<ApiException>()));
    await c.read(authProvider.notifier).signIn(cashierId, cashierPin);
    expect(c.read(currentUserProvider)?.role, Role.cashier);

    // Bootstrap, then a 304 on the second refresh.
    c.listen(menuProvider, (_, _) {});
    await c.read(menuProvider.future);
    expect(await c.read(menuProvider.notifier).refresh(), isNull);
    final menu = c.read(menuProvider).value!;
    expect(await c.read(menuProvider.notifier).refresh(), isNull);
    expect(c.read(menuProvider).value!.menuVersion, menu.menuVersion);
    expect(await c.read(localStoreProvider).menu(), isNotNull);

    // 2× Kopi Susu Large + shot with 10% item discount, and a croissant.
    final kopi = menu.items.firstWhere((i) => i.id == ids['kopiSusu']);
    final groups = menu.groupsOf(kopi);
    var sel = defaultSelection(groups);
    sel = toggleOption(sel, groups[0], ids['large']!);
    sel = toggleOption(sel, groups[1], ids['shot']!);
    c.listen(cartProvider, (_, _) {});
    final cart = c.read(cartProvider.notifier);
    cart.add(kopi, selectedOptions(sel, groups), qty: 2);
    cart.setLineDiscount(
      c.read(cartProvider).lines.single.key,
      DiscountChoice.preset(menu.discounts.firstWhere((d) => d.id == ids['item10'])),
    );
    cart.add(menu.items.firstWhere((i) => i.id == ids['croissant']), const []);
    final priced = c.read(cartProvider).price(menu.settings);
    // 70 000 − 7 000 + 22 000 = 85 000; service 5% 4 250; PB1 10% of 89 250 = 8 925 → 98 175.
    expect(priced.total, 98175);

    final payments = [
      const PaymentDraft(method: 'qris', amount: 50000, provider: 'GoPay', reference: '8821'),
      PaymentDraft(method: 'cash', amount: priced.total - 50000, tendered: 50000),
    ];
    final payload = c
        .read(cartProvider)
        .toOrderPayload(
          clientOrderId: const Uuid().v4(),
          clientCreatedAt: DateTime.now(),
          payments: [for (final p in payments) p.toJson()],
          expectedTotal: priced.total,
        );
    c.listen(checkoutProvider, (_, _) {});
    final result = await c.read(checkoutProvider.notifier).complete(payload);
    expect(result, isA<Sent>());
    final order = (result as Sent).order;
    expect([order.orderNumber, order.total, order.changeDue], [1, 98175, 1825]);
    expect(order.lines.first.modifiers.map((m) => m.optionName), ['Large', 'Extra shot']);
    expect(c.read(checkoutProvider).pending, isNull);
    expect(await beans(c), '928'); // 1000 − 2 × (18 + 18)

    // The same client_order_id again: the stored order, stock moved once.
    final again = await c.read(apiProvider).createOrder(payload);
    expect(again.id, order.id);
    expect(await beans(c), '928');

    final today = await c.read(apiProvider).today();
    expect(today.map((o) => o.id), [order.id]);

    // Cashier void: a wrong approver PIN is refused, the owner's approves it, stock returns.
    await expectLater(
      c
          .read(apiProvider)
          .voidOrder(
            order.id,
            reason: 'Salah input',
            restock: true,
            approval: {'user_id': ownerId, 'pin': '1111'},
          ),
      throwsA(isA<ApiException>().having((e) => e.details['reason'], 'reason', 'approval_invalid_pin')),
    );
    final voided = await c
        .read(apiProvider)
        .voidOrder(
          order.id,
          reason: 'Salah input',
          restock: true,
          approval: {'user_id': ownerId, 'pin': ownerPin},
        );
    expect(voided.voided, isTrue);
    expect(await beans(c), '1000');

    await c.read(authProvider.notifier).signOut();
    expect(c.read(authProvider), isA<Paired>());
  });

  test('a price change between menu load and payment is caught, the menu and cart refresh', () async {
    final c = app();
    c.listen(authProvider, (_, _) {});
    await Future<void>.delayed(Duration.zero);
    await c.read(authProvider.notifier).pair(email: email, password: password, deviceName: 'Tablet 2');
    await c.read(authProvider.notifier).signIn(cashierId, cashierPin);
    c.listen(menuProvider, (_, _) {});
    await c.read(menuProvider.future);
    await c.read(menuProvider.notifier).refresh();
    final menu = c.read(menuProvider).value!;
    c.listen(cartProvider, (_, _) {});
    c.read(cartProvider.notifier).add(menu.items.firstWhere((i) => i.id == ids['croissant']), const []);
    final total = c.read(cartProvider).price(menu.settings).total;

    await owner.patch('/items/${ids['croissant']}', {'price': 24000});

    c.listen(checkoutProvider, (_, _) {});
    final result = await c
        .read(checkoutProvider.notifier)
        .complete(
          c
              .read(cartProvider)
              .toOrderPayload(
                clientOrderId: const Uuid().v4(),
                clientCreatedAt: DateTime.now(),
                payments: [PaymentDraft(method: 'cash', amount: total, tendered: total).toJson()],
                expectedTotal: total,
              ),
        );
    expect(result, isA<Rejected>().having((r) => r.error.code, 'code', 'PRICE_CHANGED'));
    expect(c.read(checkoutProvider).pending, isNull);
    expect(c.read(menuProvider).value!.items.firstWhere((i) => i.id == ids['croissant']).price, 24000);
    expect(c.read(cartProvider).lines.single.item.price, 24000);
  });

  test('D-051: the owner reads today’s report on the tablet; a cashier is refused', () async {
    final c = app();
    c.listen(authProvider, (_, _) {});
    await Future<void>.delayed(Duration.zero);
    await c.read(authProvider.notifier).pair(email: email, password: password, deviceName: 'Tablet 3');
    final api = c.read(apiProvider);
    await c.read(authProvider.notifier).signIn(cashierId, cashierPin);
    final s = await api.settings();
    final today = businessToday(DateTime.now(), s.timezone, s.businessDayCutoffHour);
    await expectLater(
      api.dayReport(today),
      throwsA(isA<ApiException>().having((e) => e.status, 'status', 403)),
    );
    await c.read(authProvider.notifier).signOut();

    await c.read(authProvider.notifier).signIn(ownerId, ownerPin);
    final r = await api.dayReport(today);
    // The first test's order was voided: no sales, one void.
    expect([r.orders, r.totalCollected, r.voidCount, r.voidTotal], [0, 0, 1, 98175]);
    expect(r.payments, isEmpty);
  });
}
