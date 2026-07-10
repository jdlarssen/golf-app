# Spec: Onboarding starter aldri på null — fremdriftsindikator på /complete-profile (#1170)

**Issue:** [#1170](https://github.com/jdlarssen/golf-app/issues/1170) · UX-psykologi-runden (goal-gradient / «aldri start på 0 %») · Flyt 1 (bli bruker)
**Type:** `feat` → MINOR-bump + CHANGELOG Funksjon-rad

## Problem

Ny-spiller-onboardingen (`/complete-profile`) er et tomt 2-feltsskjema (navn + HCP) uten
fremdriftsfølelse. Goal-gradient-effekten: fremdrift som allerede er i gang fullføres oftere
enn fremdrift fra null. Brukeren HAR allerede gjort noe (opprettet konto/verifisert e-post) —
vi teller det bare ikke. Siden skal vise tre steg der steg 1 er fullført ved ankomst.

## Research Findings (verifisert i denne økten)

- `app/[locale]/complete-profile/page.tsx:79-89` — header med `Kicker` («Velkommen til Tørny»),
  heading + subheading; skjemaet i `Card` (:91-116) har kun navn-`Input` (:100-108) og
  `OnboardingHcpField` (:110). Ingen indikator i dag.
- Porten er binær: `page.tsx:64-72` redirecter videre hvis `users.profile_completed_at` er satt —
  dvs. alle som SER siden har per definisjon steg 1 fullført og steg 2 ufullført.
- `actions.ts:66-75` stempler `profile_completed_at` ved innsending; `:25-32` bouncer
  valideringsfeil tilbake med echo-params (#748).
- Innganger: hjem-siden redirecter hit ved ufullført profil (`app/[locale]/page.tsx:176-178`);
  game-scoped invitees sendes hit med `?next=/games/[id]` (`(auth)/login/actions.ts:442-446`) —
  de er altså allerede lagt til i et spill (roster) FØR profilen er fullført.
- **Ingen delt steg-primitiv å gjenbruke:** `wizard.stepCounter` («Steg {step} av {total}»,
  `messages/no.json:977`) rendres inline i `GameWizard.tsx:1178`; cup-generatoren har sin egen
  `generate.stepIndicator` (`GenerateMatchesWizard.tsx:65`). Begge er inline-tekst, ikke komponenter.
- Copy bor i `onboarding`-namespacet (`messages/no.json` + `en.json`); `catalogParity.test.ts`
  krever identiske løvnøkler i begge.

## Prior Decisions

- **#393/#401 (profil-revamp):** små UI-primitiver med maks én Type C-render-test.
- **#1064:** onboardingen er bevisst minimal (kjønn/nivå/kallenavn fjernet) — indikatoren må ikke
  gjeninnføre skjema-vekst; den er ren presentasjon over eksisterende felt.
- **#356:** `next`-param bæres gjennom — indikatoren må ikke røre redirect-logikken.

## Design

Ny liten presentasjonskomponent `app/[locale]/complete-profile/OnboardingProgress.tsx`
(server-render-bar, ingen client-hooks nødvendig), montert mellom header og `Card` i `page.tsx`.
Tre steg, **statisk avledet** — null DB-oppslag:

1. **«Konto opprettet»** — alltid fullført (✓): brukeren er autentisert for å nå siden.
2. **«Fullfør profilen»** — aktivt steg (det er denne siden).
3. **«Spill din første runde»** — kommende steg.

Visuell form: kompakt horisontal steg-rad (tre punkter/haker + labels, eller «1 av 3 fullført»-
tekst med tre prikker) i forest/champagne-paletten; champagne-accent kun på fullført-haken.
Nye nøkler i `onboarding`-namespacet (no + en).

## Edge Cases & Guardrails

- **Steg 3-ordlyd:** «Spill din første runde» (ikke «Bli med i ditt første spill») — game-scoped
  invitees HAR allerede en game_players-rad før steg 2, så «bli med» ville vært usann/forvirrende
  rekkefølge. «Spill din første runde» er sann for alle innganger. ASSUMPTION dokumentert.
- **Ingen dynamikk:** siden vises kun i tilstanden steg1=✓/steg2=aktiv/steg3=venter (porten i
  `page.tsx:64-72` garanterer det) — derfor ingen queries, ingen props fra server-data.
- **Valideringsbounce (#748):** indikatoren er identisk før/etter bounce — den leser ingen params.
- **Skjermleser:** semantisk liste (`<ol>`) med fullført-status i tekst, ikke kun farge/ikon.
- **Mobil ≥44px gjelder ikke** (ikke-interaktiv), men raden må ikke dytte skjemaet under folden
  på liten skjerm — hold den til én kompakt linje/rad.

## Key Decisions

- **Statisk indikator, ingen DB-endring og ingen nye queries** — fremdriften er avledet av at
  siden i det hele tatt rendres. Enkleste sanne løsning (design-ankeret fra issuet, adoptert).
- **Ny co-lokert komponent, ikke delt primitiv** — det finnes ingen steg-primitiv i dag, og én
  bruksflate rettferdiggjør ikke en `components/ui/`-abstraksjon (match effort to difficulty).

**Claude's Discretion:** eksakt visuell form (prikker vs. haker vs. tallrad), om komponenten får
egen render-test (maks én, Type C — kan utelates for ren statisk markup), eksakt norsk/engelsk
ordlyd på steg-labels (post-humanizer), CHANGELOG-tagline.

## Success Criteria

- [x] `/complete-profile` viser en fremdriftsindikator med tre steg der steg 1 («Konto opprettet»)
      er markert fullført ved ankomst — indikatoren står aldri på null.
      *Bevis: `OnboardingProgress.tsx` `STEPS`-array `step1:done` (✓-glyph, `bg-accent`); montert i
      `page.tsx:92`. Staging-skjermbilde: se PR.*
- [x] Steg 2 («Fullfør profilen») er markert som aktivt; steg 3 («Spill din første runde») som kommende.
      *Bevis: `STEPS` `step2:active` (`bg-primary`, tall «2»), `step3:upcoming` (`border-border`, tall «3»).*
- [x] Ingen nye Supabase-queries i `complete-profile/page.tsx` (diff-verifiserbart: `Promise`-/
      `.from(`-kall uendret) og ingen migrasjoner.
      *Bevis: `git show HEAD -- page.tsx` = kun import + `<OnboardingProgress />`-montering; eneste
      `.from(`-kall er den preeksisterende `profile_completed_at`-porten (page.tsx:65-66). Ingen fil i
      `supabase/migrations/` rørt.*
- [x] Nye nøkler finnes i BÅDE `messages/no.json` og `messages/en.json`;
      `npx vitest run messages/catalogParity.test.ts` grønn; `/en/complete-profile` viser engelsk.
      *Bevis: `onboarding.progress.{summary,step1,step2,step3,status.{done,active,upcoming}}` i begge
      kataloger; catalogParity + complete-profile = 9/9 grønn. `/en`-visning: se PR-skjermbilde.*
- [x] Ny norsk copy er kjørt gjennom humanizer-skillet før commit.
      *Bevis: `humanizer:humanizer` kjørt på alle sju strengene — idiomatisk bokmål, ingen AI-tells,
      «aktivt steg»/«1 av 3 fullført» matcher appens eksisterende «Steg»-terminologi. Ingen endringer.*
- [ ] Staging-klikkrunde på torny-staging: fersk/nullstilt testbruker lander på `/complete-profile`
      og ser indikatoren (staging-skriv er sanksjonert: nullstill `profile_completed_at` på en
      dedikert testbruker ved behov). Skjermbilde på PR-en.

## Gates

- [x] `npx tsc --noEmit` grønn *(TSC_EXIT_OK, ingen feil)*
- [x] `npm run lint` grønn *(0 errors; 55 preeksisterende complexity-warnings i urørte filer)*
- [x] `npx vitest run "app/[locale]/complete-profile" messages/catalogParity.test.ts` grønn *(2 filer, 9/9)*
- [x] `npm run build` grønn (cacheComponents-fella: ingen `export const runtime`) *(bygde ferdig, ingen feil)*
- [x] MINOR-bump + CHANGELOG Funksjon-rad (commit-msg-hooken håndhever) *(1.187.0 → 1.188.0, Funksjon-rad lagt til; commit passerte hooken)*

## Files Likely Touched

- `app/[locale]/complete-profile/OnboardingProgress.tsx` — ny presentasjonskomponent
- `app/[locale]/complete-profile/page.tsx` — montering mellom header og Card
- `messages/no.json` + `messages/en.json` — steg-labels i `onboarding`-namespacet
- `CHANGELOG.md`, `package.json` — minor + Funksjon-rad

## Out of Scope

- Prosent-måler / «profilstyrke»-chip på `/profile` etter onboarding (LinkedIn-varianten) — egen sak.
- Dynamisk avhuking av steg 3 (krever game_players-oppslag) — indikatoren er statisk her.
- Endringer i skjemafelt, validering eller `completeProfile`-action.
- Admin-sjekklisten (#1177 — søskensak, egen kontrakt).
