# Evaluering #1804 — deltaker-taket vokter spillerbyttet

Uavhengig fersk-kontekst-evaluering av `claude/deltaker-taket-regelbrudd-45c09c`
(84b30b76 + 76f61711) mot kontrakt-kommentaren på issue #1804. Alt under er
verifisert ved egen lesing og egne kjøringer i worktreet, ikke fra byggerens
bokføring.

## Verdikt: ACCEPT

Alle fem Success Criteria er oppfylt med verifiserbar evidens. Semantikken
speiler `planParticipantRosterSync` korrekt, gaten står før alle skrivinger,
den er fail-closed, og den teller riktig tabell. Funnene under er
oppfølgings-verdige, men ingen av dem er et regelbrudd mot kontrakten eller en
korrekthetsfeil i den bygde koden.

Utestående port (ikke NEEDS WORK-grunn): staging-klikk av bytte-flyten + label
før merge. Koden KAN rendre riktig — `inOptions` fylles fra
`getCupCandidatePlayers` (CupMatchList.tsx:122), ikke fra deltakerlista, så en
ikke-påmeldt reserve er faktisk valgbar og feilstien er nåbar fra UI-et.

---

## Per kriterium

### 1. Type A-test dekker kant-matrisen — OPPFYLT

`lib/cup/participantRosterSync.test.ts:99-138` — 8 `it.each`-rader, alle kjørt
og grønne (`--reporter=verbose`, se Gates):

| Rad | Dimensjoner | Forventet |
|---|---|---|
| 1 | på taket · ny reserve · ut BLIR | avvis |
| 2 | på taket · ny reserve · ut FORLATER | ok |
| 3 | under taket (23) · ny reserve · ut BLIR | ok (`>` ikke `>=`) |
| 4 | på taket · reserve ALLEREDE deltaker · ut BLIR | ok |
| 5 | ut ikke på deltakerlista (divergerte sett) | avvis |
| 6 | admin-aktør, samme input som rad 1 | ok (uncapped) |
| 7 | tom deltakerliste | ok |
| 8 | én deltaker | ok |

Alle fire kontrakts-dimensjonene er representert; rad 1 vs 2 og rad 1 vs 6 er de
diskriminerende parene. Matrisen er ikke uttømmende (8 av 16 kombinasjoner) —
se Funn F2.

### 2. Semantikk mot `planParticipantRosterSync` — KORREKT

`lib/cup/participantRosterSync.ts:104-111`:
```
const after = new Set(input.participantIds);
after.add(input.inUserId);
if (!input.outRemainsInCup) after.delete(input.outUserId);
return exceedsPersonalPlayerCap(after.size, input.actorIsAdmin);
```
Mot søsteren `planParticipantRosterSync` (samme fil, :64-67): `add` er
ubetinget (upserten er idempotent), `remove` kun når ut-spilleren ikke står i
noen cup-match. Identisk regel.

Lese-skopet stemmer også: synken leser `game_players` `.in('game_id',
allCupGameIds)` ETTER byttet (`actions.ts:732-736`); vakta leser samme skop FØR
byttet og trekker fra `writtenGameIds` (`actions.ts:667-671`, :687-689). Etter
byttet er ut-spillerens rader i `writtenGameIds` slettet — de to uttrykkene er
ekvivalente. `allCupGameIds` inkluderer matcher uansett status, likt begge
steder.

Ingen falsk avvisning ved re-add: `Set` deduper, så `inUserId` som allerede står
på lista gir uendret størrelse (rad 4).

### 3. `checkSwapParticipantCap` + kallet i `planCupMatchSwap` — OPPFYLT

- **Før alle skrivinger:** kalles `actions.ts:614-624`, rett etter
  `validateMatchSwap`. Første skriving er `game_players.delete` i try-blokka på
  `actions.ts:861-874`, altså etter at `planCupMatchSwap` har returnert. Verifisert
  ved lesing av hele `swapCupMatchPlayer` (:803-895).
- **Gaten:** `if (groupId || actorIsAdmin) return null;` (`actions.ts:658`) —
  logisk identisk med `!groupId && !actorIsAdmin`. Speiler
  `planActions.ts:317` (`if (!groupId && !isAdmin)`) eksakt.
- **Fail-closed:** `actions.ts:672-680` sjekker BEGGE lesingene, logger
  `[cup] swapCupMatchPlayer cap read failed` med begge feilobjektene, returnerer
  `{ error: 'swap_failed' }`. Ingen stille pass-through.
- **Teller riktig tabell:** `admin.from('tournament_participants').select('user_id')
  .eq('tournament_id', tournamentId)` (`actions.ts:660-663`) — samme lesing som
  `addCupParticipant` (`planActions.ts:318-321`). `game_players` leses kun for
  ut-spillerens forlater-eller-blir-avgjørelse, ikke som telle-kilde.

`in === out` kan ikke nå vakta: `validateMatchSwap` avviser med
`already_in_match` (`matchSwapValidation.ts:120-122`) før den, så
`add(in)`/`delete(out)`-kollisjonen er ikke nåbar.

### 4. De tre nye testene i `actions.test.ts` — TREFFER, IKKE TEST-TEATER

Lese-rekkefølgen er verifisert mot koden, ikke mot kommentaren:

| # | Klient | Lesing | Kilde |
|---|---|---|---|
| 1 | admin | `tournaments.group_id` | `lib/admin/auth.ts:208-212` |
| 2 | supabase | `users` (loadRole) | `auth.ts:175` |
| 3 | admin | `tournaments.created_by` | `auth.ts:177-181` (kun når `is_admin` false) |
| 4 | admin | tapped game | `actions.ts:501-505` |
| 5 | admin | `cupGames` | `actions.ts:514-517` |
| — | — | `group_members` hoppes over (groupId null) | `actions.ts:521-523` |
| 6 | admin | `inProfile` (users) | `actions.ts:529-533` |
| — | — | `getCupCandidatePlayers` — boundary-mocket, spiser ingen kø | `actions.test.ts:57-60` |
| 7 | admin | bunte-roster `game_players` | `actions.ts:581-584` |
| 8 | admin | `tournament_participants` | `actions.ts:660-663` |
| 9 | admin | ut-spillerens `game_players` | `actions.ts:667-671` |

`creatorReadsUpToRoster` (`actions.test.ts:660-667`) skyter `created_by` inn på
plass 2 i admin-køen — korrekt, siden `loadRole` går på request-klienten. De to
tak-lesingene seedes som entry 7 og 8 i admin-køen. Køen er streng FIFO
(`tests/serverActionMocks.ts:85`), så rekkefølgen er bindende.

**Avvisnings-testen asserter at INGENTING skrives** (`actions.test.ts:701-705`):
`gamePlayerCalls('delete')`, `gamePlayerCalls('insert')`,
`participantCalls('upsert')`, `participantCalls('delete')` alle `toHaveLength(0)`,
pluss `redirectMock` ikke kalt.

**Load-bearing-sjekk (uten mutasjon av koden):** uten tak-vakta ville
`PARTICIPANTS_AT_CAP` blitt poppet av `delete host`, `deleted[0].team_number`
blitt `undefined`, og køen tømt før `delete derived` →
`expectAffected` kaster → kompensering → `swap_failed`. Testen forventer
`too_many_players` og 0 delete-kall, så den kan ikke passere uten den nye koden.
Byggerens rapporterte RED-observasjon (`swap_failed`) stemmer med denne analysen.
Fail-closed-testen asserter på `console.error` med
`objectContaining({ participantsError })` — den strengen finnes kun i den nye
grenen, så heller ikke den kan passere via en annen feilsti.

### 5. i18n — OPPFYLT

Programmatisk verifisert (`node -e` over begge JSON-filene):
- `no.json` → `cup.swap.errors.too_many_players`, placeholders `["cap"]`
- `en.json` → samme nøkkel, samme placeholders `["cap"]`

`SwapMatchPlayer.tsx:45` bruker `useTranslations('cup.swap')`, så nøkkelbanen
stemmer. Special-casen står på :56-60, **før** den generiske
`t.has(key)`-mappingen på :61-63, og sender
`{ cap: MAX_PERSONAL_CUP_PLAYERS }` importert fra `lib/cup/limits` (:8). Samme
grep som presedensen `CupParticipantsList`. Ingen hardkodet 24 i teksten.

---

## Gates (egne kjøringer, Node 22)

| Kommando | Exit | Resultat |
|---|---|---|
| `npx tsc --noEmit` | **0** | ingen output |
| `npx eslint lib/cup/actions.ts lib/cup/participantRosterSync.ts lib/cup/participantRosterSync.test.ts lib/cup/actions.test.ts "app/[locale]/admin/cup/[id]/SwapMatchPlayer.tsx"` | **0** | 0 problems |
| `npx vitest run lib/cup` | **0** | 37 filer / 656 tester grønne |
| `npx vitest run "app/[locale]/admin/cup/[id]/SwapMatchPlayer.test.tsx" messages` | **0** | 3 filer / 5 tester grønne |
| `npx vitest run` (full) | **0** | **517 filer / 6984 tester grønne**, 0 «unhandled error» |
| `node scripts/weekly-release.mjs --dry-run` | **0** | #1804-notatet rendres i rettinger-skuffen |
| `npx vitest run … --reporter=verbose` | **0** | alle 11 nye tester listet som `✓`, ingen skip |

Byggerens tall (656 / 6984) er bekreftet identiske. Ingen falsk-grønn-felle
(`grep -c "unhandled error"` = 0 i begge kjøringer).

## Out of Scope — respektert

`git diff --stat $(git merge-base origin/main HEAD)..HEAD` gir 8 filer, alle
planlagte. Verifisert eksplisitt:
- `syncParticipantsAfterSwap` forekommer **0 ganger** i diff-hunkene på
  `lib/cup/actions.ts` — urørt.
- `supabase/` — ingen endringer (ingen migrasjoner, ingen RLS).
- `lib/cup/joinValidation.ts`, `lib/cup/planActions.ts`,
  `app/[locale]/admin/cup/[id]/generer/actions.ts` — alle tre urørt (tom diff).
- `exceedsPersonalMatchCap` ikke rørt.

Merk: `git diff origin/main..HEAD` viser i tillegg sletting av tre
`.forge`-filer og `docs/loops/discord-pr-kort.md`. Det er **ikke** scope creep —
branchen står på `abc191bd` mens `origin/main` har gått videre til `9e2399b2`.
Mot merge-base er diffen ren.

---

## Funn

**F1 — Klubb-cup-halvdelen av gaten er ikke isolert testet (lav).**
`if (groupId || actorIsAdmin)` har to grener. `actorIsAdmin` er dekket (Type A
rad 6 + alle eksisterende admin-swap-tester står urørt grønne). `groupId`-grenen
er kun indirekte dekket av #1718-testen (`actions.test.ts:394`), som bruker en
aktør som er **både** klubb-cup og global admin — så testen kan ikke skille
hvilken halvdel som kortsluttet. En klubb-admin uten `is_admin` på en cup på
taket er utestet. Kontraktens Type A-kriterium nevner «klubb-cup uncapped», men
den rene funksjonen tar ikke `groupId`, så dimensjonen er strukturelt utenfor
den. Ikke en korrekthetsfeil (linja er en triviell `||`), men verdt en
oppfølging.

**F2 — `it.each`-matrisen er representativ, ikke uttømmende (informativ).**
8 av 16 kombinasjoner. De utelatte er alle trivielt-`false`-tilfeller (f.eks.
«under taket + ny reserve + ut forlater»). Grensen 24/25 er dekket fra begge
sider. Ingen handling nødvendig; noteres så det ikke leses som full dekning.

**F3 — De to håndhevelsene er uenige om lese-feil (middels, egen issue).**
`addCupParticipant` (`planActions.ts:318`) destrukturerer kun `{ data: existing }`
og sjekker aldri `error`. Feiler den lesingen, blir `existing` `null`,
`distinctAfter` blir 1, og taket **feiler åpent** — samme klasse felle som
#1718-analysen beskriver for medlemskaps-guarden. Den nye vakta feiler korrekt
lukket. Kontrakten krevde fail-closed her og rørte ikke `addCupParticipant`
(Out of Scope), så PR-en gjør riktig — men divergensen bør bli et eget issue,
jf. AGENTS.md-felle 4 («en regel har ett hjem»).

**F4 — En cup som allerede står over taket blokkerer også nøytrale bytter (lav,
kontrakts-foreskrevet).** Vakta måler absolutt størrelse etter byttet, ikke
delta. En cup med 25 deltakere (nåbar via kontraktens egen aksepterte rest-kant:
synken feiler → reserven meldes på uten at frafallet fjernes) vil avvise selv et
bytte som ikke øker lista. Dette følger kontraktens design
(`exceedsPersonalPlayerCap(distinctAfter)`) og speiler `addCupParticipant`, så
det er ikke et avvik — men det er en UX-kant eieren bør kjenne: utveien er å
fjerne en deltaker i Spillere-rommet først, som feilmeldingen faktisk sier.

**F5 — De to nye lesingene er sekvensielle, ikke parallelle (kosmetisk).**
`actions.ts:660` og :667 er to separate `await`-er; en `Promise.all` ville spart
én rundtur. Resten av planfasen gjør det samme (:501, :514, :529), så koden er
konsistent med fila. Ikke verdt en endring.

**F6 — Stale JSDoc på `inOptions` (kosmetisk, pre-eksisterende).**
`SwapMatchPlayer.tsx:19` sier «Påmeldte som IKKE er i bunten fra før», men
`CupMatchList.tsx:122` fyller propen fra `getCupCandidatePlayers` — altså
venner/klubbmedlemmer, ikke deltakerlista. Kommentaren er fra før #1473 og er
ikke innført av denne PR-en. Nevnes fordi den ellers leses som at den nye
feilstien er uNåbar; det er den ikke.

**F7 — Branchen ligger bak `origin/main` (prosess).**
Base `abc191bd`, `origin/main` nå `9e2399b2`. Rebase kreves før merge.

**F8 — `.forge/contracts/1804-swap-deltaker-tak.md` er usporet (prosess).**
`git status` viser den som `??`. Søsterfilene under `.forge/contracts/` er
sporet i repoet, så bokføringen bør committes med resten.

**F9 — PR-en er korrekt merket (positivt funn).**
PR #1808 er draft, og body-en har `## Alternativer (produktvalg)` pluss
`### Alternativ A`/`### Alternativ B` — begge formene av maskin-markøren. Kortet
vil altså ikke auto-merge, som det skal være for et produktvalg.
