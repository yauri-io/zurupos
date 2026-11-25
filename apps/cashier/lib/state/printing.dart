// Printers and the print queue (SPEC §11.3). Jobs run one at a time after the
// order is committed; a failure is shown and can be retried, and never touches
// the order itself.
import 'dart:async';
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.dart';
import '../l10n/generated/app_localizations.dart';
import '../printing/labels.dart';
import '../printing/print_job.dart';
import '../printing/printer_config.dart';
import '../printing/render.dart';
import '../printing/shop_time.dart';
import '../printing/transport.dart';
import 'locale.dart';
import 'menu.dart';
import 'providers.dart';

final transportFactoryProvider = Provider<TransportFactory>((ref) => defaultTransport);

/// Connect + write + disconnect must finish within this.
const printTimeout = Duration(seconds: 10);

class PrintersController extends Notifier<List<PrinterConfig>> {
  @override
  List<PrinterConfig> build() {
    Future.microtask(() async {
      final saved = decodePrinters(await ref.read(localStoreProvider).setting('printers'));
      if (ref.mounted) state = saved;
    });
    return const [];
  }

  Future<void> _save(List<PrinterConfig> list) async {
    state = list;
    await ref.read(localStoreProvider).setSetting('printers', encodePrinters(list));
  }

  Future<void> upsert(PrinterConfig p) async {
    final i = state.indexWhere((x) => x.id == p.id);
    if (i < 0 && state.length >= maxPrinters) throw StateError('at most $maxPrinters printers');
    await _save(i < 0 ? [...state, p] : [for (final x in state) x.id == p.id ? p : x]);
  }

  Future<void> remove(String id) => _save([
    for (final x in state)
      if (x.id != id) x,
  ]);
}

final printersProvider = NotifierProvider<PrintersController, List<PrinterConfig>>(PrintersController.new);

/// Device setting: seconds before the Done screen returns to a new order (0 = off).
class AutoReturnController extends Notifier<int> {
  @override
  int build() {
    Future.microtask(() async {
      final saved = int.tryParse(await ref.read(localStoreProvider).setting('auto_return_seconds') ?? '');
      if (saved != null && ref.mounted) state = saved;
    });
    return 5;
  }

  Future<void> set(int seconds) async {
    state = seconds.clamp(0, 60);
    await ref.read(localStoreProvider).setSetting('auto_return_seconds', '$state');
  }
}

final autoReturnProvider = NotifierProvider<AutoReturnController, int>(AutoReturnController.new);

class PrintQueue extends Notifier<List<PrintJob>> {
  Future<void> _tail = Future.value();

  @override
  List<PrintJob> build() => const [];

  AppLocalizations get _l10n => lookupAppLocalizations(ref.read(localeProvider));
  ShopSettings? get _shop => ref.read(menuProvider).value?.settings;
  String get _tz => _shop?.timezone ?? 'Asia/Jakarta';

  List<PrintJob> jobsFor(String orderId) => [
    for (final j in state)
      if (j.orderId == orderId) j,
  ];

  /// After *Complete*: the printers set to auto-print each role.
  void autoPrint(Order o) {
    for (final p in ref.read(printersProvider)) {
      if (p.receipt && p.autoReceipt) _enqueue(p, PrintKind.receipt, o.id, _receipt(o, p));
      if (p.ticket && p.autoTicket) {
        _enqueue(p, PrintKind.ticket, o.id, _ticket(TicketData.fromOrder(o), o.paidAt, p));
      }
    }
  }

  /// Done screen's manual print: the printers that didn't auto-print [kind].
  void printManual(Order o, PrintKind kind) {
    for (final p in manualPrinters(ref.read(printersProvider), kind)) {
      switch (kind) {
        case PrintKind.receipt:
          _enqueue(p, kind, o.id, _receipt(o, p));
        case PrintKind.ticket:
          _enqueue(p, kind, o.id, _ticket(TicketData.fromOrder(o), o.paidAt, p));
        case PrintKind.test:
          break;
      }
    }
  }

  /// Reprint on every printer with the role. Returns how many jobs were queued.
  int reprintReceipt(Order o) {
    final printers = ref.read(printersProvider).where((p) => p.receipt).toList();
    for (final p in printers) {
      _enqueue(p, PrintKind.receipt, o.id, _receipt(o, p));
    }
    return printers.length;
  }

  int reprintTicket(TicketData t, String orderId, DateTime paidAt) {
    final printers = ref.read(printersProvider).where((p) => p.ticket).toList();
    for (final p in printers) {
      _enqueue(p, PrintKind.ticket, orderId, _ticket(t, paidAt, p));
    }
    return printers.length;
  }

  /// Settings → Test print. Completes with the job's final state.
  Future<PrintJob> testPrint(PrinterConfig p) {
    final job = _enqueue(
      p,
      PrintKind.test,
      null,
      renderTestPage(
        p.paper,
        shopName: _shop?.name ?? 'ZuruPOS',
        printerName: p.name,
        time: receiptTime(DateTime.now().toUtc(), _tz),
        labels: receiptLabels(_l10n),
      ),
    );
    return _tail.then((_) => state.firstWhere((j) => j.id == job.id));
  }

  void retry(String jobId) {
    final job = state.firstWhere((j) => j.id == jobId);
    final printer = ref.read(printersProvider).where((p) => p.id == job.printerId).firstOrNull;
    if (printer == null) return;
    _set(job.withStatus(JobStatus.queued));
    _run(job.id, printer);
  }

  /// Completes when every queued job has finished (tests, and the Done screen).
  Future<void> get idle => _tail;

  Uint8List _receipt(Order o, PrinterConfig p) {
    final shop = _shop;
    return renderReceipt(
      o,
      shop == null ? const ShopHeader(name: 'ZuruPOS') : ShopHeader.of(shop),
      p.paper,
      time: receiptTime(o.paidAt, _tz),
      labels: receiptLabels(_l10n),
    );
  }

  Uint8List _ticket(TicketData t, DateTime paidAt, PrinterConfig p) =>
      renderTicket(t, p.paper, time: ticketTime(paidAt, _tz), labels: receiptLabels(_l10n));

  PrintJob _enqueue(PrinterConfig p, PrintKind kind, String? orderId, Uint8List bytes) {
    final job = PrintJob(
      id: ref.read(newIdProvider)(),
      orderId: orderId,
      printerId: p.id,
      printerName: p.name,
      kind: kind,
      bytes: bytes,
      createdAt: DateTime.now(),
    );
    state = [...state.length > 50 ? state.sublist(state.length - 50) : state, job];
    unawaited(ref.read(localStoreProvider).savePrintJob(job).catchError((Object _) {}));
    _run(job.id, p);
    return job;
  }

  void _set(PrintJob job) {
    if (!ref.mounted) return;
    state = [for (final j in state) j.id == job.id ? job : j];
    unawaited(
      ref.read(localStoreProvider).setPrintJobStatus(job.id, job.status, job.error).catchError((Object _) {}),
    );
  }

  void _run(String jobId, PrinterConfig printer) {
    _tail = _tail.then((_) async {
      if (!ref.mounted) return;
      final job = state.firstWhere((j) => j.id == jobId);
      _set(job.withStatus(JobStatus.printing));
      final transport = ref.read(transportFactoryProvider)(printer);
      try {
        await () async {
          await transport.connect();
          await transport.write(job.bytes);
        }().timeout(printTimeout);
        _set(job.withStatus(JobStatus.done));
      } on PrinterException catch (e) {
        _set(job.withStatus(JobStatus.failed, error: e.code));
      } on TimeoutException {
        _set(job.withStatus(JobStatus.failed, error: 'timeout'));
      } catch (_) {
        _set(job.withStatus(JobStatus.failed, error: 'write_failed'));
      } finally {
        try {
          await transport.disconnect();
        } catch (_) {
          // Already gone.
        }
      }
    });
  }
}

final printQueueProvider = NotifierProvider<PrintQueue, List<PrintJob>>(PrintQueue.new);
