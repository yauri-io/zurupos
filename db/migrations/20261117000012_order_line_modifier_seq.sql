-- migrate:up

-- Receipts and tickets list a line's modifiers in modifier-sheet order (D-035).
alter table order_line_modifiers add column seq smallint not null default 1 check (seq >= 1);

-- migrate:down
alter table order_line_modifiers drop column seq;
