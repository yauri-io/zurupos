// SPEC §11.3 PrinterConfig: up to 2 printers per device, kept in local settings.
import 'dart:convert';

import '../api/models.dart';
import 'escpos.dart';
import 'print_job.dart';

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
    // A new printer prints only when asked (D-061); saved configs keep their own value.
    this.autoReceipt = false,
    this.autoTicket = false,
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
    // A saved 'drawer_kick' key from before D-067 is ignored.
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
  };
}

/// Printers with the [kind] role that don't auto-print it: the Done screen's
/// manual print goes only to these, so nothing prints twice (D-063).
List<PrinterConfig> manualPrinters(List<PrinterConfig> printers, PrintKind kind) => [
  for (final p in printers)
    if (switch (kind) {
      PrintKind.receipt => p.receipt && !p.autoReceipt,
      PrintKind.ticket => p.ticket && !p.autoTicket,
      PrintKind.test => false,
    })
      p,
];

String encodePrinters(List<PrinterConfig> printers) => jsonEncode([for (final p in printers) p.toJson()]);

List<PrinterConfig> decodePrinters(String? json) => json == null
    ? const []
    : (jsonDecode(json) as List<dynamic>).cast<Json>().map(PrinterConfig.fromJson).toList();
