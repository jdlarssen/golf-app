# Spec: Prøvespill-demo — slå sammen banner + intro, fjern finishedHint

**Issue:** #1138 · **Branch:** claude/1138-provespill-demo-slaa-sammen-banner-fjern-finishedhint

## Problem

Prøvespill-demoen (`/demo`, #1042) er offentlig førsteinntrykk for konvertering, men topp-en tvinger to lesestykker før første tap. `app/[locale]/demo/DemoGame.tsx:88-95` rendrer først et bordered `data-testid="demo-banner"`-kort med `t('banner')` («Dette er et prøvespill. Ingenting du taster blir lagret.»), umiddelbart fulgt av et separat `<p>{t('intro')}</p>` (:95) med instruksjonen. To blokker der én rekker. I tillegg viser `DemoGame.tsx:135-137` en betinget `<p>{t('finishedHint')}</p>` når `allEntered`, rett over den alltid-synlige `SoloStablefordView`-tavla (:140-151) — tavla som fyller seg selv sier allerede det hint-en gjentar.

## Design

1. **Slå sammen banner + intro til én linje** i `DemoGame.tsx:88-95`. Behold banner-boksen som bærer `data-testid="demo-banner"` (den er assertert av både `DemoGame.test.tsx:16` og `e2e/demo/demo.spec.ts:16` — testid-en MÅ overleve), la den holde én sammenslått setning, og fjern det frittstående `<p>{t('intro')}</p>` på :95. Den nye copy-en dekker begge budskap: at ingenting lagres + at du taster slag og ser deg klatre. Legg den i `demo.banner`-nøkkelen; `demo.intro` blir foreldreløs → slett den (se steg 3).

2. **Fjern finishedHint-blokken** `DemoGame.tsx:135-137` i sin helhet. Da blir `const allEntered` (:63) ubrukt — grep bekrefter :135 er eneste call-site — så fjern også den deklarasjonen (`@typescript-eslint/no-unused-vars` er `warn`, ikke `error`, så den blokkerer ikke gate-ene, men suksesskriteriet krever den fjernet; `noUnusedLocals` er ikke aktivert i tsconfig).

3. **Rydd foreldreløse meldingsnøkler** (T2 change-propagation). Etter steg 1–2 er `demo.intro` og `demo.finishedHint` ubrukte. Slett begge fra BÅDE `messages/no.json` (`intro`:4888, `finishedHint`:4893) OG `messages/en.json` (`intro`:4888, `finishedHint`:4893). `messages/catalogParity.test.ts` krever identiske løvnøkler i alle lokaler — asymmetrisk sletting feiler den porten. Grep bekrefter `finishedHint` kun i DemoGame + de to katalogene, og `demo.intro` kun på DemoGame.tsx:95 (andre `intro`-treff er andre namespaces).

4. **Kjør `humanizer:humanizer`** på den nye sammenslåtte norske banner-strengen før commit (ny bruker-copy; pre-commit-hooken advarer på AI-tells).

## Key Decisions

- **Sammenslått copy legges i `demo.banner`, ikke en ny nøkkel** — banner-boksen beholder testid-en, så det er den overlevende noden; å folde inn i dens nøkkel holder DOM-en og testene stabile uten omskriving.
- **Commit-type `refactor` (ingen version-bump, ingen CHANGELOG).** Endringen er ren presentasjons-konsolidering på demo-siden: ingen ny funksjon, ingen bug fikset, ingen atferdsendring. Det matcher `[no-changelog]`-sporet og «match effort to difficulty». (Bruker `feat`/`fix`-prefiks ville trigget bump-hooken unødvendig for en mikro-polish.)

**Claude's Discretion:** Eksakt norsk (og engelsk) ordlyd på den sammenslåtte banner-linja — hold den kort, kompis-energi, én setning, post-humanizer. Om `demo-banner`-boksens styling (border/bg/padding) skal beholdes som i dag eller trimmes til én enkel linje er byggerens valg, så lenge testid-en består og det leser som ett lesestykke.

## Success Criteria
- [ ] `/demo`-toppen viser ÉN tekstblokk over hull-kortet (banner + intro slått sammen), ikke to.
- [ ] `finishedHint`-avsnittet vises ikke lenger når alle hull er tastet; tavla står alene.
- [ ] `data-testid="demo-banner"` finnes fortsatt på den overlevende noden.
- [ ] `demo.intro` og `demo.finishedHint` er borte fra både `messages/no.json` og `messages/en.json`; ingen gjenværende `t('intro')`/`t('finishedHint')` i `DemoGame.tsx`.
- [ ] Ingen ubrukt `allEntered`-deklarasjon igjen i `DemoGame.tsx`.
- [ ] Den nye norske banner-strengen er kjørt gjennom humanizer.

## Gates
- [ ] `npm run build` — grønt (fanger type-/kompileringsfeil fra JSX- og nøkkel-endringene; merk at ubrukt `allEntered` IKKE fanges her — `noUnusedLocals` er av og `no-unused-vars` er `warn` — den må fjernes manuelt per steg 2)
- [ ] `npm run lint` — grønt på berørte filer
- [ ] `npx vitest run "app/[locale]/demo/DemoGame.test.tsx" messages/catalogParity.test.ts` — grønt (render-test + parity-port)
- [ ] (valgfritt, cheap) staging-klikk `/demo` på `torny-staging` — bekreft én blokk over kortet + tavla uten hint

## Files Likely Touched
- `app/[locale]/demo/DemoGame.tsx` — slå sammen banner+intro, fjern finishedHint-blokk + `allEntered`
- `messages/no.json` — slett `demo.intro` + `demo.finishedHint`, oppdater `demo.banner`
- `messages/en.json` — slett `demo.intro` + `demo.finishedHint`, oppdater `demo.banner`

## Out of Scope
- CTA-boksen (`demo-cta`, :153-169), hull-navigasjon, tavle-rendering, reset — røres ikke.
- Endre demo-seed, scoring eller `SoloStablefordView`.
- Version-bump / CHANGELOG-oppføring (bevisst utelatt, se Key Decisions).
