-- ---------------------------------------------------------------------------
-- Money: payments, a double-entry ledger, invoices, refunds, payouts.
-- Every ledger transaction (txn_id) sums to zero. Balances are always read
-- from the ledger, never stored.
-- ---------------------------------------------------------------------------

create table if not exists public.payments (
  id               uuid primary key default gen_random_uuid(),
  booking_id       uuid references public.bookings (id) on delete set null,
  parent_id        uuid references public.profiles (id) on delete set null,
  idempotency_key  text not null unique,
  method           text not null check (method in ('card', 'mada', 'applepay', 'stcpay', 'wallet')),
  amount_h         bigint not null check (amount_h >= 0),
  status           text not null check (status in ('succeeded', 'failed')),
  failure_code     text,
  card_brand       text,
  card_last4       text check (card_last4 ~ '^[0-9]{4}$'),
  reference        text,
  created_at       timestamptz not null default now()
);
create index if not exists payments_booking_idx on public.payments (booking_id);

create table if not exists public.ledger_entries (
  id          bigserial primary key,
  txn_id      uuid not null,
  account     text not null check (account in ('parent_wallet', 'parent_external', 'driver_payable',
                'platform_revenue', 'vat_payable', 'promo', 'payout_external')),
  user_id     uuid,
  booking_id  uuid references public.bookings (id) on delete set null,
  payment_id  uuid references public.payments (id) on delete set null,
  amount_h    bigint not null,
  kind        text not null check (kind in ('charge', 'refund', 'topup', 'payout')),
  memo        text,
  created_at  timestamptz not null default now()
);
create index if not exists ledger_user_idx on public.ledger_entries (account, user_id);
create index if not exists ledger_txn_idx on public.ledger_entries (txn_id);

create sequence if not exists public.invoice_seq;

create table if not exists public.invoices (
  id          uuid primary key default gen_random_uuid(),
  number      text not null unique,
  kind        text not null check (kind in ('invoice', 'credit_note')),
  booking_id  uuid references public.bookings (id) on delete set null,
  payment_id  uuid references public.payments (id) on delete set null,
  refund_id   uuid,
  parent_id   uuid,
  driver_id   uuid,
  driver_h    bigint not null,
  vat_h       bigint not null,
  fee_h       bigint not null,
  total_h     bigint not null,
  vat_bp      int not null,
  fee_bp      int not null,
  days        smallint,
  method      text,
  issued_at   timestamptz not null default now()
);

create table if not exists public.refunds (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid references public.bookings (id) on delete set null,
  parent_id     uuid,
  initiated_by  text not null check (initiated_by in ('parent', 'driver', 'admin')),
  reason        text,
  days          smallint not null,
  driver_h      bigint not null,
  vat_h         bigint not null,
  fee_h         bigint not null,
  total_h       bigint not null,
  destination   text not null check (destination in ('wallet', 'card')),
  created_at    timestamptz not null default now()
);

create table if not exists public.payout_runs (
  id          uuid primary key default gen_random_uuid(),
  created_by  uuid,
  total_h     bigint not null,
  count       int not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.payouts (
  id           uuid primary key default gen_random_uuid(),
  run_id       uuid not null references public.payout_runs (id) on delete cascade,
  driver_id    uuid references public.drivers (id) on delete set null,
  amount_h     bigint not null,
  bank_name    text,
  iban_masked  text,
  status       text not null default 'simulated',
  created_at   timestamptz not null default now()
);

alter table public.payments       enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.invoices       enable row level security;
alter table public.refunds        enable row level security;
alter table public.payout_runs    enable row level security;
alter table public.payouts        enable row level security;
revoke all on public.payments, public.ledger_entries, public.invoices, public.refunds,
  public.payout_runs, public.payouts from anon, authenticated;
revoke all on sequence public.invoice_seq from anon, authenticated;
