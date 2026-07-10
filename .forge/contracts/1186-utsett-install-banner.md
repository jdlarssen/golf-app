# Spec: Utsett PWA-install-banneret til etter verdi (#1186)

## Problem

`InstallBanner` monteres øverst på Hjem (`app/[locale]/page.tsx:88`) og dukker opp ved
FØRSTE innloggede hjem-besøk (med mindre standalone eller avvist). Den gater ikke innhold
og er avvisbar — men den er det første over folden, før spilleren har fått noe verdi.
UX Peak-prinsipp **resiprositet (timing)**: gi verdi før du ber. Til kontrast er
`PushNudge` velplassert — den spør først *etter* at appen er installert. Vurdering:
svak/lav prioritet (banneret gater ingenting), men timingen kan gjøres «verdi-først».

## Research Findings

- `components/pwa/InstallBanner.tsx` — klient-komponent, ingen props. `return null` ved
  `status==='standalone'` og ved avvist. Avvis-persistens: `localStorage`-nøkkel
  `torny-install-banner-dismissed` (`DISMISS_KEY:8`), lest via `useSyncExternalStore`
  (`getSnapshot:15-21`); `getServerSnapshot=true` (:22-24) hindrer SSR-blafring; `dismiss()`
  (:39-46) setter nøkkel + dispatcher event.
- Kallsted: `app/[locale]/page.tsx:88` `<InstallBanner />`, rendret direkte OVER `HomeBody`-Suspensen.
  `HomeBody` (:140+) henter aktive + finished games, men `InstallBanner` mottar ingen server-data. →
  Server-avhengig trigger krever plumbing; klient-teller gjør ikke.
- `PushNudge`-mønsteret (`components/pwa/PushNudge.tsx:20-34`): `useEffect` gater på `isStandalone()`
  + touch + `localStorage`-dismiss før den viser seg — referanse for «spør etter verdi», klient-side.

## Prior Decisions

- **#1186 eier-ok:** loggført som tynt/grensetilfelle etter eier-godkjenning — bygg mildt,
  ingen regresjon for eksisterende avvis-oppførsel.
- **PushNudge (#24):** etablert «post-verdi»-nudge-mønster; InstallBanner skal nærme seg det.
- **`getServerSnapshot=true`-mønsteret:** banneret skjules default til klient-state er lest —
  hold det invariant så ingen SSR-blafring oppstår.

## Design

Gate `InstallBanner` på et lett «verdi-mottatt»-signal FØR første visning. Anbefalt trigger
(Claude's Discretion mellom a/b):

- **(a) Andre+ innloggede hjem-besøk** (anbefalt): tell hjem-besøk i `localStorage`
  (ny nøkkel, f.eks. `torny-home-visits`). Inkrementér i `useEffect` på mount; vis banneret
  først når teller ≥ 2. Rent klient-side, null server-plumbing, matcher issuets «andre
  hjem-besøk»-forslag og PushNudges filosofi. Enklest som oppfyller «gi før du ber».
- **(b) Etter første leverte scorekort:** krever å tråde en server-beregnet flagg
  (`hasSubmittedScorecard`) fra Hjem ned i komponenten — mer presist «verdi»-signal, men mer
  invasivt (ny prop + fetch/gjenbruk av finished-data). Velg kun hvis (a) føles for tynt.

Behold ALL eksisterende skjul-logikk uendret: `status==='standalone'` → null, avvist → null,
`getServerSnapshot=true`-anti-blafring. Den nye gaten er et TILLEGG (AND), ikke en erstatning.

## Edge Cases & Guardrails

- **Standalone (allerede installert):** fortsatt `return null` uendret — den nye telleren må
  aldri overstyre standalone-sjekken.
- **Allerede avvist:** brukere med `torny-install-banner-dismissed='1'` ser aldri banneret
  igjen — ingen regresjon (dismiss-sjekken beholdes først).
- **`localStorage` utilgjengelig (privat modus):** teller feiler lukket → banneret vises som
  før (fail-open, samme try/catch-mønster som eksisterende kode). Ingen krasj.
- **Ingen SSR-blafring:** ny teller leses klient-side i `useEffect`/`getSnapshot`, aldri i
  server-render — hold `getServerSnapshot`-invarianten.

## Key Decisions

- **Trigger (a) hjem-besøksteller** som default — enklest, ingen server-avhengighet, matcher
  issuets forslag. (b) kun hvis eier vil ha «verdi» strengere bundet til faktisk spill.
- **Additiv gate** — eksisterende standalone/dismiss/anti-blafring rører ikke.

**Claude's Discretion:**
- Terskel: 2. besøk vs 3. — velg det som føles «gitt verdi» uten å gjemme banneret for lenge.
- (a) vs (b) — dokumentér valget i kode-kommentar med #1186-ref.
- Om telleren skal nullstilles ved noe (nei anbefalt — monotont enklere).

## Success Criteria

- [ ] Ved FØRSTE innloggede hjem-besøk (ny bruker, ikke-standalone, ikke-avvist) vises
      `InstallBanner` IKKE — verifisert på staging (fersk localStorage).
- [ ] Ved 2.+ hjem-besøk (eller valgt (b)-signal) vises banneret som før — staging.
- [ ] Standalone-modus → banneret vises aldri (uendret) — verifisert.
- [ ] Bruker som alt har avvist (`torny-install-banner-dismissed='1'`) ser det aldri igjen
      (ingen regresjon) — verifisert.
- [ ] Ingen SSR-hydrerings-blafring (banneret popper ikke inn/ut ved lasting).

## Gates

- [ ] `npx tsc --noEmit` + `npm run lint` grønn.
- [ ] `npx vitest run components/pwa` (co-located; ingen ny render-test krevd — logikk-gate
      er triviell, dekk med manuell staging-verifisering).
- [ ] `npm run build` grønn.
- [ ] Bruker-synlig → staging-klikkrunde av hjem-flyten (fersk + retur-besøk) før merge.
- [ ] `feat` → MINOR-bump + CHANGELOG-linje (evt. `fix`/`[no-changelog]` hvis vurdert intern
      timing-justering — men banneret-forsvinner-ved-første-besøk er bruker-synlig).

## Files Likely Touched

- `components/pwa/InstallBanner.tsx` — ny besøks-/verdi-gate (klient-side teller).
- (kun ved (b)) `app/[locale]/page.tsx` — tråd `hasSubmittedScorecard`-flagg ned.
- `package.json` + `CHANGELOG.md`.

## Out of Scope

- Endring i `PushNudge`-timingen (allerede velplassert).
- Ny install-CTA andre steder i appen.
- A/B-testing av terskelen (ingen telemetri-plattform, #1007-presedens).
- Redesign av bannerets utseende/copy.
