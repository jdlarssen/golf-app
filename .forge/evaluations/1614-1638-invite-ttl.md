# Evaluering: invite-TTL-restanse 1614/1638 — runde 1

Verdikt: **ACCEPT**

Evaluert 2026-08-14 mot `.forge/contracts/1614-1638-invite-ttl-restanse.md`, HEAD 85bc9610, diff mot origin/main.

## Per kriterium

### 1. Alle tre stedene stempler `expires_at` via riktig helper — ✅

Helper-konstantene lest direkte i `lib/auth/inviteExpiry.ts`: `INVITE_TTL_DAYS = 7` (L26) → `inviteExpiresAtFromNow`, `GAME_INVITE_TTL_DAYS = 14` (L45) → `gameInviteExpiresAtFromNow`. Semantikken stemmer per sted:

| Sted | Helper | Semantikk | Evidens |
|---|---|---|---|
| `app/[locale]/invite/actions.ts:112` | `inviteExpiresAtFromNow()` (7d) | venne-invitasjon, ingen game_id | import L8, diff −7d-literal |
| `app/[locale]/signup/[shortId]/teamActions.ts:383` | `inviteExpiresAtFromNow()` (7d) | verdibevarende — 7d beholdt med vilje | import L15, diff −7d-literal |
| `app/[locale]/games/guestPlayerActions.ts:223` | `gameInviteExpiresAtFromNow()` (14d) | spill-invitasjon (`game_id: gameId` i samme insert) | import L11, diff −14d-literal |

Ingen semantisk feilkobling: guestPlayerActions-innsettelsen setter `game_id` → 14d-helperen er riktig; de to andre står på 7d-helperen.

### 2. `grep -rn "7|14 * 24 * 60 * 60 * 1000" app/` → 0 treff — ✅ (med anmerkning)

Literal-grepen gir 7 treff, men **alle er pre-eksisterende på main (urørt av branchen) og ingen er en invitasjons-TTL-stempling i produktkode**:

- `app/[locale]/admin/ActivityLedger.tsx:32` — 14d *tilbakeblikk*-vindu for aktivitetsloggen, ikke invitasjons-TTL (utenfor scope per kontrakt).
- 4 test-fiksturer (`GameForm.test.tsx:12`, `games/new/actions.test.ts:96`, `GameWizard.test.tsx:23`, `edit/actions.test.ts:98`) — spilldato +7d, ikke invitasjoner.
- `inviteToGameActions.test.ts:548–549` — bevisst regel-samsvarstest som asserter TTL ≈ 14d mot helperen (AGENTS.md felle 4 — literalen SKAL stå der som uavhengig kryssjekk).

Kryssverifisert med utvidet grep (`24 \* 60 \* 60 \* 1000` + alle `expires_at`-skrivinger i app/): samtlige produktkode-stemplinger går via helperne — `admin/spillere/actions.ts:84,135`, `inviteToGameActions.ts:236,278`, `invite/actions.ts:112`, `teamActions.ts:383`, `guestPlayerActions.ts:223`. Kriteriets intensjon (null inline invitasjons-TTL i app/) er oppfylt; grep-linjen i kontrakten var uoppnåelig som skrevet allerede ved kontraktsigneringen pga. de pre-eksisterende ikke-invitasjons-treffene.

### 3. Verdibevarende + eget issue for team-attach-diskrepansen — ✅

7d forblir 7d, 14d forblir 14d (ren literal→helper-substitusjon, identiske verdier). Diskrepans-issuet er filet: **#1643 «Team-attach-invitasjoner er game-scoped, men bruker 7-dagers admin-TTL» — OPEN**, referert fra commit-body 73b1fd62.

### 4. Ett commit per issue, `refactor:`-prefix, Refs — ✅

- `73b1fd62` `refactor(auth): adopt inviteExpiresAtFromNow in friend and team-attach flows` — `Refs #1614`, `[no-changelog]`
- `85bc9610` `refactor(games): adopt gameInviteExpiresAtFromNow in guest claim flow` — `Refs #1638`, `[no-changelog]`
- `1f2ff52e` `chore(forge): contract ...` — forventet forge-bokføring, ikke scope-kryp.

### Scope — ✅

Diff = nøyaktig de tre kontraktfilene + kontraktfila (3 × 1-linjes substitusjon + import). Ingen andre filer berørt.

### Gates — ✅

- `npx vitest run "app/[locale]/invite/actions.test.ts" "app/[locale]/signup/[shortId]/teamActions.test.ts"` → **2 filer, 31/31 grønne** (kjørt i denne økten, Node 22).
- `npx tsc --noEmit` → exit 0 (dekker import-/typerisiko i den utestede `guestPlayerActions.ts`).
- VERIFICATION GAP: `npm run build` (kontraktens andre gate) er ikke kjørt av evaluator — tsc-sjekken dekker diff-risikoen (kun imports av eksisterende eksporterte funksjoner), men full build bør stå grønn i CI før merge.

## Konklusjon

Verdibevarende refactor, riktig helper på riktig sted, ingen gjenglemte invitasjons-TTL-literaler i produktkode, diskrepans-issue filet, commits per kontrakt. **ACCEPT.**
