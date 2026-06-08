# Forge-evaluering: #500 — Hjem-IA: Finn turneringer øverst + Spillformater-tile i Klubbhuset

- **Evaluert:** 2026-06-08
- **Branch:** `claude/charming-goldstine-7421ce`
- **Commit (feat):** `50d47cb`

---

## Success-kriterier

| # | Kriterium | Status | Bevis |
|---|-----------|--------|-------|
| 1a | Seksjonsrekkefølge: `Pågår nå` → `Mine spill` → `Finn turneringer` → `Avsluttede spill` | MET | `app/page.tsx` linje 293–350: `inProgressGames` (Pågår nå) → `upcomingGames` (Mine spill) → hardkodet `<Section label="Finn turneringer">` → `finishedGames` (Avsluttede spill). Rekkefølgen er korrekt. |
| 1b | «Spillformater»-seksjonen (format-guide-lenken) fjernet fra Hjem | MET | `grep "Spillformater\|FormatGuideList"` på `app/page.tsx` returnerer null treff. |
| 1c | «Mer kommer her snart»-`<p>` fjernet | MET | `grep "Mer kommer"` på `app/page.tsx` returnerer null treff. |
| 1d | Pågår/Mine/Avsluttede fortsatt betinget; «Finn turneringer» alltid-synlig | MET | Linje 293: `{inProgressGames.length > 0 && ...}`, linje 299: `{upcomingGames.length > 0 && ...}`, linje 322: `{finishedGames.length > 0 && ...}`. «Finn turneringer» (linje 309–320) har ingen boolsk guard — alltid-synlig. |
| 2a | «Spillformater»-tile i admin-`TilesGrid` | MET | `app/admin/page.tsx` linje 342–348: tile-objekt med `label: 'Spillformater'`, `href: '/spillformater'`, `meta: 'Bli kjent med formatene'`, `icon: 'spillformater'`. |
| 2b | «Spillformater»-tile i `PlayerKlubbhus` | MET | Linje 454–459: identisk tile-objekt i `PlayerKlubbhus`-arrays. |
| 2c | Ny `TileIconKind 'spillformater'` i union + switch | MET | Union (linje 187): `'spillformater'` lagt til. Switch (linje 721): `if (kind === 'spillformater') return <ScorekortIcon ...>`. `ScorekortIcon` importert (linje 16). |
| 2d | Distinkt ikon fra admin-«Formats»-tilen | MET | `'formats'` → `FormatsIcon` (linje 719); `'spillformater'` → `ScorekortIcon` (linje 721). To ulike ikonkomponenter. |
| 3a | `package.json` === 1.105.0 | MET | `package.json` linje 3: `"version": "1.105.0"`. |
| 3b | CHANGELOG har 1.105.0-oppføring under ny `1.105.y`-tema | MET | `CHANGELOG.md` linje 20–39: `## 1.105.y — Hjem · finn turneringer øverst` + `### [1.105.0]`-oppføring. |
| 3c | `1.104.y` wrappes som «Tidligere versjoner» med 2 oppføringer | MET | Linje 41–81: `## Tidligere versjoner` → `<details>` med label «1.104.y — Veiviser · kompakte format-kort (2 oppføringer)» inneholdende `1.104.1` og `1.104.0`. |
| 3d | `<details>`/`</details>` balanse i commit-diff | MET | Diff fra HEAD~2 til HEAD: +2 `<details>`, +2 `</details>`. Den totale ubalansen i fila (406 vs 394) er pre-eksisterende og ikke introdusert av denne commiten. |

---

## Gates

| Gate | Resultat |
|------|---------|
| `npx tsc --noEmit` | PASS — ingen output (ingen feil) |
| `npm run build` | PASS — bygget fullførte, `/spillformater` og `/spillformater/[slug]` listet i build-output |
| `npx eslint app/page.tsx app/admin/page.tsx` | PASS — ingen output (ingen feil) |
| Co-lokaliserte tester | N/A — `app/page.test.tsx` og `app/admin/page.test.tsx` finnes ikke. Ingen tester som asserterer seksjonrekkefølge eller «Mer kommer». |

---

## Adversarielle sjekker

- **Seksjon dropped/duplicated?** Nei. Fire seksjoner er til stede (Pågår nå, Mine spill, Finn turneringer, Avsluttede spill), ingen duplikater, ingen tagg-ubalanse i JSX.
- **«Finn turneringer» blitt betinget?** Nei. Seksjonblokken har ingen `&&`-guard.
- **To format-tiles i admin med identisk ikon?** Nei. `'formats'` → `FormatsIcon`, `'spillformater'` → `ScorekortIcon`. Visuelt distinct.
- **Dangling import etter fjerning?** Nei. `app/page.tsx` har ingen `FormatGuideList`-import; alle importene gjenværende er i bruk (verifisert via tsc + ESLint uten feil).
- **JSX-nesting ødelagt?** Nei. Build og tsc passerer; `<nav>`→`<Section>`-strukturen er intakt.

---

## Bekymringer

Ingen blokkerende. Den pre-eksisterende `<details>`-ubalansen i CHANGELOG (406 åpne, 394 lukkede) er et kjent teknisk gjeld-element som ikke er introdusert av denne commiten — bør spores separat.

---

**VERDICT: ACCEPT**
