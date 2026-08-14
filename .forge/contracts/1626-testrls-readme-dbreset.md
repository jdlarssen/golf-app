# Kontrakt #1626 — test:rls-README mangler db reset-kuren

**Issue:** #1626 · **Branch:** `claude/docs-trio-1566-1626-1403` · **Type:** docs

## Mål

`supabase start` gjenbruker et eksisterende Docker-volum uten å re-påføre migrasjoner —
første `npm run test:rls` etter skjema-bevegelse blir masse-falsk-rød uten hint om årsak
(kostet en full falsk-rød kjøring i #1595-runden). Dokumentér symptom, årsak og kur
(`supabase db reset`) i `supabase/tests/README.md`.

## Suksesskriterier

- [x] «Slik kjører du»-seksjonen har et kort avsnitt: symptom (masse-rødt på første
  kjøring etter at migrasjoner har beveget seg), årsak (stale volum), kur
  (`supabase db reset` før `npm run test:rls`).
- [x] Avsnittet ligger ved standardveien (A), der kjøre-instruksene faktisk leses.
- [x] Ingen andre deler av README-en endres (I4 — status-teksten om #533 er utenfor scope).

## Gates

- `npm run build` på branchen (upåvirket).
- Prefix `docs:` + `Refs #1626`.

## Antagelser

- ASSUMPTION: kur-kommandoen dokumenteres som `supabase db reset` (re-påfører alle
  migrasjoner på det lokale volumet) — ingen verifiserende kjøring her (krever Docker-
  stack oppe; README-en beskriver allerede skip-guarden). VERIFICATION GAP: kommandoen
  kjøres ikke i denne økta; ordlyden speiler evaluator-funnet i issue-teksten.

## Utenfor scope

- Å fikse #533 (duplikat-prefiks) eller oppdatere status-blokken om den.

## Evidens (runde 1, 2026-08-14)

Selv-sjekk: grep 'version bump'/'versjons-bump' = 0 treff; grep 'supabase db reset' = 1; git diff SmartLink = kun kommentarlinjer. Build exit 0. Evaluator-verdikt: ACCEPT — se .forge/evaluations/docs-trio-1566-1626-1403.md.
