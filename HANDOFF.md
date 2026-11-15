# Upgrader /rigapp and comeback change

## Result

The user approved applying the prepared migration to production Supabase and publishing the server-side SQL in the public `wxs-game/wxs-release` repository.

- Project: `nkovsjhwinbbapsqvpnu`.
- Production migration: `20261115171323_upgrader_rigapp_comeback`, successfully applied.
- Corresponding local migration: `supabase/migrations/20261115165840_upgrader_rigapp_comeback.sql` (the management tool assigned the production timestamp).
- Both deployed settlement function source hashes match the local SQL: money `c65bfd259b17d6f0fb38284218276d00`, gift `e807143a8ecb20b61968b424e4accef2`.
- Shared comeback configuration is enabled: five prior losses, at most 10% balance remaining, selected chance at most 10%, extra 10% roll, 24-hour cooldown.
- Verified private helper grants and table RLS in production. The post-change advisor report has no additional warnings; two informational RLS-without-policy findings correspond to the deliberately private tables.
- A production smoke test exercised state tracking and crypto RNG inside an explicit transaction that was rolled back. No real wager or player balance was used.
- `npm run check` and all 33 local database tests passed, including the rollback script.

## Files and scope

See `database/README.md` for policy details, test commands, and rollback instructions. The browser script and public RPC contracts are unchanged. Existing money and cash-to-gift settlement use the shared policy. Freebets remain subject to `/rigapp` but cannot trigger or track comeback state.

The connected database has no `gift_upgrade_play_gift` or `gift_upgrade_sell` implementation, although the frontend references them. This existing inventory lifecycle gap is outside the change. Real Telegram webview flows and production concurrent wagers were not exercised.

## Repository publication

Publish the approved implementation, tests, rollback, and documentation to `codex/upgrader-rigapp-comeback` and create a pull request against `main`. Production is already updated independently of merging the source PR.
