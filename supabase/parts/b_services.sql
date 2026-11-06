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
