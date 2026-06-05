# Forge-kontrakt: Scope getNewGameFormData() so non-admin create/edit doesn't leak co-player e-postadresser

**Issue:** [#435](https://github.com/jdlarssen/golf-app/issues/435)
**Branch:** `claude/jolly-pike-0f937b`
**Milestone:** Backlog — uplanlagt / scale-triggered
**Type:** security (privacy) · area:admin

---

## Bakgrunn & korrigering av premisset

`getNewGameFormData()` ([`lib/games/newGameFormData.ts`](../../lib/games/newGameFormData.ts)) selecter
`email` for hver bruker i spiller-rosteren og sender den til den klient-rendrede
`GameWizard`/`GameForm`. Spiller-velgeren trenger ikke e-post — den viser
navn/nickname + handicap.

**Verifisert RLS-tilstand (viktig korrigering av issue-teksten).** SELECT-policyen på
`public.users` er:

```sql
(id = auth.uid())            -- egen rad
OR is_admin()                -- admin ser alle
OR EXISTS (                  -- folk du deler et spill med
  game_players gp1 JOIN game_players gp2 ON gp1.game_id = gp2.game_id
  WHERE gp1.user_id = auth.uid() AND gp2.user_id = users.id)
```

En **ikke-admin får altså IKKE hele `users`-tabellen** — RLS begrenser rosteren til
seg selv + alle hen har delt et spill med. Den reelle lekkasjen er **medspilleres
e-postadresser** i side-payloaden, ikke hele medlemslista. Fortsatt en reell lekkasje
velgeren ikke trenger, og «scale-triggered»-rammen holder: medspiller-grafen vokser med
klubb-størrelse (Tier 5, #364 åpen selv-registrering).

Fiks-retningen fra issuet står: en e-post-fri roster-variant for ikke-admin-flatene.
RLS-kolonne-herding (view/column-grant) er bevisst **utenfor scope** — issuet valgte
app-laget; en evt. DB-lag-herding er et separat funn.

## Beslutninger fra gray-area-diskusjon

1. **Pending-spillere (uten fullført profil, ingen `name`)** vises i dag med `email`
   som velger-etikett. I den e-post-frie varianten beholdes de **synlige med en
   nøytral placeholder-etikett «Invitert spiller»** (ikke ekskludert). Grunn:
   ekskludering ville få en allerede-valgt pending medspiller sin chip til å forsvinne
   i `/games/[id]/rediger`.
2. **Scope: begge ikke-admin-flatene** får e-post-fri variant:
   `/opprett-spill` (create) **og** `/games/[id]/rediger` (ikke-admin edit, #428).
   `/admin/games/new` beholder full roster (allerede admin-gated).

## Tilnærming

- `getNewGameFormData(includeEmail = true)` — **primitiv boolean-arg** (ikke options-objekt),
  så React `cache` deduper på verdi. `/opprett-spill` kaller den to ganger (PlayerShortageBanner
  + GameFormBody) i samme request; med `(false)` treffer begge samme cache-entry. Et options-objekt-
  literal ville gitt ny identitet per kall → dobbelt-fetch.
- Når `includeEmail === false`: users-`.select(...)`-strengen **utelater `email`-kolonnen helt**
  (lekkasjen fikses på data-laget — e-post når aldri RSC-payloaden), og `email`-nøkkelen utelates
  fra `PlayerOption`.
- `PlayerOption.email` blir **optional** (`email?: string`).
- Klient-konsumenter som bruker `p.email` som etikett-fallback eller søke-haystack håndterer
  fraværende e-post via en delt konstant `PENDING_PLAYER_LABEL = 'Invitert spiller'`.

## Filer som endres

| Fil | Endring |
|-----|---------|
| `lib/games/newGameFormData.ts` | `getNewGameFormData(includeEmail = true)`; betinget users-select + betinget `email` i mapping; `UserRow.email` optional |
| `app/admin/games/new/GameForm.tsx` | `PlayerOption.email` → `email?: string` (m/ kommentar) |
| `app/admin/games/new/playerDisplay.ts` (ny) | `export const PENDING_PLAYER_LABEL = 'Invitert spiller'` |
| `app/admin/games/new/sections/PlayersSection.tsx` | `playerLabel`/`shortName`: `p.email` → `p.email ?? PENDING_PLAYER_LABEL` |
| `app/admin/games/new/sections/TeamsAssignmentSection.tsx` | `shortName`: samme fallback |
| `app/admin/games/new/sections/WolfSetup.tsx` | `playerLabel`: `… || p.email` → `… || p.email || PENDING_PLAYER_LABEL` |
| `app/admin/games/new/sections/RoundRobinSetup.tsx` | samme |
| `app/admin/games/new/useGameFormState.ts` | søke-haystack: `p.email` → `p.email ?? ''` |
| `app/opprett-spill/page.tsx` | begge `getNewGameFormData()` → `getNewGameFormData(false)` |
| `app/games/[id]/rediger/page.tsx` | `getNewGameFormData()` → `getNewGameFormData(false)`; oppdater docstring |
| `app/admin/games/new/page.tsx` | uendret kall (default `true`); evt. presiser kommentar |
| `lib/games/newGameFormData.test.ts` (ny) | co-lokert loader-test |
| `package.json` + `CHANGELOG.md` | PATCH-bump (security fix) |

## Akseptansekriterier

- [ ] **AK1** — En ikke-admin på `/opprett-spill` får **ikke** andre brukeres `email` i
      side-payloaden. Verifiseres via at users-`.select()`-strengen i den e-post-frie
      varianten ikke inneholder `email`, og at `PlayerOption` som sendes til klienten ikke
      har `email`-nøkkel. (Loader-test + kode-lesning.)
- [ ] **AK2** — `/games/[id]/rediger` (ikke-admin edit, #428) bruker også den e-post-frie
      varianten.
- [ ] **AK3** — Spiller-velgeren fungerer fortsatt for ikke-admin: navn + handicap synlig,
      medspillere kan plukkes; pending-spillere vises som «Invitert spiller» (ingen e-post).
- [ ] **AK4** — Admin-flaten `/admin/games/new` er uendret: full roster med e-post, default
      `getNewGameFormData()`-kall.
- [ ] **AK5** — Co-lokert test for endret loader: `getNewGameFormData(false)` utelater
      `email` fra select + output; `getNewGameFormData()` beholder den.
- [ ] **AK6** — `npx tsc --noEmit` grønt; `npm run build` grønt (eksaustive maps/switch).
- [ ] **AK7** — Berørte co-lokerte tester grønne (GameForm/useGameFormState/sections som
      setter `email` i fixtures kompilerer fortsatt med optional `email`).

## Gates

```bash
# Loader-test (ny) + berørte velger-tester
npx vitest run lib/games/newGameFormData.test.ts \
  app/admin/games/new/GameForm.test.tsx \
  app/admin/games/new/useGameFormState.test.ts \
  app/admin/games/new/GameWizard.test.tsx \
  app/admin/games/new/sections/WolfSetup.test.tsx \
  app/admin/games/new/sections/RoundRobinSetup.test.tsx

# Typer + full build (eksaustive maps)
npx tsc --noEmit
npm run build
```

## Out of scope

- RLS-kolonne-/view-herding av `users.email` (DB-laget) — issuet valgte app-laget.
- Refaktor av de fire dupliserte etikett-helperne til én delt funksjon — kun fallback-spot
  røres her (minimal-diff).
- Søk på e-post i admin-velgeren — beholdes (admin har e-post; haystack-`?? ''` er no-op der).

## Versjonering

PATCH-bump `1.78.0 → 1.78.1` (security/privacy fix, ingen ny bruker-flyt). `fix(...)`-prefix
→ commit-msg-hook krever bump + CHANGELOG i samme commit. Bruker-rettet streng «Invitert
spiller» kjøres gjennom `humanizer` før commit.
