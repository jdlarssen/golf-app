# Spec: Spiller-Klubbhuset — adaptivt rom (#892)

**Issue:** [#892](https://github.com/jdlarssen/golf-app/issues/892)
**Branch:** `claude/angry-dirac-bc7dc7` (worktree)
**Milestone:** Backlog — uplanlagt / scale-triggered
**Versjon:** MINOR-bump `1.140.7 → 1.141.0` (ny bruker-synlig flate)

Kontrakten ble forhandlet og låst i issue-kommentaren (2026-06-22). Dette er sporings-
kopien for `/forge:auto` på denne branchen — innholdet er uendret, kun versjonstallet er
oppdatert (var stale `1.134.4 → 1.135.0` i kommentaren; main står nå på `1.140.7`).
Avhengighetene #863 (PR #896) og #898 (PR #900) er merget til main.

## Success Criteria

- [ ] **K1 — Joiner (0 klubb / 0 opprettet):** møter hilsen + «Sett opp en runde»-invitasjon +
  «… eller en cup» + diskret «ikke med i klubb»-linje + Verktøy. Ingen tom liste, ingen blindvei.
- [ ] **K2 — Klubbmedlem:** ser klubbene sine som inline rader → `/klubber/[id]`.
- [ ] **K3 — Arrangør (≥1 opprettet):** ser capped spill-liste (≤4, «Se alle →» `/klubbhuset` ved
  >4) med rolig `+ Ny runde` øverst (ikke hero-kort); «Cupene dine (n) →» → `/admin/cup` kun ved
  ≥1 cup.
- [ ] **K4 — Streaming/paint:** hilsen + Verktøy umiddelbart; arrangement + klubber bak hver sin
  Suspense; ingen overflødig navn-/admin-spørring; request-scoped klient.
- [ ] **K5 — ClubStamp + pull-quote borte** fra spiller-visningen.
- [ ] **K6 — `/opprett-spill?intent=cup`** lander på cup-setup (CupSetup), og `?klubb=` pre-velger
  fortsatt klubb-intent.
- [ ] **K7 — Flyt-kart + versjon:** `docs/user-flows.md` §0-mermaid (PlayerKlub-noden) +
  nav-avsnittet + §A4 beskriver det adaptive rommet; MINOR-bump 1.141.0 + CHANGELOG; ny norsk
  copy kjørt gjennom `humanizer`.

## Gates

```bash
npx tsc --noEmit
npx vitest run "app/[locale]/admin/PlayerKlubbhus.test"
npm run build
npm run lint
```

- **Test-disiplin (Type C):** maks **én** render-test (`PlayerKlubbhus.test.tsx`) som dekker de
  tre personaene via injiserte data-props på presentational `*View`-komponentene. Assert på
  `data-testid`/role/`href` — aldri på norsk copy. Ingen Supabase-mock.
- **humanizer** på all ny/endret norsk copy før commit.
- **Staging-klikkrunde** før merge (bruker-synlig flate).

## Files Likely Touched

- `app/[locale]/admin/PlayerKlubbhus.tsx` — ny: rom + seksjons-komponenter + skeletons.
- `app/[locale]/admin/PlayerKlubbhus.test.tsx` — ny: én Type-C persona-render-test.
- `app/[locale]/admin/TilesGrid.tsx` — fjern `PlayerKlubbhus` + nå-ubrukte imports.
- `app/[locale]/admin/page.tsx` — oppdater import-sti.
- `app/[locale]/opprett-spill/page.tsx` — `?intent=cup`-parsing → `initialIntent`.
- `messages/no.json` + `messages/en.json` — nye player*-nøkler; fjern ubrukte (begge locales).
- `docs/user-flows.md` — §0-mermaid + nav-avsnitt + §A4.
- `package.json` + `CHANGELOG.md` — MINOR-bump 1.141.0.
