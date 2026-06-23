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

- [x] **K1 — Joiner (0 klubb / 0 opprettet):** møter hilsen + «Sett opp en runde»-invitasjon +
  «… eller en cup» + diskret «ikke med i klubb»-linje + Verktøy. Ingen tom liste, ingen blindvei.
  *Evidens:* `PlayerKlubbhus.test.tsx` K1-case (grønn 4/4) asserter `player-invite-primary`→
  `/opprett-spill`, `player-invite-cup`→`/opprett-spill?intent=cup`, `player-no-club`→`/klubber`,
  Verktøy-lenker, og fravær av liste/cup/se-alle/+ny-runde.
- [x] **K2 — Klubbmedlem:** ser klubbene sine som inline rader → `/klubber/[id]`.
  *Evidens:* K2-case asserter 2 `player-club-row` → `/klubber/club-1`, `/klubber/club-2`.
- [x] **K3 — Arrangør (≥1 opprettet):** ser capped spill-liste (≤4, «Se alle →» `/klubbhuset` ved
  >4) med rolig `+ Ny runde` øverst (ikke hero-kort); «Cupene dine (n) →» → `/admin/cup` kun ved
  ≥1 cup. *Evidens:* K3-case asserter 4 `player-arranged-game`→`/games/*`, `player-new-round`,
  `player-see-all`→`/klubbhuset`, `player-cup-row`→`/admin/cup`, fravær av `player-invite-primary`.
- [x] **K4 — Streaming/paint:** hilsen + Verktøy umiddelbart; arrangement + klubber bak hver sin
  Suspense; ingen overflødig navn-/admin-spørring; request-scoped klient. *Evidens:* `grep`
  `getAdminClient|users.select|getAdminContext` i PlayerKlubbhus.tsx/Views = tom; 2 `<Suspense`;
  `getServerClient()` (request-scoped) i begge fetchere; greeting/Tools utenfor Suspense.
- [x] **K5 — ClubStamp + pull-quote borte** fra spiller-visningen. *Evidens:* `grep ClubStamp|PullQuote`
  = kun JSDoc-kommentar som sier de er droppet; ingen JSX-bruk.
- [x] **K6 — `/opprett-spill?intent=cup`** lander på cup-setup (CupSetup), og `?klubb=` pre-velger
  fortsatt klubb-intent. *Evidens:* `parseIntent(first(sp.intent)) ?? (klubb ? 'klubb' : undefined)`
  → `initialIntent` → `GameWizard` (page.tsx:79-80, 110, 222); speiler `/admin/games/new`.
- [x] **K7 — Flyt-kart + versjon:** `docs/user-flows.md` §0-mermaid (PlayerKlub-noden) +
  nav-avsnittet + §A4 beskriver det adaptive rommet; MINOR-bump 1.141.0 + CHANGELOG; ny norsk
  copy kjørt gjennom `humanizer`. *Evidens:* commit `3a8a2cd5` (docs), `package.json`=1.141.0,
  CHANGELOG `### [1.141.0] · #892`, humanizer-skill kjørt (playerSubtitle justert).

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
- **Staging-klikkrunde** før merge (bruker-synlig flate). ✅ Verifisert 2026-06-24 mot
  `torny-staging` som `E2E_PLAYER` (ren joiner: 0 spill / 0 cup / 0 klubb): `/admin` rendret
  K1-rommet end-to-end — «Hei, Test.» + «Sett opp en runde» (→`/opprett-spill`) + «… eller en cup»
  (→`/opprett-spill?intent=cup`) + «Ikke med i en klubb ennå →» (→`/klubber`) + Verktøy (Baner +
  Spillformater). 0 server-errors, ingen tom liste/cup-rad. K6: `/opprett-spill?intent=cup`
  pre-valgte Cup-intent (border-primary). Footer v1.141.0.

## Files Likely Touched

- `app/[locale]/admin/PlayerKlubbhus.tsx` — ny: rom + seksjons-komponenter + skeletons.
- `app/[locale]/admin/PlayerKlubbhus.test.tsx` — ny: én Type-C persona-render-test.
- `app/[locale]/admin/TilesGrid.tsx` — fjern `PlayerKlubbhus` + nå-ubrukte imports.
- `app/[locale]/admin/page.tsx` — oppdater import-sti.
- `app/[locale]/opprett-spill/page.tsx` — `?intent=cup`-parsing → `initialIntent`.
- `messages/no.json` + `messages/en.json` — nye player*-nøkler; fjern ubrukte (begge locales).
- `docs/user-flows.md` — §0-mermaid + nav-avsnitt + §A4.
- `package.json` + `CHANGELOG.md` — MINOR-bump 1.141.0.
