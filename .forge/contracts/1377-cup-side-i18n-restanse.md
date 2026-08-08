# Spec: Cup-siden — i18n-restanse (hardkodet norsk copy)

**Issue:** #1377 · **Type:** bugfiks (P3, i18n) · **Branch:** `claude/contract-issue-1377-94b5e9`

## Problem

Audit-funn F36 (2026-07-27) meldte hardkodet norsk copy på den offentlige cup-siden, inkludert skrivefeilen «point». Koden har endret seg siden: «point»-typoen, «Spilles»/«Utkast» og «Matches»-headingen er allerede fikset av senere arbeid (`c59d82a3`, #1441-refaktorene — siden bruker nå `t('public.firstTo')`, `t('public.matchInProgress')`, `t('public.matchDraft')`, `t('manage.matchesHeading')`).

**Gjenstår** i `app/[locale]/cup/[id]/page.tsx` (verifisert i denne økten):

| Linje | Hardkodet i dag | Synlig på engelsk locale som |
|---|---|---|
| 96 | `{winnerName} vant` | norsk «vant» |
| 100 | `Uavgjort` | norsk |
| 203 | `m.matchLabel ?? 'Match'` | OK på begge språk, men utenfor katalogen |
| 207 | `mot` | norsk |
| 213 | `'Halvert (AS)'` | norsk — OG utdatert terminologi (#1454 endret til «Delt») |
| 215–224 | `` `${m.result.formatted} til ${navn}` `` | norsk «til» |

**Søsken-defekt (samme mønster, T2):** `app/[locale]/admin/cup/[id]/CupManagement.tsx:329` har samme `'Match'`-fallback og `:341–350` samme «til»-interpolering hardkodet.

## Research Findings

Ingen ekstern research nødvendig — mønsteret er etablert i selve fila: `getTranslations('cup')` (page.tsx:36) og kryss-lån fra `manage.*`-nøkler (page.tsx:179). Ingen tester låser strengene (grep verifisert); ingen no/en-paritetstest finnes som må oppdateres.

## Prior Decisions

- **#1454 (`bc8b606f`):** delt match heter «Delt (AS)» på norsk, «Halved (AS)» på engelsk. Nøkkelen `cup.manage.matchTied` bærer allerede begge. Gjenbruk fikser både hardkodingen og terminologien i ett.
- **#747/`c59d82a3`:** tidligere fiks på samme side holdt scope smalt med vilje — denne kontrakten lukker resten av funnet.
- **i18n-epic #60:** all bruker-copy bor i `messages/no.json` + `messages/en.json`, alltid begge i samme commit.

## Design

Ren mekanisk flytting — ingen logikkendring. Streng → nøkkel:

| Sted | Nøkkel | no | en |
|---|---|---|---|
| page.tsx:96 | `cup.public.winnerWon` (ny) | `{name} vant` | `{name} won` |
| page.tsx:100 | `cup.public.tied` (ny) | `Uavgjort` | `Draw` |
| page.tsx:203 + CupManagement.tsx:329 | `cup.manage.matchLabelFallback` (ny) | `Match` | `Match` |
| page.tsx:207 | `cup.manage.mot` (gjenbruk) | `mot` | `vs` |
| page.tsx:213 | `cup.manage.matchTied` (gjenbruk) | `Delt (AS)` | `Halved (AS)` |
| page.tsx:215–224 + CupManagement.tsx:341–350 | `cup.manage.resultTo` (ny) | `{result} til {name}` | `{result} to {name}` |

Delte nøkler legges i `cup.manage` fordi lånretningen public → manage allerede er etablert på siden (matchesHeading). `{result}` mates med ferdigformatert `m.result.formatted` (f.eks. «3&2»); `{name}` med lag- eller spillernavn per eksisterende ternary (`isTeamMatchGameMode`-grenene beholdes uendret i TSX).

## Edge Cases & Guardrails

- **Norsk visning skal være uendret** — bortsett fra «Halvert (AS)» → «Delt (AS)», som er tilsiktet (#1454).
- `formatPoints`-komma-desimaler går gjennom `{result}` som ferdig streng — ingen ICU-tallformatering på den.
- `kicker="Cup"` (page.tsx:88) er locale-nøytral logo-tekst — røres ikke.
- `tournament_match_label` er DB-innhold (per-cup-generert tekst) — oversettes ikke; kun `null`-fallbacken flyttes til katalogen.
- Ingen nye tester (copy-endring per test-disiplinen); ingen snapshots å oppdatere.

## Key Decisions

- Gjenbruk `manage.matchTied`/`manage.mot` fremfor å duplisere i `public.*` — én regel, ett hjem.
- Søsken-fiksen i CupManagement.tsx tas i samme PR (samme defektklasse, ~4 linjer) — nevnes som scope-utvidelse i closing-kommentaren.
- «Draw» (ikke «Halved») for cup-nivå-uavgjort på engelsk — matcher `mail.cupFinished.resultDraw` («ended in a draw»); «Halved» er per-match-terminologi.

**Claude's Discretion:** nøyaktig plassering av nye nøkler innen alfabetisk/eksisterende rekkefølge i JSON-filene.

## Drift siden kontrakten ble skrevet (registrert ved bygging, 2026-08-08)

Kontrakten ble skrevet mot en eldre versjon av fila. `#1468` (cup tre rom) har siden
splittet den offentlige cup-siden i to ruter, og `#1441`-arbeidet har fikset flere av
strengene. Verifisert i denne økten mot `origin/main` (`git log`-basis: `dcd6e48e`):

| Kontraktens punkt | Faktisk status i dag |
|---|---|
| `{winnerName} vant` (page.tsx:96) | **Allerede fikset** — flyttet til resultatsiden og bruker `t('results.winner')` (resultater/page.tsx:112) |
| `Uavgjort` (page.tsx:100) | **Allerede fikset** — `t('results.tied')` (resultater/page.tsx:115) |
| `m.matchLabel ?? 'Match'` | **Allerede fikset** — `t('matchFallback')` begge steder (page.tsx:140, resultater/page.tsx:201) |
| Søsken-defekt i `CupManagement.tsx` | **Allerede fikset** — `t('matchFallback')` (:263, :266, :476) og `t('manage.mot')` (:480); ingen `til ${…}`-interpolering igjen |
| `'Halvert (AS)'` | Fantes som `'Delt (AS)'` (terminologien var alt oppdatert av #1454) — men **fortsatt hardkodet** |
| `mot` | **Fortsatt hardkodet** — nå på TO steder etter rute-splitten |
| `${formatted} til ${navn}` | **Fortsatt hardkodet**, flyttet til resultatsiden |

**Faktisk gjenstående arbeid** (det som ble bygget): 4 strenger på 2 ruter, 2 nye nøkler.

**Avvik fra kontraktens Design:**
- `cup.manage.matchTied` finnes ikke (kontrakten antok gjenbruk). Nærmeste eksisterende,
  `finishedCard.result.matchTied` («Uavgjort»/«Halved»), er en annen kontekst — ikke gjenbrukt.
- Nye nøkler lagt i `cup.results.*`, ikke `cup.manage.*`: begge strengene brukes nå kun
  på resultatsiden, og «én regel, ett hjem» peker da på `results`. `manage.mot` gjenbrukes
  som kontrakten sa (den ER delt mellom manage og de to public-rutene).
- Kontraktens `public.winnerWon`/`public.tied`/`manage.matchLabelFallback` er ikke laget —
  de tre strengene er allerede i katalogen under andre navn (se tabellen over).
- Kontraktens Key Decision om «Draw» vs «Halved» for cup-nivå-uavgjort er moot:
  `cup.results.tied` finnes fra før med «Tied» — ikke rørt (utenfor scope, ikke en regresjon).

## Success Criteria

- [x] Null hardkodede bruker-synlige strenger igjen i cup-rutene.
      `grep -rn "Halvert\|'Delt\|>mot<\|til \${" 'app/[locale]/cup' 'app/[locale]/admin/cup'` → `NONE`
- [x] Samme grep mot `CupManagement.tsx` gir null treff for `'Match'`-fallback og
      `til`-interpolering — var allerede rent før denne PR-en (se drift-tabellen).
- [x] De nye nøklene finnes i BÅDE `messages/no.json` og `messages/en.json`:
      `no matchTied='Delt (AS)' resultTo='{result} til {name}'` ·
      `en matchTied='Halved (AS)' resultTo='{result} to {name}'` (python-sjekk av begge filer).
- [x] Norsk copy uendret ord-for-ord: «mot», «Delt (AS)» og «{result} til {name}» er
      flyttet verbatim inn i katalogen (`git show 42c169a0 -- messages/no.json`).
- [x] `npx tsc --noEmit` grønn (exit 0, ingen output).

## Gates

- [x] `npx tsc --noEmit` — exit 0
- [x] `npm run lint` — 0 errors (56 pre-eksisterende complexity-warnings, ingen i endrede filer)
- [x] `npx vitest run lib/cup 'app/[locale]/cup'` — 24 filer / 386 tester grønne
- [x] `npm run build` — grønn
- [x] Patch-bump `1.229.0 → 1.229.1` + CHANGELOG Feilrettinger-linje
- [x] Staging-klikkrunde: `/cup/<id>` + `/cup/<id>/resultater` i `no` og `en`

## Files Likely Touched

- `app/[locale]/cup/[id]/page.tsx` — 6 strenger → `t()`-kall
- `app/[locale]/admin/cup/[id]/CupManagement.tsx` — 2 strenger → `t()`-kall
- `messages/no.json` + `messages/en.json` — 4 nye nøkler (`public.winnerWon`, `public.tied`, `manage.matchLabelFallback`, `manage.resultTo`)
- `package.json`/`package-lock.json`/`CHANGELOG.md` — patch-bump + én linje

## Out of Scope

- Oversettelse av DB-genererte matchetiketter (`tournament_match_label`) — i18n fase D-tema.
- Øvrige cup-flater (manage/generate/delete er allerede i katalogen).
- Staging-klikkrunde utover berørt flyt: offentlig cup-side i begge locales holder.
