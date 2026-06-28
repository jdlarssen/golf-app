# Spec: Delbart resultat-/recap-kort til gruppechat (navigator.share)

GitHub issue: #942 · Milestone: «Runde 1 — Nå» · Effort: M

## Problem
Når runden er ferdig vil golferen fyre et pent recap-kort inn i WhatsApp/Messenger — vinner, egen plassering, morsomme sideturnering-seire — uten å skjermdumpe og beskjære et leaderboard. I dag har ferdige spill rike podier (`State4View` + 13 format-podier) og `result_summary`-blober, men det finnes **ingen `navigator.share` noe sted** (kun `navigator.clipboard` for join-lenker). Appens øyeblikk med høyest delbarhet lekker ut til manuell skjermdump. Vi lager et data-drevet kort-bilde og en «Del resultat»-knapp på det ferdige leaderboardet.

## Research Findings
- **`next/og` `ImageResponse` er innebygd i Next.js 16** (import fra `next/og`) — ingen ny avhengighet. Genererer PNG server-side fra JSX. Kun flexbox + et subset av CSS støttes (ingen `grid`); hver container trenger eksplisitt `display: flex`. Fonter må være ttf/otf og lastes inne i route-handleren (ikke på modul-scope i edge runtime). Maks bundle 500KB. Kilde: nextjs.org/docs ImageResponse, vercel.com/docs/og-image-generation (juni 2026).
- **Repoet bruker allerede mønsteret:** `app/icon.tsx`, `app/icon0.tsx`, `app/apple-icon.tsx` genererer PNG via `ImageResponse`. `app/icon.tsx` har en `fetchFraunces()`-helper som henter Fraunces-ttf fra Google Fonts ved request-tid, parser ut `.ttf`-URL fra CSS-svaret, og faller grasiøst tilbake til Satoris default-serif hvis fetch feiler. **Gjenbruk dette mønsteret** og legg til Inter.
- **Web Share API krever transient activation.** `navigator.share({ files })` kaster `NotAllowedError` hvis aktiveringsvinduet er tapt — kjent iOS-felle når man `await`-er for lenge mellom tap og `share()`. Avbøtning: prefetch PNG-bloben ved mount så tap-handleren deler synkront innenfor gesture-vinduet. Sjekk `navigator.canShare({ files })` før kall; fallback til nedlasting når Web Share / fil-deling ikke finnes (desktop). Kilde: MDN Navigator.share, w3c.github.io/web-share (juni 2026).
- **Recipient-vakt:** en delt *lenke* til leaderboardet ville truffet auth-veggen for ikke-medlemmer. Et delt *bilde* er selvstendig — derfor bilde-fil, ikke lenke. (Lenke-/OG-unfurl er Out of Scope.)

## Prior Decisions
- **`ImageResponse` (next/og) er allerede valgt teknologi** (`app/icon.tsx`) — gjenbruk font-fetch-mønsteret, ikke legg til `html-to-image`/`html2canvas`.
- **`result_summary` (#572)** lagres per spiller på `game_players` ved `endGame` (`lib/games/persistResultSummaries.ts`), lest billig — kilde for spillerens egen plassering + kind-routing (`placement` | `matchplay` | `skins`).
- **Matchplay-familien har bevisst ikke podium/reveal (#585).** Et 1-2-3-podium gir ikke mening for singles/fourball/foursomes — kortet må adaptere results-bandet for `matchplay`-kind, ikke tvinge inn et podium.
- **Navn rendres via `formatRevealName`** (nickname-regler); ferdige spill = full reveal. Bruk samme formatering som leaderboardet.
- **`getGameWithPlayers`** er `unstable_cache` + admin-client (RLS-bypass); cookies funker ikke i cache-callback. Bilde-routen leser spilldata herfra.

## Design

### Kortet (PNG-artefakten)
Stående recap-kort i Tørny-merkevaren (linen `#F8F6F0` bakgrunn, forest `#1B4332` tekst, champagne `#C9A961` aksent, Fraunces-serif på overskrifter/tall, Inter på UI). Fast utseende — **inverterer IKKE i dark mode** (det er et bilde). Layout (jf. godkjent mockup):

1. **Topp-chrome:** «Tørny» + champagne-dott, «Sluttresultat»-pille; turneringsnavn (Fraunces, stor), meta-linje «{dato} · {banenavn} · {antall hull}».
2. **Vinner-blokk** (champagne-tonet): champagne-disk med «1», «VINNER»-label, vinnernavn, score-linje framet av kind (se under).
3. **Podium topp 3:** rad 2 + 3 med rank-disk, navn, score (høyre-justert, tabular).
4. **«DIN RUNDE»-stripe (personlig, betinget):** se personaliserings-regler.
5. **Sideturnering-chips:** opptil 2 chips (Lengste drive / Nærmest hull N) med vinnernavn — eller «Deg» når deleren vant. Utelates rent når ingen sideturneringer finnes.
6. **Footer:** «tornygolf.no» + taglinen «Fyr opp golfturneringen på et par minutter».

### Kind-aware results-band (én kort, alle modi)
`game_mode` bestemmer bandet; spillerens `result_summary.kind` gir den personlige linja:
- **`placement`** (slag, stableford, solo-formater, lag/scramble-familien, wolf, nassau, nines, bingo-bango-bongo): vinner-blokk + podium topp 3. Score-linje = format-passende brutto/netto/poeng (gjenbruk leaderboardets eksisterende formatering).
- **`skins`**: «vinner» = flest skins; score-linje «{n} skins»; podium topp 3 etter skins.
- **`matchplay`** (singles/fourball/foursomes): **ikke** podium. Results-bandet viser deltakerens match-utfall som hero når en deltaker deler («Du vant 3&2 mot {motstander}» / «Uavgjort»). Ikke-deltaker → nøytralt «Matchplay · ferdig»-chrome med match-liste hvis billig, ellers bare navn/chrome. Lavere fidelity er akseptabelt; sprik en egen matchplay-duell-kort-issue hvis det viser seg å trenge eget design.

### Personalisering (personlig m/ nøytralt fallback)
Bilde-routen tar `?p=<userId>` (deleren). Data er et allerede-offentlig ferdig leaderboard, så param-en velger kun hvilken rad som utheves — ingen ny data-eksponering. Regler:
- **Deltaker utenfor topp 3:** vis podium topp 3 **og** en egen «Du · {X}. plass · {resultat}»-stripe under, med et lite visuelt skille (slik at det leser som et hopp ned i feltet).
- **Deltaker i topp 3:** uthev raden deres i podiet (champagne-ramme / «Deg»-markør); **ingen** ekstra stripe.
- **Ingen/ugyldig `p` (ikke-deltaker, f.eks. admin):** nøytralt kort — podium uten personlig stripe.
- `p` må valideres mot spillets `game_players`; ukjent `p` behandles som ikke-deltaker.

### Knappen («Del resultat»)
Klient-komponent `ShareResultButton` plassert i den delte leaderboard-chromen slik at **alle ferdige formater** får den med én wiring (visuell referanse: CSV-`ExportLink`-regionen i `State4View.tsx:185–198`). Oppførsel:
- Ved mount: prefetch PNG-bloben fra `share-image`-routen (med deleren sin `?p=`), hold i ref.
- Ved tap: `navigator.share({ files: [new File([blob], '<slug>.png', { type: 'image/png' })], title: gameName, text: '<kort norsk linje>' })` — synkront innenfor gesture når bloben er klar.
- `navigator.canShare({ files })` false / ingen Web Share → last ned PNG-en i stedet (samme blob).
- Best-effort: feil logges (`console.error`), blokkerer ikke noe.

### Bilde-routen
`app/[locale]/games/[id]/leaderboard/share-image/route.tsx` (søster til `export/route.ts`). Returnerer `ImageResponse` (PNG). Henter spilldata via `getGameWithPlayers` + `computeLeaderboard` (podium), sideturnering via `leaderboardContext.ts`, deler-resultat via spillerens `result_summary`. Kun `status='finished'` rendres — ellers 404 (ikke lekk pågående scores via bildet). Cache-bar (ferdig spill = stabil data); personlig variant cachear per `p`.

## Edge Cases & Guardrails
- **Ikke-ferdig / ukjent spill:** routen returnerer 404 (eller tom), aldri pågående scores i et bilde.
- **Transient activation (iOS):** prefetch blob → synkront `share()`; ikke `await` tungt mellom tap og kall.
- **Web Share utilgjengelig (desktop):** nedlasting-fallback, ikke skjult knapp.
- **< 3 spillere:** podium viser kun radene som finnes (2-spiller → topp 2). Ingen tomme rader.
- **Likt resultat (ties):** vis delt rank (samme tall) — ikke fabrikér en rekkefølge.
- **Lange navn:** Satori wrapper ikke automatisk — trunkér/ellipsis i kortet.
- **Tomme sideturneringer:** utelat chips-seksjonen rent (ingen tomme bokser).
- **Font-fetch feiler:** grasiøs fallback til Satori default (som `app/icon.tsx`), kortet rendrer fortsatt.
- **Matchplay non-participant share:** nøytralt minimum-kort (ikke krasj på manglende podium).
- **RLS:** routen bruker admin-client (som `getGameWithPlayers`); `p` valideres mot deltakerne; data er uansett world-readable for ferdige spill.

## Key Decisions
- **Server-side `ImageResponse` (next/og), ikke klient-DOM-til-bilde** — gjenbruker `app/icon.tsx`-mønsteret, pikselpresise fonter, cachebart, null ny avhengighet. (Discussion + research.)
- **Del bilde-fil, ikke lenke** — selvstendig, ingen auth-vegg for mottaker. (Research.)
- **Personlig m/ nøytralt fallback; topp 3 + egen «plass X»-stripe når utenfor topp 3** — eksplisitt brukervalg.
- **Én kind-aware kort for alle modi** — `placement`/`skins` får podium; `matchplay` får match-utfall-band. Eksplisitt brukervalg «alle modi, ett felles kort».
- **Knappen monteres i delt chrome**, ikke duplisert i 14 views.

**Claude's Discretion:**
- Eksakt bilde-dimensjon/ratio (stående, ~4:5 til 5:7 for chat/stories) og cache-headers/Next-cache-strategi.
- Om font-fetch-helperen refaktoreres ut av `app/icon.tsx` til delt `lib/og/`-modul, eller dupliseres minimalt.
- Eksakt host for knappen (delt `LeaderboardChrome` vs page-nivå) — så lenge alle ferdige formater dekkes med én wiring.
- Norsk `text`-linje i share-payloaden (kort, brand-stemme).
- Matchplay non-participant-fallbackens detaljnivå (minimum: navn + «Matchplay ferdig»).

## Success Criteria
- [ ] `share-image`-routen returnerer `200` + `content-type: image/png` for et ferdig spill, og 404 for ikke-ferdig/ukjent spill. (Verifiser: curl route → status + content-type.)
- [ ] Kortet rendrer brand-chrome (turneringsnavn, bane/dato, champagne-uthevet vinner med kind-framet score, podium topp 3, Tørny-footer). (Verifiser: render PNG, inspiser visuelt.)
- [ ] Personalisering: `?p=<deltaker utenfor topp 3>` viser «Du · X. plass»-stripe; deltaker i topp 3 utheves i podiet uten stripe; uten/ugyldig `p` er kortet nøytralt. (Verifiser: unit-tester på data-shaping + visuelt.)
- [ ] «Del resultat»-knapp finnes på alle ferdige leaderboards (alle formater) ved CSV-eksporten; tap kaller `navigator.share` med PNG som `File` når `canShare({files})`, ellers laster ned PNG-en. (Verifiser: kodelesing + staging-klikk: share-sheet på iOS/støttet, nedlasting på desktop.)
- [ ] Bildet genereres via `ImageResponse` (next/og) med Fraunces+Inter og grasiøs font-fallback (jf. `app/icon.tsx`). (Verifiser: file:line.)
- [ ] Ren data-shaping (podium topp-3-utvalg, «din plass»-stripe, `game_mode`→band-routing, sideturnering-chips) er dekket av unit-tester. (Verifiser: vitest-fil grønn.)
- [ ] Sideturnering-vinnere vises som chips når de finnes, og seksjonen utelates rent når de mangler. (Verifiser: unit-test + visuelt.)

## Gates
- [ ] `npm run build` passerer (fanger exhaustive-switch/Record-drift på `game_mode`-routing — jf. tsc-gate-felle).
- [ ] `npm run lint` passerer.
- [ ] `npx vitest run lib/games/buildShareCardData` (ny data-shaping-test) grønn, pluss co-lokerte tester for endrede filer.
- [ ] Frontend-verifisering på `torny-staging` (preview_*-verktøy): «Del resultat»-knapp synlig på et ferdig spill, `share-image`-route returnerer 200 PNG, fallback-nedlasting på desktop. (Web Share-sheet kan ikke triggers headless — verifiser knapp + route + canShare-gren.)

## Files Likely Touched
- `app/[locale]/games/[id]/leaderboard/share-image/route.tsx` — NY: `ImageResponse`-route som rendrer kortet.
- `lib/games/buildShareCardData.ts` — NY: ren data-shaping (podium topp 3, din-plass-stripe, `game_mode`→band-kind, sideturnering-chips). Unit-testet.
- `lib/games/buildShareCardData.test.ts` — NY: Type A-tester.
- `app/[locale]/games/[id]/leaderboard/ShareResultButton.tsx` — NY: klient-knapp (prefetch blob, `navigator.share`, nedlasting-fallback).
- `app/[locale]/games/[id]/leaderboard/LeaderboardChrome.tsx` (eller page-nivå) — monter knappen for alle formater.
- `lib/og/fonts.ts` — NY (valgfri): delt Fraunces+Inter-fetch refaktorert fra `app/icon.tsx`.
- `package.json` + `CHANGELOG.md` — feat → minor-bump + én Funksjon-rad.

## Out of Scope
- Deling av *lenke* med OG-unfurl (mottaker treffer auth-veggen) — deferred idé.
- Bespoke matchplay-duell-kort utover det lette varianten — egen follow-up-issue hvis nødvendig.
- Animert/video-recap, stories-spesifikke ratio-varianter.
- Redigering/tilpassing av kortet før deling.
- Endring av `result_summary`-skjema eller noen DB-migrasjon (ingen schema-endring i dette issuet).
