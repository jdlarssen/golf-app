# Spec: Atomisk (kompensert) roster-bytte i edit-flyten

**Issue:** [#907](https://github.com/jdlarssen/golf-app/issues/907) — `bug, area:admin`
**Branch:** `claude/dazzling-robinson-946c3d`
**Bump:** `fix` → patch, CHANGELOG nestet under åpen `## 1.140.y`.

## Kontekst

`updateGameInternal` ([edit/actions.ts:224-254](app/[locale]/admin/games/[id]/edit/actions.ts#L224)) bytter roster med **delete-så-insert** etter at `games.update` har committet:

```
1. games.update         committer (status → scheduled ved publish)
2. game_players.delete   rosteret er nå TOMT
3. game_players.insert   feiler → redirect ?error=db_players, INGEN rollback
```

Feiler insert-en sitter spillet igjen publisert/scheduled **uten spillere** (AGENTS.md felle #5). Søsken-flyten `createGameInternal` fikk kompenserende rollback i #737 (sletter game-raden ved insert-feil) — edit-flytens wholesale-replace ble aldri gitt samme behandling.

## Design (kompenserende rollback — speiler #737)

Valgt tilnærming: **snapshot + re-insert ved feil**, ikke en SECURITY DEFINER RPC. Begrunnelse: #737 (søsken) brukte kompensasjon, ikke RPC; sannsynlighet er lav (insert må feile etter vellykket delete) og tilstanden er gjenopprettelig; ingen migrasjon holder risikoen nede (felle #3-flate uendret). `game_players` har ingen auto-generert `id`/`created_at` (komposit-PK `(game_id, user_id)`), så et `select('*')`-snapshot kan re-inserter ordrett.

1. **Utvid snapshot:** linje 212 `select('user_id')` → `select('*')`. Behold samme query (kun én round-trip): `priorRosterIds` (notify-diff) utledes fra de fulle radene; de fulle radene er rollback-snapshotet.
2. **Rollback ved insert-feil:** i `if (insertError)`-grenen (linje 250), re-insert snapshot-radene før redirect. Logg hvis re-insert OGSÅ feiler (dobbel-feil → vi har gjort det vi kan; rosteret er fortsatt tomt, men det er logget). Redirect uendret (`?error=db_players`).
3. **Delete-feil** (linje 228) trenger ingen rollback — feilet delete betyr roster uendret.

Notify-logikken og alt annet er uendret.

## Suksesskriterier

- [ ] `priorRoster`-snapshot henter alle kolonner (`select('*')`), og `priorRosterIds` utledes fra samme resultat (ingen ekstra query).
- [ ] Ved `insertError`: snapshot-radene re-insertes (rosteret gjenopprettes), re-insert-feil logges, redirect er fortsatt `?error=db_players`.
- [ ] Eksisterende tester (mode-lock, notify-diff, creator-gate) forblir grønne (snapshot-utvidelsen er bakoverkompatibel — de leser `user_id` fra radene som før).
- [ ] Ny test: games.update ok → delete ok → insert FEILER → assert at en andre `game_players.insert` (rollback) kalles med snapshot-radene, og redirect = `db_players`. Bruk `__fromCalls` for å verifisere rollback-inserten.
- [ ] Bump + CHANGELOG i samme commit (fix → patch).

## Gates

- `npx tsc --noEmit`
- `npx eslint "app/[locale]/admin/games/[id]/edit/actions.ts" "app/[locale]/admin/games/[id]/edit/actions.test.ts"`
- `npx vitest run "app/[locale]/admin/games/[id]/edit/actions.test.ts"`
- Staging: lav verdi (feil-stien er vanskelig å trigge ende-til-ende; dekkes av unit-test). Verifiser at happy-path-edit fortsatt fungerer hvis tid.

## Utenfor scope

- Ekte transaksjonell atomisitet for `games.update` + roster (større restrukturering; issuet scoper kun roster-delete+insert).
- SECURITY DEFINER RPC-tilnærmingen (vurdert, valgt bort — se Design).
- Andre wholesale-replace-flyter.
