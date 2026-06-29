# Forge-kontrakt: Putt-registrering per hull (#939)

**Issue:** [#939](https://github.com/jdlarssen/golf-app/issues/939) — Putt-registrering per hull ved siden av scoren
**Milestone:** Runde 2 — Neste (utbygging + epic-fundament)
**Branch:** `claude/festive-brattain-f6ace8`
**Effort:** L

## Problem

`scores` lagrer i dag kun `strokes`. Golfere som vil vite «hvor mange putter hadde jeg?» må føre papirlapp eller en app nummer to. Putts er døråpneren til hele ball-striking-stats-kategorien (epic #954) og det enkleste meningsfulle skrittet dit.

## Beslutninger (eier valgt 2026-06-29)

1. **Omfang:** Fangst **+ basic putte-snitt**. Vi lagrer putts per hull OG viser et putte-snitt i den personlige stats-huben (`/profile/historikk`, Statistikk-fanen).
2. **Synlighet:** **Opt-in.** En per-runde-bryter «Registrer putter» på hull-skjermen avslører putts-feltet. Skjult som default — scorekortet holdes rent for de mange som ikke fører putter.
3. **Formater:** **Kun individuelle slag/stableford.** `formatCapturesPutts(mode)` = `mode ∈ {solo_strokeplay, stableford, modified_stableford}`. Matchplay, scramble/shamble/patsome, foursomes og pot-spill (wolf/nassau/skins/…) viser **ikke** putts-felt. `best_ball` er bevisst ekskludert i v1 (lag-format) — lett å utvide senere.

### Mine tekniske valg (eier programmerer ikke — disse er mine)

- **Schema:** Ny nullable `putts int` på `scores` med `CHECK (putts between 0 and 10)`. Frikoblet fra `strokes` (ingen `putts <= strokes`-kobling — unngår rekkefølge-bugs når putter tastes før/etter slag).
- **RPC:** `upsert_score_if_newer` får ny param `p_putts int default null` (bakoverkompatibel → kan trygt påføres prod før kode-deploy) og skriver `putts` på samme rad. LWW på `client_updated_at` for hele rad-paret `(strokes, putts)` — uendret merge-modell.
- **Sync-merge:** `writeScore()` blir merge-basert: leser eksisterende lokal rad, beholder feltet som ikke oppgis (`undefined` = behold, `null` = nullstill). Slik klobrer aldri en slag-skriving en putts-verdi eller omvendt. RPC får alltid begge feltene fra den merge-de Dexie-raden.
- **Bryter-persistens:** `localStorage`-nøkkel `torny:putts:${gameId}` (boolean). Per-device, per-runde. Ingen DB-skjema for selve bryteren — putts-dataen ligger i `scores.putts`; bryteren er ren UI-affordance.
- **Stats:** Ny ren helper `lib/stats/puttsStats.ts` + ett kort i Statistikk-fanen. Kvalifiserende runde = ferdig spill med putts registrert på alle 18 hull. Snitt = gjennomsnittlig putter per kvalifiserende runde.

## Scope

**Inni scope:**
- `0123`-migrasjon: `putts`-kolonne + oppdatert `upsert_score_if_newer`.
- Sync-laget: Dexie `LocalScore`, `writeScore` (merge), `syncWorker` RPC-kall, `realtime` type + merge.
- `formatCapturesPutts(mode)`-helper i `lib/scoring/modes/`.
- Hull-UI: «Registrer putter»-bryter (kun når `formatCapturesPutts`), putts-felt per spiller, wiring til `writeScore`.
- Stats: `puttsStats.ts` + putte-snitt-kort i `/profile/historikk` Statistikk-fane + side-query for brukerens putts.
- Tester per test-disiplin (se under). Versjons-bump + CHANGELOG + humanizer på ny norsk copy.

**Utenfor scope (noter, ikke bygg):**
- `best_ball` og pot-spill putts (fremtidig utvidelse).
- Putts som konflikt-trigger i sync (kun `strokes` gir ConflictRecord, uendret).
- Per-bane/season putts-breakdown (kun ett aggregert snitt-kort i v1).
- E2E for putts-inntasting (golden-path e2e røres ikke; vurder eget @gate senere).

## Design (file-refs)

| Lag | Fil | Endring |
|-----|-----|---------|
| Schema | `supabase/migrations/0123_add_scores_putts.sql` (NY) | `alter table scores add column putts int check (putts between 0 and 10)`; `create or replace upsert_score_if_newer(..., p_putts int default null)` → skriver/returnerer `putts` |
| Types | `lib/database.types.ts` (el. generert) | `scores` Row/Insert/Update får `putts: number \| null` (regen fra staging via MCP) |
| Dexie | `lib/sync/db.ts` (`LocalScore` ~L3–12) | `putts: number \| null` |
| Write | `lib/sync/writeScore.ts` (`WriteScoreArgs` ~L3–9, fn ~L33–66) | Merge-basert; `strokes?`/`putts?` optional, behold-ved-`undefined` |
| Sync | `lib/sync/syncWorker.ts` (RPC-kall ~L39–48) | Legg til `p_putts: row.putts` |
| Realtime | `lib/sync/realtime.ts` (`ScoreRowFromDb` ~L4–12, merge ~L18–34) | `putts` i type + merge |
| Format-gate | `lib/scoring/modes/types.ts` (el. ny `puttsCapture.ts`) | `formatCapturesPutts(mode)` allow-list + test |
| UI | `components/hole/ScoreCard.tsx`, evt. ny `PuttsField.tsx` | Putts-stepper per spiller (≥44px), vises kun når bryter på |
| UI | `app/[locale]/games/[id]/holes/[holeNumber]/HoleClient.tsx` (`onSetScore` ~L561–573) | Bryter-state (localStorage) + `onSetPutts` → `writeScore({putts})` |
| Stats | `lib/stats/puttsStats.ts` (NY) | Ren snitt-beregning, kvalifiserende-runde-logikk |
| Stats | `components/stats/` + `app/[locale]/profile/historikk/page.tsx` | Putte-snitt-kort i Statistikk-fane + side-query for putts |

## Success-kriterier (evidens før avhuking)

- [ ] **K1 — Schema:** `0123`-migrasjon lagt til; `putts int CHECK 0..10` finnes på `scores` i staging. *Evidens:* MCP `list_tables`/SQL viser kolonnen + constraint.
- [ ] **K2 — RPC:** `upsert_score_if_newer` på staging tar `p_putts` (default null) og persisterer `putts`. *Evidens:* SQL-kall mot staging setter putts, `select` bekrefter; gammelt kall uten `p_putts` virker fortsatt.
- [ ] **K3 — Sync-merge:** `writeScore` bevarer det ikke-oppgitte feltet; slag-skriving nuller ikke putts og omvendt. *Evidens:* `lib/sync/writeScore.test.ts` grønn (merge-cases).
- [ ] **K4 — Sync-payload:** `syncWorker` sender `p_putts`; `realtime` merger `putts` inn i Dexie. *Evidens:* `tsc` grønn + lest diff; co-located sync-tester grønne.
- [ ] **K5 — Format-gate:** `formatCapturesPutts` true kun for {solo_strokeplay, stableford, modified_stableford}. *Evidens:* helper-test grønn (true+false-cases via `it.each`).
- [ ] **K6 — Opt-in UI:** «Registrer putter»-bryter vises kun i fangst-formater, default av, persister i `localStorage` per game; putts-felt avsløres når på og skriver via `writeScore`. *Evidens:* preview/staging-klikkrunde + skjermbilde; `tsc`/`lint` grønn.
- [ ] **K7 — Putte-snitt:** Statistikk-fanen viser putte-snitt fra kvalifiserende runder; tom-tilstand når ingen putts. *Evidens:* `lib/stats/puttsStats.test.ts` grønn + ett render-test for kortet + staging-skjermbilde.
- [ ] **K8 — Ingen RLS-regresjon:** putts arver `scores` rad-RLS (innsendt scorekort låser putts også); ingen ny kolonne-policy nødvendig. *Evidens:* lest RLS-policies + verifisert at submitted-state blokkerer putts-update mot staging.
- [ ] **K9 — Bump/CHANGELOG:** `feat` minor-bump + én Funksjon-rad; humanizer kjørt på ny copy. *Evidens:* `package.json`-diff + CHANGELOG-diff.
- [ ] **K10 — Prod-rollout (CONFIRM-GATED):** `0123` (kolonne + RPC) påført prod ETTER eksplisitt eier-bekreftelse; deretter merge. *Evidens:* eier-godkjenning i tråd + MCP-apply-bekreftelse.

## Gates (kjør scoped til endring)

```bash
npx tsc --noEmit                          # hele treet (exhaustive switches)
npm run lint
npx vitest run lib/sync lib/stats lib/scoring/modes components/stats   # + co-located for endrede filer
npm run build                             # fanger build-only feil (Next 16)
```

Staging-verifisering (K1/K2/K6/K7/K8): Supabase MCP mot `torny-staging` (ref `snwmueecmfqqdurxedxv`) + `preview_start("torny-staging")`-klikkrunde av berørt flyt.

## Test-plan (per docs/test-discipline.md)

- **Type A (TDD):** `writeScore` merge (K3), `formatCapturesPutts` (K5), `puttsStats` snitt + kvalifiserende-runde (K7). Mock kun system-grenser (Dexie).
- **Type C:** Maks **ett** render-test for putte-snitt-kortet. Ingen re-assert av Type A-tall.
- **Type B/D:** Ingen (ingen mail/PDF; golden-path e2e røres ikke).
- Forbudt: kopier-lim mock-oppsett, «mens jeg var her»-tester.

## Risiko / antakelser

- **Deploy-rekkefølge:** RPC med `p_putts default null` er bakoverkompatibel → prod-RPC kan påføres før kode-deploy uten å brekke eksisterende sync. Kode som sender `p_putts` virker straks prod har ny funksjon.
- **Migrasjonsnummer:** Verifiser `0123` er ledig mot `origin/main` før skriving (cross-branch-kollisjon).
- **LWW-kloss:** To enheter som redigerer samme spillers slag vs. putt samtidig — siste hele-rad-skriving vinner (uendret modell). Realtime holder Dexie fersk → vinduet er lite. Akseptert v1.
- **Antakelse:** `upsert_score_if_newer` SECURITY-modell verifiseres ved bygging (DEFINER vs INVOKER) — putts rir uansett samme auth-sti.
- **Prod er live (ekte brukere fra 2026-06-20):** prod-migrasjon er hard-å-reversere/utadvendt → K10 confirm-gated.

## Rollout

1. Bygg + test alt mot **staging** (K1–K9).
2. Staging-klikkrunde av hull-flyt + Statistikk-fane.
3. **Stopp, bekreft med eier** → påfør `0123` på prod (kolonne + RPC).
4. Merge PR (`Closes #939`) → Vercel deployer.
5. Closing-kommentar på #939 (Teknisk + Funksjonell).
