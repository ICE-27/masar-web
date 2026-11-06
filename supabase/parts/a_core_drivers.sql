-- ============================================================================
-- Masar | مسار — Milestones 3 to 6
--   drivers and verification, services and working hours, search and
--   booking, the simulated checkout, wallet, invoices, refunds and payouts.
--
-- Run AFTER 0001_parent_onboarding.sql. Paste the whole file into
-- Supabase → SQL Editor → New query → Run. Safe to run more than once.
--
-- Money is stored in halalas (1 SAR = 100 halalas) as bigint, never floats.
-- Rates are basis points (15% = 1500). Times of day are minutes after
-- midnight. Dates are Asia/Riyadh calendar dates. Day of week: 0 = Sunday.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Settings (all admin-editable)
-- ---------------------------------------------------------------------------

insert into public.settings (key, value) values
  ('vat_on_fee',            'false'),
  ('discount_t1_days',      '10'),   -- more than 10 booked days
  ('discount_t1_pct',       '5'),
  ('discount_t2_days',      '20'),   -- more than 20 booked days
  ('discount_t2_pct',       '10'),
  ('request_hold_hours',    '24'),
  ('payment_hold_hours',    '12'),
  ('hold_cutoff_hours',     '2'),
  ('schedule_notice_days',  '7'),
  ('cancel_notice_days',    '7'),
  ('max_vehicle_age',       '10'),
  ('min_driver_age',        '25'),
  ('wallet_demo_h',         '200000'),
  ('school_week_days',      '5'),
  ('vat_number',            'null'),
  ('holidays',              '[]')
on conflict (key) do nothing;

create or replace function public.setting_num(p_key text, p_default numeric)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce((select nullif(value #>> '{}', '')::numeric from public.settings where key = p_key), p_default)
$$;

create or replace function public.setting_bool(p_key text, p_default boolean)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select (value #>> '{}')::boolean from public.settings where key = p_key), p_default)
$$;

create or replace function public.riyadh_today()
returns date language sql stable set search_path = '' as $$
  select (now() at time zone 'Asia/Riyadh')::date
$$;

-- A Riyadh date plus minutes after midnight, as a real point in time
create or replace function public.riyadh_ts(p_date date, p_min int)
returns timestamptz language sql stable set search_path = '' as $$
  select (p_date::timestamp + make_interval(mins => p_min)) at time zone 'Asia/Riyadh'
$$;

-- ---------------------------------------------------------------------------
-- Geography helpers. A path is a jsonb array of [lat, lng] points.
-- ---------------------------------------------------------------------------

create or replace function public.geo_dist_m(lat1 float8, lng1 float8, lat2 float8, lng2 float8)
returns float8 language sql immutable set search_path = '' as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
$$;

-- Shortest distance from a point to a path, and how far along the path
-- that closest point is. Same maths as src/lib/domain/geo.ts.
create or replace function public.path_project(p_path jsonb, p_lat float8, p_lng float8)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  n int := coalesce(jsonb_array_length(p_path), 0);
  kx float8 := 111320 * cos(radians(p_lat));
  ky float8 := 110540;
  px float8 := p_lng * kx;
  py float8 := p_lat * ky;
  ax float8; ay float8; bx float8; byy float8; dx float8; dy float8;
  seg float8; t float8; d float8;
  best float8 := null; best_along float8 := 0; acc float8 := 0;
begin
  if n = 0 then
    return jsonb_build_object('distance_m', null, 'along_m', 0, 'total_m', 0);
  end if;
  if n = 1 then
    ax := (p_path -> 0 ->> 1)::float8 * kx; ay := (p_path -> 0 ->> 0)::float8 * ky;
    return jsonb_build_object('distance_m', round(sqrt(power(ax - px, 2) + power(ay - py, 2))), 'along_m', 0, 'total_m', 0);
  end if;
  for i in 0 .. n - 2 loop
    ax := (p_path -> i ->> 1)::float8 * kx;       ay := (p_path -> i ->> 0)::float8 * ky;
    bx := (p_path -> (i + 1) ->> 1)::float8 * kx; byy := (p_path -> (i + 1) ->> 0)::float8 * ky;
    dx := bx - ax; dy := byy - ay;
    seg := sqrt(dx * dx + dy * dy);
    t := case when seg = 0 then 0 else greatest(0, least(1, ((px - ax) * dx + (py - ay) * dy) / (seg * seg))) end;
    d := sqrt(power(ax + t * dx - px, 2) + power(ay + t * dy - py, 2));
    if best is null or d < best then
      best := d; best_along := acc + t * seg;
    end if;
    acc := acc + seg;
  end loop;
  return jsonb_build_object('distance_m', round(best), 'along_m', round(best_along), 'total_m', round(acc));
end;
$$;

-- ---------------------------------------------------------------------------
-- Districts: pricing labels for the Eastern Province. Coordinates are
-- approximate district centres; an address resolves by name first, then
-- to the nearest centre within 6 km.
-- ---------------------------------------------------------------------------

create table if not exists public.districts (
  id       text primary key,
  city     text not null,
  name_en  text not null,
  name_ar  text not null,
  lat      double precision not null,
  lng      double precision not null
);

insert into public.districts (id, city, name_en, name_ar, lat, lng) values
  ('dmm-faisaliyah',   'Dammam',  'Al Faisaliyah',        'الفيصلية',            26.3925, 50.0441),
  ('dmm-jamiyin',      'Dammam',  'Al Jamiyin',           'الجامعيين',           26.3880, 50.0660),
  ('dmm-shati',        'Dammam',  'Ash Shati',            'الشاطئ',              26.4672, 50.1186),
  ('dmm-mazruiyah',    'Dammam',  'Al Mazruiyah',         'المزروعية',           26.4396, 50.0997),
  ('dmm-badiyah',      'Dammam',  'Al Badi',              'البديع',              26.4290, 50.0860),
  ('dmm-nakheel',      'Dammam',  'An Nakhil',            'النخيل',              26.4005, 50.0997),
  ('dmm-uhud',         'Dammam',  'Uhud',                 'أحد',                 26.3711, 50.0631),
  ('dmm-hamra',        'Dammam',  'Al Hamra',             'الحمراء',             26.4310, 50.0640),
  ('dmm-muhammadiyah', 'Dammam',  'Al Muhammadiyah',      'المحمدية',            26.4053, 50.1260),
  ('dmm-rayyan',       'Dammam',  'Ar Rayyan',            'الريان',              26.4100, 50.0350),
  ('dmm-noor',         'Dammam',  'An Nur',               'النور',               26.4530, 50.0440),
  ('dmm-shulah',       'Dammam',  'Ash Shulah',           'الشعلة',              26.3990, 50.0280),
  ('khb-rakah',        'Khobar',  'Ar Rakah',             'الراكة',              26.3528, 50.1955),
  ('khb-aqrabiyah',    'Khobar',  'Al Aqrabiyah',         'العقربية',            26.2930, 50.1950),
  ('khb-ulaya',        'Khobar',  'Al Ulaya',             'العليا',              26.2770, 50.1880),
  ('khb-north',        'Khobar',  'Al Khobar Al Shamaliyah', 'الخبر الشمالية',   26.2970, 50.2100),
  ('khb-south',        'Khobar',  'Al Khobar Al Janubiyah',  'الخبر الجنوبية',   26.2740, 50.2140),
  ('khb-aziziyah',     'Khobar',  'Al Aziziyah',          'العزيزية',            26.2130, 50.1950),
  ('khb-hizam',        'Khobar',  'Al Hizam Adh Dhahabi', 'الحزام الذهبي',      26.2550, 50.1870),
  ('khb-yarmouk',      'Khobar',  'Al Yarmouk',           'اليرموك',             26.3220, 50.1810),
  ('khb-thuqbah',      'Khobar',  'Ath Thuqbah',          'الثقبة',              26.2850, 50.1780),
  ('khb-hamra',        'Khobar',  'Al Hamra',             'الحمراء',             26.3000, 50.1700),
  ('dhr-doha',         'Dhahran', 'Ad Dawhah',            'الدوحة',              26.3240, 50.1520),
  ('dhr-jamiah',       'Dhahran', 'Al Jamiah',            'الجامعة',             26.3070, 50.1440),
  ('dhr-qusur',        'Dhahran', 'Al Qusur',             'القصور',              26.2900, 50.1300),
  ('qtf-center',       'Qatif',   'Al Qatif',             'القطيف',              26.5560, 50.0080),
  ('qtf-saihat',       'Qatif',   'Saihat',               'سيهات',               26.4830, 50.0410),
  ('qtf-tarout',       'Qatif',   'Tarout',               'تاروت',               26.5730, 50.0640),
  ('jub-fanateer',     'Jubail',  'Al Fanateer',          'الفناتير',            27.0800, 49.5600),
  ('jub-deffi',        'Jubail',  'Ad Deffi',             'الدفي',               27.0200, 49.6000),
  ('jub-city',         'Jubail',  'Jubail City',          'الجبيل البلد',        27.0100, 49.6580),
  ('jub-huwaylat',     'Jubail',  'Al Huwaylat',          'الحويلات',            27.0400, 49.5800),
  ('hsa-hofuf',        'Al Ahsa', 'Al Hofuf',             'الهفوف',              25.3800, 49.5880),
  ('hsa-mubarraz',     'Al Ahsa', 'Al Mubarraz',          'المبرز',              25.4100, 49.5800),
  ('hsa-ainnajm',      'Al Ahsa', 'Ain Najm',             'عين نجم',             25.3990, 49.5990)
on conflict (id) do update set
  city = excluded.city, name_en = excluded.name_en, name_ar = excluded.name_ar,
  lat = excluded.lat, lng = excluded.lng;

alter table public.districts enable row level security;
drop policy if exists "districts are public" on public.districts;
create policy "districts are public" on public.districts for select to anon, authenticated using (true);
revoke insert, update, delete on public.districts from anon, authenticated;

-- Which district a point is in: a name match from the address first (within
-- 15 km), otherwise the nearest district centre within 6 km.
create or replace function public.resolve_district(p_lat float8, p_lng float8, p_name text default null)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select d.id from public.districts d
      where p_name is not null and length(trim(p_name)) > 2
        and (lower(d.name_en) like '%' || lower(trim(p_name)) || '%'
             or lower(trim(p_name)) like '%' || lower(replace(d.name_en, 'Al ', '')) || '%'
             or d.name_ar = trim(p_name)
             or trim(p_name) like '%' || d.name_ar || '%')
        and public.geo_dist_m(p_lat, p_lng, d.lat, d.lng) < 15000
      order by public.geo_dist_m(p_lat, p_lng, d.lat, d.lng) limit 1),
    (select d.id from public.districts d
      where public.geo_dist_m(p_lat, p_lng, d.lat, d.lng) < 6000
      order by public.geo_dist_m(p_lat, p_lng, d.lat, d.lng) limit 1)
  )
$$;

-- ---------------------------------------------------------------------------
-- Destinations: coordinates, more venues, and drivers may add new ones
-- ---------------------------------------------------------------------------

update public.destinations set lat = 26.3105, lng = 50.1315 where name_en = 'Dhahran Ahliyya Schools' and lat is null;
update public.destinations set lat = 26.2580, lng = 50.1960 where name_en = 'International Programs School' and lat is null;
update public.destinations set lat = 26.2480, lng = 50.1960 where name_en = 'British International School Al Khobar' and lat is null;
update public.destinations set lat = 26.4000, lng = 50.0850 where name_en = 'Manarat Al Sharqiya International Schools' and lat is null;
update public.destinations set lat = 26.4230, lng = 50.0960 where name_en = 'International Indian School Dammam' and lat is null;
update public.destinations set lat = 27.0060, lng = 49.6520 where name_en = 'International Indian School Jubail' and lat is null;

insert into public.destinations (name_en, name_ar, kind, city, lat, lng) values
  ('Al Qadsiah Club',  'نادي القادسية', 'sports', 'Khobar',  26.2590, 50.2050),
  ('Al Ettifaq Club',  'نادي الاتفاق',  'sports', 'Dammam',  26.4320, 50.1130),
  ('Al Khaleej Club',  'نادي الخليج',   'sports', 'Qatif',   26.4800, 50.0430),
  ('Al Fateh Club',    'نادي الفتح',    'sports', 'Al Ahsa', 25.3760, 49.5860)
on conflict (name_en, city) do nothing;

alter table public.destinations add column if not exists created_by uuid references public.profiles (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Small helpers
-- ---------------------------------------------------------------------------

create or replace function public.short_code(p_prefix text)
returns text language sql volatile set search_path = '' as $$
  select p_prefix || upper(substr(translate(encode(extensions.gen_random_bytes(6), 'base64'), '+/=0O1Il', 'XYZ23456'), 1, 6))
$$;

-- Saudi IBAN: SA + 22 digits, ISO 7064 mod-97 checksum
create or replace function public.iban_valid(p text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  s text; r int := 0; ch text;
begin
  if p is null or p !~ '^SA[0-9]{4}[0-9A-Z]{18}$' then return false; end if;
  s := substr(p, 5) || 'SA' || substr(p, 3, 2);
  for i in 1 .. length(s) loop
    ch := substr(s, i, 1);
    if ch ~ '[0-9]' then
      r := (r * 10 + ch::int) % 97;
    else  -- letters count as two digits: A=10 .. Z=35
      r := (r * 100 + ascii(ch) - 55) % 97;
    end if;
  end loop;
  return r = 1;
end;
$$;

create or replace function public.luhn_valid(p text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  s int := 0; d int; dbl boolean := false;
begin
  if p is null or p !~ '^[0-9]{12,19}$' then return false; end if;
  for i in reverse length(p) .. 1 loop
    d := substr(p, i, 1)::int;
    if dbl then d := d * 2; if d > 9 then d := d - 9; end if; end if;
    s := s + d; dbl := not dbl;
  end loop;
  return s % 10 = 0;
end;
$$;

-- ---------------------------------------------------------------------------
-- In-app notifications (the full engine with WhatsApp templates comes later;
-- these rows are what the bell shows, rendered in the reader's language)
-- ---------------------------------------------------------------------------

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  event       text not null,
  data        jsonb not null default '{}'::jsonb,
  link        text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;
drop policy if exists "read own notifications" on public.notifications;
create policy "read own notifications" on public.notifications
  for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.notifications from anon, authenticated;

create or replace function public.notify(p_user uuid, p_event text, p_data jsonb, p_link text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, event, data, link)
  select p_user, p_event, coalesce(p_data, '{}'::jsonb), p_link
  where p_user is not null
$$;

create or replace function public.notify_admins(p_event text, p_data jsonb, p_link text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, event, data, link)
  select id, p_event, coalesce(p_data, '{}'::jsonb), p_link from public.profiles where role = 'admin'
$$;

create or replace function public.my_notifications()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', n.id, 'event', n.event, 'data', n.data, 'link', n.link,
    'readAt', n.read_at, 'createdAt', n.created_at) order by n.created_at desc), '[]'::jsonb)
  from (select * from public.notifications where user_id = auth.uid()
        order by created_at desc limit 50) n
$$;

create or replace function public.mark_notifications_read()
returns void language sql security definer set search_path = '' as $$
  update public.notifications set read_at = now() where user_id = auth.uid() and read_at is null
$$;

-- ---------------------------------------------------------------------------
-- Drivers
-- ---------------------------------------------------------------------------

create table if not exists public.drivers (
  id                uuid primary key references public.profiles (id) on delete cascade,
  status            text not null default 'draft'
                      check (status in ('draft', 'submitted', 'under_review', 'approved', 'action_needed', 'suspended')),
  wizard_step       smallint not null default 1 check (wizard_step between 1 and 8),
  name_ar           text check (char_length(name_ar) between 2 and 120),
  name_en           text check (char_length(name_en) between 2 and 120),
  gender            text check (gender in ('male', 'female')),
  date_of_birth     date,
  nationality       text check (char_length(nationality) <= 60),
  city              text check (char_length(city) <= 60),
  bio               text check (char_length(bio) <= 400),
  languages         text[] not null default '{ar}',
  years_experience  smallint check (years_experience between 0 and 60),
  id_number         text check (id_number ~ '^[12][0-9]{9}$'),
  id_expiry         date,
  police_issued     date,
  licence_number    text check (licence_number ~ '^[0-9]{6,12}$'),
  licence_type      text check (licence_type in ('private', 'public', 'heavy')),
  licence_expiry    date,
  bank_name         text check (char_length(bank_name) <= 80),
  iban              text,
  account_holder    text check (char_length(account_holder) <= 120),
  discount_t1_pct   smallint not null default 5 check (discount_t1_pct between 0 and 50),
  discount_t2_pct   smallint not null default 10 check (discount_t2_pct between 0 and 50),
  declaration_at    timestamptz,
  submitted_at      timestamptz,
  reviewed_at       timestamptz,
  approved_at       timestamptz,
  admin_note        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
-- Columns added after the first release
alter table public.drivers add column if not exists id_issued date;
alter table public.drivers drop constraint if exists drivers_iban_check;
alter table public.drivers add constraint drivers_iban_check check (iban ~ '^SA[0-9]{4}[0-9A-Z]{18}$');

drop trigger if exists drivers_touch on public.drivers;
create trigger drivers_touch before update on public.drivers for each row execute function public.touch_updated_at();

create table if not exists public.vehicles (
  id                uuid primary key default gen_random_uuid(),
  driver_id         uuid not null unique references public.drivers (id) on delete cascade,
  type              text not null check (type in ('car', 'bus')),
  make              text check (char_length(make) <= 40),
  model             text check (char_length(model) <= 40),
  year              smallint check (year between 1990 and 2100),
  color             text check (char_length(color) <= 30),
  seats             smallint check (seats between 1 and 60),
  car_category      text check (car_category in ('sedan', 'suv', 'van')),
  bus_type          text check (bus_type in ('minivan', 'coaster', 'midsize', 'fullsize')),
  ac                boolean not null default true,
  gps               boolean not null default false,
  cameras           boolean not null default false,
  seatbelts         boolean not null default true,
  female_attendant  boolean not null default false,
  wheelchair        boolean not null default false,
  plate_digits      text check (plate_digits ~ '^[0-9]{1,4}$'),
  plate_letters     text check (plate_letters ~ '^[ABJDRSXTEGKLZNHUV]{1,3}$'),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (type = 'bus' or seats is null or seats <= 7)
);
create unique index if not exists vehicles_plate_key on public.vehicles (plate_digits, plate_letters)
  where plate_digits is not null and plate_letters is not null;
alter table public.vehicles add column if not exists other_features text check (char_length(other_features) <= 200);

drop trigger if exists vehicles_touch on public.vehicles;
create trigger vehicles_touch before update on public.vehicles for each row execute function public.touch_updated_at();

-- Female drivers register private cars only (Masar business rule)
create or replace function public.vehicles_rules()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.type = 'bus' and exists (select 1 from public.drivers where id = new.driver_id and gender = 'female') then
    raise exception 'female_bus_not_allowed' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists vehicles_rules on public.vehicles;
create trigger vehicles_rules before insert or update on public.vehicles for each row execute function public.vehicles_rules();

create or replace function public.drivers_rules()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.gender = 'female' and exists (select 1 from public.vehicles where driver_id = new.id and type = 'bus') then
    raise exception 'female_bus_not_allowed' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists drivers_rules on public.drivers;
create trigger drivers_rules before update of gender on public.drivers for each row execute function public.drivers_rules();

create table if not exists public.driver_documents (
  id             uuid primary key default gen_random_uuid(),
  driver_id      uuid not null references public.drivers (id) on delete cascade,
  kind           text not null check (kind in (
                   'profile_photo', 'id_front', 'id_back', 'selfie', 'police', 'licence',
                   'istimara', 'insurance', 'fahas', 'tga_card', 'first_aid',
                   'car_front', 'car_back', 'car_side', 'car_interior')),
  bucket         text not null check (bucket in ('driver-docs', 'driver-media', 'demo')),
  path           text not null,
  expiry         date,
  status         text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reject_reason  text,
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (driver_id, kind)
);
drop trigger if exists driver_documents_touch on public.driver_documents;
create trigger driver_documents_touch before update on public.driver_documents for each row execute function public.touch_updated_at();

-- Default prices per service type, set during registration
create table if not exists public.driver_pricing (
  driver_id            uuid not null references public.drivers (id) on delete cascade,
  service_type         text not null check (service_type in ('shared_car', 'exclusive_car', 'shared_bus', 'whole_bus')),
  enabled              boolean not null default true,
  daily_h              bigint not null check (daily_h between 100 and 10000000),
  one_way_h            bigint check (one_way_h between 100 and 10000000),
  per_trip_h           bigint check (per_trip_h between 100 and 10000000),
  max_children         smallint check (max_children between 1 and 60),
  attendant_available  boolean not null default false,
  attendant_fee_h      bigint not null default 0 check (attendant_fee_h between 0 and 1000000),
  primary key (driver_id, service_type)
);

-- Working hours are versioned: the hours in force on a date are the rows
-- with the latest valid_from on or before it.
create table if not exists public.working_hours (
  driver_id   uuid not null references public.drivers (id) on delete cascade,
  valid_from  date not null,
  dow         smallint not null check (dow between 0 and 6),
  start_min   smallint not null check (start_min between 0 and 1439),
  end_min     smallint not null check (end_min between 1 and 1440),
  primary key (driver_id, valid_from, dow, start_min),
  check (end_min > start_min)
);

create table if not exists public.blocked_dates (
  id          uuid primary key default gen_random_uuid(),
  driver_id   uuid not null references public.drivers (id) on delete cascade,
  start_date  date not null,
  end_date    date not null,
  reason      text check (char_length(reason) <= 200),
  created_at  timestamptz not null default now(),
  check (end_date >= start_date)
);
create index if not exists blocked_dates_driver_idx on public.blocked_dates (driver_id, start_date);

alter table public.drivers          enable row level security;
alter table public.vehicles         enable row level security;
alter table public.driver_documents enable row level security;
alter table public.driver_pricing   enable row level security;
alter table public.working_hours    enable row level security;
alter table public.blocked_dates    enable row level security;

drop policy if exists "driver reads own" on public.drivers;
create policy "driver reads own" on public.drivers for select to authenticated using (id = auth.uid() or public.is_admin());
drop policy if exists "driver reads own" on public.vehicles;
create policy "driver reads own" on public.vehicles for select to authenticated using (driver_id = auth.uid() or public.is_admin());
drop policy if exists "driver reads own" on public.driver_documents;
create policy "driver reads own" on public.driver_documents for select to authenticated using (driver_id = auth.uid() or public.is_admin());
drop policy if exists "driver reads own" on public.driver_pricing;
create policy "driver reads own" on public.driver_pricing for select to authenticated using (driver_id = auth.uid() or public.is_admin());
drop policy if exists "driver reads own" on public.working_hours;
create policy "driver reads own" on public.working_hours for select to authenticated using (driver_id = auth.uid() or public.is_admin());
drop policy if exists "driver reads own" on public.blocked_dates;
create policy "driver reads own" on public.blocked_dates for select to authenticated using (driver_id = auth.uid() or public.is_admin());

-- All writes go through the functions below, which validate everything
revoke insert, update, delete on public.drivers, public.vehicles, public.driver_documents,
  public.driver_pricing, public.working_hours, public.blocked_dates from anon, authenticated;

-- ---------------------------------------------------------------------------
-- File storage. Identity documents are private (owner and admins only, via
-- short-lived signed URLs). Profile and vehicle photos are public.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('driver-docs',  'driver-docs',  false, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('driver-media', 'driver-media', true,  5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "masar docs: owner writes" on storage.objects;
create policy "masar docs: owner writes" on storage.objects for insert to authenticated
  with check (bucket_id in ('driver-docs', 'driver-media') and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "masar docs: owner updates" on storage.objects;
create policy "masar docs: owner updates" on storage.objects for update to authenticated
  using (bucket_id in ('driver-docs', 'driver-media') and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "masar docs: owner deletes" on storage.objects;
create policy "masar docs: owner deletes" on storage.objects for delete to authenticated
  using (bucket_id in ('driver-docs', 'driver-media') and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "masar docs: owner or admin reads" on storage.objects;
create policy "masar docs: owner or admin reads" on storage.objects for select to authenticated
  using (bucket_id in ('driver-docs', 'driver-media')
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ---------------------------------------------------------------------------
-- Driver application: read, save section by section, submit
-- ---------------------------------------------------------------------------

create or replace function public.required_doc_kinds(p_vehicle_type text)
returns text[] language sql immutable set search_path = '' as $$
  select array['profile_photo', 'id_front', 'police', 'licence',
               'istimara', 'insurance', 'fahas', 'car_front', 'car_back', 'car_side', 'car_interior']
         || case when p_vehicle_type = 'bus' then array['tga_card', 'first_aid'] else array[]::text[] end
$$;

create or replace function public.driver_bundle(p_driver uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'driver', (select jsonb_build_object(
        'id', d.id, 'status', d.status, 'wizardStep', d.wizard_step,
        'nameAr', d.name_ar, 'nameEn', d.name_en, 'gender', d.gender, 'dateOfBirth', d.date_of_birth,
        'nationality', d.nationality, 'city', d.city, 'bio', d.bio, 'languages', to_jsonb(d.languages),
        'yearsExperience', d.years_experience,
        'idNumber', d.id_number, 'idIssued', d.id_issued, 'idExpiry', d.id_expiry, 'policeIssued', d.police_issued,
        'licenceNumber', d.licence_number, 'licenceType', d.licence_type, 'licenceExpiry', d.licence_expiry,
        'bankName', d.bank_name, 'iban', d.iban, 'accountHolder', d.account_holder,
        'discountT1Pct', d.discount_t1_pct, 'discountT2Pct', d.discount_t2_pct,
        'declarationAt', d.declaration_at, 'submittedAt', d.submitted_at, 'reviewedAt', d.reviewed_at,
        'approvedAt', d.approved_at, 'adminNote', d.admin_note, 'createdAt', d.created_at,
        'email', (select email from auth.users where id = d.id),
        'phone', (select phone from public.profiles where id = d.id),
        'phoneVerified', (select phone_verified_at is not null from public.profiles where id = d.id))
      from public.drivers d where d.id = p_driver),
    'vehicle', (select jsonb_build_object(
        'type', v.type, 'make', v.make, 'model', v.model, 'year', v.year, 'color', v.color, 'seats', v.seats,
        'carCategory', v.car_category, 'busType', v.bus_type, 'ac', v.ac, 'gps', v.gps, 'cameras', v.cameras,
        'seatbelts', v.seatbelts, 'femaleAttendant', v.female_attendant, 'wheelchair', v.wheelchair,
        'plateDigits', v.plate_digits, 'plateLetters', v.plate_letters, 'otherFeatures', v.other_features)
      from public.vehicles v where v.driver_id = p_driver),
    'documents', coalesce((select jsonb_agg(jsonb_build_object(
        'id', x.id, 'kind', x.kind, 'bucket', x.bucket, 'path', x.path, 'expiry', x.expiry,
        'status', x.status, 'rejectReason', x.reject_reason, 'updatedAt', x.updated_at) order by x.kind)
      from public.driver_documents x where x.driver_id = p_driver), '[]'::jsonb),
    'pricing', coalesce((select jsonb_agg(jsonb_build_object(
        'serviceType', p.service_type, 'enabled', p.enabled, 'dailyH', p.daily_h, 'oneWayH', p.one_way_h,
        'perTripH', p.per_trip_h, 'maxChildren', p.max_children, 'attendantAvailable', p.attendant_available,
        'attendantFeeH', p.attendant_fee_h) order by p.service_type)
      from public.driver_pricing p where p.driver_id = p_driver), '[]'::jsonb),
    'hours', coalesce((select jsonb_agg(jsonb_build_object('dow', h.dow, 'startMin', h.start_min, 'endMin', h.end_min)
        order by h.dow, h.start_min)
      from public.working_hours h where h.driver_id = p_driver
        and h.valid_from = (select max(valid_from) from public.working_hours
                             where driver_id = p_driver and valid_from <= public.riyadh_today())), '[]'::jsonb),
    'futureHours', coalesce((select jsonb_agg(jsonb_build_object('validFrom', h.valid_from, 'dow', h.dow,
        'startMin', h.start_min, 'endMin', h.end_min) order by h.valid_from, h.dow, h.start_min)
      from public.working_hours h where h.driver_id = p_driver and h.valid_from > public.riyadh_today()), '[]'::jsonb),
    'requiredDocs', to_jsonb(public.required_doc_kinds(
        (select type from public.vehicles where driver_id = p_driver)))
  )
$$;

create or replace function public.driver_get_application()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  if (select role from public.profiles where id = uid) <> 'driver' then
    raise exception 'not_a_driver' using errcode = 'P0001';
  end if;
  insert into public.drivers (id, name_en)
  select uid, (select full_name from public.profiles where id = uid)
  on conflict (id) do nothing;
  return public.driver_bundle(uid);
end;
$$;

-- Save any subset of the application. p = { step, personal, identity,
-- licence, vehicle, pricing, payout, hours }. Each section is validated.
create or replace function public.driver_save_application(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  d public.drivers%rowtype;
  s jsonb;
  v_type text;
  v_age int;
  v_year int := extract(year from public.riyadh_today())::int;
  v_editable boolean;
  r jsonb;
begin
  if uid is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  perform public.driver_get_application();
  select * into d from public.drivers where id = uid for update;
  -- After approval only prices, payout and hours stay editable here
  v_editable := d.status in ('draft', 'action_needed');

  if p ? 'personal' and v_editable then
    s := p -> 'personal';
    if s ->> 'dateOfBirth' is not null then
      v_age := extract(year from age(public.riyadh_today(), (s ->> 'dateOfBirth')::date))::int;
      if v_age < public.setting_num('min_driver_age', 25) then
        raise exception 'driver_too_young' using errcode = 'P0001', detail = public.setting_num('min_driver_age', 25)::text;
      end if;
    end if;
    update public.drivers set
      name_ar = nullif(trim(s ->> 'nameAr'), ''), name_en = nullif(trim(s ->> 'nameEn'), ''),
      gender = s ->> 'gender', date_of_birth = (s ->> 'dateOfBirth')::date,
      nationality = nullif(trim(s ->> 'nationality'), ''), city = nullif(trim(s ->> 'city'), ''),
      bio = nullif(trim(s ->> 'bio'), ''),
      languages = coalesce((select array_agg(x) from jsonb_array_elements_text(s -> 'languages') x), '{ar}'),
      years_experience = (s ->> 'yearsExperience')::smallint
    where id = uid;
    update public.profiles set full_name = coalesce(nullif(trim(s ->> 'nameEn'), ''), nullif(trim(s ->> 'nameAr'), ''), full_name) where id = uid;
  end if;

  if p ? 'identity' and v_editable then
    s := p -> 'identity';
    if (s ->> 'idExpiry')::date <= public.riyadh_today() then
      raise exception 'document_expired' using errcode = 'P0001', detail = 'id';
    end if;
    if (s ->> 'idIssued')::date > public.riyadh_today() then
      raise exception 'bad_issue_date' using errcode = 'P0001';
    end if;
    if (s ->> 'policeIssued')::date < public.riyadh_today() - 365 or (s ->> 'policeIssued')::date > public.riyadh_today() then
      raise exception 'police_too_old' using errcode = 'P0001';
    end if;
    update public.drivers set id_number = nullif(s ->> 'idNumber', ''), id_issued = (s ->> 'idIssued')::date,
      id_expiry = (s ->> 'idExpiry')::date, police_issued = (s ->> 'policeIssued')::date where id = uid;
  end if;

  if p ? 'licence' and v_editable then
    s := p -> 'licence';
    if (s ->> 'licenceExpiry')::date <= public.riyadh_today() then
      raise exception 'document_expired' using errcode = 'P0001', detail = 'licence';
    end if;
    update public.drivers set licence_number = nullif(s ->> 'licenceNumber', ''), licence_type = s ->> 'licenceType',
      licence_expiry = (s ->> 'licenceExpiry')::date where id = uid;
  end if;

  if p ? 'vehicle' and v_editable and nullif(p -> 'vehicle' ->> 'type', '') is not null then
    s := p -> 'vehicle';
    v_type := s ->> 'type';
    if (s ->> 'year')::int < v_year - public.setting_num('max_vehicle_age', 10) then
      raise exception 'vehicle_too_old' using errcode = 'P0001', detail = (v_year - public.setting_num('max_vehicle_age', 10))::text;
    end if;
    if exists (select 1 from public.vehicles where plate_digits = s ->> 'plateDigits'
                and plate_letters = s ->> 'plateLetters' and driver_id <> uid) then
      raise exception 'plate_taken' using errcode = 'P0001';
    end if;
    insert into public.vehicles (driver_id, type, make, model, year, color, seats, car_category, bus_type,
      ac, gps, cameras, seatbelts, female_attendant, wheelchair, plate_digits, plate_letters, other_features)
    values (uid, v_type, s ->> 'make', s ->> 'model', (s ->> 'year')::smallint, s ->> 'color',
      (s ->> 'seats')::smallint,
      case when v_type = 'car' then s ->> 'carCategory' end,
      case when v_type = 'bus' then s ->> 'busType' end,
      coalesce((s ->> 'ac')::boolean, true), coalesce((s ->> 'gps')::boolean, false),
      coalesce((s ->> 'cameras')::boolean, false), coalesce((s ->> 'seatbelts')::boolean, true),
      coalesce((s ->> 'femaleAttendant')::boolean, false), coalesce((s ->> 'wheelchair')::boolean, false),
      nullif(s ->> 'plateDigits', ''), nullif(s ->> 'plateLetters', ''), nullif(trim(s ->> 'otherFeatures'), ''))
    on conflict (driver_id) do update set other_features = excluded.other_features, type = excluded.type, make = excluded.make, model = excluded.model,
      year = excluded.year, color = excluded.color, seats = excluded.seats, car_category = excluded.car_category,
      bus_type = excluded.bus_type, ac = excluded.ac, gps = excluded.gps, cameras = excluded.cameras,
      seatbelts = excluded.seatbelts, female_attendant = excluded.female_attendant,
      wheelchair = excluded.wheelchair, plate_digits = excluded.plate_digits, plate_letters = excluded.plate_letters;
    -- Changing vehicle type drops prices for the other type
    delete from public.driver_pricing where driver_id = uid and
      ((v_type = 'car' and service_type in ('shared_bus', 'whole_bus')) or
       (v_type = 'bus' and service_type in ('shared_car', 'exclusive_car')));
  end if;

  if p ? 'pricing' then
    s := p -> 'pricing';
    v_type := (select type from public.vehicles where driver_id = uid);
    if v_type is null then raise exception 'vehicle_first' using errcode = 'P0001'; end if;
    delete from public.driver_pricing where driver_id = uid;
    insert into public.driver_pricing (driver_id, service_type, enabled, daily_h, one_way_h, per_trip_h,
      max_children, attendant_available, attendant_fee_h)
    select uid, x ->> 'serviceType', coalesce((x ->> 'enabled')::boolean, true), (x ->> 'dailyH')::bigint,
      (x ->> 'oneWayH')::bigint, (x ->> 'perTripH')::bigint, (x ->> 'maxChildren')::smallint,
      coalesce((x ->> 'attendantAvailable')::boolean, false), coalesce((x ->> 'attendantFeeH')::bigint, 0)
    from jsonb_array_elements(s -> 'types') x
    where (v_type = 'car' and x ->> 'serviceType' in ('shared_car', 'exclusive_car'))
       or (v_type = 'bus' and x ->> 'serviceType' in ('shared_bus', 'whole_bus'));
    if not exists (select 1 from public.driver_pricing where driver_id = uid and enabled) then
      raise exception 'pricing_required' using errcode = 'P0001';
    end if;
    update public.drivers set
      discount_t1_pct = coalesce((s ->> 'discountT1Pct')::smallint, discount_t1_pct),
      discount_t2_pct = coalesce((s ->> 'discountT2Pct')::smallint, discount_t2_pct)
    where id = uid;
  end if;

  if p ? 'payout' then
    s := p -> 'payout';
    if nullif(s ->> 'iban', '') is not null and not public.iban_valid(upper(replace(s ->> 'iban', ' ', ''))) then
      raise exception 'iban_invalid' using errcode = 'P0001';
    end if;
    update public.drivers set bank_name = nullif(trim(s ->> 'bankName'), ''),
      iban = nullif(upper(replace(s ->> 'iban', ' ', '')), ''), account_holder = nullif(trim(s ->> 'accountHolder'), '')
    where id = uid;
  end if;

  if p ? 'hours' and d.status in ('draft', 'action_needed') then
    -- Before approval there are no bookings, so hours simply replace
    delete from public.working_hours where driver_id = uid;
    insert into public.working_hours (driver_id, valid_from, dow, start_min, end_min)
    select uid, public.riyadh_today() - 1, (x ->> 'dow')::smallint, (x ->> 'startMin')::smallint, (x ->> 'endMin')::smallint
    from jsonb_array_elements(p -> 'hours') x
    on conflict do nothing;
  end if;

  if p ? 'step' then
    update public.drivers set wizard_step = greatest(wizard_step, least(7, (p ->> 'step')::smallint)) where id = uid;
  end if;

  return public.driver_bundle(uid);
end;
$$;

create or replace function public.driver_save_document(p_kind text, p_bucket text, p_path text, p_expiry date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  perform public.driver_get_application();
  if split_part(p_path, '/', 1) <> uid::text or p_bucket not in ('driver-docs', 'driver-media') then
    raise exception 'bad_path' using errcode = 'P0001';
  end if;
  if p_kind in ('profile_photo', 'car_front', 'car_back', 'car_side', 'car_interior') and p_bucket <> 'driver-media' then
    raise exception 'bad_path' using errcode = 'P0001';
  end if;
  if p_kind not in ('profile_photo', 'car_front', 'car_back', 'car_side', 'car_interior') and p_bucket <> 'driver-docs' then
    raise exception 'bad_path' using errcode = 'P0001';
  end if;
  if p_expiry is not null and p_expiry <= public.riyadh_today() then
    raise exception 'document_expired' using errcode = 'P0001', detail = p_kind;
  end if;
  insert into public.driver_documents (driver_id, kind, bucket, path, expiry)
  values (uid, p_kind, p_bucket, p_path, p_expiry)
  on conflict (driver_id, kind) do update set bucket = excluded.bucket, path = excluded.path,
    expiry = excluded.expiry, status = 'pending', reject_reason = null, reviewed_at = null;
  return public.driver_bundle(uid);
end;
$$;

-- Submit for review. Everything is re-checked here, not just in the browser.
create or replace function public.driver_submit()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  d public.drivers%rowtype;
  v public.vehicles%rowtype;
  missing text[];
  v_ph public.profiles%rowtype;
begin
  if uid is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  select * into d from public.drivers where id = uid for update;
  select * into v from public.vehicles where driver_id = uid;
  select * into v_ph from public.profiles where id = uid;
  if d.id is null then raise exception 'not_a_driver' using errcode = 'P0001'; end if;
  if d.status not in ('draft', 'action_needed') then raise exception 'already_submitted' using errcode = 'P0001'; end if;

  missing := array[]::text[];
  if v_ph.phone_verified_at is null then missing := array_append(missing, 'phone'); end if;
  if coalesce(d.name_ar, d.name_en) is null or d.gender is null or d.date_of_birth is null or d.city is null then
    missing := array_append(missing, 'personal'); end if;
  if d.id_number is null or d.id_expiry is null or d.police_issued is null then missing := array_append(missing, 'identity'); end if;
  if d.licence_number is null or d.licence_type is null or d.licence_expiry is null then missing := array_append(missing, 'licence'); end if;
  if v.id is null or v.seats is null or v.plate_digits is null or v.plate_letters is null or v.make is null then
    missing := array_append(missing, 'vehicle'); end if;
  if not exists (select 1 from public.driver_pricing where driver_id = uid and enabled) then missing := array_append(missing, 'pricing'); end if;
  if d.iban is null or d.account_holder is null then missing := array_append(missing, 'payout'); end if;
  if not exists (select 1 from public.working_hours where driver_id = uid) then missing := array_append(missing, 'hours'); end if;
  missing := missing || array(
    select k from unnest(public.required_doc_kinds(v.type)) k
    where not exists (select 1 from public.driver_documents x where x.driver_id = uid and x.kind = k));
  if array_length(missing, 1) > 0 then
    raise exception 'application_incomplete' using errcode = 'P0001', detail = array_to_string(missing, ',');
  end if;
  if extract(year from age(public.riyadh_today(), d.date_of_birth)) < public.setting_num('min_driver_age', 25) then
    raise exception 'driver_too_young' using errcode = 'P0001', detail = public.setting_num('min_driver_age', 25)::text;
  end if;
  if v.type = 'bus' and d.licence_type = 'private' then
    raise exception 'bus_needs_public_licence' using errcode = 'P0001';
  end if;
  if v.type = 'bus' and d.gender = 'female' then
    raise exception 'female_bus_not_allowed' using errcode = 'P0001';
  end if;

  update public.drivers set status = 'submitted', submitted_at = now(), declaration_at = now(), wizard_step = 7
  where id = uid;
  perform public.notify_admins('driver_submitted', jsonb_build_object('name', coalesce(d.name_en, d.name_ar)),
    '/admin/drivers?id=' || uid);
  return public.driver_bundle(uid);
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin: verification queue
-- ---------------------------------------------------------------------------

create or replace function public.admin_driver_queue()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = 'P0001'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', d.id, 'nameEn', d.name_en, 'nameAr', d.name_ar, 'gender', d.gender, 'city', d.city,
      'status', d.status, 'submittedAt', d.submitted_at, 'approvedAt', d.approved_at,
      'vehicleType', v.type, 'vehicle', concat_ws(' ', v.make, v.model, v.year),
      'docsTotal', (select count(*) from public.driver_documents x where x.driver_id = d.id),
      'docsApproved', (select count(*) from public.driver_documents x where x.driver_id = d.id and x.status = 'approved'),
      'docsRejected', (select count(*) from public.driver_documents x where x.driver_id = d.id and x.status = 'rejected'))
    order by case d.status when 'submitted' then 0 when 'under_review' then 1 when 'action_needed' then 2
                            when 'approved' then 3 when 'suspended' then 4 else 5 end, d.submitted_at nulls last)
    from public.drivers d left join public.vehicles v on v.driver_id = d.id), '[]'::jsonb);
end;
$$;

create or replace function public.admin_get_driver(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = 'P0001'; end if;
  return public.driver_bundle(p_id);
end;
$$;

create or replace function public.admin_review_document(p_doc uuid, p_approve boolean, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_driver uuid;
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = 'P0001'; end if;
  update public.driver_documents
     set status = case when p_approve then 'approved' else 'rejected' end,
         reject_reason = case when p_approve then null else nullif(trim(p_reason), '') end,
         reviewed_at = now()
   where id = p_doc returning driver_id into v_driver;
  update public.drivers set status = 'under_review', reviewed_at = now()
   where id = v_driver and status = 'submitted';
  return public.driver_bundle(v_driver);
end;
$$;

create or replace function public.admin_decide_driver(p_driver uuid, p_decision text, p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_type text := (select type from public.vehicles where driver_id = p_driver);
  v_rejected jsonb;
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = 'P0001'; end if;
  if p_decision = 'approve' then
    if exists (select 1 from unnest(public.required_doc_kinds(v_type)) k
               where not exists (select 1 from public.driver_documents x
                                  where x.driver_id = p_driver and x.kind = k and x.status = 'approved')) then
      raise exception 'documents_not_approved' using errcode = 'P0001';
    end if;
    update public.drivers set status = 'approved', approved_at = now(), reviewed_at = now(),
      admin_note = nullif(trim(p_note), '') where id = p_driver;
    perform public.notify(p_driver, 'driver_approved', '{}'::jsonb, '/driver');
  elsif p_decision = 'action_needed' then
    select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'reason', reject_reason)), '[]'::jsonb) into v_rejected
      from public.driver_documents where driver_id = p_driver and status = 'rejected';
    update public.drivers set status = 'action_needed', reviewed_at = now(), admin_note = nullif(trim(p_note), '')
     where id = p_driver;
    perform public.notify(p_driver, 'driver_action_needed',
      jsonb_build_object('note', nullif(trim(p_note), ''), 'documents', v_rejected), '/driver/join');
  elsif p_decision = 'suspend' then
    update public.drivers set status = 'suspended', reviewed_at = now(), admin_note = nullif(trim(p_note), '')
     where id = p_driver;
  elsif p_decision = 'under_review' then
    update public.drivers set status = 'under_review', reviewed_at = now() where id = p_driver;
  else
    raise exception 'bad_decision' using errcode = 'P0001';
  end if;
  return public.driver_bundle(p_driver);
end;
$$;
