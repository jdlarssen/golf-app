# Spec: Splittet cup-dag — én runde, én levering (#1466)

## Problem

På en splittet cup-dag (#1441) spiller en flight 18 fysiske hull fordelt på to
host-spill: greensome hull 1–9 (front9) og best ball hull 10–18 (back9). I dag
oppfører appen seg som to separate runder:

1. Når front9 er ferdig ført viser bunnen «Lever scorekort» som primærhandling;
   broen «Videre til hull 10 · Best ball» er bare en sekundær lenke.
2. Spilleren må levere to ganger — én gang per delspill.
3. Hull-stripa øverst viser kun spillets egne 9 hull; den andre halvdelen av
   runden er usynlig utenom grensehullene.

Eier-bestilling fra generalprøven (2026-08-07): på hull 9 går man rett videre
til hull 10; levering skjer ÉN gang for alle 18 hull (på inne-spillet); og
hull-stripa viser alle 18 hull på tvers av segmentene — «som et helt vanlig
scorekort».

## Research Findings

Ingen nye eksterne API-flater — endringen komponerer mønstre som allerede står
i de berørte filene og er verifisert der i denne økten:

- `findSegmentSibling` (lib/games/segmentSibling.ts) — autorisert søsken-oppslag
  med admin-client; membership-query-en kan utvides med `submitted_at` +
  `team_number` uten ny authz-flate.
- #1453-lagkaskaden i `submitScorecard` (app/[locale]/games/[id]/submit/actions.ts)
  — admin-client-update med `.is('submitted_at', null)` + `.select()`-radtelling
  (trap #2); side-effekter gates på radantall.
- Next 16-mønstrene (server action + redirect, `revalidateTag(tag, 'max')`,
  `after()` for nudge) brukes alt i de samme filene — ingen nye konvensjoner.
- Reject-flyten (`approve/actions.ts:205`) nuller `submitted_at` → «skjul kun
  når søsken er ulevert»-betingelsen selvheler etter avvisning.
- Cup-genererte spill arver DB-default `require_peer_approval=false`
  (0001_initial_schema.sql:47, generer/actions.ts-kommentar) → stille
  søsken-levering hopper ikke over noen reell peer-godkjenningsflyt.

Ingen DB-migrasjon: alle kolonner finnes (`hole_segment`, `source_game_id`,
`submitted_at`, `team_number`).

## Prior Decisions

- #1441-designdok D3: avledede spill har ingen entry-flate — broen og stripa
  gjelder KUN host ⇄ host. `findSegmentSibling` ekskluderer alt avledet.
- #1441 owner-QA finding B: broen er navigasjon, aldri score-/datamerging.
  Står fast — stripa er også ren navigasjon (lenker til søsterspillets
  hull-sider), ingen sammenslått føring.
- #1453: én-ball-lagformat leverer per LAG (kaskade via admin-client i gatet
  action, side-effekter én gang, idempotent på 0 rader). Gjenbrukes for
  front9-greensomen.
- #1302/minne: null produktvalg til eier her — bestillingen er konkret;
  tekniske valg avgjøres i økten.

## Design

### 1. Hull-stripa viser alle 18 hull (eier-tillegget)

`app/[locale]/games/[id]/holes/[holeNumber]/page.tsx` løser i dag søsken kun på
grensehull. Endres til: løs søsken for ALLE hull når spillet er
segment-kandidat (`isSegmentSiblingCandidate`), og send med til `HoleClient`.

`HoleStrip` får en valgfri søsken-prop (f.eks.
`sibling?: { gameId: string; holes: number[] }`). Rendring: unionen av egne og
søsken-hull sortert stigende (1–18); egne hull lenker som i dag, søsken-hull
lenker til `/games/<siblingId>/holes/<n>`. `completed`-markeringen beholder
dagens posisjonssemantikk (`n < currentHole`) — nummerlinja er globalt ordnet
på tvers av segmentene, så det leser som ett vanlig scorekort. Uten søsken
(ikke-cup, trukket fra den ene halvdelen, malformet cup): dagens
segment-scopede stripe, uendret.

### 2. Hull 9: broen er primærhandlingen, ingen lever-CTA på front9

`SegmentSibling` utvides med innloggedes tilstand på søsterspillet:
`mySubmittedAt` + `myTeamNumber` (membership-query-en select-er to kolonner
til; `pickSiblingCandidate` får radene). Betingelsen som styrer alt under:

> **broModus** = spillet er front9-host OG søsken finnes OG
> `mySubmittedAt == null` på søsterspillet.

- **HoleClient bunn-CTA:** i broModus erstattes ALLE forekomster av
  «Lever scorekort» (både `isLastHole`- og `roundComplete`-grenene) med broen
  «Videre til hull 10 · <format>» (href = søsterspillets hull 10, eksisterende
  `entry.continueToSibling`-nøkkel). Den sekundære bro-lenken under
  BottomActionBar undertrykkes når primær-CTA-en alt ER broen (ellers dublett
  på hull 9). Back9-retningen («Tilbake til hull 9») beholdes som i dag.
- **PrimaryCta (game-home):** søsken-oppslaget utvides fra kun
  submitted-statene til også `ready_to_submit`. I broModus viser
  `ready_to_submit` broen som primærknapp (gjenbruk `ctaContinueToSibling`)
  i stedet for «Se over og lever»-lenken. Øvrige stater uendret.
- **Selvheling:** er søsterspillet levert men front9 ikke (typisk: admin
  avviste front9-kortet etter kaskaden), er broModus false → normal lever-CTA
  vises igjen. Direkte navigasjon til front9 `/submit` forblir mulig
  (uendret escape-luke); kaskadens `.is('submitted_at', null)` gjør
  dobbel-levering til no-op.

### 3. Én levering på hull 18 leverer begge spillene

I `submitScorecard`, etter at primær-oppdateringen har truffet >0 rader og FØR
side-effektene: hvis spillet er back9-host med tournament, løs front9-søsken
for innsenderen. Finnes den og `mySubmittedAt == null`:

- Bygg samme patch (`submitted_at`, `rejection_reason: null`). Er søsterspillets
  modus én-ball-lagformat (`isScrambleFamily || isAlternateShotMatchplay` —
  greensome er det) og `myTeamNumber != null` → lag-bred update på
  søsterspillet (#1453-formen: `eq game_id/team_number`, `is withdrawn_at null`,
  `is submitted_at null`); ellers egen-rad-update. Admin-client. `.select()` +
  radtelling; 0 rader = alt levert (race/lagkameratens kaskade) → OK, fortsett.
- **Kompensert batch:** feiler søsken-oppdateringen (error) → revert
  primær-radene som nettopp ble satt (sett `submitted_at = null` for de
  returnerte user_id-ene, admin-client) og redirect `?error=db`. Uten
  kompensasjon ville front9 stå ulevert med skjult CTA — en blindgate.
  (At en tidligere `rejection_reason` er nullet ved kompensasjon er akseptert
  kosmetisk tap.)
- Side-effekter (peer-varsler, admin-notify/mail) fyres som i dag én gang, for
  spillet action-en kjørte på (back9). Søsken-markeringen er stille — admin
  ser begge kortene i godkjenn-køen uansett.
- Revalider BEGGE spill: `revalidateTag('game-<id>')` + `revalidatePath` for
  både back9 og front9.
- Retning: kun back9 → front9. Manuell front9-levering (escape-luka) kaskaderer
  IKKE til back9.

### 4. Purring følger leveringspunktet

- **Auto-nudge** (`maybeSendDeliveryReminder`, kalles fra game-home): skal ikke
  fyre for et front9-spill i broModus (spilleren er ferdig med 9 hull men skal
  ikke levere der). Gate ved call-site eller inne i helperen — byggerens valg;
  må ikke koste et søsken-oppslag for vanlige spill.
- **Admin-purring** (`remindUnsubmittedPlayers` på front9-spillet): ekskluder
  spillere som har et ulevert back9-søsken (de purres via back9-spillet når de
  er klare der). Batch-oppslag, ikke per-spiller-loop med queries.
- `classifyDeliveryStatus` er uendret — badgen «klar, ikke levert» på
  admin-statussiden er fortsatt sann for front9.

### 5. Copy (bruker-synlig, norsk — humanizer-skill før commit)

- Submit-sida på back9-spillet får én linje som sier at leveringen gjelder
  hele runden (begge delspillene) når søsken finnes og er ulevert.
- Nye/endrede nøkler i `messages/no.json` + `messages/en.json`.

## Edge Cases & Guardrails

- **Ingen søsken** (vanlige spill, 'full'-segment, trukket fra én halvdel):
  alt oppfører seg som i dag. broModus krever aktivt medlemskap i begge.
- **Racende leveringer:** to lagkamerater leverer back9 samtidig → begge
  kaskader; `.is('submitted_at', null)` gjør taperen til 0-raders no-op uten
  side-effekter.
- **Avvist front9 etter kaskade:** `submitted_at` nulles → broModus false →
  lever-CTA tilbake på front9; hull-sidene er igjen redigerbare (side-guarden
  leser `me.submitted_at`).
- **Ufullstendig front9 ved hull 18-levering:** kaskaden gater IKKE på
  front9-kompletthet — fysisk runde er over (matchplay kan være avgjort før
  hull 9; admin-godkjenningen er kontrollpunktet). Bevisst.
- **Strip-tap på levert søsterspill:** hull-sida bouncer til game-home
  (eksisterende `me.submitted_at`-redirect) — akseptert, spillet er ferdig.
- **Perf:** søsken-oppslag på hver hull-render gjelder KUN segment-spill
  (2 indekserte admin-queries); vanlige spill betaler ingenting.
- **Skal IKKE skje:** dobbel-fyrte varsler/mail ved kaskade; lever-CTA på
  front9 i broModus; endring i 'full'-segment-spill; score-/datamerging
  mellom spillene.

## Key Decisions

- Broen erstatter lever-CTA-en på ALLE front9-hull i broModus (ikke bare hull
  9) — `roundComplete` viser CTA-en overalt, så en hull-9-avgrensning ville
  latt «Lever scorekort» stå igjen på hull 1–8 og motsi én-levering-modellen.
- Kaskaden er stille (ingen egne varsler for front9) — én fysisk handling, ett
  sett varsler; godkjenn-køen fanger begge kortene.
- Kompensasjon fremfor best-effort ved kaskade-feil (trap #5) — halv-levert
  tilstand med skjult CTA er en blindgate.
- Front9 `/submit` består som escape-luke — selvhelingen trenger den etter
  avvisning, og den er idempotent mot kaskaden.
- `ASSUMPTION` (autonom økt, I6): stripa bruker posisjonsbasert
  `completed`-markering på tvers av spillene (dagens semantikk), ikke
  score-basert — konsistent med «vanlig scorekort»-bestillingen og krever
  ingen ekstra data.

**Claude's Discretion:**
- Eksakt prop-form på HoleStrip-søsken og hvor nudge-gaten bor (call-site vs
  helper), så lenge vanlige spill ikke betaler ekstra queries.
- Om `SegmentSibling`-utvidelsen gjøres bakoverkompatibel eller alle callers
  oppdateres i samme commit (T2: alle konsumenter av typen sjekkes uansett).
- Batch-formen på admin-purre-ekskluderingen.

## Success Criteria

- [ ] Front9-spill i broModus: ingen «Lever scorekort» noe sted (hull-sider +
  game-home); primærhandling på ferdig runde er «Videre til hull 10 · <format>».
  Verifiseres i HoleClient-/PrimaryCta-tester + staging-klikk.
- [ ] `submitScorecard` på back9-hosten setter `submitted_at` på innsenderens
  back9-rad OG hele greensome-lagets front9-rader i samme kall; re-kall er
  no-op uten nye varsler. Verifiseres med action-test (mocket klient) +
  staging-DB-probe.
- [ ] Kaskade-feil reverterer back9-markeringen (ingen halv-levert tilstand).
  Verifiseres i action-test.
- [ ] Hull-stripa på et front9-spill viser 1–18 der 10–18 lenker til
  søsterspillet (og speilvendt på back9); uten søsken vises dagens 9.
  Verifiseres i HoleStrip-test (én render-test-utvidelse) + staging-klikk.
- [ ] Auto-nudge og admin-purring treffer ingen front9-spillere med ulevert
  back9-søsken. Verifiseres i test av target-utvelgelsen.
- [ ] Avvist front9-kort etter kaskade → lever-CTA-en er tilbake på
  front9-spillet (selvheling). Verifiseres i test av broModus-betingelsen.

## Gates

- [ ] `npx tsc --noEmit` grønn (worktree-lokalt, jf. minne om false-red i main)
- [ ] `npm run lint` grønn
- [ ] Co-located tester for endrede filer grønne (`npx vitest run <fil>` per
  endret modul: segmentSibling, deliveryStatus/deliveryReminder-target,
  HoleStrip, HoleClient, PrimaryCta, submit-action)
- [ ] Humanizer-skill på ny norsk copy før commit
- [ ] Versjonsbump + CHANGELOG-linje (feat, bruker-synlig)
- [ ] Staging-klikkrunde av hele flyten (før hull 1–9 → bro → før 10–18 →
  lever på 18 → begge levert) FØR merge; bevis-kommentar + label per #1076

## Files Likely Touched

- `lib/games/segmentSibling.ts` (+ test) — utvid membership-select med
  `submitted_at`/`team_number`; utvid `SegmentSibling`
- `app/[locale]/games/[id]/holes/[holeNumber]/page.tsx` — søsken-oppslag for
  alle segment-hull; strip-data
- `app/[locale]/games/[id]/holes/[holeNumber]/HoleClient.tsx` (+ test) —
  broModus i bunn-CTA; strip-props; undertrykk dublett-bro
- `components/hole/HoleStrip.tsx` (+ test) — søsken-hull med cross-game-lenker
- `app/[locale]/games/[id]/(home)/PrimaryCta.tsx` — broModus i ready_to_submit
- `app/[locale]/games/[id]/(home)/page.tsx` — nudge-gate
- `app/[locale]/games/[id]/submit/actions.ts` — søsken-kaskade + kompensasjon +
  dobbel revalidering
- `app/[locale]/games/[id]/submit/page.tsx` — «leverer hele runden»-linje
- `lib/notifications/deliveryReminder.ts` / `app/[locale]/admin/games/[id]/status/actions.ts`
  — purre-ekskludering
- `messages/no.json` + `messages/en.json` — copy

## Out of Scope

- #1449 (tre kort per runde på Hjem/arkiv) — eget åpent produktvalg hos eier.
- HoleHero-teksten «hull N · x av 9» — segmentets sannhet beholdes; evt.
  «x av 18»-omlegging er egen diskusjon.
- Admin actionItems-støy (front9 vises som «har uleverte» under runden) — hvis
  det oppleves støyende, eget issue.
- Kaskade i front9→back9-retning; score-/datamerging; endringer i avledede
  singles-spill; DB-endringer (ingen trengs).
