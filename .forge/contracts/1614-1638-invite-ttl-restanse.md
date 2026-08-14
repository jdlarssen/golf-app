# Kontrakt #1614 + #1638 — inline invitasjons-TTL-er adopterer inviteExpiry-helperne

**Issues:** #1614, #1638 · **Branch:** `claude/1614-1638-invite-ttl` · **Type:** refactor

## Mål

TTL-regelen «invitasjon varer N dager» skal ha ett hjem (`lib/auth/inviteExpiry.ts`,
AGENTS.md felle 4). #1381 og #1613 samlet admin- (7d) og spill-invitasjonene (14d) der;
tre inline-literaler står igjen. Bytt dem med helper-kall — verdibevarende, null
adferdsendring.

## Drift-tabell (issue-påstander vs HEAD 2026-08-14)

| Sted | Issue sier | HEAD | Handling |
|---|---|---|---|
| `app/[locale]/invite/actions.ts:111` | inline 7d | BEKREFTET | → `inviteExpiresAtFromNow()` |
| `app/[locale]/signup/[shortId]/teamActions.ts:382` | inline 7d | BEKREFTET (brukes i invitations-insert L486) | → `inviteExpiresAtFromNow()` |
| `app/[locale]/admin/games/[id]/inviteToGameActions.ts:248` | inline 14d («avklar ved samling») | ALLEREDE FIKSET av #1613 (L236/278) | ingen — avklaringen er besvart: 14d er bevisst egen konstant (`GAME_INVITE_TTL_DAYS`) |
| `app/[locale]/games/guestPlayerActions.ts:222` (#1638) | inline 14d | BEKREFTET | → `gameInviteExpiresAtFromNow()` |

## Suksesskriterier

- [ ] Alle tre stedene stempler `expires_at` via riktig helper; import fra
  `@/lib/auth/inviteExpiry`.
- [ ] `grep -rn "7 \* 24 \* 60 \* 60 \* 1000\|14 \* 24 \* 60 \* 60 \* 1000" app/` → 0 treff.
- [ ] Verdibevarende: teamActions beholder 7d (game-scoped-vs-7d-spørsmålet løftes som
  EGET issue, ikke endres her).
- [ ] Ett commit per issue (`Refs #1614` / `Refs #1638`), prefix `refactor:`.

## Gates

- `npx vitest run "app/[locale]/invite/actions.test.ts" "app/[locale]/signup/[shortId]/teamActions.test.ts"`
  (ingen av dem asserter TTL-lengde — verifisert grep; guestPlayerActions har ingen
  co-located test).
- `npm run build` på branchen.

## Antagelser

- ASSUMPTION: guestPlayerActions-raden ER en spill-invitasjon (game_id settes) → 14d-
  helperen er semantisk riktig, identisk verdi med dagens inline.
- ASSUMPTION: team-attach (game_id settes, men 7d i dag) holdes på 7d fordi refactor ikke
  endrer adferd; diskrepansen files som nytt issue før merge (CLAUDE.md §Nye funn).

## Utenfor scope

- Endre noen TTL-verdi. Rate-limit/kvote-logikk. Mail-innhold.
