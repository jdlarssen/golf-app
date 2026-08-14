# Kontrakt: #1537 — Greensome: handicap-omregning skal treffe auto-foreslått team_strokes_override

**Issue:** [#1537](https://github.com/jdlarssen/golf-app/issues/1537)
**Branch:** `claude/1537-greensome-override-recompute`
**Type:** fix (scoring-korrekthet). **Produktvalg finnes (retning 1/2/3 i issuet) →
PR-en får `## Alternativer (produktvalg)`-seksjon og auto-merges IKKE.**

## Rotårsak

`mode_config.team_strokes_override` på greensome-kamper fylles ut ved match-generering
(`greensomeTeamStrokesDefault` i `GenerateMatchesWizard.tsx` ~109) som et FROSSET tall
avledet av spillernes handicap. #1533-omregningen (`recomputeCourseHandicapForUser` i
`lib/games/recomputeCourseHandicap.ts`) oppdaterer `game_players.course_handicap` ved
handicap-retting, men overstyringen står — `computeFoursomesCore` bruker overstyringen
og ignorerer da banehandicapene helt. Prod-case (Ryder Cup 2026, Greensome 2): lagret
22 = formel(50, 3) med gammel feil CH; riktig 19 = formel(50, −2).

## Avgjørelse — retning 2 (bygges som Alternativ A)

**Regn om overstyringen KUN når lagret verdi er identisk med det formelen gir med de
GAMLE frosne banehandicapene** (dvs. verdien er beviselig det urørte auto-forslaget).
Hånd-redigerte verdier overlever alltid. Presedens: prod-casen matchet forslaget eksakt.

- **Hjem:** utvid `recomputeCourseHandicapForUser`/`planHandicapRecompute`-pipelinen i
  `lib/games/recomputeCourseHandicap.ts` (alle tre call-sites fra #1533 får dermed
  greensome-dekning gratis). Ren plan-funksjon først (Type A, TDD) — f.eks.
  `planGreensomeOverrideRecompute(...)`.
- **Formelen har ETT hjem:** gjenbruk den eksakte funksjonen genereringen bruker
  (issuets verifisering: `greensomeTeamHandicap(50, 3) === 22`). Finn dens eksport
  (I1 — verifiser navn/plassering ved bygging; wizarden kaller den); IKKE dupliser
  60/40-matte.
- **Kjede-egenskap:** rettes begge lagkamerater sekvensielt, matcher pass 2 verdien
  pass 1 skrev (formel(nyA, gammelB)) → oppdaterer videre til formel(nyA, nyB).
- **Scope: kun `active` spill** (samme regel som CH-omregningen: `finished` er
  historikk, `scheduled` har ikke frosne CH-er å sammenligne med — genererings-
  inputene er ikke lagret). Restrisiko for scheduled-kamper dokumenteres som eget
  følge-issue ved PR (se Ikke-mål).
- **Skriving:** `games.mode_config` merges via admin-client (samme klient som
  CH-skrivingen). Etter skriving: `revalidateTag(\`game-${id}\`, 'max')` for berørte
  kamper — enumerér konsumenter (hull/leaderboard leser mode_config via cachen;
  cup-snapshot leser direkte service-role).

## Suksesskriterier

- [ ] **S1:** Ren plan-funksjon med Type A-tester skrevet FØRST, fikstur = prod-tallene
      fra issuet: formel(12,16)=14 urørt lag → urørt; lagret 22 == formel(50,3) →
      omregnes til formel(50,−2)=19; hånd-redigert verdi (≠ formel(gamle)) → urørt;
      ikke-greensome-modus → aldri rørt; finished/scheduled → aldri rørt.
      **Evidens:** testfil + vitest-output; test-commit før impl-commit.
- [ ] **S2:** Wiring i `recomputeCourseHandicapForUser`: henter lagkameratens CH +
      mode_config for brukerens aktive greensome-kamper, skriver omregnet override
      og revaliderer cache-tags. Best-effort (aldri kast — samme kontrakt som resten
      av funksjonen). **Evidens:** diff + wiring-test i eksisterende
      `recomputeCourseHandicap.test.ts`-stil.
- [ ] **S3:** Formel-gjenbruk verifisert: plan-funksjonen importerer samme funksjon
      som genereringen bruker — ingen ny 60/40-implementasjon. **Evidens:** import-sti
      i diff; grep viser én formel-definisjon.
- [ ] **S4:** Gates: `npx vitest run lib/games lib/scoring` + tester for evt. andre
      endrede filer + `npm run build`. **Evidens:** output.
- [ ] **S5:** Staging-verifisering med klonet defekt-data:
      `scripts/clone-cup-to-staging.mjs` (default = Ryder Cup 2026, har den EKTE
      defekten). Rett handicapet til spilleren via admin-flaten → verifiser med SQL at
      overstyringen for laget hans gikk 22 → 19 og at kamp-leaderboardet gir slag på
      SI 1–5 (ikke 1–8). **Evidens:** bevis-kommentar på PR + label.
- [ ] **S6:** PR-body har `## Alternativer (produktvalg)`-seksjon: A = retning 2
      (bygget), B = retning 1 (lagre auto/hånd-flagg — krever skjema), C = retning 3
      (kun varsel til arrangør). Fordeler/ulemper ×2–3 per alternativ,
      ombyggingskostnad, reversibilitet, svar-instruks. **Evidens:** PR-body.

## Gates

- `npx vitest run lib/games` (+ endrede filers co-located tester) + `npm run build`.
- Node 22 først.

## Edge-case-tabell

| Input-klasse | Forventet |
|---|---|
| Lag uten override (mode_config tom) | Urørt — ingenting å omregne |
| Lagret == formel(gamle CH-er) | Omregnes til formel(nye) |
| Lagret ≠ formel (hånd-redigert) | Urørt |
| Begge lag i samme kamp, kun ett lag har den rettede spilleren | Kun det lagets side omregnes |
| Rettet spiller i flere greensome-kamper | Hver kamp vurderes separat |
| Lagkamerat mangler CH (null) | Urørt (ingen formel-input) — som CH-planens teeRatings-guard |
| finished / scheduled kamp | Aldri rørt |
| Sekvensiell retting av begge på laget | Kjeder korrekt (S1-testen låser dette) |
| Timezone | N/A |

## Ikke-mål

- Ingen skjema-endring (retning 1 er Alternativ B, bygges kun på eier-svar).
- Ingen arrangør-varsling (retning 3 er Alternativ C).
- Scheduled-kamper med stale override mellom generering og start: EGET følge-issue
  opprettes ved PR (med milestone) — ikke bygges her.
- Prod-dataene i Greensome 2: allerede håndtert separat per issuet — røres ikke.

## Commit-disiplin

Atomiske commits med `Refs #1537`. Fix-commit trenger `.changes/1537-<slug>.md`
(type: fix). Test-commit FØR impl-commit for S1.
