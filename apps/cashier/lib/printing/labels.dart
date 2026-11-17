import '../l10n/generated/app_localizations.dart';
import 'render.dart';

/// Receipt words in the device's language.
ReceiptLabels receiptLabels(AppLocalizations l) => ReceiptLabels(
  orderNo: l.receiptOrderNo,
  cashier: l.receiptCashier,
  dineIn: l.orderDineIn,
  takeaway: l.orderTakeaway,
  subtotal: l.subtotal,
  discount: l.receiptDiscount,
  orderDiscount: l.orderDiscount,
  serviceCharge: l.serviceCharge('').replaceAll('()', '').trim(),
  total: l.total,
  cashReceived: l.receiptCashReceived,
  change: l.doneChange,
  voided: l.receiptVoid,
  methods: {
    'cash': l.methodCash,
    'qris': l.methodQris,
    'debit': l.methodDebit,
    'credit': l.methodCredit,
    'transfer': l.methodTransfer,
    'other': l.methodOther,
  },
  testPrint: l.testPrintTitle,
  printer: l.printerLabel,
);
