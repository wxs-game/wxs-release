# Upgrader outcome policy

The change is server-side: the existing `upgrader_play`, `upgrader_freebet_play`, and `gift_upgrade_play` RPC contracts and the browser animation stay unchanged.

`supabase/migrations/20261115165840_upgrader_rigapp_comeback.sql` was created with `supabase migration new upgrader_rigapp_comeback`. It replaces the two existing private settlement routines and adds private policy functions and state. The migration checks the original settlement source hashes before replacing either routine.

## `/rigapp`

Both cash and gift outcomes read `public.bot_settings.rigapp_limit`. A reward is allowed only when its value and the balance after the stake plus that value are both strictly below the active limit. Equality loses, matching the existing money upgrader. A gift uses its full server quote price, rather than a resale discount. This is a per-round balance/reward limit, not a lifetime winnings limit. The existing exempt account and inactive/malformed-setting behavior are preserved.

## Comeback parameters

The single configuration row is `wxs_private.upgrader_comeback_config`. Defaults:

| Column | Default | Meaning |
| --- | --- | --- |
| `enabled` | `true` | Enable the extra comeback roll |
| `min_losses` | `5` | At least five previous consecutive paid losses |
| `remaining_bp` | `1000` | After the current stake, at most 10% of the balance at the start of the streak remains |
| `max_chance_bp` | `1000` | The selected chance must be at most 10% |
| `trigger_bp` | `1000` | An extra 10% roll after an otherwise losing outcome |
| `cooldown` | `24 hours` | Minimum interval between successful comeback awards |

Basis points use 10,000 = 100%. The extra roll does not guarantee a win. A qualifying 5% round has a 14.5% total chance before `/rigapp` (5% natural + 95% × 10% extra). A successful ordinary win does not consume the comeback cooldown. `/rigapp` remains the final check for every outcome.

Cash and gift rounds share one state row per player. Existing player row locks serialize changes. A balance increase between paid rounds resets the streak. Freebets remain subject to `/rigapp`, but do not trigger or change comeback state. A retry of an existing gift request returns the saved result before evaluating the policy, so it cannot reroll, consume inventory twice, or spend cooldown again. Historical rounds are not backfilled; streak tracking starts with the first new paid round.

The gift's original random roll is retained for audit; the resolved `won` field includes the policy decision. The existing browser animates from `won`, rather than interpreting the raw roll itself.

The new tables have RLS enabled and no client policies or grants. New helpers are security invoker functions, use an empty search path, and revoke execution from `PUBLIC`, `anon`, and `authenticated`. Existing authenticated Telegram RPC wrappers and their grants are retained.

## Verification

```sh
npm ci
npm run check
npm test
```

The site is static and has no bundler build step. `check` validates the existing browser script syntax. Tests execute the actual migration SQL using local PostgreSQL through PGlite with `pgcrypto`. The fixture reproduces relevant production column types and quote/round constraints; the unchanged accounting functions were read from the connected project. RNG overrides exist only inside the isolated test database. Tests exercise cap boundaries, both outcome branches, comeback conditions, shared cooldown, freebets, insufficient funds, request replay, permissions, and rollback. They do not exercise production balance triggers, concurrent sessions, or a real Telegram webview.

## Apply and revert

The migration targets the existing project `nkovsjhwinbbapsqvpnu`; it is not a bootstrap schema for an empty database. Apply it as one transaction using the Supabase migration tool after checking the source hashes. Record its actual server-assigned migration version in the release notes if the management tool assigns a different timestamp.

To disable only the extra comeback mechanic while retaining the gift cap:

```sql
update wxs_private.upgrader_comeback_config set enabled = false where singleton;
```

`database/rollback-upgrader-rigapp-comeback.sql` restores the original two routines and removes only the new policy helpers and state. Execute it in a transaction after checking that those routines have not been changed by a subsequent release. Existing balances, gift quotes, and gift rounds are retained; previous outcomes are not reversed.

## Existing missing gift APIs

The deployed database currently has `gift_upgrade_play`, which stakes cash for a gift. The frontend also references `gift_upgrade_play_gift` and `gift_upgrade_sell`, but neither function exists in the connected database. This migration covers the existing cash-to-gift settlement. Implementing gift-to-gift stakes and resale requires a separate inventory lifecycle; do not add browser-side outcome or balance workarounds.

The pre-change Supabase advisor report also flags existing public `SECURITY DEFINER` RPCs and mutable search paths outside these helpers. Those findings need a separate review: https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable

## Production verification

Applied to `nkovsjhwinbbapsqvpnu` as `20261115171323_upgrader_rigapp_comeback` after explicit user approval of production deployment and public SQL publication. The management tool assigned the server timestamp; the local migration retains its CLI-generated filename.

The deployed money and gift settlement source hashes match the tested migration. Verified enabled configuration, RLS on both new tables, and absence of `anon`/`authenticated` execution grants on all new helpers. A transaction with a synthetic negative identity exercised the state update and 100 crypto rolls, then rolled back without touching any real balance. The existing advisor warning counts did not increase. Two additional informational RLS-without-policy notices are expected because these tables are owner-only: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
