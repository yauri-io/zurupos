// The slice of the PRD §6 matrix (apps/api/src/auth/permissions.ts) the app
// uses to choose what to show. The API enforces it regardless.
import '../api/models.dart';

const _o = Role.owner, _m = Role.manager, _c = Role.cashier, _e = Role.employee;

const _matrix = <String, Set<Role>>{
  'orders.create': {_o, _m, _c},
  'discounts.apply_custom': {_o, _m},
  'orders.void': {_o, _m},
  'orders.void_with_approval': {_c},
  'orders.view_detail': {_o, _m, _c},
  'stock.adjust': {_o, _m, _e},
  'menu.availability': {_o, _m, _c},
  'device.settings': {_o, _m},
};

bool can(Role role, String permission) => _matrix[permission]?.contains(role) ?? false;
