# Kontrakt: Lokaliser delbart resultatkort for engelsk locale

**Issue:** [#971](https://github.com/jdlarssen/golf-app/issues/971) (#942-oppfølging)
**Type:** i18n-lekkasje-fiks + strukturell refaktor (samme mønster som #572/resultSummary)
**Berører:** `lib/games/buildShareCardData.ts` (+ test), `app/[locale]/games/[id]/leaderboard/share-image/route.tsx`, `messages/no.json` + `messages/en.json`
**Bump:** MINOR (ny bruker-synlig adferd: engelsk delekort) → én Funksjon-linje i CHANGELOG

## Problem

Delekortet (#942, `next/og` `ImageResponse`-route) viser **kun norsk copy**, også på engelsk locale. To kilder til norsk:
1. `buildShareCardData.ts` baker norske strenger inn i modellen: `"{n} poeng"` (linje 110/118/173/185-206/215/224/233), `"{n} skins"` (97), `"Spiller"`-fallback (314), `"Uavgjort"` (359/373), `"Vant {margin}"` (364), `"Tapte {margin}"` (366), `"{winner} vant {margin}"` (378).
2. `share-image/route.tsx` hardkoder norske etiketter i JSX: «Sluttresultat» (278), «Spillet er ferdig» (308), «VINNER» (419), «MATCHPLAY» (548), footer-tagline (362), og bruker `osloDate` med hardkodet `'nb-NO'` (105-116). `locale`-param finnes (158) men brukes kun til `localizeGameName` (194).

## Design

Prinsipp (jf. [#572](https://github.com/jdlarssen/golf-app/issues/572) / `lib/scoring/resultSummary.ts`): **`buildShareCardData` returnerer strukturert data, ikke ferdig-formaterte strenger. Routen formaterer via `getTranslations(locale)`.**

### 1. `buildShareCardData` → strukturert

Bytt de norske strengfeltene i `ShareCardModel`/`ShareCardRow`/`match` til strukturerte felt, f.eks.:
- Poeng/skins: `scoreValue: number` + `scoreKind: 'points' | 'skins' | 'placement'` (i stedet for `"{n} poeng"`/`"{n} skins"`-strenger). Vs-par-tallet (−2/E/+3) er locale-nøytralt og beholdes som i dag.
- Navn-fallback `"Spiller"` (linje 314): returner `null`/tom, la routen sette locale-riktig fallback — ELLER behold som strukturelt flagg. (Velg minste endring; fallback-navn vises sjelden.)
- Matchplay `match`: returner `{ outcome: 'won'|'lost'|'tied', marginThruLabel: string|null, headlineKind: 'won'|'lost'|'tied', winnerName: string|null }` i stedet for ferdige «Vant …»/«Tapte …»/«… vant …»-strenger. `marginThruLabel` (selve margin-tallet som «3&2»/«1 up») er locale-nøytralt golf-notasjon og kan beholdes som streng.

### 2. Routen formaterer via next-intl

I `share-image/route.tsx`:
- `const t = await getTranslations({ locale: resolved, namespace: 'leaderboard.shareCard' })` (resolved via `hasLocale(routing.locales, locale) ? locale : routing.defaultLocale`, samme mønster som [layout.tsx:50-53](app/[locale]/layout.tsx)).
- Erstatt hardkodede JSX-etiketter med `t('winner')`, `t('matchplay')`, `t('finalResult')`, `t('gameFinished')`, `t('points', {n})`, `t('skins', {n})`, `t('won', {margin})`, `t('lost', {margin})`, `t('tied')`, `t('winnerWon', {name, margin})`, osv.
- `osloDate`: ta `locale` som arg → `nb-NO` for `no`, `en-GB` for `en`.
- Footer-tagline: ny nøkkel (engelsk variant av «Fyr opp golfturneringen …»). **Brand-navnet «Tørny» og «tornygolf.no» beholdes uendret** (ikke oversatt).

### 3. Nye i18n-nøkler

Ny `leaderboard.shareCard.*`-seksjon i BÅDE `messages/no.json` og `messages/en.json` (norsk = dagens strenger ordrett, engelsk = idiomatisk oversettelse). Nøkler minst: `winner`, `matchplay`, `finalResult`, `gameFinished`, `points` (`{n}`), `skins` (`{n}`), `won` (`{margin}`), `lost` (`{margin}`), `tied`, `winnerWon` (`{name}`, `{margin}`), `longestDrive` (`#{n}`), `closestPin` (`#{n}`), `yourRound`, `place` (`{n}`), `tagline`, og evt. `playerFallback`. Norsk verdier MÅ matche dagens copy eksakt (snapshot-stabilitet for NO).

## Suksesskriterier

- [ ] **K1 — buildShareCardData er strukturert.** Ingen norske bruker-strenger igjen i `buildShareCardData.ts` for poeng/skins/matchplay-utfall/headline. Vs-par-tall og golf-margin-notasjon (3&2/1 up) beholdes som locale-nøytrale.
- [ ] **K2 — buildShareCardData-test oppdatert + grønn.** `lib/games/buildShareCardData.test.ts` asserter den nye strukturerte formen (ikke gamle «{n} poeng»-strenger). TDD-disiplin: oppdater test → implementer. Alle grønne.
- [ ] **K3 — Routen i18n-er via locale.** `share-image/route.tsx` bruker `getTranslations({locale})` for alle tidligere hardkodede norske etiketter. Ingen hardkodet norsk bruker-copy igjen (utenom brand «Tørny»/«tornygolf.no»).
- [ ] **K4 — Locale-riktig dato.** `osloDate` bruker `en-GB` på engelsk locale, `nb-NO` på norsk.
- [ ] **K5 — Nye nøkler i begge kataloger.** `leaderboard.shareCard.*` finnes i både `no.json` og `en.json`; NO-verdier matcher dagens copy eksakt; EN-verdier er idiomatisk engelsk. `npm run build`/typegen for messages er konsistent (ingen manglende-nøkkel på de brukte nøklene).
- [ ] **K6 — NO-kort uendret.** Delekortet på norsk locale ser identisk ut som før (samme tekst). Verifisert ved å rendre route for et NO-spill.
- [ ] **K7 — EN-kort engelsk.** Delekortet på engelsk locale viser engelsk copy («WINNER», «Final result», «{n} points», tagline, dato på en-GB) for minst ett placement-format og ett matchplay-format.
- [ ] **K8 — Porter grønne + versjon.** `tsc --noEmit` rent, lint rent, `buildShareCardData.test.ts` grønn, MINOR-bump + én Funksjon-linje i CHANGELOG. Kjør `humanizer`/`no-nb`-skillet på ny engelsk copy før commit (idiomatisk, ikke maskinoversatt).

## Gates

```bash
npx vitest run lib/games/buildShareCardData.test.ts
npx tsc --noEmit
npm run lint
# i18n parity (begge kataloger har de nye nøklene):
node -e "const n=require('./messages/no.json'),e=require('./messages/en.json'); const a=Object.keys(n.leaderboard?.shareCard||{}),b=Object.keys(e.leaderboard?.shareCard||{}); const miss=a.filter(k=>!b.includes(k)).concat(b.filter(k=>!a.includes(k))); console.log(miss.length?('MISMATCH: '+miss):'shareCard keys parity OK ('+a.length+')')"
```

Visuell gate: rendre `/{locale}/games/{id}/leaderboard/share-image` for `no` og `en` på staging (eller lokalt mot staging) → eyeball PNG-ene.

## Ikke i scope

- Endre kort-layout/design (kun copy/i18n).
- Matchplay-sideturnering-dedup (#973 — eget issue).
- Oversette brand-navn «Tørny» / domenet «tornygolf.no».
- Side-tournament-`label`-strenger som kommer fra kallstedet (`sideWinners`) — utenfor denne routens ansvar (egen kilde).
