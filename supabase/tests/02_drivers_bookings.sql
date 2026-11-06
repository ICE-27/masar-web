-- Checks for 0002_drivers_services_bookings.sql against a local Postgres:
--   psql -f 00_local_auth_stub.sql -f ../migrations/0001_parent_onboarding.sql \
--        -f ../migrations/0002_drivers_services_bookings.sql -f 02_drivers_bookings.sql
-- Every check prints "ok - ..." or stops with an error.
\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned

create or replace function pg_temp.ok(p_cond boolean, p_name text) returns text language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'FAIL - %', p_name; end if;
  return 'ok - ' || p_name;
end $$;

-- Run p_sql and return the error message it raises ('' if none)
create or replace function pg_temp.err(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return '';
exception when others then
  return sqlerrm;
end $$;

-- ---- Price maths: the acceptance example from the brief -------------------
select pg_temp.ok((public.calc_price(2500, 2, 22, 0, 5, 10) ->> 'driverH')::bigint = 99000, 'fee math: driver gets SAR 990');
select pg_temp.ok((public.calc_price(2500, 2, 22, 0, 5, 10) ->> 'vatH')::bigint = 14850, 'fee math: VAT SAR 148.50');
select pg_temp.ok((public.calc_price(2500, 2, 22, 0, 5, 10) ->> 'feeH')::bigint = 9900, 'fee math: Masar fee SAR 99');
select pg_temp.ok((public.calc_price(2500, 2, 22, 0, 5, 10) ->> 'totalH')::bigint = 123750, 'fee math: parent pays SAR 1,237.50');
select pg_temp.ok((public.calc_price(2500, 2, 20, 0, 5, 10) ->> 'discountPct')::int = 5, 'fee math: 20 booked days drops to 5%');
select pg_temp.ok((public.calc_price(2500, 2, 10, 0, 5, 10) ->> 'discountPct')::int = 0, 'fee math: 10 booked days, no discount');
select pg_temp.ok((public.calc_price(2000, 2, 22, 0, 5, 10) ->> 'totalH')::bigint = 99000, 'fee math: brief preview example SAR 990');
select pg_temp.ok((public.calc_price(65000, 1, 5, 8000, 5, 10) ->> 'lineH')::bigint = 365000, 'whole bus + attendant fee line');
select pg_temp.ok(public.iban_valid('SA0380000000608010167519') and not public.iban_valid('SA0380000000608010167518'), 'IBAN checksum');
select pg_temp.ok(public.luhn_valid('4242424242424242') and public.luhn_valid('4464040000000007')
  and public.luhn_valid('4000000000000002') and public.luhn_valid('4000000000009995') and public.luhn_valid('4000000000000119')
  and public.luhn_valid('5555555555554444') and not public.luhn_valid('4242424242424241'), 'demo cards pass Luhn');
select pg_temp.ok(public.card_brand('4464040000000007') = 'mada' and public.card_brand('5555555555554444') = 'mastercard', 'card brands');

-- ---- Seed -----------------------------------------------------------------
select public.seed_demo('Masar-Demo-2026');
select pg_temp.ok((select count(*) from public.drivers where status = 'approved') = 10, '10 approved demo drivers');
select pg_temp.ok((select count(*) from public.services where status = 'active') = 11, '11 demo services');
select pg_temp.ok((select string_agg(status, ',' order by status) from public.bookings) = 'confirmed,pending', 'seed bookings: one paid, one pending');
select pg_temp.ok((select bool_and(s = 0) from (select sum(amount_h) s from public.ledger_entries group by txn_id) x), 'every ledger transaction sums to zero');
select pg_temp.ok(public.balance('parent_wallet', (select id from auth.users where email = 'parent@ksamasar.com')) = 200000 - 85500,
  'demo wallet: SAR 2,000 minus SAR 855 paid');
select pg_temp.ok(public.seed_demo('Masar-Demo-2026') like 'Demo data is already there%', 'seed is idempotent');

select id as parent_id from auth.users where email = 'parent@ksamasar.com' \gset
select id as bus_id from auth.users where email = 'driver.bus@ksamasar.com' \gset
select id as car_id from auth.users where email = 'driver.car@ksamasar.com' \gset
select id as pend_id from auth.users where email = 'pending.driver@ksamasar.com' \gset
select id as svc_car from public.services where driver_id = :'car_id' \gset
select id as svc_bus_a from public.services where driver_id = :'bus_id' and kind = 'school' \gset
select id as svc_bus_b from public.services where driver_id = :'bus_id' and kind = 'activity' \gset
select id as bk_paid from public.bookings where status = 'confirmed' \gset
select id as bk_pending from public.bookings where status = 'pending' \gset

-- A second parent who signs up normally
insert into auth.users (id, email, raw_user_meta_data)
values ('a0000000-0000-0000-0000-000000000001', 'mona@x.com', '{"full_name":"Mona Saleh","role":"parent"}'),
       ('a0000000-0000-0000-0000-000000000002', 'hind@x.com', '{"full_name":"Hind Ali","role":"parent"}'),
       ('a0000000-0000-0000-0000-000000000003', 'sneaky@x.com', '{"full_name":"Sneaky","role":"admin"}'),
       ('a0000000-0000-0000-0000-000000000004', 'new.driver@x.com', '{"full_name":"Yousef Driver","role":"driver"}'),
       ('a0000000-0000-0000-0000-000000000005', 'lady.driver@x.com', '{"full_name":"Amal Driver","role":"driver"}');
set masar.otp_verified = 'on';
update public.profiles set phone = '+96655000000' || right(id::text, 1), phone_verified_at = now()
 where id::text like 'a0000000%';
set masar.otp_verified = 'off';
insert into public.addresses (id, parent_id, lat, lng, city, district) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 26.2925, 50.1958, 'Khobar', 'Al Aqrabiyah'),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 26.2940, 50.1940, 'Khobar', 'العقربية'),
  ('b0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001', 26.5000, 49.9000, 'Nowhere', null);
insert into public.children (id, parent_id, full_name, gender, date_of_birth) values
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Sara Saleh', 'girl', '2016-05-01'),
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Ali Saleh', 'boy', '2014-05-01'),
  ('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', 'Nada Ali', 'girl', '2016-08-01');

select pg_temp.ok((select role from public.profiles where id = 'a0000000-0000-0000-0000-000000000003') = 'parent', 'signing up as admin via metadata is ignored');
select pg_temp.ok(public.resolve_district(26.2940, 50.1940, 'العقربية') = 'khb-aqrabiyah', 'district resolves from an Arabic name');
select pg_temp.ok(public.resolve_district(26.2925, 50.1958, null) = 'khb-aqrabiyah', 'district resolves from coordinates');

-- Next Sunday..Thursday for three weeks, as JSON
select jsonb_agg(g::date) as dates3w from generate_series(
  public.riyadh_today() + (7 - extract(dow from public.riyadh_today())::int),
  public.riyadh_today() + (7 - extract(dow from public.riyadh_today())::int) + 20, interval '1 day') g
  where extract(dow from g) between 0 and 4 \gset

-- ---- As an anonymous visitor ---------------------------------------------
set role anon;
select pg_temp.ok(jsonb_array_length(public.search_services('{}') -> 'services') = 11, 'visitors can search without an account');
select pg_temp.ok(not (public.search_services('{}')::text like '%plateDigits%'), 'search never exposes number plates');
select pg_temp.ok(not (public.search_services('{}')::text like '%idNumber%') and not (public.search_services('{}')::text like '%iban%'), 'search never exposes ID numbers or IBANs');
select pg_temp.ok(pg_temp.err('select public.my_bookings()') like '%permission denied%', 'visitors cannot list bookings');
select pg_temp.ok(pg_temp.err('select * from public.bookings') like '%permission denied%', 'visitors cannot read the bookings table');
reset role;

-- ---- Parent Mona books Noura's car ---------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);
select pg_temp.ok(pg_temp.err('select * from public.bookings') like '%permission denied%', 'parents cannot read the bookings table directly');
select pg_temp.ok(pg_temp.err('select public.admin_overview()') like '%not_admin%', 'parents cannot open admin functions');
select pg_temp.ok(pg_temp.err('select public.seed_demo(''x'')') like '%permission denied%', 'parents cannot run the seed');
select pg_temp.ok(pg_temp.err('select public.make_admin(''mona@x.com'')') like '%permission denied%', 'parents cannot make themselves admin');
select pg_temp.ok(pg_temp.err('select public.expire_stale()') like '%permission denied%', 'internal helpers are not callable');

select public.quote_booking(jsonb_build_object('serviceId', :'svc_car', 'serviceType', 'shared_car', 'legs', 'both',
  'childIds', jsonb_build_array('c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002'),
  'addressId', 'b0000000-0000-0000-0000-000000000001', 'dates', :'dates3w'::jsonb)) as q \gset
select pg_temp.ok((:'q'::jsonb ->> 'bookedDays')::int = 15, 'quote counts 15 school days');
select pg_temp.ok((:'q'::jsonb -> 'price' ->> 'discountPct')::int = 5, 'quote: over 10 days earns 5%');
select pg_temp.ok((:'q'::jsonb -> 'price' ->> 'lineH')::bigint = 15 * 2200 * 2, 'quote: 15 days x SAR 22 x 2 children');
select pg_temp.ok((:'q'::jsonb ->> 'districtId') = 'khb-aqrabiyah' and not (:'q'::jsonb ->> 'outsideRoute')::boolean, 'quote: on the route, in coverage');

select pg_temp.ok(pg_temp.err(format('select public.create_booking(%L)', jsonb_build_object('serviceId', :'svc_car',
  'serviceType', 'shared_car', 'legs', 'both', 'childIds', jsonb_build_array('c0000000-0000-0000-0000-000000000001'),
  'addressId', 'b0000000-0000-0000-0000-000000000009', 'dates', :'dates3w'::jsonb))) like 'outside_route%',
  'a home far from the route is refused');
select pg_temp.ok(pg_temp.err(format('select public.create_booking(%L)', jsonb_build_object('serviceId', :'svc_car',
  'serviceType', 'shared_car', 'legs', 'both', 'childIds', jsonb_build_array('c0000000-0000-0000-0000-000000000003'),
  'addressId', 'b0000000-0000-0000-0000-000000000001', 'dates', :'dates3w'::jsonb))) like 'children_required%',
  'cannot book someone else''s child');

select public.create_booking(jsonb_build_object('serviceId', :'svc_car', 'serviceType', 'shared_car', 'legs', 'both',
  'childIds', jsonb_build_array('c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002'),
  'addressId', 'b0000000-0000-0000-0000-000000000001', 'dates', :'dates3w'::jsonb)) as b1 \gset
select :'b1'::jsonb ->> 'id' as b1_id \gset
select pg_temp.ok(:'b1'::jsonb ->> 'status' = 'pending' and (:'b1'::jsonb ->> 'requestExpiresAt') is not null, 'request sent, pending with a deadline');
select pg_temp.ok(pg_temp.err(format('select public.create_booking(%L)', jsonb_build_object('serviceId', :'svc_car',
  'serviceType', 'shared_car', 'legs', 'both', 'childIds', jsonb_build_array('c0000000-0000-0000-0000-000000000001'),
  'addressId', 'b0000000-0000-0000-0000-000000000001', 'dates', :'dates3w'::jsonb))) like 'duplicate_booking%',
  'the same child cannot be booked twice on the same days');
reset role;
select pg_temp.ok((select count(*) from public.seat_holds where booking_id = :'b1_id') = 30, 'seat holds: 2 seats x 15 dates');
select pg_temp.ok((select count(*) from public.notifications where user_id = :'car_id' and event = 'booking_requested') = 1, 'driver notified of the request');

-- ---- The last seat: Hind wants 1 seat; only 6 seats on the car ------------
-- Fill the car: 4 more seats on the first date, then two parents race for the last one
update public.availability_days set seats = null where false;
insert into public.availability_days (service_id, date, seats) values (:'svc_car', (:'dates3w'::jsonb ->> 0)::date, 3);
set role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', false);
select public.create_booking(jsonb_build_object('serviceId', :'svc_car', 'serviceType', 'shared_car', 'legs', 'both',
  'childIds', jsonb_build_array('c0000000-0000-0000-0000-000000000003'),
  'addressId', 'b0000000-0000-0000-0000-000000000002', 'dates', jsonb_build_array(:'dates3w'::jsonb ->> 0))) ->> 'status' as hind_status \gset
select pg_temp.ok(:'hind_status' = 'pending', 'Hind takes the last seat on the first date');
select pg_temp.ok(pg_temp.err(format('select public.create_booking(%L)', jsonb_build_object('serviceId', :'svc_car',
  'serviceType', 'shared_car', 'legs', 'both', 'childIds', jsonb_build_array('c0000000-0000-0000-0000-000000000003'),
  'addressId', 'b0000000-0000-0000-0000-000000000002', 'dates', jsonb_build_array(:'dates3w'::jsonb ->> 1)))) = '',
  'Hind can still book another day');
reset role;
-- Mona's second request for that first date must fail: 3 seats, 3 held
insert into public.children (id, parent_id, full_name, gender, date_of_birth)
values ('c0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'Yara Saleh', 'girl', '2018-05-01');
set role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);
select pg_temp.ok(pg_temp.err(format('select public.create_booking(%L)', jsonb_build_object('serviceId', :'svc_car',
  'serviceType', 'shared_car', 'legs', 'both', 'childIds', jsonb_build_array('c0000000-0000-0000-0000-000000000004'),
  'addressId', 'b0000000-0000-0000-0000-000000000001', 'dates', jsonb_build_array(:'dates3w'::jsonb ->> 0)))) like 'dates_unavailable%',
  'no overselling: the 4th seat on a 3-seat day is refused');
select pg_temp.ok(pg_temp.err(format('select public.driver_set_day(%L, %L, 2, false, null)', :'svc_car', :'dates3w'::jsonb ->> 0)) like '%not_found%',
  'a parent cannot change a driver''s seats');
reset role;

-- ---- Driver Noura answers ------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', :'car_id', false);
select pg_temp.ok(not ((public.get_booking(:'b1_id') -> 'pickup') ? 'lat'), 'driver does not see the exact pickup before payment');
select pg_temp.ok((public.get_booking(:'b1_id') -> 'children' -> 0 ->> 'medicalNotes') is null, 'driver does not see notes before payment');
select pg_temp.ok(pg_temp.err(format('select public.driver_set_day(%L, %L, 1, false, null)', :'svc_car', :'dates3w'::jsonb ->> 0)) like 'seats_below_booked%',
  'seats on a date cannot drop below seats already held');
select pg_temp.ok(pg_temp.err(format('select public.driver_respond(%L, false, '''')', :'b1_id')) like 'reason_required%', 'rejecting needs a reason');
select public.driver_respond(:'b1_id', true, null) ->> 'status' as st \gset
select pg_temp.ok(:'st' = 'accepted', 'driver accepts');
select pg_temp.ok(pg_temp.err(format('select public.driver_respond(%L, true, null)', :'b1_id')) like 'not_pending%', 'cannot accept twice');
reset role;
select pg_temp.ok((select bool_and(expires_at is not null and expires_at > now()) from public.seat_holds where booking_id = :'b1_id'),
  'accepted: seats held until the payment deadline');

-- ---- Parent pays ----------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);
select public.pay_booking(jsonb_build_object('bookingId', :'b1_id', 'method', 'card', 'idempotencyKey', 'k-declined-001',
  'card', jsonb_build_object('number', '4000 0000 0000 0002', 'expMonth', 12, 'expYear', 2030, 'cvc', '123'))) as p1 \gset
select pg_temp.ok(:'p1'::jsonb ->> 'code' = 'card_declined', 'declined test card is declined');
select pg_temp.ok(public.get_booking(:'b1_id') ->> 'status' = 'accepted', 'after a decline the booking is still awaiting payment');
select pg_temp.ok((public.pay_booking(jsonb_build_object('bookingId', :'b1_id', 'method', 'card', 'idempotencyKey', 'k-real-card',
  'card', jsonb_build_object('number', '4111 1111 1111 1111', 'expMonth', 12, 'expYear', 2030, 'cvc', '123'))) ->> 'code') = 'demo_card_only',
  'any card other than the demo cards is refused');
select pg_temp.ok((public.pay_booking(jsonb_build_object('bookingId', :'b1_id', 'method', 'card', 'idempotencyKey', 'k-funds-001',
  'card', jsonb_build_object('number', '4000000000009995', 'expMonth', 12, 'expYear', 2030, 'cvc', '123'))) ->> 'code') = 'insufficient_funds',
  'insufficient-funds test card');
select pg_temp.ok((public.pay_booking(jsonb_build_object('bookingId', :'b1_id', 'method', 'card', 'idempotencyKey', 'k-expired-01',
  'card', jsonb_build_object('number', '4242424242424242', 'expMonth', 1, 'expYear', 2020, 'cvc', '123'))) ->> 'code') = 'expired_card',
  'expired card is refused');
select public.pay_booking(jsonb_build_object('bookingId', :'b1_id', 'method', 'mada', 'idempotencyKey', 'k-good-0001',
  'card', jsonb_build_object('number', '4464 0400 0000 0007', 'expMonth', 12, 'expYear', 2030, 'cvc', '321'))) as p2 \gset
select pg_temp.ok(:'p2'::jsonb ->> 'status' = 'succeeded', 'mada test card succeeds');
select pg_temp.ok(public.get_booking(:'b1_id') ->> 'status' = 'confirmed', 'paid booking is confirmed');
select pg_temp.ok((public.pay_booking(jsonb_build_object('bookingId', :'b1_id', 'method', 'mada', 'idempotencyKey', 'k-good-0001',
  'card', jsonb_build_object('number', '4464 0400 0000 0007', 'expMonth', 12, 'expYear', 2030, 'cvc', '321'))) ->> 'replayed')::boolean,
  'same idempotency key: returns the first result');
select pg_temp.ok(pg_temp.err(format('select public.pay_booking(%L)', jsonb_build_object('bookingId', :'b1_id', 'method', 'mada',
  'idempotencyKey', 'k-good-0002', 'card', jsonb_build_object('number', '4464040000000007', 'expMonth', 12, 'expYear', 2030, 'cvc', '321')))) like 'already_paid%',
  'a confirmed booking cannot be charged again');
select pg_temp.ok(jsonb_array_length(public.wallet_summary() -> 'invoices') = 1, 'one tax invoice issued');
select (public.wallet_summary() -> 'invoices' -> 0 ->> 'id') as inv_id \gset
select pg_temp.ok((public.get_invoice(:'inv_id') ->> 'totalH')::bigint = (public.get_booking(:'b1_id') -> 'price' ->> 'totalH')::bigint, 'invoice total matches the booking');
reset role;
select pg_temp.ok((select count(*) from public.payments where booking_id = :'b1_id' and status = 'succeeded') = 1, 'charged exactly once');
select pg_temp.ok((select bool_and(expires_at is null) from public.seat_holds where booking_id = :'b1_id'), 'paid seats are held for good');
select pg_temp.ok((select sum(amount_h) from public.ledger_entries where booking_id = :'b1_id' and account = 'driver_payable')
  = (select driver_h from public.bookings where id = :'b1_id'), 'ledger: driver is owed 100% of their price');
select pg_temp.ok((select sum(amount_h) from public.ledger_entries where booking_id = :'b1_id' and account = 'platform_revenue')
  = (select fee_h from public.bookings where id = :'b1_id'), 'ledger: Masar earns the 10% added on top');
set role authenticated;
select set_config('request.jwt.claim.sub', :'car_id', false);
select pg_temp.ok((public.get_booking(:'b1_id') -> 'pickup') ? 'lat', 'after payment the driver sees the pickup');
select pg_temp.ok((public.get_booking(:'b1_id') -> 'parent' ->> 'phone') is not null, 'after payment the driver sees the parent''s phone');

-- ---- Conflict engine -------------------------------------------------------
-- Dropping Thursdays from the car service would break Mona's confirmed trips
select public.driver_check_service(:'svc_car', '{"days":[0,1,2,3],"outbound":true,"pickupStartMin":380,"pickupEndMin":410,"arriveMin":425,"returnTrip":true,"returnDepartMin":810,"returnEndMin":855,"seats":6}'::jsonb, null) as chk \gset
select pg_temp.ok(jsonb_array_length(:'chk'::jsonb -> 'confirmed') = 1, 'conflict check finds the confirmed booking');
select public.driver_get_service(:'svc_car') as svc \gset
select pg_temp.ok(pg_temp.err(format('select public.driver_save_service(%L)',
  (:'svc'::jsonb - 'schedule') || jsonb_build_object('schedule', '{"days":[0,1,2,3],"outbound":true,"pickupStartMin":380,"pickupEndMin":410,"arriveMin":425,"returnTrip":true,"returnDepartMin":810,"returnEndMin":855,"seats":6}'::jsonb)))
  like 'schedule_conflict%', 'saving a change that breaks a confirmed booking is blocked');
select public.driver_save_service((:'svc'::jsonb - 'schedule') || jsonb_build_object('schedule', '{"days":[0,1,2,3],"outbound":true,"pickupStartMin":380,"pickupEndMin":410,"arriveMin":425,"returnTrip":true,"returnDepartMin":810,"returnEndMin":855,"seats":6}'::jsonb),
  (:'chk'::jsonb ->> 'earliestDate')::date) -> 'upcomingSchedules' as up \gset
select pg_temp.ok(jsonb_array_length(:'up'::jsonb) = 1, 'the same change applies from the earliest allowed date instead');
select pg_temp.ok(pg_temp.err('select public.driver_save_hours(''[{"dow":0,"startMin":420,"endMin":480}]''::jsonb, null)') like 'schedule_conflict%',
  'working hours that break confirmed trips are blocked');
select pg_temp.ok(pg_temp.err(format('select public.driver_block_dates(%L, %L, ''Family trip'', false)', :'dates3w'::jsonb ->> 2, :'dates3w'::jsonb ->> 2)) like 'schedule_conflict%',
  'a day off over confirmed trips needs confirmation');
reset role;
select public.balance('parent_wallet', 'a0000000-0000-0000-0000-000000000001') as before_wallet \gset
set role authenticated;
select set_config('request.jwt.claim.sub', :'car_id', false);
select public.driver_block_dates((:'dates3w'::jsonb ->> 2)::date, (:'dates3w'::jsonb ->> 2)::date, 'Family trip', true) is not null as blocked \gset
reset role;
select pg_temp.ok((select state from public.booking_dates where booking_id = :'b1_id' and date = (:'dates3w'::jsonb ->> 2)::date) = 'driver_unavailable',
  'that one day is cancelled, the rest untouched');
select pg_temp.ok((select count(*) from public.booking_dates where booking_id = :'b1_id' and state = 'scheduled') = 14, '14 trips still scheduled');
select pg_temp.ok((select fee_h from public.refunds where booking_id = :'b1_id' and initiated_by = 'driver') > 0,
  'driver cancellation refunds the Masar fee too');
select pg_temp.ok(public.balance('parent_wallet', 'a0000000-0000-0000-0000-000000000001') - :before_wallet
  = (select total_h from public.refunds where booking_id = :'b1_id' and initiated_by = 'driver'), 'refund lands in the parent''s wallet');
select pg_temp.ok((select count(*) from public.seat_holds where booking_id = :'b1_id' and date = (:'dates3w'::jsonb ->> 2)::date) = 0,
  'the freed seat is released for that date');

-- Changing the activity service's times auto-declines the pending request
set role authenticated;
select set_config('request.jwt.claim.sub', :'bus_id', false);
select public.driver_get_service(:'svc_bus_b') as svcb \gset
select public.driver_save_service((:'svcb'::jsonb - 'schedule') || jsonb_build_object('schedule',
  '{"days":[0,2,4],"outbound":true,"pickupStartMin":970,"pickupEndMin":1000,"arriveMin":1015,"returnTrip":true,"returnDepartMin":1140,"returnEndMin":1185,"seats":14}'::jsonb)) is not null as saved \gset
reset role;
select pg_temp.ok((select status from public.bookings where id = :'bk_pending') = 'rejected', 'pending request declined when the schedule changed');
select pg_temp.ok((select count(*) from public.notifications where user_id = :'parent_id' and event = 'booking_rejected') = 1, 'parent told why');

-- ---- Parent cancels: notice window, fee kept -------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);
select public.cancel_preview(:'b1_id') as pv \gset
select pg_temp.ok((:'pv'::jsonb ->> 'feeKeptH')::bigint > 0 and (:'pv'::jsonb ->> 'refundDriverH')::bigint > 0, 'cancel preview shows refund and kept fee');
select public.cancel_booking(:'b1_id', 'Moving house', 'wallet') as cx \gset
reset role;
select pg_temp.ok((select fee_h from public.refunds where booking_id = :'b1_id' and initiated_by = 'parent') = 0, 'parent cancellation keeps the Masar fee');
select pg_temp.ok((select count(*) from public.booking_dates where booking_id = :'b1_id' and state = 'scheduled'
  and date >= public.riyadh_today() + 7) = 0, 'no trips left beyond the 7-day notice window');
select pg_temp.ok((select bool_and(s = 0) from (select sum(amount_h) s from public.ledger_entries group by txn_id) x), 'ledger still balanced after refunds');
select pg_temp.ok((select sum(total_h) from public.refunds where booking_id = :'b1_id') <= (select total_h from public.bookings where id = :'b1_id'),
  'refunds never exceed what was paid');

-- ---- Driver registration --------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000004', false);
select pg_temp.ok(public.driver_get_application() -> 'driver' ->> 'status' = 'draft', 'new driver starts as a draft');
select pg_temp.ok(pg_temp.err('select public.driver_save_application(''{"personal":{"nameAr":"يوسف","nameEn":"Yousef Ahmed","gender":"male","dateOfBirth":"2005-01-01","city":"Khobar"}}'')') like 'driver_too_young%',
  'drivers must be 25 or older');
select public.driver_save_application('{"personal":{"nameAr":"يوسف أحمد","nameEn":"Yousef Ahmed","gender":"male","dateOfBirth":"1990-01-01","city":"Khobar"},"step":2}') is not null as x \gset
select pg_temp.ok(pg_temp.err('select public.driver_save_application(''{"payout":{"bankName":"X","iban":"SA0380000000608010167518","accountHolder":"Yousef"}}'')') like 'iban_invalid%',
  'bad IBAN checksum refused');
select pg_temp.ok(pg_temp.err('select public.driver_save_application(''{"vehicle":{"type":"car","make":"Toyota","model":"Camry","year":2022,"color":"White","seats":4,"carCategory":"sedan","plateDigits":"4721","plateLetters":"ABD"}}'')') like 'plate_taken%',
  'duplicate plate refused');
select pg_temp.ok(pg_temp.err('select public.driver_save_application(''{"vehicle":{"type":"car","make":"Toyota","model":"Camry","year":2009,"color":"White","seats":4,"carCategory":"sedan","plateDigits":"1","plateLetters":"A"}}'')') like 'vehicle_too_old%',
  'vehicle older than the limit refused');
select pg_temp.ok(pg_temp.err('select public.driver_submit()') like 'application_incomplete%', 'incomplete application cannot be submitted');
select pg_temp.ok(pg_temp.err('select public.driver_save_document(''id_front'', ''driver-docs'', ''someone-else/x.jpg'', null)') like 'bad_path%',
  'documents must live in the driver''s own folder');
select pg_temp.ok(pg_temp.err('select public.driver_save_service(''{"name":"x"}'')') like 'not_approved%', 'cannot publish services before approval');
select pg_temp.ok(pg_temp.err('insert into public.drivers (id) values (auth.uid())') like '%permission denied%', 'drivers table is not writable directly');
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000005', false);
select public.driver_save_application('{"personal":{"nameAr":"أمل","nameEn":"Amal Saad","gender":"female","dateOfBirth":"1990-01-01","city":"Dammam"}}') is not null as x \gset
select pg_temp.ok(pg_temp.err('select public.driver_save_application(''{"vehicle":{"type":"bus","make":"Toyota","model":"Coaster","year":2022,"color":"White","seats":22,"busType":"coaster","plateDigits":"77","plateLetters":"AB"}}'')') like 'female_bus_not_allowed%',
  'a female driver cannot register a bus');
reset role;

-- Storage: own folder only
set role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000004', false);
insert into storage.objects (bucket_id, name, owner) values ('driver-docs', 'a0000000-0000-0000-0000-000000000004/id_front-1.jpg', auth.uid());
select pg_temp.ok(pg_temp.err('insert into storage.objects (bucket_id, name) values (''driver-docs'', ''a0000000-0000-0000-0000-000000000005/x.jpg'')') like '%row-level security%',
  'cannot upload into another driver''s folder');
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000005', false);
select pg_temp.ok((select count(*) from storage.objects where bucket_id = 'driver-docs') = 0, 'cannot see another driver''s documents');
reset role;

-- ---- Admin -----------------------------------------------------------------
select public.make_admin('hind@x.com');
set role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', false);
select pg_temp.ok((select count(*) from storage.objects where bucket_id = 'driver-docs') = 1, 'admins can see driver documents');
select pg_temp.ok(jsonb_array_length(public.admin_driver_queue()) >= 12, 'admin sees the verification queue');
select pg_temp.ok(pg_temp.err(format('select public.admin_decide_driver(%L, ''approve'', null)', :'pend_id')) like 'documents_not_approved%',
  'cannot approve before every document is approved');
select count(*) as n from (select public.admin_review_document(x.id, true, null) from public.driver_documents x where false) t \gset
reset role;
select string_agg(id::text, ',') as docs from public.driver_documents where driver_id = :'pend_id' \gset
set role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', false);
select count(*) as n from unnest(string_to_array(:'docs', ',')) d, lateral public.admin_review_document(d::uuid, true, null) \gset
select pg_temp.ok(public.admin_decide_driver(:'pend_id', 'approve', 'All good') -> 'driver' ->> 'status' = 'approved', 'admin approves the pending driver');
select public.admin_overview() as ov \gset
select pg_temp.ok((:'ov'::jsonb ->> 'gmvH')::bigint > 0 and (:'ov'::jsonb ->> 'commissionH')::bigint > 0, 'admin overview shows GMV and commission');
select pg_temp.ok((public.admin_payout_run() ->> 'count')::int >= 0, 'payout run completes');
select pg_temp.ok(pg_temp.err('select public.admin_save_settings(''{"role":"x"}'')') like 'bad_setting%', 'only known settings can be changed');
reset role;
select pg_temp.ok((select count(*) from public.notifications where user_id = :'pend_id' and event = 'driver_approved') = 1, 'driver told they are verified');

-- ---- Expiry releases seats -------------------------------------------------
update public.bookings set request_expires_at = now() - interval '1 minute'
 where status = 'pending' and parent_id = 'a0000000-0000-0000-0000-000000000002';
set role anon;
select jsonb_typeof(public.search_services('{}')) as t \gset
reset role;
select pg_temp.ok((select count(*) from public.bookings where parent_id = 'a0000000-0000-0000-0000-000000000002' and status = 'expired') = 2,
  'unanswered requests expire');
select pg_temp.ok((select count(*) from public.seat_holds h join public.bookings b on b.id = h.booking_id
  where b.parent_id = 'a0000000-0000-0000-0000-000000000002') = 0, 'expired requests release their seats');

select 'all checks passed';
