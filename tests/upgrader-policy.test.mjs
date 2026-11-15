import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const db = new PGlite({ extensions: { pgcrypto } });
const user = 9000000001;
const quote = randomUUID();
const sqlFile = async (path) => readFile(new URL(path, import.meta.url), 'utf8');
const query = async (sql, args = []) => (await db.query(sql, args)).rows;
const scalar = async (sql, args = []) => Object.values((await query(sql, args))[0])[0];

before(async () => {
    await db.exec(await sqlFile('./upgrader-fixture.sql'));
    await db.exec(await sqlFile('../database/accounting-fixture.sql'));
    const migrations = await readdir(new URL('../supabase/migrations/', import.meta.url));
    for (const migration of migrations.sort()) await db.exec(await sqlFile('../supabase/migrations/' + migration));
});
after(async () => db.close());

async function reset({ balance = 10, losses = 5, anchor = 100, limit = 'off', naturalWin = false } = {}) {
    await db.exec(`truncate public.wxs_game, public.bot_settings, public.upgrader_freebets,
        public.release_activity, wxs_private.upgrader_comeback_state,
        wxs_private.gift_upgrade_rounds, wxs_private.gift_upgrade_quotes;
        update wxs_private.upgrader_comeback_config set enabled = true, min_losses = 5,
            remaining_bp = 1000, max_chance_bp = 1000, trigger_bp = 10000, cooldown = interval '24 hours';`);
    await query('insert into public.wxs_game(telegram_id, balance) values ($1, $2)', [user, balance]);
    await query('insert into public.bot_settings values ($1, $2)', ['rigapp_limit', limit]);
    await query(`insert into wxs_private.upgrader_comeback_state(telegram_id, loss_streak, streak_balance, last_balance)
        values ($1, $2, $3, $4)`, [user, losses, anchor, balance]);
    await query(`insert into wxs_private.gift_upgrade_quotes(id, gift_slug, price_cents, remaining, enabled, expires_at)
        values ($1, 'testgift', 10000, 10, true, now() + interval '1 day')`, [quote]);
    // Only the isolated test database replaces RNG to exercise both branches reliably.
    await db.exec(`create or replace function extensions.gen_random_bytes(integer) returns bytea
        language sql volatile as $$ select decode('${naturalWin ? '00000000' : '80000063'}', 'hex') $$;
        create or replace function wxs_private.upgrader_random_bp() returns integer
        language sql volatile set search_path = '' as $$ select 0 $$;`);
}

const money = (bet = 5, chance = 5, freebet = null) => scalar(
    'select wxs_private.upgrader_settle($1::bigint, $2::numeric, $3::integer, $4::uuid)',
    [user, bet, chance, freebet]);
const gift = (request = randomUUID(), stake = 500) => scalar(
    'select wxs_private.gift_upgrade_settle($1::bigint, $2::uuid, $3::uuid, $4::integer)',
    [user, request, quote, stake]);
const state = async () => (await query('select * from wxs_private.upgrader_comeback_state where telegram_id = $1', [user]))[0];

test('crypto helper returns basis points within range before test RNG overrides', async () => {
    const rows = await query('select wxs_private.upgrader_random_bp() as roll from generate_series(1, 1000)');
    assert.ok(rows.every(({ roll }) => Number.isInteger(roll) && roll >= 0 && roll < 10000));
    assert.ok(new Set(rows.map(({ roll }) => roll)).size > 1);
});

test('default comeback parameters match the proposed configuration', async () => {
    const [cfg] = await query('select * from wxs_private.upgrader_comeback_config');
    assert.equal(cfg.min_losses, 5);
    assert.equal(cfg.remaining_bp, 1000);
    assert.equal(cfg.max_chance_bp, 1000);
    assert.equal(cfg.trigger_bp, 1000);
    assert.equal(await scalar('select extract(epoch from cooldown)::integer from wxs_private.upgrader_comeback_config'), 86400);
});

test('money comeback credits the normal payout and records cooldown', async () => {
    await reset();
    const result = await money();
    assert.equal(result.win, true);
    assert.equal(result.payout, 95);
    assert.equal(result.balance, 100);
    assert.equal((await state()).loss_streak, 0);
    assert.ok((await state()).last_comeback_at);
    assert.equal(await scalar('select bets_count from public.wxs_game'), 1);
});

test('gift comeback awards one gift without cash credit', async () => {
    await reset();
    const result = await gift();
    assert.equal(result.won, true);
    assert.equal(result.balance, 5);
    assert.equal(await scalar('select remaining from wxs_private.gift_upgrade_quotes'), 9);
    assert.equal((await state()).loss_streak, 0);
    assert.ok((await state()).last_comeback_at);
});

for (const [label, limit, expected] of [['reward equal', '95', false], ['balance equal', '100', false], ['below limit', '100.01', true]]) {
    test(`money /rigapp: ${label}`, async () => {
        await reset({ limit });
        const result = await money();
        assert.equal(result.win, expected);
        assert.equal(result.balance, expected ? 100 : 5);
        assert.equal(Boolean((await state()).last_comeback_at), expected);
    });
}
for (const [label, limit, expected] of [['gift equal', '100', false], ['balance plus gift equal', '105', false], ['below limit', '105.01', true]]) {
    test(`gift /rigapp: ${label}`, async () => {
        await reset({ limit });
        const result = await gift();
        assert.equal(result.won, expected);
        assert.equal(result.balance, 5);
        assert.equal(await scalar('select remaining from wxs_private.gift_upgrade_quotes'), expected ? 9 : 10);
        assert.equal(Boolean((await state()).last_comeback_at), expected);
    });
}

test('natural wins also obey /rigapp in both modes', async () => {
    await reset({ limit: '95', naturalWin: true });
    assert.equal((await money()).win, false);
    await reset({ limit: '100', naturalWin: true });
    assert.equal((await gift()).won, false);
});

test('existing exempt account keeps /rigapp exemption', async () => {
    await reset({ limit: '1' });
    assert.equal(await scalar('select wxs_private.upgrader_win_allowed(6130985988, 100, 100)'), true);
    assert.equal(await scalar('select wxs_private.upgrader_win_allowed(9000000001, 100, 100)'), false);
});

for (const limit of ['off', '0', '', 'broken', '-1', 'NaN']) {
    test(`existing inactive /rigapp value ${JSON.stringify(limit)} stays inactive`, async () => {
        await reset({ limit });
        assert.equal((await gift()).won, true);
    });
}

test('five prior losses are required', async () => {
    await reset({ losses: 4 });
    assert.equal((await money()).win, false);
    assert.equal((await state()).loss_streak, 5);
});

test('remaining balance must be at most 10% of the streak balance', async () => {
    await reset({ balance: 20 });
    assert.equal((await money()).win, false);
});

test('10% remaining boundary is inclusive', async () => {
    await reset({ balance: 15 });
    assert.equal((await money()).win, true);
});

test('chances greater than 10% cannot trigger a comeback', async () => {
    await reset();
    assert.equal((await money(5, 11)).win, false);
});

test('10% chance boundary is inclusive', async () => {
    await reset();
    assert.equal((await money(5, 10)).win, true);
});

test('cooldown applies across money and gifts', async () => {
    await reset();
    assert.equal((await gift()).won, true);
    await query('update wxs_private.upgrader_comeback_state set loss_streak = 5, streak_balance = 100');
    assert.equal((await money(1, 5)).win, false);
    await query("update wxs_private.upgrader_comeback_state set loss_streak = 5, last_comeback_at = now() - interval '25 hours'");
    assert.equal((await money(1, 5)).win, true);
});

test('a refill resets the streak', async () => {
    await reset();
    await query('update wxs_private.upgrader_comeback_state set last_balance = 1');
    assert.equal((await money()).win, false);
    assert.equal((await state()).loss_streak, 1);
    assert.equal(Number((await state()).streak_balance), 10);
});

test('comeback can be disabled or miss its additional roll', async () => {
    await reset();
    await db.exec('update wxs_private.upgrader_comeback_config set enabled = false');
    assert.equal((await money()).win, false);
    await reset();
    await db.exec('update wxs_private.upgrader_comeback_config set trigger_bp = 0');
    assert.equal((await gift()).won, false);
});

test('natural wins reset the streak without consuming comeback cooldown', async () => {
    await reset({ naturalWin: true });
    assert.equal((await money()).win, true);
    assert.equal((await state()).loss_streak, 0);
    assert.equal((await state()).last_comeback_at, null);
});

test('freebets cannot trigger or alter comeback state', async () => {
    await reset();
    const [fb] = await query('insert into public.upgrader_freebets(telegram_id, amount) values ($1, 5) returning id', [user]);
    const beforeState = await state();
    assert.equal((await money(5, 5, fb.id)).win, false);
    assert.deepEqual(await state(), beforeState);
    assert.equal(await scalar('select balance from public.wxs_game'), 10);
    assert.equal(await scalar('select status from public.upgrader_freebets'), 'used');
    await assert.rejects(money(5, 5, fb.id), /Фрибет/);
});

test('freebet /rigapp uses profit, including the existing balance', async () => {
    await reset({ naturalWin: true, limit: '100' });
    let [fb] = await query('insert into public.upgrader_freebets(telegram_id, amount) values ($1, 5) returning id', [user]);
    assert.equal((await money(5, 5, fb.id)).win, false);
    await reset({ naturalWin: true, limit: '100.01' });
    [fb] = await query('insert into public.upgrader_freebets(telegram_id, amount) values ($1, 5) returning id', [user]);
    const result = await money(5, 5, fb.id);
    assert.equal(result.win, true);
    assert.equal(result.payout, 90);
    assert.equal(result.balance, 100);
});

test('gift retry returns the stored outcome without a second stake or state update', async () => {
    await reset();
    const request = randomUUID();
    const first = await gift(request);
    const beforeState = await state();
    await query("update public.bot_settings set setting_value = '1'");
    const retry = await gift(request);
    assert.deepEqual(retry, first);
    assert.deepEqual(await state(), beforeState);
    assert.equal(await scalar('select balance from public.wxs_game'), 5);
    assert.equal(await scalar('select remaining from wxs_private.gift_upgrade_quotes'), 9);
    await assert.rejects(gift(request, 600), /request_conflict/);
});

test('invalid/expired/unfunded rounds do not modify balances or comeback state', async () => {
    await reset();
    const beforeState = await state();
    await assert.rejects(money(100, 5), /Недостаточно/);
    await assert.rejects(money(5, 0), /Шанс/);
    await assert.rejects(gift(randomUUID(), 1100), /insufficient_balance/);
    await query("update wxs_private.gift_upgrade_quotes set expires_at = now() - interval '1 minute'");
    await assert.rejects(gift(), /gift_unavailable/);
    assert.deepEqual(await state(), beforeState);
    assert.equal(await scalar('select balance from public.wxs_game'), 10);
    assert.equal(await scalar('select count(*)::integer from wxs_private.gift_upgrade_rounds'), 0);
});

test('new state and policy are private and protected by RLS', async () => {
    const tables = await query(`select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'wxs_private' and c.relname in ('upgrader_comeback_config', 'upgrader_comeback_state')`);
    assert.equal(tables.length, 2);
    assert.ok(tables.every(({ relrowsecurity }) => relrowsecurity));
    for (const role of ['anon', 'authenticated']) {
        assert.equal(await scalar(`select has_table_privilege($1, 'wxs_private.upgrader_comeback_state', 'select')`, [role]), false);
        assert.equal(await scalar(`select has_table_privilege($1, 'wxs_private.upgrader_comeback_config', 'update')`, [role]), false);
        const permissions = await query(`select has_function_privilege($1, p.oid, 'execute') as allowed
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'wxs_private' and p.proname in ('upgrader_resolve_outcome', 'upgrader_win_allowed', 'upgrader_random_bp')`, [role]);
        assert.equal(permissions.length, 3);
        assert.ok(permissions.every(({ allowed }) => !allowed));
    }
});

test('rollback restores the original settlement functions and removes only new policy objects', async () => {
    await db.exec(await sqlFile('../database/rollback-upgrader-rigapp-comeback.sql'));
    assert.equal(await scalar("select to_regclass('wxs_private.upgrader_comeback_state')"), null);
    assert.equal(await scalar("select to_regclass('wxs_private.upgrader_comeback_config')"), null);
    assert.equal(await scalar("select position('upgrader_resolve_outcome' in pg_get_functiondef('wxs_private.upgrader_settle(bigint,numeric,integer,uuid)'::regprocedure))"), 0);
    assert.equal(await scalar("select position('upgrader_resolve_outcome' in pg_get_functiondef('wxs_private.gift_upgrade_settle(bigint,uuid,uuid,integer)'::regprocedure))"), 0);
});
