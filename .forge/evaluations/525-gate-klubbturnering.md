# Evaluering: #525 — Gate Klubbturnering + hev kompis-tak til 24

**Verdict: ACCEPT**

Branch `claude/crazy-saha-1feb5e`, commits `a727872`, `73da7eb`, `69c6156`. Alle ni success-criteria + fire gates verifisert uavhengig. Tamper-probe bekrefter at gating-testen faktisk fanger en brutt filter.

---

## 1. Gating-filter korrekthet — PASS

`app/admin/games/new/IntentSelector.tsx:114-119`:
```ts
const canCreateClubGame = isAdmin || isClubAdmin;
const tiles = TILES.filter(
  (tile) =>
    (tile.intent !== 'solo' || isAdmin || value === 'solo') &&
    (tile.intent !== 'klubb' || canCreateClubGame || value === 'klubb'),
);
```
- Klubb skjules med mindre `isAdmin || isClubAdmin || value === 'klubb'`. Korrekt.
- Solo-gatingen (#477) urørt og fortsatt korrekt.
- Begge predikatene er AND-et per tile, så de er uavhengige (en bruker kan se klubb men ikke solo, jf. klubb-admin-casen). Edge cases dekket: vanlig bruker (begge skjult), klubb-admin (klubb vises, solo skjult), edit-flyt (value-override).
- JSDoc på `isClubAdmin`-propen (linje 23-30) refererer #525 og forklarer rasjonale.

## 2. Begge call-sites wired — PASS (lukker latent #477-hull)

`app/admin/games/new/GameWizard.tsx`: prop `isClubAdmin?: boolean` default false (linje 120, 166). Begge `<IntentSelector>`:
- Standard 5-stegs branch (linje 521-526): `isAdmin={isAdmin}` + `isClubAdmin={isClubAdmin}`.
- isNewCupFlow 2-stegs branch (linje 466-471): `isAdmin={isAdmin}` + `isClubAdmin={isClubAdmin}`.

Diff mot 66ce3e3 bekrefter kontraktens påstand: standard-branch-selektoren manglet `isAdmin` HELT før (begge linjene er `+`-tillegg). Dette var et reelt latent #477-hull (admin så ikke «Solo / Test» i den vanlige klikk-flyten, kun via direktelenke) — nå lukket. Dokumentert i CHANGELOG Teknisk.

## 3. Helper-korrekthet — PASS

`lib/clubs/isClubAdminAnywhere.ts`:
- `'server-only'` + `getAdminClient()` (linje 1-2, 25).
- Query: `group_members` `.eq('user_id', userId).in('role', ['owner','admin'])` med join `groups(valid_until)` (linje 26-31).
- `isClubExpired`-filter via `.some(...)` (linje 36-39), håndterer PostgREST array-eller-objekt-quirk på `groups` identisk med søsken-helperen.
- Best-effort: `if (error || !data) return false` (linje 32-35), `if (!userId) return false` (linje 24).
- Speiler `lib/clubs/getClubMemberPlayerOptions.ts` (samme admin-client, samme isClubExpired-mønster, samme console.error-on-error). Konsistent.

## 4. Prop-flyt — PASS

- `app/opprett-spill/page.tsx:170`: `isClubAdminAnywhere(userId)` kjøres i `Promise.all` (linje 157-171), sendt som `isClubAdmin={isClubAdmin}` (linje 208).
- `app/admin/games/new/page.tsx:88`: ruten redirecter ikke-admin til `/opprett-spill`. Sender `isAdmin` (linje 370, shorthand), sender IKKE `isClubAdmin` → defaulter false. `canCreateClubGame = true || false = true` → klubb vises. Korrekt, bryter ikke.

## 5. Cap + format-grid — PASS

- `GameWizard.tsx:1187`: `const PLAYER_COUNT_MAX = 24;` (var 16). Stepper bruker `Math.min(PLAYER_COUNT_MAX, ...)` (1206) og `disabled={count >= PLAYER_COUNT_MAX}` (1236).
- `fitsPlayerCount` urørt. Reproduserte logikken for n=17..24:
  - n=17: 3 formats (stableford, modified_stableford, solo_strokeplay)
  - n=18/20/24: 4 formats (+ patsome på partall)
  - n=23: 3 formats
  Grid ALDRI tomt på 17-24. Stableford-familien + slagspill (solo_strokeplay) alltid til stede, jf. kontrakt. Parti-formater (skins/nassau/bbb ≤16, wolf ≤5, matchplay eksakt) faller ut som ønsket.

## 6. Copy — PASS

`lib/wizard/intent.ts:34-35`:
- kompis: `'2–4 venner som vil gjøre runden mer spennende'` → `'Gjør runden mer spennende, opp til 24 spillere'`. Ikke lenger «2–4 venner», reflekterer 24.
- klubb: `'8+ deltakere, handicap-jevner alle'` → `'For klubben din, alle medlemmer kan være med'`. Omrammet til klubb-tilhørighet.
- Ingen em-dash-kjeder, ingen særskriving, ingen AI-tells. En-dash i `2–4`/`24`-CHANGELOG korrekt brukt. Clean.

## 7. Test-kvalitet — TAMPER-PROBE PASS (ikke-tautologisk)

`IntentSelector.test.tsx` +3 tester (linje 54-89): vanlig bruker (klubb skjult), klubb-admin (klubb synlig uten global admin + solo fortsatt skjult), edit-flyt (klubb synlig via value).

**Tamper:** endret filter til `tile.intent !== 'klubb' || true || ...` (klubb alltid synlig), kjørte `npx vitest run app/admin/games/new/IntentSelector.test.tsx`:
```
Test Files  1 failed (1)
      Tests  1 failed | 5 passed (6)
```
Testen «#525: vanlig bruker ... ser bare Kompis + Cup» FEILET på linje 63 (`queryByRole klubb-turnering ... not.toBeInTheDocument` fant kortet). Nøyaktig 1 test feilet — de andre forblir grønne fordi de forventer klubb synlig eller bruker `value==='klubb'`. **Reverterte via `git checkout` — fil tilbake til committed state, worktree ren.**

## 8. Gates — PASS

- `npx vitest run app/admin/games/new/IntentSelector.test.tsx lib/wizard/fitsPlayerCount.test.ts`: **127 passed (127)**, 2 filer grønt.
- `npm run build`: **✓ Compiled successfully in 3.0s**, exit 0. (Eneste output: workspace-root-warning, urelatert/kosmetisk.)

## 9. Scope / regresjoner — PASS

`git diff 66ce3e3..HEAD --name-only`: nøyaktig de 8 forventede filene (+ contract + package-lock.json). Ingen scope creep.
- Versjon `1.106.1` i package.json (begge bumps landet).
- CHANGELOG velformet: nytt `1.106.y`-tema med begge oppføringer (1.106.0 gating + 1.106.1 tak/copy), tagline-blockquote + Teknisk-details per oppføring; forrige `1.105.y`-serie korrekt re-wrappet i `<details>` under «Tidligere versjoner».

---

## Funn / mangler

Ingen blokkere. Mindre observasjoner (ikke handlingskrevende):
- `isClubAdminAnywhere` henter ALLE owner/admin-rader og filtrerer expired i minne — fint for typisk N (én bruker eier få klubber). Ingen `.limit()`, men best-effort-helper, ikke en hot path.
- Gating er UI-only (skjuler flisen). Kontrakt scoper bevisst ikke server-side intent-validering — en bruker som POSTer `intent=klubb` direkte gates uansett av tom ClubPicker (ingen klubb å velge) → ikke en ny exploit. Akseptabelt for dette issuet.
