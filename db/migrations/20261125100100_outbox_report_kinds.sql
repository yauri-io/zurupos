-- migrate:up

-- SPEC §10, §12.6: the two report email kinds.
alter table outbox drop constraint outbox_kind_check;
alter table outbox add constraint outbox_kind_check
  check (kind in ('low_stock', 'password_reset', 'manager_invite', 'daily_summary', 'weekly_summary'));

-- migrate:down
alter table outbox drop constraint outbox_kind_check;
alter table outbox add constraint outbox_kind_check
  check (kind in ('low_stock', 'password_reset', 'manager_invite'));
