# Contract: Foundation Parallel — F2 + F3

**Parent epic:** [#270](https://github.com/jdlarssen/golf-app/issues/270)
**Pattern:** `/forge:parallel` med to streams

## Goal

Levere foundation-trioen for format-katalog-epic-en. F1 (#271) merget allerede; F2 og F3 kjøres parallelt nå siden de er fil-isolerte og begge avhenger kun av F1.

## Streams

| Stream | Issue | Kontrakt | Avhengighet | Status |
|---|---|---|---|---|
| F1 — Datamodell | #271 | `.forge/contracts/271-f1-data-model.md` | ingen | ✓ merget |
| F2 — Wizard redesign | #272 | `.forge/contracts/272-f2-wizard-redesign.md` | F1 | pending |
| F3 — Admin mapping | #273 | `.forge/contracts/273-f3-admin-format-mapping.md` | F1 | pending |

## File Isolation

Det er kritisk for parallel-safety at F2 og F3 ikke rører samme fil.

**F2 eier:**
- `app/admin/games/new/*` (alle filer)
- `app/admin/cup/new/*` (slettes)
- `app/admin/cup/page.tsx` (oppdater create-button href)
- `app/admin/cup/[id]/page.tsx` (oppdater +Match-button href)
- `components/icons/Icons.tsx` ELLER ny `IntentIcons.tsx` (4 nye intent-SVGs)
- `lib/formats/icons.ts` (NY: slug → komponent-mapping)

**F3 eier:**
- `app/admin/formats/*` (alle filer — alle NYE)

**Begge leser men endrer ikke:**
- `lib/formats/getFormatsForIntent.ts`, `lib/formats/validateGameMode.ts` (F1)

**Eksplisitt forbudt for begge:**
- `app/admin/page.tsx` (admin home tile-grid) — Format-tile + Cup-tile-justeringer er Wave-2 follow-up issue
- `lib/scoring/modes/*` (eksisterende scoring-moduler)
- `supabase/migrations/*` (ingen nye migrasjoner i F2 eller F3 — bare admin-skriv-aksjoner mot eksisterende tabeller)

## Merge Order

1. F2 og F3 PR-es uavhengig til main når de er klare (rekkefølge spiller ingen rolle)
2. Når begge merget: opprett Wave-2 follow-up issue for admin-tile-grid-justering (Cup-tile rename + Format-tile add)
3. Etter Wave-2 follow-up: foundation-trioen er ferdig — format-issues (#274–#291) kan starte i bølger

## Integration Criteria

Etter at begge streams er merget til main:
- [ ] `/admin/games/new` viser intent-først step 1 med 4 kort
- [ ] `/admin/cup/new` returnerer 404
- [ ] `/admin/formats` viser matrix-view med toggles
- [ ] Endring i `/admin/formats` reflekteres i `/admin/games/new` step 2 etter neste page-load (cache-invalidasjon virker)
- [ ] Full test-suite grønn etter integration
- [ ] Mobil-sjekk i Safari: begge nye flater fungerer på iPhone

## Worktree Setup

Hver stream får sin egen worktree:

```bash
# F2
git worktree add ../.claude/worktrees/272-wizard -b claude/272-wizard origin/main

# F3
git worktree add ../.claude/worktrees/273-mapping -b claude/273-mapping origin/main
```

Kontraktene kopieres inn i hver worktree før Claude-sesjon starter (allerede i `.forge/contracts/` på main etter at denne master-kontrakten landerer).

## Orchestrator Workflow

Den aktive Claude-sesjonen (denne) gjør:
1. Skrive F2 + F3 + master-kontrakter (ferdig)
2. Committe kontraktene på main (via PR eller direkte via brukers approval)
3. Opprette worktrees med branches fra main
4. Be brukeren åpne fresh Claude-sesjon i hver worktree

I hver worktree-sesjon kjører brukeren:
- `/forge:auto 272` (i F2-worktree) eller `/forge:auto 273` (i F3-worktree)

Forge:auto i hver worktree finner sin kontrakt, bygger, evaluerer, og rapporterer.

## Deferred (Wave-2 follow-up issue)

Ikke i F2 eller F3 — opprettes som nytt issue når begge er merget:
- Cup-tile på `/admin/page.tsx`: oppdater href fra `/admin/cup` til samme rute (bare label/meta?), eller endre til `/admin/games/new?intent=cup`
- Format-tile på `/admin/page.tsx`: ny tile for `/admin/formats`
- Eventuelle ikon-stil-justeringer på admin-home for konsistens
