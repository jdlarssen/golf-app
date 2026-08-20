# Evaluation: #1578 — Splittet cup-dag: søsterspillets celler i hull-stripa blir score-bevisste

**Builder+evaluator:** Nattkjøreren (#1079), Opus-bygg, fresh-context Opus-evaluator
**Contract:** issue-kommentar på #1578 (kontrakt-smeden 2026-08-19, fersk-kontekst-verifisert)
**Branch:** `claude/natt-1578-sibling-scored-holes` fra `origin/main@48af513`

## Runde 1 — implement → gates → evaluate → ACCEPT

Bygget (commits `dc39fc6` + `fcbc1c9`): pure helper `scoredHoleNumbers` i
`lib/games/scoreOwner.ts` (TDD, 6 nye Type A-cases; begge eksisterende
call-sites konvertert oppførsel-identisk), server-henting av søskenlagets
rad-eier + scores (admin-klient, fail-soft, `game_players` i
runde-2-`Promise.all`), fjerde `useLiveQuery` i HoleClient med Dexie-union,
`sibling.scoredHoles: ReadonlySet<number> | null` i HoleStrip
(null → posisjonell fallback), aria-nøkler gjenbrukt, foreldede kommentarer
oppdatert, `.changes/1578-hullstripe-andre-halvrunde.md`.

**Byggerens gates:** typecheck clean, full vitest 493 filer / 6561 tester
grønn, lint 0 errors.

**Evaluator (fersk kontekst) fant ingen defekter.** Selv verifisert: tsc
clean; lint 0 errors; `components/hole` + `scoreOwner.test.ts` 196 tester
grønne; hull-side-suiten 93 grønne. Nøkkelpunkter bevist: patsome-eierskap
korrekt på absolutt hullnummer for søskenmodusen; refactoren
oppførsel-identisk; null nye queries for vanlige spill; begge nye lesinger
ikke-kastende; 4. useLiveQuery ubetinget (hooks-regler) med riktige deps;
null-fallback reproduserer pre-endring-oppførsel inkl. aria; #1466-asserten
bevart som null-case; alle konstruksjonssteder av sibling-propen kompilerer;
scope = 8 filer, alle sporbare (I4).

**Avvik godkjent (a–d):** admin-klient også på scores-lesingen (samme
RLS-begrunnelse, autorisasjon bevist i `findSegmentSibling`); null server-sett
→ ingen lokal-delvis Dexie-visning (hindrer falsk «mangler»); kriterium 3
testet på fallbacken (ikke mock av to-linjers loggegren); ingen ny
HoleClient-render-test (dekket av pure logic + HoleStrip).

**Skjema-gap lukket av orkestratoren:** alle 8 kolonner de nye lesingene
bruker (`game_players.user_id/withdrawn_at/team_number/game_id`,
`scores.hole_number/user_id/strokes/game_id`) verifisert read-only mot live
staging-skjema via Supabase MCP — riktige navn og typer.

### Reviewer-funn utenfor scope (→ egne issues før merge)

- Rad-eier-filteret finnes fortsatt inline i `app/[locale]/games/[id]/submit/page.tsx:299`
  og `app/[locale]/games/[id]/(home)/PrimaryCta.tsx:92` — «ett hjem»-refactoren
  er reell for hull-sida, men to eldre kopier gjenstår.
- Kompleksitets-warnings vokste: `HoleClient` 114 → 123, `HolePage` 107 → 114
  (begge langt over 25-grensa fra før; kun warnings). Dekomponering er egen sak.

### Ikke-blokkerende notater

- Shotgun-start-vridningen: på splittet dag der back9 spilles først viser
  front9-søskenceller nå ærlig «mangler» i stedet for falsk «ført» — samme
  trade-off egne celler har hatt siden #1352. Én bruker-synlig endring utover
  selve buggen; verdt å se i staging-runden.
- `siblingLocalScoredRows` spør Dexie også når server-settet er null og
  resultatet forkastes — harmløst, kunne kortsluttes.

**Verdikt: ACCEPT** → Steg 4 (e2e) og Steg 4.5 (kryss-modell-gate).

## Steg 4/4.5 — e2e og kryss-modell-gate

- **e2e `@gate` mot staging: 30/31 grønne (2,6 min).** Den ene røde er
  `scoring-golden-path` («Lagrer slag …»-knappen forblir disabled — sync-kø
  drenerer ikke), som er nøyaktig signaturen i det åpne miljø-issuet #1581
  (feiler også på fersk main i natt-VM-en). Ingen `net::`-linje i loggen, så
  egress-speilingen var aktiv — dette er #1581s kjente feilmodus, ikke denne
  diffen: endringen aktiveres kun når `siblingMatch != null` (splittet
  cup-dag); den røde specen er et solo-spill. Egne cellers oppførsel er
  uendret (bevist i runde 1), og null nye queries for vanlige spill.
- **Kryss-modell-gate (Sonnet, fersk kontekst): CONFIRM.** Selvstendig
  verifisert alle kriterier mot diffen + 335 tester grønne lokalt; probet
  edge-cases (ulik game_mode på tvers av halvdelene, viewer uten lag i
  søskenspillet, helt withdrawn søskenlag) — alle korrekt håndtert.

**Gjenstår ved levering:** kriterium 5 (staging-klikkrunde på ekte splittet
cup-dag) → `needs-manual-qa` på PR-en med flyten beskrevet.
