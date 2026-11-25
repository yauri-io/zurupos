// NetworkTransport against a real TCP socket on loopback (port 9100 stand-in).
import 'dart:async';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zurupos_cashier/printing/printer_config.dart';
import 'package:zurupos_cashier/printing/transport.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Bluetooth write (print_bluetooth_thermal channel)', () {
    const channel = MethodChannel('groons.web.app/print');
    final messenger = TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    tearDown(() => messenger.setMockMethodCallHandler(channel, null));

    test('sends a plain int list, not a Uint8List (the plugin rejects byte[])', () async {
      Object? sent;
      messenger.setMockMethodCallHandler(channel, (call) async {
        if (call.method == 'writebytes') sent = call.arguments;
        return true;
      });
      final t = BluetoothClassicTransport('00:11:22:33:44:55', drainTime: (_) => Duration.zero);
      await t.write(Uint8List.fromList([0x1B, 0x40, 0x41, 0x0A]));
      expect(sent, isNot(isA<Uint8List>()));
      expect(sent, [0x1B, 0x40, 0x41, 0x0A]);
    });

    test('a false from the plugin fails with write_failed', () async {
      messenger.setMockMethodCallHandler(channel, (call) async => false);
      final t = BluetoothClassicTransport('00:11:22:33:44:55', drainTime: (_) => Duration.zero);
      await expectLater(
        t.write(Uint8List.fromList([0x41])),
        throwsA(isA<PrinterException>().having((e) => e.code, 'code', 'write_failed')),
      );
    });

    test('waits for the link to drain before the socket may close', () {
      expect(bluetoothDrainTime(0), const Duration(milliseconds: 300));
      expect(bluetoothDrainTime(2000), const Duration(milliseconds: 800));
    });
  });

  test('sends the bytes over TCP', () async {
    final server = await ServerSocket.bind(InternetAddress.loopbackIPv4, 0);
    final received = Completer<List<int>>();
    server.listen((client) {
      final bytes = <int>[];
      client.listen(bytes.addAll, onDone: () => received.complete(bytes));
    });
    final t = NetworkTransport('127.0.0.1', server.port);
    await t.connect();
    expect(await t.status(), isTrue);
    await t.write(Uint8List.fromList([0x1B, 0x40, 0x41, 0x0A]));
    await t.disconnect();
    expect(await received.future, [0x1B, 0x40, 0x41, 0x0A]);
    await server.close();
  });

  test('a closed port fails with connect_failed', () async {
    final server = await ServerSocket.bind(InternetAddress.loopbackIPv4, 0);
    final port = server.port;
    await server.close();
    final t = NetworkTransport('127.0.0.1', port);
    await expectLater(
      t.connect(),
      throwsA(isA<PrinterException>().having((e) => e.code, 'code', 'connect_failed')),
    );
  });

  test('printer config: JSON round trip and host:port parsing', () {
    const p = PrinterConfig(id: 'p', name: 'Bar', transport: TransportKind.network, address: '10.0.0.5');
    expect(decodePrinters(encodePrinters([p])).single.toJson(), p.toJson());
    expect(p.hostPort, (host: '10.0.0.5', port: 9100));
    expect(p.copyWith(address: '10.0.0.5:9200').hostPort, (host: '10.0.0.5', port: 9200));
    expect(decodePrinters(null), isEmpty);
  });

  test('a config saved with drawer_kick before D-067 still loads, and drops it', () {
    const saved =
        '[{"id":"p","name":"Kasir","transport":"bluetooth","address":"AA:BB","paper":58,'
        '"receipt":true,"ticket":false,"auto_receipt":true,"auto_ticket":false,"drawer_kick":true}]';
    final p = decodePrinters(saved).single;
    expect(p.autoReceipt, isTrue);
    expect(p.toJson().containsKey('drawer_kick'), isFalse);
  });
}
