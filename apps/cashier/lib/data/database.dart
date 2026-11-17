import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';

import '../api/models.dart';
import '../printing/print_job.dart';
import 'local_store.dart';

part 'database.g.dart';

/// `GET /device/bootstrap` as last received (one row).
@DataClassName('MenuCacheRow')
class MenuCache extends Table {
  IntColumn get id => integer()();
  TextColumn get menuVersion => text()();
  TextColumn get payload => text()();
  DateTimeColumn get updatedAt => dateTime()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Full `POST /orders` payloads, written before sending (SPEC §11.2).
/// status: pending → synced | rejected. Kept after sync for troubleshooting.
@DataClassName('PendingOrderRow')
class PendingOrders extends Table {
  TextColumn get clientOrderId => text()();
  TextColumn get payload => text()();
  TextColumn get status => text().withDefault(const Constant('pending'))();
  TextColumn get lastError => text().nullable()();
  DateTimeColumn get createdAt => dateTime()();
  DateTimeColumn get resolvedAt => dateTime().nullable()();

  @override
  Set<Column> get primaryKey => {clientOrderId};
}

/// Rendered ESC/POS bytes per printer (SPEC §11.2). status: queued | printing | done | failed.
@DataClassName('PrintJobRow')
class PrintJobs extends Table {
  TextColumn get id => text()();
  TextColumn get orderId => text().nullable()();
  TextColumn get printerId => text()();
  TextColumn get kind => text()();
  BlobColumn get bytes => blob()();
  TextColumn get status => text()();
  TextColumn get error => text().nullable()();
  DateTimeColumn get createdAt => dateTime()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Device-local preferences (language, printers, …).
@DataClassName('SettingRow')
class Settings extends Table {
  TextColumn get key => text()();
  TextColumn get value => text()();

  @override
  Set<Column> get primaryKey => {key};
}

@DriftDatabase(tables: [MenuCache, PendingOrders, Settings, PrintJobs])
class AppDatabase extends _$AppDatabase {
  AppDatabase([QueryExecutor? executor]) : super(executor ?? driftDatabase(name: 'zurupos'));

  @override
  int get schemaVersion => 2;

  @override
  MigrationStrategy get migration => MigrationStrategy(
    onUpgrade: (m, from, to) async {
      if (from < 2) await m.createTable(printJobs);
    },
  );
}

class DriftLocalStore implements LocalStore {
  DriftLocalStore(this.db);

  final AppDatabase db;

  @override
  Future<({String version, Json payload})?> menu() async {
    final row = await (db.select(db.menuCache)..where((t) => t.id.equals(1))).getSingleOrNull();
    if (row == null) return null;
    return (version: row.menuVersion, payload: jsonDecode(row.payload) as Json);
  }

  @override
  Future<void> saveMenu(String version, Json payload) => db
      .into(db.menuCache)
      .insertOnConflictUpdate(
        MenuCacheCompanion.insert(
          id: const Value(1),
          menuVersion: version,
          payload: jsonEncode(payload),
          updatedAt: DateTime.now(),
        ),
      );

  @override
  Future<PendingOrder?> pendingOrder() async {
    final row =
        await (db.select(db.pendingOrders)
              ..where((t) => t.status.equals('pending'))
              ..orderBy([(t) => OrderingTerm.asc(t.createdAt)])
              ..limit(1))
            .getSingleOrNull();
    if (row == null) return null;
    return PendingOrder(
      clientOrderId: row.clientOrderId,
      payload: jsonDecode(row.payload) as Json,
      createdAt: row.createdAt,
      lastError: row.lastError,
    );
  }

  @override
  Future<void> savePending(String clientOrderId, Json payload) => db
      .into(db.pendingOrders)
      .insert(
        PendingOrdersCompanion.insert(
          clientOrderId: clientOrderId,
          payload: jsonEncode(payload),
          createdAt: DateTime.now(),
        ),
      );

  @override
  Future<void> markPendingError(String clientOrderId, String error) =>
      (db.update(db.pendingOrders)..where((t) => t.clientOrderId.equals(clientOrderId))).write(
        PendingOrdersCompanion(lastError: Value(error)),
      );

  @override
  Future<void> resolvePending(String clientOrderId, {required bool synced}) =>
      (db.update(db.pendingOrders)..where((t) => t.clientOrderId.equals(clientOrderId))).write(
        PendingOrdersCompanion(
          status: Value(synced ? 'synced' : 'rejected'),
          resolvedAt: Value(DateTime.now()),
        ),
      );

  @override
  Future<String?> setting(String key) async =>
      (await (db.select(db.settings)..where((t) => t.key.equals(key))).getSingleOrNull())?.value;

  @override
  Future<void> setSetting(String key, String value) =>
      db.into(db.settings).insertOnConflictUpdate(SettingsCompanion.insert(key: key, value: value));

  @override
  Future<void> savePrintJob(PrintJob job) => db
      .into(db.printJobs)
      .insert(
        PrintJobsCompanion.insert(
          id: job.id,
          orderId: Value(job.orderId),
          printerId: job.printerId,
          kind: job.kind.name,
          bytes: job.bytes,
          status: job.status.name,
          createdAt: job.createdAt,
        ),
      );

  @override
  Future<void> setPrintJobStatus(String id, JobStatus status, String? error) =>
      (db.update(db.printJobs)..where((t) => t.id.equals(id))).write(
        PrintJobsCompanion(status: Value(status.name), error: Value(error)),
      );
}
