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
  if p is null or p !~ '^SA[0-9]{22}$' then return false; end if;
  s := substr(p, 5) || '2810' || substr(p, 3, 2);   -- S=28, A=10
  for i in 1 .. length(s) loop
    ch := substr(s, i, 1);
    r := (r * 10 + ch::int) % 97;
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
  iban              text check (iban ~ '^SA[0-9]{22}$'),
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
  select array['profile_photo', 'id_front', 'id_back', 'selfie', 'police', 'licence',
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
        'idNumber', d.id_number, 'idExpiry', d.id_expiry, 'policeIssued', d.police_issued,
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
        'plateDigits', v.plate_digits, 'plateLetters', v.plate_letters)
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
    update public.profiles set full_name = coalesce(nullif(trim(s ->> 'nameEn'), ''), full_name) where id = uid;
  end if;

  if p ? 'identity' and v_editable then
    s := p -> 'identity';
    if (s ->> 'idExpiry')::date <= public.riyadh_today() then
      raise exception 'document_expired' using errcode = 'P0001', detail = 'id';
    end if;
    if (s ->> 'policeIssued')::date < public.riyadh_today() - 365 or (s ->> 'policeIssued')::date > public.riyadh_today() then
      raise exception 'police_too_old' using errcode = 'P0001';
    end if;
    update public.drivers set id_number = s ->> 'idNumber', id_expiry = (s ->> 'idExpiry')::date,
      police_issued = (s ->> 'policeIssued')::date where id = uid;
  end if;

  if p ? 'licence' and v_editable then
    s := p -> 'licence';
    if (s ->> 'licenceExpiry')::date <= public.riyadh_today() then
      raise exception 'document_expired' using errcode = 'P0001', detail = 'licence';
    end if;
    update public.drivers set licence_number = s ->> 'licenceNumber', licence_type = s ->> 'licenceType',
      licence_expiry = (s ->> 'licenceExpiry')::date where id = uid;
  end if;

  if p ? 'vehicle' and v_editable then
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
      ac, gps, cameras, seatbelts, female_attendant, wheelchair, plate_digits, plate_letters)
    values (uid, v_type, s ->> 'make', s ->> 'model', (s ->> 'year')::smallint, s ->> 'color',
      (s ->> 'seats')::smallint,
      case when v_type = 'car' then s ->> 'carCategory' end,
      case when v_type = 'bus' then s ->> 'busType' end,
      coalesce((s ->> 'ac')::boolean, true), coalesce((s ->> 'gps')::boolean, false),
      coalesce((s ->> 'cameras')::boolean, false), coalesce((s ->> 'seatbelts')::boolean, true),
      coalesce((s ->> 'femaleAttendant')::boolean, false), coalesce((s ->> 'wheelchair')::boolean, false),
      s ->> 'plateDigits', s ->> 'plateLetters')
    on conflict (driver_id) do update set type = excluded.type, make = excluded.make, model = excluded.model,
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
    if not public.iban_valid(upper(replace(s ->> 'iban', ' ', ''))) then
      raise exception 'iban_invalid' using errcode = 'P0001';
    end if;
    update public.drivers set bank_name = nullif(trim(s ->> 'bankName'), ''),
      iban = upper(replace(s ->> 'iban', ' ', '')), account_holder = nullif(trim(s ->> 'accountHolder'), '')
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
    update public.drivers set wizard_step = greatest(wizard_step, least(8, (p ->> 'step')::smallint)) where id = uid;
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
  if d.name_ar is null or d.name_en is null or d.gender is null or d.date_of_birth is null or d.city is null then
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

  update public.drivers set status = 'submitted', submitted_at = now(), declaration_at = now(), wizard_step = 8
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
-- ---------------------------------------------------------------------------
-- Services (what parents search and book)
-- ---------------------------------------------------------------------------

create table if not exists public.services (
  id                       uuid primary key default gen_random_uuid(),
  driver_id                uuid not null references public.drivers (id) on delete cascade,
  name                     text not null check (char_length(name) between 3 and 120),
  kind                     text not null default 'school' check (kind in ('school', 'activity', 'trip')),
  destination_id           uuid not null references public.destinations (id),
  start_lat                double precision not null,
  start_lng                double precision not null,
  stops                    jsonb not null default '[]'::jsonb check (jsonb_typeof(stops) = 'array'),
  path                     jsonb not null default '[]'::jsonb check (jsonb_typeof(path) = 'array'),
  distance_m               int,
  duration_s               int,
  accepts                  text not null default 'both' check (accepts in ('boys', 'girls', 'both')),
  age_min                  smallint not null default 3 check (age_min between 0 and 25),
  age_max                  smallint not null default 18 check (age_max between 0 and 25),
  max_children_per_family  smallint not null default 4 check (max_children_per_family between 1 and 20),
  shared_enabled           boolean not null default true,
  exclusive_enabled        boolean not null default false,
  max_pickup_m             int not null default 2000 check (max_pickup_m between 100 and 20000),
  max_detour_m             int not null default 3000 check (max_detour_m between 100 and 40000),
  max_detour_pct           smallint not null default 15 check (max_detour_pct between 1 and 100),
  max_stops                smallint not null default 10 check (max_stops between 1 and 60),
  max_journey_min          smallint not null default 45 check (max_journey_min between 5 and 240),
  discount_t1_pct          smallint not null default 5 check (discount_t1_pct between 0 and 50),
  discount_t2_pct          smallint not null default 10 check (discount_t2_pct between 0 and 50),
  status                   text not null default 'active' check (status in ('active', 'paused', 'archived')),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  check (age_max >= age_min)
);
create index if not exists services_driver_idx on public.services (driver_id);
drop trigger if exists services_touch on public.services;
create trigger services_touch before update on public.services for each row execute function public.touch_updated_at();

-- The schedule is versioned, so a change can start on a future date without
-- touching bookings before it. The version in force on a date is the one
-- with the latest valid_from on or before that date.
create table if not exists public.service_versions (
  service_id         uuid not null references public.services (id) on delete cascade,
  valid_from         date not null,
  days               smallint[] not null check (array_length(days, 1) between 1 and 7),
  outbound           boolean not null default true,
  pickup_start_min   smallint check (pickup_start_min between 0 and 1439),
  pickup_end_min     smallint check (pickup_end_min between 0 and 1439),
  arrive_min         smallint check (arrive_min between 0 and 1439),
  return_trip        boolean not null default true,
  return_depart_min  smallint check (return_depart_min between 0 and 1439),
  return_end_min     smallint check (return_end_min between 0 and 1439),
  seats              smallint not null check (seats between 1 and 60),
  created_at         timestamptz not null default now(),
  primary key (service_id, valid_from),
  check (outbound or return_trip),
  check (not outbound or (pickup_start_min is not null and pickup_end_min >= pickup_start_min and arrive_min >= pickup_end_min)),
  check (not return_trip or (return_depart_min is not null and return_end_min > return_depart_min))
);

create table if not exists public.service_coverage (
  service_id   uuid not null references public.services (id) on delete cascade,
  district_id  text not null references public.districts (id),
  surcharge_h  bigint not null default 0 check (surcharge_h between 0 and 1000000),
  primary key (service_id, district_id)
);

create table if not exists public.service_pricing (
  service_id           uuid not null references public.services (id) on delete cascade,
  service_type         text not null check (service_type in ('shared_car', 'exclusive_car', 'shared_bus', 'whole_bus')),
  daily_h              bigint not null check (daily_h between 100 and 10000000),
  one_way_h            bigint check (one_way_h between 100 and 10000000),
  per_trip_h           bigint check (per_trip_h between 100 and 10000000),
  max_children         smallint check (max_children between 1 and 60),
  attendant_available  boolean not null default false,
  attendant_fee_h      bigint not null default 0 check (attendant_fee_h between 0 and 1000000),
  primary key (service_id, service_type)
);

-- Per-date overrides: seats offered that day, or not running that day
create table if not exists public.availability_days (
  service_id   uuid not null references public.services (id) on delete cascade,
  date         date not null,
  seats        smallint check (seats between 0 and 60),
  unavailable  boolean not null default false,
  reason       text check (char_length(reason) <= 200),
  primary key (service_id, date)
);

alter table public.services          enable row level security;
alter table public.service_versions  enable row level security;
alter table public.service_coverage  enable row level security;
alter table public.service_pricing   enable row level security;
alter table public.availability_days enable row level security;

drop policy if exists "owner or admin reads" on public.services;
create policy "owner or admin reads" on public.services for select to authenticated
  using (driver_id = auth.uid() or public.is_admin());
drop policy if exists "owner or admin reads" on public.service_versions;
create policy "owner or admin reads" on public.service_versions for select to authenticated
  using (exists (select 1 from public.services s where s.id = service_id and (s.driver_id = auth.uid() or public.is_admin())));
drop policy if exists "owner or admin reads" on public.service_coverage;
create policy "owner or admin reads" on public.service_coverage for select to authenticated
  using (exists (select 1 from public.services s where s.id = service_id and (s.driver_id = auth.uid() or public.is_admin())));
drop policy if exists "owner or admin reads" on public.service_pricing;
create policy "owner or admin reads" on public.service_pricing for select to authenticated
  using (exists (select 1 from public.services s where s.id = service_id and (s.driver_id = auth.uid() or public.is_admin())));
drop policy if exists "owner or admin reads" on public.availability_days;
create policy "owner or admin reads" on public.availability_days for select to authenticated
  using (exists (select 1 from public.services s where s.id = service_id and (s.driver_id = auth.uid() or public.is_admin())));
revoke insert, update, delete on public.services, public.service_versions, public.service_coverage,
  public.service_pricing, public.availability_days from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Bookings (declared here because the conflict engine reads them)
-- ---------------------------------------------------------------------------

create table if not exists public.bookings (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique,
  parent_id           uuid references public.profiles (id) on delete set null,
  driver_id           uuid references public.drivers (id) on delete set null,
  service_id          uuid references public.services (id) on delete set null,
  status              text not null default 'pending'
                        check (status in ('pending', 'accepted', 'confirmed', 'completed', 'rejected', 'expired', 'cancelled')),
  cancelled_by        text check (cancelled_by in ('parent', 'driver', 'admin')),
  service_type        text not null check (service_type in ('shared_car', 'exclusive_car', 'shared_bus', 'whole_bus')),
  legs                text not null check (legs in ('both', 'outbound', 'return')),
  address_id          uuid references public.addresses (id) on delete set null,
  pickup              jsonb not null,
  district_id         text references public.districts (id),
  children_count      smallint not null,
  units               smallint not null,
  seats_needed        smallint not null,
  first_date          date not null,
  last_date           date not null,
  ends_on             date,
  booked_days         smallint not null,
  rate_h              bigint not null,
  surcharge_h         bigint not null default 0,
  attendant           boolean not null default false,
  attendant_fee_h     bigint not null default 0,
  line_h              bigint not null,
  discount_pct        smallint not null default 0,
  discount_h          bigint not null default 0,
  driver_h            bigint not null,
  vat_bp              int not null,
  vat_h               bigint not null,
  fee_bp              int not null,
  fee_h               bigint not null,
  total_h             bigint not null,
  outside_route       boolean not null default false,
  pickup_distance_m   int,
  est_pickup_min      smallint,
  note                text check (char_length(note) <= 500),
  request_expires_at  timestamptz,
  payment_due_at      timestamptz,
  responded_at        timestamptz,
  confirmed_at        timestamptz,
  cancelled_at        timestamptz,
  reject_reason       text,
  cancel_reason       text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (total_h = driver_h + vat_h + fee_h),
  check (driver_h = line_h - discount_h)
);
create index if not exists bookings_parent_idx on public.bookings (parent_id, created_at desc);
create index if not exists bookings_driver_idx on public.bookings (driver_id, status);
create index if not exists bookings_service_idx on public.bookings (service_id, status);
drop trigger if exists bookings_touch on public.bookings;
create trigger bookings_touch before update on public.bookings for each row execute function public.touch_updated_at();

create table if not exists public.booking_children (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings (id) on delete cascade,
  child_id    uuid references public.children (id) on delete set null,
  first_name  text not null,
  gender      text not null,
  age         smallint
);
create index if not exists booking_children_idx on public.booking_children (booking_id);

-- One row per trip date, each with its own state
create table if not exists public.booking_dates (
  booking_id  uuid not null references public.bookings (id) on delete cascade,
  date        date not null,
  state       text not null default 'scheduled'
                check (state in ('scheduled', 'cancelled', 'absent', 'completed', 'driver_unavailable')),
  refunded_h  bigint not null default 0,
  primary key (booking_id, date)
);
create index if not exists booking_dates_date_idx on public.booking_dates (date);

-- A real row per seat per date. The primary key makes double-selling a seat
-- impossible; expires_at null means held for good (paid).
create table if not exists public.seat_holds (
  service_id  uuid not null references public.services (id) on delete cascade,
  date        date not null,
  seat_no     smallint not null,
  booking_id  uuid not null references public.bookings (id) on delete cascade,
  expires_at  timestamptz,
  primary key (service_id, date, seat_no)
);
create index if not exists seat_holds_booking_idx on public.seat_holds (booking_id);

alter table public.bookings         enable row level security;
alter table public.booking_children enable row level security;
alter table public.booking_dates    enable row level security;
alter table public.seat_holds       enable row level security;
-- No policies: bookings are read and written only through the functions,
-- which decide what each side may see.
revoke all on public.bookings, public.booking_children, public.booking_dates, public.seat_holds from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Schedule helpers
-- ---------------------------------------------------------------------------

create or replace function public.service_version_on(p_service uuid, p_date date)
returns public.service_versions language sql stable security definer set search_path = '' as $$
  select * from public.service_versions
   where service_id = p_service and valid_from <= p_date
   order by valid_from desc limit 1
$$;

-- Is the driver off on this date (vacation or a day marked unavailable)?
create or replace function public.date_closed(p_service uuid, p_date date)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select 'unavailable' from public.availability_days where service_id = p_service and date = p_date and unavailable),
    (select 'blocked' from public.blocked_dates b join public.services s on s.driver_id = b.driver_id
      where s.id = p_service and p_date between b.start_date and b.end_date limit 1),
    (select 'holiday' from jsonb_array_elements(coalesce(public.setting('holidays'), '[]'::jsonb)) h
      where p_date between (h ->> 'from')::date and (h ->> 'to')::date limit 1)
  )
$$;

create or replace function public.seat_capacity(p_service uuid, p_date date)
returns int language plpgsql stable security definer set search_path = '' as $$
declare v public.service_versions%rowtype;
begin
  if public.date_closed(p_service, p_date) is not null then return 0; end if;
  select * into v from public.service_version_on(p_service, p_date);
  if v.service_id is null or not (extract(dow from p_date)::smallint = any (v.days)) then return 0; end if;
  return coalesce((select seats from public.availability_days where service_id = p_service and date = p_date), v.seats, 0);
end;
$$;

create or replace function public.seats_taken(p_service uuid, p_date date)
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.seat_holds
   where service_id = p_service and date = p_date and (expires_at is null or expires_at > now())
$$;

create or replace function public.seats_paid(p_service uuid, p_date date)
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.seat_holds where service_id = p_service and date = p_date and expires_at is null
$$;

-- Are a version's trip times inside the driver's working hours on a weekday?
create or replace function public.times_fit_hours(p_driver uuid, p_from date, p_dow smallint,
  p_outbound boolean, p_ps int, p_arrive int, p_return boolean, p_rd int, p_re int, p_hours jsonb default null)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  ok_out boolean := not p_outbound;
  ok_ret boolean := not p_return;
  r record;
begin
  for r in
    select (x ->> 'startMin')::int s, (x ->> 'endMin')::int e
      from jsonb_array_elements(coalesce(p_hours, (
        select jsonb_agg(jsonb_build_object('dow', dow, 'startMin', start_min, 'endMin', end_min))
          from public.working_hours
         where driver_id = p_driver and valid_from = (
           select max(valid_from) from public.working_hours where driver_id = p_driver and valid_from <= p_from)
      ), '[]'::jsonb)) x
     where (x ->> 'dow')::smallint = p_dow
  loop
    if p_outbound and p_ps >= r.s and p_arrive <= r.e then ok_out := true; end if;
    if p_return and p_rd >= r.s and p_re <= r.e then ok_ret := true; end if;
  end loop;
  return ok_out and ok_ret;
end;
$$;

-- Describe affected bookings for the conflict dialog.
-- p_pairs: [{ "b": booking_id, "d": date }]
create or replace function public.describe_conflicts(p_pairs jsonb)
returns jsonb language sql stable security definer set search_path = '' as $$
  with pairs as (
    select distinct (x ->> 'b')::uuid b, (x ->> 'd')::date d from jsonb_array_elements(coalesce(p_pairs, '[]'::jsonb)) x
  ), per as (
    select bk.id, bk.code, bk.status, min(p.d) first_d, max(p.d) last_d, count(*) n,
           jsonb_agg(p.d order by p.d) dates
      from pairs p join public.bookings bk on bk.id = p.b
     group by bk.id, bk.code, bk.status
  )
  select jsonb_build_object(
    'pending', coalesce((select jsonb_agg(jsonb_build_object('bookingId', per.id, 'code', per.code, 'status', per.status,
        'children', (select jsonb_agg(c.first_name) from public.booking_children c where c.booking_id = per.id),
        'parentName', (select split_part(coalesce(full_name, ''), ' ', 1) from public.profiles pr
                        join public.bookings bb on bb.parent_id = pr.id where bb.id = per.id),
        'dates', per.dates, 'count', per.n)) from per where per.status in ('pending', 'accepted')), '[]'::jsonb),
    'confirmed', coalesce((select jsonb_agg(jsonb_build_object('bookingId', per.id, 'code', per.code, 'status', per.status,
        'children', (select jsonb_agg(c.first_name) from public.booking_children c where c.booking_id = per.id),
        'parentName', (select split_part(coalesce(full_name, ''), ' ', 1) from public.profiles pr
                        join public.bookings bb on bb.parent_id = pr.id where bb.id = per.id),
        'dates', per.dates, 'count', per.n)) from per where per.status = 'confirmed'), '[]'::jsonb),
    'lastConfirmedDate', (select max(per.last_d) from per where per.status = 'confirmed'),
    'earliestDate', greatest(
       coalesce((select max(per.last_d) + 1 from per where per.status = 'confirmed'), public.riyadh_today()),
       public.riyadh_today() + 1)
  )
$$;

-- Decline (or release) pending and accepted-unpaid requests hit by a change
create or replace function public.auto_decline(p_ids uuid[], p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select id, parent_id, code from public.bookings where id = any (p_ids) and status in ('pending', 'accepted') loop
    update public.bookings set status = 'rejected', reject_reason = p_reason, responded_at = now() where id = r.id;
    delete from public.seat_holds where booking_id = r.id;
    perform public.notify(r.parent_id, 'booking_rejected', jsonb_build_object('code', r.code, 'reason', p_reason),
      '/account/booking?id=' || r.id);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Driver: services
-- ---------------------------------------------------------------------------

create or replace function public.is_approved_driver()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.drivers where id = auth.uid() and status = 'approved')
$$;

create or replace function public.service_json(p_id uuid, p_days int default 42)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', s.id, 'driverId', s.driver_id, 'name', s.name, 'kind', s.kind, 'status', s.status,
    'destination', (select jsonb_build_object('id', d.id, 'nameEn', d.name_en, 'nameAr', d.name_ar, 'city', d.city,
                    'kind', d.kind, 'lat', d.lat, 'lng', d.lng) from public.destinations d where d.id = s.destination_id),
    'start', jsonb_build_object('lat', s.start_lat, 'lng', s.start_lng),
    'stops', s.stops, 'path', s.path, 'distanceM', s.distance_m, 'durationS', s.duration_s,
    'accepts', s.accepts, 'ageMin', s.age_min, 'ageMax', s.age_max, 'maxChildrenPerFamily', s.max_children_per_family,
    'sharedEnabled', s.shared_enabled, 'exclusiveEnabled', s.exclusive_enabled,
    'limits', jsonb_build_object('maxPickupM', s.max_pickup_m, 'maxDetourM', s.max_detour_m,
      'maxDetourPct', s.max_detour_pct, 'maxStops', s.max_stops, 'maxJourneyMin', s.max_journey_min),
    'discounts', jsonb_build_object('t1Days', public.setting_num('discount_t1_days', 10), 't1Pct', s.discount_t1_pct,
      't2Days', public.setting_num('discount_t2_days', 20), 't2Pct', s.discount_t2_pct),
    'schedule', (select jsonb_build_object('validFrom', v.valid_from, 'days', to_jsonb(v.days), 'outbound', v.outbound,
        'pickupStartMin', v.pickup_start_min, 'pickupEndMin', v.pickup_end_min, 'arriveMin', v.arrive_min,
        'returnTrip', v.return_trip, 'returnDepartMin', v.return_depart_min, 'returnEndMin', v.return_end_min,
        'seats', v.seats) from public.service_version_on(s.id, public.riyadh_today() + 1) v),
    'upcomingSchedules', coalesce((select jsonb_agg(jsonb_build_object('validFrom', v.valid_from, 'days', to_jsonb(v.days),
        'outbound', v.outbound, 'pickupStartMin', v.pickup_start_min, 'pickupEndMin', v.pickup_end_min,
        'arriveMin', v.arrive_min, 'returnTrip', v.return_trip, 'returnDepartMin', v.return_depart_min,
        'returnEndMin', v.return_end_min, 'seats', v.seats) order by v.valid_from)
      from public.service_versions v where v.service_id = s.id and v.valid_from > public.riyadh_today() + 1), '[]'::jsonb),
    'pricing', coalesce((select jsonb_agg(jsonb_build_object('serviceType', p.service_type, 'dailyH', p.daily_h,
        'oneWayH', p.one_way_h, 'perTripH', p.per_trip_h, 'maxChildren', p.max_children,
        'attendantAvailable', p.attendant_available, 'attendantFeeH', p.attendant_fee_h) order by p.service_type)
      from public.service_pricing p where p.service_id = s.id), '[]'::jsonb),
    'coverage', coalesce((select jsonb_agg(jsonb_build_object('districtId', c.district_id, 'surchargeH', c.surcharge_h)
        order by c.district_id) from public.service_coverage c where c.service_id = s.id), '[]'::jsonb),
    'families', (select count(distinct b.parent_id) from public.bookings b
                  where b.service_id = s.id and b.status = 'confirmed' and b.last_date >= public.riyadh_today()),
    'seatsByDate', coalesce((select jsonb_agg(jsonb_build_object('date', g::date,
        'capacity', public.seat_capacity(s.id, g::date), 'taken', public.seats_taken(s.id, g::date),
        'closed', public.date_closed(s.id, g::date)) order by g)
      from generate_series(public.riyadh_today() + 1, public.riyadh_today() + p_days, interval '1 day') g
      where extract(dow from g)::smallint = any (coalesce((select v.days from public.service_version_on(s.id, g::date) v), '{}'))), '[]'::jsonb)
  )
  from public.services s where s.id = p_id
$$;

create or replace function public.driver_services()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  return coalesce((select jsonb_agg(public.service_json(s.id, 14) ||
      jsonb_build_object('pendingRequests', (select count(*) from public.bookings b where b.service_id = s.id and b.status = 'pending'))
      order by s.created_at)
    from public.services s where s.driver_id = auth.uid() and s.status <> 'archived'), '[]'::jsonb);
end;
$$;

create or replace function public.driver_get_service(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.services where id = p_id and (driver_id = auth.uid() or public.is_admin())) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  return public.service_json(p_id, 60);
end;
$$;

-- Approved drivers can add a school or venue that isn't in the catalogue yet
create or replace function public.add_destination(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_approved_driver() and not public.is_admin() then raise exception 'not_approved' using errcode = 'P0001'; end if;
  insert into public.destinations (name_en, name_ar, kind, city, lat, lng, created_by)
  values (trim(p ->> 'nameEn'), coalesce(nullif(trim(p ->> 'nameAr'), ''), trim(p ->> 'nameEn')),
          coalesce(p ->> 'kind', 'school'), trim(p ->> 'city'), (p ->> 'lat')::float8, (p ->> 'lng')::float8, auth.uid())
  on conflict (name_en, city) do update set lat = coalesce(public.destinations.lat, excluded.lat),
    lng = coalesce(public.destinations.lng, excluded.lng)
  returning id into v_id;
  return (select jsonb_build_object('id', d.id, 'nameEn', d.name_en, 'nameAr', d.name_ar, 'city', d.city,
          'kind', d.kind, 'lat', d.lat, 'lng', d.lng) from public.destinations d where d.id = v_id);
end;
$$;

-- Find bookings that a new schedule version would break, from p_from on.
create or replace function public.version_conflicts(p_service uuid, p_from date, p_v jsonb)
returns jsonb language sql stable security definer set search_path = '' as $$
  with v as (
    select (select array_agg(x::smallint) from jsonb_array_elements_text(p_v -> 'days') x) days,
           coalesce((p_v ->> 'outbound')::boolean, true) outbound,
           (p_v ->> 'pickupStartMin')::int ps, (p_v ->> 'pickupEndMin')::int pe, (p_v ->> 'arriveMin')::int ar,
           coalesce((p_v ->> 'returnTrip')::boolean, true) ret,
           (p_v ->> 'returnDepartMin')::int rd, (p_v ->> 'returnEndMin')::int re,
           (p_v ->> 'seats')::int seats
  ), hit as (
    select bd.booking_id b, bd.date d
      from public.booking_dates bd
      join public.bookings bk on bk.id = bd.booking_id
      cross join v
      cross join lateral (select * from public.service_version_on(p_service, bd.date)) cur
     where bk.service_id = p_service and bk.status in ('pending', 'accepted', 'confirmed')
       and bd.state = 'scheduled' and bd.date >= p_from
       and (
         not (extract(dow from bd.date)::smallint = any (v.days))
         or (bk.legs in ('both', 'outbound') and (not v.outbound
              or v.ps is distinct from cur.pickup_start_min or v.pe is distinct from cur.pickup_end_min
              or v.ar is distinct from cur.arrive_min))
         or (bk.legs in ('both', 'return') and (not v.ret
              or v.rd is distinct from cur.return_depart_min or v.re is distinct from cur.return_end_min))
         or (v.seats < public.seats_taken(p_service, bd.date)
             and not exists (select 1 from public.availability_days a where a.service_id = p_service and a.date = bd.date and a.seats is not null))
       )
  )
  select public.describe_conflicts(coalesce((select jsonb_agg(jsonb_build_object('b', b, 'd', d)) from hit), '[]'::jsonb))
$$;

-- Create or update a service. p carries everything; schedule changes run
-- through the conflict check. p_from: the date a schedule change starts
-- (default tomorrow). Raises schedule_conflict with the details as JSON when
-- confirmed bookings would break; pending requests are declined on save.
create or replace function public.driver_save_service(p jsonb, p_from date default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_vehicle public.vehicles%rowtype;
  v jsonb := p -> 'schedule';
  v_from date := coalesce(p_from, public.riyadh_today() + 1);
  v_conf jsonb;
  v_dow smallint;
  v_bad smallint[] := '{}';
  v_seats int;
  v_cur public.service_versions%rowtype;
  v_changed boolean;
begin
  if uid is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  if not public.is_approved_driver() then raise exception 'not_approved' using errcode = 'P0001'; end if;
  select * into v_vehicle from public.vehicles where driver_id = uid;
  v_seats := (v ->> 'seats')::int;
  if v_seats > v_vehicle.seats then
    raise exception 'seats_over_capacity' using errcode = 'P0001', detail = v_vehicle.seats::text;
  end if;
  if v_from <= public.riyadh_today() then v_from := public.riyadh_today() + 1; end if;

  -- Trip times must sit inside working hours on every day the service runs
  for v_dow in select x::smallint from jsonb_array_elements_text(v -> 'days') x loop
    if not public.times_fit_hours(uid, v_from, v_dow, coalesce((v ->> 'outbound')::boolean, true),
        (v ->> 'pickupStartMin')::int, (v ->> 'arriveMin')::int, coalesce((v ->> 'returnTrip')::boolean, true),
        (v ->> 'returnDepartMin')::int, (v ->> 'returnEndMin')::int) then
      v_bad := v_bad || v_dow;
    end if;
  end loop;
  if array_length(v_bad, 1) > 0 then
    raise exception 'outside_hours' using errcode = 'P0001', detail = array_to_string(v_bad, ',');
  end if;

  if v_id is null then
    insert into public.services (driver_id, name, kind, destination_id, start_lat, start_lng, stops, path,
      distance_m, duration_s, accepts, age_min, age_max, max_children_per_family, shared_enabled, exclusive_enabled,
      max_pickup_m, max_detour_m, max_detour_pct, max_stops, max_journey_min, discount_t1_pct, discount_t2_pct, status)
    values (uid, trim(p ->> 'name'), coalesce(p ->> 'kind', 'school'), coalesce(p ->> 'destinationId', p -> 'destination' ->> 'id')::uuid,
      (p -> 'start' ->> 'lat')::float8, (p -> 'start' ->> 'lng')::float8, coalesce(p -> 'stops', '[]'),
      coalesce(p -> 'path', '[]'), (p ->> 'distanceM')::int, (p ->> 'durationS')::int,
      coalesce(p ->> 'accepts', 'both'), coalesce((p ->> 'ageMin')::smallint, 3), coalesce((p ->> 'ageMax')::smallint, 18),
      coalesce((p ->> 'maxChildrenPerFamily')::smallint, 4),
      coalesce((p ->> 'sharedEnabled')::boolean, true), coalesce((p ->> 'exclusiveEnabled')::boolean, false),
      coalesce((p -> 'limits' ->> 'maxPickupM')::int, 2000), coalesce((p -> 'limits' ->> 'maxDetourM')::int, 3000),
      coalesce((p -> 'limits' ->> 'maxDetourPct')::smallint, 15), coalesce((p -> 'limits' ->> 'maxStops')::smallint, 10),
      coalesce((p -> 'limits' ->> 'maxJourneyMin')::smallint, 45),
      coalesce((p -> 'discounts' ->> 't1Pct')::smallint, 5), coalesce((p -> 'discounts' ->> 't2Pct')::smallint, 10),
      coalesce(p ->> 'status', 'active'))
    returning id into v_id;
    insert into public.service_versions (service_id, valid_from, days, outbound, pickup_start_min, pickup_end_min,
      arrive_min, return_trip, return_depart_min, return_end_min, seats)
    values (v_id, public.riyadh_today(), (select array_agg(x::smallint) from jsonb_array_elements_text(v -> 'days') x),
      coalesce((v ->> 'outbound')::boolean, true), (v ->> 'pickupStartMin')::smallint, (v ->> 'pickupEndMin')::smallint,
      (v ->> 'arriveMin')::smallint, coalesce((v ->> 'returnTrip')::boolean, true), (v ->> 'returnDepartMin')::smallint,
      (v ->> 'returnEndMin')::smallint, v_seats);
  else
    if not exists (select 1 from public.services where id = v_id and driver_id = uid) then
      raise exception 'not_found' using errcode = 'P0001';
    end if;
    update public.services set name = trim(p ->> 'name'), kind = coalesce(p ->> 'kind', kind),
      destination_id = coalesce(p ->> 'destinationId', p -> 'destination' ->> 'id')::uuid,
      start_lat = (p -> 'start' ->> 'lat')::float8, start_lng = (p -> 'start' ->> 'lng')::float8,
      stops = coalesce(p -> 'stops', stops), path = coalesce(p -> 'path', path),
      distance_m = (p ->> 'distanceM')::int, duration_s = (p ->> 'durationS')::int,
      accepts = coalesce(p ->> 'accepts', accepts), age_min = coalesce((p ->> 'ageMin')::smallint, age_min),
      age_max = coalesce((p ->> 'ageMax')::smallint, age_max),
      max_children_per_family = coalesce((p ->> 'maxChildrenPerFamily')::smallint, max_children_per_family),
      shared_enabled = coalesce((p ->> 'sharedEnabled')::boolean, shared_enabled),
      exclusive_enabled = coalesce((p ->> 'exclusiveEnabled')::boolean, exclusive_enabled),
      max_pickup_m = coalesce((p -> 'limits' ->> 'maxPickupM')::int, max_pickup_m),
      max_detour_m = coalesce((p -> 'limits' ->> 'maxDetourM')::int, max_detour_m),
      max_detour_pct = coalesce((p -> 'limits' ->> 'maxDetourPct')::smallint, max_detour_pct),
      max_stops = coalesce((p -> 'limits' ->> 'maxStops')::smallint, max_stops),
      max_journey_min = coalesce((p -> 'limits' ->> 'maxJourneyMin')::smallint, max_journey_min),
      discount_t1_pct = coalesce((p -> 'discounts' ->> 't1Pct')::smallint, discount_t1_pct),
      discount_t2_pct = coalesce((p -> 'discounts' ->> 't2Pct')::smallint, discount_t2_pct),
      status = case when p ->> 'status' in ('active', 'paused') then p ->> 'status' else status end
    where id = v_id;

    -- Has the schedule changed from what is in force on that date?
    select * into v_cur from public.service_version_on(v_id, v_from);
    v_changed := v_cur.service_id is null
      or v_cur.days is distinct from (select array_agg(x::smallint) from jsonb_array_elements_text(v -> 'days') x)
      or v_cur.outbound is distinct from coalesce((v ->> 'outbound')::boolean, true)
      or v_cur.pickup_start_min is distinct from (v ->> 'pickupStartMin')::smallint
      or v_cur.pickup_end_min is distinct from (v ->> 'pickupEndMin')::smallint
      or v_cur.arrive_min is distinct from (v ->> 'arriveMin')::smallint
      or v_cur.return_trip is distinct from coalesce((v ->> 'returnTrip')::boolean, true)
      or v_cur.return_depart_min is distinct from (v ->> 'returnDepartMin')::smallint
      or v_cur.return_end_min is distinct from (v ->> 'returnEndMin')::smallint
      or v_cur.seats is distinct from v_seats;

    if v_changed then
      v_conf := public.version_conflicts(v_id, v_from, v);
      if jsonb_array_length(v_conf -> 'confirmed') > 0 then
        raise exception 'schedule_conflict' using errcode = 'P0001', detail = v_conf::text;
      end if;
      perform public.auto_decline(array(select (x ->> 'bookingId')::uuid from jsonb_array_elements(v_conf -> 'pending') x),
        'schedule_changed');
      delete from public.service_versions where service_id = v_id and valid_from >= v_from;
      insert into public.service_versions (service_id, valid_from, days, outbound, pickup_start_min, pickup_end_min,
        arrive_min, return_trip, return_depart_min, return_end_min, seats)
      values (v_id, v_from, (select array_agg(x::smallint) from jsonb_array_elements_text(v -> 'days') x),
        coalesce((v ->> 'outbound')::boolean, true), (v ->> 'pickupStartMin')::smallint, (v ->> 'pickupEndMin')::smallint,
        (v ->> 'arriveMin')::smallint, coalesce((v ->> 'returnTrip')::boolean, true), (v ->> 'returnDepartMin')::smallint,
        (v ->> 'returnEndMin')::smallint, v_seats);
    end if;
  end if;

  -- Coverage and prices replace the old ones (existing bookings keep their prices)
  delete from public.service_coverage where service_id = v_id;
  insert into public.service_coverage (service_id, district_id, surcharge_h)
  select v_id, x ->> 'districtId', coalesce((x ->> 'surchargeH')::bigint, 0)
    from jsonb_array_elements(coalesce(p -> 'coverage', '[]')) x
  on conflict do nothing;

  delete from public.service_pricing where service_id = v_id;
  insert into public.service_pricing (service_id, service_type, daily_h, one_way_h, per_trip_h, max_children,
    attendant_available, attendant_fee_h)
  select v_id, x ->> 'serviceType', (x ->> 'dailyH')::bigint, (x ->> 'oneWayH')::bigint, (x ->> 'perTripH')::bigint,
    (x ->> 'maxChildren')::smallint, coalesce((x ->> 'attendantAvailable')::boolean, false),
    coalesce((x ->> 'attendantFeeH')::bigint, 0)
  from jsonb_array_elements(coalesce(p -> 'pricing', '[]')) x
  where (v_vehicle.type = 'car' and x ->> 'serviceType' in ('shared_car', 'exclusive_car'))
     or (v_vehicle.type = 'bus' and x ->> 'serviceType' in ('shared_bus', 'whole_bus'));
  if not exists (select 1 from public.service_pricing where service_id = v_id) then
    raise exception 'pricing_required' using errcode = 'P0001';
  end if;

  return public.service_json(v_id, 60);
end;
$$;

-- Dry run for the editor: what would this schedule change break?
create or replace function public.driver_check_service(p_service uuid, p_schedule jsonb, p_from date default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.services where id = p_service and driver_id = auth.uid()) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  return public.version_conflicts(p_service, greatest(coalesce(p_from, public.riyadh_today() + 1), public.riyadh_today() + 1), p_schedule);
end;
$$;

create or replace function public.driver_archive_service(p_service uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_conf jsonb;
begin
  if not exists (select 1 from public.services where id = p_service and driver_id = auth.uid()) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.bookings where service_id = p_service and status = 'confirmed'
              and coalesce(ends_on, last_date) >= public.riyadh_today()) then
    raise exception 'has_confirmed_bookings' using errcode = 'P0001';
  end if;
  perform public.auto_decline(array(select id from public.bookings where service_id = p_service
    and status in ('pending', 'accepted')), 'service_closed');
  update public.services set status = 'archived' where id = p_service;
end;
$$;

-- ---------------------------------------------------------------------------
-- Driver: working hours, days off, per-date seats
-- ---------------------------------------------------------------------------

create or replace function public.hours_conflicts(p_driver uuid, p_from date, p_hours jsonb)
returns jsonb language sql stable security definer set search_path = '' as $$
  with hit as (
    select bd.booking_id b, bd.date d
      from public.booking_dates bd
      join public.bookings bk on bk.id = bd.booking_id
      cross join lateral (select * from public.service_version_on(bk.service_id, bd.date)) v
     where bk.driver_id = p_driver and bk.status in ('pending', 'accepted', 'confirmed')
       and bd.state = 'scheduled' and bd.date >= p_from
       and not public.times_fit_hours(p_driver, bd.date, extract(dow from bd.date)::smallint,
             bk.legs in ('both', 'outbound') and v.outbound, v.pickup_start_min, v.arrive_min,
             bk.legs in ('both', 'return') and v.return_trip, v.return_depart_min, v.return_end_min, p_hours)
  )
  select public.describe_conflicts(coalesce((select jsonb_agg(jsonb_build_object('b', b, 'd', d)) from hit), '[]'::jsonb))
$$;

create or replace function public.driver_check_hours(p_hours jsonb, p_from date default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  return public.hours_conflicts(auth.uid(), greatest(coalesce(p_from, public.riyadh_today() + 1), public.riyadh_today() + 1), p_hours);
end;
$$;

-- Save new weekly hours starting p_from. Services whose trip times would no
-- longer fit are reported (services_outside_hours) so the driver edits them.
create or replace function public.driver_save_hours(p_hours jsonb, p_from date default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_from date := greatest(coalesce(p_from, public.riyadh_today() + 1), public.riyadh_today() + 1);
  v_conf jsonb;
  v_status text := (select status from public.drivers where id = uid);
  v_svc text;
begin
  if uid is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  if v_status is null then raise exception 'not_a_driver' using errcode = 'P0001'; end if;
  if v_status in ('draft', 'action_needed') then
    return public.driver_save_application(jsonb_build_object('hours', p_hours));
  end if;
  v_conf := public.hours_conflicts(uid, v_from, p_hours);
  if jsonb_array_length(v_conf -> 'confirmed') > 0 then
    raise exception 'schedule_conflict' using errcode = 'P0001', detail = v_conf::text;
  end if;
  -- Active services must still fit the new hours
  select string_agg(s.name, ' · ') into v_svc
    from public.services s cross join lateral (select * from public.service_version_on(s.id, v_from)) v
   where s.driver_id = uid and s.status = 'active'
     and exists (select 1 from unnest(v.days) dw
                  where not public.times_fit_hours(uid, v_from, dw, v.outbound, v.pickup_start_min, v.arrive_min,
                          v.return_trip, v.return_depart_min, v.return_end_min, p_hours));
  if v_svc is not null then
    raise exception 'services_outside_hours' using errcode = 'P0001', detail = v_svc;
  end if;
  perform public.auto_decline(array(select (x ->> 'bookingId')::uuid from jsonb_array_elements(v_conf -> 'pending') x),
    'schedule_changed');
  delete from public.working_hours where driver_id = uid and valid_from >= v_from;
  insert into public.working_hours (driver_id, valid_from, dow, start_min, end_min)
  select uid, v_from, (x ->> 'dow')::smallint, (x ->> 'startMin')::smallint, (x ->> 'endMin')::smallint
    from jsonb_array_elements(p_hours) x
  on conflict do nothing;
  if not exists (select 1 from public.working_hours where driver_id = uid and valid_from = v_from) then
    -- A week with no hours at all still needs a version row to take effect
    raise exception 'hours_required' using errcode = 'P0001';
  end if;
  return public.driver_bundle(uid);
end;
$$;

create or replace function public.driver_blocked_dates()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'startDate', start_date, 'endDate', end_date, 'reason', reason)
    order by start_date), '[]'::jsonb)
  from public.blocked_dates where driver_id = auth.uid() and end_date >= public.riyadh_today()
$$;

-- Cancel trips the driver can't run (planned or same-day) with a full refund,
-- Masar fee included, to the parent's wallet. Defined with the payment code.
-- public.driver_cancel_dates(p_pairs jsonb, p_reason text)

create or replace function public.driver_block_dates(p_start date, p_end date, p_reason text, p_cancel_confirmed boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_pairs jsonb;
  v_conf jsonb;
begin
  if uid is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.drivers where id = uid) then raise exception 'not_a_driver' using errcode = 'P0001'; end if;
  if p_end < p_start or p_start < public.riyadh_today() then raise exception 'bad_dates' using errcode = 'P0001'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('b', bd.booking_id, 'd', bd.date)), '[]'::jsonb) into v_pairs
    from public.booking_dates bd join public.bookings bk on bk.id = bd.booking_id
   where bk.driver_id = uid and bk.status in ('pending', 'accepted', 'confirmed')
     and bd.state = 'scheduled' and bd.date between p_start and p_end;
  v_conf := public.describe_conflicts(v_pairs);
  if jsonb_array_length(v_conf -> 'confirmed') > 0 and not p_cancel_confirmed then
    raise exception 'schedule_conflict' using errcode = 'P0001', detail = v_conf::text;
  end if;
  perform public.auto_decline(array(select (x ->> 'bookingId')::uuid from jsonb_array_elements(v_conf -> 'pending') x),
    'driver_unavailable');
  if jsonb_array_length(v_conf -> 'confirmed') > 0 then
    perform public.driver_cancel_dates(
      (select jsonb_agg(x) from jsonb_array_elements(v_pairs) x
        where (x ->> 'b')::uuid in (select (y ->> 'bookingId')::uuid from jsonb_array_elements(v_conf -> 'confirmed') y)),
      coalesce(nullif(trim(p_reason), ''), 'driver_unavailable'));
  end if;
  insert into public.blocked_dates (driver_id, start_date, end_date, reason)
  values (uid, p_start, p_end, nullif(trim(p_reason), ''));
  return public.driver_blocked_dates();
end;
$$;

create or replace function public.driver_unblock(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  delete from public.blocked_dates where id = p_id and driver_id = auth.uid();
  return public.driver_blocked_dates();
end;
$$;

-- Seats offered on one date, or mark one date unavailable for a service
create or replace function public.driver_set_day(p_service uuid, p_date date, p_seats int, p_unavailable boolean,
  p_reason text, p_cancel_confirmed boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_pairs jsonb;
  v_conf jsonb;
  v_paid int;
begin
  if not exists (select 1 from public.services where id = p_service and driver_id = auth.uid()) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if p_date <= public.riyadh_today() then raise exception 'bad_dates' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext('svc:' || p_service::text));
  if p_unavailable then
    select coalesce(jsonb_agg(jsonb_build_object('b', bd.booking_id, 'd', bd.date)), '[]'::jsonb) into v_pairs
      from public.booking_dates bd join public.bookings bk on bk.id = bd.booking_id
     where bk.service_id = p_service and bk.status in ('pending', 'accepted', 'confirmed')
       and bd.state = 'scheduled' and bd.date = p_date;
    v_conf := public.describe_conflicts(v_pairs);
    if jsonb_array_length(v_conf -> 'confirmed') > 0 and not p_cancel_confirmed then
      raise exception 'schedule_conflict' using errcode = 'P0001', detail = v_conf::text;
    end if;
    perform public.auto_decline(array(select (x ->> 'bookingId')::uuid from jsonb_array_elements(v_conf -> 'pending') x),
      'driver_unavailable');
    if jsonb_array_length(v_conf -> 'confirmed') > 0 then
      perform public.driver_cancel_dates(v_pairs, coalesce(nullif(trim(p_reason), ''), 'driver_unavailable'));
    end if;
  elsif p_seats is not null then
    v_paid := public.seats_taken(p_service, p_date);
    if p_seats < v_paid then
      raise exception 'seats_below_booked' using errcode = 'P0001', detail = v_paid::text;
    end if;
    if p_seats > (select seats from public.vehicles where driver_id = auth.uid()) then
      raise exception 'seats_over_capacity' using errcode = 'P0001';
    end if;
  end if;
  if not p_unavailable and p_seats is null then
    delete from public.availability_days where service_id = p_service and date = p_date;
  else
    insert into public.availability_days (service_id, date, seats, unavailable, reason)
    values (p_service, p_date, case when p_unavailable then null else p_seats end, p_unavailable, nullif(trim(p_reason), ''))
    on conflict (service_id, date) do update set seats = excluded.seats, unavailable = excluded.unavailable,
      reason = excluded.reason;
  end if;
  return public.service_json(p_service, 60);
end;
$$;

-- Never let per-date seats drop below seats already held
create or replace function public.availability_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.seats is not null and new.seats < public.seats_taken(new.service_id, new.date) then
    raise exception 'seats_below_booked' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists availability_guard on public.availability_days;
create trigger availability_guard before insert or update on public.availability_days
  for each row execute function public.availability_guard();

-- Month view for the driver's availability calendar
create or replace function public.driver_calendar(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'serviceId', s.id, 'serviceName', s.name,
      'days', (select coalesce(jsonb_agg(jsonb_build_object(
          'date', g::date,
          'runs', extract(dow from g)::smallint = any (coalesce(v.days, '{}')),
          'capacity', public.seat_capacity(s.id, g::date),
          'paid', public.seats_paid(s.id, g::date),
          'held', public.seats_taken(s.id, g::date) - public.seats_paid(s.id, g::date),
          'closed', public.date_closed(s.id, g::date),
          'override', (select jsonb_build_object('seats', a.seats, 'unavailable', a.unavailable, 'reason', a.reason)
                         from public.availability_days a where a.service_id = s.id and a.date = g::date),
          'pending', (select count(*) from public.booking_dates bd join public.bookings bk on bk.id = bd.booking_id
                        where bk.service_id = s.id and bk.status = 'pending' and bd.date = g::date and bd.state = 'scheduled')
        ) order by g), '[]'::jsonb)
        from generate_series(p_from, p_to, interval '1 day') g
        cross join lateral (select * from public.service_version_on(s.id, g::date)) v)
    ) order by s.created_at)
    from public.services s where s.driver_id = auth.uid() and s.status <> 'archived'), '[]'::jsonb);
end;
$$;
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
-- ---------------------------------------------------------------------------
-- Price calculation (same rules as src/lib/domain/pricing.ts)
--   line   = days x rate x units (+ days x attendant fee for a whole bus)
--   discount by booked school days: > t1 days -> t1%, > t2 days -> t2%
--   driver = line - discount;  VAT and the Masar fee are added on top
-- ---------------------------------------------------------------------------

create or replace function public.calc_price(p_rate_h bigint, p_units int, p_days int, p_att_h bigint,
  p_t1_pct int, p_t2_pct int)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  t1 int := public.setting_num('discount_t1_days', 10)::int;
  t2 int := public.setting_num('discount_t2_days', 20)::int;
  vat_bp int := round(public.setting_num('vat_rate', 0.15) * 10000)::int;
  fee_bp int := round(public.setting_num('masar_fee_rate', 0.10) * 10000)::int;
  vat_on_fee boolean := public.setting_bool('vat_on_fee', false);
  line bigint; pct int; disc bigint; drv bigint; vat bigint; fee bigint;
begin
  line := p_days::bigint * p_rate_h * p_units + p_days::bigint * coalesce(p_att_h, 0);
  pct := case when p_days > t2 and p_t2_pct > 0 then p_t2_pct when p_days > t1 and p_t1_pct > 0 then p_t1_pct else 0 end;
  disc := round(line * pct / 100.0);
  drv := line - disc;
  fee := round(drv * fee_bp / 10000.0);
  vat := round(drv * vat_bp / 10000.0) + case when vat_on_fee then round(fee * vat_bp / 10000.0) else 0 end;
  return jsonb_build_object('lineH', line, 'discountPct', pct, 'discountH', disc, 'driverH', drv,
    'vatBp', vat_bp, 'vatH', vat, 'feeBp', fee_bp, 'feeH', fee, 'totalH', drv + vat + fee,
    't1Days', t1, 't2Days', t2);
end;
$$;

-- ---------------------------------------------------------------------------
-- Housekeeping: expire unanswered requests and unpaid acceptances, release
-- their seats, close finished bookings. Runs at the start of every booking
-- function (so a late job never blocks a seat) and every minute via pg_cron
-- when it is available.
-- ---------------------------------------------------------------------------

create or replace function public.expire_stale()
returns void language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select id, parent_id, driver_id, code, status from public.bookings
            where (status = 'pending' and request_expires_at < now())
               or (status = 'accepted' and payment_due_at < now())
            for update skip locked
  loop
    update public.bookings set status = 'expired' where id = r.id;
    delete from public.seat_holds where booking_id = r.id;
    perform public.notify(r.parent_id, 'booking_expired',
      jsonb_build_object('code', r.code, 'reason', case when r.status = 'pending' then 'no_response' else 'not_paid' end),
      '/account/booking?id=' || r.id);
    if r.status = 'accepted' then
      perform public.notify(r.driver_id, 'booking_expired', jsonb_build_object('code', r.code, 'reason', 'not_paid'),
        '/driver/requests');
    end if;
  end loop;
  delete from public.seat_holds where expires_at is not null and expires_at < now();
  update public.bookings set status = 'completed'
   where status = 'confirmed' and coalesce(ends_on, last_date) < public.riyadh_today();
end;
$$;

do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then null;
  end;
  begin
    perform cron.schedule('masar-expire-stale', '* * * * *', 'select public.expire_stale()');
  exception when others then null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Search (public: visitors can browse without an account)
-- ---------------------------------------------------------------------------

create or replace function public.driver_public(p_driver uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', d.id,
    'firstNameEn', split_part(coalesce(d.name_en, ''), ' ', 1),
    'firstNameAr', split_part(coalesce(d.name_ar, ''), ' ', 1),
    'gender', d.gender, 'city', d.city, 'languages', to_jsonb(d.languages), 'bio', d.bio,
    'yearsExperience', d.years_experience, 'memberSince', d.approved_at,
    'photo', (select case when x.bucket = 'demo' then x.path else x.bucket || '/' || x.path end
                from public.driver_documents x where x.driver_id = d.id and x.kind = 'profile_photo' and x.status = 'approved'),
    'verified', d.status = 'approved',
    'checks', coalesce((select jsonb_agg(distinct case
        when x.kind in ('id_front', 'id_back', 'selfie') then 'identity'
        when x.kind = 'police' then 'police'
        when x.kind = 'licence' then 'licence'
        when x.kind in ('istimara', 'insurance', 'fahas') then 'vehicle'
        when x.kind = 'tga_card' then 'tga'
        when x.kind = 'first_aid' then 'first_aid' end)
      from public.driver_documents x where x.driver_id = d.id and x.status = 'approved'
        and x.kind not in ('profile_photo', 'car_front', 'car_back', 'car_side', 'car_interior')), '[]'::jsonb),
    'carPhotos', coalesce((select jsonb_agg(case when x.bucket = 'demo' then x.path else x.bucket || '/' || x.path end order by x.kind)
      from public.driver_documents x where x.driver_id = d.id and x.status = 'approved'
        and x.kind in ('car_front', 'car_back', 'car_side', 'car_interior')), '[]'::jsonb),
    'completedTrips', (select count(*) from public.booking_dates bd join public.bookings b on b.id = bd.booking_id
                        where b.driver_id = d.id and bd.state = 'completed'),
    'vehicle', (select jsonb_build_object('type', v.type, 'make', v.make, 'model', v.model, 'year', v.year,
        'color', v.color, 'seats', v.seats, 'carCategory', v.car_category, 'busType', v.bus_type, 'ac', v.ac,
        'gps', v.gps, 'cameras', v.cameras, 'seatbelts', v.seatbelts, 'femaleAttendant', v.female_attendant,
        'wheelchair', v.wheelchair) from public.vehicles v where v.driver_id = d.id)
  )
  from public.drivers d where d.id = p_driver
$$;

create or replace function public.pricing_settings()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'vatBp', round(public.setting_num('vat_rate', 0.15) * 10000)::int,
    'feeBp', round(public.setting_num('masar_fee_rate', 0.10) * 10000)::int,
    'vatOnFee', public.setting_bool('vat_on_fee', false),
    't1Days', public.setting_num('discount_t1_days', 10)::int,
    't2Days', public.setting_num('discount_t2_days', 20)::int,
    'cancelNoticeDays', public.setting_num('cancel_notice_days', 7)::int,
    'requestHoldHours', public.setting_num('request_hold_hours', 24)::int,
    'paymentHoldHours', public.setting_num('payment_hold_hours', 12)::int,
    'schoolWeekDays', public.setting_num('school_week_days', 5)::int,
    'holidays', coalesce(public.setting('holidays'), '[]'::jsonb),
    'today', public.riyadh_today(),
    'demoMode', public.setting_bool('demo_mode', true))
$$;

create or replace function public.search_services(p jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.expire_stale();
  return jsonb_build_object(
    'settings', public.pricing_settings(),
    'districts', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'city', city, 'nameEn', name_en, 'nameAr', name_ar,
                    'lat', lat, 'lng', lng) order by city, name_en), '[]'::jsonb) from public.districts),
    'services', coalesce((select jsonb_agg(public.service_json(s.id, coalesce((p ->> 'days')::int, 42))
                    || jsonb_build_object('driver', public.driver_public(s.driver_id)))
       from public.services s join public.drivers d on d.id = s.driver_id
      where s.status = 'active' and d.status = 'approved'
        and (p ->> 'destinationId' is null or s.destination_id = (p ->> 'destinationId')::uuid)), '[]'::jsonb));
end;
$$;

create or replace function public.get_service(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  perform public.expire_stale();
  if not exists (select 1 from public.services s join public.drivers d on d.id = s.driver_id
                  where s.id = p_id and ((s.status = 'active' and d.status = 'approved') or s.driver_id = auth.uid() or public.is_admin())) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  v := public.service_json(p_id, 90) || jsonb_build_object('driver', public.driver_public((select driver_id from public.services where id = p_id)));
  return jsonb_build_object('service', v, 'settings', public.pricing_settings(),
    'districts', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'city', city, 'nameEn', name_en, 'nameAr', name_ar,
                    'lat', lat, 'lng', lng)), '[]'::jsonb) from public.districts
                   where id in (select district_id from public.service_coverage where service_id = p_id)));
end;
$$;

-- ---------------------------------------------------------------------------
-- Quote and request a booking
-- p = { serviceId, serviceType, legs, childIds[], addressId, dates[], attendant, note }
-- build_quote checks everything; with p_strict it raises on the first problem.
-- ---------------------------------------------------------------------------

create or replace function public.build_quote(p_parent uuid, p jsonb, p_strict boolean)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  s public.services%rowtype;
  pr public.service_pricing%rowtype;
  a public.addresses%rowtype;
  v public.service_versions%rowtype;
  v_type text := p ->> 'serviceType';
  v_legs text := coalesce(p ->> 'legs', 'both');
  v_exclusive boolean := (p ->> 'serviceType') in ('exclusive_car', 'whole_bus');
  v_child_ids uuid[];
  v_children jsonb;
  v_kids int;
  v_dates date[];
  d date;
  v_cap int; v_taken int; v_need int;
  v_problems jsonb := '[]'::jsonb;
  v_unavail jsonb := '[]'::jsonb;
  v_ok_dates date[] := '{}';
  v_district text;
  v_surcharge bigint;
  v_covered boolean;
  v_proj jsonb;
  v_dist int;
  v_rate bigint;
  v_att boolean := coalesce((p ->> 'attendant')::boolean, false);
  v_att_h bigint := 0;
  v_price jsonb;
  v_first_v public.service_versions%rowtype;
  v_first_ts timestamptz;
  v_expires timestamptz;
  v_est int;
  v_age int;
  r record;
  v_dow smallint;
begin
  select * into s from public.services where id = (p ->> 'serviceId')::uuid;
  if s.id is null or s.status <> 'active'
     or not exists (select 1 from public.drivers where id = s.driver_id and status = 'approved') then
    raise exception 'service_unavailable' using errcode = 'P0001';
  end if;
  select * into pr from public.service_pricing where service_id = s.id and service_type = v_type;
  if pr.service_id is null or (v_exclusive and not s.exclusive_enabled) or (not v_exclusive and not s.shared_enabled) then
    raise exception 'type_not_offered' using errcode = 'P0001';
  end if;
  if v_legs not in ('both', 'outbound', 'return') then raise exception 'bad_legs' using errcode = 'P0001'; end if;

  -- Children
  v_child_ids := array(select (x)::uuid from jsonb_array_elements_text(coalesce(p -> 'childIds', '[]')) x);
  select count(*), jsonb_agg(jsonb_build_object('id', c.id, 'firstName', split_part(c.full_name, ' ', 1),
           'gender', c.gender, 'dateOfBirth', c.date_of_birth))
    into v_kids, v_children
    from public.children c where c.id = any (v_child_ids) and c.parent_id = p_parent;
  if v_kids = 0 or v_kids <> coalesce(array_length(v_child_ids, 1), 0) then
    raise exception 'children_required' using errcode = 'P0001';
  end if;
  if v_kids > s.max_children_per_family then
    v_problems := v_problems || jsonb_build_object('code', 'too_many_children', 'detail', s.max_children_per_family);
  end if;
  if v_exclusive and pr.max_children is not null and v_kids > pr.max_children then
    v_problems := v_problems || jsonb_build_object('code', 'too_many_children', 'detail', pr.max_children);
  end if;
  if s.accepts = 'boys' and exists (select 1 from jsonb_array_elements(v_children) x where x ->> 'gender' = 'girl') then
    v_problems := v_problems || jsonb_build_object('code', 'gender_not_accepted', 'detail', 'boys');
  end if;
  if s.accepts = 'girls' and exists (select 1 from jsonb_array_elements(v_children) x where x ->> 'gender' = 'boy') then
    v_problems := v_problems || jsonb_build_object('code', 'gender_not_accepted', 'detail', 'girls');
  end if;

  -- Pickup address, district and route fit
  select * into a from public.addresses where id = (p ->> 'addressId')::uuid and parent_id = p_parent;
  if a.id is null then raise exception 'address_required' using errcode = 'P0001'; end if;
  v_district := public.resolve_district(a.lat, a.lng, a.district);
  select surcharge_h into v_surcharge from public.service_coverage where service_id = s.id and district_id = v_district;
  v_covered := found;
  v_surcharge := coalesce(v_surcharge, 0);
  v_proj := public.path_project(s.path, a.lat, a.lng);
  v_dist := coalesce((v_proj ->> 'distance_m')::int,
                     round(public.geo_dist_m(a.lat, a.lng, s.start_lat, s.start_lng))::int);
  if v_dist > 2 * s.max_pickup_m then
    v_problems := v_problems || jsonb_build_object('code', 'outside_route', 'detail', v_dist);
  end if;

  -- Dates
  v_dates := array(select distinct x::date from jsonb_array_elements_text(coalesce(p -> 'dates', '[]')) x order by 1);
  if coalesce(array_length(v_dates, 1), 0) = 0 then raise exception 'dates_required' using errcode = 'P0001'; end if;
  if array_length(v_dates, 1) > 130 then raise exception 'too_many_dates' using errcode = 'P0001'; end if;

  foreach d in array v_dates loop
    select * into v from public.service_version_on(s.id, d);
    v_dow := extract(dow from d)::smallint;
    if d <= public.riyadh_today() or d > public.riyadh_today() + 180 then
      v_unavail := v_unavail || jsonb_build_object('date', d, 'reason', 'out_of_range');
    elsif v.service_id is null or not (v_dow = any (v.days)) then
      v_unavail := v_unavail || jsonb_build_object('date', d, 'reason', 'not_running');
    elsif (v_legs in ('both', 'outbound') and not v.outbound) or (v_legs in ('both', 'return') and not v.return_trip) then
      v_unavail := v_unavail || jsonb_build_object('date', d, 'reason', 'leg_not_offered');
    elsif public.date_closed(s.id, d) is not null then
      v_unavail := v_unavail || jsonb_build_object('date', d, 'reason', public.date_closed(s.id, d));
    else
      v_cap := public.seat_capacity(s.id, d);
      v_taken := public.seats_taken(s.id, d);
      v_need := case when v_exclusive then v_cap else v_kids end;
      if (v_exclusive and v_taken > 0) or v_cap - v_taken < v_need or v_cap = 0 then
        v_unavail := v_unavail || jsonb_build_object('date', d, 'reason', 'full', 'free', greatest(v_cap - v_taken, 0));
      else
        v_ok_dates := v_ok_dates || d;
      end if;
    end if;
  end loop;

  -- Ages at the first date
  for r in select x from jsonb_array_elements(v_children) x loop
    v_age := extract(year from age(coalesce(v_ok_dates[1], v_dates[1]), (r.x ->> 'dateOfBirth')::date))::int;
    if v_age < s.age_min or v_age > s.age_max then
      v_problems := v_problems || jsonb_build_object('code', 'age_not_accepted', 'detail', r.x ->> 'firstName');
    end if;
  end loop;

  -- Rate per unit per day, for this district
  v_rate := case when v_legs = 'both' then pr.daily_h else coalesce(pr.one_way_h, round(pr.daily_h * 0.6)) end + v_surcharge;
  if v_type = 'whole_bus' and v_att then
    if not pr.attendant_available then
      v_problems := v_problems || jsonb_build_object('code', 'attendant_not_offered');
    end if;
    v_att_h := pr.attendant_fee_h;
  end if;
  v_price := public.calc_price(v_rate, case when v_exclusive then 1 else v_kids end,
    coalesce(array_length(v_ok_dates, 1), 0), v_att_h, s.discount_t1_pct, s.discount_t2_pct);

  -- When the first trip starts, and therefore how long the driver has to answer
  if coalesce(array_length(v_ok_dates, 1), 0) > 0 then
    select * into v_first_v from public.service_version_on(s.id, v_ok_dates[1]);
    v_first_ts := public.riyadh_ts(v_ok_dates[1],
      case when v_legs in ('both', 'outbound') then v_first_v.pickup_start_min else v_first_v.return_depart_min end);
    v_expires := least(now() + make_interval(hours => public.setting_num('request_hold_hours', 24)::int),
                       v_first_ts - make_interval(hours => public.setting_num('hold_cutoff_hours', 2)::int));
    if v_expires < now() + interval '15 minutes' then
      v_problems := v_problems || jsonb_build_object('code', 'too_soon');
    end if;
    if v_legs in ('both', 'outbound') and (v_proj ->> 'total_m')::numeric > 0 then
      v_est := v_first_v.pickup_start_min + round(((v_proj ->> 'along_m')::numeric / (v_proj ->> 'total_m')::numeric)
               * (v_first_v.pickup_end_min - v_first_v.pickup_start_min));
    end if;
  end if;

  if p_strict then
    if jsonb_array_length(v_problems) > 0 then
      raise exception '%', v_problems -> 0 ->> 'code' using errcode = 'P0001', detail = coalesce(v_problems -> 0 ->> 'detail', '');
    end if;
    if jsonb_array_length(v_unavail) > 0 then
      raise exception 'dates_unavailable' using errcode = 'P0001', detail = v_unavail::text;
    end if;
  end if;

  return jsonb_build_object(
    'serviceId', s.id, 'driverId', s.driver_id, 'serviceType', v_type, 'legs', v_legs, 'exclusive', v_exclusive,
    'children', v_children, 'childrenCount', v_kids, 'units', case when v_exclusive then 1 else v_kids end,
    'addressId', a.id, 'districtId', v_district, 'covered', v_covered,
    'pickup', jsonb_build_object('lat', a.lat, 'lng', a.lng, 'label', a.label, 'customLabel', a.custom_label,
       'city', a.city, 'district', a.district, 'street', a.street, 'buildingNo', a.building_no,
       'floorApt', a.floor_apt, 'landmark', a.landmark, 'nationalAddress', a.national_address, 'districtId', v_district),
    'pickupDistanceM', v_dist, 'outsideRoute', (v_dist > s.max_pickup_m or not v_covered),
    'estPickupMin', v_est,
    'baseRateH', case when v_legs = 'both' then pr.daily_h else coalesce(pr.one_way_h, round(pr.daily_h * 0.6)) end,
    'surchargeH', v_surcharge, 'rateH', v_rate, 'attendant', v_att_h > 0, 'attendantFeeH', v_att_h,
    'dates', to_jsonb(v_ok_dates), 'bookedDays', coalesce(array_length(v_ok_dates, 1), 0),
    'unavailable', v_unavail, 'problems', v_problems,
    'price', v_price,
    'requestExpiresAt', v_expires, 'firstTripAt', v_first_ts
  );
end;
$$;

create or replace function public.quote_booking(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  perform public.expire_stale();
  return public.build_quote(auth.uid(), p, false);
end;
$$;

-- Take seats for a booking on each of its dates. Callers hold the service lock.
create or replace function public.take_seats(p_booking uuid, p_service uuid, p_dates date[], p_exclusive boolean,
  p_kids int, p_expires timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare
  d date; v_cap int; v_have int; v_need int; v_taken int;
begin
  foreach d in array p_dates loop
    v_cap := public.seat_capacity(p_service, d);
    v_have := (select count(*) from public.seat_holds where booking_id = p_booking and date = d
                and (expires_at is null or expires_at > now()));
    v_need := case when p_exclusive then v_cap else p_kids end;
    if v_have >= v_need and v_need > 0 then
      update public.seat_holds set expires_at = p_expires where booking_id = p_booking and date = d;
      continue;
    end if;
    delete from public.seat_holds where booking_id = p_booking and date = d;
    v_taken := public.seats_taken(p_service, d);
    if v_cap = 0 or (p_exclusive and v_taken > 0) or v_cap - v_taken < v_need then
      raise exception 'no_seats' using errcode = 'P0001', detail = d::text;
    end if;
    insert into public.seat_holds (service_id, date, seat_no, booking_id, expires_at)
    select p_service, d, n, p_booking, p_expires
      from generate_series(1, v_cap) n
     where not exists (select 1 from public.seat_holds h where h.service_id = p_service and h.date = d and h.seat_no = n)
     order by n limit v_need;
  end loop;
end;
$$;

create or replace function public.create_booking(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  q jsonb;
  v_id uuid;
  v_code text;
  v_dates date[];
  v_prof public.profiles%rowtype;
  v_service uuid := (p ->> 'serviceId')::uuid;
begin
  if uid is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  select * into v_prof from public.profiles where id = uid;
  if v_prof.role <> 'parent' then raise exception 'parents_only' using errcode = 'P0001'; end if;
  if v_prof.phone_verified_at is null then raise exception 'phone_not_verified' using errcode = 'P0001'; end if;
  perform public.expire_stale();

  -- One lock per service: two parents can never take the same last seat
  perform pg_advisory_xact_lock(hashtext('svc:' || v_service::text));
  q := public.build_quote(uid, p, true);
  v_dates := array(select x::date from jsonb_array_elements_text(q -> 'dates') x);

  if exists (select 1 from public.bookings b
              join public.booking_children bc on bc.booking_id = b.id
              join public.booking_dates bd on bd.booking_id = b.id
             where b.service_id = v_service and b.status in ('pending', 'accepted', 'confirmed')
               and bc.child_id in (select (x ->> 'id')::uuid from jsonb_array_elements(q -> 'children') x)
               and bd.date = any (v_dates) and bd.state = 'scheduled') then
    raise exception 'duplicate_booking' using errcode = 'P0001';
  end if;

  loop
    v_code := public.short_code('MS-');
    exit when not exists (select 1 from public.bookings where code = v_code);
  end loop;

  insert into public.bookings (code, parent_id, driver_id, service_id, status, service_type, legs, address_id, pickup,
    district_id, children_count, units, seats_needed, first_date, last_date, booked_days, rate_h, surcharge_h,
    attendant, attendant_fee_h, line_h, discount_pct, discount_h, driver_h, vat_bp, vat_h, fee_bp, fee_h, total_h,
    outside_route, pickup_distance_m, est_pickup_min, note, request_expires_at)
  values (v_code, uid, (q ->> 'driverId')::uuid, v_service, 'pending', q ->> 'serviceType', q ->> 'legs',
    (q ->> 'addressId')::uuid, q -> 'pickup', q ->> 'districtId', (q ->> 'childrenCount')::smallint,
    (q ->> 'units')::smallint,
    case when (q ->> 'exclusive')::boolean then
      (select seats from public.vehicles where driver_id = (q ->> 'driverId')::uuid) else (q ->> 'childrenCount')::smallint end,
    v_dates[1], v_dates[array_length(v_dates, 1)], array_length(v_dates, 1),
    (q ->> 'rateH')::bigint, (q ->> 'surchargeH')::bigint, (q ->> 'attendant')::boolean, (q ->> 'attendantFeeH')::bigint,
    (q -> 'price' ->> 'lineH')::bigint, (q -> 'price' ->> 'discountPct')::smallint, (q -> 'price' ->> 'discountH')::bigint,
    (q -> 'price' ->> 'driverH')::bigint, (q -> 'price' ->> 'vatBp')::int, (q -> 'price' ->> 'vatH')::bigint,
    (q -> 'price' ->> 'feeBp')::int, (q -> 'price' ->> 'feeH')::bigint, (q -> 'price' ->> 'totalH')::bigint,
    (q ->> 'outsideRoute')::boolean, (q ->> 'pickupDistanceM')::int, (q ->> 'estPickupMin')::smallint,
    nullif(trim(p ->> 'note'), ''), (q ->> 'requestExpiresAt')::timestamptz)
  returning id into v_id;

  insert into public.booking_children (booking_id, child_id, first_name, gender, age)
  select v_id, (x ->> 'id')::uuid, x ->> 'firstName', x ->> 'gender',
         extract(year from age(v_dates[1], (x ->> 'dateOfBirth')::date))::smallint
    from jsonb_array_elements(q -> 'children') x;

  insert into public.booking_dates (booking_id, date) select v_id, unnest(v_dates);

  perform public.take_seats(v_id, v_service, v_dates, (q ->> 'exclusive')::boolean,
    (q ->> 'childrenCount')::int, (q ->> 'requestExpiresAt')::timestamptz);

  perform public.notify((q ->> 'driverId')::uuid, 'booking_requested',
    jsonb_build_object('code', v_code, 'children', q -> 'childrenCount', 'days', array_length(v_dates, 1),
      'firstDate', v_dates[1], 'lastDate', v_dates[array_length(v_dates, 1)],
      'driverH', q -> 'price' -> 'driverH', 'expiresAt', q -> 'requestExpiresAt',
      'service', (select name from public.services where id = v_service)),
    '/driver/requests');

  return public.get_booking(v_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Reading bookings. What each side sees:
--   parent: everything about their booking
--   driver: children's first names, ages and the pickup district always;
--           the exact pickup, notes and phone only once it is confirmed
--   admin:  everything
-- ---------------------------------------------------------------------------

create or replace function public.booking_json(p_id uuid, p_viewer text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', b.id, 'code', b.code, 'status', b.status, 'cancelledBy', b.cancelled_by, 'endsOn', b.ends_on,
    'viewer', p_viewer,
    'serviceType', b.service_type, 'legs', b.legs, 'attendant', b.attendant,
    'firstDate', b.first_date, 'lastDate', b.last_date, 'bookedDays', b.booked_days,
    'outsideRoute', b.outside_route, 'pickupDistanceM', b.pickup_distance_m, 'estPickupMin', b.est_pickup_min,
    'note', b.note, 'districtId', b.district_id,
    'district', (select jsonb_build_object('id', d.id, 'nameEn', d.name_en, 'nameAr', d.name_ar, 'city', d.city)
                   from public.districts d where d.id = b.district_id),
    'requestExpiresAt', b.request_expires_at, 'paymentDueAt', b.payment_due_at, 'respondedAt', b.responded_at,
    'confirmedAt', b.confirmed_at, 'cancelledAt', b.cancelled_at, 'rejectReason', b.reject_reason,
    'cancelReason', b.cancel_reason, 'createdAt', b.created_at,
    'price', jsonb_build_object('rateH', b.rate_h, 'surchargeH', b.surcharge_h, 'units', b.units,
       'childrenCount', b.children_count, 'attendantFeeH', b.attendant_fee_h, 'lineH', b.line_h,
       'discountPct', b.discount_pct, 'discountH', b.discount_h, 'driverH', b.driver_h, 'vatBp', b.vat_bp,
       'vatH', b.vat_h, 'feeBp', b.fee_bp, 'feeH', b.fee_h, 'totalH', b.total_h),
    'service', (select jsonb_build_object('id', s.id, 'name', s.name, 'kind', s.kind,
        'path', s.path, 'start', jsonb_build_object('lat', s.start_lat, 'lng', s.start_lng), 'stops', s.stops,
        'destination', (select jsonb_build_object('id', d.id, 'nameEn', d.name_en, 'nameAr', d.name_ar, 'city', d.city,
                          'lat', d.lat, 'lng', d.lng) from public.destinations d where d.id = s.destination_id),
        'schedule', (select jsonb_build_object('days', to_jsonb(v.days), 'outbound', v.outbound,
            'pickupStartMin', v.pickup_start_min, 'pickupEndMin', v.pickup_end_min, 'arriveMin', v.arrive_min,
            'returnTrip', v.return_trip, 'returnDepartMin', v.return_depart_min, 'returnEndMin', v.return_end_min)
          from public.service_version_on(s.id, b.first_date) v))
      from public.services s where s.id = b.service_id),
    'driver', (select jsonb_build_object('id', dr.id,
        'firstNameEn', split_part(coalesce(dr.name_en, ''), ' ', 1), 'firstNameAr', split_part(coalesce(dr.name_ar, ''), ' ', 1),
        'gender', dr.gender,
        'photo', (select case when x.bucket = 'demo' then x.path else x.bucket || '/' || x.path end
                    from public.driver_documents x where x.driver_id = dr.id and x.kind = 'profile_photo'),
        'phone', case when b.status in ('confirmed', 'completed') or p_viewer = 'admin'
                      then (select phone from public.profiles where id = dr.id) end,
        'vehicle', (select jsonb_build_object('type', v.type, 'make', v.make, 'model', v.model, 'year', v.year,
            'color', v.color, 'seats', v.seats,
            'plateDigits', case when b.status in ('confirmed', 'completed') or p_viewer <> 'parent' then v.plate_digits end,
            'plateLetters', case when b.status in ('confirmed', 'completed') or p_viewer <> 'parent' then v.plate_letters end)
          from public.vehicles v where v.driver_id = dr.id))
      from public.drivers dr where dr.id = b.driver_id),
    'parent', (select jsonb_build_object('firstName', split_part(coalesce(pr.full_name, ''), ' ', 1),
        'phone', case when p_viewer <> 'driver' or b.status in ('confirmed', 'completed') then pr.phone end)
      from public.profiles pr where pr.id = b.parent_id),
    'pickup', case when p_viewer <> 'driver' or b.status in ('confirmed', 'completed') then b.pickup
                   else jsonb_build_object('districtId', b.district_id, 'city', b.pickup ->> 'city') end,
    'children', coalesce((select jsonb_agg(jsonb_build_object('id', case when p_viewer <> 'driver' then bc.child_id end,
        'firstName', bc.first_name, 'gender', bc.gender, 'age', bc.age,
        'driverNotes', case when p_viewer <> 'driver' or b.status in ('confirmed', 'completed') then c.driver_notes end,
        'medicalNotes', case when p_viewer <> 'driver' or b.status in ('confirmed', 'completed') then c.medical_notes end,
        'authorizedPickups', case when p_viewer <> 'driver' or b.status in ('confirmed', 'completed') then c.authorized_pickups end,
        'emergencyName', case when p_viewer <> 'driver' or b.status in ('confirmed', 'completed') then c.emergency_name end,
        'emergencyPhone', case when p_viewer <> 'driver' or b.status in ('confirmed', 'completed') then c.emergency_phone end)
        order by bc.first_name)
      from public.booking_children bc left join public.children c on c.id = bc.child_id
      where bc.booking_id = b.id), '[]'::jsonb),
    'dates', coalesce((select jsonb_agg(jsonb_build_object('date', bd.date, 'state', bd.state, 'refundedH', bd.refunded_h)
        order by bd.date) from public.booking_dates bd where bd.booking_id = b.id), '[]'::jsonb),
    'payments', case when p_viewer <> 'driver' then coalesce((select jsonb_agg(jsonb_build_object('id', py.id,
        'method', py.method, 'amountH', py.amount_h, 'status', py.status, 'failureCode', py.failure_code,
        'cardBrand', py.card_brand, 'cardLast4', py.card_last4, 'createdAt', py.created_at) order by py.created_at)
      from public.payments py where py.booking_id = b.id), '[]'::jsonb) else '[]'::jsonb end,
    'invoices', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'number', i.number, 'kind', i.kind,
        'totalH', i.total_h, 'issuedAt', i.issued_at) order by i.issued_at)
      from public.invoices i where i.booking_id = b.id and (p_viewer <> 'driver' or i.kind = 'invoice')), '[]'::jsonb),
    'refunds', coalesce((select jsonb_agg(jsonb_build_object('id', rf.id, 'initiatedBy', rf.initiated_by,
        'days', rf.days, 'driverH', rf.driver_h, 'vatH', rf.vat_h, 'feeH', rf.fee_h, 'totalH', rf.total_h,
        'destination', rf.destination, 'createdAt', rf.created_at) order by rf.created_at)
      from public.refunds rf where rf.booking_id = b.id), '[]'::jsonb)
  )
  from public.bookings b where b.id = p_id
$$;

create or replace function public.get_booking(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  b public.bookings%rowtype;
begin
  if uid is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  perform public.expire_stale();
  select * into b from public.bookings where id = p_id;
  if b.parent_id = uid then return public.booking_json(p_id, 'parent'); end if;
  if b.driver_id = uid then return public.booking_json(p_id, 'driver'); end if;
  if public.is_admin() and b.id is not null then return public.booking_json(p_id, 'admin'); end if;
  raise exception 'not_found' using errcode = 'P0001';
end;
$$;

create or replace function public.booking_card(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', b.id, 'code', b.code, 'status', b.status, 'cancelledBy', b.cancelled_by,
    'endsOn', b.ends_on, 'serviceType', b.service_type, 'legs', b.legs,
    'firstDate', b.first_date, 'lastDate', b.last_date, 'bookedDays', b.booked_days,
    'totalH', b.total_h, 'driverH', b.driver_h,
    'requestExpiresAt', b.request_expires_at, 'paymentDueAt', b.payment_due_at, 'createdAt', b.created_at,
    'outsideRoute', b.outside_route, 'pickupDistanceM', b.pickup_distance_m, 'estPickupMin', b.est_pickup_min,
    'district', (select jsonb_build_object('id', d.id, 'nameEn', d.name_en, 'nameAr', d.name_ar, 'city', d.city)
                   from public.districts d where d.id = b.district_id),
    'serviceName', (select name from public.services where id = b.service_id),
    'destination', (select jsonb_build_object('nameEn', d.name_en, 'nameAr', d.name_ar)
                      from public.services s join public.destinations d on d.id = s.destination_id where s.id = b.service_id),
    'driver', (select jsonb_build_object('firstNameEn', split_part(coalesce(dr.name_en, ''), ' ', 1),
                 'firstNameAr', split_part(coalesce(dr.name_ar, ''), ' ', 1), 'gender', dr.gender,
                 'vehicleType', (select type from public.vehicles where driver_id = dr.id))
               from public.drivers dr where dr.id = b.driver_id),
    'parentFirstName', (select split_part(coalesce(full_name, ''), ' ', 1) from public.profiles where id = b.parent_id),
    'children', coalesce((select jsonb_agg(jsonb_build_object('firstName', bc.first_name, 'gender', bc.gender, 'age', bc.age))
                  from public.booking_children bc where bc.booking_id = b.id), '[]'::jsonb),
    'nextDate', (select min(date) from public.booking_dates where booking_id = b.id and state = 'scheduled'
                  and date >= public.riyadh_today()))
  from public.bookings b where b.id = p_id
$$;

create or replace function public.my_bookings()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  perform public.expire_stale();
  return coalesce((select jsonb_agg(public.booking_card(id) order by created_at desc)
    from public.bookings where parent_id = auth.uid()), '[]'::jsonb);
end;
$$;

create or replace function public.driver_bookings(p_kind text default 'requests')
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  perform public.expire_stale();
  return coalesce((select jsonb_agg(public.booking_card(id) order by
      case when p_kind = 'requests' then request_expires_at end, first_date, created_at desc)
    from public.bookings
    where driver_id = auth.uid()
      and ((p_kind = 'requests' and status in ('pending', 'accepted'))
        or (p_kind = 'active' and status = 'confirmed')
        or (p_kind = 'past' and status in ('completed', 'cancelled', 'rejected', 'expired')))), '[]'::jsonb);
end;
$$;

-- Accept or reject a request. Accepting re-checks every seat inside the lock.
create or replace function public.driver_respond(p_booking uuid, p_accept boolean, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  b public.bookings%rowtype;
  v_due timestamptz;
  v_first timestamptz;
  v_v public.service_versions%rowtype;
  v_dates date[];
begin
  if uid is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  perform public.expire_stale();
  select * into b from public.bookings where id = p_booking for update;
  if b.driver_id is distinct from uid then raise exception 'not_found' using errcode = 'P0001'; end if;
  if b.status <> 'pending' then raise exception 'not_pending' using errcode = 'P0001', detail = b.status; end if;

  if not p_accept then
    if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required' using errcode = 'P0001'; end if;
    update public.bookings set status = 'rejected', reject_reason = trim(p_reason), responded_at = now() where id = b.id;
    delete from public.seat_holds where booking_id = b.id;
    perform public.notify(b.parent_id, 'booking_rejected', jsonb_build_object('code', b.code, 'reason', trim(p_reason)),
      '/account/booking?id=' || b.id);
    return public.booking_json(b.id, 'driver');
  end if;

  select * into v_v from public.service_version_on(b.service_id, b.first_date);
  v_first := public.riyadh_ts(b.first_date,
    case when b.legs in ('both', 'outbound') then v_v.pickup_start_min else v_v.return_depart_min end);
  v_due := least(now() + make_interval(hours => public.setting_num('payment_hold_hours', 12)::int),
                 v_first - make_interval(hours => public.setting_num('hold_cutoff_hours', 2)::int));
  if v_due < now() + interval '10 minutes' then raise exception 'too_soon' using errcode = 'P0001'; end if;

  perform pg_advisory_xact_lock(hashtext('svc:' || b.service_id::text));
  v_dates := array(select date from public.booking_dates where booking_id = b.id and state = 'scheduled' order by date);
  perform public.take_seats(b.id, b.service_id, v_dates, b.service_type in ('exclusive_car', 'whole_bus'),
    b.children_count, v_due);

  update public.bookings set status = 'accepted', payment_due_at = v_due, responded_at = now() where id = b.id;
  perform public.notify(b.parent_id, 'booking_accepted',
    jsonb_build_object('code', b.code, 'totalH', b.total_h, 'dueAt', v_due,
      'driver', (select split_part(coalesce(name_en, ''), ' ', 1) from public.drivers where id = uid),
      'driverAr', (select split_part(coalesce(name_ar, ''), ' ', 1) from public.drivers where id = uid)),
    '/checkout?booking=' || b.id);
  return public.booking_json(b.id, 'driver');
end;
$$;
-- ---------------------------------------------------------------------------
-- Ledger helpers
-- ---------------------------------------------------------------------------

create or replace function public.post(p_txn uuid, p_account text, p_user uuid, p_booking uuid, p_payment uuid,
  p_amount bigint, p_kind text, p_memo text)
returns void language sql security definer set search_path = '' as $$
  insert into public.ledger_entries (txn_id, account, user_id, booking_id, payment_id, amount_h, kind, memo)
  select p_txn, p_account, p_user, p_booking, p_payment, p_amount, p_kind, p_memo where p_amount <> 0
$$;

create or replace function public.balance(p_account text, p_user uuid)
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce(sum(amount_h), 0)::bigint from public.ledger_entries
   where account = p_account and user_id is not distinct from p_user
$$;

-- Every parent wallet starts with a demo balance, so the money model can be
-- shown without any card at all.
create or replace function public.ensure_wallet(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_txn uuid := gen_random_uuid(); v_amt bigint := public.setting_num('wallet_demo_h', 200000)::bigint;
begin
  if p_user is null or exists (select 1 from public.ledger_entries where account = 'parent_wallet' and user_id = p_user) then
    return;
  end if;
  if (select role from public.profiles where id = p_user) <> 'parent' then return; end if;
  perform pg_advisory_xact_lock(hashtext('wallet:' || p_user::text));
  if exists (select 1 from public.ledger_entries where account = 'parent_wallet' and user_id = p_user) then return; end if;
  perform public.post(v_txn, 'promo', null, null, null, -v_amt, 'topup', 'demo_balance');
  perform public.post(v_txn, 'parent_wallet', p_user, null, null, v_amt, 'topup', 'demo_balance');
end;
$$;

create or replace function public.next_invoice_number()
returns text language sql volatile security definer set search_path = '' as $$
  select 'MSR-' || to_char(public.riyadh_today(), 'YYYY') || '-' || lpad(nextval('public.invoice_seq')::text, 6, '0')
$$;

-- ---------------------------------------------------------------------------
-- The simulated gateway. Behaves like a real one: Luhn and expiry checks,
-- test cards for success / declined / insufficient funds / timeout, an
-- idempotency key so a retry can never charge twice, and payment plus
-- confirmation in one transaction so they can never disagree.
-- Only the published demo cards work; any other number is refused, so a
-- real card number is never processed or stored (only the last 4 digits).
-- p = { bookingId, method, idempotencyKey, card: { number, expMonth, expYear, cvc } }
-- ---------------------------------------------------------------------------

create or replace function public.card_brand(p_number text)
returns text language sql immutable set search_path = '' as $$
  select case
    when left(p_number, 6) in ('440647', '440795', '446404', '457865', '968208', '588845', '588846', '588848',
                               '604906', '636120', '968201', '504300', '431361', '521076', '529415', '535825',
                               '543085', '549760', '554180', '588847', '968205') then 'mada'
    when p_number ~ '^4' then 'visa'
    when p_number ~ '^(5[1-5]|2[2-7])' then 'mastercard'
    when p_number ~ '^3[47]' then 'amex'
    else 'card' end
$$;

create or replace function public.pay_booking(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_key text := p ->> 'idempotencyKey';
  v_method text := p ->> 'method';
  existing public.payments%rowtype;
  b public.bookings%rowtype;
  v_num text;
  v_brand text;
  v_code text := null;
  v_pay uuid;
  v_txn uuid := gen_random_uuid();
  v_inv uuid;
  v_exp_m int; v_exp_y int;
  v_dates date[];
begin
  if uid is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  if v_key is null or length(v_key) < 8 then raise exception 'idempotency_key_required' using errcode = 'P0001'; end if;

  -- Same key again: return the first result, change nothing
  select * into existing from public.payments where idempotency_key = v_key;
  if existing.id is not null then
    if existing.parent_id is distinct from uid then raise exception 'not_found' using errcode = 'P0001'; end if;
    return jsonb_build_object('status', existing.status, 'code', existing.failure_code, 'paymentId', existing.id,
      'bookingId', existing.booking_id, 'replayed', true,
      'invoiceId', (select id from public.invoices where payment_id = existing.id and kind = 'invoice'));
  end if;

  perform public.expire_stale();
  select * into b from public.bookings where id = (p ->> 'bookingId')::uuid for update;
  if b.parent_id is distinct from uid then raise exception 'not_found' using errcode = 'P0001'; end if;
  if b.status = 'confirmed' then raise exception 'already_paid' using errcode = 'P0001'; end if;
  if b.status <> 'accepted' then raise exception 'not_payable' using errcode = 'P0001', detail = b.status; end if;

  if v_method in ('card', 'mada') then
    v_num := regexp_replace(coalesce(p -> 'card' ->> 'number', ''), '\D', '', 'g');
    v_exp_m := nullif(p -> 'card' ->> 'expMonth', '')::int;
    v_exp_y := nullif(p -> 'card' ->> 'expYear', '')::int;
    if v_exp_y < 100 then v_exp_y := v_exp_y + 2000; end if;
    if not public.luhn_valid(v_num) then
      v_code := 'invalid_number';
    elsif v_exp_m is null or v_exp_m not between 1 and 12 or v_exp_y is null
          or make_date(v_exp_y, v_exp_m, 1) + interval '1 month' <= public.riyadh_today() then
      v_code := 'expired_card';
    elsif coalesce(p -> 'card' ->> 'cvc', '') !~ '^[0-9]{3}$' then
      v_code := 'invalid_cvc';
    elsif v_num in ('4000000000000002') then v_code := 'card_declined';
    elsif v_num in ('4000000000009995') then v_code := 'insufficient_funds';
    elsif v_num in ('4000000000000119') then v_code := 'processing_timeout';
    elsif v_num not in ('4242424242424242', '5555555555554444', '4464040000000007') then v_code := 'demo_card_only';
    end if;
    v_brand := public.card_brand(v_num);
  elsif v_method = 'wallet' then
    perform public.ensure_wallet(uid);
    perform pg_advisory_xact_lock(hashtext('wallet:' || uid::text));
    if public.balance('parent_wallet', uid) < b.total_h then v_code := 'insufficient_wallet'; end if;
  elsif v_method in ('applepay', 'stcpay') then
    null;  -- simulated wallet sheet always approves
  else
    raise exception 'bad_method' using errcode = 'P0001';
  end if;

  -- Seats must still be ours. If a hold lapsed, try to take the seats again.
  if v_code is null then
    perform pg_advisory_xact_lock(hashtext('svc:' || b.service_id::text));
    v_dates := array(select date from public.booking_dates where booking_id = b.id and state = 'scheduled' order by date);
    begin
      perform public.take_seats(b.id, b.service_id, v_dates, b.service_type in ('exclusive_car', 'whole_bus'),
        b.children_count, null);
    exception when others then
      v_code := 'seats_gone';
    end;
  end if;

  insert into public.payments (booking_id, parent_id, idempotency_key, method, amount_h, status, failure_code,
    card_brand, card_last4, reference)
  values (b.id, uid, v_key, v_method, b.total_h, case when v_code is null then 'succeeded' else 'failed' end, v_code,
    v_brand, case when v_num is not null and length(v_num) >= 4 then right(v_num, 4) end,
    'mock_' || replace(gen_random_uuid()::text, '-', ''))
  returning id into v_pay;

  if v_code is not null then
    return jsonb_build_object('status', 'failed', 'code', v_code, 'paymentId', v_pay, 'bookingId', b.id);
  end if;

  -- Charge: the parent pays driver price + VAT + fee; the driver is owed
  -- 100% of their price; Masar's revenue is the fee added on top.
  perform public.post(v_txn, case when v_method = 'wallet' then 'parent_wallet' else 'parent_external' end,
    uid, b.id, v_pay, -b.total_h, 'charge', b.code);
  perform public.post(v_txn, 'driver_payable', b.driver_id, b.id, v_pay, b.driver_h, 'charge', b.code);
  perform public.post(v_txn, 'vat_payable', null, b.id, v_pay, b.vat_h, 'charge', b.code);
  perform public.post(v_txn, 'platform_revenue', null, b.id, v_pay, b.fee_h, 'charge', b.code);

  insert into public.invoices (number, kind, booking_id, payment_id, parent_id, driver_id, driver_h, vat_h, fee_h,
    total_h, vat_bp, fee_bp, days, method)
  values (public.next_invoice_number(), 'invoice', b.id, v_pay, uid, b.driver_id, b.driver_h, b.vat_h, b.fee_h,
    b.total_h, b.vat_bp, b.fee_bp, b.booked_days, v_method)
  returning id into v_inv;

  update public.bookings set status = 'confirmed', confirmed_at = now() where id = b.id;
  perform public.notify(uid, 'booking_confirmed', jsonb_build_object('code', b.code, 'totalH', b.total_h,
    'firstDate', b.first_date), '/account/booking?id=' || b.id);
  perform public.notify(b.driver_id, 'booking_confirmed', jsonb_build_object('code', b.code, 'driverH', b.driver_h,
    'firstDate', b.first_date), '/driver/bookings');

  return jsonb_build_object('status', 'succeeded', 'paymentId', v_pay, 'invoiceId', v_inv, 'bookingId', b.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Refunds. One rule table, used everywhere:
--   parent cancels:  driver price refunded for days beyond the notice window
--                    (default 7 days); the Masar fee is kept
--   driver cancels:  everything refunded, fee included
--   admin cancels:   everything refunded, fee included
-- Per-day amounts are the booking's totals shared evenly across its days,
-- capped so the sum of refunds never exceeds what was paid.
-- ---------------------------------------------------------------------------

create or replace function public.refund_dates(p_booking uuid, p_dates date[], p_by text, p_with_fee boolean,
  p_dest text, p_reason text, p_new_state text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  b public.bookings%rowtype;
  n int := coalesce(array_length(p_dates, 1), 0);
  v_paid boolean;
  r_drv bigint; r_vat bigint; r_fee bigint; r_tot bigint;
  done_drv bigint; done_vat bigint; done_fee bigint;
  v_txn uuid := gen_random_uuid();
  v_ref uuid;
  v_dest text := coalesce(p_dest, 'wallet');
begin
  select * into b from public.bookings where id = p_booking for update;
  if n = 0 then return jsonb_build_object('totalH', 0); end if;
  v_paid := exists (select 1 from public.payments where booking_id = b.id and status = 'succeeded');

  update public.booking_dates set state = p_new_state where booking_id = b.id and date = any (p_dates) and state = 'scheduled';
  delete from public.seat_holds where booking_id = b.id and date = any (p_dates);
  if not v_paid then return jsonb_build_object('totalH', 0); end if;

  select coalesce(sum(driver_h), 0), coalesce(sum(vat_h), 0), coalesce(sum(fee_h), 0)
    into done_drv, done_vat, done_fee from public.refunds where booking_id = b.id;
  r_drv := least(round(b.driver_h::numeric * n / b.booked_days), b.driver_h - done_drv);
  r_vat := least(round(b.vat_h::numeric * n / b.booked_days), b.vat_h - done_vat);
  r_fee := case when p_with_fee then least(round(b.fee_h::numeric * n / b.booked_days), b.fee_h - done_fee) else 0 end;
  r_tot := r_drv + r_vat + r_fee;

  insert into public.refunds (booking_id, parent_id, initiated_by, reason, days, driver_h, vat_h, fee_h, total_h, destination)
  values (b.id, b.parent_id, p_by, p_reason, n, r_drv, r_vat, r_fee, r_tot, v_dest)
  returning id into v_ref;

  update public.booking_dates set refunded_h = round(r_tot::numeric / n) where booking_id = b.id and date = any (p_dates);

  perform public.post(v_txn, 'driver_payable', b.driver_id, b.id, null, -r_drv, 'refund', b.code);
  perform public.post(v_txn, 'vat_payable', null, b.id, null, -r_vat, 'refund', b.code);
  perform public.post(v_txn, 'platform_revenue', null, b.id, null, -r_fee, 'refund', b.code);
  perform public.post(v_txn, case when v_dest = 'wallet' then 'parent_wallet' else 'parent_external' end,
    b.parent_id, b.id, null, r_tot, 'refund', b.code);

  insert into public.invoices (number, kind, booking_id, refund_id, parent_id, driver_id, driver_h, vat_h, fee_h,
    total_h, vat_bp, fee_bp, days, method)
  values (public.next_invoice_number(), 'credit_note', b.id, v_ref, b.parent_id, b.driver_id, r_drv, r_vat, r_fee,
    r_tot, b.vat_bp, b.fee_bp, n, v_dest);

  return jsonb_build_object('refundId', v_ref, 'driverH', r_drv, 'vatH', r_vat, 'feeH', r_fee, 'totalH', r_tot,
    'days', n, 'destination', v_dest);
end;
$$;

-- What cancelling would do, shown before the parent confirms
create or replace function public.cancel_preview(p_booking uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  b public.bookings%rowtype;
  v_notice int := public.setting_num('cancel_notice_days', 7)::int;
  v_remaining int; v_in int; v_out int;
  v_paid boolean;
  v_last_in date;
begin
  perform public.expire_stale();
  select * into b from public.bookings where id = p_booking;
  if b.parent_id is distinct from auth.uid() then raise exception 'not_found' using errcode = 'P0001'; end if;
  v_paid := b.status = 'confirmed';
  select count(*) filter (where date > public.riyadh_today()),
         count(*) filter (where date > public.riyadh_today() and date < public.riyadh_today() + v_notice),
         count(*) filter (where date >= public.riyadh_today() + v_notice),
         max(date) filter (where date > public.riyadh_today() and date < public.riyadh_today() + v_notice)
    into v_remaining, v_in, v_out, v_last_in
    from public.booking_dates where booking_id = b.id and state = 'scheduled';
  return jsonb_build_object(
    'status', b.status, 'paid', v_paid, 'noticeDays', v_notice,
    'remainingDays', v_remaining, 'inNoticeDays', case when v_paid then v_in else 0 end,
    'refundDays', case when v_paid then v_out else 0 end,
    'endsOn', case when v_paid then v_last_in end,
    'refundDriverH', case when v_paid then least(round(b.driver_h::numeric * v_out / b.booked_days),
        b.driver_h - (select coalesce(sum(driver_h), 0) from public.refunds where booking_id = b.id)) else 0 end,
    'refundVatH', case when v_paid then least(round(b.vat_h::numeric * v_out / b.booked_days),
        b.vat_h - (select coalesce(sum(vat_h), 0) from public.refunds where booking_id = b.id)) else 0 end,
    'feeKeptH', case when v_paid then b.fee_h - (select coalesce(sum(fee_h), 0) from public.refunds where booking_id = b.id) else 0 end,
    'cancellable', b.status in ('pending', 'accepted', 'confirmed'));
end;
$$;

create or replace function public.cancel_booking(p_booking uuid, p_reason text, p_refund_to text default 'wallet')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  b public.bookings%rowtype;
  v_notice int := public.setting_num('cancel_notice_days', 7)::int;
  v_out date[];
  v_last_in date;
  v_ref jsonb := '{}'::jsonb;
begin
  if uid is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  perform public.expire_stale();
  select * into b from public.bookings where id = p_booking for update;
  if b.parent_id is distinct from uid then raise exception 'not_found' using errcode = 'P0001'; end if;

  if b.status in ('pending', 'accepted') then
    update public.bookings set status = 'cancelled', cancelled_by = 'parent', cancelled_at = now(),
      cancel_reason = nullif(trim(p_reason), '') where id = b.id;
    delete from public.seat_holds where booking_id = b.id;
    perform public.notify(b.driver_id, 'booking_cancelled', jsonb_build_object('code', b.code, 'by', 'parent'), '/driver/requests');
    return public.booking_json(b.id, 'parent');
  end if;
  if b.status <> 'confirmed' then raise exception 'not_cancellable' using errcode = 'P0001'; end if;

  v_out := array(select date from public.booking_dates where booking_id = b.id and state = 'scheduled'
                  and date >= public.riyadh_today() + v_notice order by date);
  select max(date) into v_last_in from public.booking_dates where booking_id = b.id and state = 'scheduled'
     and date > public.riyadh_today() and date < public.riyadh_today() + v_notice;

  v_ref := public.refund_dates(b.id, v_out, 'parent', false, p_refund_to, nullif(trim(p_reason), ''), 'cancelled');

  update public.bookings set cancelled_by = 'parent', cancelled_at = now(), cancel_reason = nullif(trim(p_reason), ''),
    ends_on = v_last_in,
    status = case when v_last_in is null then 'cancelled' else 'confirmed' end
  where id = b.id;

  perform public.notify(b.driver_id, 'booking_cancelled', jsonb_build_object('code', b.code, 'by', 'parent',
    'endsOn', v_last_in, 'days', coalesce(array_length(v_out, 1), 0)), '/driver/bookings');
  if (v_ref ->> 'totalH')::bigint > 0 then
    perform public.notify(uid, 'refund_issued', jsonb_build_object('code', b.code, 'totalH', v_ref -> 'totalH',
      'feeKeptH', b.fee_h, 'destination', p_refund_to), '/account/wallet');
  end if;
  return public.booking_json(b.id, 'parent');
end;
$$;

-- The driver can't run these trips: full refund including the Masar fee, to
-- the parent's wallet (instant, so they can rebook straight away).
-- p_pairs: [{ "b": booking_id, "d": date }]
create or replace function public.driver_cancel_dates(p_pairs jsonb, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_ref jsonb;
  b public.bookings%rowtype;
begin
  for r in
    select (x ->> 'b')::uuid bid, array_agg(distinct (x ->> 'd')::date order by (x ->> 'd')::date) ds
      from jsonb_array_elements(coalesce(p_pairs, '[]'::jsonb)) x group by 1
  loop
    select * into b from public.bookings where id = r.bid;
    if b.status <> 'confirmed' then continue; end if;
    v_ref := public.refund_dates(b.id, r.ds, 'driver', true, 'wallet', p_reason, 'driver_unavailable');
    if not exists (select 1 from public.booking_dates where booking_id = b.id and state = 'scheduled') then
      update public.bookings set status = 'cancelled', cancelled_by = 'driver', cancelled_at = now(),
        cancel_reason = p_reason where id = b.id;
    end if;
    perform public.notify(b.parent_id, 'trips_cancelled_by_driver',
      jsonb_build_object('code', b.code, 'dates', to_jsonb(r.ds), 'totalH', v_ref -> 'totalH', 'reason', p_reason),
      '/account/booking?id=' || b.id);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Wallet, payments and invoices for the parent
-- ---------------------------------------------------------------------------

create or replace function public.wallet_summary()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  perform public.ensure_wallet(uid);
  return jsonb_build_object(
    'balanceH', public.balance('parent_wallet', uid),
    'entries', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'account', e.account, 'amountH', e.amount_h,
        'kind', e.kind, 'memo', e.memo, 'bookingId', e.booking_id, 'createdAt', e.created_at) order by e.created_at desc, e.id desc)
      from public.ledger_entries e where e.user_id = uid and e.account in ('parent_wallet', 'parent_external')), '[]'::jsonb),
    'invoices', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'number', i.number, 'kind', i.kind,
        'totalH', i.total_h, 'issuedAt', i.issued_at, 'bookingId', i.booking_id,
        'bookingCode', (select code from public.bookings where id = i.booking_id)) order by i.issued_at desc)
      from public.invoices i where i.parent_id = uid), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('id', py.id, 'method', py.method, 'amountH', py.amount_h,
        'status', py.status, 'failureCode', py.failure_code, 'cardBrand', py.card_brand, 'cardLast4', py.card_last4,
        'createdAt', py.created_at, 'bookingId', py.booking_id,
        'bookingCode', (select code from public.bookings where id = py.booking_id)) order by py.created_at desc)
      from public.payments py where py.parent_id = uid), '[]'::jsonb)
  );
end;
$$;

create or replace function public.get_invoice(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare i public.invoices%rowtype; uid uuid := auth.uid();
begin
  select * into i from public.invoices where id = p_id;
  if i.id is null or not (i.parent_id = uid or i.driver_id = uid or public.is_admin()) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'id', i.id, 'number', i.number, 'kind', i.kind, 'issuedAt', i.issued_at, 'method', i.method, 'days', i.days,
    'driverH', i.driver_h, 'vatH', i.vat_h, 'feeH', i.fee_h, 'totalH', i.total_h, 'vatBp', i.vat_bp, 'feeBp', i.fee_bp,
    'vatNumber', public.setting('vat_number') #>> '{}',
    'original', (select jsonb_build_object('number', o.number, 'issuedAt', o.issued_at) from public.invoices o
                  where o.booking_id = i.booking_id and o.kind = 'invoice' and i.kind = 'credit_note' limit 1),
    'booking', (select jsonb_build_object('id', b.id, 'code', b.code, 'serviceType', b.service_type, 'legs', b.legs,
        'firstDate', b.first_date, 'lastDate', b.last_date, 'bookedDays', b.booked_days, 'units', b.units,
        'childrenCount', b.children_count, 'rateH', b.rate_h, 'surchargeH', b.surcharge_h, 'attendantFeeH', b.attendant_fee_h,
        'lineH', b.line_h, 'discountPct', b.discount_pct, 'discountH', b.discount_h,
        'serviceName', (select name from public.services where id = b.service_id),
        'children', (select jsonb_agg(first_name order by first_name) from public.booking_children where booking_id = b.id))
      from public.bookings b where b.id = i.booking_id),
    'parent', (select jsonb_build_object('name', p.full_name, 'email', (select email from auth.users where id = p.id),
        'phone', p.phone) from public.profiles p where p.id = i.parent_id),
    'driver', (select jsonb_build_object('nameEn', d.name_en, 'nameAr', d.name_ar) from public.drivers d where d.id = i.driver_id)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Driver earnings
-- ---------------------------------------------------------------------------

create or replace function public.driver_earnings()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); d public.drivers%rowtype;
begin
  if uid is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  perform public.expire_stale();
  select * into d from public.drivers where id = uid;
  return jsonb_build_object(
    'owedH', public.balance('driver_payable', uid),
    'paidOutH', (select coalesce(sum(amount_h), 0) from public.payouts where driver_id = uid),
    'earnedToDateH', (select coalesce(sum(round(b.driver_h::numeric *
        (select count(*) from public.booking_dates bd where bd.booking_id = b.id and bd.state in ('scheduled', 'completed')
           and bd.date < public.riyadh_today()) / b.booked_days)), 0)
      from public.bookings b where b.driver_id = uid and b.status in ('confirmed', 'completed', 'cancelled')
        and exists (select 1 from public.payments py where py.booking_id = b.id and py.status = 'succeeded')),
    'grossH', (select coalesce(sum(b.total_h), 0) from public.bookings b
                where b.driver_id = uid and exists (select 1 from public.payments py where py.booking_id = b.id and py.status = 'succeeded')),
    'feeH', (select coalesce(sum(b.fee_h), 0) from public.bookings b
                where b.driver_id = uid and exists (select 1 from public.payments py where py.booking_id = b.id and py.status = 'succeeded')),
    'payout', jsonb_build_object('bankName', d.bank_name, 'accountHolder', d.account_holder,
      'ibanMasked', case when d.iban is not null then left(d.iban, 4) || ' •••• •••• ' || right(d.iban, 4) end),
    'bookings', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'code', b.code, 'status', b.status,
        'firstDate', b.first_date, 'lastDate', b.last_date, 'bookedDays', b.booked_days, 'driverH', b.driver_h,
        'refundedDriverH', (select coalesce(sum(driver_h), 0) from public.refunds r where r.booking_id = b.id),
        'serviceName', (select name from public.services where id = b.service_id)) order by b.confirmed_at desc)
      from public.bookings b where b.driver_id = uid and b.confirmed_at is not null), '[]'::jsonb),
    'payouts', coalesce((select jsonb_agg(jsonb_build_object('id', po.id, 'amountH', po.amount_h, 'status', po.status,
        'createdAt', po.created_at) order by po.created_at desc) from public.payouts po where po.driver_id = uid), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin: overview, bookings, settings, payout run
-- ---------------------------------------------------------------------------

create or replace function public.admin_overview()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = 'P0001'; end if;
  perform public.expire_stale();
  return jsonb_build_object(
    'drivers', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (select status, count(*) n from public.drivers group by status) x),
    'bookings', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (select status, count(*) n from public.bookings group by status) x),
    'parents', (select count(*) from public.profiles where role = 'parent'),
    'services', (select count(*) from public.services where status = 'active'),
    'gmvH', (select coalesce(sum(amount_h), 0) from public.payments where status = 'succeeded'),
    'commissionH', public.balance('platform_revenue', null),
    'vatH', public.balance('vat_payable', null),
    'refundsH', (select coalesce(sum(total_h), 0) from public.refunds),
    'driverOwedH', (select coalesce(sum(amount_h), 0) from public.ledger_entries where account = 'driver_payable'),
    'paidOutH', (select coalesce(sum(amount_h), 0) from public.payouts),
    'walletsH', (select coalesce(sum(amount_h), 0) from public.ledger_entries where account = 'parent_wallet'),
    'failedPayments', (select count(*) from public.payments where status = 'failed'),
    'byMonth', coalesce((select jsonb_agg(jsonb_build_object('month', m, 'gmvH', gmv, 'feeH', fee, 'bookings', n) order by m)
      from (select to_char(py.created_at at time zone 'Asia/Riyadh', 'YYYY-MM') m, sum(py.amount_h) gmv,
                   sum(b.fee_h) fee, count(*) n
              from public.payments py join public.bookings b on b.id = py.booking_id
             where py.status = 'succeeded' group by 1) x), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_bookings()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = 'P0001'; end if;
  perform public.expire_stale();
  return coalesce((select jsonb_agg(public.booking_card(id) || jsonb_build_object('feeH', fee_h, 'vatH', vat_h)
    order by created_at desc) from (select * from public.bookings order by created_at desc limit 200) b), '[]'::jsonb);
end;
$$;

create or replace function public.admin_settings()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = 'P0001'; end if;
  return (select jsonb_object_agg(key, value) from public.settings);
end;
$$;

create or replace function public.admin_save_settings(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare k text;
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = 'P0001'; end if;
  for k in select jsonb_object_keys(p) loop
    if k not in ('demo_mode', 'vat_rate', 'masar_fee_rate', 'vat_on_fee', 'discount_t1_days', 'discount_t1_pct',
                 'discount_t2_days', 'discount_t2_pct', 'request_hold_hours', 'payment_hold_hours', 'hold_cutoff_hours',
                 'schedule_notice_days', 'cancel_notice_days', 'max_vehicle_age', 'min_driver_age', 'wallet_demo_h',
                 'school_week_days', 'vat_number', 'holidays') then
      raise exception 'bad_setting' using errcode = 'P0001', detail = k;
    end if;
    insert into public.settings (key, value) values (k, p -> k)
    on conflict (key) do update set value = excluded.value, updated_at = now();
  end loop;
  return public.admin_settings();
end;
$$;

-- Pays each driver what they have earned for trips already driven, minus
-- earlier payouts. Demo mode: no money moves; rows are marked simulated.
create or replace function public.admin_payout_run()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_run uuid := gen_random_uuid();
  r record;
  v_total bigint := 0; v_n int := 0;
  v_txn uuid;
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = 'P0001'; end if;
  insert into public.payout_runs (id, created_by, total_h, count) values (v_run, auth.uid(), 0, 0);
  for r in
    select d.id, d.bank_name, d.iban,
      (select coalesce(sum(round(b.driver_h::numeric *
          (select count(*) from public.booking_dates bd where bd.booking_id = b.id and bd.state in ('scheduled', 'completed')
             and bd.date < public.riyadh_today()) / b.booked_days)), 0)
         from public.bookings b where b.driver_id = d.id and b.status in ('confirmed', 'completed', 'cancelled')
          and exists (select 1 from public.payments py where py.booking_id = b.id and py.status = 'succeeded'))
      - (select coalesce(sum(amount_h), 0) from public.payouts where driver_id = d.id) as due
    from public.drivers d
  loop
    if r.due > 0 then
      v_txn := gen_random_uuid();
      insert into public.payouts (run_id, driver_id, amount_h, bank_name, iban_masked)
      values (v_run, r.id, r.due, r.bank_name, left(r.iban, 4) || '••••' || right(r.iban, 4));
      perform public.post(v_txn, 'driver_payable', r.id, null, null, -r.due, 'payout', 'payout');
      perform public.post(v_txn, 'payout_external', r.id, null, null, r.due, 'payout', 'payout');
      perform public.notify(r.id, 'payout_sent', jsonb_build_object('amountH', r.due), '/driver/earnings');
      v_total := v_total + r.due; v_n := v_n + 1;
    end if;
  end loop;
  update public.payout_runs set total_h = v_total, count = v_n where id = v_run;
  return jsonb_build_object('id', v_run, 'totalH', v_total, 'count', v_n,
    'rows', coalesce((select jsonb_agg(jsonb_build_object('driverId', po.driver_id,
        'name', (select coalesce(name_en, name_ar) from public.drivers where id = po.driver_id),
        'accountHolder', (select account_holder from public.drivers where id = po.driver_id),
        'bankName', po.bank_name, 'iban', (select iban from public.drivers where id = po.driver_id),
        'amountH', po.amount_h, 'status', po.status)) from public.payouts po where po.run_id = v_run), '[]'::jsonb));
end;
$$;

create or replace function public.admin_payout_runs()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = 'P0001'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'totalH', total_h, 'count', count, 'createdAt', created_at)
    order by created_at desc) from public.payout_runs), '[]'::jsonb);
end;
$$;

-- Promote an account to admin. Run in the SQL editor only:
--   select public.make_admin('you@example.com');
create or replace function public.make_admin(p_email text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(trim(p_email));
  if v_id is null then return 'No account with that email. Sign up on the site first.'; end if;
  update public.profiles set role = 'admin' where id = v_id;
  return 'Done: ' || p_email || ' is now an admin.';
end;
$$;

-- ---------------------------------------------------------------------------
-- Function permissions: nothing for anonymous visitors except browsing;
-- internal helpers are not callable from the browser at all.
-- ---------------------------------------------------------------------------

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure sig, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'setting_num', 'setting_bool', 'riyadh_today', 'riyadh_ts', 'geo_dist_m', 'path_project', 'resolve_district',
         'short_code', 'iban_valid', 'luhn_valid', 'notify', 'notify_admins', 'my_notifications', 'mark_notifications_read',
         'required_doc_kinds', 'driver_bundle', 'driver_get_application', 'driver_save_application', 'driver_save_document',
         'driver_submit', 'admin_driver_queue', 'admin_get_driver', 'admin_review_document', 'admin_decide_driver',
         'service_version_on', 'date_closed', 'seat_capacity', 'seats_taken', 'seats_paid', 'times_fit_hours',
         'describe_conflicts', 'auto_decline', 'is_approved_driver', 'service_json', 'driver_services', 'driver_get_service',
         'add_destination', 'version_conflicts', 'driver_save_service', 'driver_check_service', 'driver_archive_service',
         'hours_conflicts', 'driver_check_hours', 'driver_save_hours', 'driver_blocked_dates', 'driver_block_dates',
         'driver_unblock', 'driver_set_day', 'driver_calendar', 'calc_price', 'expire_stale', 'driver_public',
         'pricing_settings', 'search_services', 'get_service', 'build_quote', 'quote_booking', 'take_seats',
         'create_booking', 'booking_json', 'get_booking', 'booking_card', 'my_bookings', 'driver_bookings',
         'driver_respond', 'post', 'balance', 'ensure_wallet', 'next_invoice_number', 'card_brand', 'pay_booking',
         'refund_dates', 'cancel_preview', 'cancel_booking', 'driver_cancel_dates', 'wallet_summary', 'get_invoice',
         'driver_earnings', 'admin_overview', 'admin_bookings', 'admin_settings', 'admin_save_settings',
         'admin_payout_run', 'admin_payout_runs', 'make_admin', 'availability_guard', 'vehicles_rules', 'drivers_rules')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

-- What the browser may call
grant execute on function public.search_services(jsonb) to anon, authenticated;
grant execute on function public.get_service(uuid) to anon, authenticated;
grant execute on function
  public.my_notifications(), public.mark_notifications_read(),
  public.driver_get_application(), public.driver_save_application(jsonb), public.driver_save_document(text, text, text, date),
  public.driver_submit(),
  public.admin_driver_queue(), public.admin_get_driver(uuid), public.admin_review_document(uuid, boolean, text),
  public.admin_decide_driver(uuid, text, text),
  public.driver_services(), public.driver_get_service(uuid), public.add_destination(jsonb),
  public.driver_save_service(jsonb, date), public.driver_check_service(uuid, jsonb, date), public.driver_archive_service(uuid),
  public.driver_check_hours(jsonb, date), public.driver_save_hours(jsonb, date), public.driver_blocked_dates(),
  public.driver_block_dates(date, date, text, boolean), public.driver_unblock(uuid),
  public.driver_set_day(uuid, date, int, boolean, text, boolean), public.driver_calendar(date, date),
  public.quote_booking(jsonb), public.create_booking(jsonb), public.get_booking(uuid), public.my_bookings(),
  public.driver_bookings(text), public.driver_respond(uuid, boolean, text),
  public.pay_booking(jsonb), public.cancel_preview(uuid), public.cancel_booking(uuid, text, text),
  public.wallet_summary(), public.get_invoice(uuid), public.driver_earnings(),
  public.admin_overview(), public.admin_bookings(), public.admin_settings(), public.admin_save_settings(jsonb),
  public.admin_payout_run(), public.admin_payout_runs()
to authenticated;

-- Used inside RLS policies, so signed-in users need them
grant execute on function public.is_approved_driver() to authenticated;
-- ---------------------------------------------------------------------------
-- Demo data. Creates demo logins, ten approved drivers with services across
-- the Eastern Province, one driver waiting for review, a demo parent and two
-- bookings (one paid, one waiting for the driver). Run once in the SQL editor:
--   select public.seed_demo('choose-a-demo-password');
-- Safe to run again: existing demo accounts are left as they are.
-- ---------------------------------------------------------------------------

create or replace function public.seed_user(p_email text, p_password text, p_name text, p_role text, p_locale text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; c text;
begin
  select id into v_id from auth.users where lower(email) = lower(p_email);
  if v_id is not null then return v_id; end if;
  v_id := gen_random_uuid();
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', lower(p_email),
    extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', p_name, 'role', p_role, 'locale', p_locale), now(), now());
  -- GoTrue reads these token columns as strings: they must be '' rather than NULL
  for c in select column_name from information_schema.columns
            where table_schema = 'auth' and table_name = 'users'
              and column_name in ('confirmation_token', 'recovery_token', 'email_change', 'email_change_token_new',
                                  'email_change_token_current', 'phone_change', 'phone_change_token', 'reauthentication_token')
  loop
    execute format('update auth.users set %I = coalesce(%I, '''') where id = $1', c, c) using v_id;
  end loop;
  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (v_id::text, v_id, jsonb_build_object('sub', v_id::text, 'email', lower(p_email), 'email_verified', true),
          'email', now(), now(), now());
  return v_id;
end;
$$;

create or replace function public.seed_driver(p_password text, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_dest uuid;
  v_svc jsonb;
  v_path jsonb;
  v_dist float8;
  v_sid uuid;
  k text;
  i int;
  v_status text := coalesce(p ->> 'status', 'approved');
begin
  v_id := public.seed_user(p ->> 'email', p_password, p ->> 'nameEn', 'driver', 'ar');
  if exists (select 1 from public.drivers where id = v_id) then return v_id; end if;

  perform set_config('masar.otp_verified', 'on', true);
  update public.profiles set phone = p ->> 'phone', phone_verified_at = now(), onboarding_completed_at = now()
   where id = v_id;
  perform set_config('masar.otp_verified', 'off', true);
  insert into public.drivers (id, status, wizard_step, name_ar, name_en, gender, date_of_birth, nationality, city,
    bio, languages, years_experience, id_number, id_expiry, police_issued, licence_number, licence_type, licence_expiry,
    bank_name, iban, account_holder, declaration_at, submitted_at, reviewed_at, approved_at)
  values (v_id, v_status, 8, p ->> 'nameAr', p ->> 'nameEn', p ->> 'gender', (p ->> 'dob')::date, 'Saudi', p ->> 'city',
    p ->> 'bio', array['ar', 'en'], (p ->> 'years')::smallint, p ->> 'idNumber', public.riyadh_today() + 900,
    public.riyadh_today() - 60, p ->> 'licence', p ->> 'licenceType', public.riyadh_today() + 1200,
    'Al Rajhi Bank', p ->> 'iban', p ->> 'nameEn', now(), now() - interval '20 days',
    case when v_status = 'approved' then now() - interval '18 days' end,
    case when v_status = 'approved' then now() - interval '18 days' end);

  insert into public.vehicles (driver_id, type, make, model, year, color, seats, car_category, bus_type, ac, gps, cameras,
    seatbelts, female_attendant, wheelchair, plate_digits, plate_letters)
  select v_id, x ->> 'type', x ->> 'make', x ->> 'model', (x ->> 'year')::smallint, x ->> 'color', (x ->> 'seats')::smallint,
    x ->> 'carCategory', x ->> 'busType', true, coalesce((x ->> 'gps')::boolean, false),
    coalesce((x ->> 'cameras')::boolean, false), true, coalesce((x ->> 'femaleAttendant')::boolean, false), false,
    x ->> 'plateDigits', x ->> 'plateLetters'
  from (select p -> 'vehicle' x) t;

  foreach k in array public.required_doc_kinds(p -> 'vehicle' ->> 'type') loop
    insert into public.driver_documents (driver_id, kind, bucket, path, expiry, status, reviewed_at)
    values (v_id, k, 'demo', '/demo-docs/' || k || '.svg',
      case when k in ('istimara', 'insurance', 'fahas', 'tga_card') then public.riyadh_today() + 300 end,
      case when v_status = 'approved' then 'approved' else 'pending' end,
      case when v_status = 'approved' then now() - interval '18 days' end);
  end loop;

  insert into public.driver_pricing (driver_id, service_type, daily_h, one_way_h, max_children, attendant_available, attendant_fee_h)
  select v_id, x ->> 'serviceType', (x ->> 'dailyH')::bigint, (x ->> 'oneWayH')::bigint, (x ->> 'maxChildren')::smallint,
    coalesce((x ->> 'attendantAvailable')::boolean, false), coalesce((x ->> 'attendantFeeH')::bigint, 0)
  from jsonb_array_elements(p -> 'pricing') x;

  -- Sun-Thu school runs plus afternoons and evenings for activities
  insert into public.working_hours (driver_id, valid_from, dow, start_min, end_min)
  select v_id, public.riyadh_today() - 30, d, s, e
  from unnest(array[0, 1, 2, 3, 4]) d,
       (values (360, 480), (750, 930), (945, 1230)) h(s, e);

  if v_status <> 'approved' then return v_id; end if;

  for v_svc in select * from jsonb_array_elements(p -> 'services') loop
    select id into v_dest from public.destinations where name_en = v_svc ->> 'destination';
    v_path := jsonb_build_array(jsonb_build_array((v_svc -> 'start' ->> 0)::float8, (v_svc -> 'start' ->> 1)::float8))
              || coalesce((select jsonb_agg(jsonb_build_array((s ->> 'lat')::float8, (s ->> 'lng')::float8) order by o)
                             from jsonb_array_elements(v_svc -> 'stops') with ordinality t(s, o)), '[]'::jsonb)
              || jsonb_build_array((select jsonb_build_array(lat, lng) from public.destinations where id = v_dest));
    v_dist := 0;
    for i in 0 .. jsonb_array_length(v_path) - 2 loop
      v_dist := v_dist + public.geo_dist_m((v_path -> i ->> 0)::float8, (v_path -> i ->> 1)::float8,
                                           (v_path -> (i + 1) ->> 0)::float8, (v_path -> (i + 1) ->> 1)::float8);
    end loop;
    insert into public.services (driver_id, name, kind, destination_id, start_lat, start_lng, stops, path, distance_m,
      duration_s, accepts, age_min, age_max, max_children_per_family, shared_enabled, exclusive_enabled, max_pickup_m,
      max_detour_m, max_detour_pct, max_stops, max_journey_min)
    values (v_id, v_svc ->> 'name', coalesce(v_svc ->> 'kind', 'school'), v_dest,
      (v_svc -> 'start' ->> 0)::float8, (v_svc -> 'start' ->> 1)::float8, v_svc -> 'stops', v_path,
      round(v_dist * 1.25), round(v_dist * 1.25 / 500 * 60), coalesce(v_svc ->> 'accepts', 'both'), 4, 17, 4,
      true, coalesce((v_svc ->> 'exclusive')::boolean, false), 4000, 8000, 25, 14, 60)
    returning id into v_sid;
    insert into public.service_versions (service_id, valid_from, days, outbound, pickup_start_min, pickup_end_min,
      arrive_min, return_trip, return_depart_min, return_end_min, seats)
    values (v_sid, public.riyadh_today() - 14,
      (select array_agg(x::smallint) from jsonb_array_elements_text(coalesce(v_svc -> 'days', '[0,1,2,3,4]')) x),
      true, (v_svc -> 'times' ->> 0)::smallint, (v_svc -> 'times' ->> 1)::smallint, (v_svc -> 'times' ->> 2)::smallint,
      true, (v_svc -> 'times' ->> 3)::smallint, (v_svc -> 'times' ->> 4)::smallint,
      coalesce((v_svc ->> 'seats')::smallint, (p -> 'vehicle' ->> 'seats')::smallint));
    insert into public.service_coverage (service_id, district_id, surcharge_h)
    select v_sid, x ->> 0, coalesce((x ->> 1)::bigint, 0) from jsonb_array_elements(v_svc -> 'coverage') x;
    insert into public.service_pricing (service_id, service_type, daily_h, one_way_h, max_children, attendant_available, attendant_fee_h)
    select v_sid, service_type, daily_h, one_way_h, max_children, attendant_available, attendant_fee_h
      from public.driver_pricing where driver_id = v_id;
  end loop;
  return v_id;
end;
$$;

create or replace function public.seed_demo(p_password text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_parent uuid;
  v_admin uuid;
  v_bus uuid;
  v_layan uuid; v_omar uuid; v_home uuid;
  v_svc_a uuid; v_svc_b uuid;
  v_dates jsonb; v_dates_b jsonb;
  v_sun date;
  b jsonb;
begin
  if length(coalesce(p_password, '')) < 8 then return 'Choose a demo password of at least 8 characters.'; end if;

  -- A demo admin for the verification queue and payouts
  v_admin := public.seed_user('admin@ksamasar.com', p_password, 'Masar Admin', 'parent', 'en');
  update public.profiles set role = 'admin' where id = v_admin;

  v_bus := public.seed_driver(p_password, $j${
    "email": "driver.bus@ksamasar.com", "nameEn": "Abdulrahman Al-Qahtani", "nameAr": "عبدالرحمن القحطاني",
    "gender": "male", "dob": "1984-05-11", "city": "Dammam", "years": 12, "phone": "+966500000201",
    "idNumber": "1023456781", "licence": "40112233", "licenceType": "public", "iban": "SA0380000000608010167519",
    "bio": "School runs in Dammam for twelve years. Female supervisor on board every trip.",
    "vehicle": {"type": "bus", "make": "Toyota", "model": "Coaster", "year": 2022, "color": "White", "seats": 22,
                "busType": "coaster", "gps": true, "cameras": true, "femaleAttendant": true, "plateDigits": "4721", "plateLetters": "ABD"},
    "pricing": [{"serviceType": "shared_bus", "dailyH": 1800, "oneWayH": 1100},
                {"serviceType": "whole_bus", "dailyH": 65000, "oneWayH": 40000, "attendantAvailable": true, "attendantFeeH": 8000}],
    "services": [
      {"name": "Al Faisaliyah & Al Jamiyin → Manarat Al Sharqiya", "destination": "Manarat Al Sharqiya International Schools",
       "start": [26.3790, 50.0380], "stops": [{"lat": 26.3925, "lng": 50.0441, "label": "Al Faisaliyah"},
                                              {"lat": 26.3880, "lng": 50.0660, "label": "Al Jamiyin"}],
       "times": [375, 405, 420, 795, 840],
       "coverage": [["dmm-faisaliyah", 0], ["dmm-jamiyin", 500], ["dmm-shulah", 0], ["dmm-uhud", 0], ["dmm-rayyan", 0], ["dmm-nakheel", 0]]},
      {"name": "Dammam → Al Ettifaq Club (evenings)", "kind": "activity", "destination": "Al Ettifaq Club",
       "start": [26.3925, 50.0441], "stops": [{"lat": 26.4053, "lng": 50.0700, "label": "King Saud St"}],
       "times": [960, 990, 1005, 1140, 1185], "days": [0, 2, 4], "seats": 14,
       "coverage": [["dmm-faisaliyah", 0], ["dmm-jamiyin", 0], ["dmm-hamra", 0], ["dmm-badiyah", 0], ["dmm-mazruiyah", 0]]}
    ]}$j$::jsonb);

  perform public.seed_driver(p_password, $j${
    "email": "driver.car@ksamasar.com", "nameEn": "Noura Al-Dossary", "nameAr": "نورة الدوسري",
    "gender": "female", "dob": "1990-02-17", "city": "Khobar", "years": 6, "phone": "+966500000202",
    "idNumber": "1034567892", "licence": "40223344", "licenceType": "private", "iban": "SA0380000000608010167519",
    "bio": "Mother of three. Calm, careful driving and always on time.",
    "vehicle": {"type": "car", "make": "Toyota", "model": "Innova", "year": 2022, "color": "Silver", "seats": 6,
                "carCategory": "van", "plateDigits": "1932", "plateLetters": "NRS"},
    "pricing": [{"serviceType": "shared_car", "dailyH": 2200, "oneWayH": 1300},
                {"serviceType": "exclusive_car", "dailyH": 9500, "oneWayH": 5700, "maxChildren": 4}],
    "services": [
      {"name": "Al Aqrabiyah & Ath Thuqbah → Dhahran Ahliyya Schools", "destination": "Dhahran Ahliyya Schools",
       "start": [26.2850, 50.2000], "stops": [{"lat": 26.2930, "lng": 50.1950, "label": "Al Aqrabiyah"},
                                              {"lat": 26.2850, "lng": 50.1780, "label": "Ath Thuqbah"}],
       "times": [380, 410, 425, 810, 855], "exclusive": true,
       "coverage": [["khb-aqrabiyah", 0], ["khb-ulaya", 0], ["khb-thuqbah", 0], ["khb-north", 500], ["khb-hamra", 0], ["dhr-qusur", 0]]}
    ]}$j$::jsonb);

  perform public.seed_driver(p_password, $j${
    "email": "fahad.driver@ksamasar.com", "nameEn": "Fahad Al-Shammari", "nameAr": "فهد الشمري",
    "gender": "male", "dob": "1987-09-03", "city": "Khobar", "years": 9, "phone": "+966500000203",
    "idNumber": "1045678903", "licence": "40334455", "licenceType": "private", "iban": "SA0380000000608010167519",
    "vehicle": {"type": "car", "make": "GMC", "model": "Yukon", "year": 2021, "color": "Black", "seats": 7,
                "carCategory": "suv", "plateDigits": "5508", "plateLetters": "KHB"},
    "pricing": [{"serviceType": "shared_car", "dailyH": 2000, "oneWayH": 1200}],
    "services": [
      {"name": "Ar Rakah & Al Yarmouk → International Programs School", "destination": "International Programs School",
       "start": [26.3528, 50.1955], "stops": [{"lat": 26.3220, "lng": 50.1810, "label": "Al Yarmouk"},
                                              {"lat": 26.2970, "lng": 50.2100, "label": "Al Khobar Al Shamaliyah"}],
       "times": [370, 400, 415, 800, 850],
       "coverage": [["khb-rakah", 0], ["khb-yarmouk", 0], ["khb-north", 0], ["khb-aqrabiyah", 300], ["dhr-doha", 500]]}
    ]}$j$::jsonb);

  perform public.seed_driver(p_password, $j${
    "email": "mohammed.driver@ksamasar.com", "nameEn": "Mohammed Al-Ghamdi", "nameAr": "محمد الغامدي",
    "gender": "male", "dob": "1979-12-22", "city": "Dhahran", "years": 15, "phone": "+966500000204",
    "idNumber": "1056789014", "licence": "40445566", "licenceType": "heavy", "iban": "SA0380000000608010167519",
    "vehicle": {"type": "bus", "make": "Hyundai", "model": "County", "year": 2021, "color": "White", "seats": 26,
                "busType": "midsize", "gps": true, "cameras": true, "plateDigits": "8264", "plateLetters": "DHR"},
    "pricing": [{"serviceType": "shared_bus", "dailyH": 1600, "oneWayH": 1000},
                {"serviceType": "whole_bus", "dailyH": 70000, "oneWayH": 42000, "attendantAvailable": true, "attendantFeeH": 9000}],
    "services": [
      {"name": "Ad Dawhah & Al Jamiah → British International School Al Khobar", "destination": "British International School Al Khobar",
       "start": [26.3240, 50.1520], "stops": [{"lat": 26.3070, "lng": 50.1440, "label": "Al Jamiah"},
                                              {"lat": 26.2770, "lng": 50.1880, "label": "Al Ulaya"}],
       "times": [365, 400, 420, 810, 870],
       "coverage": [["dhr-doha", 0], ["dhr-jamiah", 0], ["dhr-qusur", 0], ["khb-ulaya", 0], ["khb-thuqbah", 0], ["khb-hizam", 0]]}
    ]}$j$::jsonb);

  perform public.seed_driver(p_password, $j${
    "email": "huda.driver@ksamasar.com", "nameEn": "Huda Al-Mutairi", "nameAr": "هدى المطيري",
    "gender": "female", "dob": "1988-07-30", "city": "Dammam", "years": 5, "phone": "+966500000205",
    "idNumber": "1067890125", "licence": "40556677", "licenceType": "private", "iban": "SA0380000000608010167519",
    "vehicle": {"type": "car", "make": "Kia", "model": "Carnival", "year": 2023, "color": "White", "seats": 7,
                "carCategory": "van", "plateDigits": "3140", "plateLetters": "HDA"},
    "pricing": [{"serviceType": "shared_car", "dailyH": 1900, "oneWayH": 1150},
                {"serviceType": "exclusive_car", "dailyH": 9000, "oneWayH": 5400, "maxChildren": 5}],
    "services": [
      {"name": "Ash Shati & Al Mazruiyah → International Indian School Dammam", "destination": "International Indian School Dammam",
       "start": [26.4672, 50.1186], "stops": [{"lat": 26.4396, "lng": 50.0997, "label": "Al Mazruiyah"}],
       "times": [385, 410, 425, 805, 850], "exclusive": true,
       "coverage": [["dmm-shati", 0], ["dmm-mazruiyah", 0], ["dmm-badiyah", 0], ["dmm-muhammadiyah", 300]]}
    ]}$j$::jsonb);

  perform public.seed_driver(p_password, $j${
    "email": "saleh.driver@ksamasar.com", "nameEn": "Saleh Al-Harbi", "nameAr": "صالح الحربي",
    "gender": "male", "dob": "1982-03-14", "city": "Qatif", "years": 11, "phone": "+966500000206",
    "idNumber": "1078901236", "licence": "40667788", "licenceType": "public", "iban": "SA0380000000608010167519",
    "vehicle": {"type": "bus", "make": "Toyota", "model": "Hiace", "year": 2020, "color": "White", "seats": 12,
                "busType": "minivan", "gps": true, "plateDigits": "2290", "plateLetters": "GTX"},
    "pricing": [{"serviceType": "shared_bus", "dailyH": 1500, "oneWayH": 900}],
    "services": [
      {"name": "Tarout & Al Qatif → Al Khaleej Club", "kind": "activity", "destination": "Al Khaleej Club",
       "start": [26.5730, 50.0640], "stops": [{"lat": 26.5560, "lng": 50.0080, "label": "Al Qatif"}],
       "times": [960, 990, 1020, 1170, 1215],
       "coverage": [["qtf-tarout", 0], ["qtf-center", 0], ["qtf-saihat", 0]]}
    ]}$j$::jsonb);

  perform public.seed_driver(p_password, $j${
    "email": "khalid.driver@ksamasar.com", "nameEn": "Khalid Al-Otaibi", "nameAr": "خالد العتيبي",
    "gender": "male", "dob": "1981-11-05", "city": "Jubail", "years": 14, "phone": "+966500000207",
    "idNumber": "1089012347", "licence": "40778899", "licenceType": "heavy", "iban": "SA0380000000608010167519",
    "vehicle": {"type": "bus", "make": "Mitsubishi", "model": "Rosa", "year": 2019, "color": "Yellow", "seats": 25,
                "busType": "coaster", "gps": true, "cameras": true, "femaleAttendant": true, "plateDigits": "6612", "plateLetters": "JBL"},
    "pricing": [{"serviceType": "shared_bus", "dailyH": 1700, "oneWayH": 1050}],
    "services": [
      {"name": "Al Fanateer & Ad Deffi → International Indian School Jubail", "destination": "International Indian School Jubail",
       "start": [27.0800, 49.5600], "stops": [{"lat": 27.0400, "lng": 49.5800, "label": "Al Huwaylat"},
                                              {"lat": 27.0200, "lng": 49.6000, "label": "Ad Deffi"}],
       "times": [370, 405, 420, 800, 850],
       "coverage": [["jub-fanateer", 0], ["jub-huwaylat", 0], ["jub-deffi", 0], ["jub-city", 0]]}
    ]}$j$::jsonb);

  perform public.seed_driver(p_password, $j${
    "email": "reem.driver@ksamasar.com", "nameEn": "Reem Al-Zahrani", "nameAr": "ريم الزهراني",
    "gender": "female", "dob": "1992-04-21", "city": "Al Ahsa", "years": 4, "phone": "+966500000208",
    "idNumber": "1090123458", "licence": "40889900", "licenceType": "private", "iban": "SA0380000000608010167519",
    "vehicle": {"type": "car", "make": "Toyota", "model": "Camry", "year": 2022, "color": "Pearl", "seats": 4,
                "carCategory": "sedan", "plateDigits": "714", "plateLetters": "HSA"},
    "pricing": [{"serviceType": "shared_car", "dailyH": 2500, "oneWayH": 1500}],
    "services": [
      {"name": "Al Mubarraz → Al Fateh Club (evenings)", "kind": "activity", "destination": "Al Fateh Club",
       "start": [25.4100, 49.5800], "stops": [{"lat": 25.3990, "lng": 49.5990, "label": "Ain Najm"}],
       "times": [990, 1020, 1035, 1140, 1180], "days": [0, 1, 2, 3], "accepts": "girls",
       "coverage": [["hsa-mubarraz", 0], ["hsa-ainnajm", 0], ["hsa-hofuf", 300]]}
    ]}$j$::jsonb);

  perform public.seed_driver(p_password, $j${
    "email": "turki.driver@ksamasar.com", "nameEn": "Turki Al-Anazi", "nameAr": "تركي العنزي",
    "gender": "male", "dob": "1986-01-09", "city": "Khobar", "years": 8, "phone": "+966500000209",
    "idNumber": "1001234569", "licence": "40990011", "licenceType": "private", "iban": "SA0380000000608010167519",
    "vehicle": {"type": "car", "make": "Nissan", "model": "Patrol", "year": 2020, "color": "White", "seats": 6,
                "carCategory": "suv", "plateDigits": "9035", "plateLetters": "TRK"},
    "pricing": [{"serviceType": "shared_car", "dailyH": 2100, "oneWayH": 1250},
                {"serviceType": "exclusive_car", "dailyH": 9800, "oneWayH": 5900, "maxChildren": 4}],
    "services": [
      {"name": "Al Aziziyah & Al Hizam → British International School Al Khobar", "destination": "British International School Al Khobar",
       "start": [26.2130, 50.1950], "stops": [{"lat": 26.2550, "lng": 50.1870, "label": "Al Hizam Adh Dhahabi"}],
       "times": [385, 410, 425, 815, 850], "exclusive": true,
       "coverage": [["khb-aziziyah", 0], ["khb-hizam", 0], ["khb-south", 0], ["khb-ulaya", 300]]}
    ]}$j$::jsonb);

  perform public.seed_driver(p_password, $j${
    "email": "sultan.driver@ksamasar.com", "nameEn": "Sultan Al-Subaie", "nameAr": "سلطان السبيعي",
    "gender": "male", "dob": "1983-08-27", "city": "Dammam", "years": 13, "phone": "+966500000210",
    "idNumber": "1012345670", "licence": "41001122", "licenceType": "public", "iban": "SA0380000000608010167519",
    "vehicle": {"type": "bus", "make": "Hyundai", "model": "County", "year": 2022, "color": "White", "seats": 28,
                "busType": "midsize", "gps": true, "cameras": true, "plateDigits": "1180", "plateLetters": "SBA"},
    "pricing": [{"serviceType": "shared_bus", "dailyH": 1500, "oneWayH": 900},
                {"serviceType": "whole_bus", "dailyH": 72000, "oneWayH": 43000, "attendantAvailable": true, "attendantFeeH": 8500}],
    "services": [
      {"name": "Al Hamra, Al Badi & Al Mazruiyah → Manarat Al Sharqiya", "destination": "Manarat Al Sharqiya International Schools",
       "start": [26.4310, 50.0640], "stops": [{"lat": 26.4290, "lng": 50.0860, "label": "Al Badi"},
                                              {"lat": 26.4396, "lng": 50.0997, "label": "Al Mazruiyah"}],
       "times": [370, 400, 420, 795, 845],
       "coverage": [["dmm-hamra", 0], ["dmm-badiyah", 0], ["dmm-mazruiyah", 0], ["dmm-noor", 0], ["dmm-nakheel", 0]]}
    ]}$j$::jsonb);

  -- Waiting for review, to demo the verification queue
  perform public.seed_driver(p_password, $j${
    "email": "pending.driver@ksamasar.com", "nameEn": "Ahmed Al-Mansour", "nameAr": "أحمد المنصور", "status": "submitted",
    "gender": "male", "dob": "1991-06-18", "city": "Khobar", "years": 3, "phone": "+966500000211",
    "idNumber": "1023456702", "licence": "41112233", "licenceType": "private", "iban": "SA0380000000608010167519",
    "vehicle": {"type": "car", "make": "Toyota", "model": "Corolla", "year": 2021, "color": "Grey", "seats": 4,
                "carCategory": "sedan", "plateDigits": "3306", "plateLetters": "ANR"},
    "pricing": [{"serviceType": "shared_car", "dailyH": 1800, "oneWayH": 1100}],
    "services": []}$j$::jsonb);

  -- The demo parent
  v_parent := public.seed_user('parent@ksamasar.com', p_password, 'Sara Al-Hajri', 'parent', 'ar');
  if exists (select 1 from public.children where parent_id = v_parent) then
    return 'Demo data is already there. Password unchanged for existing accounts.';
  end if;
  perform set_config('masar.otp_verified', 'on', true);
  update public.profiles set phone = '+966500000101', phone_verified_at = now(), onboarding_step = 4,
    onboarding_completed_at = now() where id = v_parent;
  perform set_config('masar.otp_verified', 'off', true);
  insert into public.consents (user_id, kind, granted) values (v_parent, 'terms', true), (v_parent, 'privacy', true),
    (v_parent, 'whatsapp', true);
  insert into public.addresses (parent_id, label, lat, lng, city, district, street, building_no, landmark, is_default)
  values (v_parent, 'home', 26.3936, 50.0472, 'Dammam', 'Al Faisaliyah', 'Abu Bakr Al Siddiq St', '4417',
          'White gate next to the mosque', true)
  returning id into v_home;
  insert into public.children (parent_id, full_name, gender, date_of_birth, school_name, destination_id, grade, driver_notes)
  values (v_parent, 'Layan Al-Hajri', 'girl', '2017-03-04', 'Manarat Al Sharqiya International Schools',
          (select id from public.destinations where name_en = 'Manarat Al Sharqiya International Schools'), 'Grade 3',
          'Needs help with the seat belt')
  returning id into v_layan;
  insert into public.children (parent_id, full_name, gender, date_of_birth, school_name, destination_id, grade)
  values (v_parent, 'Omar Al-Hajri', 'boy', '2015-09-12', 'Manarat Al Sharqiya International Schools',
          (select id from public.destinations where name_en = 'Manarat Al Sharqiya International Schools'), 'Grade 5')
  returning id into v_omar;

  select id into v_svc_a from public.services where driver_id = v_bus and kind = 'school' limit 1;
  select id into v_svc_b from public.services where driver_id = v_bus and kind = 'activity' limit 1;

  -- Next Sunday onwards: four school weeks, Sundays to Thursdays
  v_sun := public.riyadh_today() + (7 - extract(dow from public.riyadh_today())::int);
  select jsonb_agg(g::date) into v_dates from generate_series(v_sun, v_sun + 27, interval '1 day') g
   where extract(dow from g) between 0 and 4;
  select jsonb_agg(g::date) into v_dates_b from generate_series(v_sun, v_sun + 13, interval '1 day') g
   where extract(dow from g) in (0, 2, 4);

  -- Book, accept and pay through the same functions the site uses
  perform set_config('request.jwt.claim.sub', v_parent::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_parent, 'role', 'authenticated')::text, true);
  b := public.create_booking(jsonb_build_object('serviceId', v_svc_a, 'serviceType', 'shared_bus', 'legs', 'both',
    'childIds', jsonb_build_array(v_layan, v_omar), 'addressId', v_home, 'dates', v_dates));
  perform set_config('request.jwt.claim.sub', v_bus::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_bus, 'role', 'authenticated')::text, true);
  perform public.driver_respond((b ->> 'id')::uuid, true, null);
  perform set_config('request.jwt.claim.sub', v_parent::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_parent, 'role', 'authenticated')::text, true);
  perform public.pay_booking(jsonb_build_object('bookingId', b ->> 'id', 'method', 'wallet',
    'idempotencyKey', 'seed-' || (b ->> 'id')));
  perform public.create_booking(jsonb_build_object('serviceId', v_svc_b, 'serviceType', 'shared_bus', 'legs', 'both',
    'childIds', jsonb_build_array(v_omar), 'addressId', v_home, 'dates', v_dates_b,
    'note', 'Omar trains on Sundays, Tuesdays and Thursdays.'));
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);

  return 'Demo data created. Logins: admin@ksamasar.com, parent@ksamasar.com, driver.bus@ksamasar.com, driver.car@ksamasar.com, '
      || 'pending.driver@ksamasar.com (and 7 more drivers) with the password you chose.';
end;
$$;

revoke execute on function public.seed_user(text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.seed_driver(text, jsonb) from public, anon, authenticated;
revoke execute on function public.seed_demo(text) from public, anon, authenticated;

-- Tidy demo data created by an earlier version of this file
update public.services
   set name = replace(name, 'KFUPM', 'Al Jamiah'),
       stops = replace(stops::text, '"KFUPM"', '"Al Jamiah"')::jsonb
 where name like '%KFUPM%' or stops::text like '%"KFUPM"%';

-- ===========================================================================
-- Demo: one mobile number can be used on several accounts
-- (replaces the "one verified account per number" rule from 0001)
-- ===========================================================================

drop index if exists public.profiles_verified_phone_key;

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

revoke execute on function public.request_phone_otp(text) from public, anon;
revoke execute on function public.verify_phone_otp(text)  from public, anon;
grant  execute on function public.request_phone_otp(text) to authenticated;
grant  execute on function public.verify_phone_otp(text)  to authenticated;
