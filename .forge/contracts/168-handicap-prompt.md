# Contract: Handicap-prompt før turneringsdeltakelse

**Issue:** [#168](https://github.com/jdlarssen/golf-app/issues/168)
**Type:** MINOR (bruker-synlig feature)
**Versjon:** `1.17.0` → `1.18.0`

## Problem

2026-05-24 oppdaget vi for sent at en spiller hadde stale handicap registrert. Course handicap ble dermed beregnet mot feil `hcp_index`, og hele rundens slag-allokering + netto-score ble feil. I dag har vi ingen mekanisme som minner spillere om å bekrefte handicapen før de starter en runde — `users.hcp_index` settes ved onboarding og oppdateres kun hvis spilleren selv går inn på `/profile`. For spillere som logger handicap manuelt i Golfbox uten å speile det inn i Tørny, betyr det at appen bruker en mer og mer foreldet verdi.

Course handicap fryses i `game_players.course_handicap` ved flip draft→active (admin-knapp eller auto-start på tee-off). Promptvinduet er derfor mens spillet er `scheduled` og spilleren åpner det.

## Research Findings

Ingen eksterne biblioteker er sentrale for denne featuren — alt bygges på eksisterende intern stack (Supabase JS v2 + Next.js 16 server components + `@/components/ui/Banner`-primitive + `@/lib/format/relativeTimeNb`). Verifisert intern infrastruktur:

- **Eksisterende notification-system** (`lib/notifications/*`) har 5 kinds — ikke gjenbrukt her fordi designvalget falt på inline-kort i venterommet, ikke bjelle-varsel.
- **`formatRelativeNb`** (`lib/format/relativeTimeNb.ts`) brukes av `NotificationCard.tsx` for «for 6 uker siden»-format — gjenbruk denne.
- **Next.js 16 redirect-pattern** for `?next=`-handling: `redirect(safePath)` etter validering at pathen begynner med `/` og ikke `//` (open-redirect-vern).

## Prior Decisions

- Fra [#198](https://github.com/jdlarssen/golf-app/issues/198) (`lib/admin/auth.ts`): `requireAdmin()` finnes som helper. Ikke direkte relevant her (denne featuren er spiller-flate, ikke admin), men `getServerClient()` + `supabase.auth.getUser()`-mønsteret er etablert.

## Design

### Datamodell

Ny kolonne på `users`:
```sql
alter table public.users
  add column handicap_updated_at timestamptz;

update public.users set handicap_updated_at = now();

alter table public.users
  alter column handicap_updated_at set not null,
  alter column handicap_updated_at set default now();
```

Backfill til `now()` ved migrasjon — alle eksisterende brukere starter «ferske» og får 4-uker grace før første prompt.

### Bump-punkter for `handicap_updated_at`

Tre steder oppdaterer kolonnen:

1. **`app/profile/actions.ts` (`updateProfile`)** — settes ved hver lagring (selv om `hcp_index` ikke endret seg, fordi spilleren har vært i form-en og bekreftet).
2. **`app/complete-profile/actions.ts`** — settes ved første onboarding.
3. **`app/admin/spillere/[id]/actions.ts` (admin-edit)** — settes når admin endrer noens `hcp_index`. Mens admin er der og fikser det, regnes verdien som fersk.
4. **Ny `confirmHandicap`-server-action** — «Ja, stemmer»-knappen i kortet bumper kun timestamp.

### Stale-deteksjon

Helper i `lib/handicap/staleness.ts`:
```ts
export const HANDICAP_STALENESS_WEEKS = 4;
export const HANDICAP_STALENESS_MS =
  HANDICAP_STALENESS_WEEKS * 7 * 24 * 60 * 60 * 1000;

export function isHandicapStale(
  updatedAt: Date | string | null,
  now: Date = new Date(),
): boolean {
  if (!updatedAt) return true;
  const updated = typeof updatedAt === 'string' ? new Date(updatedAt) : updatedAt;
  return now.getTime() - updated.getTime() >= HANDICAP_STALENESS_MS;
}
```

Ren funksjon, unit-tester dekker alle grener (null, fersk, akkurat-på-grensen, stale).

### UI — inline kort i venterommet

Vises **kun** når:
- `game.status === 'scheduled'`
- Spilleren er i roster (`me` er definert i `app/games/[id]/page.tsx`)
- `isHandicapStale(me-bruker.handicap_updated_at)` returnerer `true`

Layout (skissert):
```
┌──────────────────────────────────────────┐
│ Sjekk handicapen din                     │
│ Den er 24,5 — sist oppdatert for 6 uker  │
│ siden. Stemmer det fortsatt?             │
│                                          │
│ [ Ja, stemmer ]    [ Oppdater ]          │
└──────────────────────────────────────────┘
```

- Bruker eksisterende `Card`- og `Button`-primitives. **Ikke** `Banner` — `Card` gir bedre struktur for to-knappers-valg.
- Plasseres øverst i venterommet (`app/games/[id]/page.tsx`, scheduled-grenen), under header men over Hero/MailEnvelope.
- «Ja, stemmer» → server-action `confirmHandicap()` bumper `handicap_updated_at = now()`, `revalidatePath('/games/[id]')`, kortet forsvinner.
- «Oppdater» → SmartLink til `/profile?next=/games/${game.id}` — etter lagring redirectes spilleren tilbake til venterommet.

### `next`-redirect på profile-action

`app/profile/actions.ts:updateProfile` må håndtere `next`-param. Mønster:
- `<form>` rendrer skjult `<input type="hidden" name="next" value={searchParams.next}>` når `next` er gyldig (begynner med `/`, ikke `//`).
- Server-action leser `formData.get('next')`, validerer (`startsWith('/') && !startsWith('//')`), redirecter dit ved suksess. Ellers fallback til `/profile?profile=updated`.

### Tekst (norsk, kjørt gjennom humanizer)

- **Tittel:** «Sjekk handicapen din»
- **Brødtekst:** «Handicapen din er {hcp}, sist oppdatert {relativ tid}. Stemmer det?»
- **Knapp 1:** «Ja, stemmer»
- **Knapp 2:** «Oppdater»
- **Toast/bekreftelse etter «Ja»:** ingen. Kortet forsvinner, det er bekreftelse nok.

### CHANGELOG-tagline (1.18.0)

> «Hvis handicapen din er eldre enn fire uker, spør appen nå før spillet starter om den fortsatt er riktig. Da slipper du å oppdage etter runden at slag-allokeringen ble feil.»

Begrunnelse for endringer fra første utkast: «Den» → «Handicapen din» (mer standalone, bedre for skjermlesere), em-dash → komma (bisetning er ikke punchy nok til å bære em-dash), «Stemmer det fortsatt?» → «Stemmer det?» (selve prompten finnes fordi tiden har gått — «fortsatt» er redundant).

## Edge Cases & Guardrails

- **Spillet er allerede `active`/`finished`:** Kortet vises ikke — vinduet er over, course_handicap er frosset. Vi viser ikke en «for sent»-melding (det blir mas).
- **Bruker er IKKE i roster:** Allerede gated av `me = players.find(...) || notFound()` over.
- **`hcp_index = 54.0` (default fra onboarding):** Vises som «54,0» (norsk komma) — kortet hjelper akkurat denne typen bruker.
- **`handicap_updated_at` akkurat 4 uker gammel:** `>= HANDICAP_STALENESS_MS` → stale. Strict inequality ville krevd 4u+1ms, useless distinction.
- **Race: admin bumper hcp mens spilleren er på venterom-siden:** Neste page-load henter ny `handicap_updated_at` → fersk → kortet forsvinner. Akseptabel.
- **Race: spilleren tapper «Ja» mens auto-start fyrer:** Worst case er at `handicap_updated_at` bumpes etter freeze. `course_handicap` er allerede beregnet fra den verdien som var ved freeze. Ingen feilkilde.
- **`next` peker på ekstern URL:** Validering avviser (`startsWith('/') && !startsWith('//')`). Open-redirect-vern.
- **`next` mangler / er ugyldig:** Fallback til `/profile?profile=updated` (status quo).
- **JS av:** Server-action på «Ja, stemmer» fungerer uten JS (standard `<form action={...}>`-mønster). «Oppdater»-knappen er en `<a>` — fungerer.

## Key Decisions

- **Plassering:** Inline kort i `/games/[id]` scheduled venterom — mest kontekstuelt. Ingen home-banner eller in-app notification (overkill, fragmentert UX).
- **Terskel:** `HANDICAP_STALENESS_WEEKS = 4`. Konstant, ikke env-variabel — kan endres ved senere bestemmelse uten infra-touch.
- **UI:** Inline `Card` med to knapper («Ja, stemmer» + «Oppdater»). Sterk choice-architecture, ikke-blokkerende.
- **Datamodell:** Bare `users.handicap_updated_at timestamptz`. Ingen `handicap_source`-felt (kan legges til senere uten brytning). Ingen `handicap_history`-tabell (YAGNI — `game_players.course_handicap` er allerede den per-runde-frosne verdien).
- **Admin-edit bumper timestamp:** «timestamp = sist hcp ble bekreftet eller endret av noen». Hvis Jørgen fikset det, slipper spilleren prompt.
- **Oppdater-flyt:** `/profile?next=/games/[id]` — gjenbruker eksisterende form med all validering. Krever liten utvidelse av `updateProfile` for `next`-håndtering.
- **Backfill:** Alle eksisterende brukere får `now()` ved migrasjon. Ingen mas-bombe ved lansering; alle får 4-uker grace.

**Claude's Discretion:**
- Eksakt komponent-navn for kortet (foreslår `<HandicapConfirmCard />` i `components/handicap/` — ny mappe).
- Hvorvidt server-action `confirmHandicap` ligger i `app/games/[id]/actions.ts` (ny fil) eller `app/profile/actions.ts` (logisk «handicap-ting»). Foreslår førstnevnte — den hører hjemme der den brukes.
- Test-setup: Vitest unit-tester for `isHandicapStale` (rein logikk) + Playwright/integrasjons-test for hele kort-flyten kun hvis bruker eksplisitt vil ha det. Foreslår å skippe Playwright her — manuell verifisering i prod er raskere for denne størrelsen.
- Hvorvidt `confirmHandicap` skal logge til `admin_audit_log` (analogt med `handicap.confirmed` event-type) — foreslår nei, det er en spiller-action, ikke admin-action.
- Layout-detalj: skal kortet ha `tabular-nums` på hcp-tallet? Antagelig ja per design-system, men kan justeres i bygge-fasen.

## Success Criteria

- [ ] **K1:** Migrasjon `0034_users_handicap_updated_at.sql` lagt til. Kolonnen er `not null`, default `now()`, alle eksisterende rader fylt med migrasjons-tidspunkt. Verifiseres med `select count(*) from users where handicap_updated_at is null` → `0`.
- [ ] **K2:** `lib/handicap/staleness.ts` finnes med `isHandicapStale()` + konstanten. Unit-tester dekker: null/undefined → stale, akkurat på grensen (`= HANDICAP_STALENESS_MS`) → stale, 1ms før grensen → fersk, helt fersk → fersk, langt over → stale. `npm test -- staleness` passerer.
- [ ] **K3:** `updateProfile` (i `app/profile/actions.ts`), `completeProfile` (i `app/complete-profile/actions.ts`) og admin-edit (`app/admin/spillere/[id]/actions.ts`) setter alle `handicap_updated_at: new Date().toISOString()` ved UPDATE. Verifiseres ved manuell sjekk + ny unit-/integrasjons-test per action.
- [ ] **K4:** `<HandicapConfirmCard />` (eller tilsvarende komponent) rendres i `app/games/[id]/page.tsx` scheduled-grenen, KUN når `isHandicapStale(me-bruker-data.handicap_updated_at)` er true. Vises ikke for active/finished/draft. Component-/integrasjonstest dekker rendering-grenen.
- [ ] **K5:** Server-action `confirmHandicap(gameId)` finnes, bumper `handicap_updated_at = now()` for innlogget bruker, kaller `revalidatePath('/games/[id]')` eller tilsvarende slik at kortet forsvinner ved neste render. Test: simuler tap → DB-rad oppdatert → re-render → kortet borte.
- [ ] **K6:** «Oppdater»-knappen lenker til `/profile?next=/games/{gameId}`. `updateProfile` validerer `next` (`startsWith('/') && !startsWith('//')`), redirecter dit ved suksess. Ugyldig/manglende `next` → fallback til `/profile?profile=updated`. Unit-test for `next`-validering.
- [ ] **K7:** Eksisterende test-suite grønn (`npm test`). Ingen regresjon i `/profile`, `/admin/spillere`, `/games/[id]` venterom.
- [ ] **K8:** `npm run lint` + `npm run build` grønne.
- [ ] **K9:** Version bumpet `1.17.0` → `1.18.0`. CHANGELOG-oppføring under ny minor-serie `1.18.y` med stakeholder-tagline. Forrige serie (`1.17.y`) wrappes i `<details>`. Tagline kjørt gjennom humanizer mentalt.

## Gates

Kjøres etter hver chunk:

```bash
npm run lint
npm test
npm run build
```

Scope `npm test` til endrede områder underveis (`npm test -- staleness`, `npm test -- profile/actions`, osv.), full suite før evaluator.

Ingen Playwright/E2E kreves for denne — verifisering skjer manuelt i prod etter merge (per `feedback_production_only_testing`).

## Files Likely Touched

| Fil | Status | Hva |
|---|---|---|
| `supabase/migrations/0034_users_handicap_updated_at.sql` | NY | Kolonne + backfill |
| `lib/database.types.ts` | ENDRET | Regenereres etter migrasjon (eller manuell oppdatering) |
| `lib/handicap/staleness.ts` | NY | `isHandicapStale()` + konstant |
| `lib/handicap/staleness.test.ts` | NY | Unit-tester for ren logikk |
| `components/handicap/HandicapConfirmCard.tsx` | NY | UI-komponenten |
| `components/handicap/HandicapConfirmCard.test.tsx` | NY (valgfri) | Rendering-test for begge knapper |
| `app/games/[id]/actions.ts` | NY (eller utvidet) | `confirmHandicap`-server-action |
| `app/games/[id]/page.tsx` | ENDRET | Hent `handicap_updated_at` for `me`, rendre kortet i scheduled-grenen |
| `app/profile/actions.ts` | ENDRET | Bump `handicap_updated_at`, håndtere `next`-redirect |
| `app/profile/page.tsx` | ENDRET | Lese `searchParams.next`, sende inn til form |
| `app/profile/ProfileFormBody.tsx` | ENDRET | Hidden `next`-input når den finnes |
| `app/complete-profile/actions.ts` | ENDRET | Bump `handicap_updated_at` ved første lagring |
| `app/admin/spillere/[id]/actions.ts` | ENDRET | Bump `handicap_updated_at` ved admin-edit |
| `package.json` | ENDRET | `1.17.0` → `1.18.0` |
| `CHANGELOG.md` | ENDRET | Ny minor-serie `1.18.y`, forrige serie `1.17.y` wrappet i `<details>` |

## Out of Scope (eksplisitt)

- Ingen `handicap_source`-kolonne (selv/admin/import) — kan legges til senere
- Ingen `handicap_history`-tabell
- Ingen home-side-banner («Du har et kommende spill — sjekk handicapen»)
- Ingen in-app notification-kind (`handicap_stale`)
- Ingen mail-varsel
- Ingen «sesong-start»-spesial-logikk (april-prompt)
- Ingen X-spill-basert terskel («prompt etter 5 spill») — kun tid
- Ingen overstyrings-toggle (bruker kan ikke deaktivere prompten — det er hele poenget)
- Ingen logging til `admin_audit_log` ved spiller-bekreftelse

## Commits-plan (atomiske)

1. `feat(handicap): add handicap_updated_at column with backfill` — migrasjon (chore — ikke bruker-synlig alene)
2. `feat(handicap): add isHandicapStale helper + tests` — ren logikk (chore)
3. `refactor(profile): bump handicap_updated_at on profile/complete-profile/admin-edit` — alle tre actions (refactor — ingen bruker-synlig endring alene)
4. `feat(profile): handle next-redirect in updateProfile action` — `next`-håndtering (refactor — ingen bruker-synlig alene)
5. `feat(games): handicap-confirmation card on scheduled game page` — selve featuren (MINOR, version-bump-commit)

Commit 5 utløser version-bump-hooken — bumper til 1.18.0 + ny CHANGELOG-oppføring i samme commit.

## Ut-av-scope-funn å notere underveis

Hvis bygge-subagenten finner:
- Snapshot-tester på `/profile`-form som låser nåværende felt-set: oppdateres som del av K7
- RLS-policy på `users` som blokkerer egne UPDATE-er av `handicap_updated_at`: noter, men det er allerede tillatt i 0001/0002 — egne user-rader er writable for innlogget bruker
- Type-mismatch i `lib/database.types.ts` etter migrasjon: regenerér eller manuell oppdatering

Andre funn → ny GitHub-issue per `feedback_review_findings_as_issues`.
