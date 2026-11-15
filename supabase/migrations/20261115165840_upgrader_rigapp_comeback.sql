-- Refuse to overwrite server changes made after this migration was prepared.
do $$
begin
    if (select md5(prosrc) from pg_proc where oid = 'wxs_private.upgrader_settle(bigint,numeric,integer,uuid)'::regprocedure)
        is distinct from '3d557cf08fba8eb8f3dc85e5c2ac9362'
       or (select md5(prosrc) from pg_proc where oid = 'wxs_private.gift_upgrade_settle(bigint,uuid,uuid,integer)'::regprocedure)
        is distinct from 'e9e789499c4831c8c04097af4194dd52'
    then
        raise exception 'Settlement functions changed: review the migration against the current database';
    end if;
end;
$$;

-- Server-only upgrade policy. Public RPC contracts remain unchanged.
-- Included by the migration. Runtime parameters live in this private singleton.
create table wxs_private.upgrader_comeback_config (
    singleton boolean primary key default true check (singleton),
    enabled boolean not null default true,
    min_losses integer not null default 5 check (min_losses between 1 and 10000),
    remaining_bp integer not null default 1000 check (remaining_bp between 1 and 10000),
    max_chance_bp integer not null default 1000 check (max_chance_bp between 100 and 9000),
    trigger_bp integer not null default 1000 check (trigger_bp between 0 and 10000),
    cooldown interval not null default interval '24 hours' check (cooldown >= interval '0')
);
insert into wxs_private.upgrader_comeback_config(singleton) values (true);
alter table wxs_private.upgrader_comeback_config enable row level security;
revoke all on wxs_private.upgrader_comeback_config from public, anon, authenticated;

create table wxs_private.upgrader_comeback_state (
    telegram_id bigint primary key,
    loss_streak integer not null default 0 check (loss_streak >= 0),
    streak_balance numeric not null check (streak_balance >= 0),
    last_balance numeric not null check (last_balance >= 0),
    last_comeback_at timestamptz
);
alter table wxs_private.upgrader_comeback_state enable row level security;
revoke all on wxs_private.upgrader_comeback_state from public, anon, authenticated;

create function wxs_private.upgrader_win_allowed(p_user bigint, p_balance numeric, p_reward numeric)
returns boolean language plpgsql stable set search_path = '' as $$
declare
    setting text;
    lim numeric;
begin
    -- Preserve the existing /rigapp exemption and strict (< limit) semantics.
    if p_user = 6130985988 then return true; end if;
    select setting_value into setting from public.bot_settings where setting_key = 'rigapp_limit';
    if setting is null or setting in ('off', '0', '') then return true; end if;
    begin
        lim := setting::numeric;
    exception when invalid_text_representation or numeric_value_out_of_range then
        return true;
    end;
    if lim <= 0 or lim = 'NaN'::numeric then return true; end if;
    return p_balance + p_reward < lim and p_reward < lim;
end;
$$;
revoke all on function wxs_private.upgrader_win_allowed(bigint, numeric, numeric) from public, anon, authenticated;

create function wxs_private.upgrader_random_bp()
returns integer language plpgsql volatile set search_path = '' as $$
declare v_roll bigint;
begin
    loop
        v_roll := ('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint;
        exit when v_roll < 4294960000;
    end loop;
    return (v_roll % 10000)::integer;
end;
$$;
revoke all on function wxs_private.upgrader_random_bp() from public, anon, authenticated;

create function wxs_private.upgrader_resolve_outcome(
    p_user bigint, p_before numeric, p_after_stake numeric, p_reward numeric,
    p_chance_bp integer, p_natural_win boolean, p_cash_reward boolean, p_track boolean
)
returns boolean language plpgsql volatile set search_path = '' as $$
declare
    cfg wxs_private.upgrader_comeback_config%rowtype;
    state wxs_private.upgrader_comeback_state%rowtype;
    won boolean := p_natural_win;
    boosted boolean := false;
begin
    -- Callers already hold the player row lock; both modes use the same state.
    if p_track then
        insert into wxs_private.upgrader_comeback_state(telegram_id, streak_balance, last_balance)
        values (p_user, p_before, p_before) on conflict (telegram_id) do nothing;
        select * into state from wxs_private.upgrader_comeback_state
        where telegram_id = p_user for update;
        -- A refill or a win elsewhere starts a fresh losing streak.
        if p_before > state.last_balance + 0.000001 then
            state.loss_streak := 0;
            state.streak_balance := p_before;
        end if;
        if state.loss_streak = 0 then state.streak_balance := p_before; end if;
        select * into cfg from wxs_private.upgrader_comeback_config where singleton;
        if not won and cfg.enabled
            and state.loss_streak >= cfg.min_losses
            and p_chance_bp between 100 and cfg.max_chance_bp
            and state.streak_balance > 0
            and p_after_stake * 10000 <= state.streak_balance * cfg.remaining_bp
            and (state.last_comeback_at is null or state.last_comeback_at <= now() - cfg.cooldown)
            and wxs_private.upgrader_win_allowed(p_user, p_after_stake, p_reward)
        then
            boosted := wxs_private.upgrader_random_bp() < cfg.trigger_bp;
            won := boosted;
        end if;
    end if;

    -- /rigapp is always the final decision, including natural and comeback wins.
    won := won and wxs_private.upgrader_win_allowed(p_user, p_after_stake, p_reward);
    if p_track then
        update wxs_private.upgrader_comeback_state
        set loss_streak = case when won then 0 else least(state.loss_streak, 999999) + 1 end,
            streak_balance = state.streak_balance,
            last_balance = p_after_stake + case when won and p_cash_reward then p_reward else 0 end,
            last_comeback_at = case when won and boosted then now() else state.last_comeback_at end
        where telegram_id = p_user;
    end if;
    return won;
end;
$$;
revoke all on function wxs_private.upgrader_resolve_outcome(bigint, numeric, numeric, numeric, integer, boolean, boolean, boolean)
from public, anon, authenticated;

CREATE OR REPLACE FUNCTION wxs_private.upgrader_settle(uid bigint, bet numeric, chance integer, fb_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare bal numeric; coef numeric; gross numeric; credit numeric; roll bigint; won boolean; before_balance numeric;
begin
    if chance is null or chance < 1 or chance > 90 then raise exception 'Шанс должен быть 1–90%%'; end if;
    perform pg_advisory_xact_lock(uid);
    select balance into bal from public.wxs_game where telegram_id=uid for update;
    if not found then raise exception 'Профиль не найден'; end if;
    before_balance := bal;
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
    won := wxs_private.upgrader_resolve_outcome(
        uid, before_balance, bal, credit, chance * 100, won, true, fb_id is null);
    if won then bal := public.resolve_win(uid,credit,round(coef,2)); else credit := 0; end if;
    insert into public.release_activity(telegram_id) values(uid)
        on conflict(telegram_id) do update set last_seen_at=now();
    return jsonb_build_object('ok',true,'win',won,'payout',credit,'gross_payout',case when won then gross else 0 end,
        'coef',round(coef,2),'balance',bal,'freebet',fb_id is not null);
end $function$
;
CREATE OR REPLACE FUNCTION wxs_private.gift_upgrade_settle(p_user bigint, p_request uuid, p_quote uuid, p_stake_cents integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
    v_quote wxs_private.gift_upgrade_quotes%rowtype;
    v_round wxs_private.gift_upgrade_rounds%rowtype;
    v_balance numeric;
    v_before_balance numeric;
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

    v_before_balance := v_balance;
    v_bytes := extensions.gen_random_bytes(4);
    v_roll := get_byte(v_bytes, 0)::bigint * 16777216 + get_byte(v_bytes, 1) * 65536
            + get_byte(v_bytes, 2) * 256 + get_byte(v_bytes, 3);
    v_won := v_roll * 10000 < v_chance::bigint * 4294967296;

    update public.wxs_game g
       set balance = v_balance - p_stake_cents / 100.0
     where g.telegram_id = p_user returning g.balance::numeric into v_balance;
    v_won := wxs_private.upgrader_resolve_outcome(
        p_user, v_before_balance, v_balance, v_quote.price_cents / 100.0,
        v_chance, v_won, false, true);
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
$function$
;
