# Forge-kontrakt — #347: Cup-navigasjon (tilbake-lenke + spiller-vei til cup-leaderboard)

**Issue:** [#347](https://github.com/jdlarssen/golf-app/issues/347) · Part of [#344](https://github.com/jdlarssen/golf-app/issues/344) («Én vei til rom») · label: `bug`
**Branch:** `claude/crazy-tesla-a3678f`
**Type:** bug (to navigasjons-døde-ender) · PATCH-bump

## Problem (to døde ender i cup-flyten)

1. **Cup-detalj tilbake-lenke hopper over cup-lista.** `app/admin/cup/[id]/page.tsx:98` har `TopBar backHref="/admin"` — fra en cup kommer du tilbake til admin-hubben, ikke cup-lista. Spill-detalj (`app/admin/games/[id]/page.tsx`) har korrekt `backHref="/admin/games"`.
2. **Spillere kan ikke nå den offentlige cup-leaderboarden.** `/cup/[id]` lenkes kun fra admin-siden. En spiller i en cup-match finner ikke cup-stillingen fra app-UI-et — kun via direkte URL.

## Kontekst funnet i koden (sannhets-anker)

- **`/cup/[id]` er allerede spiller-tilgjengelig.** `app/cup/[id]/page.tsx` har INGEN `requireAdmin` — kun `getProxyVerifiedUserId()` (til notification-bell) + `getCupSnapshot(id)`. Enhver innlogget spiller kan se den. `proxy.ts`-matcher krever innlogging (greit — spillere er innlogget). Lenke-målet funker.
- **`getGameWithPlayers` eksponerer IKKE `tournament_id`** (`GameForHole`-typen + select mangler det). Spill-siden bygger `game` fra `...gwp.game` + en slim parallell join-fetch.
- **Spill-siden self-fetcher allerede i seksjoner.** `PendingApprovalsBanner`, `FlightRoster`, `PrimaryCtaSection` gjør egne queries via `getGameContext()`, Suspense-wrappet. → Den smarteste, laveste-blast-radius-løsningen er en ny self-fetching `<Suspense>`-komponent, ikke å utvide den delte cache-helperen.
- **To return-grener i spill-siden:** scheduled-grenen (venterom, `app/games/[id]/page.tsx:340-468`) og hoved-grenen (draft/active/finished, linje 479-718). Lenken må inn i begge for å dekke alle tilstander en cup-match-spiller ser.
- **Nav-kort-mønster:** eksisterende «Leaderboard»/«Hull for hull»/scorekort-kort = `<SmartLink className="block"><Card min-h-[44px] flex justify-between hover:border-primary/30><span text-base font-medium>…</span><span aria-hidden text-muted>→</span></Card></SmartLink>`. Cup-lenken gjenbruker dette.

## Beslutning (gray-area avklart)

Bruker valgte «hva blir mest brukervennlig?» → **Option A: kun spill-/match-siden, i alle tilstander** (venterom, pågående, avsluttet, draft). Mest brukervennlig fordi spilleren tenker på cup-stillingen mens hen ser på sitt eget match — kontekstuell plassering ved siden av match-leaderboarden. En hjem-lenke ville krevd å løse «hvilken cup?» (en spiller kan være i flere) → mer flate, mindre kontekst. Hjem-skjermen er uendret.

**Implementasjon:**
1. Endre cup-detalj `backHref="/admin"` → `backHref="/admin/cup"`.
2. Ny self-fetching komponent `CupStandingsLink({ gameId })`: henter `games.tournament_id`; hvis null → render null. Ellers bekreft at cup-raden finnes (`tournaments` id+name) for å unngå lenke til slettet cup (404); hvis ikke funnet → null. Ellers render nav-kort `SmartLink` til `/cup/[tournament_id]` med tekst «Se cup-stillingen». Wrappes i `<Suspense fallback={null}>` i begge return-grener.
3. Ingen endring i `getGameWithPlayers` / `GameForHole` / `GAME_SELECT` — komponenten self-fetcher.

## Akseptkriterier

- [ ] **AC1** — Tilbake fra cup-detalj går til `/admin/cup`. *Evidens: `backHref="/admin/cup"` i `app/admin/cup/[id]/page.tsx`.*
- [ ] **AC2** — En spiller i en cup-match kan nå `/cup/[id]` fra app-UI-et (ikke kun direkte URL), i alle tilstander (venterom/aktiv/avsluttet/draft). *Evidens: `CupStandingsLink` rendrer `SmartLink href="/cup/${tournament_id}"` i begge return-grener.*
- [ ] **AC3** — Lenken vises KUN for spill som tilhører en cup (`tournament_id` satt + cup finnes). Ikke-cup-spill viser ingenting. *Evidens: komponenten returnerer null ved manglende `tournament_id` eller manglende cup-rad.*
- [ ] **AC4** — Lenke-målet `/cup/[id]` funker for ikke-admin spillere. *Evidens: `app/cup/[id]/page.tsx` har ingen `requireAdmin`.*
- [ ] **AC5** — Ingen endring i delt `getGameWithPlayers`-cache-helper; ingen regresjon for andre spill-side-konsumenter. *Evidens: helper-fil urørt i diff; build grønn.*
- [ ] **AC6** — Norsk copy «Se cup-stillingen» passerer humanizer (ingen særskriving/anglisisme); nav-kort matcher eksisterende mønster. *Evidens: humanizer + file:line.*
- [ ] **AC7** — `package.json` PATCH-bump (1.60.1 → 1.60.2) + `CHANGELOG.md`-oppføring i samme commit; commit-msg-hook grønn. *Evidens: hook passerer.*

## Filer

- `app/admin/cup/[id]/page.tsx` — back-link én-linje.
- `app/games/[id]/page.tsx` — ny `CupStandingsLink`-komponent + to render-slots (Suspense).
- `package.json` + `CHANGELOG.md` — bump + oppføring.

## Gates (scoped)

```bash
npm run lint
npx tsc --noEmit          # forvent kun pre-eksisterende test-fil-feil (signup/signups/withdraw), ikke nye
npx vitest run app/games  # spill-side-adjacent tester hvis noen finnes
npm run build             # autoritativ gate (RSC-graf, exhaustive-switch)
```

## Ut av scope (ikke gold-plate)

- Hjem-skjerm cup-inngang (#344-paraply, ikke dette issuet — bruker valgte game-page-only).
- Ingen endring i selve `/cup/[id]`-siden, cup-snapshot-logikken, eller admin cup-detalj utover back-link.
- Ingen ny test med mindre en eksisterende spill-side-test brytes (server-component, sannsynlig ingen).
