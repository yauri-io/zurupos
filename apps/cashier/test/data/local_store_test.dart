// SPEC §11.2 local data: the drift store and the in-memory test double behave alike.
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zurupos_cashier/data/database.dart';

import 'dart:typed_data';

import 'package:zurupos_cashier/data/local_store.dart';
import 'package:zurupos_cashier/printing/print_job.dart';

void main() {
  final stores = <String, LocalStore Function()>{
    'drift': () => DriftLocalStore(AppDatabase(NativeDatabase.memory())),
    'memory': MemoryLocalStore.new,
  };

  for (final MapEntry(key: name, value: make) in stores.entries) {
    group(name, () {
      test('menu cache round-trips and is replaced', () async {
        final s = make();
        expect(await s.menu(), isNull);
        await s.saveMenu('v1', {'a': 1});
        await s.saveMenu('v2', {
          'b': [1, 2],
        });
        final m = await s.menu();
        expect(m?.version, 'v2');
        expect(m?.payload, {
          'b': [1, 2],
        });
      });

      test('pending orders: oldest first, error kept, resolved ones stop blocking', () async {
        final s = make();
        await s.savePending('o1', {'client_order_id': 'o1', 'expected_total': 1000});
        await Future<void>.delayed(const Duration(milliseconds: 5));
        await s.savePending('o2', {'client_order_id': 'o2', 'expected_total': 2000});
        await s.markPendingError('o1', 'NETWORK');
        var p = await s.pendingOrder();
        expect([p?.clientOrderId, p?.total, p?.lastError], ['o1', 1000, 'NETWORK']);
        await s.resolvePending('o1', synced: true);
        p = await s.pendingOrder();
        expect(p?.clientOrderId, 'o2');
        await s.resolvePending('o2', synced: false);
        expect(await s.pendingOrder(), isNull);
      });

      test('print jobs are stored with their bytes and status', () async {
        final s = make();
        await s.savePrintJob(
          PrintJob(
            id: 'j1',
            orderId: 'o1',
            printerId: 'p1',
            printerName: 'Bar',
            kind: PrintKind.ticket,
            bytes: Uint8List.fromList([0x1B, 0x40]),
            createdAt: DateTime(2026, 11, 28),
          ),
        );
        await s.setPrintJobStatus('j1', JobStatus.failed, 'connect_failed');
        if (s is DriftLocalStore) {
          final row = await s.db.select(s.db.printJobs).getSingle();
          expect(
            [row.status, row.error, row.bytes, row.kind],
            [
              'failed',
              'connect_failed',
              [0x1B, 0x40],
              'ticket',
            ],
          );
        } else if (s is MemoryLocalStore) {
          expect(s.printJobs['j1']?.status, JobStatus.failed);
        }
      });

      test('settings', () async {
        final s = make();
        expect(await s.setting('locale'), isNull);
        await s.setSetting('locale', 'en');
        await s.setSetting('locale', 'id');
        expect(await s.setting('locale'), 'id');
      });
    });
  }
}
