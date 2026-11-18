// SPEC §11.3 / M5: auto-print after commit, failures never block an order,
// retry, reprint, drawer kick, test print, printer settings.
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zurupos_cashier/printing/escpos.dart';
import 'package:zurupos_cashier/printing/printer_config.dart';

import '../support/escpos_decode.dart';
import '../support/harness.dart';

const receiptBt = PrinterConfig(
  id: 'p-receipt',
  name: 'Kasir BT',
  transport: TransportKind.bluetooth,
  address: 'AA:BB:CC:DD:EE:FF',
  drawerKick: true,
);
const ticketLan = PrinterConfig(
  id: 'p-ticket',
  name: 'Bar LAN',
  transport: TransportKind.network,
  address: '192.168.1.50',
  paper: Paper.mm80,
  receipt: false,
  ticket: true,
);

Future<Harness> _start(
  WidgetTester tester, {
  List<PrinterConfig> printers = const [receiptBt, ticketLan],
}) async {
  final h = Harness();
  await h.setPrinters(printers);
  await h.pump(tester);
  await h.signIn(tester, 'u-kasir', '4826');
  return h;
}

Future<void> _sellAmericanoCash(WidgetTester tester) async {
  await tester.tap(find.byKey(const Key('item-americano')));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('pay')));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('quick-50000')));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('pay-complete')));
  await tester.pumpAndSettle();
}

String _text(Uint8List bytes, int cols) => decode(bytes, cols).text;

void main() {
  testWidgets('after Complete: receipt + drawer kick on one printer, ticket on the other', (tester) async {
    final h = await _start(tester);
    await _sellAmericanoCash(tester);
    expect(find.text('No. 1'), findsOneWidget);
    expect(find.text('Tercetak'), findsNWidgets(2));

    final receipt = h.printers.printed['AA:BB:CC:DD:EE:FF']!.single;
    expect(_text(receipt, 32), contains('|1 x Americano          Rp 20.000|'));
    expect(_text(receipt, 32), contains('|Kembalian              Rp 28.000|'));
    expect(receipt.sublist(receipt.length - 5), [0x1B, 0x70, 0, 25, 250]);

    final ticket = _text(h.printers.printed['192.168.1.50']!.single, 48);
    expect(ticket, contains('[QUAD]|No. 1|'));
    expect(ticket, isNot(contains('Rp')));
    await h.dispose(tester);
  });

  testWidgets('a printer that is off fails visibly, the order is still done, Retry prints it', (
    tester,
  ) async {
    final h = Harness();
    await h.setPrinters([receiptBt]);
    h.printers.unreachable.add('AA:BB:CC:DD:EE:FF');
    await h.pump(tester);
    await h.signIn(tester, 'u-kasir', '4826');
    await _sellAmericanoCash(tester);

    expect(find.text('No. 1'), findsOneWidget);
    expect(h.api.orderPayloads, hasLength(1));
    expect(await h.store.pendingOrder(), isNull);
    expect(find.text('Gagal: Tidak bisa terhubung ke printer.'), findsOneWidget);

    h.printers.unreachable.clear();
    await tester.tap(find.textContaining('Coba lagi'));
    await tester.pumpAndSettle();
    expect(find.text('Tercetak'), findsOneWidget);
    expect(h.printers.printed['AA:BB:CC:DD:EE:FF'], hasLength(1));
    expect(h.store.printJobs.values.single.status.name, 'done');
    await h.dispose(tester);
  });

  testWidgets('a printer that never answers times out after 10 s', (tester) async {
    final h = Harness();
    await h.setPrinters([receiptBt]);
    h.printers.hanging.add('AA:BB:CC:DD:EE:FF');
    await h.pump(tester);
    await h.signIn(tester, 'u-kasir', '4826');
    await tester.tap(find.byKey(const Key('item-americano')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('pay')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('quick-22000')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('pay-complete')));
    await tester.pump();
    await tester.pump();
    expect(find.text('No. 1'), findsOneWidget);
    expect(find.text('Mencetak…'), findsOneWidget);
    await tester.pump(const Duration(seconds: 2));
    await tester.tap(find.text('No. 1')); // stop the auto-return
    await tester.pump(const Duration(seconds: 9));
    expect(find.text('Gagal: Printer tidak merespons.'), findsOneWidget);
    await h.dispose(tester);
  });

  testWidgets('reprint a voided order’s receipt shows the VOID banner', (tester) async {
    final h = await _start(tester);
    await _sellAmericanoCash(tester);
    await tester.tap(find.byKey(const Key('done-new')));
    await tester.pumpAndSettle();
    final key = h.api.orders.keys.single;
    h.api.orders[key] = {
      ...h.api.orders[key]!,
      'status': 'voided',
      'void': {
        'voided_at': '2026-11-28T02:00:00.000Z',
        'voided_by': {'id': 'u-rina', 'name': 'Rina'},
        'approved_by': null,
        'reason': 'Salah',
        'restock': true,
      },
    };
    await tester.tap(find.text('Pesanan hari ini').first);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('today-1')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('reprint-receipt')));
    await tester.pumpAndSettle();
    expect(find.text('Dikirim ke printer.'), findsOneWidget);
    final reprint = h.printers.printed['AA:BB:CC:DD:EE:FF']!.last;
    expect(_text(reprint, 32), contains('*** BATAL ***'));
    await h.dispose(tester);
  });

  testWidgets('employees reprint the ticket from today’s list; without printers they’re told', (
    tester,
  ) async {
    final h = Harness();
    await h.setPrinters([ticketLan]);
    await h.api.createOrder({
      'client_order_id': 'seed',
      'order_type': 'takeaway',
      'customer_name': 'Budi',
      'lines': [
        {
          'item_id': 'kopi-susu',
          'qty': 1,
          'option_ids': ['o-large', 'o-normal', 'o-oat'],
          'note': 'less ice',
          'discount': null,
        },
      ],
      'payments': [
        {'method': 'qris', 'amount': 39600},
      ],
    });
    await h.pump(tester);
    await h.signIn(tester, 'u-barista', '7319');
    await tester.tap(find.byKey(const Key('ticket-1')));
    await tester.pumpAndSettle();
    final ticket = _text(h.printers.printed['192.168.1.50']!.single, 48);
    expect(ticket, contains('[DOUBLE]|Budi|'));
    expect(ticket, contains('[B]|  ! less ice|'));
    expect(find.text('Dikirim ke printer.'), findsOneWidget);
    await h.dispose(tester);

    final none = Harness();
    await none.api.createOrder(h.api.orderPayloads.single);
    await none.pump(tester);
    await none.signIn(tester, 'u-barista', '7319');
    await tester.tap(find.byKey(const Key('ticket-1')));
    await tester.pumpAndSettle();
    expect(find.text('Belum ada printer. Atur di Pengaturan.'), findsOneWidget);
    await none.dispose(tester);
  });

  testWidgets('settings: add a network printer, test print, at most two', (tester) async {
    final h = Harness();
    await h.setPrinters([receiptBt]);
    await h.pump(tester);
    await h.signIn(tester, 'u-rina', '1357');
    await tester.tap(find.text('Pengaturan').first);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('printer-add')));
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('printer-name')), 'Bar');
    await tester.tap(find.text('Jaringan (LAN/Wi-Fi)'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('printer-ip')), '192.168.1.60:9101');
    await tester.tap(find.text('80 mm'));
    await tester.tap(find.byKey(const Key('printer-receipt')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('printer-ticket')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('printer-test')));
    await tester.pumpAndSettle();
    final test = _text(h.printers.printed['192.168.1.60:9101']!.single, 48);
    expect(test, contains('Tes cetak'));
    expect(test, contains('|123456789012345678901234567890123456789012345678|'));
    expect(find.text('Tercetak'), findsOneWidget);

    await tester.tap(find.byKey(const Key('printer-save')));
    await tester.pumpAndSettle();
    final saved = decodePrinters(await h.store.setting('printers'));
    expect(saved.map((p) => (p.name, p.address, p.paper, p.receipt, p.ticket)), [
      ('Kasir BT', 'AA:BB:CC:DD:EE:FF', Paper.mm58, true, false),
      ('Bar', '192.168.1.60:9101', Paper.mm80, false, true),
    ]);
    expect(saved[1].hostPort, (host: '192.168.1.60', port: 9101));
    expect(find.text('Maksimal 2 printer per perangkat.'), findsOneWidget);
    expect(tester.widget<TextButton>(find.byKey(const Key('printer-add'))).onPressed, isNull);
    await h.dispose(tester);
  });

  testWidgets('settings: a printer paired after opening the page appears on reload', (tester) async {
    final h = Harness();
    await h.pump(tester);
    await h.signIn(tester, 'u-dina', '2580');
    await tester.tap(find.text('Pengaturan').first);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('printer-add')));
    await tester.pumpAndSettle();
    h.bonded.add((name: 'RP45BT', address: 'E8:9A:FF:F8:5B:D0'));
    await tester.tap(find.byKey(const Key('printer-bonded')));
    await tester.pumpAndSettle();
    expect(find.text('RP45BT (E8:9A:FF:F8:5B:D0)'), findsNothing);
    await tester.tapAt(Offset.zero); // close the dropdown
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('printer-bonded-refresh')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('printer-bonded')));
    await tester.pumpAndSettle();
    expect(find.text('RP45BT (E8:9A:FF:F8:5B:D0)').last, findsOneWidget);
    await h.dispose(tester);
  });

  testWidgets('settings: printers come first; availability has its own searchable page', (tester) async {
    final h = Harness();
    await h.pump(tester);
    await h.signIn(tester, 'u-dina', '2580');
    await tester.tap(find.text('Pengaturan').first);
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('printer-add')), findsOneWidget);
    expect(find.byKey(const Key('availability-croissant')), findsNothing);
    expect(find.text('0 menu ditandai habis'), findsOneWidget);

    await tester.tap(find.byKey(const Key('settings-availability')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('availability-search')), 'crois');
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('availability-kopi-susu')), findsNothing);
    await tester.tap(find.byKey(const Key('availability-croissant')));
    await tester.pumpAndSettle();
    expect(find.text('Habis'), findsOneWidget);

    await tester.tap(
      find.byTooltip(MaterialLocalizations.of(tester.element(find.byType(Scaffold).last)).backButtonTooltip),
    );
    await tester.pumpAndSettle();
    expect(find.text('1 menu ditandai habis'), findsOneWidget);
    await h.dispose(tester);
  });

  testWidgets('settings: pick a bonded Bluetooth printer', (tester) async {
    final h = Harness();
    await h.pump(tester);
    await h.signIn(tester, 'u-dina', '2580');
    await tester.tap(find.text('Pengaturan').first);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('printer-add')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('printer-bonded')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('RPP02N (AA:BB:CC:DD:EE:FF)').last);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('printer-save')));
    await tester.pumpAndSettle();
    final saved = decodePrinters(await h.store.setting('printers')).single;
    expect([saved.name, saved.address, saved.transport.name], ['RPP02N', 'AA:BB:CC:DD:EE:FF', 'bluetooth']);
    await h.dispose(tester);
  });

  testWidgets('auto-return off: the Done screen stays', (tester) async {
    final h = Harness();
    await h.store.setSetting('auto_return_seconds', '0');
    await h.pump(tester);
    await h.signIn(tester, 'u-kasir', '4826');
    await _sellAmericanoCash(tester);
    await tester.pump(const Duration(seconds: 10));
    expect(find.text('No. 1'), findsOneWidget);
    expect(find.textContaining('Kembali otomatis'), findsNothing);
    await h.dispose(tester);
  });
}
