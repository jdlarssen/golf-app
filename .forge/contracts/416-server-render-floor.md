# Contract: #416 — Reduser server-render-gulv per navigasjon (måle + trygg optimalisering)

## Goal
Senke server-render-arbeidet på de hotteste innloggede rutene uten å røre auth-modellen eller bruker-synlig oppførsel — og levere en dokumentert PPR-feasibility-vurdering som fase-2-anbefaling. **IKKE implementere PPR** (eksperimentelt i Next 16.2, prod-risiko, usikker gevinst; besluttet retning).

Ærlig premiss: gevinsten her kan være beskjeden — mye er kanskje allerede parallelt/cachet (jf. `lib/games/getGameWithPlayers.ts` er `unstable_cache`-et; `courses`/`tee_boxes`-joins hentes bevisst slankt parallelt per CLAUDE.md). Et legitimt ACCEPT-utfall er: «profilerte rutene, fant og fjernet X reelle waterfalls, resten er allerede slankt → eneste gjenstående lever er PPR (fase 2)». Ikke gull-plett; ikke finn på arbeid.

## Scope (hotteste innloggede ruter)
- `app/games/[id]/` + underruter: `page.tsx` (game-home), `leaderboard/`, `holes/`, `scorecard/`, `spillere/`, `layout.tsx`
- `app/page.tsx` (hjem/dashboard) + evt. `app/profil`-flate
- Andre ruter KUN hvis profilering viser et åpenbart sekvensielt fetch-waterfall.

## Approach
1. **Profiler** server-side data-henting i hver rutes `page.tsx`/`layout.tsx` + helperne de kaller. Kartlegg: sekvensielle `await`-er som kunne kjørt med `Promise.all`; dupliserte/overlappende spørringer i samme request; lesninger som er cacheable-trygt-under-RLS men ikke cachet.
2. **Trygge fikser:**
   - Parallelliser uavhengige sekvensielle awaits med `Promise.all`.
   - Dedupliser gjentatte spørringer i samme render-tre.
   - Utvid `unstable_cache` KUN der det er per-spill (ikke per-bruker) og RLS-trygt — følg `getGameWithPlayers.ts`-mønsteret (admin-client + tag + authz beholdt på call-site). ALDRI cache per-bruker-data på en måte som lekker mellom brukere.
   - Fjern `export const dynamic = 'force-dynamic'` KUN på ruter der det er påviselig unødvendig (ruten er dynamisk uansett via cookies, ELLER den kan trygt være statisk). Ikke rør liga-rutene uten å bekrefte de faktisk ikke trenger det.
3. **Mål før/etter** per berørt rute: dokumentér fetch-strukturen (antall sekvensielle → parallelle awaits, fjernede dupe-queries) og evt. lokal render-tid hvis målbar. Tallene går i PR-body.
4. **PPR-vurdering (lever, ikke implementer):** sjekk `experimental.ppr`-status i Next 16.2 (krever canary? incremental-modus? hva må til for Tørnys layout-struktur). Skriv som kort fase-2-anbefaling i PR-body / en note.

## Constraints (ikke-forhandlbar)
- Cookie-auth-modellen bevares 100% — ingen flytting av auth til klient, ingen svekkelse.
- Ingen bruker-synlig oppførsels-endring (samme data, samme rekkefølge, samme gating).
- RLS-korrekthet bevart — ingen cache som kan lekke per-bruker-data.
- Hold deg i scope; ikke refaktorer urelatert.

## Gates / Success Criteria
- [ ] Profilering dokumentert for scope-rutene (hva er allerede slankt vs. hva hadde reelt waterfall).
- [ ] Alle identifiserte trygge waterfalls parallellisert / dupe-queries fjernet (eller dokumentert at det ikke fantes noen).
- [ ] `npm run build` grønt.
- [ ] Co-lokerte tester for endrede filer grønne (`npx vitest related <changed>` / per-fil `*.test`).
- [ ] Ingen RLS/auth-endring (verifiser: ingen `supabase/migrations/`-endring, ingen policy-touch, auth-flyt urørt).
- [ ] Før/etter dokumentert per berørt rute i PR-body.
- [ ] PPR-feasibility-note levert som fase-2-anbefaling.
- [ ] PATCH-bump + CHANGELOG (perf) HVIS noen reell endring shippes; hvis utfallet er «alt er allerede slankt, kun analyse + PPR-note» → ingen bump, `docs/chore`-commit, og si det ærlig.
- [ ] PR mot `main` med `Closes #416`.

## Avvik / rapporter
- Hvilke ruter var allerede optimale (ingen endring).
- Faktisk forventet gevinst — vær ærlig hvis den er liten og PPR (fase 2) er eneste store lever igjen.
