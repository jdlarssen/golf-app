# Spec: Mål onboarding-funnelen (invitert → login → profil → første slag) (#1192)

**Issue:** [#1192](https://github.com/jdlarssen/golf-app/issues/1192) · UX-psykologi: mål effekten av konverterings-byggene · Flyt 1 (bli bruker) + flyt 2 (bli med)
**Type:** `feat` (admin-synlig, som #1010) → MINOR-bump + CHANGELOG Funksjoner-rad

## Problem

Vi pynter på onboarding (#1169/#1176/#1177) uten å måle drop-off. Funnelen for en ny
invitert spiller er **invitert → åpnet /login → OTP verifisert → profil fullført → første
slag tastet**. I dag er delene instrumentert som tidsstempler, men aldri koblet til én
trakt admin kan se — så vi vet ikke om konverterings-byggene flytter nålen. Uten en
baseline bygger vi i blinde.

## Research Findings (verifisert)

- **Alle stegene finnes alt som tidsstempler.** `invitations` har `created_at`, `opened_at`,
  `accepted_at`, `email`, `game_id` ([lib/database.types.ts:1006-1017](lib/database.types.ts));
  `users` har `email`, `profile_completed_at`, `created_at`, `is_guest`, `deleted_at`
  ([lib/database.types.ts:1700-1719](lib/database.types.ts)). «Første slag» = eksistens av
  en `scores`-rad for brukeren. Ingen ny tabell, ingen nye skriveveier.
- **`accepted_at` settes på invitasjonen ved OTP-verify** (RLS-policy 0012, jf. CLAUDE.md
  auth-flyt) — pålitelig «verifiserte»-markør uten bruker-join.
- **Etablert admin-metrics-mønster finnes:** `admin_key_metrics()` RPC
  ([supabase/migrations/0126_admin_key_metrics.sql](supabase/migrations/0126_admin_key_metrics.sql))
  — SECURITY DEFINER, `stable`, in-body `if not public.is_admin() then raise exception`,
  `set search_path = ''`, `revoke from public/anon` + `grant execute to authenticated`,
  returnerer `jsonb`. Oslo-uker gjøres i SQL med `date_trunc('week', … at time zone
  'Europe/Oslo')`.
- **UI-mønsteret:** [KeyMetricsCard.tsx](app/[locale]/admin/KeyMetricsCard.tsx) er en async
  Suspense-child som kaller `.rpc('admin_key_metrics')` med adminens JWT, narrower payloaden
  i `parseMetrics` (returnerer `null` ved shape-drift → kortet rendrer ingenting), og gir
  den til presentational [KeyMetricsView.tsx](app/[locale]/admin/KeyMetricsView.tsx)
  (`data-testid`, `tabular-nums`, `admin.dashboard`-namespace). Én Type C-test
  (`KeyMetricsView.test.tsx`).
- **Oslo-helpere i TS:** `osloIsoWeek`/`osloYearWindow`/`osloParts`
  ([lib/format/osloCalendar.ts](lib/format/osloCalendar.ts), [lib/format/teeOff.ts](lib/format/teeOff.ts))
  — men aggregeringen bor i Postgres, så tidsvinduer gjøres der med `AT TIME ZONE
  'Europe/Oslo'` (samme mønster som 0126).

## Prior Decisions

- **#1010 (0126):** admin-metrics = én SECURITY DEFINER read-only-RPC + tynn Suspense-child +
  presentational view; håndhevet i DB (`is_admin()`), aldri bare UI. CHANGELOG: admin-synlig
  funksjon får Funksjoner-rad (presedens 1.161/1.165).
- **Eier (denne økten) — Key Decision:** avledet fra eksisterende tidsstempler (INGEN ny
  tabell/skriv), vist som aggregert drop-off-seksjon i admin-nøkkeltallene.

## Design

Utvid `admin_key_metrics()`-payloaden med et `funnel`-objekt (ett rundtur, samme kort) via
ny migrasjon som `create or replace`-er funksjonen (0107: staging → verifiser → prod):

```
funnel: { invited, opened, accepted, profile_completed, first_score }  // rene antall
```

- **Kohort:** invitasjoner (`invitations`), koblet til bruker via **case-insensitiv
  e-post-match** (`invitations.email ilike users.email`) for de to siste stegene.
- **Stegtelling (aggregert, aldri per-navn):**
  - `invited` = antall invitasjoner i vinduet
  - `opened` = `opened_at is not null`
  - `accepted` = `accepted_at is not null`
  - `profile_completed` = join til `users` på e-post der `profile_completed_at is not null`
    (og `deleted_at is null`)
  - `first_score` = de kohort-brukerne som har ≥1 `scores`-rad
- **Presentasjon:** ny drop-off-underseksjon i `KeyMetricsView` — de fem stegene med antall +
  drop-off (avledet i view-en, som `share`-tallet i dag), `tabular-nums`, `data-testid`.
  `parseMetrics` utvides til å narrowe `funnel` (fortsatt `null`-ved-drift). Nye
  `admin.dashboard`-nøkler (no + en).

## Edge Cases & Guardrails

- **Personvern (hard guardrail):** RPC-en returnerer KUN aggregerte antall — aldri e-post,
  navn eller per-invitasjon-rader. `is_admin()`-gate i kroppen (ikke bare UI).
- **E-post-match-glipp:** en invitert som selv-registrerer med en ANNEN e-post matcher ikke
  `profile_completed`/`first_score` — akseptert og dokumentert i RPC-kommentaren (steg 1-3 er
  fortsatt eksakte via invitasjonsraden). Monoton kohort er ikke garantert på tvers av join —
  vis rene antall per steg, ikke en påtvunget «hver ≤ forrige».
- **Shape-drift:** utvidet payload MÅ oppdatere `parseMetrics` + `KeyMetricsView` i samme PR,
  ellers rendrer kortet `null` (ActionItemsStripe-disiplinen — brutt metrics bryter aldri rommet).
- **Drift-gate:** håndskrevet `Functions`-oppføring i `lib/database.types.ts` diffes mot friskt
  genererte prod-typer (fasit).

## Key Decisions

- **Avledet fra tidsstempler, aggregert i admin-nøkkeltall** (eier). Ingen ny tabell, ingen
  funnel-events, ingen nye skriveveier.
- **Utvid `admin_key_metrics()` fremfor ny RPC:** eier sa «aggregert drop-off-seksjon i
  nøkkeltallene» → samme kort, ett rundtur. En separat RPC/kort er alternativet hvis
  utvidelsen viser seg klønete.
- **Bør bygges FØR/tidlig i konverterings-puljen** (#1169/#1176/#1177) så effekten deres blir
  målbar — men uavhengig byggbar (rører ingen av dem).

**Claude's Discretion:**
- **Tidsvindu:** all-time vs. siste N dager. Anbefaling: **all-time i v1** (dagens volum er
  lavt, all-time er ærligst og enklest); noter at et Oslo-vindu (`AT TIME ZONE 'Europe/Oslo'`
  som 0126) kan legges til senere hvis nylige ikke-konverterte invitasjoner drukner raten.
- Ny RPC + eget kort vs. utvidelse av 0126 (default: utvidelse).
- Om `is_guest`-brukere skal ekskluderes fra bruker-stegene (default: ja — gjester er ikke
  onboarding-kohort).
- Eksakt drop-off-visning (antall + prosent per steg vs. bare antall) og copy (humaniseres).

## Success Criteria

- [ ] RPC-en returnerer `funnel: { invited, opened, accepted, profile_completed, first_score }`
      som rene antall — verifisert mot manuell kontroll-SQL på staging (og hostile probe:
      spiller-JWT → `not_authorized`).
- [ ] `/admin` viser en drop-off-seksjon med de fem stegene under Nøkkeltall — `tabular-nums`,
      `data-testid`, ingen persondata i HTML-en (grep: 0 e-post/navn).
- [ ] Ikke-admin får ikke funnel-dataene (DB-gate, ikke bare UI).
- [ ] `parseMetrics` narrower `funnel` og rendrer `null` ved shape-drift (uendret disiplin).
- [ ] Maks én Type C-rendertest oppdatert (aldri norsk copy); ingen ny tracking / ingen skriv.
- [ ] Copy i `no.json` + `en.json` (catalogParity grønn), norsk humanizer-kjørt.

## Gates

- [ ] `npx tsc --noEmit` grønn · `npm run lint` grønn · `npm run build` grønn.
- [ ] Co-located vitest for endrede filer grønn (`KeyMetricsView.test.tsx`).
- [ ] Migrasjon påført staging → verifisert (manuell SQL + hostile probe) → prod (0107); drift-gate:
      håndskrevet Functions-oppføring diffet mot friske prod-typer.
- [ ] Bruker/admin-synlig → staging-klikkrunde av `/admin` før merge.
- [ ] `feat` → MINOR-bump + CHANGELOG Funksjoner-rad; alle commits `Refs #1192`.

## Files Likely Touched

- `supabase/migrations/0127_admin_onboarding_funnel.sql` — `create or replace admin_key_metrics()` med `funnel`-objekt
- `lib/database.types.ts` — `Functions`-oppføring (håndskrevet, drift-gate er fasit)
- `app/[locale]/admin/KeyMetricsCard.tsx` — `parseMetrics` utvidet med `funnel`
- `app/[locale]/admin/KeyMetricsView.tsx` (+ `KeyMetricsView.test.tsx`) — drop-off-seksjon
- `messages/no.json` + `messages/en.json` — `admin.dashboard.funnel*`
- `package.json` + `CHANGELOG.md`

## Out of Scope

- Selve konverterings-byggene (#1169/#1176/#1177) — dette måler dem.
- Per-navngitt spiller-attribusjon, kohort-drill-down, tidsserie-graf over funnel.
- Kilde-attribusjon (`signup_source`) i funnelen (#1022 dekker plakat-kilde separat).
- Materialisering/caching (spørringen er billig på dagens volum).
