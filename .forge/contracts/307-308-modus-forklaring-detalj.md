# Kontrakt: #307 + #308 — DB-redigerbar modus-forklaring + detalj-side med eksempler

**Issues:** https://github.com/jdlarssen/golf-app/issues/307 + https://github.com/jdlarssen/golf-app/issues/308
**Type:** feat (area:admin + area:ui), #299-tråden
**Branch:** claude/beautiful-goldstine-ee8943
**Beslutning (bruker):** Samlet — detalj-side + DB-redigerbar, innhold for ALLE 22 modi.

## Mål

1. Flytt modus-forklaringene fra hardkodet `MODE_GUIDE` til DB-drevet, admin-redigerbar (#307).
2. Ny `/spillformer/[slug]`-detaljside med fyldigere forklaring + konkret eksempel per modus (#308). Korte regler (summary + punkter) består som inngang på spill-siden + `/spillformer`-indeks; detaljsiden legger til lang prosa + eksempel.
3. Admin redigerer alt (summary, punkter, lang, eksempel) fra Sekretariatet uten deploy.

## Datamodell (besluttet)

Fire nye nullable-kolonner på `formats` (null → kode-fallback til `MODE_GUIDE`):
```sql
alter table public.formats
  add column rules_summary text,
  add column rules_points  text[],
  add column rules_long     text,
  add column rules_example  text;
```
- Seed `rules_summary` + `rules_points` fra dagens `MODE_GUIDE` (alle 22) — ingenting går tapt.
- Skriv `rules_long` + `rules_example` for alle 22 modi (ny copy, brand-stemme + humanizer).
- **4BBB-variant:** `STABLEFORD_4BBB_GUIDE` (stableford team_size 2) er ikke en egen slug. Behold kode-fallback for den korte kort-varianten via `resolveModeGuide`; detaljsiden er per-slug (ingen variant der). Ikke over-komplisér med per-variant DB-rader.

## Arkitektur (besluttet)

- **`lib/formats/getModeContent.ts`** (server-only): `getModeContent()` → `Record<slug, MergedModeContent>`, `unstable_cache` på tag `format-mapping` (samme som getFormatsForIntent), admin-client-read. Per felt: DB-verdi hvis non-null, ellers `MODE_GUIDE`-fallback. Eksporter også en ren `mergeModeContent(dbRow, mode, teamSize)`-funksjon (Type-A-testbar uten DB).
- **`ModeGuideCard`** refaktoreres til ren presentasjon: tar `summary` + `points` (+ valgfri `detailHref`) som props i stedet for å importere `MODE_GUIDE`. Kall-sider (spill-side ×2, /spillformer) henter via `getModeContent` server-side og sender inn. Beholder `<details>`-disclosure + 4BBB-variant-logikk på call-site via `resolveModeGuide`-fallback.
- **`/spillformer`-indeks**: fetcher `getModeContent` server-side, rendrer kort, hvert kort lenker til `/spillformer/[slug]`.
- **`/spillformer/[slug]/page.tsx`** (ny, server): summary + punkter + `rules_long` (prosa) + `rules_example` (konkret eksempel) + «← Alle spillformer». 404 for ukjent slug.
- **Admin `FormatsManager`**: utvidbar tekst-redigering per format (summary, punkter (multiline → text[]), lang, eksempel) + ny server-action `updateFormatContent(formData)` (admin-client, `formats_admin_write` RLS finnes) + `revalidateTag('format-mapping', 'max')`.

## Suksesskriterier

- [ ] Migrasjon: 4 nullable-kolonner på `formats` + seed av summary/points (alle 22) + rules_long/rules_example (alle 22). `lib/database.types.ts` oppdatert.
- [ ] `mergeModeContent` ren helper: DB-verdi vinner per felt, null → MODE_GUIDE-fallback; Type-A-testet (DB-verdi, fallback, blandet).
- [ ] `getModeContent` cached på `format-mapping`-tag (admin-client read).
- [ ] `ModeGuideCard` tar data via props; spill-side (×2) + /spillformer henter via getModeContent; 4BBB-variant bevart.
- [ ] `/spillformer`-indeks lenker hvert kort til detaljside.
- [ ] `/spillformer/[slug]` viser summary + punkter + lang + eksempel; 404 ved ukjent slug; alle 22 slugs rendrer.
- [ ] Admin kan redigere alle fire feltene per format fra `/admin/formats`; endring synlig på /spillformer + spill-side uten deploy (revalidateTag).
- [ ] Innhold: rules_long + rules_example skrevet for alle 22 modi, brand-stemme, humanizer-pass. Eksempler konkrete (f.eks. «Hull 3: du 4, partner 5 → laget tar 4»).
- [ ] Tester: mergeModeContent (Type A) + ÉN detalj-side-render (Type C) + admin-action minimal. Ingen re-assert av innholdsstrenger.

## Gates

- `npx vitest run lib/formats/ app/spillformer app/admin/formats` — grønt
- `npm run build` · `npx eslint` på endrede filer
- Migrasjon appliseres via Supabase MCP POST-merge (seed-migrasjon — per minne: format-seed kjøres etter deploy)

## Versjonering

Ny bruker-synlig feature (detaljsider + admin-redigering) → **MINOR** (1.60.0) + CHANGELOG (ny serie-heading, wrap forrige 1.59.y i `<details>`).
