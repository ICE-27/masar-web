-- ============================================================================
-- Masar | مسار — Milestone 2: accounts and parent onboarding
--
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- It is safe to run more than once.
--
-- Tables:   settings, profiles, consents, addresses, children, destinations,
--           phone_otps
-- RPCs:     request_phone_otp, verify_phone_otp, delete_my_account
-- Security: row-level security on every table. Parents only ever see their own
--           rows. Roles cannot be changed from the browser.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Settings (admin-editable later; readable by signed-in users)
-- ---------------------------------------------------------------------------

create table if not exists public.settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

insert into public.settings (key, value) values
  ('demo_mode',        'true'),   -- shows one-time codes on screen
  ('vat_rate',         '0.15'),
  ('masar_fee_rate',   '0.10'),
  ('otp_ttl_seconds',  '300'),
  ('otp_cooldown_seconds', '30'),
  ('otp_max_per_hour', '5')
on conflict (key) do nothing;

alter table public.settings enable row level security;

drop policy if exists "settings readable by signed-in users" on public.settings;
create policy "settings readable by signed-in users"
  on public.settings for select to authenticated using (true);

create or replace function public.setting(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select value from public.settings where key = p_key
$$;

-- ---------------------------------------------------------------------------
-- Profiles: one per auth user
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id                       uuid primary key references auth.users (id) on delete cascade,
  role                     text not null default 'parent'
                             check (role in ('parent', 'driver', 'admin')),
  full_name                text check (char_length(full_name) between 2 and 120),
  phone                    text check (phone ~ '^\+9665[0-9]{8}$'),
  phone_verified_at        timestamptz,
  preferred_locale         text not null default 'ar' check (preferred_locale in ('ar', 'en')),
  onboarding_step          smallint not null default 1 check (onboarding_step between 1 and 4),
  onboarding_completed_at  timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- Demo: the same mobile number may be verified on several accounts
drop index if exists public.profiles_verified_phone_key;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Changing the number clears its verification
create or replace function public.profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.phone is distinct from old.phone
     and current_setting('masar.otp_verified', true) is distinct from 'on' then
    new.phone_verified_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

-- Create the profile automatically when someone signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, role, full_name, preferred_locale)
  values (
    new.id,
    case when meta ->> 'role' = 'driver' then 'driver' else 'parent' end,  -- never admin
    nullif(trim(meta ->> 'full_name'), ''),
    case when meta ->> 'locale' = 'en' then 'en' else 'ar' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  )
$$;

alter table public.profiles enable row level security;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Only these columns can be changed from the browser.
-- role and phone_verified_at are changed by the server only.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (full_name, phone, preferred_locale, onboarding_step, onboarding_completed_at)
  on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Consents (append-only record, for PDPL and the WhatsApp opt-in Meta requires)
-- ---------------------------------------------------------------------------

create table if not exists public.consents (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind        text not null check (kind in ('terms', 'privacy', 'whatsapp')),
  version     text not null default '2026-11',
  granted     boolean not null,
  created_at  timestamptz not null default now()
);

create index if not exists consents_user_idx on public.consents (user_id, kind, created_at desc);

alter table public.consents enable row level security;

drop policy if exists "read own consents" on public.consents;
create policy "read own consents" on public.consents
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

drop policy if exists "record own consents" on public.consents;
create policy "record own consents" on public.consents
  for insert to authenticated with check (user_id = auth.uid());

revoke update, delete on public.consents from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Addresses
-- ---------------------------------------------------------------------------

create table if not exists public.addresses (
  id                uuid primary key default gen_random_uuid(),
  parent_id         uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  label             text not null default 'home' check (label in ('home', 'grandparents', 'other')),
  custom_label      text check (char_length(custom_label) <= 40),
  lat               double precision not null check (lat between -90 and 90),
  lng               double precision not null check (lng between -180 and 180),
  accuracy_m        real,
  city              text check (char_length(city) <= 80),
  district          text check (char_length(district) <= 80),
  street            text check (char_length(street) <= 120),
  building_no       text check (char_length(building_no) <= 20),
  floor_apt         text check (char_length(floor_apt) <= 40),
  landmark          text check (char_length(landmark) <= 300),
  national_address  text check (national_address ~ '^[A-Z]{4}[0-9]{4}$'),
  is_default        boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists addresses_parent_idx on public.addresses (parent_id);
create unique index if not exists addresses_one_default
  on public.addresses (parent_id) where is_default;

drop trigger if exists addresses_touch on public.addresses;
create trigger addresses_touch before update on public.addresses
  for each row execute function public.touch_updated_at();

-- First address becomes the default; setting a new default clears the old one;
-- at most 10 addresses per parent.
create or replace function public.addresses_default()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.addresses where parent_id = new.parent_id) >= 10 then
      raise exception 'address_limit' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.addresses where parent_id = new.parent_id) then
      new.is_default := true;
    end if;
  end if;

  if new.is_default then
    update public.addresses
       set is_default = false
     where parent_id = new.parent_id and id <> new.id and is_default;
  end if;
  return new;
end;
$$;

drop trigger if exists addresses_default on public.addresses;
create trigger addresses_default before insert or update on public.addresses
  for each row execute function public.addresses_default();

-- Deleting the default promotes the most recent remaining address
create or replace function public.addresses_promote()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.is_default then
    update public.addresses
       set is_default = true
     where id = (
       select id from public.addresses
        where parent_id = old.parent_id
        order by created_at desc
        limit 1
     );
  end if;
  return old;
end;
$$;

drop trigger if exists addresses_promote on public.addresses;
create trigger addresses_promote after delete on public.addresses
  for each row execute function public.addresses_promote();

alter table public.addresses enable row level security;

drop policy if exists "parents manage own addresses" on public.addresses;
create policy "parents manage own addresses" on public.addresses
  for all to authenticated
  using (parent_id = auth.uid())
  with check (parent_id = auth.uid());

drop policy if exists "admins read addresses" on public.addresses;
create policy "admins read addresses" on public.addresses
  for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Children
-- ---------------------------------------------------------------------------

create table if not exists public.children (
  id                   uuid primary key default gen_random_uuid(),
  parent_id            uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  full_name            text not null check (char_length(full_name) between 2 and 80),
  gender               text not null check (gender in ('boy', 'girl')),
  date_of_birth        date not null check (date_of_birth between '2004-01-01' and '2030-12-31'),
  school_name          text check (char_length(school_name) <= 120),
  destination_id       uuid,
  grade                text check (char_length(grade) <= 40),
  driver_notes         text check (char_length(driver_notes) <= 500),
  medical_notes        text check (char_length(medical_notes) <= 500),  -- shown only to the assigned driver (Milestone 5)
  emergency_name       text check (char_length(emergency_name) <= 80),
  emergency_phone      text check (emergency_phone ~ '^\+9665[0-9]{8}$'),
  authorized_pickups   jsonb not null default '[]'::jsonb
                         check (jsonb_typeof(authorized_pickups) = 'array'
                                and jsonb_array_length(authorized_pickups) <= 5),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists children_parent_idx on public.children (parent_id);

drop trigger if exists children_touch on public.children;
create trigger children_touch before update on public.children
  for each row execute function public.touch_updated_at();

create or replace function public.children_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.children where parent_id = new.parent_id) >= 10 then
    raise exception 'child_limit' using errcode = 'P0001';
  end if;
  if new.date_of_birth > current_date then
    raise exception 'dob_in_future' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists children_limit on public.children;
create trigger children_limit before insert on public.children
  for each row execute function public.children_limit();

alter table public.children enable row level security;

drop policy if exists "parents manage own children" on public.children;
create policy "parents manage own children" on public.children
  for all to authenticated
  using (parent_id = auth.uid())
  with check (parent_id = auth.uid());

drop policy if exists "admins read children" on public.children;
create policy "admins read children" on public.children
  for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Destinations (schools and activity venues; searchable when adding a child)
-- Coordinates are filled in with the matching engine (Milestone 4/5).
-- ---------------------------------------------------------------------------

create table if not exists public.destinations (
  id          uuid primary key default gen_random_uuid(),
  name_en     text not null,
  name_ar     text not null,
  kind        text not null default 'school' check (kind in ('school', 'tutoring', 'sports', 'other')),
  city        text not null,
  lat         double precision,
  lng         double precision,
  created_at  timestamptz not null default now(),
  unique (name_en, city)
);

alter table public.children
  drop constraint if exists children_destination_fk;
alter table public.children
  add constraint children_destination_fk
  foreign key (destination_id) references public.destinations (id) on delete set null;

insert into public.destinations (name_en, name_ar, city) values
  ('Dhahran Ahliyya Schools',                       'مدارس الظهران الأهلية',              'Dhahran'),
  ('International Programs School',                 'مدارس البرامج العالمية',              'Khobar'),
  ('British International School Al Khobar',        'المدرسة البريطانية العالمية بالخبر',  'Khobar'),
  ('Manarat Al Sharqiya International Schools',     'مدارس منارات الشرقية العالمية',       'Dammam'),
  ('International Indian School Dammam',            'المدرسة الهندية العالمية بالدمام',    'Dammam'),
  ('International Indian School Jubail',            'المدرسة الهندية العالمية بالجبيل',    'Jubail')
on conflict (name_en, city) do nothing;

alter table public.destinations enable row level security;

drop policy if exists "destinations are public" on public.destinations;
create policy "destinations are public" on public.destinations
  for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- Mobile verification (one-time codes)
--
-- No SMS provider in this phase. While settings.demo_mode is true the code is
-- returned to the browser and shown on screen. Later, the same function hands
-- the code to the WhatsApp connector instead and returns nothing.
-- ---------------------------------------------------------------------------

create table if not exists public.phone_otps (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  phone        text not null,
  code_hash    text not null,
  expires_at   timestamptz not null,
  attempts     smallint not null default 0,
  consumed_at  timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists phone_otps_user_idx on public.phone_otps (user_id, created_at desc);

alter table public.phone_otps enable row level security;
-- No policies: only the functions below can read or write this table.
revoke all on public.phone_otps from anon, authenticated;

create or replace function public.request_phone_otp(p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid        uuid := auth.uid();
  v_code     text;
  v_ttl      int  := coalesce((public.setting('otp_ttl_seconds'))::int, 300);
  v_cooldown int  := coalesce((public.setting('otp_cooldown_seconds'))::int, 30);
  v_max      int  := coalesce((public.setting('otp_max_per_hour'))::int, 5);
  v_last     timestamptz;
  v_expires  timestamptz;
begin
  if uid is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  if p_phone !~ '^\+9665[0-9]{8}$' then
    raise exception 'phone_invalid' using errcode = 'P0001';
  end if;

  select max(created_at) into v_last from public.phone_otps where user_id = uid;
  if v_last is not null and v_last > now() - make_interval(secs => v_cooldown) then
    raise exception 'otp_cooldown' using errcode = 'P0001',
      detail = ceil(extract(epoch from (v_last + make_interval(secs => v_cooldown) - now())))::text;
  end if;
  if (select count(*) from public.phone_otps
       where user_id = uid and created_at > now() - interval '1 hour') >= v_max then
    raise exception 'otp_rate_limited' using errcode = 'P0001';
  end if;

  v_code    := lpad((floor(random() * 1000000))::int::text, 6, '0');
  v_expires := now() + make_interval(secs => v_ttl);

  -- Any earlier unused code stops working
  update public.phone_otps set consumed_at = now()
   where user_id = uid and consumed_at is null;

  insert into public.phone_otps (user_id, phone, code_hash, expires_at)
  values (uid, p_phone, encode(sha256(convert_to(uid::text || ':' || v_code, 'UTF8')), 'hex'), v_expires);

  return jsonb_build_object(
    'expires_at', v_expires,
    'cooldown_seconds', v_cooldown,
    'demo_code', case when coalesce((public.setting('demo_mode'))::boolean, false) then v_code end
  );
end;
$$;

create or replace function public.verify_phone_otp(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid  uuid := auth.uid();
  otp  public.phone_otps%rowtype;
begin
  if uid is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;

  select * into otp from public.phone_otps
   where user_id = uid and consumed_at is null
   order by created_at desc
   limit 1
   for update;

  if not found then
    raise exception 'otp_missing' using errcode = 'P0001';
  end if;
  if otp.expires_at < now() then
    raise exception 'otp_expired' using errcode = 'P0001';
  end if;
  if otp.attempts >= 5 then
    raise exception 'otp_too_many_attempts' using errcode = 'P0001';
  end if;

  if otp.code_hash <> encode(sha256(convert_to(uid::text || ':' || coalesce(p_code, ''), 'UTF8')), 'hex') then
    update public.phone_otps set attempts = attempts + 1 where id = otp.id;
    return jsonb_build_object('ok', false, 'attempts_left', 4 - otp.attempts);
  end if;

  update public.phone_otps set consumed_at = now() where id = otp.id;

  perform set_config('masar.otp_verified', 'on', true);
  update public.profiles
     set phone = otp.phone, phone_verified_at = now()
   where id = uid;
  perform set_config('masar.otp_verified', 'off', true);

  return jsonb_build_object('ok', true, 'phone', otp.phone);
end;
$$;

-- ---------------------------------------------------------------------------
-- PDPL: delete my account
-- (Financial records will be kept under retention rules once payments exist.)
-- ---------------------------------------------------------------------------

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.request_phone_otp(text) from public, anon;
revoke execute on function public.verify_phone_otp(text)  from public, anon;
revoke execute on function public.delete_my_account()     from public, anon;
grant  execute on function public.request_phone_otp(text) to authenticated;
grant  execute on function public.verify_phone_otp(text)  to authenticated;
grant  execute on function public.delete_my_account()     to authenticated;
