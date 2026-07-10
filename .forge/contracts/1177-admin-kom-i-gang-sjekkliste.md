# Spec: In-app «kom i gang»-sjekkliste for ny admin (#1177)

**Issue:** [#1177](https://github.com/jdlarssen/golf-app/issues/1177) · UX-psykologi-runden (goal-gradient) · søsken til #1170 (admin-flaten) · `autonomy:ready`
**Type:** `feat` → MINOR-bump + CHANGELOG Funksjon-rad

## Problem

En ny admin møter et tomt Sekretariat: flisene sier bare «Ingen registrerte ennå» /
«Ingen aktive» (`TilesGrid.tsx:111,123,143,152`). Onboarding-runbooken finnes kun som statisk
markdown (`docs/launch-checklist.md`) ingen ser i appen. Goal-gradient: en sjekkliste som
starter over null («Konto opprettet ✓») gir driv til å fullføre bane → spill → invitasjoner.

## Research Findings (verifisert i denne økten)

- **Hvem ser admin-hjemmet:** `app/[locale]/admin/page.tsx` (KlubbhusetPage) brancher
  `if (!role.isAdmin) return <PlayerKlubbhus role={role} />` FØR noen admin-query;
  `lib/admin/auth.ts:38` setter `isAdmin: profile?.is_admin === true`. Trusted creators og
  vanlige spillere når aldri TilesGrid → sjekklisten scopes automatisk til `users.is_admin`.
- **Data finnes allerede:** `TilesGrid.tsx:20-77` henter i én `Promise.all`:
  aktive spill (`status='active'`), planlagte (`draft`/`scheduled`), ventende invitasjoner
  (`accepted_at is null` + ikke utløpt), `users`-count, `courses`-count, siste avsluttede spill
  (`lastFinishedRes`, :48-54). Alle tre sjekkliste-stegene kan avledes herfra — **null nye queries**.
- **Presentasjonslag:** `TilesView.tsx` er ren presentasjon (delt med PlayerKlubbhus) —
  sjekklisten følger samme mønster: data i TilesGrid, markup i egen presentasjonskomponent.
- **Innhold:** `docs/launch-checklist.md` («Dagen før»: bane verifisert, invitasjoner sendt;
  «På klubbhuset»: opprett spill) mapper direkte til stegene i issuet.
- **Dørene finnes:** `app/[locale]/admin/courses/new/`, `app/[locale]/admin/games/new/`
  (GameWizard), `app/[locale]/admin/spillere/` — alle verifisert på disk.
- Copy bor i `admin.dashboard`-namespacet (no + en); `catalogParity.test.ts` krever paritet.

## Prior Decisions

- **#216 (Lanseringer-tile):** utvidelser av admin-hjemmet skjer i TilesGrid-mønsteret
  (query i `Promise.all`, presentasjon separat); admin-only-innhold bor i admin-branchen.
- **#914:** dashboardet er tiered (core-tiles + «Mer i Sekretariatet») — sjekklisten må ikke
  dytte core-tiles langt ned; den er kompakt og forsvinner av seg selv.
- **#344 «Én dør per rom»:** sjekkliste-lenkene peker på EKSISTERENDE dører, lager ingen nye flyter.

## Design

Ny presentasjonskomponent `app/[locale]/admin/GettingStartedChecklist.tsx` som mottar tre
booleans, rendret fra `TilesGrid` (inne i eksisterende Suspense-grense) over core-tiles.
Fire punkter, auto-avhuket fra data:

1. **«Konto opprettet»** — alltid ✓ (goal-gradient-forskuddet).
2. **«Lag en bane»** — ✓ når `courseCount >= 1`; ellers lenke → `/admin/courses/new`.
3. **«Opprett ditt første spill»** — ✓ når `activeCount + plannedCount >= 1 || lastFinishedAt != null`
   (avsluttede spill teller — ellers «re-åpnes» steget når første runde signeres); ellers → `/admin/games/new`.
4. **«Inviter spillere»** — ✓ når `pendingInvites >= 1 || userCount >= 2` (admin selv er én
   users-rad; aksepterte invitasjoner har `accepted_at` satt og telles via userCount); ellers → `/admin/spillere`.

**Synlighet:** alle tre data-stegene fullført → komponenten returnerer `null`. Etablerte admins
(data finnes) ser den dermed aldri; ny admin ser den til løkka er fullført. Ingen dismiss-knapp,
ingen DB-persistering — tilstanden ER dataene.

## Edge Cases & Guardrails

- **Global telling, ikke per-admin `created_by`:** Tørny er én-klubb-instans; en admin nr. 2 som
  legges til senere er ikke en «ny installasjon» og skal IKKE se sjekklisten. ASSUMPTION dokumentert.
- **Delvis tilstand:** kombinasjoner (bane finnes, spill mangler) må rendre riktig — hvert steg
  avledes uavhengig, ingen sekvens-antakelse.
- **Query-feil:** `count ?? 0`-fallbackene i TilesGrid gjør at feilende counts leser som «ikke
  fullført» — sjekklisten kan da vises for en etablert admin ett øyeblikk. Akseptert (samme
  degradering som tile-metaene); ingen egen feilhåndtering.
- **TilesSkeleton uendret:** sjekklisten streamer inn sammen med tiles i samme Suspense.
- **Ikke-admin:** aldri rendret — PlayerKlubbhus-branchen ligger FØR TilesGrid (regresjonssjekk).
- **Skjermleser:** semantisk liste med fullført-status i tekst, ikke kun hake-ikon.

## Key Decisions

- **Avledet tilstand, null nye queries, null ny DB** — gjenbruker `Promise.all`-resultatene som
  allerede hentes. Billigste sanne signal; ingen `onboarding_progress`-tabell.
- **Auto-hide ved fullføring, ingen dismiss** — sjekklisten er nyttig nøyaktig så lenge den er
  ufullstendig; en dismiss ville krevd persistering (DB/localStorage) for null gevinst.

**Claude's Discretion:** eksakt visuell form (kort vs. liste-rader, hake-ikon), plassering
relativt til ActionItemsStripe (over/under — stripa rendrer uansett ingenting for ny admin),
eksakt ordlyd (post-humanizer), om «Konto opprettet»-raden får subtil champagne-accent,
CHANGELOG-tagline.

## Success Criteria (presise — kjøres trolig av nattkjøreren)

- [ ] Render-test (Type C, maks én) beviser alle fire tilstander styrt av props: (a) alt tomt →
      4 punkter, kun «Konto opprettet» avhuket, 3 lenker med href `/admin/courses/new`,
      `/admin/games/new`, `/admin/spillere`; (b) alle tre data-steg oppfylt → komponenten
      rendrer ingenting.
- [ ] `TilesGrid.tsx`-diffen legger IKKE til nye `supabase.from(`-kall (grep-verifiserbart mot
      dagens 9 + `getActionItemCounts`).
- [ ] Sjekklisten rendres kun i admin-branchen: ingen import/montering i `PlayerKlubbhus`.
- [ ] Nøkler i BÅDE `messages/no.json` og `messages/en.json` (`admin.dashboard`-namespacet);
      `npx vitest run messages/catalogParity.test.ts` grønn.
- [ ] Ny norsk copy kjørt gjennom humanizer-skillet før commit.
- [ ] Staging-klikkrunde på torny-staging FØR merge: admin-hjemmet rendrer uendret dashboard og
      sjekklisten er SKJULT (staging har baner/spill/brukere → alle steg oppfylt) — skjult-tilstanden
      er den staging kan bevise; synlig-tilstanden bevises av render-testen. Skjermbilde på PR-en.

## Gates

- [ ] `npx tsc --noEmit` grønn
- [ ] `npm run lint` grønn
- [ ] `npx vitest run "app/[locale]/admin" messages/catalogParity.test.ts` grønn
- [ ] `npm run build` grønn
- [ ] MINOR-bump + CHANGELOG Funksjon-rad (commit-msg-hooken håndhever)

## Files Likely Touched

- `app/[locale]/admin/GettingStartedChecklist.tsx` (+ én `.test.tsx`) — ny presentasjonskomponent
- `app/[locale]/admin/TilesGrid.tsx` — avlede tre booleans, montere komponenten
- `messages/no.json` + `messages/en.json` — sjekkliste-copy
- `CHANGELOG.md`, `package.json` — minor + Funksjon-rad

## Out of Scope

- Spiller-onboardingen (#1170 — egen kontrakt) og demo-identitet (#1173).
- Dismiss/persistering av sjekkliste-tilstand; per-admin `created_by`-attribusjon.
- Endringer i `docs/launch-checklist.md` (forblir admin-runbook; kun innholdet gjenbrukes).
- Utvidede steg (SMTP-oppsett, PWA-installasjon o.l.) — de fire fra issuet holder.
