# Kontrakt #1566 — utdatert bump-ordlyd i to disiplin-docs

**Issue:** #1566 · **Branch:** `claude/docs-trio-1566-1626-1403` · **Type:** docs

## Mål

Etter #1562 (notatfil-regimet) eier ukesrutinen versjons-bump og CHANGELOG. To generiske
disiplin-dokumenter bruker fortsatt per-commit-bump som eksempel-ordlyd. Juster ordlyden
så eksemplene matcher dagens regime.

## Endringssteder (verifisert mot HEAD 2026-08-14)

1. `docs/agent-discipline/procedures/commit-and-pr.md` steg 5: «(prefix, tracking
   reference, version bump, changelog)» → nøytraliser til notatfil-regimet. Fila er
   generisk/porterbar (repo-spesifikker bor i bindings §T6) — hold ordlyden generisk:
   «(prefix, tracking reference, release-note/changelog artifacts)».
2. `docs/test-discipline.md` «Block-nivå reserveres …»: «(commit-msg-format,
   versjons-bump)» → dagens block-nivå-eksempler: «(commit-msg-format, manglende
   notatfil, versjonsfelt-endring utenfor ukesrutinen)».

## Suksesskriterier

- [ ] Ingen av de to stedene bruker per-commit-bump som gjeldende praksis-eksempel.
- [ ] commit-and-pr.md forblir repo-agnostisk (ingen Tørny-spesifikke stier/navn).
- [ ] `git diff` viser kun ordlyds-endring — ingen strukturendring i noen av filene.

## Gates

- `npm run build` på branchen (docs-endring — forventes upåvirket grønn).
- Prefix `docs:` + `Refs #1566` (ingen `.changes/`-notat for docs).

## Antagelser

- ASSUMPTION: «versjonsfelt-endring» er riktig block-eksempel — commit-msg-hooken blokkerer
  i dag feat/fix/perf uten notatfil OG version-felt-endring utenfor `chore(release)`
  (CLAUDE.md §Versjonering).

## Utenfor scope

- Øvrige forekomster av bump-språk i repoet (grep-sweep gjøres, men kun disse to filene
  endres — andre funn rapporteres).
