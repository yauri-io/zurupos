import 'dart:async';
import 'dart:typed_data';

import 'package:zurupos_cashier/printing/printer_config.dart';
import 'package:zurupos_cashier/printing/transport.dart';

/// Stands in for every printer: records bytes per address; can fail or hang.
class FakePrinters {
  final Map<String, List<Uint8List>> printed = {};
  final Set<String> unreachable = {};
  final Set<String> hanging = {};

  PrinterTransport transport(PrinterConfig c) => _FakeTransport(this, c.address);
}

class _FakeTransport implements PrinterTransport {
  _FakeTransport(this.printers, this.address);

  final FakePrinters printers;
  final String address;
  bool _open = false;

  @override
  Future<void> connect() async {
    if (printers.hanging.contains(address)) await Completer<void>().future;
    if (printers.unreachable.contains(address)) throw const PrinterException('connect_failed');
    _open = true;
  }

  @override
  Future<void> write(Uint8List bytes) async => (printers.printed[address] ??= []).add(bytes);

  @override
  Future<void> disconnect() async => _open = false;

  @override
  Future<bool> status() async => _open;
}
