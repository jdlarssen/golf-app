# Spec: Sponsor og premiebord (epic #1039, del 2)

## Problem
Arrangører av klubbkvelder og kompiseturneringer har ofte premier («1. plass: middag for to») og småsponsorer som fortjener synlighet — men Tørny har i dag intet sted å legge dem inn. Premiene annonseres muntlig, sponsorene får ingen plass på tavla, og ved rundeslutt er det manuelt arbeid å koble premie til vinner. Denne delen gir arrangøren et premiebord i wizarden, viser det til spillerne før start, gir sponsorene tekstplass på live-tavla/tilskuerlenken, og kobler premie automatisk til vinner ved rundeslutt. Board-møtet 2026-07-03 rangerte dette som del 2 av «Penger i potten» (#1039).

**Avgrensning (bruker-vedtak i sesjon 2026-07-05):** Sponsorer er **tekst, ikke logo**. Appen har i dag NULL bilde-opplastings-infrastruktur (ingen Supabase Storage-bucket, ingen file-inputs, ingen `next/image` — verifisert ved scout). Logo-opplasting er skilt ut som eget oppfølgings-issue og er IKKE del av denne kontrakten.

## Research Findings (kodebase-scout, 4 parallelle agenter 2026-07-05)
- **Generisk vinner-kilde finnes:** `game_players.result_summary` (jsonb) persisteres ved endGame via `persistResultSummaries()` og bærer numerisk `rank` + `fieldSize` for alle placement-modi (`lib/scoring/resultSummary.ts:17-20`; kinds: `placement` | `matchplay` | `skins`, der placement og skins har rank). Premie→vinner-kobling kan derfor gjøres format-generisk uten per-modus-matte.
- **Sideturnering-vinnere:** `game_side_winners` (PK `game_id, category, position`) skrives av `endGameWithSideWinners()` (`app/[locale]/admin/games/[id]/avslutt/actions.ts:53-182`); `winner_user_id = null` betyr «ikke utdelt». Maks 2 LD + 2 CTP-slott (`games.side_ld_count`/`side_ctp_count`, konfigurert i wizard `useGameFormState.ts:491-500`).
- **Matchplay-familien har intet podium** (by design, `MatchplayMatchView` = duellkort) — plasseringspremier gjelder ikke der. `result_summary.kind === 'matchplay'` har ingen rank.
- **games-RLS er allerede arrangør-gated for UPDATE:** «games creator update» (0071/0092, `created_by = auth.uid()`) + «games admin update» (`is_admin()`). En jsonb-kolonne på `games` arver dette gratis — hostile PATCH fra vanlig spiller treffer 0 rader uten ny policy.
- **Tilskuer-flatene:** `/spectate/[token]`, `/embed/spill/[token]` og in-app leaderboard deler `LeaderboardChrome`/`LeaderboardShell` (med `footerSlot`) og `renderLeaderboardContent()`. Ingen `img-src`-CSP-hindring, men irrelevant siden sponsor = tekst.
- **Wizard-mønsteret fra del 1 (#1049):** state i `useGameFormState` → hidden inputs i `FormDataInputs` (`GameWizard.tsx:936-1175`) → `formData.get()` i `gamePayload.ts` → INSERT i `actions.ts:194-231`. Edit-flyten prefyller via `initialValues` — samme builders, gratis.
- **Wizarden har INTET add/remove-rad-mønster** — alle «N av noe» er faste slott (f.eks. side-counts 0/1/2). Faste premie-slott passer mønsteret.

## Prior Decisions (carry-forward)
- **#1049 (del 1):** game-nivå-skalarvalg = egne kolonner på `games`; `game_players`-livssyklus = timestamps. Gjelder fortsatt — men premier er en **bounded liste**, og der er presedensen `mode_config` (jsonb på `games`, `gamePayload.ts:844-850`) og `side_disabled_categories` (array-kolonne, 0126). Se Key Decisions.
- **#585:** matchplay ekskludert fra «sideturnering på alle score-formater» by design — men `MatchplaySideTournamentSection.tsx` finnes for spill der sideturnering faktisk er aktiv. Premie-UI følger eksisterende gating, re-litigerer den ikke.
- **5 feller (`docs/bug-prevention.md`):** live DB er fasit (trap 1); regel-én-hjem for slott-grenser (trap 4); RLS er authz-laget (trap 3).
- **Skjema-endring:** staging FØRST via Supabase MCP, verifiser, deretter prod (0107-mønsteret). Drift-CI feiler hvis types-fila er foran prod — prod-migrasjon før merge.

## Design

### Datamodell (migrasjon 0134)
`games.prizes jsonb NOT NULL DEFAULT '[]'::jsonb` + `CHECK (jsonb_typeof(prizes) = 'array' AND jsonb_array_length(prizes) <= 7)`.

Element-form (Zod-skjema i ny `lib/games/prizes.ts` — validerings-hjemmet):
```ts
type GamePrize = {
  category: 'placement' | 'longest_drive' | 'closest_to_pin';
  position: number;        // placement: 1–3; ld/ctp: 1–2
  description: string;     // premien, 1–120 tegn
  sponsor: string | null;  // sponsornavn, ≤60 tegn, null = ingen sponsor
};
```
Unikhet på `(category, position)` håndheves i Zod (ikke DB) — hele arrayen skrives atomisk sammen med games-raden.

**Hvorfor jsonb og ikke barnebord `game_prizes`:** (a) bounded på 7 elementer by design (faste slott — bruker-vedtak); (b) arver games-RLS gratis i stedet for nytt policy-sett; (c) rir på `game-${id}`-cachen i `getGameWithPlayers` uten å endre helper-formen — alle konsumenter (spill-hjem, leaderboard, spectate, embed) får den gratis; (d) atomisk skriv med games-raden = ingen multi-steg-insert å kompensere (trap 5); (e) edit-flyten er én kolonne-update, ikke diff/delete/reinsert. Vinner-kobling skjer i TS på allerede-hentet data — ingen SQL-JOIN trengs. (Scout-agenten anbefalte barnebord; overstyrt på disse punktene.)

**Regel-én-hjem:** 7-slott-taket lever i Zod + DB-CHECK → én test som asserterer at de er enige (speil `teeRatingDbCheck.test.ts`-mønsteret).

### Arrangør — premiebord i wizarden (opprett + rediger)
- Ny seksjon «Premiebord (valgfritt)» i samme steg som sideturnering-konfig, rett etter den (LD/CTP-premiefelt avhenger av counts).
- **Faste slott, ingen add/remove-rader:** 1./2./3. plass (alltid synlig for formater med podium; skjult for matchplay-familien) + ett felt per aktivt LD-slott og CTP-slott (synlig når `side_ld_count`/`side_ctp_count` > 0, følger eksisterende sideturnering-gating).
- Per slott: tekstfelt «Premie» + valgfritt tekstfelt «Sponsor». Tomt premie-felt = slottet lagres ikke. Sponsor uten premie-beskrivelse ignoreres.
- Tråkles etter del 1-mønsteret: state i `useGameFormState` (prefill fra `initialValues.prizes`), faste hidden inputs i `FormDataInputs` (`prize_placement_1_desc`, `prize_placement_1_sponsor`, `prize_ld_1_desc`, … — fast navnsett, ingen dynamisk indeksering), parses/valideres i `gamePayload.ts`, settes i INSERT/UPDATE i `actions.ts`.
- **Pruning ved lagring:** `gamePayload` beskjærer prizes til gyldige slott for valgt modus + counts (bytter arrangøren til matchplay, droppes plasseringspremier; senkes CTP-count, droppes ctp_2). Regelen bor i valideringen, ett hjem.

### Spillere — premiebord før start
- Ny delt komponent `PremiebordCard`: gruppert liste (Plasseringer med 🥇/🥈/🥉-hierarki, deretter sideturneringer), sponsor som diskret «Sponset av {navn}» per linje. Forest/champagne-stil, `font-serif` for premie-teksten.
- **Spill-hjem** (`/games/[id]/(home)`): kortet vises når `prizes.length > 0`, før og under runden.
- **Påmelding** (`/signup/[shortId]`): utvid `getGameByShortId`-feltwhitelisten med `prizes`; kompakt variant av kortet på `PublicLandingView` (uinnlogget) + `RegistrationForm`.

### Sponsorer — tekststripe på tavle-flatene
- Ny delt komponent `SponsorStrip`: «Premier sponset av {A} og {B}» — distinkte sponsornavn fra prizes, dedupe, Oxford-fri norsk oppramsing. Diskret (liten, muted), vises kun når ≥1 premie har sponsor.
- Flater: in-app leaderboard (live-tavla), `/spectate/[token]`, `/embed/spill/[token]`. Foretrukket integrasjonspunkt: `LeaderboardShell`/`footerSlot`-nivå slik at én innmontering dekker alle tre flater — builder verifiserer om chrome-en flyter gjennom spectate/embed, ellers monteres per side (embed: over `EmbedFooter`).
- `/embed/liga` røres ikke (premier er per spill, ikke per liga).

### Rundeslutt — premie kobles til vinner
- Ny ren funksjon `linkPrizesToWinners()` i `lib/games/prizeAwards.ts` (Type A-testbar): input = prizes + per-spiller `result_summary` + `game_side_winners`-rader + spillernavn; output = liste av `{ prize, winners: name[] }`.
  - Plasseringspremier: spillere med `result_summary.rank === position` (kind `placement` eller `skins`). Delt plass (flere med samme rank) → alle navn på premielinjen.
  - LD/CTP-premier: `game_side_winners`-rad med matchende `(category, position)`; `winner_user_id = null` → premien utelates fra utdelingen.
  - `kind === 'matchplay'` har ingen rank → plasseringspremier gir naturlig tomt (og finnes uansett ikke for matchplay, jf. pruning).
- Ny delt komponent `PrizeAwardsCard` («Premieutdeling»): rendres når `status === 'finished'` og minst én premie har vinner. **Ett integrasjonspunkt** i finished-tilstanden av leaderboard-innholdet (under podiet) — IKKE per-podium-redigering av ~10 podium-komponenter.

### i18n + copy
Alle nye strenger nb+en (next-intl). Premie-beskrivelser og sponsornavn er brukerdata — vises som de er (React-escaping holder; ingen mail, ingen dangerouslySetInnerHTML). Norsk copy gjennom `humanizer`-skillet før commit.

## Edge Cases & Guardrails
- `prizes = []` → featuren usynlig overalt (ingen wizard-verdi, intet kort, ingen stripe, ingen utdeling).
- Delt plassering (tiedWith): alle med rank N får premielinje N — premien dupliseres ikke i data, bare navnene listes.
- LD/CTP-slott meldt «ingen vinner» ved avslutning → premien vises i premiebordet før start, men utelates fra Premieutdeling.
- Lag-modi (`isTeam`): rank er per lag; alle lagmedlemmer med rank 1 listes på 1.-plass-premien.
- Rank > 3 finnes aldri som premie-slott; fieldSize < 3 (f.eks. 2 spillere) → 3.-plass-premie får ingen vinner og utelates fra utdelingen.
- Format-bytte i edit: pruning i `gamePayload` (se Design) — aldri foreldreløse premier i DB.
- Demo-spillet (`/demo`, #1042) har ingen prizes i datasettet → ingenting vises. Ikke rør demoen.
- Withdrawn spillere: `result_summary` skrives av eksisterende endGame-løype som allerede håndterer dem — ingen ny logikk.
- Hostile PATCH på `games.prizes` fra vanlig spiller → 0 rader via eksisterende games-UPDATE-policyer (verifiser med #440-riggen; ingen ny policy forventes).
- Share-image/round-report (#1008) endres IKKE — premier er utenfor de flatene i denne runden.

## Key Decisions
- **Sponsor = tekst, ikke logo** (bruker-vedtak): logo-opplasting er greenfield infra (Storage-bucket + RLS + upload-UI + validering) og skilt ut som eget issue.
- **Faste slott 1.–3. + LD/CTP** (bruker-vedtak): matcher podiets tre trinn og side-counts; ingen add/remove-UI.
- **Visning før start på spill-hjem + påmelding, sponsorstripe på tavle-flatene** (bruker-vedtak).
- **jsonb-kolonne, ikke barnebord** (Claude, mot scout-anbefaling): bounded liste + RLS-arv + cache-gratis + atomisk skriv — se Design for full begrunnelse.
- **Én delt Premieutdeling-seksjon, ikke chips i hver podium-komponent** (Claude): ~10 podium-varianter finnes; ett integrasjonspunkt holder scope nede og gir konsistens. Idé-kortets «på podiet» tolkes som «i finished-visningen, under podiet».
- **Ingen ny notification-kind** (Claude): `game_finished`-varselet finnes allerede; premieutdeling er visning, ikke hendelse. Unngår NotificationKind-migrasjons-gotchaen fra del 1.

**Claude's Discretion:**
- Eksakt plassering av premiebord-seksjonen i wizard-steget og felt-copy (humanizer-vasket).
- Kompakt vs full `PremiebordCard`-variant på signup-flaten.
- «Delt N. plass»-copy i utdelingen.
- Om `SponsorStrip` monteres i chrome-en eller per flate (avhengig av hva verifiseringen av spectate/embed-flyten viser).

## Success Criteria
- [x] Migrasjon **0136** (0134/0135 var tatt) legger til `games.prizes` (jsonb, default `[]`, CHECK array + ≤7). Påført staging; CHECK verifisert (`games_prizes_check`: `jsonb_typeof=array AND length<=7`). Types hand-lagt (`prizes?: Json` i games Row/Insert/Update) — prod `gen:types` kjøres pre-merge.
- [x] Arrangør fyller premie + sponsor for 1.–3. plass + aktive LD/CTP i **opprett** (GameWizard→FormDataInputs) **OG rediger** (GameForm hidden-cluster). Parse+prune i begge actions; prefill via `editGameInitialValues` + `prizes` i begge edit-SELECTs. Unit-testet (`parsePrizesFromFormData`). *Staging-klikkrunde eier-utsatt (se Gates).*
- [x] Matchplay: `PrizesSection` `hasPodium = !isMatchplayFamily(gameMode)` skjuler plasseringsfelt; LD/CTP følger `sideEnabled`+counts. `prunePrizes` dropper placement for matchplay (unit-testet).
- [x] `PremiebordCard` på spill-hjem (venterom+aktiv) + `/signup` (uinnlogget kompakt i `PublicLandingView` + innlogget); komponenten returnerer null når tom (gated `prizes.length>0`).
- [x] `SponsorStrip` på in-app leaderboard + `/spectate` + `/embed/spill`; returnerer null uten sponsor (deduplisert, `Intl.ListFormat`).
- [x] Avsluttet spill: `PrizeAwardsCard` via `buildPrizeAwards`→`linkPrizesToWinners` (rank + `game_side_winners`). Unit-testet: delt plass, manglende vinner, matchplay, fieldSize<3, lag, skins. Montert på best-ball/stableford/solo-strokeplay-podiene (ett utregningspunkt); resterende podium-formater skilt ut til **#1119**.
- [x] Hostile PATCH på `games.prizes` fra vanlig spiller = **0 rader** (staging, simulert JWT via MCP); skaper = 1 rad; DB-CHECK avviser 8-element array (SQLSTATE 23514). Ingen ny policy — row-level games-UPDATE dekker kolonnen.

## Gates
- [x] `npm run build` — exit 0 (tsc + Next build).
- [x] `npx vitest run` — 4671 grønne (375 filer). Berørte: `prizes` Zod (Type A), `linkPrizesToWinners` (delt plass/manglende/lag/matchplay/fieldSize<3), Zod↔DB-CHECK-enighetstest, `gamePayload`-pruning (Type A).
- [x] `npm run lint` — 0 errors (54 pre-eksisterende complexity-warnings, urørte filer).
- [x] Bilingual nb+en next-intl-nøkler (`wizard.sections.prizes` + `prizes`-namespace); `catalogParity`+`apostropheParity` grønne. Ny copy egen-vurdert mot copy-style (kort, idiomatisk, action-orientert).
- [ ] **Staging-klikkrunde FØR merge** — eier-utsatt (den siste manuelle milen; datalaget er MCP-verifisert). Anbefalt: `/staging-verify` PR #1120.
- [~] DB-migrasjon: **staging påført + verifisert** (RLS + CHECK bevist via MCP). **Prod pre-merge** krever eier-godkjenning (prod-brannmur #1074) + `npm run gen:types` mot prod (drift-CI).

## Files Likely Touched
- `supabase/migrations/0134_game_prizes.sql` — jsonb-kolonne + CHECK
- `lib/database.types.ts` — regenerert
- `lib/games/prizes.ts` — Zod-skjema + `GamePrize`-type + parse/prune-helpers (+ test)
- `lib/games/prizeAwards.ts` — `linkPrizesToWinners()` (+ test)
- `app/[locale]/admin/games/new/useGameFormState.ts` — prize-slott-state (speil entryFeeKr)
- `app/[locale]/admin/games/new/GameWizard.tsx` — FormDataInputs hidden inputs
- `app/[locale]/admin/games/new/sections/PrizesSection.tsx` — ny seksjon (ved sideturnering-konfig)
- `lib/games/gamePayload.ts` — parse + pruning
- `app/[locale]/admin/games/new/actions.ts` — INSERT/UPDATE-kolonne
- `lib/games/getGameByShortId.ts` — `prizes` i whitelisten
- `app/[locale]/signup/[shortId]/…` — PremiebordCard (kompakt) i PublicLandingView + RegistrationForm
- `app/[locale]/games/[id]/(home)/page.tsx` — PremiebordCard
- `components/**/PremiebordCard.tsx` + `SponsorStrip.tsx` + `PrizeAwardsCard.tsx` — nye delte komponenter
- `app/[locale]/games/[id]/leaderboard/leaderboardContent.tsx` (+ evt. `LeaderboardChrome.tsx`) — SponsorStrip + PrizeAwardsCard-integrasjon
- `app/[locale]/spectate/[token]/page.tsx` + `app/[locale]/embed/spill/[token]/page.tsx` — SponsorStrip hvis ikke dekket via chrome
- i18n nb+en-kataloger — nye nøkler
- `package.json` + `CHANGELOG.md` — feat, **minor** bump, én Funksjon-linje

## Out of Scope (denne delen)
- **Sponsorlogo-opplasting** (Storage-bucket, upload-UI, next/image) — eget oppfølgings-issue (opprettes i samme runde som denne kontrakten)
- Premie-notifikasjoner til vinnere (game_finished dekker)
- Premier i share-image / rundereferat (#1008-flatene)
- Liga-/cup-nivå-premier og `/embed/liga`-sponsorflater
- Premieverdi i kr / premiepott-aggregering
- Vipps-API / integrert betaling (fortsatt ute, jf. del 1)
