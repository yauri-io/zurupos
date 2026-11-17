// NetworkTransport against a real TCP socket on loopback (port 9100 stand-in).
import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:zurupos_cashier/printing/printer_config.dart';
import 'package:zurupos_cashier/printing/transport.dart';

void main() {
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
}
