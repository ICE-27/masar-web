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
  values (v_id, v_status, 7, p ->> 'nameAr', p ->> 'nameEn', p ->> 'gender', (p ->> 'dob')::date, 'Saudi', p ->> 'city',
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
