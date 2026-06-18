# Design: separat test-/UAT-miljø (egen Supabase-DB)

**Dato:** 2026-06-18
**Status:** Godkjent av eier 2026-06-18 — klar til utførelse (Fase 1 + 2)
**Forfatter:** Claude (brainstorming-sesjon)

## 1. Bakgrunn og problem

Tørny tester per i dag **mot prod-databasen** («Production-only testing»-konvensjonen).
E2e-vakten fra #674 ([`e2e/games/scoring-golden-path.spec.ts`](../../../e2e/games/scoring-golden-path.spec.ts))
kjører på hver PR via CI. Hver kjøring:

1. Seeder et ekte aktivt spill `TEST-GoldenPath-…` i prod med en testspiller («testers»).
2. Logger inn som spilleren og leverer scorekortet → `submitScorecard`-handlingen fyrer.
3. `submitScorecard` varsler **alle admins** (= Jørgen) med et `scorecard_submitted`-varsel.
4. Sletter spillet etterpå (`cleanupTestGame`) — men varslene blir liggende (de lagrer
   `game_id` som JSON uten foreign key, så de cascader ikke ved sletting).

**Resultat (bekreftet i prod 2026-06-18):** 20 «Nytt scorekort levert»-spøkelses-varsler
i Jørgens Innboks 17. juni (ett per CI-kjøring den dagen). De ble ryddet manuelt i denne
sesjonen. Ingen ekte e-post ble sendt — CI-jobben har ingen `RESEND_API_KEY`
([`ci.yml`](../../../.github/workflows/ci.yml) linje 85–90), så Resend-mailen no-op-er der.
Floden var altså rent in-app.

### Kjerneinnsikt

CI bygger og kjører appen **lokalt** (`npm run dev` på `localhost:3000`,
[`playwright.config.ts`](../../../playwright.config.ts)). Det eneste som gjør dette til
«test mot prod» er at Supabase-URL + service-role-hemmelighetene peker på prod-prosjektet
(`glofubopddkjhymcbaph`). **Et test-miljø er derfor i hovedsak én ting: en separat
Supabase-database som CI peker på** — ikke en parallell app-utrulling.

## 2. Mål og ikke-mål

**Mål:**
- Automatiske tester (e2e) skal aldri skrive til prod-databasen eller forurense Jørgens
  ekte Innboks/inbox.
- Beholde verdien av e2e-vakten: fange skjema-mismatch-bugs av typen #641/#642/#647.
- Gi et sted Jørgen kan teste manuelt (UAT) uten å røre prod.
- Null løpende kostnad (bli på hobby-/free-tier).

**Ikke-mål:**
- Endre selve e2e-testkoden (isolasjonen løser problemet, ikke kodeendringer).
- Migrere bort fra Supabase/Vercel/Resend.
- Bygge CI-infrastruktur for last-/skala-testing (utenfor scope).

## 3. Valgt tilnærming: eget gratis test-Supabase-prosjekt

Vurderte alternativer (eier valgte å se forskjellen; landet på dette):

| Vei | Kostnad | UAT å klikke i | Skjema-troskap | Oppsett |
|-----|---------|----------------|----------------|---------|
| **A. Eget test-prosjekt (valgt)** | $0 | Ja (via Vercel preview) | Høy (migrasjoner = prod, voktet av schema-drift) | Lite |
| B. Midlertidig DB i CI | $0 | Nei | Høy | Middels (Docker i CI) |
| C. Supabase Pro Branching | ~250 kr/mnd | Ja | Høyest (klonet fra prod) | Lite |

**Hvorfor A:** dekker «UAT der jeg kan teste selv», minimal endring (CI kjører allerede
appen lokalt — vi bytter bare hvilken DB den peker på), $0, og skjema-troskapen beholdes
(se §8). B gir ingen manuell UAT-flate; C koster og bryter hobby-tier.

## 4. Arkitektur

Tre miljøer etter endringen:

```
PROD (uendret)
  Supabase: glofubopddkjhymcbaph   ← ekte brukerdata
  Vercel Production env            → peker på prod
  tornygolf.no

TEST / UAT (nytt)
  Supabase: torny-staging (nytt free-prosjekt)  ← kun test-data
  Vercel Preview env               → peker på test-DB
  PR preview-URL-er                = klikkbar UAT-flate
  GitHub CI e2e-hemmeligheter      → peker på test-DB

LOKAL UTVIKLING (uendret)
  .env.local hos eier             → peker fortsatt på prod (eierens valg)
```

**Dataflyt — e2e i CI etter endring:**
`PR åpnes → CI booter app lokalt → app + e2e snakker med torny-staging-DB →
testspill/varsler havner i test-DB → prod og Jørgens Innboks urørt.`

## 5. Komponenter

1. **Nytt Supabase-prosjekt `torny-staging`** (EU-region, free-tier). Egen DB, egen auth,
   egne nøkler.
2. **Skjema:** alle 107 migrasjoner (`supabase/migrations/0001`–`0106`) påført det nye
   prosjektet, så skjemaet er identisk med det koden forventer.
3. **Seed-data i test-DB:**
   - Én test-admin-bruker (`is_admin = true`, fullført profil).
   - Én test-spiller-bruker (`is_admin = false`, fullført profil).
   - Minst én bane med 18 hull + en tee-box med herre-rating (e2e velger «første
     tilgjengelige» bane/tee).
4. **Vercel Preview-env-variabler** → test-prosjektets URL + anon-key (Production-env
   forblir prod).
5. **GitHub Actions-hemmeligheter** (`NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `E2E_ADMIN_EMAIL`,
   `E2E_PLAYER_EMAIL`) → byttet til test-prosjektets verdier.

## 6. Faseinndeling

### Fase 1 — flytt automatisk testing av prod (kjernen, stopper roten av problemet)
- Opprett `torny-staging`-prosjektet.
- Påfør alle migrasjoner.
- Seed test-admin + test-spiller + bane/tee.
- Bytt de 5 GitHub CI-hemmelighetene til test-prosjektet.
- **Effekt:** all e2e-trafikk forlater prod. Jørgens Innboks forurenses ikke lenger.

### Fase 2 — klikkbar UAT
- Sett Vercel **Preview**-env-variablene til test-DB-en.
- **Effekt:** hver PR-preview-URL blir en trygg manuell test-flate på test-data.

### Fase 3 — drift/polish
- Keep-alive: en bitteliten ukentlig ping (GitHub Actions cron) så free-tier-prosjektet
  ikke «sovner» etter 7 dager. Alternativt: aksepter cold-start på første kjøring etter
  pause.
- Valgfritt: en periodisk sjekk som sammenligner test-skjema mot prod-skjema (utvider
  `schema-drift.yml`-tankegangen) for å fange at de to driver fra hverandre.

## 7. Oppgavefordeling (eier vs. Claude)

Per samarbeidsmodellen i CLAUDE.md gjør **eier** alt i tredjeparts-UI-er; **Claude** gjør
kode/SQL/diagnostikk.

| # | Steg | Hvem | Detalj |
|---|------|------|--------|
| 1 | Opprett `torny-staging`-prosjektet | **Eier** | Supabase Dashboard → New project → EU-region → noter DB-passord |
| 2 | Del prosjekt-ref + nøkler | **Eier** | Kopier Project URL, anon key, service_role key fra Settings → API |
| 3 | Påfør 107 migrasjoner | **Claude** | Via Supabase MCP (`apply_migration` mot nytt project-id). Fallback: SQL-bundle eier limer i SQL Editor |
| 4 | Opprett auth-brukere | **Eier** | Authentication → Add user: test-admin + test-spiller (foreslåtte aliaser i §9) |
| 5 | Seed profil + is_admin + bane/tee | **Claude** | SQL-skript kjøres via MCP mot test-prosjektet |
| 6 | Sett GitHub CI-hemmeligheter | **Eier** | Settings → Secrets and variables → Actions → bytt de 5 verdiene |
| 7 (Fase 2) | Sett Vercel Preview-env | **Eier** | Vercel → Settings → Environment Variables → scope = Preview |
| 8 | Verifiser e2e grønn mot test-DB | **Claude** | Trigge CI på en throwaway-PR, bekrefte ingen prod-skriv |

Claude leverer eksakte navigasjonsstier + kopier-lim-klare verdier for hvert eier-steg
når vi utfører.

## 8. Risikoer og avveininger

- **Skjema-troskap (viktigst):** Et test-DB bygget fra migrasjoner har nøyaktig de
  kolonnene migrasjonene definerer. Bugs av #641-typen («koden antar kolonne X som ikke
  finnes») reproduseres fordi test-DB-en heller ikke har kolonnen → e2e feiler likt.
  Det eneste en migrasjons-bygget test-DB *ikke* fanger er om **prod** har drevet bort fra
  migrasjonene (manuelle prod-endringer) — men det er akkurat hva
  [`schema-drift.yml`](../../../.github/workflows/schema-drift.yml) allerede vokter (den
  regenererer typer fra prod og diff-er). Netto: vi mister ingen e2e-dekning.
- **Free-tier-pause:** Prosjekter sovner etter 7 dager uten aktivitet. Fase 3-keep-alive
  løser det; uten den blir første CI-kjøring etter en pause treg (auto-resume).
- **Free-tier-grense:** Free tier tillater 2 aktive prosjekter per org. Eier har 1 (prod);
  test blir #2 → fortsatt $0. Et evt. tredje miljø ville krevd Pro.
- **`gen:types` + schema-drift forblir prod-pekende:** Begge er hardkodet til
  prod-project-id og skal **ikke** endres — prod er sannhetskilden for typer.
- **Resend i Preview:** La `RESEND_API_KEY` være **usatt** i Vercel Preview-env i første
  omgang → ingen ekte e-post fra UAT. Revurder hvis manuell mail-testing trengs senere.

## 9. Foreslåtte test-bruker-aliaser

For å holde all evt. e-post sporbar og filtrerbar:
- Test-admin: `e2e-admin@example.com`
- Test-spiller: `e2e-player@example.com`

(Gmail-aliaser leverer til samme innboks, men i test-miljøet sendes ingen mail i CI, og
Preview lar Resend stå usatt — så de er i praksis stille.)

## 10. Verifisering

- Etter Fase 1: kjør e2e-vakten mot test-DB (throwaway-PR). Bekreft (a) testene er grønne,
  (b) `select count(*) from games where name like 'TEST-%'` i **prod** forblir 0, (c) ingen
  nye `scorecard_submitted`-varsler til Jørgen i prod.
- Etter Fase 2: åpne en PR-preview-URL, bekreft at innlogging + et testspill lander i
  test-DB, ikke prod.

## 11. Rollback

Reversibelt når som helst ved å bytte de 5 GitHub-hemmelighetene (og Vercel Preview-env)
tilbake til prod-verdiene. Test-prosjektet kan stå urørt eller slettes. Ingen
kode-/skjemaendring i prod-repoet kreves for rollback.

## 12. Avklarte beslutninger (eier, 2026-06-18)

1. **Prosjektnavn:** `torny-staging`.
2. **Omfang:** Fase 1 **og** Fase 2 bygges i samme runde (klikkbar UAT med en gang).
   Fase 3 (keep-alive/skjema-sync) er polish, tas ved behov.
3. **Sporing:** GitHub-issue (Backlog-milestone) med denne spec-en som body.

## 13. Gjenstående åpne spørsmål

1. **Migrasjonsapplikasjon:** Kan Supabase-MCP-en nå det nye prosjektet (samme org)? Hvis
   ja → Claude påfører alle 107 direkte. Hvis nei → eier limer en samlet SQL-bundle i
   SQL Editor. Avklares ved utførelse (steg 3).
