# Contract: Logg Supabase-feilen før `?error=db_*`-redirects (#567)

**Issue:** [#567](https://github.com/jdlarssen/golf-app/issues/567)
**Branch:** `claude/jolly-wilson-ff56c0`
**Type:** chore/refactor — ren diagnostikk, INGEN oppførselsendring, INGEN versjonsbump

## Bakgrunn

Prod-hendelse 2026-06-12: admin fikk «Klarte ikke å lese spillerlisten fra databasen.»
(`?error=db_roster`) ved første «Start spillet»-klikk; retry ~3 min senere lyktes.
Rotårsaken lot seg ikke fastslå fordi server-actions svelger PostgREST-feilobjektet
og redirecter rett til `?error=db_*` **uten å logge noe**. Vercel runtime-loggen viser
ingenting, og Supabase API-loggene roterer ut før noen rekker å se.

Test-disiplinen («Bug-fix fra prod: capture log/payload som fikstur FØRST») forutsetter
at det finnes en logg å capture. Dette issuet skaper den loggen.

## Mål

Før hver redirect til `?error=db_*` i admin/creator server-actions: logg den underliggende
Supabase-feilen med stabil prefiks, slik at neste transiente feil er synlig i Vercel-loggen.

## Scope (11 filer, 51 `error=db_*`-sites i ikke-test-kode)

Alle ikke-test-filer med `?error=db_*`-redirects:

| Sites | Fil |
|---|---|
| 11 | `app/[locale]/admin/games/[id]/actions.ts` |
| 11 | `app/[locale]/admin/courses/[id]/edit/actions.ts` |
| 6  | `app/[locale]/admin/games/[id]/signups/actions.ts` |
| 6  | `app/[locale]/admin/formats/actions.ts` |
| 5  | `app/[locale]/admin/games/[id]/flightActions.ts` |
| 3  | `app/[locale]/admin/games/new/actions.ts` |
| 3  | `app/[locale]/admin/games/[id]/edit/actions.ts` |
| 2  | `app/[locale]/admin/games/[id]/inviteToGameActions.ts` |
| 2  | `app/[locale]/admin/games/[id]/avslutt/actions.ts` |
| 1  | `app/[locale]/games/[id]/spillere/actions.ts` |
| 1  | `app/[locale]/admin/games/[id]/avslutt-likevel/actions.ts` |

## Beslutninger (gråsoner — tekniske, avgjort her)

1. **Log-format:** `console.error('[<actionFn>] <operasjon> failed', <errorVar>)`. Stabil
   `[funksjonsnavn]`-prefiks matcher eksisterende konvensjon (`[endGame]`,
   `[submitScorecard]`, `[admin/spillere]` per CLAUDE.md). Feilobjektet sendes som 2. arg.
2. **Hva logges:** Supabase-feilvariabelen som gater redirecten (`gpError`, `teeError`,
   `updateError`, `statusError`, `rosterUsersError`, …). Når guarden også dekker `!data`
   (null-resultat med null-feil), fyrer loggen likevel og viser `null` — selv det er
   diagnostisk (tomt/RLS-blokkert resultat).
3. **Distinkte meldinger ved gjenbrukt feilkode:** `actions.ts` har to `db_roster`-sites
   (linje 178 = `gpError` på game_players-lesningen; linje 200 = `rosterUsersError` på
   users-lesningen lagt til av #565). Begge får distinkt melding så neste hendelse
   disambiguerer hvilken lesning som feilet — nøyaktig prod-hendelsens blindsone.
4. **Ingen versjonsbump / ingen CHANGELOG:** ren diagnostikk uten user-visible endring →
   `chore(...)`-commits. commit-msg-hooken slår kun ut på feat/fix/perf.
5. **Ingen nye tester:** «assert console.error ble kalt» er en lavverdi-test test-disiplinen
   fraråder. Men eksisterende co-located tester MÅ kjøres for å bekrefte at lagt-til logging
   ikke bryter dem (console-spy-forventninger e.l.).

## Utenfor scope (bevisst)

- `?error=not_found` / `?error=not_active` / validerings-redirects som ikke er `db_*` —
  selv om noen (`if (gameError || !game) → not_found`) svelger en Supabase-feil, holder vi
  oss til issuets `db_*`-avgrensning. Adjacent gap; kan filtreres som eget issue hvis eier
  vil. Ikke gold-plate.
- `app/[locale]/(auth)/login/actions.ts` `?error=`-redirects (auth-koder, ikke `db_*`).
- Strukturert logger / observability-plattform — overkill for dette issuet.

## Akseptansekriterier

- [ ] **K1 — Full dekning:** Hvert `?error=db_*`-redirect-feiltilfelle logger det faktiske
      Supabase-feilobjektet med `[funksjonsnavn]`-prefiks — normalt umiddelbart før redirecten.
      Unntak: `suggestFlightAssignment`s `db_roster`-redirect gates på `!players` der `players`
      kommer fra `fetchFlightPlayers`, som svelger feilen internt; loggen legges derfor ved
      *kilden* (`[fetchFlightPlayers] game_players read failed`, linje 55) — mer diagnostisk
      enn å logge `null` på call-site.
- [ ] **K2 — Riktig feilobjekt:** Hver lagt-til `console.error` passerer den faktiske
      Supabase-feilvariabelen fra guarden (ikke en streng alene).
- [ ] **K3 — Disambiguerte `db_roster`-meldinger:** De to `db_roster`-sitene i
      `admin/games/[id]/actions.ts` har distinkte meldingsstrenger.
- [ ] **K4 — Ingen oppførselsendring:** Redirect-mål, feilkoder og kontrollflyt er uendret;
      endringen er additiv logging. Enkelt-linje-`if (x) redirect(...)` pakkes i blokk der
      det trengs for å logge kun når redirecten faktisk fyrer (samme form som issuets eksempel).
- [ ] **K5 — Typecheck grønt:** `npx tsc --noEmit` passerer (alle feilvariabler i scope).
- [ ] **K6 — Eksisterende tester grønt:** co-located action-tester passerer uendret.
- [ ] **K7 — Ingen versjonsbump:** `package.json` version uendret; ingen CHANGELOG-oppføring.

## Gates

```bash
# Typecheck (K5)
npx tsc --noEmit

# Co-located tester for endrede filer (K6)
npx vitest run \
  "app/[locale]/admin/games/[id]/actions.test.ts" \
  "app/[locale]/admin/courses/[id]/edit/actions.test.ts"

# Dekningssjekk (K1): hver db_-redirect har en console.error i samme fil
# (manuell diff-gjennomgang per fil)

# Full build som siste gate
npm run build
```

## Implementeringsplan

Per-fil atomiske commits (`chore(observability): log Supabase error before db_* redirect in <fil>` … `Refs #567`).
Største/viktigste fil først (`admin/games/[id]/actions.ts` — prod-hendelsens fil), så resten.
