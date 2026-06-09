# Forge-kontrakt: #526 — Personlig cup for alle (capped)

**Issue:** [#526](https://github.com/jdlarssen/golf-app/issues/526)
**Branch:** `claude/determined-grothendieck-bad933`
**Versjon:** MINOR-bump `1.107.1 → 1.108.0` (ny bruker-synlig kapabilitet)

## Mål (én setning)

En vanlig innlogget bruker skal kunne opprette, forvalte, starte og avslutte sin
egen personlige cup (Ryder Cup-stil blant venner), capped til 4 matcher / 24
distinkte deltakere — uten å treffe en admin-vegg noe sted. Global admin er
uberørt og uncapped.

## Viktig: avvik fra issue-teksten (post-#524-reconciling)

Issuet ble skrevet før/uavhengig av at **#524 (klubb-cup)** landet. To premisser i
issuet stemmer ikke lenger, og kontrakten korrigerer dem:

1. **«Ingen ny RLS-policy» er feil.** Migrasjon `0089` la til en WRITE-policy på
   `tournaments` der `group_id null`-cuper kun kan skrives av `is_admin()`. En
   ikke-admin-skaper ville fått `42501` på insert/update. Cup-handlingene bruker
   **request-scoped klient** (ikke admin-client, slik issuet antok). → Vi legger
   til en ny RLS-policy som lar skaperen skrive sin egen personlige cup
   (`group_id is null and created_by = auth.uid()`). Dette speiler hvordan
   leagues/games bruker RLS som den reelle sikkerhetsgrensen — app-gaten er kun
   UX-guard.

2. **Styringsgaten er allerede `requireAdminOrClubAdminOfCup`, ikke `requireAdmin`.**
   Vi bytter ikke blindt til `requireAdminOrTournamentCreator` overalt. I stedet
   utvider vi `group_id null`-grenen av den eksisterende sammensatte gaten til å
   slippe gjennom skaperen i tillegg til global admin. Begge akser (klubb-cup vs
   personlig cup) komponeres da i én gate.

3. **Spiller-pickeren i `generer` lekker i dag hele brukerbasen.** Frittstående-
   grenen i `GenerateMatches.tsx` henter ALLE profil-fullførte brukere. For en
   ikke-admin-skaper må kilden være **vennene** (`getFriendPlayerOptions`, #464-
   presedens). Admin beholder hele-brukerbasen-kilden (sekretariat).

## Beslutninger (fra issue + #525-presedens)

- **Hvem kan opprette:** enhver innlogget bruker (`created_by = userId`).
- **Hvem kan forvalte:** skaperen *eller* global admin (personlig cup); klubb-
  admin *eller* global admin (klubb-cup, uendret).
- **Tak (ikke-admin, personlig cup):** maks **4 matcher**, maks **24 distinkte
  deltakere**. Global admin uncapped på begge. (24 = samme offentlige tak som
  Kompis/#525.)
- **Klubb-cup (#524) uberørt.** Ingen `group_id`-endring her.

## Suksess-kriterier

- [x] **K1 — Opprettelse åpnet.** `createTournamentDraft` for `group_id null`
  bruker `getRoleContext` (enhver innlogget bruker), setter `created_by = userId`.
  Klubb-grenen uendret. *Bevis:* `lib/cup/actions.ts` — null-gren `await getRoleContext(supabase)`; insert med `created_by: userId`. K11 (live) dekker prod-flyten.
- [x] **K2 — Ny RLS-policy lar skaper skrive personlig cup.** Migrasjon `0090`
  applied (`list_migrations` → `tournaments_creator_write`). `pg_policies`-probe:
  `tournaments creator write own personal` (ALL) har qual + with_check
  `((group_id IS NULL) AND (created_by = auth.uid()))`, OR-et permissivt med
  admin/klubb-policyen og select-scoped. Speiler games-creator-RLS (0071).
- [x] **K3 — Styringsgate slipper gjennom skaper.** `requireAdminOrTournamentCreator`
  lagt til i `lib/admin/auth.ts` (admin → pass; ellers `created_by === userId`;
  ellers `redirect('/')`). `requireAdminOrClubAdminOfCup` sin `group_id null`-gren
  delegerer dit. *Bevis:* `lib/admin/auth.ts`.
- [x] **K4 — Generer-side-gate relaksert.** `app/admin/cup/[id]/generer/page.tsx`
  bruker nå `requireAdminOrClubAdminOfCup(supabase, id)`. *Bevis:* fil-diff.
- [x] **K5 — Cup-lista scopet.** `app/admin/cup/page.tsx` bruker `getRoleContext`;
  ikke-admin: `.eq('created_by', userId).is('group_id', null)`; admin ser alle.
  *Bevis:* fil-diff.
- [x] **K6 — Caps (ren logikk, TDD).** `lib/cup/limits.ts` med
  `MAX_PERSONAL_CUP_MATCHES = 4`, `MAX_PERSONAL_CUP_PLAYERS = 24` +
  `exceedsPersonalMatchCap`/`exceedsPersonalPlayerCap` (admin-bypass). *Bevis:*
  `limits.test.ts` 13/13 grønn.
- [x] **K7 — Caps håndhevet i generering.** `createCupMatchesFromPlan` har
  `else if (!isAdmin)`-gren for personlig cup: teller eksisterende + nye, returnerer
  `too_many_matches`/`too_many_players`. Admin/klubb hopper over. Tellingene bruker
  admin-client så en ikke-spillende skaper ikke undertelle pga. `game_players`-RLS
  (`is_in_game`). *Bevis:* fil-diff + predikat-tester (`limits.test.ts`).
- [x] **K8 — Cap synlig i UI.** Wizarden har `matchCap`-prop; steg 3 info-/varsel-
  banner + `canAdvance` blokkerer «Neste» over taket; `too_many_*`-koder mapper til
  norske banner-meldinger. *Bevis:* `GenerateMatchesWizard.tsx` (kode); cap-logikken
  er enhetstestet i `limits.test.ts`. Eksisterende `GenerateMatchesWizard.test.tsx`
  passerer (ny prop er valgfri) men asserterer ikke selve cap-UI-en — server +
  logikk er den reelle garantien.
- [x] **K9 — Pickeren bruker venner for ikke-admin.** `GenerateMatches.tsx`:
  `else if (isAdmin)` → alle; `else` → `getFriendPlayerOptions(userId)` + skaper
  selv (dedup, sortert). *Bevis:* fil-diff.
- [x] **K10 — Copy justert.** `CupSetup.tsx` `matchCap`-prop → default «2,5» + hint
  «Med 4 matcher blir det 2,5» for personlig; admin/klubb uendret (`CupSetup.test.tsx`
  passerer, dekker default-grenen). Kjørt gjennom `humanizer` (strenger rene; tagline
  strammet). *Bevis:* fil-diff + humanizer-pass.
- [ ] **K11 — Ingen admin-vegg i hele løkka.** Manuell prod-sjekk etter deploy
  (iPhone Safari): vanlig spiller oppretter cup → ≤4 matcher (5. blokkeres) →
  starter → avslutter. *Status:* PENDING — krever merge + deploy; eieren/live-
  verifikasjon. Koden er bygd og enhetstestet for hele kjeden.
- [x] **K12 — Versjon + CHANGELOG.** `package.json` → `1.108.1`; ny `1.108.y`-
  serie «Cup · alle kan arrangere» med 1.108.0 + 1.108.1, forrige serie wrappet i
  `<details>`. *Bevis:* CHANGELOG-diff.

## Implementasjons-rekkefølge (chunks)

1. **RLS-migrasjon** `0090_tournaments_creator_write.sql` (K2) — apply via Supabase
   MCP **før** kode-deploy (additiv; ufarlig i mellomtiden). Commit.
2. **Auth-helper** `requireAdminOrTournamentCreator` + `requireAdminOrClubAdminOfCup`
   null-gren delegerer (K3). Commit.
3. **Caps-modul** `lib/cup/limits.ts` + test (K6), TDD. Commit.
4. **Server-actions** `createTournamentDraft` (K1) + `createCupMatchesFromPlan`
   cap-håndheving (K7). Commit.
5. **Sider/gates** generer-page (K4), cup-lista (K5). Commit.
6. **UI** generer-wizard cap + feilkode-banner (K8), picker-kilde (K9). Commit.
7. **Copy** CupSetup (K10) + humanizer. Commit.
8. **Versjon + CHANGELOG** (K12) — i samme commit som første bruker-synlige
   feature-chunk (hooken krever det på `feat(...)`).

## Gates (kjør scopet til det som endres)

- `npm run build` (tsc/Next — exhaustive switches + Vercel-build-paritet).
- `npx vitest run <changed>.test` for co-lokerte tester på endrede filer.
- `npx vitest run` (full suite) før evaluering.
- `humanizer`-skill på ny/endret norsk copy.

## Ut av scope (følg issuet)

- Ingen `group_id`/klubb-scoping (#480/#524).
- Ingen ny cup-management-rute utenfor `/admin/cup/` — gjenbruk via gate-relaksjon.
  (Vennligere ikke-admin-rute = follow-up-polish; opprett issue hvis det føles
  nødvendig etter K11.)
- Rør ikke admin-cupens uncapped oppførsel.
- `tournaments.allowed_match_formats`-persistering (eget follow-up, jf. CupSetup
  docstring) — uendret.

## Risiko / merknader

- **Deploy-rekkefølge:** RLS `0090` er additiv (utvider kun skaper-tilgang), så
  apply-før-merge er trygt; ingen window der eksisterende admin-flyt brekker.
- **Dobbelt-generering:** generer legger til (sletter ikke) eksisterende matcher.
  Cap teller `existing + new`, så semantikken «≤4 matcher i cupen» holder selv ved
  re-generering.
- **Match-cap er bindende:** 4 matcher × ≤4 spillere = ≤16 < 24, så spiller-cap
  trigger sjelden, men inkluderes per spec for robusthet.
