// D-051: a one-day sales summary on the tablet for the owner (reports.view).
// It reads the same owner reports as the dashboard (SPEC §12.2); the API
// refuses them for every other role.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/models.dart';
import '../../domain/business_day.dart';
import '../../domain/money.dart';
import '../../state/menu.dart';
import '../../state/providers.dart';
import '../common.dart';

/// Today's business date in the shop's time zone and cutoff hour.
final businessTodayProvider = FutureProvider.autoDispose<String>((ref) async {
  final s = ref.read(menuProvider).value?.settings ?? await ref.read(apiProvider).settings();
  return businessToday(ref.read(clockProvider)(), s.timezone, s.businessDayCutoffHour);
});

/// 0 = today, -1 = yesterday.
final dayReportProvider = FutureProvider.autoDispose.family<DayReport, int>((ref, offset) async {
  final today = await ref.watch(businessTodayProvider.future);
  return ref.read(apiProvider).dayReport(addDays(today, offset));
});

class ReportScreen extends ConsumerStatefulWidget {
  const ReportScreen({super.key});

  @override
  ConsumerState<ReportScreen> createState() => _ReportScreenState();
}

class _ReportScreenState extends ConsumerState<ReportScreen> {
  int _offset = 0;

  Future<void> _refresh() async {
    ref
      ..invalidate(businessTodayProvider)
      ..invalidate(dayReportProvider(_offset));
    await ref.read(dayReportProvider(_offset).future);
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final report = ref.watch(dayReportProvider(_offset));
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              SegmentedButton<int>(
                segments: [
                  ButtonSegment(value: 0, label: Text(l.reportToday, key: const Key('report-today'))),
                  ButtonSegment(
                    value: -1,
                    label: Text(l.reportYesterday, key: const Key('report-yesterday')),
                  ),
                ],
                selected: {_offset},
                onSelectionChanged: (v) => setState(() => _offset = v.first),
              ),
              const Spacer(),
              IconButton(
                key: const Key('report-refresh'),
                tooltip: l.commonRetry,
                icon: const Icon(Icons.refresh),
                onPressed: _refresh,
              ),
            ],
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: _refresh,
            child: report.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => ListView(
                children: [
                  Padding(padding: const EdgeInsets.all(24), child: Text(errorText(l, e))),
                  Center(
                    child: FilledButton(onPressed: _refresh, child: Text(l.commonRetry)),
                  ),
                ],
              ),
              data: (r) => _ReportBody(report: r),
            ),
          ),
        ),
      ],
    );
  }
}

class _ReportBody extends StatelessWidget {
  const _ReportBody({required this.report});

  final DayReport report;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final text = Theme.of(context).textTheme;
    final r = report;
    final top = [...r.items]..sort((a, b) => b.qty.compareTo(a.qty));
    return ListView(
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 24),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(l.reportTotalCollected, style: text.titleMedium),
                Text(formatIdr(r.totalCollected), key: const Key('report-total'), style: text.displaySmall),
                const SizedBox(height: 4),
                Text(
                  '${l.reportNOrders(r.orders)} · ${l.reportAov} ${formatIdr(r.averageOrderValue)}',
                  key: const Key('report-orders'),
                ),
              ],
            ),
          ),
        ),
        if (r.orders == 0)
          ListTile(title: Text(l.reportEmpty))
        else ...[
          _Section(
            children: [
              _Row(l.reportGrossSales, r.grossSales),
              _Row(l.reportDiscounts, -r.discounts),
              _Row(l.reportNetSales, r.netSales, bold: true),
              if (r.serviceCharge != 0) _Row(l.reportServiceCharge, r.serviceCharge),
              if (r.tax != 0) _Row(l.reportTax, r.tax),
            ],
          ),
          _Section(
            title: l.reportPayments,
            children: [
              for (final p in r.payments)
                _Row(
                  [methodLabel(l, p.method), ?p.provider].join(' · '),
                  p.amount,
                  key: Key('report-method-${p.method}${p.provider == null ? '' : '-${p.provider}'}'),
                ),
            ],
          ),
          _Section(
            title: l.reportTopItems,
            children: [
              for (final i in top.take(5))
                ListTile(dense: true, title: Text(i.name), trailing: Text(l.reportQtySold(i.qty))),
            ],
          ),
        ],
        if (r.voidCount > 0)
          _Section(
            title: l.reportVoids,
            children: [_Row(l.reportNOrders(r.voidCount), r.voidTotal, key: const Key('report-voids'))],
          ),
        Padding(
          padding: const EdgeInsets.all(12),
          child: Text(l.reportOwnerNote, style: text.bodySmall),
        ),
      ],
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({this.title, required this.children});

  final String? title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Card(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (title != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: Text(title!, style: Theme.of(context).textTheme.titleMedium),
          ),
        ...children,
      ],
    ),
  );
}

class _Row extends StatelessWidget {
  const _Row(this.label, this.amount, {super.key, this.bold = false});

  final String label;
  final int amount;
  final bool bold;

  @override
  Widget build(BuildContext context) {
    final style = bold ? const TextStyle(fontWeight: FontWeight.bold) : null;
    return ListTile(
      dense: true,
      title: Text(label, style: style),
      trailing: Text(formatIdr(amount), style: style),
    );
  }
}
