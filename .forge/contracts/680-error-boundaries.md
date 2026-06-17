# Kontrakt #680 — Error-grenser (`error.tsx`) for kjerne-løkka

**Issue:** [#680](https://github.com/jdlarssen/golf-app/issues/680) · **Branch:** `claude/relaxed-brahmagupta-ee8cb3` · **Bølge 1 (sikkerhetsnett), audit 2026-06-17**

## Problem

Det finnes ingen `error.tsx`/`global-error.tsx` noensteds under `app/`. Hver kjerne-løkke-server-
komponent (hull, leaderboard, submit, scoring-builder) kaster ukontrollert på enhver Supabase-feil.
På et ustabilt mobilnett midt i en runde — eller ved neste schema/RLS-regresjon (slik #642/#647 dukket
opp som 500-er) — kastes brukeren til Next.js sin rå, ustylede engelske «Application error»-side uten
vei tilbake. For en PWA med ikke-tekniske sluttbrukere er dette en blindvei i det viktigste øyeblikket.

## Tilnærming

Tre error-grenser dekker hele scoring-flyten + roten, slik issue-en foreslår. Grenser fanger barn under
seg, men **ikke sin egen segment-layout** (Next-konvensjon, bekreftet i `node_modules/next/dist/docs/.../error.md`):

| Grense | Fanger | Vei tilbake |
|---|---|---|
| `app/[locale]/games/[id]/error.tsx` | hull/leaderboard/submit/(home) + alle nestede game-sider (men ikke `games/[id]/layout.tsx`) | «Prøv igjen» + «Til spillet» (`/games/{id}`) |
| `app/[locale]/error.tsx` | resten av `[locale]` inkl. `games/[id]/layout.tsx`-feil (men ikke `[locale]/layout.tsx`) | «Prøv igjen» + «Til Hjem» (`/`) |
| `app/global-error.tsx` | rot-layout-feil; erstatter hele dokumentet | «Prøv igjen» + «Til Hjem» |

**Nøkkelbeslutninger (Next.js 16.2.6-spesifikt):**
- Retry-proppen heter **`unstable_retry`** (lagt til i v16.2.0), ikke `reset`. Docs anbefaler `unstable_retry`
  fordi den **re-fetcher + re-rendrer** segmentet — nøyaktig riktig for en forbigående Supabase-hikke.
  (`reset` rydder bare state uten ny henting og ville ikke kjørt spørringen på nytt.)
- De to rute-grensene deler én klient-komponent `components/ui/ErrorScreen.tsx` (DRY, jf. «ikke duplisér»),
  som gjenbruker `AppShell`/`BrandMark`/`ChampagneMedallion`/`PinFlag`/`Button`/`LinkButton` — samme visuelle
  familie som `not-found.tsx`. Logger feilen via `console.error` i `useEffect` (Vercel-loggbar + `digest`).
- `global-error.tsx` står egen: den erstatter rot-layouten, så den har **ingen** `NextIntlClientProvider`/
  fonter. Den hardkoder norsk (default-locale `'no'`) med inline-stiler robuste mot manglende CSS.
- Ny i18n-namespace `error` i **både** `no.json` og `en.json` (parity-test håndhever likhet).

## Suksesskriterier

- [x] **K1** `app/[locale]/games/[id]/error.tsx` — `'use client'`, prop `unstable_retry`, leser `id` via
      `useParams<{id?}>()`, `back = id ? {/games/${id}, toGame} : {/, toHome}`. (fil opprettet)
- [x] **K2** `app/[locale]/error.tsx` — `'use client'`, `unstable_retry`, `back = {/, toHome}`. (fil opprettet)
- [x] **K3** `app/global-error.tsx` — `'use client'`, egne `<html lang="no"><body>`, hardkodet norsk +
      inline-stiler (forest/linen-hex), `onClick={() => unstable_retry()}`-knapp + `<a href="/">`,
      `console.error('[global-error-boundary]', error)` i `useEffect`. (fil opprettet)
- [x] **K4** `components/ui/ErrorScreen.tsx` — delt, brukt av K1+K2; `console.error([${context}], error)` i
      `useEffect`; `AppShell`+`BrandMark`+`ChampagneMedallion`+`PinFlag`-hero (samme chrome som `not-found.tsx`).
- [x] **K5** `error`-namespace i `no.json`+`en.json`, identiske nøkler. Bevis: `node -e` keys match: true;
      `catalogParity.test.ts` 3/3 grønn.
- [x] **K6** Humanizer-skill kjørt på all ny norsk copy → ingen tells (idiomatisk, korrekt V2/«»). Engelsk
      via no-nb-stil. Ingen «Application error» igjen i kjerne-flyten.
- [x] **K7** `components/ui/ErrorScreen.test.tsx` — rendrer «Noe gikk galt» + `fireEvent.click` på «Prøv
      igjen» kaller `retry`. Bevis: vitest 1/1.
- [x] **K8** Gates grønne: `tsc --noEmit` → exit 0; vitest (ErrorScreen + catalogParity) → 4/4; `npm run
      build` → BUILD_EXIT=0, ingen Failed-to-compile/Type-error-linjer.

## Gates

```bash
npx tsc --noEmit
npx vitest run messages/catalogParity.test.ts components/ui/ErrorScreen.test.tsx
npm run build
```

## Ikke i scope (non-goals)

- Egne `error.tsx` per admin/klubb/liga/cup-segment — disse arver `[locale]/error.tsx`-fallbacken; issue-en
  ber kun om scoring-flyt + rot-catch-all.
- Ekstern feilrapporterings-tjeneste (Sentry el.l.) — kun `console.error` → Vercel runtime-logger.
- Å fjerne de ukontrollerte `throw`-ene i seg selv (det er #672/#675-territorium) — grensene er nettet under.
- E2E-test av at en grense faktisk fanger (upraktisk å tvinge throw i Playwright; #674 dekker golden-path).

## Versjon

PATCH-bump (robusthet/polish — brukeren gjør det samme, bare trygt ved feil). CHANGELOG-oppføring under
gjeldende åpne tema.
