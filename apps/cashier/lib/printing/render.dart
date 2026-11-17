// SPEC §11.3 renderers: pure functions from order data to ESC/POS bytes.
import 'dart:typed_data';

import '../api/models.dart';
import '../domain/money.dart';
import 'escpos.dart';

/// Printed words, in the device's language (built from l10n by the caller).
class ReceiptLabels {
  const ReceiptLabels({
    required this.orderNo,
    required this.cashier,
    required this.dineIn,
    required this.takeaway,
    required this.subtotal,
    required this.discount,
    required this.orderDiscount,
    required this.serviceCharge,
    required this.total,
    required this.cashReceived,
    required this.change,
    required this.voided,
    required this.methods,
    required this.testPrint,
    required this.printer,
  });

  final String orderNo;
  final String cashier;
  final String dineIn;
  final String takeaway;
  final String subtotal;
  final String discount;
  final String orderDiscount;
  final String serviceCharge;
  final String total;
  final String cashReceived;
  final String change;
  final String voided;
  final Map<String, String> methods;
  final String testPrint;
  final String printer;
}

class ShopHeader {
  const ShopHeader({required this.name, this.address, this.phone, this.receiptHeader, this.receiptFooter});

  factory ShopHeader.of(ShopSettings s) => ShopHeader(
    name: s.name,
    address: s.address,
    phone: s.phone,
    receiptHeader: s.receiptHeader,
    receiptFooter: s.receiptFooter,
  );

  final String name;
  final String? address;
  final String? phone;
  final String? receiptHeader;
  final String? receiptFooter;
}

/// A preset's own name; a custom discount (no name, D-036) is labelled with its rate.
String _discountName(AppliedDiscount d, ReceiptLabels l) =>
    d.name ?? (d.percent ? '${l.discount} ${formatBps(d.value)}' : l.discount);

/// The customer receipt. [time] is the paid time in the shop's time zone.
/// [drawerKick] adds ESC p after the cut when the order has a cash payment.
Uint8List renderReceipt(
  Order o,
  ShopHeader shop,
  Paper paper, {
  required String time,
  required ReceiptLabels labels,
  bool drawerKick = false,
}) {
  final p = EscPos(paper);
  p.text(shop.name, align: Align.center, bold: true, size: TextSize.double);
  for (final extra in [shop.address, shop.phone, shop.receiptHeader]) {
    if (extra != null && extra.trim().isNotEmpty) p.text(extra, align: Align.center);
  }
  p.rule();
  if (o.voided) {
    p.text('*** ${labels.voided} ***', align: Align.center, bold: true, size: TextSize.quad);
    p.rule();
  }
  p.columns2('${labels.orderNo} ${o.orderNumber}', time, bold: true);
  p.line('${labels.cashier}: ${o.createdBy.name}');
  p.line([o.orderType == 'dine_in' ? labels.dineIn : labels.takeaway, ?o.customerName].join(' - '));
  p.rule();
  for (final line in o.lines) {
    p.columns2('${line.qty} x ${line.itemName}', formatIdr(line.lineGross));
    for (final m in line.modifiers) {
      if (m.priceDelta > 0) {
        p.columns2(m.optionName, '+${formatIdr(m.priceDelta)}', indent: 2);
      } else {
        p.columns2(m.optionName, '', indent: 2);
      }
    }
    if (line.note != null) p.columns2('* ${line.note}', '', indent: 2);
    final d = line.discount;
    if (d != null) {
      p.columns2(_discountName(d, labels), '-${formatIdr(d.amount)}', indent: 2);
    }
  }
  p.rule();
  p.columns2(labels.subtotal, formatIdr(o.subtotal));
  if (o.itemDiscountTotal > 0) p.columns2(labels.discount, '-${formatIdr(o.itemDiscountTotal)}');
  final od = o.orderDiscount;
  if (od != null) {
    p.columns2('${labels.orderDiscount} (${_discountName(od, labels)})', '-${formatIdr(od.amount)}');
  }
  if (o.serviceChargeAmount > 0) {
    p.columns2('${labels.serviceCharge} ${formatBps(o.serviceChargeBps)}', formatIdr(o.serviceChargeAmount));
  }
  if (o.taxAmount > 0) {
    p.columns2('${o.taxName ?? ''} ${formatBps(o.taxBps)}'.trim(), formatIdr(o.taxAmount));
  }
  p.size(TextSize.double);
  p.columns2(labels.total.toUpperCase(), formatIdr(o.total), bold: true);
  p.size(TextSize.normal);
  p.rule();
  for (final pay in o.payments) {
    final method = labels.methods[pay.method] ?? pay.method;
    p.columns2([method, ?pay.provider, ?pay.reference].join(' '), formatIdr(pay.amount));
    if (pay.method == 'cash' && pay.tendered != null && pay.tendered != pay.amount) {
      p.columns2(labels.cashReceived, formatIdr(pay.tendered!), indent: 2);
    }
  }
  if (o.changeDue > 0) p.columns2(labels.change, formatIdr(o.changeDue), bold: true);
  final footer = shop.receiptFooter;
  if (footer != null && footer.trim().isNotEmpty) {
    p.rule();
    p.text(footer, align: Align.center);
  }
  p.feed(3);
  p.cut();
  if (drawerKick && o.payments.any((x) => x.method == 'cash')) p.drawerKick();
  return p.build();
}

/// What a barista ticket needs: from a full order, or from today's summary
/// (employees reprint tickets without opening the order, PRD §6).
class TicketData {
  const TicketData({
    required this.orderNumber,
    required this.customerName,
    required this.dineIn,
    required this.voided,
    required this.lines,
  });

  factory TicketData.fromOrder(Order o) => TicketData(
    orderNumber: o.orderNumber,
    customerName: o.customerName,
    dineIn: o.orderType == 'dine_in',
    voided: o.voided,
    lines: [
      for (final l in o.lines)
        (qty: l.qty, name: l.itemName, modifiers: [for (final m in l.modifiers) m.optionName], note: l.note),
    ],
  );

  factory TicketData.fromSummary(OrderSummary o) => TicketData(
    orderNumber: o.orderNumber,
    customerName: o.customerName,
    dineIn: o.orderType == 'dine_in',
    voided: o.voided,
    lines: [for (final i in o.items) (qty: i.qty, name: i.name, modifiers: i.modifiers, note: i.note)],
  );

  final int orderNumber;
  final String? customerName;
  final bool dineIn;
  final bool voided;
  final List<({int qty, String name, List<String> modifiers, String? note})> lines;
}

/// The barista ticket: big number and name, each modifier on its own line,
/// notes in bold, no prices.
Uint8List renderTicket(TicketData t, Paper paper, {required String time, required ReceiptLabels labels}) {
  final p = EscPos(paper);
  p.text('${labels.orderNo} ${t.orderNumber}', align: Align.center, bold: true, size: TextSize.quad);
  final name = t.customerName;
  if (name != null && name.trim().isNotEmpty) {
    p.text(name, align: Align.center, bold: true, size: TextSize.double);
  }
  p.text('${t.dineIn ? labels.dineIn : labels.takeaway} - $time', align: Align.center);
  if (t.voided) p.text('*** ${labels.voided} ***', align: Align.center, bold: true, size: TextSize.double);
  p.rule();
  for (final l in t.lines) {
    p.text('${l.qty} x ${l.name}', size: TextSize.double);
    for (final m in l.modifiers) {
      p.text('- $m', indent: 2);
    }
    final note = l.note;
    if (note != null && note.trim().isNotEmpty) p.text('! $note', bold: true, indent: 2);
  }
  p.rule();
  p.feed(3);
  p.cut();
  return p.build();
}

/// Settings → Test print: a column ruler and a short sample.
Uint8List renderTestPage(
  Paper paper, {
  required String shopName,
  required String printerName,
  required String time,
  required ReceiptLabels labels,
}) {
  final p = EscPos(paper);
  p.text(labels.testPrint, align: Align.center, bold: true, size: TextSize.double);
  p.text(shopName, align: Align.center);
  p.line('${labels.printer}: $printerName (${paper.mm} mm, ${paper.columns})');
  p.line(time);
  p.rule();
  p.line(List.generate(paper.columns, (i) => '${(i + 1) % 10}').join());
  p.line(List.generate(paper.columns, (i) => (i + 1) % 10 == 0 ? '${(i + 1) ~/ 10}' : ' ').join());
  p.rule();
  p.columns2('1 x Kopi Susu Gula Aren', formatIdr(25000));
  p.columns2('Large', '+${formatIdr(5000)}', indent: 2);
  p.columns2(labels.total.toUpperCase(), formatIdr(30000), bold: true);
  p.rule('=');
  p.feed(3);
  p.cut();
  return p.build();
}
