
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
