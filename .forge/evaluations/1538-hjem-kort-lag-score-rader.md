# Evaluering: #1538 — Hjem-kortet teller lagets score-rader

**Runde 1 · verdikt: ACCEPT** (staging-kriteriet vurderes separat, ikke av denne evaluatoren)

Fersk kontekst, skeptisk gjennomgang av `26f2d5ba`, `d9e562ba`, `658d8717` mot
`.forge/contracts/1538-hjem-kort-lag-score-rader.md`. Alle gates kjørt på nytt av
evaluatoren (Node v22.23.0), ikke lest fra byggerens rapport.

---

## Kriterier

### 1. Type A-tester på helperne — PASS

`modeCollapsesToTeamCard` (`lib/scoring/modes/types.ts:157–190`) er
`isScrambleFamily || isAlternateShotMatchplay || (patsome && hole >= 7)`.

Sammenlignet mot origin/main-hull-sidens faktiske flagg-logikk:
- origin/main `page.tsx:260`: `const isTexas = isScrambleFamily(game.game_mode)`
  → texas + **ambrose** + **florida_scramble** (`types.ts:85–87`). Begge er med.
- origin/main `page.tsx:647–654`: `isTexas || isFoursomes || isGreensome ||
  isChapman || isGruesome || (isPatsome && holeNumber >= 7)`.
  `isAlternateShotMatchplay` (`types.ts:104–111`) = nøyaktig
  {foursomes, greensome, chapman, gruesome}. Ingen over-/underdekning; patsome
  er IKKE med i `isAlternateShotMatchplay`, så 4BBB-halvdelen (hull 1–6) forblir
  per-spiller.

Settene er altså mengde-identiske. `familyPredicates.test.ts` parametriserer over
den eksisterende eksplisitte `ALL_MODES`-lista (22 modi), inkl. per-hull-casene
1–6 false / 7–18 true og eksplisitte ambrose/florida-asserts.

`teamScoreOwnerId` (`lib/games/teamCaptain.ts:48–55`): lex-min blant aktive,
`null` for tom/helt-withdrawn liste, delegerer sammenligningen til
`pickTeamCaptain`. Dekket av 7 nye tester, inkl. enighets-testen mot
`pickTeamCaptain`.

**Evidens (egen):** `npx vitest run lib/games lib/scoring/modes` →
`90 passed (90) / 2016 passed (2016)`, exit 0.

### 2. Test på `getActiveGameCardData` (greensome-makker) — PASS, bevist bærende

**Mutasjonsbevis (kontraktens «bytt inn origin/main»-krav, pluss to strammere):**

| Mutasjon | Røde tester | Restaurert |
|---|---|---|
| A: `git show origin/main:lib/games/getActiveGameCardData.ts` byttet inn | 13/13 (`.in(...).eq is not a function`) | ja |
| B: fjernet per-rad-filteret (flat union) | **kun 2** — cross-game-lekkasje + patsome | ja |
| C: `captainByGame` tvunget tom | **4** — begge greensome-casene + cross-game + withdrawn-captain | ja |
| D: fjernet `withdrawn_at`-filteret i `teamScoreOwnerId` | **3** — 2 helper-tester + withdrawn-captain | ja |

`git status --porcelain` tom etter hver restaurering; treet er rent, ingen commit,
ingen push, branch uendret (`fix/1538-home-card-team-rows`).

Mutasjon B/C/D er det avgjørende: de treffer nøyaktig de tiltenkte testene og
ingen andre, altså tester filen faktisk logikken og ikke bare fake-kjeden.

### 3. Cross-game-lekkasje — PASS

`getActiveGameCardData.ts:167–171`. Beviset ligger i to ledd:
- `captainByGame` fylles kun for `collapsedGames` (`:135–141`), som igjen kun er
  continue-spill som kollapser. For spill B (best ball) finnes ingen nøkkel →
  `captainByGame.get('g2')` er `undefined` → `undefined !== 'u1'` → `continue`.
- Per-rad-filteret sammenligner mot `r.game_id`, ikke mot et globalt sett.

Testen (`getActiveGameCardData.test.ts:213–234`) kjører u1 som captain i g1 og
vanlig spiller i g2 med 9 hull i g2 — forventer `g2.nextHole === 2`, ikke 10.
Mutasjon B gjør nettopp denne rød.

Fake-supabaseen er ikke tannløs: den håndhever begge `.in()`-filtrene på ekte
(`:33–42`), så testen ser samme radmengde PostgREST ville gitt.

### 4. Avvik 1 — `teamScoreOwnerId` som adapter i `teamCaptain.ts` — PASS

Semantisk identisk med kontraktens spec: filtrerer `withdrawn_at == null`, mapper
til `user_id`, og returnerer `pickTeamCaptain(active)` når lista er ikke-tom, ellers
`null`. Ingen egen sammenligningsløkke — delegeringen er reell, ikke kosmetisk
(mutasjon D beviser at withdrawn-leddet er bærende; enighets-testen mot
`pickTeamCaptain` beviser at lex-min-regelen ikke er duplisert).

Ingen oppførsels-drift på hull-siden: `flight`/`roster` (`page.tsx:250–256`)
filtrerer `withdrawn_at == null` i **alle tre** grenene, så det nye
withdrawn-filteret er en no-op der og gir samme kaptein som `reduce`-blokken.
Tom-liste-grenen (`?? teamPlayers[0].user_id`) kaster på samme sted som
origin/main-`reduce`-en gjorde (`captain.user_id` på `undefined`) — men
`teamNumbers` utledes fra `flight`, så et lagnummer uten medlemmer kan ikke
oppstå. Ingen ny krasjvei.

### 5. Avvik 2 — hull-bevisst captain-attribusjon — PASS

`:167–171`, lest linje for linje:
- Guarden gjelder **kun** rader der `r.user_id !== userId`. Viewerens egne rader
  passerer alltid, uansett modus og hull. Er viewer selv captain, setter
  `captainsForViewer` ingen nøkkel (`:73`, `ownerId !== userId`), så
  `scoreUserIds` = `[userId]` og resultatet er identisk med i dag.
  → **Nei, viewerens egne rader kan ikke forsvinne.**
- En captain-rad på et IKKE-kollapset hull: `modeCollapsesToTeamCard(mode,
  r.hole_number)` evalueres per rad, med det **faktiske** hullnummeret. Patsome
  hull 1–6 → false → `continue`. → **Nei, den kan ikke telle.**
  Testen `:236–258` låser dette: captainens egne 4BBB-baller på hull 4–5 gir
  fortsatt `nextHole === 4` for makkeren.
- `modeByGame` bygges fra `continueGames`, og alle rader kommer fra
  `.in('game_id', continueIds)` → oppslaget kan ikke bomme; `!mode` er en
  defensiv, uoppnåelig gren.

`lastHoleForSegment` (`lib/games/holeScope.ts:33–36`) brukes kun til
«kollapser denne runden i det hele tatt» ved bygging av `collapsedGames` — for
patsome er `hole_segment` alltid `'full'` → 18 → true. Riktig sjikt: grov gate
på spill-nivå, presis gate på rad-nivå.

### 6. Degradering — PASS

- **Spørringsfeil:** `scoresRes.data ?? []` / `matesRes.data ?? []` (`:160`, `:181`)
  — byte-for-byte samme fallback-form som origin/main. Kalleren
  (`app/[locale]/page.tsx:421–435`) er uendret. Ingen atferdsendring.
- **Viewer uten `team_number`:** `:69` `if (!meRow || meRow.team_number == null)
  continue` → ingen captain → egne rader. Test `:180–190`.
- **Uleselig roster (lag på tvers av flights):** tom `gameRoster` → `!meRow` →
  egne rader, ingen throw. Test `:192–199`.
- **Helt withdrawn lag:** `teamScoreOwnerId` gir `null` → `:73` setter ingenting →
  egne rader.

*Ikke-blokkerende observasjon:* JSDoc-en påstår «on any query error the affected
game falls back to the game overview href», men koden lander på segmentets
første hull. Påstanden er arvet ordrett fra origin/main og er uendret av denne
PR-en — pre-eksisterende doc-drift, utenfor scope (I4).

### 7. Hull-sidens diff er mekanisk — PASS

Diffen inneholder nøyaktig fire hunks: to import-endringer, sletting av
`isTexas`-variabelen, erstatning av `if`-betingelsen med helperen, og
captain-utledningen (`captain` → `captainId`, tre kallsteder:
`scoresByUser[captainId]` og `userId: captainId`).

`teamHandicapFor`, `sideHandicap`, `readTeamStrokesOverride`, `strokesForHole`,
`isSixtyForty`, `isDiffFormat` — **ingen** av dem er rørt. Ingen
handicap-/allowance-linje er i diffen.

`isTexas` er ikke lenger referert i `page.tsx` (gjenværende treff ligger i
`HoleClient.tsx:386` — egen fil, egen variabel, bevisst utenfor scope).

### 8. `pairActiveCard` urørt — PASS

`git diff origin/main...HEAD -- lib/games/pairActiveCard.ts lib/games/pairActiveCard.test.ts`
→ **0 linjer**. Testene inngår i de 2016 grønne.

### 9. Gates — PASS (egen kjøring)

| Gate | Resultat |
|---|---|
| `npm run typecheck` | exit 0, ingen output |
| `npx vitest run lib/games lib/scoring/modes` | 90 filer / 2016 tester, exit 0 |
| `npx eslint` på de fire endrede kildefilene | **0 errors**, 1 warning: `HolePage` complexity 106 > 25 (pre-eksisterende; kontrakten oppgir 112 på origin/main, altså redusert) |
| `node scripts/weekly-release.mjs --dry-run` | notatfila validerer og folder til én `1.233.0`-linje under Feilrettinger |

### 10. Avvik 3–5 — PASS

- **Avvik 3:** `26f2d5ba` og `d9e562ba` er `refactor(`, `.changes/1538-…md` ble lagt
  til i `658d8717` (`fix(home)`) — verifisert med `git log --diff-filter=A`.
  Hook-konformt.
- **Avvik 4:** `captainsForViewer` (`:60–76`) er ekstrahert; lint viser ingen ny
  complexity-advarsel.
- **Avvik 5:** `gh issue view 1606` → OPEN, «HoleClient: adopter
  modeCollapsesToTeamCard for kollaps-regelen», milestone `Backlog — uplanlagt /
  scale-triggered`. Reviewer-funn-regelen er oppfylt før merge.

### 11. Staging-verifisering — IKKE VURDERT HER

Utenfor denne evaluatorens mandat.

---

## Findings

Ingen blokkerende funn. Ett ikke-blokkerende, pre-eksisterende:

- `lib/games/getActiveGameCardData.ts` + *degradering*: JSDoc-linjen om
  «overview href» ved spørringsfeil beskriver ikke koden (den lander på
  segmentets første hull). Arvet uendret fra origin/main; ikke en regresjon,
  ikke i scope for #1538.

## Konklusjon

**ACCEPT.** Kollaps-settet er mengde-identisk med hull-sidens gamle inline-flagg,
begge de mistenkte avvikene holder semantisk, per-spill- og per-hull-filtreringen
er bevist bærende med målrettede mutasjoner, og alle tre gates er grønne i egen
kjøring.
