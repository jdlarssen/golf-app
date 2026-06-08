# Forge-kontrakt: #500 — Hjem-IA: Finn turneringer øverst + rydd format-guide

- **Issue:** https://github.com/jdlarssen/golf-app/issues/500
- **Branch:** `issue-500-hjem-ia`
- **Avhenger av:** #498 (merget — `/spillformater`-ruta + delt guide finnes)
- **Versjonsbump:** MINOR. `1.104.1` → **`1.105.0`**.

## Mål

Hjem-sida skal speile kjerneflyten (oppdage → bli med → spille). Flytt «Finn
turneringer» opp rett under brukerens egne spill, fjern det nå-redundante
format-guide-kortet (oppslagsverket bor bak «?» i veiviseren + som tile i
Klubbhuset) og fjern «Mer kommer her snart»-teksten. Legg «Spillformater» som
tile i Klubbhuset så oppslagsverket har et rolig hjem.

Besluttet via brainstorming 2026-06-08 (oppfølger til #498).

## Beslutninger (gråsoner avklart)

1. **Tile i begge Klubbhus-visninger** (eier 2026-06-08): «Spillformater»-tilen
   legges i BÅDE admin-`TilesGrid` OG vanlig-spiller-`PlayerKlubbhus`. Hjem-sida
   er ikke admin-gatet, så alle ser format-kortet der i dag; fjernes det uten
   tile i spiller-visningen mister vanlige spillere browse-tilgang til hele
   oppslagsverket (regresjon). Begge visninger → ingen mister det.
2. **Ikon:** ny `TileIconKind 'spillformater'` → `ScorekortIcon` (regler/oppslag).
   Distinkt fra admin-«Formats»-tilen (`'formats'`-ikon, styrer wizard-mapping)
   så de to format-relaterte tilene i admin-visningen ikke ser like ut.
3. **Tile-copy:** label «Spillformater», meta «Bli kjent med formatene»,
   href `/spillformater`. (Humaniseres før commit.)
4. **Admin-«Formats»-tilen røres ikke** (annen funksjon: styrer mapping). Utenfor
   #500-scope.

## Success-kriterier

### Hjem ([`app/page.tsx`](app/page.tsx))
- [ ] Seksjonsrekkefølge: `Pågår nå` → `Mine spill` → `Finn turneringer` → `Avsluttede spill`. («Finn turneringer» flyttet opp; «Avsluttede spill» under den.)
- [ ] «Spillformater»-seksjonen (format-guide-lenken, ~linje 335–346) fjernet.
- [ ] «Mer kommer her snart»-`<p>` (~linje 366–368) fjernet.
- [ ] Conditionals bevart: Pågår/Mine/Avsluttede rendres fortsatt kun når de har innhold; «Finn turneringer» forblir alltid-synlig.

### Klubbhuset ([`app/admin/page.tsx`](app/admin/page.tsx))
- [ ] «Spillformater»-tile (→ `/spillformater`) lagt til i admin-`TilesGrid`.
- [ ] Samme tile lagt til i `PlayerKlubbhus` (vanlig-spiller-visning).
- [ ] Ny `TileIconKind 'spillformater'` → `ScorekortIcon`, lagt til i `TileIcon`-switchen + `TileIconKind`-unionen.
- [ ] Tile matcher eksisterende `TileGridView`-stil (deles allerede av begge visninger).

### Tester / kvalitet
- [ ] Ingen nye render-tester (data-rendering UI, per `docs/test-discipline.md`). `npx vitest -u` kun hvis en eksisterende test asserterer Hjem-rekkefølge / «Mer kommer» (grep: ingen funnet).
- [ ] `humanizer:humanizer` kjørt på ny tile-copy.
- [ ] `package.json` → `1.105.0` + CHANGELOG-oppføring (ny tema-serie `1.105.y`, forrige `1.104.y` wrappet i «Tidligere versjoner»).

## Gates (scoped)
1. `npx tsc --noEmit` — ny union-member treffer `TileIconKind`-switchen (uttømming).
2. `npm run build` — Hjem + Klubbhuset bygger.
3. `npx eslint` på endrede filer.
4. `npx vitest run` på evt. berørte test-filer (ingen forventet).

## Avgrensning (IKKE i dette issuet)
- Ingen endring i `/spillformater`-innholdet eller `FormatGuideList` (#498 leverte det).
- Admin-«Formats»-tilen (mapping) røres ikke.
- Format-forklaringene gjennomgås i eget issue (#515).

## Filer som berøres
- `app/page.tsx` — reorder + fjern to blokker
- `app/admin/page.tsx` — tile i `TilesGrid` + `PlayerKlubbhus` + ny ikon-kind
- `package.json` + `CHANGELOG.md`
