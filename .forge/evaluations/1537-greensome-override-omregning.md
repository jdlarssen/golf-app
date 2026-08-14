# Evaluering: #1537 — Greensome override-omregning

## VERDIKT: ACCEPT (S1–S4)

Bygge-scopet (S1–S4) er oppfylt uten blokkerende funn. S5 (staging-verifisering)
og S6 (PR med Alternativer-seksjon) er PR-tids-kriterier og STÅR IGJEN — branchen
er ikke pushet og ingen PR finnes ennå. Merk også kontraktens Ikke-mål-forpliktelse:
følge-issue for scheduled-stale-override skal opprettes ved PR.

Evaluert commit-rekke: f21af909 (kontrakt) → 5ce57d3e (test) → a3e57152 (impl).
Arbeidstre rent, ingen udokumenterte endringer.

## Kriterie-verifisering

### S1 — Ren plan-funksjon, TDD ✓
- `planGreensomeOverrideRecompute` i `lib/games/recomputeCourseHandicap.ts` er ren
  (ingen I/O). Testene i `lib/games/recomputeCourseHandicap.test.ts` bruker eksakt
  prod-fikstur: lagret 22 == formel(50,3) → 19 = formel(50,−2); team1 (14 =
  formel(12,16)) urørt; hånd-redigert (20 ≠ 22) overlever; ikke-greensome skippes;
  finished/scheduled/draft skippes.
- **Rød-først bevist:** `git show 5ce57d3e:lib/games/recomputeCourseHandicap.ts | grep -c planGreensome` = 0
  — test-commiten importerer en funksjon som ikke fantes → garantert rød.
  Test-commiten rører KUN testfilen (358 innsatte linjer).
- All formel-aritmetikk hånd-verifisert mot `Math.round(0.6*low + 0.4*high)`:
  formel(50,3)=22, formel(50,−2)=19, formel(12,16)=14, formel(16,8)=11,
  formel(50,4)=22 (no-op-case), formel(48,−2)=18 (kjede-pass 2). Alle stemmer.

### S2 — Wiring, best-effort ✓
- `recomputeCourseHandicapForUser` henter `team_number` + `game_mode` + `mode_config`,
  leser lagkameratens CH ETTER egne CH-skrivinger (det som gjør sekvensiell retting
  på tvers av kall korrekt), og vurderer KUN kamper der CH-skrivingen beviselig
  landet (`writtenCourseHandicaps` gated på `affected?.length` — 0-row-guard, I3).
- **Kan aldri kaste:** hele greensome-steget er pakket i try/catch i tillegg til
  intern feilhåndtering (partnerError → return 0, writeError → continue). Testet
  eksplisitt (feilende mode_config-skriving → `{updated: 1, overridesUpdated: 0}`).
  Alle tre call-sites (admin/spillere, profile, complete-profile) er server-actions
  → `revalidateTag` er trygg der.
- Wiring-tester i eksisterende stil (buildSupabaseMock, `__fromCalls`-API verifisert
  i `tests/serverActionMocks.ts`).

### S3 — Formel-gjenbruk ✓
- Importerer `greensomeTeamHandicap` fra `@/lib/scoring/modes/greensomeMatchplay` —
  SAMME funksjon wizarden kaller (`GenerateMatchesWizard.tsx:116`). Grep bekrefter
  ÉN definisjon (`greensomeMatchplay.ts:29`). Ingen ny 60/40-matte.
- Formelen er order-uavhengig (min/max internt) — det som gjør kjede-egenskapen
  matematisk holdbar (pass 2 gjenkjenner formel(nyA, gammelB) uansett argumentrekkefølge).

### S4 — Gates ✓ (re-kjørt selv, Node 22)
- `npx vitest run lib/games lib/scoring`: **107 filer, 2416 tester, alle grønne** (12,3s).
- `npm run build` (med pipefail): **EXIT=0**, ingen TS-feil.
- `node scripts/weekly-release.mjs --dry-run`: notatfilen `1537-greensome-lag-slag-folger-handicapet.md`
  parser og produserer korrekt CHANGELOG-linje (fail-closed-validering grønn).

## Skeptiske dybdesjekker (bestilt eksplisitt)

| Sjekk | Resultat |
|---|---|
| Likhetssjekk skriver KUN ved stored === formel(gammel egen, lagkamerat) | ✓ — `recomputeCourseHandicap.ts:185` |
| Hånd-redigert verdi tilfeldigvis lik formelen → omskrives | Ja — eksplisitt akseptert av kontrakten (retning 2-definisjonen) |
| Feil side (team1/team2-forveksling) mulig? | Nei — side velges av rettet spillers eget `team_number`; team1↔team_number=1-mappingen bekreftet mot `readTeamStrokesOverride`-dok (`greensomeMatchplay.ts:48-50`); likhetssjekk og skriving bruker samme side-nøkkel |
| Kjede-egenskap låst i test | ✓ — pass 1-output mates inn i pass 2, aritmetikk verifisert |
| Edge-tabellen | Alle ikke-N/A-rader har reell plan-test-dekning (tom config, malformed JSON ×4, teamNumber null/3, manglende CH begge veier, finished/scheduled, motstanderlag, flere kamper, kjede) |
| mode_config-merge | ✓ — `{...base, team_strokes_override}`; wiring-test asserterer at kind/team_size/teams_count/allowance_pct overlever. Json-typen OK (type alias, ikke interface — dokumentert i koden; build bekrefter) |
| revalidateTag | ✓ — kalles kun etter `affected.length > 0`, to-arg-form `('game-${id}', 'max')`, assertert i test; IKKE kalt ved hånd-redigert eller feilet skriving |
| Scope | ✓ — `lib/scoring/` urørt, `GenerateMatchesWizard.tsx` urørt; diff = impl + test + kontrakt + notatfil |

## Funn

### Blokkerende
Ingen.

### Ikke-blokkerende
1. **`lib/games/recomputeCourseHandicap.ts` + S2/edge-dekning:** wiring-grenen
   «to aktive spillere på samme side → teammate null» (`sameSide.length === 1`,
   inkl. withdrawn-filter) mangler egen wiring-test — dekket kun indirekte via
   plan-testens teammate-null-case. Lav risiko.
2. **`lib/games/recomputeCourseHandicap.ts` + likhetssjekk-presisjon:** wizardens
   forslag regnes av spillehandicap UTEN allowance (`computeSpillehandicap`,
   bevisst per #1441-kommentar), mens frosset `game_players.course_handicap` har
   `applyAllowance(games.hcp_allowance_pct)`. Har en greensome `hcp_allowance_pct ≠ 100`
   vil lagret ≠ formel(frosne) → overstyringen overlever urørt. Feilretningen er
   TRYGG (falsk negativ, aldri feil skriving), og prod-casen (allowance 100) treffes.
   Bør nevnes i følge-issuet om scheduled-stale.
3. **Pre-eksisterende (#1533, utenfor scope):** selve CH-skrivingen til
   `game_players` revaliderer IKKE `game-${id}` — kun den nye mode_config-stien
   gjør det. Endres CH uten at overstyringen endres, kan cachen servere gammel CH.
   Kandidat til eget issue.
4. **S5/S6 utestående:** ingen PR, branch ikke pushet, ingen staging-verifisering,
   følge-issue for scheduled-kamper ikke opprettet. Alt dette er kontraktsfestede
   PR-tids-plikter FØR merge — og PR-en skal per kontrakt IKKE auto-merges
   (produktvalg, `## Alternativer`-seksjon kreves).

## Gate-resultater (rå)
- vitest `lib/games lib/scoring`: 107/107 filer, 2416/2416 tester PASS
- `npm run build` (pipefail): EXIT=0
- weekly-release dry-run: notat #1537 gyldig, bump 1.232.2 → 1.233.0
