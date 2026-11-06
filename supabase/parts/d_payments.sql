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
    'driver', (select jsonb_build_object('nameEn', coalesce(d.name_en, d.name_ar), 'nameAr', coalesce(d.name_ar, d.name_en)) from public.drivers d where d.id = i.driver_id)
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
