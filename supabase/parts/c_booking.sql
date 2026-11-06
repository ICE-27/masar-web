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
