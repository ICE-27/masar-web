\set ON_ERROR_STOP 0
\pset tuples_only on
insert into auth.users (id, email, raw_user_meta_data) values
 ('11111111-1111-1111-1111-111111111111','a@x.com','{"full_name":"Sara Ahmed","locale":"en"}'),
 ('22222222-2222-2222-2222-222222222222','b@x.com','{"full_name":"Hacker","role":"admin"}');
select 'T1 roles: ' || string_agg(role||'/'||preferred_locale, ',' order by id) from profiles;

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update profiles set full_name='Sara A.' where id=auth.uid();
select 'T2 name: '||full_name from profiles;
update profiles set role='admin' where id=auth.uid();   -- expect permission denied
update profiles set phone_verified_at=now() where id=auth.uid(); -- expect permission denied
insert into addresses (lat,lng,city) values (26.28,50.20,'Khobar');
insert into addresses (lat,lng,city,label) values (26.42,50.09,'Dammam','grandparents');
select 'T3 defaults after 2 inserts: '||string_agg(city||':'||is_default, ',' order by created_at) from addresses;
update addresses set is_default=true where city='Dammam';
select 'T4 after switch: '||string_agg(city||':'||is_default, ',' order by created_at) from addresses;
delete from addresses where city='Dammam';
select 'T5 after deleting default: '||string_agg(city||':'||is_default, ',') from addresses;
insert into children (full_name, gender, date_of_birth, authorized_pickups) values ('Layan','girl','2017-03-04','[{"name":"Grandma","phone":"+966500000001"}]');
insert into children (full_name, gender, date_of_birth) values ('X','boy','2017-03-04'); -- name too short
select 'T6 children: '||count(*) from children;
select 'T7 otp: '|| (request_phone_otp('+966512345678') ? 'demo_code');
select request_phone_otp('+966512345678');  -- cooldown
select 'T8 wrong: '||verify_phone_otp('000000-wrong')::text;
reset role;
select 'T9 code: '||count(*) from phone_otps;
-- read the real code by brute force over the hash (test only)
create temp table c as select lpad(g::text,6,'0') code from generate_series(0,999999) g
  where encode(sha256(convert_to('11111111-1111-1111-1111-111111111111:'||lpad(g::text,6,'0'),'UTF8')),'hex') = (select code_hash from phone_otps where consumed_at is null);
grant select on c to authenticated;
set role authenticated;
select 'T10 right: '||verify_phone_otp((select code from c))::text;
select 'T11 verified: '||phone||' '||(phone_verified_at is not null) from profiles;
update profiles set phone='+966599999999' where id=auth.uid();
select 'T12 changed phone clears verification: '||(phone_verified_at is null) from profiles;
select * from phone_otps; -- expect permission denied

set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select 'T13 B sees addresses/children/profiles: '||(select count(*) from addresses)||'/'||(select count(*) from children)||'/'||(select count(*) from profiles);
insert into addresses (parent_id, lat, lng) values ('11111111-1111-1111-1111-111111111111', 1, 1); -- expect RLS violation
update children set full_name='pwned';
select 'T14 destinations: '||count(*) from destinations;
reset role;
select 'T15 child name intact: '||full_name from children;
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select delete_my_account();
reset role;
select 'T16 after delete: users='||(select count(*) from auth.users)||' profiles='||(select count(*) from profiles)||' children='||(select count(*) from children)||' addresses='||(select count(*) from addresses);
set role anon;
select request_phone_otp('+966512345678'); -- expect permission denied
\pset tuples_only on
reset role;
drop table if exists c;
insert into auth.users (id, email) values ('33333333-3333-3333-3333-333333333333','c@x.com'),('44444444-4444-4444-4444-444444444444','d@x.com');
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select 'otp: '||request_phone_otp('+966512345678')::text;
select 'wrong: '||verify_phone_otp('123')::text;
reset role;
create temp table c as select lpad(g::text,6,'0') code from generate_series(0,999999) g
  where encode(sha256(convert_to('33333333-3333-3333-3333-333333333333:'||lpad(g::text,6,'0'),'UTF8')),'hex') = (select code_hash from phone_otps where consumed_at is null);
grant select on c to authenticated;
set role authenticated;
select 'right: '||verify_phone_otp((select code from c))::text;
select 'verified: '||phone||' '||(phone_verified_at is not null) from profiles;
update profiles set full_name='Ok Name' where id=auth.uid();
select 'name change keeps verification: '||(phone_verified_at is not null) from profiles;
select 'reuse: '||verify_phone_otp((select code from c))::text;
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
select request_phone_otp('+966512345678');
