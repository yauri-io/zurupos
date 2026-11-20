// The signed-in app: navigation by role (SPEC §11.1 #10), offline and pending
// banners, menu refresh every 5 min, heartbeat, and idle auto-lock.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.dart';
import '../domain/permissions.dart';
import '../state/auth.dart';
import '../state/checkout.dart';
import '../state/connection.dart';
import '../state/menu.dart';
import '../state/printing.dart';
import '../state/providers.dart';
import 'common.dart';
import 'screens/done_screen.dart';
import 'screens/order_screen.dart';
import 'screens/orders_today_screen.dart';
import 'screens/report_screen.dart';
import 'screens/settings_screen.dart';
import 'screens/stock_screen.dart';
import 'widgets/banners.dart';

enum Section { order, today, report, stock, settings }

List<Section> sectionsFor(Role role) => [
  if (can(role, 'orders.create')) Section.order,
  Section.today,
  if (can(role, 'reports.view')) Section.report,
  if (can(role, 'stock.adjust')) Section.stock,
  if (can(role, 'device.settings')) Section.settings,
];

class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key, required this.user});

  final StaffMember user;

  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> {
  late final List<Section> _sections = sectionsFor(widget.user.role);
  int _index = 0;
  Timer? _menuTimer;
  Timer? _idleTimer;
  int _idleMinutes = 0;

  @override
  void initState() {
    super.initState();
    Future.microtask(_start);
  }

  Future<void> _start() async {
    // Load device printer settings now, so the first order's auto-print sees them.
    ref
      ..read(printersProvider)
      ..read(autoReturnProvider);
    ref.read(onlineProvider.notifier).start();
    if (widget.user.takesOrders) {
      // On staff login, then every 5 min (SPEC §11.2).
      await ref.read(menuProvider.notifier).refresh();
      _menuTimer = Timer.periodic(
        const Duration(minutes: 5),
        (_) => ref.read(menuProvider.notifier).refresh(),
      );
      _idleMinutes = ref.read(menuProvider).value?.settings.idleLockMinutes ?? 0;
    } else {
      try {
        _idleMinutes = (await ref.read(apiProvider).settings()).idleLockMinutes;
      } catch (_) {
        // Keep the default (off) until the next login.
      }
    }
    _resetIdle();
  }

  void _resetIdle() {
    _idleTimer?.cancel();
    if (_idleMinutes <= 0 || !mounted) return;
    _idleTimer = Timer(Duration(minutes: _idleMinutes), () => ref.read(authProvider.notifier).signOut());
  }

  @override
  void dispose() {
    _menuTimer?.cancel();
    _idleTimer?.cancel();
    super.dispose();
  }

  String _label(Section s) {
    final l = context.l10n;
    return switch (s) {
      Section.order => l.navOrder,
      Section.today => l.navOrdersToday,
      Section.report => l.navReport,
      Section.stock => l.navStock,
      Section.settings => l.navSettings,
    };
  }

  IconData _icon(Section s) => switch (s) {
    Section.order => Icons.point_of_sale,
    Section.today => Icons.receipt_long,
    Section.report => Icons.bar_chart,
    Section.stock => Icons.inventory_2_outlined,
    Section.settings => Icons.settings_outlined,
  };

  Widget _page(Section s) => switch (s) {
    Section.order => const OrderScreen(),
    Section.today => const OrdersTodayScreen(),
    Section.report => const ReportScreen(),
    Section.stock => const StockScreen(),
    Section.settings => const SettingsScreen(),
  };

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final shop = ref.watch(menuProvider).value?.settings.name;
    final wide = MediaQuery.sizeOf(context).width >= 840;
    final body = Column(
      children: [
        const OfflineBanner(),
        PendingOrderBanner(
          onSent: (Sent r) =>
              Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => DoneScreen(order: r.order))),
        ),
        Expanded(child: _page(_sections[_index])),
      ],
    );
    return Listener(
      behavior: HitTestBehavior.translucent,
      onPointerDown: (_) => _resetIdle(),
      child: Scaffold(
        appBar: AppBar(
          title: Text([?shop, widget.user.name].join(' · ')),
          actions: [
            TextButton.icon(
              key: const Key('switch-user'),
              onPressed: () => ref.read(authProvider.notifier).signOut(),
              icon: const Icon(Icons.logout),
              label: Text(l.navSwitchUser),
            ),
          ],
        ),
        body: wide
            ? Row(
                children: [
                  NavigationRail(
                    selectedIndex: _index,
                    labelType: NavigationRailLabelType.all,
                    onDestinationSelected: (i) => setState(() => _index = i),
                    destinations: [
                      for (final s in _sections)
                        NavigationRailDestination(icon: Icon(_icon(s)), label: Text(_label(s))),
                    ],
                  ),
                  const VerticalDivider(width: 1),
                  Expanded(child: body),
                ],
              )
            : body,
        bottomNavigationBar: wide || _sections.length < 2
            ? null
            : NavigationBar(
                selectedIndex: _index,
                onDestinationSelected: (i) => setState(() => _index = i),
                destinations: [
                  for (final s in _sections) NavigationDestination(icon: Icon(_icon(s)), label: _label(s)),
                ],
              ),
      ),
    );
  }
}
