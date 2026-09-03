# Kontrakt: Vercel-funksjonene flyttes til Stockholm (arn1)

**Issue:** #1815 · **Type:** perf (konfigurasjon, én linje), lav blast-radius, ingen produktvalg
**Berører:** `vercel.json` (+ én linje i `CLAUDE.md` «Hosting», + `.changes/`-notat)

## Problem
Hvert sidebytte i webappen venter 0,7–0,9 s på innhold (målt 2026-09-02 mot staging i prod-servermodus). Verken JS-størrelse eller nettet er flaskehalsen; serveren bruker ~700 ms på 3–7 sekvensielle databaserunder. Rotårsak: Vercel kjører app-funksjonene i Washington (`iad1`, Vercels standard — `vercel.json` har ingen `regions`-nøkkel), mens Supabase (prod og staging) står i Stockholm (`eu-north-1`). Hver runde koster ~100 ms over Atlanteren. Anslag: 0,3–0,6 s kortere ventetid per sidebytte.

## Design
1. `vercel.json`: `"regions": ["arn1"]` på toppnivå. `crons` uendret.
2. `CLAUDE.md` «Hosting»-linja dokumenterer regionen og advarer mot å fjerne nøkkelen.
3. `.changes/1815-vercel-region-stockholm.md` (`type: perf`).
4. Commit `perf(infra): run Vercel functions in Stockholm next to Supabase`, `Refs #1815`.
5. Draft-PR med `Closes #1815`, Fordeler/ulemper-blokk, og eksplisitt at staging-klikkrunde er N/A (K4).

Fallback hvis preview-deployen fortsatt viser `iad1` (Hobby ignorerer `regions`): ikke gjett — be eieren sette Vercel → golf-app → Settings → Functions → Function Region → Stockholm (arn1). Behold linja i `vercel.json`.
Rollback: fjern `regions`-linja.

## Kanttilfeller
- Cold start blir ikke bedre (0,3–1,4 s). Skal ikke selges som fikset.
- Preview-deploys får samme region — K2 verifiseres FØR merge.
- Ingen effekt lokalt → staging-klikkrunde N/A.
- `vercel.json` må forbli gyldig JSON. Ikke rør `crons`.

## Suksesskriterier
- [ ] K1 — Konfig: toppnivå `"regions": ["arn1"]`, `crons` uendret, JSON parser.
- [ ] K2 — Preview-deployen kjører i Stockholm (Vercel `get_deployment` viser `regions: ["arn1"]`). Bevis i PR-en.
- [ ] K3 — Produksjonen kjører i Stockholm etter merge (bevis i closing-kommentaren).
- [ ] K4 — Staging-klikkrunde erklært N/A med begrunnelse i PR-body.
- [ ] K5 — Bokføring: `.changes`-notat aksepteres av `node scripts/weekly-release.mjs --dry-run`; CLAUDE.md-linja oppdatert.
- [ ] K6 — Eierens tapptest etter deploy (VERIFICATION GAP til den er gjort): åpne `tornygolf.no/?perf=1`, gå inn i et spill, les HUD-tallet «data».

## Ikke i scope
`experimental.staleTimes`, View Transitions, prefetch-tuning i SmartLink, færre DB-runder per side, `functionFailoverRegions`, bundle-splitting (#797).
