# Evaluering: #1832 — Native wolf/BBB valg-UI

**Verdikt: ACCEPT**

Evaluator: fersk-kontekst forge-evaluator, 2026-08-31.
Branch: `claude/1832-wolf-bbb-valg-ui` @ 1668bcf4 (origin/main @ 1096925d).
All verifisering kjørt selv i denne økta med mindre annet er merket «påstått».

## Gate-tall (kjørt selv)

| Port | Resultat | Kontraktens påstand |
|---|---|---|
| `npx jest` (native/app) | 23 suiter / 289 tester grønne, exit 0 | 23/289 ✓ |
| `npx tsc --noEmit` (native/app) | exit 0 | ✓ |
| `npx eslint native/app` (rot) | exit 0 | ✓ |
| `npm run typecheck` (rot) | exit 0 | ✓ |
| `npx vitest run` (rot) | 522 filer / 7027 tester grønne, exit 0 | 522/7027, identisk ✓ |
| `npm run build` (rot, pipefail) | exit 0 | ✓ |
| `npx expo export` | IKKE kjørt selv | påstått grønn (dist/ slettet) |

## Per kriterium

### K1 — Jest-låst logikk: OPPFYLT (verifisert)

- Adapteren (`native/app/src/lib/scoringContext.ts`): `needs-choices` er borte fra
  unionen (grep i hele `native/app/src/` = 0 treff); erstattet med `missing-choices`
  med dokumentert `undefined` ≠ `[]`-semantikk (`ScoringExtras`, linje 77-98). Wolf
  ruter til delt `buildWolfContext`, BBB til delt `buildBingoBangoBongoContext`
  (linje 351-380) — ingen egen poengformel i noen ny fil (lest wolfHole.ts,
  WolfView.tsx, BingoBangoBongoView.tsx, leaderboardModel.ts; eneste aritmetikk er
  visnings-copyen lone=n / blind=n+2, som speiler webbens modal-undertekster i
  `messages/no.json` `loneWolfSubtitle`/`blindWolfSubtitle`, og
  `n = partnerOptions.length + 1`).
- Valideringene speiler webbens regel for regel (sammenlignet mot
  `lib/wolf/setWolfChoice.ts:50-68` og `lib/bbb/setBingoBangoBongoHole.ts:53-89`):
  hull 1-18 heltall, choice-union, partner-kravene begge veier, partner ≠ wolf,
  wolf UTEN finished-lås (web-paritet), BBB MED bundle-rask-nei + fersk
  `games.status`-oppslag per skriv (`refuseUnlessGameLives`, `choices.ts:340-354`,
  commit 67d20526) inkl. #1445-skillet feil ≠ fravær.
- Trap 2: begge upserts kjeder `.select('hole_number')` og går gjennom
  `expectAffected`; 0 rader = typet `no_rows`-feil (`choices.ts:268-284`), låst i
  test («leser 0 rader som feil, ikke som stille suksess», begge skriveveier).
- Gate-suiten flippet: `GATED_MODES = ['patsome']` (`formatGate.ts:39`); testen
  dekker wolf/BBB åpne, patsome gatet, og den nye segment-vs-mode-testen
  (`formatGate.test.ts:75-80`).
- Testene er reelle, ikke implementasjonsspeil: `choices.test.ts` asserter
  select-listene som kontrakt mot webbens kolonner, race-testen beviser at skrivet
  IKKE skjer (ingen write-plan i ruteren + `supabase.from` kalt nøyaktig 1 gang),
  RLS-kode 42501 vs. constraint-kode skilles. `teamPlay.test.ts:475-486` skrevet om
  til `missing-choices` som foreskrevet.
- Red-run-/mutasjonsbeviset i evidensen (4 røde ved utmutert lås): IKKE reprodusert
  (ville krevd å endre byggernes worktree) — klassifisert som påstått; testlesingen
  over gir uavhengig grunn til å tro vernene er reelle.

### K2 — Wolf ende-til-ende på staging: DB-KORROBORERT (UI påstått)

Service-role SELECT (kun lesing) mot staging `snwmueecmfqqdurxedxv`:
- `wolf_hole_choices` for `37a631a3-9e58-48b7-947e-d73a5b8a4612`: nøyaktig 3 rader —
  hull 1 partner, hull 2 partner, hull 3 lone ✓. Hull 1: `wolf_user_id` =
  `entered_by` = 252e1a6f (Test Spiller, e2e-konto), partner = 069cda6e (Jørgen) —
  matcher «app-skrevet valg, entered_by=spilleren, partner=Jørgen». Hull 3 (lone) er
  ført på Jørgens id — konsistent med det eksterne service-role-skrivet.
- Spillet heter `TEST-1832-wolf-…`, status `active`, mode `wolf` ✓ (staging-formet).
- Badge-tekster, valg-UI-skjermbilder og «eksternt skriv synlig via poll uten
  restart»: kan ikke reproduseres (simulatoren eies av hovedøkta) — **påstått med
  skjermbilde-referanse, DB-korroborert**.

### K3 — BBB ende-til-ende på staging: DB-KORROBORERT (UI påstått)

- `bingo_bango_bongo_holes` for `ca676fc8-7a2c-4414-b289-2dbf7f3f849f`: nøyaktig
  2 rader ✓; spillet står som `finished` ✓; hull 1-raden har fortsatt
  bingo = 252e1a6f… ✓ — racet endret den ikke, som påstått.
- Finished-avvisningens norske melding («Runden er avsluttet. Nå kan ingenting
  registreres mer.») finnes ordrett i `actionFeedback.ts:63`; selve
  live-race-skjermbildet er påstått, mekanismen er kodelest og jest-låst.

### K4 — Web uendret: OPPFYLT (verifisert)

- `git diff --stat origin/main..HEAD` utenfor native/.forge/docs: NØYAKTIG 3 filer —
  `wolfRotation.ts` flyttet (rename, 0 innholdsendring: diff mellom main-blob og
  HEAD-blob er tom, «IDENTISK»), + 1 import-linje i `useWolfHole.ts`, + 1
  import-linje i `wolfRotation.test.ts`. Ingenting annet.
- Dep-/migrasjonsdiff (`package.json`, `package-lock.json`,
  `native/app/package.json`, `supabase/migrations`): TOM ✓.
- Full `npx vitest run`: 522/7027 grønne (kjørt selv) ✓.
- Ingen tredje rotasjonskopi: native importerer kun `lib/wolf/wolfRotation`
  (grep) ✓. Testfila står igjen i web-mappa med re-pekt import — som «Files Likely
  Touched» foreskrev.

### K5 — Porter + runbook: OPPFYLT (verifisert, med bokført gap)

- Alle porter jeg kunne kjøre er grønne (tabellen over); expo export påstått.
- `docs/native/app-spike.md:345-411` har «Wolf/BBB valg-UI (#1832)»-seksjonen med
  gate-åpningen, valg-semantikken, polling-beslutningen og seed-oppskrift ✓
  (commit 82d27c4a).
- Eier-tapptest: `VERIFICATION GAP` bokført i evidensen (eier ikke til stede) —
  samme sanksjonerte mønster som N4/#1828. Ikke verifiserbar herfra.
- Changelog-disiplin: feat/fix-commits bærer `[no-changelog]` + `Refs #1832` ✓.
- Sidefunn-issuer finnes og er åpne: #1844, #1845, #1836 (verifisert via gh).

## Guardrail-sjekkene (kodelest på branchen)

- **Ærlig note, aldri autoritativ tom tabell:** `useChoices.ts` holder `extras`
  tomt til FØRSTE vellykkede henting (feilet refetch tømmer ikke forrige svar);
  adapter svarer `missing-choices` på `undefined`, bygger på `[]`;
  `Leaderboard.tsx:49-50` viser «Fikk ikke tak i valgene …»-noten;
  `WolfChoiceCard` viser `WOLF_CHOICES_UNAVAILABLE`, `BingoBangoBongoCard` låser
  chips + notis når `loaded === false` (og BBB-låsen er ekstra motivert: upserten
  skriver alle tre kolonner, et blindt tapp ville nullet de to andre). Låst i
  `scoringContext.test.ts` (undefined→missing-choices, []→bygger) ✓.
- **Poll:** `CHOICES_POLL_MS = 10 000` ≥ leaderboardets 1500, jest-låst ≥1500;
  kun mens skjermen har fokus; umiddelbar refresh etter egen skriving. Ingen
  `channel(` i hele native-diffen; valgene rører aldri sync-køen/SQLite ✓.
- **#1830-føringene:** alle nye komponenter bruker `ui`/`COLORS`/`TAP`-tokens;
  `fontWeight` forekommer 0 ganger i diffen ✓.
- **Norsk copy:** naturlig bokmål, webbens feilmeldinger der webben har dem;
  Lone/Blind Wolf står som formattermer (sanksjonert unntak) ✓.
- **RLS-avslag:** 42501 → typet `rls_denied` → norsk setning; aldri rå
  Postgres-tekst ✓.

## Funn

1. **[major] WD-paritetsgap i wolf-/BBB-motorinput** — signatur:
   `native/app/src/lib/scoringContext.ts` (toPlayerRows) + K1.
   Appens adapter filtrerer trukne spillere UT for alle modi (låst i
   `scoringContext.test.ts:340` «holder trukne spillere ute av wolf-konteksten»),
   mens webbens `buildWolfContext`/`buildBingoBangoBongoContext` beholder dem (kun
   `users != null`-filter; verifisert at `buildModeResultForGame` sender rå rader
   inn). I wolf styrer n både rotasjonslengde og lone-/blind-pott, så et spill med
   en trukket spiller gir app-leaderboardet andre tall enn web — og appen blir
   internt inkonsistent: badge-rotasjonen beholder trukne med vilje
   (`wolfHole.ts:13-16`, eksplisitt begrunnet med web-paritet) mens
   leaderboard-konteksten fjerner dem. MEN: mønsteret er N4-presedens (nassau,
   skins, nines, round robin, acey deucey har samme avvik i dag — kun stableford/
   solo-byggerne filtrerer selv på web), kontrakten foreskrev ikke retning (nevner
   bare «withdrawn» som testtema), og avviket materialiserer seg kun i
   WD-kantfallet. Blokkerer ikke; **må bokføres som eget GitHub-issue før merge**
   (paritetsbeslutning: skal web filtrere, eller appen la være — regelen trenger
   ETT hjem, trap 4).
2. **[minor] `missing-choices`-noten er ikke render-testet** — signatur:
   `native/app/src/screens/Leaderboard.test.tsx` + K1. Ærlig-noten er låst på
   adapternivå (Type A) og i copy-oppslaget, men ingen render-test treffer
   `PROBLEM_MESSAGES`-grenen. Innenfor Type C-taket (maks 1 render-test per
   komponent) — notat, ikke krav.

## Ikke selvstendig verifiserbart (klassifisering)

- Simulator-/UI-påstandene (badge-tekster, valg-flyt, poll-oppdatering uten
  restart, skjermbilder 01-09): påstått; DB-korroborert der staging-lesing dekker.
- Jest red-run-/mutasjonsbeviset: påstått (testlesing gir uavhengig støtte).
- `npx expo export`-porten: påstått.
- Eier-tapptest på fysisk iPhone: åpent gap, korrekt bokført som restanse.

## Skjønnsvurdering

Helheten treffer kontraktens intensjon: gaten er åpnet ved å levere det som
manglet (lese-/skrivevei + UI + renderere), ikke ved å senke lista. Ingenting er
gjemt — avvik (missing-choices-navnet, BBB-fersk-status-sjekken utover webbens
bokstav) er dokumentert i kode og evidens og går i skjerpende retning.
`missing-choices`-erstatningen er i kontraktens ånd: unionen mistet
`needs-choices`-problemet slik det var (gate-surrogat), tom-men-hentet liste er
gyldig mellomresultat, og noten eies av kalleren (PROBLEM_MESSAGES). Testene
asserter adferd, ikke implementasjon. Ingen gold-plating observert; omfanget
matcher «Files Likely Touched» pluss små, godt begrunnede hjelpefiler
(actionFeedback-utvidelsen, wolfHole, leaderboardModel-tillegg).
