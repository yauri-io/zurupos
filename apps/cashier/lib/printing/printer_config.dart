// SPEC §11.3 PrinterConfig: up to 2 printers per device, kept in local settings.
import 'dart:convert';

import '../api/models.dart';
import 'escpos.dart';

enum TransportKind { bluetooth, network }

const maxPrinters = 2;
const defaultNetworkPort = 9100;

class PrinterConfig {
  const PrinterConfig({
    required this.id,
    required this.name,
    required this.transport,
    required this.address,
    this.paper = Paper.mm58,
    this.receipt = true,
    this.ticket = false,
    this.autoReceipt = true,
    this.autoTicket = true,
    this.drawerKick = false,
  });

  factory PrinterConfig.fromJson(Json j) => PrinterConfig(
    id: j['id'] as String,
    name: j['name'] as String,
    transport: TransportKind.values.byName(j['transport'] as String),
    address: j['address'] as String,
    paper: Paper.fromWidth(j['paper'] as int),
    receipt: j['receipt'] as bool,
    ticket: j['ticket'] as bool,
    autoReceipt: j['auto_receipt'] as bool,
    autoTicket: j['auto_ticket'] as bool,
    drawerKick: j['drawer_kick'] as bool,
  );

  final String id;
  final String name;
  final TransportKind transport;

  /// Bluetooth MAC (bonded device) or `host:port` / `host` for network.
  final String address;
  final Paper paper;

  /// Roles: prints customer receipts and/or barista tickets.
  final bool receipt;
  final bool ticket;
  final bool autoReceipt;
  final bool autoTicket;

  /// ESC p after a receipt with a cash payment.
  final bool drawerKick;

  ({String host, int port}) get hostPort {
    final i = address.lastIndexOf(':');
    if (i > 0) {
      final port = int.tryParse(address.substring(i + 1));
      if (port != null) return (host: address.substring(0, i), port: port);
    }
    return (host: address, port: defaultNetworkPort);
  }

  PrinterConfig copyWith({
    String? name,
    TransportKind? transport,
    String? address,
    Paper? paper,
    bool? receipt,
    bool? ticket,
    bool? autoReceipt,
    bool? autoTicket,
    bool? drawerKick,
  }) => PrinterConfig(
    id: id,
    name: name ?? this.name,
    transport: transport ?? this.transport,
    address: address ?? this.address,
    paper: paper ?? this.paper,
    receipt: receipt ?? this.receipt,
    ticket: ticket ?? this.ticket,
    autoReceipt: autoReceipt ?? this.autoReceipt,
    autoTicket: autoTicket ?? this.autoTicket,
    drawerKick: drawerKick ?? this.drawerKick,
  );

  Json toJson() => {
    'id': id,
    'name': name,
    'transport': transport.name,
    'address': address,
    'paper': paper.mm,
    'receipt': receipt,
    'ticket': ticket,
    'auto_receipt': autoReceipt,
    'auto_ticket': autoTicket,
    'drawer_kick': drawerKick,
  };
}

String encodePrinters(List<PrinterConfig> printers) => jsonEncode([for (final p in printers) p.toJson()]);

List<PrinterConfig> decodePrinters(String? json) => json == null
    ? const []
    : (jsonDecode(json) as List<dynamic>).cast<Json>().map(PrinterConfig.fromJson).toList();
