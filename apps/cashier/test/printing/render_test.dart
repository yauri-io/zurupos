// SPEC §16 M5: renderer golden tests — byte output for sample orders at 58/80 mm.
// Regenerate after an intended change: UPDATE_GOLDENS=1 flutter test test/printing
// and review the .txt diffs (the readable twin of each .bin).
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:zurupos_cashier/api/models.dart';
import 'package:zurupos_cashier/printing/escpos.dart';
import 'package:zurupos_cashier/printing/render.dart';

import '../support/escpos_decode.dart';

const labels = ReceiptLabels(
  orderNo: 'No.',
  cashier: 'Kasir',
  dineIn: 'Makan di sini',
  takeaway: 'Bawa pulang',
  subtotal: 'Subtotal',
  discount: 'Diskon',
  orderDiscount: 'Diskon pesanan',
  serviceCharge: 'Biaya layanan',
  total: 'Total',
  cashReceived: 'Tunai diterima',
  change: 'Kembalian',
  voided: 'BATAL',
  methods: {'cash': 'Tunai', 'qris': 'QRIS', 'debit': 'Debit'},
  testPrint: 'Tes cetak',
  printer: 'Printer',
);

const shop = ShopHeader(
  name: 'Kopi Senja',
  address: 'Jl. Merdeka No. 12, Bandung',
  phone: '0812-3456-7890',
  receiptHeader: 'Buka 07.00–22.00',
  receiptFooter: 'Terima kasih! Sampai jumpa lagi.',
);

Json _line(String name, int qty, int unit, List<(String, int)> mods, {String? note, Json? discount}) {
  final modTotal = mods.fold<int>(0, (s, m) => s + m.$2);
  final gross = (unit + modTotal) * qty;
  return {
    'item_name': name,
    'qty': qty,
    'unit_price': unit,
    'line_gross': gross,
    'line_net': gross - ((discount?['amount'] as int?) ?? 0),
    'discount': discount,
    'note': note,
    'modifiers': [
      for (final m in mods) {'group_name': 'G', 'option_name': m.$1, 'price_delta': m.$2},
    ],
  };
}

/// UAT #6 style: 2× Kopi Susu (Large, Oat, Less sugar) with 10% item discount,
/// a croissant, a custom order discount, service 5%, PB1 10%, split QRIS + cash.
Order uatOrder({bool voided = false}) => Order.fromJson({
  'id': 'o1',
  'client_order_id': 'c1',
  'order_number': 17,
  'status': voided ? 'voided' : 'paid',
  'order_type': 'dine_in',
  'customer_name': 'Dina',
  'subtotal': 104000,
  'item_discount_total': 8200,
  'order_discount': {'id': null, 'name': null, 'kind': 'fixed', 'value': 5000, 'amount': 5000},
  'service_charge_bps': 500,
  'service_charge_amount': 4540,
  'tax_name': 'PB1',
  'tax_bps': 1000,
  'tax_amount': 9534,
  'total': 104874,
  'change_due': 15126,
  'created_by': {'id': 'u1', 'name': 'Budi'},
  'paid_at': '2026-11-28T01:15:02.000Z',
  'void': voided
      ? {
          'voided_at': '2026-11-28T02:00:00.000Z',
          'voided_by': {'id': 'u2', 'name': 'Rina'},
          'approved_by': null,
          'reason': 'Salah input',
          'restock': true,
        }
      : null,
  'lines': [
    _line(
      'Kopi Susu Gula Aren',
      2,
      25000,
      [('Large', 5000), ('Less sugar', 0), ('Oat milk', 6000)],
      note: 'es dikit, jangan terlalu manis ya kak',
      discount: {'id': 'd1', 'name': 'Diskon 10%', 'kind': 'percent', 'value': 1000, 'amount': 8200},
    ),
    _line('Croissant Almond Butter Extra Panjang Sekali Namanya', 1, 22000, []),
  ],
  'payments': [
    {'method': 'qris', 'amount': 50000, 'tendered': null, 'provider': 'GoPay', 'reference': '8821'},
    {'method': 'cash', 'amount': 54874, 'tendered': 70000, 'provider': null, 'reference': null},
  ],
});

Future<void> golden(String name, Uint8List bytes, Paper paper) async {
  final decoded = decode(bytes, paper.columns);
  expect(decoded.overflows, isEmpty, reason: 'lines wider than ${paper.columns} columns');
  final bin = File('test/goldens/$name.bin');
  final txt = File('test/goldens/$name.txt');
  if (Platform.environment['UPDATE_GOLDENS'] == '1' || !bin.existsSync()) {
    bin.writeAsBytesSync(bytes);
    txt.writeAsStringSync(decoded.text);
  }
  expect(decoded.text, txt.readAsStringSync());
  expect(bytes, bin.readAsBytesSync());
}

void main() {
  const time = '28/11/2026 08:15';

  for (final paper in Paper.values) {
    group('${paper.mm} mm', () {
      test(
        'receipt',
        () => golden(
          'receipt_${paper.mm}',
          renderReceipt(uatOrder(), shop, paper, time: time, labels: labels),
          paper,
        ),
      );

      test('receipt reprint of a voided order shows the VOID banner', () async {
        final bytes = renderReceipt(uatOrder(voided: true), shop, paper, time: time, labels: labels);
        await golden('receipt_void_${paper.mm}', bytes, paper);
        expect(decode(bytes, paper.columns).text, contains('*** BATAL ***'));
      });

      test(
        'ticket',
        () => golden(
          'ticket_${paper.mm}',
          renderTicket(TicketData.fromOrder(uatOrder()), paper, time: '08:15', labels: labels),
          paper,
        ),
      );

      test(
        'test page',
        () => golden(
          'test_page_${paper.mm}',
          renderTestPage(paper, shopName: 'Kopi Senja', printerName: 'Kasir BT', time: time, labels: labels),
          paper,
        ),
      );
    });
  }

  group('receipt content', () {
    final text = decode(renderReceipt(uatOrder(), shop, Paper.mm58, time: time, labels: labels), 32).text;

    test('every money figure of the order is printed', () {
      for (final s in [
        'Rp 104.000',
        '-Rp 8.200',
        '-Rp 5.000',
        'Rp 4.540',
        'Rp 9.534',
        'Rp 104.874',
        'Rp 50.000',
        'Rp 54.874',
        'Rp 70.000',
        'Rp 15.126',
      ]) {
        expect(text, contains(s));
      }
    });

    test('custom discount is labelled, rates shown, cashier and order type printed', () {
      expect(text, contains('|Diskon pesanan|\n|(Diskon)               -Rp 5.000|'));
      expect(text, contains('|  Diskon 10%           -Rp 8.200|'));
      expect(text, contains('Biaya layanan 5%'));
      expect(text, contains('PB1 10%'));
      expect(text, contains('Kasir: Budi'));
      expect(text, contains('Makan di sini - Dina'));
    });

    test('non-ASCII header text is transliterated', () => expect(text, contains('Buka 07.00-22.00')));

    test('no drawer kick unless asked, and only with cash', () {
      expect(text, isNot(contains('[DRAWER')));
      final kicked = renderReceipt(
        uatOrder(),
        shop,
        Paper.mm58,
        time: time,
        labels: labels,
        drawerKick: true,
      );
      expect(kicked.sublist(kicked.length - 5), [0x1B, 0x70, 0x00, 25, 250]);
      final noCash = Order.fromJson({
        ...{
          'id': 'o2',
          'client_order_id': 'c2',
          'order_number': 2,
          'status': 'paid',
          'order_type': 'takeaway',
        },
        'customer_name': null,
        'subtotal': 22000,
        'item_discount_total': 0,
        'order_discount': null,
        'service_charge_bps': 0,
        'service_charge_amount': 0,
        'tax_name': null,
        'tax_bps': 0,
        'tax_amount': 0,
        'total': 22000,
        'change_due': 0,
        'created_by': {'id': 'u1', 'name': 'Budi'},
        'paid_at': '2026-11-28T01:15:02.000Z',
        'void': null,
        'lines': [_line('Croissant', 1, 22000, [])],
        'payments': [
          {'method': 'qris', 'amount': 22000, 'tendered': null, 'provider': null, 'reference': null},
        ],
      });
      final b = renderReceipt(noCash, shop, Paper.mm58, time: time, labels: labels, drawerKick: true);
      expect(decode(b, 32).text, isNot(contains('[DRAWER')));
    });
  });

  group('ticket content', () {
    test('no prices; each modifier on its own line; notes in bold', () {
      final text = decode(
        renderTicket(TicketData.fromOrder(uatOrder()), Paper.mm80, time: '08:15', labels: labels),
        48,
      ).text;
      expect(text, isNot(contains('Rp')));
      expect(text, contains('|  - Large|'));
      expect(text, contains('|  - Oat milk|'));
      expect(text, contains('[B]|  ! es dikit, jangan terlalu manis ya kak|'));
      expect(text, contains('[QUAD]|No. 17|'));
    });
  });

  group('escpos', () {
    test('init, cut and kick bytes', () {
      final p = EscPos(Paper.mm58)
        ..cut()
        ..drawerKick();
      expect(p.build(), [0x1B, 0x40, 0x1B, 0x74, 0, 0x1D, 0x56, 0x42, 0, 0x1B, 0x70, 0, 25, 250]);
    });

    test('asciiSafe and wrap', () {
      expect(asciiSafe('Café “Kopi” – 2×'), 'Cafe "Kopi" - 2x');
      expect(asciiSafe('漢字'), '??');
      expect(wrap('satu dua tiga empat', 9), ['satu dua', 'tiga', 'empat']);
      expect(wrap('abcdefghijkl', 5), ['abcde', 'fghij', 'kl']);
    });

    test('two columns fill the line exactly', () {
      final p = EscPos(Paper.mm58)..columns2('Subtotal', 'Rp 104.000');
      final line = decode(p.build(), 32).text.split('|')[1];
      expect(line.length, 32);
      expect(line, endsWith('Rp 104.000'));
    });
  });
}
