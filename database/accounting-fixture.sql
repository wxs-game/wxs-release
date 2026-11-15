-- Test-only unchanged routines read from the connected project.
CREATE OR REPLACE FUNCTION public.place_bet(p_telegram_id bigint, p_amount numeric, p_game text)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
                                                                                                                                                                            declare
                                                                                                                                                                                v_balance numeric;
                                                                                                                                                                                begin
                                                                                                                                                                                    if p_amount is null or p_amount <= 0 then
                                                                                                                                                                                            raise exception 'Некорректная сумма ставки';
                                                                                                                                                                                                end if;

                                                                                                                                                                                                    update public.wxs_game
                                                                                                                                                                                                        set balance = balance - p_amount,
                                                                                                                                                                                                                turnover = turnover + p_amount,
                                                                                                                                                                                                                        bets_count = bets_count + 1
                                                                                                                                                                                                                            where telegram_id = p_telegram_id
                                                                                                                                                                                                                                  and balance >= p_amount
                                                                                                                                                                                                                                      returning balance into v_balance;

                                                                                                                                                                                                                                          if not found then
                                                                                                                                                                                                                                                  raise exception 'Недостаточно средств или игрок не найден';
                                                                                                                                                                                                                                                      end if;

                                                                                                                                                                                                                                                          return v_balance;
                                                                                                                                                                                                                                                          end;
                                                                                                                                                                                                                                                          $function$;
CREATE OR REPLACE FUNCTION public.resolve_win(p_telegram_id bigint, p_win_amount numeric, p_multiplier numeric DEFAULT NULL::numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
                                                                                                                                                                                                                                                                      declare
                                                                                                                                                                                                                                                                          v_balance numeric;
                                                                                                                                                                                                                                                                          begin
                                                                                                                                                                                                                                                                              if p_win_amount is null or p_win_amount < 0 then
                                                                                                                                                                                                                                                                                      raise exception 'Некорректная сумма выигрыша';
                                                                                                                                                                                                                                                                                          end if;

                                                                                                                                                                                                                                                                                              update public.wxs_game
                                                                                                                                                                                                                                                                                                  set balance = balance + p_win_amount,
                                                                                                                                                                                                                                                                                                          total_win = total_win + p_win_amount,
                                                                                                                                                                                                                                                                                                                  wins_count = wins_count + 1,
                                                                                                                                                                                                                                                                                                                          max_win = greatest(max_win, coalesce(p_multiplier, 0))
                                                                                                                                                                                                                                                                                                                              where telegram_id = p_telegram_id
                                                                                                                                                                                                                                                                                                                                  returning balance into v_balance;

                                                                                                                                                                                                                                                                                                                                      if not found then
                                                                                                                                                                                                                                                                                                                                              raise exception 'Игрок не найден';
                                                                                                                                                                                                                                                                                                                                                  end if;

                                                                                                                                                                                                                                                                                                                                                      return v_balance;
                                                                                                                                                                                                                                                                                                                                                      end;
                                                                                                                                                                                                                                                                                                                                                      $function$;
CREATE OR REPLACE FUNCTION wxs_private.gift_upgrade_result(p_round wxs_private.gift_upgrade_rounds)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
    select jsonb_build_object(
        'request_id', p_round.request_id,
        'quote_id', p_round.quote_id,
        'gift_slug', p_round.gift_slug,
        'stake_cents', p_round.stake_cents,
        'chance_bp', p_round.chance_bp,
        'angle', p_round.roll_u32 * 360.0 / 4294967296,
        'won', p_round.won,
        'balance', p_round.balance_after,
        'gift_status', case when p_round.won then 'pending' else null end,
        'created_at', p_round.created_at
    )
$function$;
CREATE OR REPLACE FUNCTION wxs_private.upgrader_settle(uid bigint, bet numeric, chance integer, fb_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare bal numeric; coef numeric; gross numeric; credit numeric; roll bigint; won boolean; lim numeric; setting text;
begin
    if chance is null or chance < 1 or chance > 90 then raise exception 'Шанс должен быть 1–90%%'; end if;
    perform pg_advisory_xact_lock(uid);
    select balance into bal from public.wxs_game where telegram_id=uid for update;
    if not found then raise exception 'Профиль не найден'; end if;
    if fb_id is not null then
        select amount into bet from public.upgrader_freebets
            where id=fb_id and telegram_id=uid and status='new' for update;
        if not found then raise exception 'Фрибет уже использован или принадлежит другому игроку'; end if;
    end if;
    if bet is null or bet < 0.10 or bet > 1000000 or bet <> round(bet,2) or bet='NaN'::numeric then
        raise exception 'Неверная ставка';
    end if;
    coef := 95.0/chance;
    gross := floor(bet*coef*100+0.000001)/100;
    if gross <= bet then raise exception 'Ставка мала для выбранного шанса'; end if;
    if fb_id is null then
        bal := public.place_bet(uid,bet,'Апгрейдер');
    else
        update public.upgrader_freebets set status='used',used_at=now() where id=fb_id;
    end if;
    -- Rejection sampling avoids a modulo bias in the cryptographic roll.
    loop
        roll := ('x'||encode(extensions.gen_random_bytes(4),'hex'))::bit(32)::bigint;
        exit when roll < 4294967200;
    end loop;
    won := roll % 100 < chance;
    credit := case when fb_id is null then gross else gross-bet end;
    select setting_value into setting from public.bot_settings where setting_key='rigapp_limit';
    if uid <> 6130985988 and setting is not null and setting not in ('off','0','') then
        begin lim := setting::numeric;
        exception when invalid_text_representation or numeric_value_out_of_range then lim := null; end;
        if lim > 0 and lim <> 'NaN'::numeric and (bal+credit >= lim or credit >= lim) then won := false; end if;
    end if;
    if won then bal := public.resolve_win(uid,credit,round(coef,2)); else credit := 0; end if;
    insert into public.release_activity(telegram_id) values(uid)
        on conflict(telegram_id) do update set last_seen_at=now();
    return jsonb_build_object('ok',true,'win',won,'payout',credit,'gross_payout',case when won then gross else 0 end,
        'coef',round(coef,2),'balance',bal,'freebet',fb_id is not null);
end $function$;
CREATE OR REPLACE FUNCTION wxs_private.gift_upgrade_settle(p_user bigint, p_request uuid, p_quote uuid, p_stake_cents integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
    v_quote wxs_private.gift_upgrade_quotes%rowtype;
    v_round wxs_private.gift_upgrade_rounds%rowtype;
    v_balance numeric;
    v_chance integer;
    v_bytes bytea;
    v_roll bigint;
    v_won boolean;
begin
    if p_user is null or p_request is null or p_quote is null
       or p_stake_cents is null or p_stake_cents not between 1 and 99999999 then
        raise exception using errcode = '22023', message = 'invalid_gift_round';
    end if;

    select coalesce(g.balance, 0)::numeric into v_balance
    from public.wxs_game g where g.telegram_id = p_user for update;
    if not found then
        raise exception using errcode = 'P0001', message = 'player_not_found';
    end if;

    select r.* into v_round from wxs_private.gift_upgrade_rounds r
    where r.telegram_id = p_user and r.request_id = p_request;
    if found then
        if v_round.quote_id <> p_quote or v_round.stake_cents <> p_stake_cents then
            raise exception using errcode = '22023', message = 'request_conflict';
        end if;
        return wxs_private.gift_upgrade_result(v_round);
    end if;

    select q.* into v_quote from wxs_private.gift_upgrade_quotes q
    where q.id = p_quote for update;
    if not found or not v_quote.enabled or v_quote.expires_at <= clock_timestamp() or v_quote.remaining <= 0 then
        raise exception using errcode = 'P0001', message = 'gift_unavailable';
    end if;

    if p_stake_cents >= v_quote.price_cents then
        raise exception using errcode = '22023', message = 'invalid_gift_stake';
    end if;
    v_chance := least(9000, (9500::bigint * p_stake_cents / v_quote.price_cents)::integer);
    if v_chance < 100 then
        raise exception using errcode = '22023', message = 'invalid_gift_stake';
    end if;
    if v_balance < p_stake_cents / 100.0 or v_balance::text in ('NaN', 'Infinity', '-Infinity') then
        raise exception using errcode = 'P0001', message = 'insufficient_balance';
    end if;

    v_bytes := extensions.gen_random_bytes(4);
    v_roll := get_byte(v_bytes, 0)::bigint * 16777216 + get_byte(v_bytes, 1) * 65536
            + get_byte(v_bytes, 2) * 256 + get_byte(v_bytes, 3);
    v_won := v_roll * 10000 < v_chance::bigint * 4294967296;

    update public.wxs_game g
       set balance = v_balance - p_stake_cents / 100.0
     where g.telegram_id = p_user returning g.balance::numeric into v_balance;
    if v_won then
        update wxs_private.gift_upgrade_quotes set remaining = remaining - 1 where id = p_quote;
    end if;
    insert into wxs_private.gift_upgrade_rounds
        (telegram_id, request_id, quote_id, gift_slug, stake_cents, chance_bp, roll_u32, won, balance_after)
    values
        (p_user, p_request, p_quote, v_quote.gift_slug, p_stake_cents, v_chance, v_roll, v_won, v_balance)
    returning * into v_round;
    return wxs_private.gift_upgrade_result(v_round);
end
$function$;
