# Forge-evaluering: #639 — Fold modus-kontekst-bannere inn i hull-headeren

**Branch:** `claude/suspicious-feistel-740c2f`
**HEAD:** `61643f9` — fix(hole): fold mode-context banners into the hole header (#639)
**Evaluator:** skeptisk fresh-context verifisering, hver kriterie selvstendig sjekket.

---

## K1 — RR foldet → **PASS**

`RoundRobinBadge.tsx` returnerer nå (linje 30–34):
```tsx
return (
  <HoleContextLine testId="round-robin-badge" accent>
    {t('badge', { segment, partner: partnerName, opp1: opp1Name, opp2: opp2Name })}
  </HoleContextLine>
);
```
Det gamle `badgeStyle`-kortet (verifisert via `git show HEAD~1:...RoundRobinBadge.tsx`) hadde
`margin: '0 14px 8px'`, `padding: '10px 14px'`, `borderRadius: 12`, `border: '1px solid var(--accent)'`
— alt fjernet. `HoleContextLine.tsx` (linje 33–43) bruker kun `borderBottom: '1px solid var(--border)'`,
`padding: '7px 18px'`, INGEN `borderRadius`, INGEN `margin`. Slim header-underrad bekreftet.

## K2 — Wolf/Florida/Skins foldet → **PASS**

`git show HEAD -- HoleClient.tsx` viser at alle tre inline `<div>`-bannere er erstattet:
- Wolf (linje 685–689): `<HoleContextLine testId="wolf-badge" accent>` — gammel `borderRadius: 12` / `margin: '0 14px 8px'` borte.
- Skins (linje 691–708): `<HoleContextLine testId="skins-banner" accent>`; carried-in-underlinja bevart som
  `<span style={{display:'block', marginTop:2, ...}}>{t('banners.skinsCarried')}</span>` (gjort til `span` med
  `display:block` siden HoleContextLine-barnet er inline-kontekst — innhold uendret).
- Florida (linje 720–724): `<HoleContextLine testId="florida-step-aside-reminder">` (nøytral variant, ingen accent).
Ingen av dem bærer fortsatt det gamle kort-styling-settet (verifisert i diff: `-borderRadius: 12`, `-margin: '0 14px 8px'`).

## K3 — Innhold + testid-er bevart → **PASS**

`grep` i ikke-test-kilde finner alle fire testids og at de når rendret output:
```
HoleClient.tsx:686  <HoleContextLine testId="wolf-badge" accent>
HoleClient.tsx:692  <HoleContextLine testId="skins-banner" accent>
HoleClient.tsx:721  <HoleContextLine testId="florida-step-aside-reminder">
RoundRobinBadge.tsx:31  <HoleContextLine testId="round-robin-badge" accent>
```
`HoleContextLine` setter `data-testid={testId}` på rot-`<div>` (linje 45). i18n-nøkler gjenbrukt 1:1
(`t('badge', …)`, `t('wolf.*')`, `t('banners.skinsBanner'/'skinsCarried'/'floridaStepAside')`) — ingen tekst endret.
RoundRobinBadge.test.tsx (1 test) grønn: asserterer segment/partner/motstandere + null-render ved ukjent spiller.
HoleClient.test.tsx 22/22 grønn.

## K4 — 4-spiller-RR fitter bedre → **DEFERRED (strukturelt tilfredsstilt, on-device utsatt til eier)**

Live autentisert nettleser-sjekk er infeasible her (gjenskapt worktree uten `.env.local`/Supabase-creds,
auth-gated hull-rute, krever seedet RR-spill). Strukturelt: den nye `HoleContextLine` gjenvinner den
dedikerte kort-raden — slank `borderBottom`-linje (`padding: '7px 18px'`, ingen radius, ingen 8px-margin-gap)
mot det gamle padded+bordered+rounded kortet med `margin: '0 14px 8px'`. Plassert i header-zonen, flush rett
under `<HoleHero>` (HoleClient.tsx linje 673–724). Strukturen er korrekt; piksel-bekreftelse på iPhone-bredde
overlates til eierens prod-test.

## K5 — WD uendret → **PASS**

`git show HEAD -- HoleClient.tsx` viser at `withdrawn-banner`-blokken IKKE er modifisert — den fremstår kun
som etterfølgende kontekst i diff-en (etter at OnboardingBanner ble flyttet under kontekst-linjene). WD-`<div>`-en
(HoleClient.tsx linje 730–764) beholder sin egen fremtredende fare-rad: `margin: '0 14px 8px'`, `borderRadius: 12`,
`border: '1px solid var(--danger)'`, `danger-soft`-bakgrunn, samt angre-lenke (`banners.withdrawnUndo`). Urørt.

## K6 — Tester grønne → **PASS**

`npx vitest run components/hole "...RoundRobinBadge.test.tsx" "...HoleClient.test.tsx"`:
```
Test Files  10 passed (10)
Tests  90 passed (90)
```
De tre kontrakt-relevante filene (verbose): HoleContextLine **1** test, RoundRobinBadge **1** test, HoleClient **22** tester — alle grønne.
Test-disiplin: `HoleContextLine.test.tsx` har nøyaktig ÉN render-test (Type C-grensen), eksplisitt kommentert
«maks ÉN render-test per komponent». Ingen over-testing.

## K7 — Bygg grønt → **PASS**

`npx tsc --noEmit; echo "EXIT=$?"` → `EXIT=0`. Ingen nye TS-feil.

---

## Selvstendige problem-sjekker (utover kontrakt)

- **Null-RR uten tom header-rad:** `RoundRobinBadge` returnerer `null` på linje 17 (`if (!constellation) return null;`)
  FØR `HoleContextLine` rendres. Ingen tom kontekst-rad ved ukjent/manglende konstellasjon. ✓
- **Gjensidig utelukkende:** `isWolf`/`isSkins`/`isRoundRobin`/`isFlorida` gates på distinkte `gameMode`-likheter
  (`'wolf'`/`'skins'`/`'round_robin'`/`'florida_scramble'`, HoleClient.tsx linje 262–273). Én gameMode-verdi kan
  bare matche én — høyst én kontekst-linje rendres. ✓
- **Døde imports/styles:** Gammel `RoundRobinBadge` importerte `CSSProperties` for `badgeStyle` — begge fjernet i ny fil
  (importerer kun `useTranslations`, mode-helper, `HoleContextLine`). `HoleContextLine`s `CSSProperties`-import er i bruk
  (`const style: CSSProperties`). Ingen foreldreløse imports. ✓
- **CHANGELOG + versjon:** `package.json` og `package-lock.json` begge `"version": "1.130.4"`. CHANGELOG-oppføring
  `### [1.130.4] - 2026-06-15 · #639` nestet under åpen `## 1.130.y`-tema-serie, med tagline-blockquote + Teknisk-details. ✓
- **OnboardingBanner-flytting:** OnboardingBanner ble flyttet fra over kontekst-bannerne til under dem — benignt
  rekkefølge-skifte, ingen funksjonell innvirkning, dekket av grønne onboarding-tester. ✓

---

## VERDICT: ACCEPT

Alle harde kriterier (K1, K2, K3, K5, K6, K7) PASS med konkret evidens. K4 er strukturelt tilfredsstilt —
den slanke `HoleContextLine` erstatter genuint det padded+rundede kortet med 8px-margin-gap og ligger flush i
header-zonen; on-device piksel-bekreftelse ved iPhone-bredde er rimelig utsatt til eierens prod-test (ingen
live auth/seedet RR-spill tilgjengelig i denne worktreen). Ingen regresjoner funnet i de selvstendige sjekkene.
