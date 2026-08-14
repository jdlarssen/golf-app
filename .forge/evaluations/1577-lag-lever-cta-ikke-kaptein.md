# Evaluering: #1577 — Lever-CTA i lag-modus for ikke-kaptein

**Verdikt: ACCEPT** (S6/staging gjenstår — hovedchattens ansvar før merge)

Evaluert 2026-08-14 mot kontrakt `.forge/contracts/1577-lag-lever-cta-ikke-kaptein.md`,
branch `claude/1577-team-submit-cta` (commits dba13013 → 6b007967 → 684915c8).
Alle gates re-kjørt uavhengig i denne økten på Node v22.23.0.

## Gate-resultater (kjørt selv, ikke fra builder-rapport)

- `npx vitest run "app/[locale]/games/[id]/holes/[holeNumber]" "app/[locale]/games/[id]/submit" lib/games`
  → **68 filer, 1324 tester, alle grønne**.
- Målrettet: `lib/games/scoreOwner.test.ts` → **89/89 grønne**;
  `HoleClient.test.tsx -t 1577` → **3/3 grønne** (texas ikke-kaptein-CTA,
  patsome-blandingen, patsome-negativtesten).
- `npm run build` (pipefail) → **EXIT=0**.

## Per kriterium

### S1 — helper med TDD ✅
`lib/games/scoreOwner.ts` + `lib/games/scoreOwner.test.ts`. Test-commit dba13013
inneholder KUN testfila og ligger før impl-commit 6b007967 (modulen fantes ikke →
rød by construction). 89 tester dekker alle kontraktens klasser: 9 per-spiller-modus
× 3 hull, 7 kollapsede modus × 4 hull, patsome 1–6 vs 7–18, withdrawn-kaptein via
`teamScoreOwnerId` (verifisert mot `lib/games/teamCaptain.ts`: lex-min av aktive,
null ved tomt/helt withdrawn lag), tomt-lag-fallback, dedupe når viewer == kaptein.
Regelen delegerer til `modeCollapsesToTeamCard` (`lib/scoring/modes/types.ts:182`) —
verifisert at den dekker scramble-familien + alternate-shot-familien (inkl. gruesome)
+ patsome ≥ 7. Ett hjem for regelen (D2 oppfylt).

### S2 — hull-sidens fullførings-sett ✅
Server-selecten (`page.tsx:330–344`) henter begge id-ers rader via
`scoreOwnerUserIds` og siler per hull med `scoreOwnerForHole` (linje 456–469);
Dexie-queryen i `HoleClient.tsx:476–505` speiler nøyaktig samme par
(`anyOf` på `[gameId+userId]`-indeksen + samme per-hull-filter).
`myTeamScoreOwnerId` beregnes fra hele laget (allPlayers, ikke flight) — samme
kilde som #1538-Hjem-kortet. Render-test viser lever-CTA for ikke-kaptein
(texas → «Lever lagets scorekort», patsome → «Lever scorekort» — begge labels
verifisert mot `submitLabel`-logikken i HoleClient:889–893). useLiveQuery-mockens
3-kalls-kontrakt matcher komponentens faktiske kall-rekkefølge (452 localRows,
476 localScoredRows, 512 syncQueue) — verifisert i kilden.

### S3 — submit-siden ✅
`submit/page.tsx`: query utvidet til `in('user_id', scoreOwnerUserIds(...))`,
`ownedScores` filtrerer per-hull-eier, og `scoreByHole` → `rows` → `missingHoles`
(linje 302–350) bygger på det silte settet. Ikke-kaptein med komplett lagkort får
0 manglende. Putt-prompt-sikkerheten er reell: verifisert at `formatCapturesPutts`
returnerer false for ALLE lag-kollapsede modus, så prompten kan aldri skrive på
feil id. Ingen egen test her (kontrakten tillater «test eller staging-observasjon»
— dekkes av S6).

### S4 — kaptein-/solo-regresjon ✅
Når eier == viewer eller lag mangler: `scoreOwnerUserIds` → `[viewer]`, så
`.in('user_id', [viewer])` ≡ gammel `.eq`, Dexie-`anyOf([[gameId, viewer]])` ≡
gammel `.equals`, og per-hull-filteret er en no-op (alle rader eies av viewer).
Per-spiller-lagmodus (best_ball/shamble/fourball) med non-null teamOwner faller
også tilbake til `[viewer]` (unit-testet). Diffen på `HoleClient.test.tsx` er
rent additiv (124 innsettinger, 0 slettinger) og alle 1324 eksisterende tester
er grønne uendret.

### S5 — gates ✅
Re-kjørt selv, se toppen. Grønt hele veien.

### S6 — staging-klikkrunde ⏸ IKKE EVALUERT
Hovedchattens ansvar per oppdraget. Merk: dette er den ENESTE ende-til-ende-
verifiseringen av server-select-wiringen (se merknad M1) — ikke hopp over den.

## Edge-case-tabellen (alle ikke-N/A-rader etterprøvd)

| Rad | Dekning |
|---|---|
| Tomt / ett hull (uendret) | Eksisterende tester, grønne uendret |
| Komplett lagkort, ikke-kaptein | Render-test 1 (texas) ✅ |
| Patsome lag 7–18 ok, egne 1–6 mangler ett | Render-test 3 (kapteins rad på hull 5 teller IKKE) ✅ |
| Patsome egne 1–6 + lag 7–18 | Render-test 2 ✅ |
| Withdrawn kaptein | Unit-test via `teamScoreOwnerId` ✅ |
| Duplikat server+Dexie | Kodebevis: `Set`-union (HoleClient:485) — strukturelt umulig å telle dobbelt |
| Realtime-merge fra makker | Kodebevis: `lib/sync/realtime.ts:20–28` nøkler Dexie-raden på radens `user_id` (kapteinen) → `anyOf`-queryen re-fyrer ✅ |

## Blokkerende funn

Ingen.

## Ikke-blokkerende merknader

- **M1 — `app/[locale]/games/[id]/holes/[holeNumber]/page.tsx` + S2:**
  Server-select-filteret har ingen egen test (server-komponent uten testfil), og
  Dexie-queryen er mocket i render-testene — render-testene beviser regelen i
  klient-grenen, ikke wiringen i server-grenen. Akseptabelt fordi selve regelen er
  unit-testet 89 veier og begge call-sites bruker identisk helper-par, MEN det gjør
  S6-staging-runden til eneste e2e-bevis for serverstien. S6 må faktisk gjennomføres.
- **M2 — `app/[locale]/games/[id]/(home)/PrimaryCta.tsx` + T2 søsken-modul (BØR FILES SOM ISSUE):**
  Game-home-CTA-en har NØYAKTIG samme defektmønster som kontrakten fikser:
  `eq('user_id', currentUserId)` (linje 68) → ikke-kaptein i kollapset modus står
  evig i `not_started`/`in_progress`, aldri `ready_to_submit`, og «Fortsett runden»
  peker på feil hull. Utenfor kontraktens rotårsak-liste og ikke nevnt i ikke-målene
  (ikke-målene ekskluderer Hjem-kortet #1538 og godkjenningslistene — dette er en
  tredje flate). Ikke blokkerende for DENNE kontrakten, men per reviewer-funn-regelen
  skal hovedchatten opprette issue før merge.
- **M3 — `app/[locale]/games/[id]/holes/[holeNumber]/page.tsx` + RLS:**
  Ikke-kapteins lesing av kapteinens rader går via bruker-klienten og hviler på
  samme-flight-RLS under aktivt spill. Holder fordi lag ⊆ flight i de kollapsede
  modusene (samme forutsetning som dagens delte kort og skrivebane); skulle et lag
  noen gang spenne flighter, degraderer queryen stille til dagens oppførsel (ingen
  CTA). Kun observasjon, ingen handling kreves.
- **M4 — scope/commits:** Ingen scope-lekkasje (alle endrede filer sporer til
  kontrakten), `Refs #1577` i alle tre bodies, `.changes/1577-lag-lever-cta.md`
  følger malen (type: fix + issue), refactor-commiten korrekt `[no-changelog]`.
