# Sideturnering — per-team-collapse + medlems-navn (design)

**Status:** godkjent 2026-05-16
**Ship-mål:** PATCH-bump v1.1.0 → v1.1.1
**Subagent-modell:** Opus for alle implementer/reviewer-subagenter

## Bakgrunn

Etter v1.1.0-lansering 2026-05-14 testet brukeren sideturneringen i prod. To UX-funn:

1. **«Lag 1»/«Lag 2» er anonyme.** Brukeren må scrolle opp til hovedleaderboarden for å se hvem som er på hvert lag. På sideturnerings-fanen mangler den informasjonen helt.
2. **Per-kategori-detalj-seksjonen er ikke der folk forventer den.** Folk vil vite «hva gjorde MITT lag for å få de 18 poengene?», ikke «hvem vant best-netto-front-9?». Den eksisterende seksjonen er informasjons-orientert, ikke lag-orientert.

Begge funn handler om at sideturnerings-fanen er for langt unna leser-spørsmålet «hva skjedde med oss?».

## Endringer

### 1. Lag-medlemmer vises under lag-label

Hver rad i sideturnerings-poeng-tabellen får spillere-navn på linje under «Lag N». Matcher mønsteret fra `State4View` på hovedleaderboarden (samme `formatRevealName`-decorering, samme `·`-skille).

**Brukerens valg:** kun fornavn, ikke full reveal-form. Mer scanbar; ingen visuell støy fra etternavn.

### 2. Per-team-collapse erstatter per-kategori-detalj-seksjonen

Hver lag-rad blir et `<details>`-element. Klikker man (hvem som helst — vanlig spiller, ikke admin-gated) på et lag, expander det og viser den lag-ets awards gruppert etter kategori.

**Brukerens valg:** A-alternativet — collapse ERSTATTER, ikke utvider, dagens detalj-seksjon. Sparer vertical space på mobil og svarer på det folk faktisk vil vite.

Konsekvens: hull-win-grid (3×6-rutenettet over hele runden), per-kategori-linjene, og LD/CTP-slots-seksjonene forsvinner alle. Informasjonen er fortsatt der — bare omfordelt inne i hvert lag.

## Visuell utforming

### Sammenklappet (default state for alle lag)

```
🥇  Lag 2                                     38p  ▼
    Karl · Per
─────────────────────────────────────────────────
🥈  Lag 1                                     18p  ▼
    Lise · Anna
```

- Medal-emoji venstre av label (matcher dagens posisjon)
- «Lag N» som primær label, fornavn-rad under i `text-muted`
- Total-poeng høyre-justert med `tabular-nums`
- Chevron `▼` indikerer at raden er klikkbar
- Hele raden er ett tap-target — `min-h-[44px]`

### Ekspandert (etter klikk)

```
🥇  Lag 2                                     38p  ▲
    Karl · Per
    ──────────────────────────────────────────────
    Best netto 18 hull: 10p (uavgjort med Lag 1)
    Best netto back 9: 5p
    Hole-wins: 18p på 9 hull (10–18)
    Longest drive #2 (Karl): 2p
    Closest to pin #1 (Per): 2p
```

- En subtil divider under fornavn-raden separerer header fra awards-listen
- Awards listes som flate linjer, kategori → poeng-info
- Konsolidert format for hole-wins: «{N} hull: {total}p (hull A–B)» når sammenhengende, eller «(hull A, B, C)» når spredt

### Awards-format per kategori

| Kategori | Format |
|---|---|
| `best_netto_18` | `Best netto 18 hull: 10p` + `(uavgjort med Lag X)` hvis tied |
| `best_netto_front9` | `Best netto front 9: 5p` + tied-info |
| `best_netto_back9` | `Best netto back 9: 5p` + tied-info |
| `hole_win` | `Hole-wins: {Total}p på {N} hull ({range})` |
| `longest_drive` | `Longest drive #{position} ({fornavn}): 2p` per slot |
| `closest_to_pin` | `Closest to pin #{position} ({fornavn}): 2p` per slot |

**Hole-win-rendering:** sammenhengende hull formatteres som range (`hull 10–18`); ikke-sammenhengende som kommaliste (`hull 4, 7, 12`); blandet velger det som blir kortere.

**LD/CTP-rendering:** vinner-navn slås opp via `sideWinners`-arrayet + lag-medlemmer-lookup. Hvis `winner_user_id` er null → kategori-linjen utelates fullstendig (laget har ingen award der).

**Tied-info-detektor:** for hver netto-kategori sjekkes om mer enn ett lag har den awarden. Hvis ja, listes de andre lagene som «Lag X, Y» (med kommaseparering). 3-veis-tie: «(uavgjort med Lag 1 og Lag 3)».

## Datamodell-endring

`SideTournamentView.tsx` props utvides:

```ts
type Team = {
  teamId: number;
  label: string;             // "Lag 1", "Lag 2"
  members: Array<{
    userId: string;
    displayName: string;     // full reveal-name (beholdes — kan trenges senere)
    firstName: string;       // NEW
  }>;
};
```

`page.tsx` (`app/games/[id]/leaderboard/page.tsx`) bygger `members` med firstName via eksisterende `firstName()`-helper i `lib/firstName.ts`. Helper tar full name (string), returnerer første space-separerte token, med trim.

Hvis `name` er tomt/null: fallback til `displayName` (som kan være nickname-only) eller bare `'?'`. Edge-case som ikke skal nås i prod fordi spillet er finished og spillere må ha submittet scorekort.

## Hva som fjernes fra koden

I `SideTournamentView.tsx`:
- `CategoryRow`-komponenten
- `HoleWinGrid`-komponenten
- `SlotsSection`-komponenten
- `collectCategoryWinners`-helperen
- Det ytre `<details>`-elementet «Vis hvordan poengene ble fordelt»

Erstattes av:
- `TeamRowDetails`-komponent (én `<details>` per lag, summary + awards-liste)
- `formatHolesList(holes: number[]): string`-helper (sammenhengende → range, spredt → kommaliste)
- `findTeamMatesForCategory(teamId, category, standings): TeamId[]`-helper for tied-info

## Out-of-scope (følger ikke v1.1.1)

- Hull-grid (overordnet runde-rytme) — kan revurderes i v1.1.2 hvis bruker savner den
- Per-team farger / lag-emoji
- Custom team-names (admin setter «Karl & Per FC»)
- Sticky/highlight på «mitt lag» når innlogget spiller leser
- Auto-expand på et lag (f.eks. det innloggede spillerens eget) — alle starter sammenklappet
- Animasjon på `<details>` expand (bruker native HTML, ingen Framer)

## Tester

Per Tørny-konvensjon: UI-komponenter testes ikke unit, kun via prod-smoke-test. `lib/scoring/sideTournament.ts` har allerede 13 unit-tester som fortsatt skal passere — endringen er kun presentasjonell.

Hvis `formatHolesList`-helperen blir komplisert (range-detection), legg den i sin egen fil med unit-test. 3 test-cases nok: sammenhengende, spredt, blandet.

## Versjonering

- PATCH-bump: 1.1.0 → 1.1.1
- CHANGELOG-tagline: «Sideturneringen viser nå hvem som er på hvert lag, og du kan klikke på et lag for å se hvilke kategorier som ga poengene deres.»
- Tema-heading endres ikke (fortsatt under `## 1.1.y — Sideturnering` minor-serien)

## Filer som påvirkes

- `app/games/[id]/leaderboard/SideTournamentView.tsx` (refaktorert)
- `app/games/[id]/leaderboard/page.tsx` (utvider `members` med `firstName`)
- `lib/leaderboard/formatHolesList.ts` + `.test.ts` (NY hvis helperen blir non-trivial)
- `CHANGELOG.md` (v1.1.1-entry)
- `package.json` (version bump)
