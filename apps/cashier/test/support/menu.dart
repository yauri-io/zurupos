// The SPEC §7.1 Kopi Susu demo menu as a bootstrap payload, for unit and widget tests.
import 'package:zurupos_cashier/api/models.dart';

Json _opt(String id, String name, {int delta = 0, bool def = false}) => {
  'id': id,
  'name': name,
  'price_delta': delta,
  'is_default': def,
};

Json kopiBootstrapJson({bool taxEnabled = true, int taxBps = 1000, bool croissantAvailable = true}) => {
  'menu_version': 'v1',
  'settings': {
    'name': 'Kopi Demo',
    'address': 'Jl. Kopi 1',
    'phone': null,
    'timezone': 'Asia/Jakarta',
    'business_day_cutoff_hour': 0,
    'receipt_header': null,
    'receipt_footer': 'Terima kasih',
    'service_charge_enabled': false,
    'service_charge_bps': 0,
    'tax_enabled': taxEnabled,
    'tax_name': 'PB1',
    'tax_bps': taxBps,
    'tax_on_service_charge': true,
    'enabled_payment_methods': ['cash', 'qris', 'debit'],
    'idle_lock_minutes': 15,
  },
  'categories': [
    {'id': 'cat-kopi', 'name': 'Kopi'},
    {'id': 'cat-food', 'name': 'Makanan'},
  ],
  'items': [
    {
      'id': 'kopi-susu',
      'category_id': 'cat-kopi',
      'name': 'Kopi Susu Gula Aren',
      'price': 25000,
      'color': 'amber',
      'is_available': true,
      'modifier_group_ids': ['g-size', 'g-sugar', 'g-milk', 'g-extra'],
    },
    {
      'id': 'americano',
      'category_id': 'cat-kopi',
      'name': 'Americano',
      'price': 20000,
      'color': 'stone',
      'is_available': true,
      'modifier_group_ids': <String>[],
    },
    {
      'id': 'croissant',
      'category_id': 'cat-food',
      'name': 'Croissant',
      'price': 22000,
      'color': 'orange',
      'is_available': croissantAvailable,
      'modifier_group_ids': <String>[],
    },
  ],
  'modifier_groups': [
    {
      'id': 'g-size',
      'name': 'Ukuran',
      'selection': 'single',
      'min_select': 1,
      'max_select': 1,
      'options': [_opt('o-regular', 'Regular', def: true), _opt('o-large', 'Large', delta: 5000)],
    },
    {
      'id': 'g-sugar',
      'name': 'Gula',
      'selection': 'single',
      'min_select': 1,
      'max_select': 1,
      'options': [_opt('o-normal', 'Normal', def: true), _opt('o-less', 'Less sugar')],
    },
    {
      'id': 'g-milk',
      'name': 'Susu',
      'selection': 'single',
      'min_select': 1,
      'max_select': 1,
      'options': [_opt('o-fresh', 'Susu segar', def: true), _opt('o-oat', 'Oat milk', delta: 6000)],
    },
    {
      'id': 'g-extra',
      'name': 'Tambahan',
      'selection': 'multiple',
      'min_select': 0,
      'max_select': 2,
      'options': [
        _opt('o-shot', 'Extra shot', delta: 5000),
        _opt('o-vanilla', 'Vanilla', delta: 4000),
        _opt('o-caramel', 'Karamel', delta: 4000),
      ],
    },
  ],
  'discounts': [
    {'id': 'd-item10', 'name': 'Diskon 10%', 'kind': 'percent', 'value': 1000, 'scope': 'item'},
    {'id': 'd-order5k', 'name': 'Potong 5rb', 'kind': 'fixed', 'value': 5000, 'scope': 'order'},
  ],
};

Bootstrap kopiBootstrap({bool taxEnabled = true}) =>
    Bootstrap.fromJson(kopiBootstrapJson(taxEnabled: taxEnabled));
