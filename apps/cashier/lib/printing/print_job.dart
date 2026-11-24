import 'dart:typed_data';

enum PrintKind { receipt, ticket, test }

enum JobStatus { queued, printing, done, failed }

/// Rendered bytes for one printer (SPEC §11.2 `print_jobs`).
class PrintJob {
  const PrintJob({
    required this.id,
    required this.printerId,
    required this.printerName,
    required this.kind,
    required this.bytes,
    required this.createdAt,
    this.orderId,
    this.status = JobStatus.queued,
    this.error,
  });

  final String id;
  final String? orderId;
  final String printerId;
  final String printerName;
  final PrintKind kind;
  final Uint8List bytes;
  final DateTime createdAt;
  final JobStatus status;

  /// A [PrinterException] code when failed.
  final String? error;

  PrintJob withStatus(JobStatus status, {String? error}) => PrintJob(
    id: id,
    orderId: orderId,
    printerId: printerId,
    printerName: printerName,
    kind: kind,
    bytes: bytes,
    createdAt: createdAt,
    status: status,
    error: error,
  );
}

/// Where an order's print jobs stand, for the Done screen's auto-return (D-062).
enum PrintPhase { none, printing, done, failed }

/// A failure wins over jobs still running, so the screen stops at once.
PrintPhase printPhase(Iterable<PrintJob> jobs) {
  if (jobs.isEmpty) return PrintPhase.none;
  if (jobs.any((j) => j.status == JobStatus.failed)) return PrintPhase.failed;
  if (jobs.every((j) => j.status == JobStatus.done)) return PrintPhase.done;
  return PrintPhase.printing;
}
