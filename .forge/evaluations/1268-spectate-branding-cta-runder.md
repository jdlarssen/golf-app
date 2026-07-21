# Runde-historikk — 1268-spectate-branding-cta (#1268)

Per docs/forge-workflow.md → Konvergensregler (#1077). Én linje per evaluate-runde;
finding-signaturer er normalisert `fil + kriterium`.

| Runde | Verdikt | Finding-signaturer |
|---|---|---|
| 1 | ACCEPT (med dokumentert VERIFICATION GAP) | *(ingen build-defekt — lint fanget setState-i-effekt under implementering, rettet før commit)* |

**Runde 1-notat:** Alle harde suksesskriterier verifisert headless mot staging
(token `393c6166…`, ferdig-spill):
- og:title = turneringsnavnet på gyldig token; generisk «Følg spillet – Tørny» +
  ingen navn/score-lekkasje på ugyldig token. ✓
- `noindex, nofollow` beholdt i `<head>`. ✓
- BrandMark-ordmerke + CTA present i rendret HTML; skjermbilde bekrefter ordmerket
  kontrasterer på mørk resultat-banner (currentColor-valg) og CTA-pill nederst. ✓
- CTA cookie-gate: 2 jsdom-tester grønne (cookie satt → skjult, ellers vist). ✓
- Embed urørt: `git diff --name-only` = kun page.tsx + messages + CTA-filer. ✓
- `npm run build` grønt.

**VERIFICATION GAP (dokumentert, ikke build-defekt):** ugyldig token svarer HTTP
**200** (statisk PPR-shell) i stedet for 404 — kontraktens kriterium 1 sier «404».
Dette er PRE-EKSISTERENDE `cacheComponents`-oppførsel (nøyaktig #1286, som ligger i
autonomy:ready-køen), IKKE introdusert her: `notFound()`-stien i page-body er urørt,
diffen legger kun til metadata-fallback. Sikkerhets-intensjonen (ingen data-lekkasje,
generisk tittel, not-found-UI rendres) er oppfylt. Ekte 404 for ukjente spectate-token
er umulig uten å skru av PPR for ruten (token-ene er ikke kjent på build-tid, så
#1286-fiksen `generateStaticParams` gjelder ikke) — utenfor #1268-scope.

**Implementerings-læring:** første CTA-utkast brukte `setState` i `useEffect` for
cookie-sjekken → `react-hooks/set-state-in-effect`-lint-error. Byttet til
`useSyncExternalStore` (SSR-trygt, ingen hydrerings-flash, ingen cascading render).
Ingen commit på den defekte varianten.

Kryss-modell-gaten (Steg 4.5) kjøres som uavhengig Sonnet-gjennomsyn før levering.
