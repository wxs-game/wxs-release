begin;

create table wxs_private.voxel_mine_worlds (
    telegram_id bigint primary key references public.wxs_game(telegram_id) on delete cascade,
    world_seed integer not null check (world_seed between 0 and 65520),
    secret bytea not null check (octet_length(secret) = 32)
);

create table wxs_private.voxel_mine_digs (
    telegram_id bigint not null references wxs_private.voxel_mine_worlds(telegram_id) on delete cascade,
    cell integer not null check (cell between 0 and 19999),
    nonce uuid not null,
    receipt jsonb not null,
    primary key (telegram_id, cell),
    unique (telegram_id, nonce)
);

alter table wxs_private.voxel_mine_worlds enable row level security;
alter table wxs_private.voxel_mine_digs enable row level security;
revoke all on wxs_private.voxel_mine_worlds, wxs_private.voxel_mine_digs from public, anon, authenticated;

-- Keep terrain and ore selection identical to minecraft/src/world.js.
create function wxs_private.voxel_mine_price(p_cell integer, p_world_seed integer)
returns numeric
language plpgsql immutable strict
set search_path = ''
as $$
declare
    x integer := p_cell % 20;
    z integer := (p_cell / 20) % 20;
    d integer := p_cell / 400 + 1;
    basin integer := least(x, 19 - x, z, 19 - z, greatest(0, 16 - z), greatest(0, z - 2));
    empty_depth integer := case when basin < 1 then 0 when basin < 2 then 1 when basin < 4 then 2 when basin < 6 then 4 else 6 end;
    n bigint := (p_cell * 379::bigint + p_world_seed * 527::bigint) % 65521;
    roll bigint := (n * (n + 17) + 1319) % 1000;
    prices numeric[] := array[0.10, 0.15, 0.25, 0.50, 0.65, 0.75, 1.00];
begin
    if p_cell < 0 or p_cell > 19999 then return null; end if;
    if d = 3 and z = 13 and x between 6 and 12 then return prices[x - 5]; end if;
    if d = 2 and z = 15 and x between 8 and 12 then
        return prices[(array[3, 2, 1, 4, 7])[x - 7]];
    end if;
    if d <= empty_depth + 1 or roll >= 95 then return null; end if;
    return case
        when roll < 8 then case when d > 7 then 1.00 else 0.25 end
        when roll < 17 then case when d > 6 then 0.75 else 0.15 end
        when roll < 27 then case when d > 5 then 0.65 else 0.25 end
        when roll < 38 then 0.50
        when roll < 55 then 0.25
        when roll < 75 then 0.15
        else 0.10
    end;
end;
$$;

create function wxs_private.voxel_mine_ticket(p_secret bytea, p_nonce uuid)
returns integer
language plpgsql immutable strict
set search_path = ''
as $$
declare
    hashed bytea := extensions.digest(convert_to(encode(p_secret, 'hex') || ':' || p_nonce::text, 'UTF8'), 'sha256');
    n bigint;
begin
    loop
        n := get_byte(hashed, 0)::bigint * 16777216 + get_byte(hashed, 1) * 65536
            + get_byte(hashed, 2) * 256 + get_byte(hashed, 3);
        if n < 4294967280 then return (n % 40)::integer; end if;
        hashed := extensions.digest(hashed, 'sha256');
    end loop;
end;
$$;

create function wxs_private.voxel_mine_multiplier(ticket integer)
returns numeric
language sql immutable strict
set search_path = ''
as $$
    select case when ticket < 4 then 0 when ticket < 12 then 0.70 when ticket < 24 then 1.00
        when ticket < 36 then 1.40 else 1.15 end;
$$;

revoke all on function wxs_private.voxel_mine_price(integer, integer),
    wxs_private.voxel_mine_ticket(bytea, uuid), wxs_private.voxel_mine_multiplier(integer)
    from public, anon, authenticated;

create function public.wxs_voxel_mine(
    p_init text,
    p_action text,
    p_cell integer default null,
    p_nonce uuid default null,
    p_commitment text default null
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
    uid bigint := (wxs_private.antitwink_identity(p_init, true)->>'id')::bigint;
    world wxs_private.voxel_mine_worlds%rowtype;
    prior wxs_private.voxel_mine_digs%rowtype;
    available numeric;
    price numeric;
    ticket integer;
    multiplier numeric;
    payout numeric;
    next_secret bytea;
    commitment text;
    answer jsonb;
begin
    if uid is distinct from 6130985988 then
        raise exception using errcode = '42501', message = 'wxs_voxel_access';
    end if;
    if exists (select 1 from wxs_private.app_blocked_users where telegram_id = uid) then
        raise exception using errcode = '42501', message = 'wxs_app_blocked';
    end if;
    perform wxs_private.antitwink_require(uid);
    if p_action is null or p_action not in ('open', 'dig') then
        raise exception using errcode = '22023', message = 'wxs_voxel_action';
    end if;

    perform pg_advisory_xact_lock(uid);
    select coalesce(balance, 0)::numeric into available from public.wxs_game where telegram_id = uid for update;
    if not found then raise exception using errcode = '42501', message = 'wxs_voxel_profile_required'; end if;
    select * into world from wxs_private.voxel_mine_worlds where telegram_id = uid for update;
    if not found then
        if p_action <> 'open' then raise exception using errcode = '22023', message = 'wxs_voxel_open_required'; end if;
        insert into wxs_private.voxel_mine_worlds (telegram_id, world_seed, secret)
        values (uid, (random() * 65520)::integer, extensions.gen_random_bytes(32)) returning * into world;
    end if;
    commitment := encode(extensions.digest(world.secret, 'sha256'), 'hex');

    if p_action = 'open' then
        return jsonb_build_object('world_seed', world.world_seed, 'balance', available, 'commitment', commitment,
            'removed', coalesce((select jsonb_agg(cell order by cell) from wxs_private.voxel_mine_digs where telegram_id = uid), '[]'::jsonb));
    end if;

    if p_cell is null or p_cell not between 0 and 19999 or p_nonce is null
        or p_commitment is null or p_commitment !~ '^[a-f0-9]{64}$' then
        raise exception using errcode = '22023', message = 'wxs_voxel_input';
    end if;
    select * into prior from wxs_private.voxel_mine_digs where telegram_id = uid and nonce = p_nonce;
    if found then
        if prior.cell <> p_cell or (prior.receipt->>'commitment') is distinct from p_commitment then
            raise exception using errcode = '22023', message = 'wxs_voxel_nonce';
        end if;
        return prior.receipt || jsonb_build_object('balance', available, 'next_commitment', commitment);
    end if;
    if exists (select 1 from wxs_private.voxel_mine_digs where telegram_id = uid and cell = p_cell) then
        return jsonb_build_object('status', 'depleted', 'balance', available, 'commitment', commitment);
    end if;
    if p_commitment <> commitment then
        return jsonb_build_object('status', 'changed', 'balance', available, 'commitment', commitment);
    end if;

    price := wxs_private.voxel_mine_price(p_cell, world.world_seed);
    if price is null then raise exception using errcode = '22023', message = 'wxs_voxel_not_ore'; end if;
    if available < price then return jsonb_build_object('status', 'funds', 'balance', available); end if;

    available := public.place_bet(uid, price, 'Шахта');
    ticket := wxs_private.voxel_mine_ticket(world.secret, p_nonce);
    multiplier := wxs_private.voxel_mine_multiplier(ticket);
    payout := price * multiplier;
    if payout > 0 then available := public.resolve_win(uid, payout, multiplier); end if;
    perform wxs_private.wager_progress(uid, price, payout);
    next_secret := extensions.gen_random_bytes(32);
    update wxs_private.voxel_mine_worlds set secret = next_secret where telegram_id = uid;

    answer := jsonb_build_object(
        'status', 'ok', 'balance', available, 'payout', payout, 'multiplier', multiplier, 'ticket', ticket,
        'seed', encode(world.secret, 'hex'), 'commitment', commitment, 'nonce', p_nonce,
        'next_commitment', encode(extensions.digest(next_secret, 'sha256'), 'hex')
    );
    insert into wxs_private.voxel_mine_digs (telegram_id, cell, nonce, receipt) values (uid, p_cell, p_nonce, answer);
    return answer;
end;
$$;

revoke all on function public.wxs_voxel_mine(text, text, integer, uuid, text) from public, anon, authenticated;
grant execute on function public.wxs_voxel_mine(text, text, integer, uuid, text) to anon, authenticated;

commit;
