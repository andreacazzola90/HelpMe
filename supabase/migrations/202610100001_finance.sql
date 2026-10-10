create table public.app_owner (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references auth.users(id)
);
alter table public.app_owner enable row level security;

create function public.owner_mfa() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_owner where user_id = auth.uid()) and coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2';
$$;
revoke all on function public.owner_mfa() from public;
grant execute on function public.owner_mfa() to authenticated;

create table public.categories (
  name text primary key check (length(name) between 1 and 60),
  color text not null default '#19765b' check (color ~ '^#[0-9a-fA-F]{6}$')
);
insert into public.categories(name, color) values
  ('Alimentari','#19765b'), ('Casa','#d19a22'), ('Trasporti','#427dba'), ('Ristoranti','#cf6265'),
  ('Shopping','#758e55'), ('Salute','#8a729e'), ('Tempo libero','#519e9a'), ('Servizi','#be7c45'),
  ('Prelievi','#636b73'), ('Trasferimenti','#636b73'), ('Stipendio','#19765b');

create table public.rules (
  id uuid primary key default gen_random_uuid(),
  pattern text not null check (length(trim(pattern)) between 1 and 150),
  category text not null references public.categories(name) on update cascade,
  priority integer not null default 10,
  unique(pattern)
);
insert into public.rules(pattern, category) values
  ('esselunga','Alimentari'), ('supermercato','Alimentari'), ('ristorante','Ristoranti'), ('netflix','Servizi'),
  ('farmacia','Salute'), ('trenitalia','Trasporti'), ('affitto','Casa');

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  account_key text not null,
  date date not null,
  description text not null check (length(description) between 1 and 2000),
  amount_cents bigint not null check (amount_cents <> 0 and abs(amount_cents) < 1000000000000),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  kind text not null check (kind in ('expense','income','refund','withdrawal','transfer')),
  category text references public.categories(name) on update cascade,
  category_locked boolean not null default false,
  source text not null check (source in ('manual','csv','api')),
  fingerprint text not null,
  external_reference text,
  reconciled_to uuid references public.transactions(id),
  refund_of uuid references public.transactions(id),
  raw jsonb not null default '{}',
  created_at timestamptz not null default now(),
  check (reconciled_to is null or reconciled_to <> id),
  check (refund_of is null or (refund_of <> id and kind = 'refund')),
  check ((kind in ('expense','withdrawal') and amount_cents < 0) or (kind in ('income','refund') and amount_cents > 0) or kind = 'transfer'),
  unique(user_id, fingerprint)
);
create unique index transactions_reference on public.transactions(user_id, account_key, external_reference) where external_reference is not null;
create unique index one_reconciliation on public.transactions(reconciled_to) where reconciled_to is not null;
create index transactions_date on public.transactions(user_id, date);

create table public.coverage (
  id uuid primary key default gen_random_uuid(),
  account_key text not null,
  from_date date not null,
  to_date date not null,
  source text not null,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  check (from_date <= to_date)
);

create table public.bank_connections (
  account_key text primary key,
  account_uid text not null,
  session_encrypted text not null,
  valid_until timestamptz not null,
  balance jsonb,
  synced_at timestamptz,
  last_error text
);
create table public.bank_states (
  state text primary key,
  user_id uuid not null references auth.users(id),
  expires_at timestamptz not null
);
alter table public.bank_connections enable row level security;
alter table public.bank_states enable row level security;

alter table public.categories enable row level security;
alter table public.rules enable row level security;
alter table public.transactions enable row level security;
alter table public.coverage enable row level security;
create policy owner_categories on public.categories for all to authenticated using (public.owner_mfa()) with check (public.owner_mfa());
create policy owner_rules on public.rules for all to authenticated using (public.owner_mfa()) with check (public.owner_mfa());
create policy owner_transactions on public.transactions for select to authenticated using (public.owner_mfa() and user_id = auth.uid());
create policy owner_coverage on public.coverage for select to authenticated using (public.owner_mfa());

create function public.import_transactions(owner uuid, items jsonb) returns integer language plpgsql security definer set search_path = '' as $$
declare inserted integer;
begin
  if not exists(select 1 from public.app_owner where user_id = owner) then raise exception 'Invalid owner'; end if;
  insert into public.transactions(user_id, account_key, date, description, amount_cents, currency, kind, category, source, fingerprint, external_reference, raw)
  select owner, item.account_key, item.date, item.description, item.amount_cents, item.currency, item.kind, item.category, item.source, item.fingerprint, item.external_reference, item.raw
  from jsonb_to_recordset(items) as item(account_key text, date date, description text, amount_cents bigint, currency text, kind text, category text, source text, fingerprint text, external_reference text, raw jsonb)
  on conflict do nothing;
  get diagnostics inserted = row_count;
  return inserted;
end;
$$;
revoke all on function public.import_transactions(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.import_transactions(uuid, jsonb) to service_role;

create function public.reconcile_transactions(owner uuid, manual_id uuid, bank_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare manual_row public.transactions; bank_row public.transactions;
begin
  if not exists(select 1 from public.app_owner where user_id = owner) then raise exception 'Invalid owner'; end if;
  select * into manual_row from public.transactions where id = manual_id and user_id = owner for update;
  select * into bank_row from public.transactions where id = bank_id and user_id = owner for update;
  if manual_row.id is null or bank_row.id is null or manual_row.source <> 'manual' or bank_row.source = 'manual'
    or manual_row.kind <> 'expense' or bank_row.kind <> 'expense' or manual_row.account_key = 'cash'
    or manual_row.account_key <> bank_row.account_key or manual_row.currency <> bank_row.currency
    or manual_row.amount_cents <> bank_row.amount_cents or abs(manual_row.date - bank_row.date) > 7
    or manual_row.reconciled_to is not null or bank_row.reconciled_to is not null then raise exception 'Invalid reconciliation'; end if;
  update public.transactions set reconciled_to = bank_id where id = manual_id;
  update public.transactions set date = manual_row.date, category = coalesce(manual_row.category, bank_row.category),
    category_locked = manual_row.category_locked or bank_row.category_locked where id = bank_id;
end;
$$;
revoke all on function public.reconcile_transactions(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.reconcile_transactions(uuid, uuid, uuid) to service_role;

revoke all on public.app_owner, public.bank_connections, public.bank_states from anon, authenticated;
grant all on public.app_owner, public.categories, public.rules, public.transactions, public.coverage, public.bank_connections, public.bank_states to service_role;
grant select, insert, update, delete on public.categories, public.rules to authenticated;
grant select on public.transactions, public.coverage to authenticated;