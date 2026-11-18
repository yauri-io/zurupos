// SPEC §11.3 PrinterTransport: Bluetooth Classic (Android SPP) and network (port 9100).
import 'dart:io';
import 'dart:typed_data';

import 'package:permission_handler/permission_handler.dart';
import 'package:print_bluetooth_thermal/print_bluetooth_thermal.dart';

import 'printer_config.dart';

class PrinterException implements Exception {
  const PrinterException(this.code);

  /// `bluetooth_permission`, `bluetooth_off`, `connect_failed`, `write_failed`, `timeout`.
  final String code;

  @override
  String toString() => 'PrinterException($code)';
}

abstract interface class PrinterTransport {
  Future<void> connect();
  Future<void> write(Uint8List bytes);
  Future<void> disconnect();
  Future<bool> status();
}

typedef TransportFactory = PrinterTransport Function(PrinterConfig config);

PrinterTransport defaultTransport(PrinterConfig c) => switch (c.transport) {
  TransportKind.network => NetworkTransport(c.hostPort.host, c.hostPort.port),
  TransportKind.bluetooth => BluetoothClassicTransport(c.address),
};

class NetworkTransport implements PrinterTransport {
  NetworkTransport(this.host, this.port, {this.timeout = const Duration(seconds: 3)});

  final String host;
  final int port;
  final Duration timeout;
  Socket? _socket;

  @override
  Future<void> connect() async {
    try {
      _socket = await Socket.connect(host, port, timeout: timeout);
    } on SocketException {
      throw const PrinterException('connect_failed');
    }
  }

  @override
  Future<void> write(Uint8List bytes) async {
    final s = _socket;
    if (s == null) throw const PrinterException('connect_failed');
    try {
      s.add(bytes);
      await s.flush();
    } on SocketException {
      throw const PrinterException('write_failed');
    }
  }

  @override
  Future<void> disconnect() async {
    await _socket?.close();
    _socket?.destroy();
    _socket = null;
  }

  @override
  Future<bool> status() async => _socket != null;
}

/// Android 12+ needs BLUETOOTH_CONNECT/BLUETOOTH_SCAN at runtime; older versions
/// grant Bluetooth at install time.
Future<bool> ensureBluetoothPermission() async {
  if (!Platform.isAndroid) return false;
  final results = await [Permission.bluetoothConnect, Permission.bluetoothScan].request();
  return results.values.every((s) => s.isGranted || s.isLimited) ||
      await PrintBluetoothThermal.isPermissionBluetoothGranted;
}

/// Printers already paired in Android's Bluetooth settings (SPEC §11.3).
Future<List<({String name, String address})>> bondedPrinters() async {
  if (!await ensureBluetoothPermission()) throw const PrinterException('bluetooth_permission');
  if (!await PrintBluetoothThermal.bluetoothEnabled) throw const PrinterException('bluetooth_off');
  return [for (final d in await PrintBluetoothThermal.pairedBluetooths) (name: d.name, address: d.macAdress)];
}

/// How long to wait after a Bluetooth write before the socket may close.
/// Android drops bytes still queued in the stack when an RFCOMM socket closes,
/// so a receipt would lose its tail. Assumes a slow ~4 KB/s SPP link.
Duration bluetoothDrainTime(int bytes) => Duration(milliseconds: 300 + bytes ~/ 4);

/// The plugin holds one connection at a time; the print queue runs one job at a time.
class BluetoothClassicTransport implements PrinterTransport {
  BluetoothClassicTransport(this.mac, {this.drainTime = bluetoothDrainTime});

  final String mac;
  final Duration Function(int bytes) drainTime;

  @override
  Future<void> connect() async {
    if (!await ensureBluetoothPermission()) throw const PrinterException('bluetooth_permission');
    if (!await PrintBluetoothThermal.bluetoothEnabled) throw const PrinterException('bluetooth_off');
    if (await PrintBluetoothThermal.connectionStatus) await PrintBluetoothThermal.disconnect;
    if (!await PrintBluetoothThermal.connect(macPrinterAddress: mac)) {
      throw const PrinterException('connect_failed');
    }
  }

  @override
  Future<void> write(Uint8List bytes) async {
    // The plugin casts its argument to List<Int>; a Uint8List arrives on Android
    // as byte[], fails that cast and the write silently returns false.
    if (!await PrintBluetoothThermal.writeBytes(List<int>.of(bytes, growable: false))) {
      throw const PrinterException('write_failed');
    }
    await Future<void>.delayed(drainTime(bytes.length));
  }

  @override
  Future<void> disconnect() async => PrintBluetoothThermal.disconnect;

  @override
  Future<bool> status() => PrintBluetoothThermal.connectionStatus;
}
