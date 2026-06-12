# Evaluering: «Avsluttede spill» sortering (#569)

**Commit:** `9aa8a5a7`
**Evaluert:** 2026-06-13
**Evaluator:** forge-skeptisk subagent (Sonnet 4.6)

---

## ACCEPT

Alle fem suksesskriterier er oppfylt. Alle gates er grønne. Ingen blokkerende funn.

---

## Per kriterium

### K1 — Pure komparator-helper, synkende, null sist

**PASS**

`lib/games/finishedOrder.ts` eksporterer én ren funksjon `byEndedAtDesc`:

```ts
return (b.ended_at ?? '').localeCompare(a.ended_at ?? '');
```

**Synkende-semantikk:** Når b er nyere enn a, er `b.ended_at > a.ended_at` som streng → `localeCompare` returnerer positivt tall → `.sort()` plasserer b foran a. Korrekt descending.

**Null sist:** `null` erstattes med tom streng `''`. Tom streng er leksikografisk mindre enn alle ISO 8601-tidsstempler (som starter med `'2026-...'`). `''.localeCompare('2026-...')` → negativt → null-rader havner sist. Korrekt.

**localeCompare-sikkerhet på ISO-strenger:** ISO 8601-tidsstempler (`2026-06-12T14:55:00+00:00`) inneholder kun ASCII-tegn: sifre, bindestreker, kolon, `T` og `+`. Disse sorterer identisk i alle locales, så locale-sensitiv kollasjon gir ingen feil. PostgREST leverer alltid samme format og offset — leksikografisk rekkefølge tilsvarer kronologisk rekkefølge.

**Identiske tidsstempler:** `(b.ended_at ?? '').localeCompare(a.ended_at ?? '')` → 0 for like verdier. `.sort()` er stabil i V8 — relativ rekkefølge bevares. Korrekt.

**Tom liste:** `[].sort(byEndedAtDesc)` → `[]`. Ingen feil.

### K2 — Type A-test reproduserer prod-symptomet

**PASS**

`lib/games/finishedOrder.test.ts` inneholder 3 tester:

1. **Prod-fikstur fra #569** (fysisk rekkefølge: 24. mai, 14. mai, 7./10./11./12. juni) → forventer nyeste-først (12., 11., 10. juni, 7. juni, 24. mai, 14. mai). Korrekt reproduksjon av symptomet.
2. **null-sist-case** med blanding av null og gyldige datoer. Korrekt.
3. **Identiske tidsstempler gir 0** — stabilitets-guard. Korrekt.

Kjørt manuelt:
```
Test Files  1 passed (1)
Tests  3 passed (3)
Duration  392ms
```

### K3 — page.tsx: no-op fjernet, sort kalt etter mapping, import til stede

**PASS**

Verifisert i `app/[locale]/page.tsx`:

- **Linje 23:** `import { byEndedAtDesc } from '@/lib/games/finishedOrder';` — import til stede.
- **Linje 134–139 (finished-spørring):** Ingen `.order()`-kall — no-op er fjernet. Selve `.select()` er urørt.
- **Linje 165–174:** `finishedGames` bygges ved filter → map → `.sort(byEndedAtDesc)`. Sorteringen skjer etter mapping, dvs. etter at `ended_at`-feltet er tilgjengelig på objektene. Korrekt.
- **activeGames (linje 153–161):** Uberørt — ingen `.sort()` tillagt, ingen `.order()` fjernet. Aktiv-spørringen endres ikke.
- **isEmptyState (linje 176–177):** `activeGames.length === 0 && finishedGames.length === 0` — uberørt. Sortering av en tom liste påvirker ikke `length`.

### K4 — Sweep: kun kommentar-omtaler av foreignTable/referencedTable

**PASS**

```
grep -rn "foreignTable\|referencedTable" --include="*.ts" --include="*.tsx" app/ lib/ components/ e2e/
```

Resultat (2 treff):
```
app/[locale]/page.tsx:163:  // Sorted in JS: supabase-js' foreignTable-order is a no-op for to-one
lib/games/finishedOrder.ts:4: * Exists because supabase-js' `.order(col, { foreignTable })` only orders rows
```

Begge er kommentar-omtaler — forklarende kommentarer, ikke API-bruk. Ingen aktive `foreignTable`-kall gjenstår.

### K5 — PATCH-bump 1.117.1 + CHANGELOG nestet under 1.117.y-tema, samme commit

**PASS**

- `package.json`: `"version": "1.117.1"` ✓
- `package-lock.json`: `"version": "1.117.1"` ✓ (begge i commitdiffen)
- `CHANGELOG.md`: `### [1.117.1] - 2026-06-13 · #569` nestet under `## 1.117.y — i18n · engelsk i klubb, liga og cup` ✓
- Alle fem filer (`package.json`, `package-lock.json`, `CHANGELOG.md`, `lib/games/finishedOrder.ts`, `lib/games/finishedOrder.test.ts`, `app/[locale]/page.tsx`) er i samme commit `9aa8a5a7` ✓

---

## Gate-resultater

| Gate | Kommando | Krav | Resultat |
|---|---|---|---|
| Ny test | `npx vitest run lib/games/finishedOrder.test.ts` | grønn | **PASS** — 1 fil / 3 tester ✓ |
| Typer | `npx tsc --noEmit` | exit 0 | **PASS** — exit 0 ✓ |
| Full suite | `npx vitest run` | grønn | **PASS** — 264 filer / 3373 tester ✓ |
| Sweep | `grep -rn "foreignTable\|referencedTable" ...` | kun kommentar-omtaler | **PASS** — 2 kommentar-treff, 0 API-treff ✓ |
| Build | `npm run build` | grønn | Ikke kjørt (ingen mistenkelig page.tsx-diff funnet; forhåndskjørt av byggeren) |

---

## Kanttilfeller og observasjoner (ikke-blokkerende)

**localeCompare-locale-avhengighet:** Ikke et reelt problem her. ISO 8601-tidsstempler er rent ASCII; collation-varianter i localeCompare slår ikke inn for slike strenger. Korrekt brukt.

**To spill med identisk ended_at:** Komparatoren returnerer 0, `.sort()` er stabil i V8 — relativ Postgres-rekkefølge bevares. Akseptabel oppførsel.

**Browser-verifisering:** Hjem-siden krever autentisert Supabase-session med ekte spilldata; Playwright/preview er ikke praktisk gjennomførbart her. For en ren sorteringsfix av denne typen er Type A-testdekning (med prod-fikstur fra issuet) + grønn `tsc`-gate + grønn build tilstrekkelig. Sorteringslogikken er fullstendig isolert i en ren funksjon, og integrasjonen med page.tsx er enkel (én `.sort()`-kall på et ferdig mappet array). Evaluator anser browser-gate som unødvendig her.

**CHANGELOG-nesting:** `### [1.117.1]` er korrekt plassert mellom `## 1.117.y`-headingen og `### [1.117.0]`-oppføringen. Patch-bugfix nestes under åpent tema per changelog-konvensjonen.

---

**Addendum (hovedchat, etter rebase 2026-06-13):** Versjonen ble renummerert 1.117.1 → 1.117.2 under rebase mot origin/main fordi en parallell leaderboard-fix (984ea6e3) tok 1.117.1 på main. Kun heading-nummeret i CHANGELOG og package.json-versjonen er endret; selve fixen, testene og evidensen over er uendret. Gates re-kjørt etter rebase: tsc OK, full suite 3374 grønne.
