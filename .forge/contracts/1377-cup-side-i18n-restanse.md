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

## Success Criteria

- [ ] `grep -n "vant\|Uavgjort\|Halvert\|'mot'\|'Match'" 'app/[locale]/cup/[id]/page.tsx'` gir null treff på bruker-synlige strenger (kun evt. kommentarer).
- [ ] Samme grep mot `CupManagement.tsx` gir null treff for `'Match'`-fallback og `til`-interpolering.
- [ ] De 4 nye nøklene finnes i BÅDE `messages/no.json` og `messages/en.json` (python-sjekk av begge).
- [ ] Norsk copy uendret ord-for-ord bortsett fra «Halvert (AS)» → «Delt (AS)» (les diff).
- [ ] `npx tsc --noEmit` grønn.

## Gates

- [ ] `npx tsc --noEmit`
- [ ] `npm run lint`
- [ ] `npx vitest run lib/cup` (berørt domene; ingen co-located tester for de to tsx-filene)
- [ ] Patch-bump + CHANGELOG Feilrettinger-linje (bruker-synlig: engelsk locale viser nå engelsk på cup-siden; «Delt» også på offentlig side)

## Files Likely Touched

- `app/[locale]/cup/[id]/page.tsx` — 6 strenger → `t()`-kall
- `app/[locale]/admin/cup/[id]/CupManagement.tsx` — 2 strenger → `t()`-kall
- `messages/no.json` + `messages/en.json` — 4 nye nøkler (`public.winnerWon`, `public.tied`, `manage.matchLabelFallback`, `manage.resultTo`)
- `package.json`/`package-lock.json`/`CHANGELOG.md` — patch-bump + én linje

## Out of Scope

- Oversettelse av DB-genererte matchetiketter (`tournament_match_label`) — i18n fase D-tema.
- Øvrige cup-flater (manage/generate/delete er allerede i katalogen).
- Staging-klikkrunde utover berørt flyt: offentlig cup-side i begge locales holder.
