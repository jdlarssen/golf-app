# Changelog

Alle bruker-synlige endringer i Tørny logges her. Versjonering følger [Semantic Versioning](https://semver.org/lang/no/).

Pre-1.0.0 (`0.x.y`) regnes som alpha — vi er fortsatt under uttesting med kompisgjengen. Disiplinen ble innført ved `0.2.0`; alt før det er samlet under «Pre-disiplin».

Hver oppføring begynner med en kort stakeholder-tagline på vanlig norsk satt som blockquote (`> …`) — hva endringen betyr for deg som bruker — etterfulgt av en sammenfoldbar **Teknisk**-seksjon med utvikler-prosa i [Keep a Changelog](https://keepachangelog.com/no/)-stil. Minor-serier (`0.X.y`) er gruppert under et tema-heading med kort sammendrag; kun den ferskeste serien står åpen, alle eldre er sammenfoldet som standard for å holde fila lett å scrolle.

Regler for når en bump utløses er beskrevet i [CLAUDE.md](CLAUDE.md) under «Versjonering / CHANGELOG».

---

## 1.23.y — Lanseringer-kanal: in-app drypp + månedsbrev

Tørny får sin egen kanal for å fortelle deg om nye funksjoner. Når noe er ute, dukker det opp et lite drypp på hjem-siden og en oppføring i innboksen. En gang i måneden får du en oppsummering på mail. Du kan melde deg av mailen fra profilen din eller via lenken nederst i mailen. Issue [#202](https://github.com/jdlarssen/golf-app/issues/202).

### [1.23.0] - 2026-05-25

> Når noe nytt kommer i Tørny, får du nå et lite varsel på hjem-siden og en oppføring i innboksen. Én gang i måneden får du også en oppsummering på mail. Du er påmeldt fra start; meld deg av månedsbrevet i profilen din om du heller vil ha fred.

<details>
<summary>Teknisk</summary>

#### Added
- Migrasjon `0035_product_updates.sql` — to nye tabeller (`product_updates` med admin-curated lanseringer, `product_update_digests` med audit + idempotens-row per måned) + `users.product_updates_unsubscribed_at` opt-out-kolonne + utvider `notifications.kind`-CHECK med `'product_update'`. RLS: alle innloggede leser `product_updates` (banner + innboks-flate), digests kun via service-role.
- `lib/notifications/types.ts` — ny `product_update`-kind med zod-schema (`source_id` uuid, `title`, `body`, valgfri `link` som må starte med `/`, valgfri `cta_label`). 5 nye tester for happy path, full payload, ekstern-link-avvisning, manglende title, tom title.
- `lib/productUpdates/unsubscribeToken.ts` — HMAC-SHA256 sign/verify-helpers for mail-unsub-tokens (1 års TTL, constant-time `timingSafeEqual`-sammenligning, `expMs` som ms-timestamp så `split('.')` ikke brytes av ISO `.000Z`). 9 tester for round-trip, tampered sig, tampered userId, exp, tom/garbage-tokens, manglende secret, determinisme.
- `lib/productUpdates/publish.ts` — `publishProductUpdate(input)` inserter rad og fan-outer in-app-notifikasjon til alle brukere via `Promise.allSettled`. Best-effort per mottaker.
- `lib/productUpdates/digest.ts` — `sendDigestForPeriod(opts)` + `previousMonthPeriod(nowMs)` pure helper. Beregner forrige kalendermåned i Europe/Oslo, idempotens-sjekk via `product_update_digests` UNIQUE, fan-out via `Promise.allSettled`, inserter audit-row. Returnerer discriminated union (`sent` / `already_sent` / `no_updates`). 5 tester for periode-grenser inkl. årsskifte og skuddår.
- `lib/mail/productUpdateDigest.ts` — Resend-mail-helper med subject `Nytt i Tørny — [måned]`, inline HTML + plain-text, RFC 8058 `List-Unsubscribe`-header + `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. 9 tester inkl. inline-snapshot av plain-text-body.
- `lib/format/date.ts` — `formatMonthLongNb('mai 2026')` for periode-etiketter.
- `app/admin/lanseringer/{page,actions,actions.test}.ts(x)` — admin-flate gated av `requireAdmin()`. Skjema for publisering (title/body/link/cta), månedsbrev-card med «Send månedsbrev nå»-knapp (disabled når allerede sendt for forrige periode), liste over siste 20 lanseringer. 10 action-tester for non-admin-redirect, validering (title/body/link/cta), happy-path, og alle tre digest-utfall.
- `app/api/cron/product-update-digest/route.ts` + `vercel.json` — daglig cron 08:00 UTC med intern 1.-i-måneden-gate (Vercel Hobby-friendly). Bearer-token auth via `CRON_SECRET`.
- `app/api/unsubscribe/product-update/route.ts` — GET (browser, render branded HTML) + POST (RFC 8058 one-click fra mail-klient). Begge verifiserer HMAC-token, oppdaterer `users.product_updates_unsubscribed_at`.
- `components/products/ProductUpdateBanner.tsx` (server) + `ProductUpdateBannerClient.tsx` (client) — banner på `/` med champagne-stripe, sparkle-emoji, title + body, valgfri CTA-knapp, og 44px-tap-target lukke-knapp. Optimistisk dismiss + `markOneAsRead`-call via `useTransition`. 5 tester.
- `app/profile/ProfileFormBody.{tsx,test.tsx}` — ny «Mail-innstillinger»-seksjon med checkbox for månedsbrev-opt-in. Dirty-tracking inkluderer toggle. 4 tester.

#### Changed
- `app/page.tsx` — mounter `<ProductUpdateBanner userId={...} />` like under `<InstallBanner>` i en `<Suspense fallback={null}>`-grense.
- `components/notifications/NotificationCard.tsx` — `EMOJI`-map utvidet med `product_update: '✨'`, `buildCardContent` mapper `payload.title → title`, `payload.body → detail`.
- `app/innboks/InboxClient.tsx` — `buildDeeplink` returnerer `payload.link ?? '/innboks'` for `product_update`-kind.
- `app/profile/{page,actions}.ts` — leser `product_updates_unsubscribed_at`, sender `productUpdatesOptIn` til `ProfileFormBody`. `updateProfile` skriver `null` (påmeldt) eller `now()` (avmeldt) basert på checkbox.

#### Notes
- Cron-pattern: «daglig 08:00 UTC + intern dato-gate» istedenfor `0 8 1 * *` siden Vercel Hobby kapper cron til 1/dag. Gir også atomær deploy-safety — en deploy 1. i måneden kan ikke endre cron-fyringen midt i kjøringen.
- Link-feltet i `product_updates` valideres til intern-only (`startsWith('/')`) som defense mot phishing-misbruk via mail-kanalen. Trade-off: kan ikke peke til Discord/eksterne ressurser. Akseptabelt for MVP.
- RFC 8058 ikke strengt påkrevd for Tørnys volum (< 5000 mail/dag mot Gmail/Yahoo), men implementert riktig fra start — gratis kvalitets-signal for inbox-placement.
- `.env.example` dokumenterer to nye secrets: `CRON_SECRET` (Vercel Bearer-token) og `PRODUCT_UPDATE_UNSUB_SECRET` (HMAC-nøkkel for unsub-tokens). Begge må settes i Vercel Dashboard før cron + unsub fungerer i prod.
- Test-suite vokst fra 1031 → 1062 (+31 nye tester).

</details>

---

<details>
<summary><strong>1.22.y — Hurtig-oppsett for nye spill (1 oppføring) — klikk for å vise</strong></summary>

## 1.22.y — Hurtig-oppsett for nye spill

Opprett-spill-flyten er omarbeidet til fire korte steg i stedet for én lang side med seks seksjoner. Format → bane → spillere → klar. «Tilpass alle detaljer» henter fram dagens fullform for power-users som vil styre alt. Issue [#203](https://github.com/jdlarssen/golf-app/issues/203).

### [1.22.0] - 2026-05-25

> Som admin setter du nå opp et spill i fire korte steg, ikke seks seksjoner på én lang side. Velg format, så bane og tidspunkt, så spillere — og til slutt sjekker du sammendraget før du publiserer. Trenger du flere detaljer (sideturnering, peer-godkjenning, HCP-allowance), finner du dem bak «Tilpass alle detaljer» på siste steg.

<details>
<summary>Teknisk</summary>

#### Added
- `app/admin/games/new/GameWizard.tsx` — 4-stegs orkestrator (Format → Bane → Spillere → Klar) med URL-state via `?step=` og `?view=`. Stepper-header («Steg N av 4 · tittel») med tynn progress-bar som respekterer `prefers-reduced-motion`. Per-steg-validering på Neste-knappen.
- `app/admin/games/new/useGameFormState.ts` — felles state-hook som GameForm og GameWizard begge konsumerer. All state, derived flags, memos, validitets-flags og handlers ligger her — én kilde til scoring-/validerings-reglene.
- `app/admin/games/new/sections/` — fem ekstraherte presentasjons-komponenter:
  - `BasicsSection.tsx` (spillnavn + bane + tee + tee-off + valgfri synlighet/sideturnering)
  - `PlayersSection.tsx` (søk + chips + filtrert liste + mode-aware counter)
  - `TeamsAssignmentSection.tsx` (matchplay-sider / lag-grid / flights / per-spiller-tee)
  - `AdvancedSettingsSection.tsx` (HCP-allowance, peer-godkjenning, valgfri visibility)
  - `ReadyStep.tsx` (wizard-only steg 4: summary-kort + advanced disclosure + publish/draft + escape-hatch)
- `lib/games/autoGameName.ts` — `suggestGameName({ courseName, scheduledTeeOffAt })` bygger forslag som «Stiklestad 25. mai» fra bane + tee-off. Wizard pre-fyller spillnavnet på steg 4 før admin redigerer (gated på `nameTouched`-flag).
- `lib/games/autoGameName.test.ts` (8 tester) + `app/admin/games/new/GameWizard.test.tsx` (9 tester) — dekker happy-paths for solo og best-ball, escape-hatch + tilbake bevarer state, auto-name + manuell override, og FormData-skjema speiler GameForm-payloaden.

#### Changed
- `app/admin/games/new/GameForm.tsx` (1819 → 347 linjer) — refaktorert til presentasjons-komponent som stacker de fire seksjonene + form-skeleton. Konsumerer `useGameFormState`. Brukes fortsatt 1:1 av edit-flyten (`/admin/games/[id]/edit`) og av wizard-en når admin klikker «Tilpass alle detaljer».
- `app/admin/games/new/page.tsx` og `app/opprett-spill/page.tsx` — rendrer nå `<GameWizard>` i stedet for `<GameForm>`. Samme props, samme server-actions, samme FormData-skjema. Edit-flyten (`/admin/games/[id]/edit/page.tsx`) er uberørt — bruker fortsatt `<GameForm>`.

#### Notes
- **Server-actions er uberørte.** `createGameDraft`, `createAndPublishGame`, og edit-equivalentene mottar identisk FormData (`game_mode`, `team_size`, `player_${i}_*`, `hcp_allowance_pct`, `side_*`, etc.) som før. Ingen databasemigrasjon, ingen API-endring.
- **Hopp til full-form og tilbake bevarer wizard-state.** «Tilpass alle detaljer» bytter `view = 'full'` og passer wizard-state som `initialValues` til GameForm. «← Tilbake til hurtig-oppsett» flipper tilbake til siste steg.
- **Uncontrolled-felter** (score_visibility-radios, side_ld_count/ctp_count, SideCategoriesPicker) håndteres som default-fallback ved skip av advanced disclosure — sentral disiplin matcher GameForm-oppførselen før refactor.
- Test-suite vokst fra 1022 → 1031 (+9 wizard-tester). Eksisterende GameForm-/actions-tester passerer uendret.

</details>

</details>

---

<details>
<summary><strong>1.21.y — Sideturnering — 14 nye bonus-kategorier (1 oppføring) — klikk for å vise</strong></summary>

## 1.21.y — Sideturnering — 14 nye bonus-kategorier

Sideturneringen vokser fra 27 til 41 kategorier. Nye bragder dekker albatross, hole-in-one, konge-på-par-4, rein 9-tur, ren runde uten double-bogey, comeback-priser, og to nye lag-bonuser. To humor-kategorier (verste enkelthull og flest double-bogeys) gir mild straff. Som standard er alle nye skrudd på i Full pakke-presetet. Issue [#169](https://github.com/jdlarssen/golf-app/issues/169).

### [1.21.0] - 2026-05-25

> Sideturneringen har fått 14 nye bragder du kan jakte på — albatross, hole-in-one, konge på par-4, rein 9-tur og ren runde for ferdighet, comeback kid og to-birdier-på-rad for de hete rundene, «alle birdied» og «lag-par-hull» for laget, pluss litt humor med verste enkelthull og flest double-bogeys. I admin-panelet slår du av enkeltkategorier per spill. Full pakke har alle på fra start.

<details>
<summary>Teknisk</summary>

#### Added
- 18 nye kategori-IDs i `lib/scoring/sideTournamentConfig.ts` (`SideCategoryId`-union + `ALL_CATEGORY_IDS` + `SIDE_TOURNAMENT_POINTS`-map). Fordelt på 4 tier:
  - **Skill (4p/2p eller 4p individ):** `most_albatrosses_team/_individual` (netto ≤ par−3), `most_hole_in_ones_team/_individual` (gross = 1), `king_par4_team/_individual` (lavest brutto på par-4 hull), `clean_front_9` + `clean_back_9` (alle 9 hull netto ≤ par), `no_double_plus_round` (alle 18 hull netto ≤ par+1).
  - **Moderate (2p individ):** `hardest_hole_winner` (best brutto på SI=1-hullet), `comeback_kid` (mest negativ delta fra F9-net til B9-net), `all_par_groups_birdie` (birdie på par-3, 4 og 5 hver), `even_par_round` (sum(netto) = sum(coursePars)), `back_to_back_birdies` (2-streak, stackable).
  - **Coord-bonus (lag-koord, stackable):** `team_all_birdied_bonus` (4p × N når alle medlemmer har minst én birdie), `team_no_bogey_hole_coord` (2p × N stackable per hull der hele laget har netto ≤ par).
  - **Humor (-1p individ):** `worst_single_hole_brutto` (høyest enkelthull-brutto), `most_double_bogeys_individual` (flest netto ≥ par+2).
- Migrasjon `0027_side_tournament_bonus_categories.sql` — utvider `games_side_disabled_categories_valid` constrainten med de 18 nye IDs (atomær drop+re-add).
- `SideTournamentInput.courseStrokeIndices: number[]` — nytt 18-element-felt for stroke-index per hull. Brukes kun av `hardest_hole_winner`. Bygges i `app/games/[id]/leaderboard/page.tsx` parallelt med `coursePars`.
- `SideCategoryAward.delta?: number` — nytt felt brukt av `comeback_kid` for å rendre «snudd X slag på back-9».
- 28 nye tester i `lib/scoring/sideTournament.test.ts` — dekker happy paths, ties, empty-guards, par-type-mangler og disqualifications for hver av de 14 kategoriene.
- 14 nye picker-entries i `components/admin/SideCategoriesPicker.tsx`. Ny gruppe «Minuspoeng» som samler snowman (-2p) + de to nye humor-kategoriene (-1p hver).
- 14 nye render-blokker i `app/games/[id]/leaderboard/SideTournamentView.tsx` med matchende `CATEGORY_GROUPS`/`PANEL_GROUPS`-oppføringer.

#### Changed
- `calculateSideTournament` i `lib/scoring/sideTournament.ts` — 14 nye if-blokker etter snowman (kategori #19). `SideCategory`-union utvidet. `countMatchesForPlayer`/`Team` brukt på netto for albatross; inline gross-loop for hole-in-one siden helperne er netto-bare per design.
- Snowman flyttet fra «Bragder»-gruppen til ny «Minuspoeng»-gruppe i picker og fra `achievement`-panel-seksjon til `penalty`-panel-seksjon i view, slik at alle negativ-poeng-kategorier står samlet.
- `lib/games/sideTournamentPayload.test.ts` — sanity-assertion oppdatert fra 27 til 45 ID-er (27 eksisterende + 18 nye).

#### Notes
- Eagles+ (netto ≤ par−2) forblir inklusiv — en albatross teller både under `most_eagles_*` og som egen `most_albatrosses_*`-kategori. Bevisst valg: back-compat med ferdigspilte spill, ingen data-migrasjon. Flagget i picker-hjelpetekst.
- Eksisterende ferdigspilte spill med `side_disabled_categories = '{}'` (Full pakke) får automatisk de 18 nye kategoriene aktivert ved neste leaderboard-fetch. Spillere kan se «nye utmerkelser» dukke opp på historiske runder hvor noen har gjort en albatross eller hole-in-one — feel-good, ikke regression.
- Test-suite vokst fra 958 → 986 (+28 nye tester).

</details>

</details>

---

<details>
<summary><strong>1.20.y — Handicap-chip på hjem-siden (1 oppføring) — klikk for å vise</strong></summary>

## 1.20.y — Handicap-chip på hjem-siden

Handicapen din vises nå alltid øverst på hjem-siden så du ser hvor du står. Får en aksent-farge når den ikke har vært bekreftet på fire uker, så du oppdager passivt at den er gammel. Issue [#209](https://github.com/jdlarssen/golf-app/issues/209) — komplementerer [#168](https://github.com/jdlarssen/golf-app/issues/168) sitt prompt-kort i venterommet.

### [1.20.0] - 2026-05-25

> Handicapen din vises nå øverst på hjem-siden, alltid synlig. Trykk for å oppdatere. Hvis den ikke har vært bekreftet på fire uker, får den en aksent-farge — så du oppdager selv at den er gammel uten at appen må mase.

<details>
<summary>Teknisk</summary>

#### Added
- `components/handicap/HandicapChip.tsx` + 7 tester — server-component pill med «HCP»-label + tall (norsk komma via `toLocaleString('nb-NO', ...)`). Klikkbar `SmartLink` til `/profile?next={encodedNextPath}` med ≥44px tap-target. Stale-tilstand (≥ 4 uker per gjenbrukt `isHandicapStale`) bytter til `border-accent + text-accent`-styling; fresh er nøytral. Tester dekker label/tall-rendering, desimal-formatering inkl. default `54.0`, href-encoding, begge styling-tilstander, og aria-label.

#### Changed
- `app/page.tsx` — profile-query utvidet med `hcp_index, handicap_updated_at` (ingen ny round-trip). Chip rendres i `PageHeader.action`-slot i non-empty state, og midtstilt mellom welcome-paragrafen og CTA-knappen i empty state. Defensiv: rendres bare når begge feltene er satt.

#### Notes
- «HCP» som label er bevisst engelsk forkortelse — etablert kortform i norsk golf-miljø, ikke flagget som anglisisme.
- Tap-flyten gjenbruker `safeNextPath`-mekanikken fra [#168](https://github.com/jdlarssen/golf-app/issues/168) — ingen nye redirect-kodebaner.
- Chip vises kun på `/`. På `/games/[id]` står #168 sitt prompt-kort allerede klart.
- Test-suite vokst fra 979 → 986 (+7 nye chip-tester).

</details>

</details>

---

<details>
<summary><strong>1.19.y — Handicap-sjekk før runden (1 oppføring) — klikk for å vise</strong></summary>

## 1.19.y — Handicap-sjekk før runden

Spilleren får et inline-kort i venterommet før hvert spill hvis handicapen ikke har vært bekreftet på fire uker. Forhindrer at runden beregnes mot en utdatert verdi fordi noen glemte å oppdatere etter sist. Issue [#168](https://github.com/jdlarssen/golf-app/issues/168).

### [1.19.0] - 2026-05-25

> Hvis handicapen din er eldre enn fire uker, spør appen nå før spillet starter om den fortsatt er riktig. Da slipper du å oppdage etter runden at slag-allokeringen ble feil.

<details>
<summary>Teknisk</summary>

#### Added
- `supabase/migrations/0034_users_handicap_updated_at.sql` — ny `users.handicap_updated_at timestamptz not null default now()`-kolonne. Backfill til `now()` for eksisterende brukere — alle starter «ferske» og får fire-uker grace før første prompt.
- `lib/handicap/staleness.ts` + 10 tester — `HANDICAP_STALENESS_WEEKS = 4` konstant + `isHandicapStale(updatedAt, now?)`-helper. Aksepterer både `Date` og ISO-streng. Boundary er stale ved nøyaktig fire uker; null/undefined er stale.
- `components/handicap/HandicapConfirmCard.tsx` — inline `Card` med tittel «Sjekk handicapen din», brødtekst med relativ tid (`formatRelativeNb`), og to knapper: «Ja, stemmer» (server-action) og «Oppdater» (lenker til `/profile?next=/games/[id]`).
- `app/games/[id]/actions.ts` med `confirmHandicap(gameId)`-server-action. Bumper `users.handicap_updated_at = now()` for innlogget bruker og `revalidatePath('/games/[id]')` så kortet forsvinner på neste render.
- `app/profile/safeNext.ts` + 11 tester — `safeNextPath()` validerer at `?next=`-target er en relativ same-origin-sti (avviser protocol-relative URL-er, absolutte URL-er, fragment-only og non-string). Open-redirect-vern.

#### Changed
- `app/profile/actions.ts` — `updateProfile` leser `next` fra FormData, validerer via `safeNextPath`, og redirecter dit ved suksess. Fallback til `/profile?profile=updated` når `next` mangler. Error-redirects preserver `next` så form-en overlever validation-feil.
- `app/profile/ProfileFormBody.tsx` — ny `next?`-prop renderer skjult input når den er gyldig. «Avbryt»-lenken respekterer `next` istedenfor hardkodet `/`.
- `app/profile/page.tsx` — leser `searchParams.next`, sender gjennom `safeNextPath` før form-en får den.
- `app/profile/actions.ts`, `app/complete-profile/actions.ts`, `app/admin/spillere/[id]/actions.ts` — alle tre UPDATE-ene stamper `handicap_updated_at = now()`. Unconditional: hvem som enn lagrer form-en endorser hcp-verdien. Admin-edit teller også — slipper å mase spilleren rett etter at Jørgen fikset det.
- `app/games/[id]/page.tsx` — scheduled-grenen henter `users.hcp_index + handicap_updated_at` for innlogget spiller via slim direct-call (ikke cachet — cross-game fan-out ved profil-edit ville krevd dyr invalidering). Rendrer `<HandicapConfirmCard />` mellom header og Hero hvis stale.

#### Notes
- Kortet vises kun for `status === 'scheduled'`. Active/finished-spill er forbi freeze-vinduet — ingen «for sent»-melding (det ville bare blitt mas).
- Kortet er ikke-blokkerende — spilleren kan ignorere det og bare scrolle videre.
- «Ja, stemmer» gir ingen toast-bekreftelse. Kortet forsvinner, det er bekreftelse nok.
- Test-suite vokst fra 947 → 979 (+32 nye tester: 10 staleness + 11 safeNext + utvidelser).

</details>

</details>

---

<details>
<summary><strong>1.18.y — Lag-scorekort (1 oppføring) — klikk for å vise</strong></summary>

## 1.18.y — Lag-scorekort

Scorekort-flaten viser nå begge spillerne side om side i alle lag-baserte spillformer (best-ball, par-stableford, matchplay og Texas scramble). Tidligere fikk du bare ditt eget scorekort — selv i 2-mannslag der partner og du deler resultat. Issue [#17](https://github.com/jdlarssen/golf-app/issues/17).

### [1.18.0] - 2026-05-25

> Når du spiller best-ball, par-stableford, matchplay eller Texas scramble, viser scorekortet nå deg og partner (eller motstander i matchplay) ved siden av hverandre per hull — som på papir. Lenken på spilloversikten heter «Lagets scorekort» eller «Match-scorekort» istedenfor «Mitt scorekort» når det er aktuelt. Texas-spillere som ikke er lag-kaptein får endelig se lagets faktiske score (før viste flaten blanke felt).

<details>
<summary>Teknisk</summary>

#### Added
- `lib/games/scorecardTitle.ts` + test (7 caser) — single source of truth for tittel + CTA-label per modus. Matchplay → «Match-scorekort», lag-baserte (best-ball, par-stableford team_size=2, texas) → «Lagets scorekort», solo → «Mitt scorekort».
- `lib/games/teamCaptain.ts` + test (5 caser) — `pickTeamCaptain(userIds)` ekstrahert fra `lib/scoring/modes/texasScramble.ts` til delt helper. Texas-scoring (kaptein eier scores-radene i DB) og scorekort-flaten (non-captain må slå opp captain for å hente lagets score) bruker samme lex-min-algoritme. Texas-modulen beholder en wrapper rundt helperen.
- `lib/games/scorecardLayout.ts` + test (11 caser) — `resolveScorecardLayout(game, players, me, revealActive, fmt)` returnerer enten Layout A (single-player tabell) eller Layout B (side-om-side). Texas → Layout A med captain-userId + lag-handicap (sum(member.CH) × team_handicap_pct / 100). Reveal-active → Layout A uansett modus (beholder reveal-prinsippet). Best-ball/par-stableford → Layout B med same-team-partner. Matchplay → Layout B med motstander (annet team_number). Defensiv fallback til Layout A hvis team-modus mangler partner.
- Tester for Texas non-captain-flow (issue #17 bonus-fix) — verifiserer at `scoreUserIds` returnerer captain-userId, ikke me-userId.

#### Changed
- `app/games/[id]/scorecard/page.tsx` — full rewrite. Server-komponenten bruker `resolveScorecardLayout` til å bestemme Layout A vs B, og rendrer riktig tabell. Layout B-tabellen har kolonner `# | Par | Spiller1 | Spiller2` der hver spiller-celle viser slag (stor) + sekundærtall (netto eller stableford-poeng) under. SI-kolonne droppet i Layout B for plass på iPhone-bredde. Footer i Layout B viser per-spiller-totaler + lag-total (eller match-status for matchplay: «Du er 2 up etter 8 hull»).
- `app/games/[id]/scorecard/page.tsx` (data-fetch) — bruker admin-client for scores-query siden RLS kan blokkere partners scorer under uvanlig flight-konfigurasjon. Authz beholdes call-site via `me ∈ players` og at `scoreUserIds` kun inneholder lag-medlemmer / motstander basert på `game_players`-radene.
- `app/games/[id]/page.tsx` — CTA-label på «Mitt scorekort»-Card-en på spilloversikten bruker `scorecardTitle().cardLabel` slik at den speiler tittelen på scorekort-flaten. `GameRow`-typen utvidet med `mode_config` (re-bruker shape fra `GameForHole`).

#### Fixed
- Texas scramble non-captain ser nå lagets faktiske score på `/scorecard`. Før viste flaten blanke felt fordi `scores`-radene eies av lag-kapteinen (lex-min userId), og scorekort-flaten queryet på `me.user_id`. Nå queryes captain-userId via `pickTeamCaptain(teamMembers)`.

#### Notes
- Reveal-modus («skjul netto til spillet er ferdig»): Layout B faller tilbake til Layout A under aktivt spill med visibility=reveal. Beholder reveal-prinsippet om å skjule andres data inntil game.status=finished.
- Solo-modi (stableford team_size=1, solo strokeplay) er uendret — fortsatt single-player Layout A med «Mitt scorekort»-tittel.
- Test-suite vokst fra 924 → 947 (+23 nye tester: 7 scorecardTitle + 5 teamCaptain + 11 scorecardLayout).

</details>

</details>

---

<details>
<summary><strong>1.17.y — Allowlist for trusted creators (1 oppføring) — klikk for å vise</strong></summary>

## 1.17.y — Allowlist for trusted creators

Mulighet for å la utvalgte spillere opprette egne turneringer uten å gjøre dem til admin. Liten variant av [#22](https://github.com/jdlarssen/golf-app/issues/22) — vi tester først om noen faktisk vil bruke det, før vi bygger full rolle-modell. Issue [#198](https://github.com/jdlarssen/golf-app/issues/198).

### [1.17.0] - 2026-05-25

> Som admin kan du gi utvalgte spillere lov til å opprette egne turneringer. Det legger til en «Opprett spill»-inngang på forsiden hos dem som er på lista.

<details>
<summary>Teknisk</summary>

#### Added
- `lib/admin/trustedCreators.ts` — kode-basert allowlist (`TRUSTED_CREATOR_EMAILS`) + `isTrustedCreator(email)`-helper. Case-insensitiv, null-trygg, trimmer whitespace. Seeded med `fornes.even@yahoo.no`. Toggle nye brukere ved å pushe ny commit til lista — bevisst valg for small-bet-MVP-en (ingen DB, ingen ny rolle, ingen RLS-touch).
- `lib/admin/auth.ts` — `requireAdmin()` og `requireAdminOrTrustedCreator()` deler én `loadRole`-helper som slår opp `users.is_admin + email` i én query. Begge redirecter til `/login` ved manglende session og til `/` ved manglende tilgang. `loadRole` returnerer `{ userId, email, isAdmin, isTrusted }` — call-sites bruker `isAdmin` for å route success-redirects og audit-id-er.
- `app/opprett-spill/page.tsx` — ny rute utenfor `/admin/*` som gjenbruker `GameForm` fra admin-flyten, men kjører i `AppShell` (ikke `AdminShell`) slik at trusted ikke-admin ikke ser Sekretariat-shellen. Gated av `requireAdminOrTrustedCreator`.
- `lib/games/newGameFormData.ts` — `getNewGameFormData()`-cache-helper (courses + roster). Ekstrahert fra `app/admin/games/new/page.tsx` slik at `/opprett-spill` deler samme fetch + React-cache. Ingen oppførselsendring i admin-flyten.
- Tre nye actions-tester i `app/admin/games/new/actions.test.ts` — trusted-non-admin tillates og setter `games.created_by` til deres userId; ikke-trusted ikke-admin redirecter til `/`; admin-flyten uendret.

#### Changed
- `app/admin/games/new/actions.ts` — inline `is_admin`-sjekk byttet ut med `requireAdminOrTrustedCreator()`. `created_by` settes nå fra helper-returverdi (`userId`) i stedet for inline `user.id`. Admin-happy-path er uendret semantisk; trusted-allowlisten åpner samme code-path uten DB-endringer.
- `app/page.tsx` — selecter nå `email`-feltet i tillegg til `name, is_admin, profile_completed_at`. Tomt-tilstand-CTA og non-empty-tilstand-seksjon vises for `is_admin || isTrustedCreator(email)`. Admins lenkes fortsatt til `/admin/games/new` (uendret Sekretariat-flyt); trusted-non-admin lenkes til `/opprett-spill`.

#### Notes
- Ingen DB-migrasjoner, ingen nye tabeller, ingen RLS-policy-endringer. INSERT mot `games` skjer fortsatt via request-scoped client — RLS lar `authenticated`-brukere insertere så lenge `created_by = auth.uid()`, så admin-bypass var ikke nødvendig.
- Aksepterte rough edges: success-redirect peker fortsatt på `/admin/games/[id]?status=…` (admin-layouten bouncer trusted-bruker derfra til `/`, der spillet vises i «Mine spill»-lista). Valideringsfeil under create bouncer trusted via `/admin/games/new?error=…` → `/`. Polish kun hvis adopsjon > 30 % i 30-dagers observasjons-vinduet.
- Observasjons-SQL etter 30 dager: `select created_by, count(*), min(created_at), max(created_at) from games where created_by in (select id from users where email = any('{fornes.even@yahoo.no, …}'::text[])) group by created_by;`
- Test-suite: 13 nye tester (10 `isTrustedCreator`-unit + 3 trusted-creator actions-tester), 924 totalt grønne.

</details>

</details>

---

<details>
<summary><strong>1.16.y — Texas scramble (5 oppføringer) — klikk for å vise</strong></summary>

## 1.16.y — Texas scramble

Ny spillmodus for laget som vil spille sosialt — én ball per lag, alle slår fra beste slag. Skalerer fra 2-mannslag (par-format) til 4-mannslag (klassisk firma-cup). Lag-handicap regnes etter NGF-aggregatet (25 % av summert HCP for 2-mannslag, 10 % for 4-mannslag), justerbart per spill. Issue [#44](https://github.com/jdlarssen/golf-app/issues/44).

### [1.16.4] - 2026-05-25

> Admin-flaten for Texas scramble-spill viser kun lag som faktisk har spillere, og dropper Flights-seksjonen siden flight automatisk speiler lag-tilordningen. Reduserer visuelt støy på Texas-detalj-sider.

<details>
<summary>Teknisk</summary>

#### Changed
- `app/admin/games/[id]/page.tsx` — ny `isTexas`-narrowing (`game.game_mode === 'texas_scramble'`). Påvirker to seksjoner: (a) Lag-grid-en (linje 580-585) filtrerer nå Texas-spill etter samme regel som par-stableford — kun lag med spillere vises, ingen tomme «(tom)»-placeholders; (b) Flights-seksjonen (linje 615) skipper for Texas siden flight = team mekanisk (validatoren håndhever `flight_number = team_number`). Speilet par-stableford-pattern: vi vil ikke duplisere Lag-seksjonen som Flights.

#### Notes
- Player-facing game-home (`app/games/[id]/page.tsx`) trenger ingen Texas-spesifikk endring: «Din info»-cardet viser «Lag X / Flight Y»-paret som leser fint for Texas, og FlightRoster fungerer fordi Texas-spillere har `flight_number` satt (= team_number) i motsetning til solo-modi.
- Mode-label «Texas scramble» fra `MODE_LABELS` brukes automatisk i admin-detail-pagens Format-card.

</details>

### [1.16.3] - 2026-05-25

> Når Texas scramble-spillet avsluttes får hver spiller mail med lagets plassering og lagets netto-total. Mailen navngir lagkameratene dine («Du spilte med Bjørn, Carla og Dagfinn») slik at du ser hvem du gikk runden med uten å åpne leaderboardet.

<details>
<summary>Teknisk</summary>

#### Added
- `lib/mail/gameFinishedNotification.ts` — `GameFinishedNotificationMode` har ny `kind: 'texas_scramble'`-gren med `teamRank`, `teamTotalNet`, `teamTotalGross`, `teamPartnerNames: string[]` og `totalTeams`. Body-builder rendrer «Laget endte på X. plass av N lag med Y slag netto (Z brutto). Du spilte med Bjørn og Carla. Solid plassering!» — celebration-cascade speilet par-stableford (1. → Gratulerer, 2./3. → Solid, 4+ → nøytral). Ny `formatPartnerList`-helper bygger norsk komma-separert oppstilling med «og» før siste navn («Bjørn, Carla og Dagfinn»). 5 nye snapshot-tester dekker 2-mannslag, 4-mannslag, 4.-plass uten celebration, tom partner-liste (defensiv), og null playerFirstName.
- `lib/mail/gameFinishedRecipients.ts` — ny `buildTexasScrambleRecipients` bygger per-spiller mottakerliste. Hver spiller på et lag får samme `teamRank`, `teamTotalNet`, `teamTotalGross`, men sin egen `teamPartnerNames` (alle lag-medlemmer minus seg selv). Filtrer ut tomme/null-navn defensivt. 3 nye tester: 2-mannslag, 4-mannslag, og defensiv håndtering av spiller uten email.

#### Notes
- Texas scramble v1 er nå produksjons-klart. Hele 1.16.y-serien dekker: admin-UI (1.16.0), hull-page med ett kort per lag (1.16.1), leaderboard + podium (1.16.2), og mail (1.16.3).
- Drive-distribusjons-regelen ikke håndhevet (honor-system per spec).
- 3-mannslag ikke i v1 (15 % NGF-default kommer som egen issue hvis brukerne ber om det).
- Test-suite vokst fra 903 → 911 (8 nye mail-tester: 5 i sendGameFinishedNotification, 3 i buildGameFinishedRecipients).

</details>

### [1.16.2] - 2026-05-25

> Når Texas-spillet er i gang ser alle lagene sin sanntids-plassering rangert på laveste lag-netto. Når spillet avsluttes feires vinner-laget på podiet med konfetti, og resten av rangeringen ligger sammenfoldet under.

<details>
<summary>Teknisk</summary>

#### Added
- `app/games/[id]/leaderboard/TexasScrambleView.tsx` — ny live/active leaderboard-view for Texas. Speilet SoloStrokeplayView visuelt: fairway-backdrop, Fraunces-for-tall typografi, champagne-tint på vinneren. Forskjellene fra SoloStrokeplay-mønsteret: én rad per lag (ikke per spiller), lag-navn «Lag N» med medlemsnavn på sekundærlinjen, sub-tittel «Texas scramble · Sortert på laveste lag-netto», missing-hull-chip vises hvis laget ikke har spilt alle 18 hull.
- `app/games/[id]/leaderboard/TexasScramblePodium.tsx` — ny finished-state podium for Texas. Topp 3 lag på podiet (1.-plass i midten, 2. venstre, 3. høyre), konfetti-burst på 1.-plass én gang per browser-sesjon (distinkt sessionStorage-key `torny-texas-scramble-podium-confetti-seen-${gameId}`), `prefers-reduced-motion` håndtert via globals.css-default på .reveal-up og .confetti-piece-klassene. Resten av rangeringen i collapsed `<details>` under podiet.
- `app/games/[id]/leaderboard/page.tsx` — ny `renderTexasScramble`-helper og branch i mode-routeren. Bygger ScoringContext fra DB-radene, kjører `computeModeResult`, narrower på `kind === 'texas_scramble'`, og velger view per `game.status` (finished → TexasScramblePodium, ellers TexasScrambleView).

#### Notes
- State #3/#3.5-«venterom» bevisst skipped — alle lag-medlemmer ser hverandre umiddelbart (samme RLS-policy som stableford/matchplay/solo-strokeplay).
- `missingHoles`-chip vises kun når laget faktisk mangler hull. Sammenligninger mellom lag med ulike missing-counts er matematisk meningsløse; chip-en signaliserer dette til admin.

</details>

### [1.16.1] - 2026-05-25

> Hullsiden for Texas scramble viser nå ett scorekort per lag i stedet for ett per spiller. Alle på laget ser samme stepper, og hvem som helst kan taste — tappet havner på lagets felles rad. Avataren på kortet viser lag-nummeret, og under står medlemmenes fornavn. «Lever lagets scorekort»-knappen erstatter «Lever scorekort» for Texas-spill.

<details>
<summary>Teknisk</summary>

#### Added
- `app/games/[id]/holes/[holeNumber]/page.tsx` — ny `isTexas`-narrowing. For Texas-spill collapses flight-medlemmer til ÉN `ClientPlayer` per lag i stedet for én per spiller. Kapteinen (`lex-min userId` blant lag-medlemmer) eier scores-radene; `playersForClient`-entry-en setter `userId = captainUserId`, `name = "Lag N · Navn1, Navn2"`, `initial = String(team_number)` (avatar-tall), `extraStrokes = strokesForHole(teamHandicap, hole.stroke_index)` der `teamHandicap = round(combined-CH × team_handicap_pct / 100)`. Submit-state propagerer som «innlevert hvis NOEN på laget har submitted_at» — alle medlemmer ser samme låst-tilstand når én leverer.
- `app/games/[id]/holes/[holeNumber]/HoleClient.tsx` — ny `isTexas`-narrowing. `me`-lookup faller tilbake til `players[0]` for Texas (siden non-captain-medlemmer ikke matcher captain-userId-en på sitt eget myUserId). Submit-knapp-tekst: «Lever lagets scorekort» for Texas (mellom «Lever ditt scorekort» for stableford solo og «Lever scorekort» for best-ball).

#### Notes
- Scores skrives med `entered_by = myUserId` (uendret), `user_id = captainUserId` for Texas — audit-trail bevares per tap, men `scores`-radens identitet er lag-kapteinen.
- Real-time-subscription er per-game (ikke per-user), så alle lag-medlemmer ser samme oppdatering når kapteinens rad endres. Ingen ekstra subscription-arbeid nødvendig.
- RLS: insert-policy `scores insert by flight` tillater write til `user_id = captainUserId` fra non-captain-medlem siden de er i samme flight (flight_number = team_number for Texas). Verifisert mot 0002_rls_policies.sql.
- Submit-flow i seg selv er ikke endret — hver spiller har fortsatt sin egen `submitted_at`. En strammere «kun én submit per lag»-policy er en separat design-oppgave, ikke nødvendig for v1.

</details>

### [1.16.0] - 2026-05-25

> Du kan nå opprette Texas scramble-spill — velg Texas scramble som modus, velg 2- eller 4-mannslag, og fordel spillerne. Lag-handicap settes automatisk etter NGF-tabellen (25 % for 2-mannslag, 10 % for 4-mannslag) og kan justeres som i best ball. Hullsiden og leaderboardet for Texas kommer i neste lansering.

<details>
<summary>Teknisk</summary>

#### Added
- `supabase/migrations/0033_texas_scramble.sql` — widener `games_mode_check` til 5 verdier: `'best_ball_netto'`, `'stableford'`, `'singles_matchplay'`, `'solo_strokeplay_netto'`, `'texas_scramble'`. Fikser latent bug for matchplay og solo strokeplay som var shipped i TS-koden men aldri persisterbart i prod (0 rader for begge — ingen hadde prøvd ennå). Atomic widen som sletter den gamle CHECK-en og legger til en ny med samme navn.
- `lib/scoring/modes/texasScramble.ts` — ny scoring-motor som grupperer spillere på `team_number`, velger lag-kaptein (lex-min `userId`) som scores-rad-eier, regner `teamHandicap = round(sum-CH × team_handicap_pct / 100)` etter NGF-konvensjon, allokerer per hull via eksisterende `strokesForHole`, og rangerer lag på lavest `totalNet` med 5-tier tie-break-cascade. 22 unit-tester dekker shape, kaptein-utvelging, lag-HCP-utregning, per-hull netto, totaler/missing, ranking, tie-break, og edge cases (tomt lag, 9-hulls bane, alle null).
- `lib/scoring/modes/types.ts` — `GameMode` utvidet med `'texas_scramble'`. `MODE_LABELS[texas_scramble] = 'Texas scramble'`. Ny `GameModeConfig`-variant `{ kind: 'texas_scramble', team_size: 2 | 4, teams_count: number, team_handicap_pct: number }`. Nye result-typer `TexasScramblePlayerCell`, `TexasScrambleHoleRow`, `TexasScrambleTeamLine`, `TexasScrambleResult`. `ModeResult`-unionen utvidet.
- `lib/scoring/index.ts` — mode-router-switch ruter `'texas_scramble'` til ny engine.
- `lib/games/gamePayload.ts` — ny `validateTexasScramble` validerer at hvert lag har eksakt `team_size` spillere (2 eller 4 — 3-mannslag utsatt til v1.1 → `unsupported_mode_size_combo`), at `team_handicap_pct` er 0..100 (utenfor → `bad_allowance`), og at `flight_number = team_number` per spiller (DB-CHECK `game_players_team_flight_consistency`). 16 nye validator-tester.
- `app/admin/games/new/ModeSelector.tsx` — ny `TexasScrambleIcon` (senterstilt flagg med tre golfballer på rad under, signaliserer ett lag rundt én ball) og en femte tile «Texas scramble». Grid-layout justert fra `grid-cols-2 sm:grid-cols-4` til `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5` slik at 5 tiles wrapper pent på alle breakpoints.
- `app/admin/games/new/TeamSizeSelector.tsx` — `ENABLED_COMBOS[texas_scramble] = new Set([2, 4])`. 4-mannslag aktiveres her som første modus som bruker `team_size: 4`.
- `app/admin/games/new/GameForm.tsx` — ny `isTexas`-narrowing, `defaultTexasHandicapPct`-helper (25 for 2-mannslag, 10 for 4-mannslag), `handleTeamSizeChange`-wrapper som re-defaulter handicap-prosenten ved lagstørrelse-endring under Texas-modus. Lag-grid utvidet med variabel slot-count per lag (2 eller 4). Lag-handicap-felt erstatter HCP-allowance-feltet i Settings-seksjonen for Texas (allowance-kolonnen settes til 100 som no-op via hidden input siden DB-kolonnen er NOT NULL). 8-spiller-limit fra payload-laget begrenser Texas til 4 lag á 2 eller 2 lag á 4 spillere; lag 3 og 4 skjules visuelt når team_size=4.
- `app/admin/games/[id]/edit/page.tsx` — SELECT utvidet med `mode_config` slik at edit-flyten kan pre-fylle `team_size` og `texas_team_handicap_pct` fra persistert state.
- `app/games/[id]/page.tsx` — lokal `game_mode`-union utvidet med `'texas_scramble'`.

#### Notes
- Tre tilstøtende komponenter mangler fortsatt Texas-grenen og kommer i etterfølgende lanseringer i 1.16.y-serien: (a) hull-page rendrer per-spiller-rader uavhengig av modus i dag, Texas trenger ett kort per lag (alle medlemmer ser samme stepper); (b) leaderboard-route har ingen `renderTexasScramble`-branch enda — Texas-spill faller derfor gjennom til best-ball-grenen som kaster på shape-mismatch; (c) `gameFinishedNotification`-mail mangler Texas-grenen så avsluttede Texas-spill får default best-ball-mail. Inntil hele 1.16-serien er ute, ikke publiser Texas-spill i prod.
- Drive-distribusjons-regelen (autentisk Texas: hver spiller må bidra med minst N drives per runde) håndheves ikke i v1 — honor-system. Egen issue hvis brukerne ber om tracking.
- 3-mannslag bevisst utsatt (15 % NGF-default). Egen issue hvis brukerne ber om det.
- WHS-tiered handicap-formel (35/15 for 2-mannslag, 25/20/15/10 for 4-mannslag) som alternativ til NGF-aggregatet kommer eventuelt som `mode_config.handicap_formula: 'whs_tiered' | 'ngf_aggregate'` i v2 hvis brukerne ber om det.

</details>

</details>

---

<details>
<summary><strong>1.15.y — In-app innboks (5 oppføringer) — klikk for å vise</strong></summary>

## 1.15.y — In-app innboks

Tørny får en innboks. Bjelle øverst-til-høyre på alle sider viser en champagne-prikk når det venter et nytt varsel, og en dedikert /innboks-flate samler hele historikken. Varslene wires inn etappevis (issue [#25](https://github.com/jdlarssen/golf-app/issues/25)): invitasjoner, peer-godkjenninger, scorekort-events og spill-avsluttet. Siste fase kuttet mail-spammen til aktive brukere — du får ikke lenger mail om noe som allerede er på skjermen din.

### [1.15.4] - 2026-05-24

> Mail-spam-reduksjonen som kom i 1.15.2 fungerer nå strammere. Tidligere kunne en aktiv bruker likevel få mail hvis siste «jeg er her»-pingen var mellom 5 og 30 minutter gammel; nå matcher pinge-frekvensen og mail-vinduet samme 5-minutters-terskel.

<details>
<summary>Teknisk</summary>

#### Fixed
- `proxy.ts` last_seen_at-WHERE-debouncen senket fra 30 min til 5 min for å matche `OFF_APP_THRESHOLD_MS` i [\`lib/notifications/notify.ts\`](https://github.com/jdlarssen/golf-app/blob/main/lib/notifications/notify.ts). Tidligere mismatch (notify.ts gated på 5 min, proxy debouncet 30 min) kunne gi mail til en aktiv bruker hvis siste pinge var 5–30 min gammel — en konservativ default fra Phase 4 av [#25](https://github.com/jdlarssen/golf-app/issues/25), men ikke maksimal spam-reduksjon. Konstanten ekstrahert til ny `lib/notifications/thresholds.ts` (uten `server-only`) slik at både notify.ts og proxy.ts importerer fra samme sted; cross-reference-kommentaren forhindrer ny mismatch.
- DB-cost: ~12 UPDATEs per bruker per time mot 2 før, men trivielt selv ved klubb-skala (100+ aktive brukere = ~1200 writes/time ≈ 0,3/s).

</details>

### [1.15.3] - 2026-05-24

> Et raskt dobbelt-trykk på «Lever scorekort» sender ikke lenger flere varsler eller mail. Ble du sittende uten å vite om første trykk gikk gjennom, og trykte igjen, får admin én melding — ikke to.

<details>
<summary>Teknisk</summary>

#### Fixed
- `app/games/[id]/submit/actions.ts` — re-submit av et allerede levert scorekort dupliserte tidligere peer-varsler, admin-varsler og admin-mail fordi `.is('submitted_at', null)`-guarden returnerer `error == null` selv ved 0 rader endret. Switch til `.update(...).select('user_id')` + early-return på tom rad-liste; revalidate + redirect kjører fortsatt så UX-en matcher en fersk submit. Arvet legacy-bug fra mail-flyten; Phase 3 av [#25](https://github.com/jdlarssen/golf-app/issues/25) forsterket konsekvensen ved å duplisere in-app-varsler i tillegg. Ny `app/games/[id]/submit/actions.test.ts`-test asserterer at en re-submit ikke fyrer notify eller mail.

</details>

### [1.15.2] - 2026-05-24

> Du får færre mail når du er aktiv. Hvis du har vært i Tørny de siste fem minuttene når noen leverer scorekort eller avslutter et spill du er med i, dukker varselet kun opp i innboksen din. Mailen kommer som før hvis det er en stund siden du var her.

<details>
<summary>Teknisk</summary>

#### Changed
- `app/games/[id]/submit/actions.ts` — `submitScorecard` filtrerer nå admin-mottakerlisten på `shouldAlsoSendMail` fra notify() før mail-blasten fyres. Aktive admin-er (last_seen_at < 5 min — terskel definert i `lib/notifications/notify.ts:OFF_APP_THRESHOLD_MS`) får kun in-app-varselet; off-app-admin-er får mail som backup. Notify-feil → ikke send mail (samme rasjonale som inni notify() ved insert-error: vi vil ikke maile uten in-app).
- `app/admin/games/[id]/actions.ts` — `endGame` speiler samme pattern for spillerne. Per-spiller `sendMailByUserId`-map bygges fra notify-resultatene; `mailRecipients = recipients.filter(...)` filtrerer før «Resultatet er klart»-blasten.
- `app/admin/games/[id]/avslutt/actions.ts` — `endGameWithSideWinners` speiler endGame-gatingen for sideturnerings-flyten.
- `lib/mail/gameFinishedRecipients.ts` — `FinishedMailRecipient`-interface utvidet med `userId: string` slik at action-laget kan matche notify-utfall mot mail-mottakerlisten. Alle grenene (best-ball, stableford solo/team, singles matchplay, solo strokeplay) oppdaterer recipient-objektene tilsvarende.

#### Notes
- Phase 4 av 4 i issue [#25](https://github.com/jdlarssen/golf-app/issues/25) — innboks-epic-en er nå komplett. PR-er: [#173](https://github.com/jdlarssen/golf-app/pull/173) (Phase 1 — datalag), [#180](https://github.com/jdlarssen/golf-app/pull/180) (Phase 2 — bjelle + /innboks), [#185](https://github.com/jdlarssen/golf-app/pull/185) (Phase 3 — event-wiring), denne PR-en (Phase 4 — mail-gating).
- `invite`-event er IKKE wired i mail-gatingen — Phase 3 wired heller ikke selve invite-notify-call-en siden `invitations.game_id` er null i dagens kode (sporet i [#182](https://github.com/jdlarssen/golf-app/issues/182)). Når game-scoped invitations lander vil mail-gatingen følge samme pattern.
- `last_seen_at`-oppdateringen var allerede wired i `proxy.ts` (best-effort fire-and-forget med Postgres-side WHERE-clause-debounce på 30 min). Bekreftet i Task 4.1, ingen ny kode lagt til. Det betyr at gating-threshold-en (5 min off-app) er strammere enn proxy-debounce-en (30 min) — en aktiv bruker kan i teorien få mail hvis deres siste last_seen_at-skriving er 5–30 min gammel. Akseptabel konservativ default — backup-mail er bedre enn manglende varsel.
- Mail-templatene endret seg ikke; alle 39 mail-snapshot-tester er fortsatt grønne. Action-testene (`app/games/[id]/submit/actions.test.ts`, `app/admin/games/[id]/actions.test.ts`) fikk notify-mock + `userId`-felter i fixturene for å gjenopprette deterministisk mail-fyring i happy-path. Tre nye gating-tester ble lagt til (off-app filter + notify-feil fail-closed) for å assertere kontrakten direkte. Test-suite på 840 grønne.
- 5-min vs 30-min terskel-mismatchen sporet i oppfølgings-issue for å vurdere alignment senere.

</details>

### [1.15.1] - 2026-05-24

> Innboksen lever nå. Du får varsel når noen leverer scorekort, godkjenner ditt eget kort, eller avslutter et spill du er med i. Mailen sendes fortsatt parallelt; neste lansering kutter mailen til de som allerede er aktive i appen.

<details>
<summary>Teknisk</summary>

#### Added
- `app/games/[id]/submit/actions.ts` — `submitScorecard` varsler nå (a) flight-medlemmer som må peer-godkjenne (`peer_approval_request`-kind) gated på `require_peer_approval` og non-null `flight_number`, og (b) admin-er om at scorekort er levert (`scorecard_submitted`-kind). Begge loopene fyres via Promise.allSettled — feiler stille i notify() og logges som console.error. Mail til admin sendes uavhengig (Phase 3 = sikkerhetsnett); Phase 4 vil gate på shouldAlsoSendMail. select-en på games-raden utvidet med `require_peer_approval`; en ny game_players-query henter flight-medlemmer i samme Promise.all som de eksisterende admin- og submitter-queries.
- `app/games/[id]/approve/actions.ts` — `approveScorecard` varsler nå submitter (`scorecard_approved`-kind) med game.name + approver.name. Wrappet i try/catch slik at en notify-feil aldri blokkerer parent-action.
- `app/admin/games/[id]/actions.ts` — `adminApproveScorecard` speiler peer-approve-flyten med `scorecard_approved`-notify til submitter (approver-navn settes til actorName fra requireAdmin()). `endGame` varsler alle deltakere (`game_finished`-kind) parallelt med eksisterende mail-blast. players-select utvidet med `user_id`.
- `app/admin/games/[id]/avslutt/actions.ts` — `endGameWithSideWinners` speiler `endGame`-loopen for sideturnerings-flyten; samme players-select-utvidelse + game_finished-notify-loop.
- `app/games/[id]/page.tsx` — mark-as-read for både `invite`- og `scorecard_approved`-kinder etter auth-check (spill-hjem er deeplink-target for begge). Best-effort.
- `app/games/[id]/approve/page.tsx` — mark-as-read for `peer_approval_request` ved entry.
- `app/admin/games/[id]/page.tsx` — mark-as-read for `scorecard_submitted` ved entry; gated på userId (helperen forventer non-null).
- `app/games/[id]/leaderboard/page.tsx` — mark-as-read for `game_finished` etter auth-check.

#### Notes
- Phase 3 av 4 i issue [#25](https://github.com/jdlarssen/golf-app/issues/25). Phase 4 vil gate mail-sending på `shouldAlsoSendMail` fra notify() slik at aktive brukere ikke får mail i tillegg til in-app-varsel.
- `invite`-event (game-scoped invitation) ble *ikke* wired i denne fasen siden det ikke finnes en game-scoped invite-flyt i koden i dag. `app/invite/actions.ts` håndterer friend-invite (ingen game_id), og `app/admin/spillere/actions.ts` håndterer admin-invite (heller ingen game_id). Når en game-scoped invite-flyt lander vil notify-callen tilføyes der; mark-as-read-hooken på spill-hjem er allerede på plass.
- Test-suite holder på 837 grønne — eksisterende submit/approve/end-game-tester dekker happy-path uten å mocke notify() (notify-feil svelges via Promise.allSettled / try-catch og endrer ikke parent-action-redirect).

</details>

### [1.15.0] - 2026-05-24

> Innboksen finnes nå som flate i appen — bjelle øverst-til-høyre og en /innboks-side. Selve varslene tikker inn fra og med neste fase; per i dag rendrer innboksen seg som tom for alle.

<details>
<summary>Teknisk</summary>

#### Added
- `hooks/useUnreadNotificationsCount.ts` — client-hook med initial `count: 'exact', head: true`-query mot `notifications`-tabellen + Supabase realtime-sub på `postgres_changes` (INSERT + UPDATE) som lokalt mutérer telleren (INSERT-ulest +1, UPDATE som flipper read_at justerer i begge retninger, Math.max-floor mot negativ teller). Cleanup ved unmount eller userId-bytte. Gjenbruker `subscribeRealtimeChannel`-helperen for setAuth-jwt-håndtering og leak-resistant kanal-suffiksing. 8 tester dekker null-userId-no-op, initial-fetch, INSERT-inkrement (kun ulest), UPDATE-mark-lest-dekrement, UPDATE-mark-ulest-inkrement, floor-på-0, og realtime-cleanup.
- `components/notifications/NotificationBell.tsx` — SmartLink til /innboks med lokalt-tegnet 22px bell-svg (line-icon stil) + 8px champagne-prikk (var(--accent), border-2 av --bg) absolutt-posisjonert øverst-til-høyre når `count > 0`. Ingen tellertall — kun signal-dott per design (mindre visuell støy). aria-label varierer med count. Returnerer null når userId mangler. Tap-target min-h-11 min-w-11 (44px). 7 tester dekker rendring, prikk-toggle, aria-label-format, null-userId, og tap-target.
- `components/notifications/NotificationCard.tsx` — per-kort UI for innboks-listen med emoji-bobble per kind (📨 invite, ✋ peer_approval_request, 📋 scorecard_submitted, ✅ scorecard_approved, 🏆 game_finished), tittel + 1-linjes detalj fra payload (handlings-orientert norsk), champagne-stripe + font-medium for uleste, opacity-80 + font-normal for leste, relativ tidsstempel via `Intl.RelativeTimeFormat('nb-NO', { numeric: 'auto' })`, button med min-h-11 tap-target og caller-styrt onTap. 12 tester dekker payload→title/detail per kind, emoji-mapping, relativ-tid, unread-stripe-toggle, font-medium-toggle, tap-handler og tap-target.
- `lib/notifications/groupByDay.ts` — `groupNotificationsByDay`-helper bucketer notifications per kalender-dag i lokal tid med «I dag»/«I går»/dato-label. `formatDayLabel` håndterer fire nivåer (i dag, i går, dato uten år, dato med år). 8 tester dekker tom input, single-dag-bucket, multi-dag-bucketing, rekkefølge-bevaring, og forrige-år-fallback.
- `app/innboks/page.tsx` + `app/innboks/InboxClient.tsx` + `app/innboks/actions.ts` — /innboks-rute. Server-component fetcher inntil 100 nyeste notifications-rader for current user (eksplisitt user_id-filter for å bruke partial-indexen). Client håndterer optimistic-mark-read ved tap, server-action via useTransition + router.push til deeplink (invite/scorecard_approved → /games/[id], peer_approval_request → /approve, scorecard_submitted → /admin/games/[id], game_finished → /leaderboard). «Marker alle som lest»-knapp synlig kun ved minst ett ulest. Tom-tilstand bruker `<MailEnvelope>` + PullQuote. 10 nye InboxClient-tester.
- `components/ui/TopBar.test.tsx` — 5 tester for ny `userId?: string | null`-prop og action+bell-co-existence.

#### Changed
- `components/ui/TopBar.tsx` — ny valgfri `userId?: string | null`-prop. Når satt rendres `<NotificationBell userId={userId}>` lengst til høyre (med `ml-1` etter eventuell action-chip, ellers `ml-auto`). Legal/privacy + admin/loading skipper bjella (offentlig hhv. skeleton-tilstand).
- Wired userId-prop på 21 page-flater: alle admin-flater + alle profile-flater + games/[id]/{,submit,approve,scorecard,leaderboard}. Per-page-mønsteret er bevisst eksplisitt — `getProxyVerifiedUserId()` er en ren x-torny-user-id-header-lookup uten DB-roundtrip, så cost-en er minimal.
- `app/page.tsx` — bjella mountes ved siden av BrandMark i en flex-rad siden home ikke har TopBar (BrandMark er en wordmark, ikke en lenke).
- `app/games/[id]/leaderboard/RevealBruttoView.tsx` — ny required `userId: string | null`-prop forwardet fra leaderboard-page (komponenten har egen TopBar).
- `lib/notifications/markRead.ts` — utvidet med valgfri `notificationId?: string`-parameter for per-tap-marking fra innboks. Eksisterende kind+entityId-filtre uendret. `buildMarkReadQuery`-tester utvidet til 4 cases.

#### Notes
- Phase 2 av 4 i issue [#25](https://github.com/jdlarssen/golf-app/issues/25). Phase 1 leverte datalag (1.14.3). Phase 3 wires inn de 5 events i eksisterende server-actions; Phase 4 aktiverer off-app mail-gating.
- Per d.d. er innboksen tom for alle siden ingen server-action ennå kaller `notify()`. Bjella forblir uten prikk inntil Phase 3.
- Test-suite vokst fra 786 → 837 (+51 nye Phase 2-tester).

</details>

</details>

---

<details>
<summary><strong>1.14.y — Stableford-runde-polish (4 entries) — klikk for å vise</strong></summary>

## 1.14.y — Stableford-runde-polish

Polish etter første reelle stableford-runde med kompisene. Du kan nå føre slag for hele flighten i solo stableford, fortsette runden fra første tomme hull, og se sideturneringen på stableford-leaderbordet etter avsluttet spill. Hele appens norske copy er også strammet for AI-tells og engelske kalker — først via humanizer (1.14.3), så et no-nb-pass mot code-switched English som var igjen (1.14.4), og til slutt en oppfølger som fanget «Stackbare» + «Lag-koord»-forkortelsen (1.14.5).

### [1.14.5] - 2026-05-24

> To anglisismer i sideturnerings-flyten ryddet: «Stackbare bonuser» heter nå «Bonuser som stables», og den Tørny-interne forkortelsen «Lag-koord» heter «Lag-bonus» på alle bruker-rettede flater. Tre gruppe-titler i «Slik gis poengene»-panelet som var glemt i forrige pass («Skill og rarity», «Moderate», «Achievements») følger nå samme oversettelse som admin-pickeren.

<details>
<summary>Teknisk</summary>

#### Changed
- `components/admin/SideCategoriesPicker.tsx` — «Stackbare bonuser — kan utløses flere ganger samme runde.» → «Bonuser som stables — kan utløses flere ganger samme runde.» Pointslabel for Turkey/Solid: «4p / spiller + lag-koord» / «2p / spiller + lag-koord» → «… + lag-bonus».
- `app/games/[id]/leaderboard/SideTournamentView.tsx` — alle 8 bruker-rettede forekomster av «Lag-koord»/«lag-koord» byttet til «Lag-bonus»/«lag-bonus»: chip-labels for Turkey/Solid lag-koord, rule-tekster («Lag-koord utløses om hele laget …»), og pointsPerId-strenger («4p × N lag-koord-bonus» → «4p × N lag-bonus»).
- `app/games/[id]/leaderboard/SideTournamentView.tsx` — tre PANEL_GROUPS-titler som ble glemt i 1.14.4-passet: «Skill og rarity» → «Ferdighet og sjeldenhet», «Moderate» → «Moderat», «Achievements» → «Bragder». GROUP_LABELS-en (rendret for fane-overskriftene) ble fikset i 1.14.4, men PANEL_GROUPS (rendret i «Slik gis poengene»-panelet) hadde duplikatene som humanizer-/no-nb-passet ikke fanget.

#### Notes
- Bevisst beholdt: kode-kommentarer og test-describe-blocks bruker fortsatt «lag-koord» som domain-jargon (per CLAUDE.md `### Språk` — kode/kommentarer/tester er engelsk-mixed, ikke bruker-synlig).
- 107 tester på tvers av endrede områder grønne — ingen UI-snapshot-assertions brutt.
- Lærdom: en grundigere no-nb-audit bør lete i parallelle data-strukturer i samme fil (GROUP_LABELS + PANEL_GROUPS hadde nesten-duplikater hvor bare den ene ble fikset). Lagt til som hint i CLAUDE.md «Språk-kvalitet»-seksjonen.

</details>

### [1.14.4] - 2026-05-24

> Engelske ord embedded i norske setninger er ryddet: «gender» → «kjønn» i bane-administrasjon, sideturnerings-gruppene heter nå «Bragder», «Minuspoeng» og «Ferdighet og sjeldenhet» (var «Achievements», «Penalty» og «Skill og rarity»), «Custom»-preset heter «Egendefinert», og 12 «Best ...»-labels på leaderbordet er endret til «Beste ...».

<details>
<summary>Teknisk</summary>

#### Changed
- `no-nb:no-nb`-skillet kjørt over hele appen for å fange code-switched English (engelske ord embedded i norske setninger). Dette er en kategori humanizer ikke pågriper like systematisk siden mønstrene ofte ikke ser ut som AI-tells på overflaten.
- **Bane-administrasjon** (`app/admin/courses/CourseForm.tsx`, `app/admin/courses/new/page.tsx`, `app/admin/courses/[id]/edit/page.tsx`, `lib/admin/gameErrorMessages.ts`) — 7 forekomster av «gender» → «kjønn». Inkluderer «per gender», «gender-rating» → «rating-sett per kjønn», «spillers gender» og «tee-gender».
- **Sideturnering** (`app/games/[id]/leaderboard/SideTournamentView.tsx`, `components/admin/SideCategoriesPicker.tsx`) — gruppe-titler oversatt: «Skill og rarity» → «Ferdighet og sjeldenhet», «Moderate» → «Moderat», «Achievements» → «Bragder», «Penalty» → «Minuspoeng». «Custom»-preset-chip → «Egendefinert». «preset» → «forhåndsvalg», «togglerne» → «bryterne», «Hole-wins» → «Hull-seire», «bogey-fri-streak» → «bogey-fri rekke», «kan trigge»/«trigger» → «kan utløses»/«utløses», «(penalty)» trailer → «(minuspoeng)».
- **«Best» som mid-sentence-adjektiv** (6 labels per fil × 2 filer = 12 forekomster) → «Beste» i `'Best netto totalt 18'`, `'Best netto front/back 9'`, `'Best brutto totalt 18'`, `'Best brutto front/back 9'`. Norsk bestemt form for superlative adjektiver mid-sentence.

#### Notes
- Audit dispatched som single Opus-subagent etter at brukeren oppdaget «Fyll inn rating for hver gender»-strengen som humanizer-passet hadde glemt. Audit-en fant ~22 distinkte code-switched English forekomster fordelt på 6 filer.
- Bevisst beholdt: golf-termer (`best ball`, `stableford`, `matchplay`, `tee`, `leaderboard`, `Slope`, `CR`, `Course Rating`, `Hole-win` singular), achievement-navn (Turkey, Solid, Snowman), kode-identifikatorer + kommentarer + JSDoc (per CLAUDE.md-konvensjon).
- 116 tester på tvers av endrede områder grønne — ingen snapshot-/string-assertion brutt.
- CLAUDE.md «Språk-kvalitet i bruker-rettet copy»-seksjonen utvidet med «Code-switching i bruker-rettet kopi»-paragraf som dokumenterer mønsteret eksplisitt, slik at framtidige no-nb-pass kan lete spesifikt etter dette.

</details>

### [1.14.3] - 2026-05-24

> Hele Tørnys norske copy er polert: feilmeldinger, banner-tekster, mail-malene og knappe-tekster er strammet for AI-tells og engelske kalker. Du merker det som mer naturlig norsk på alle flatene. Under panseret er også datalaget for in-app innboks lagt inn — usynlig for deg ennå (fase 1 av 4 mot varslings-senter, [#25](https://github.com/jdlarssen/golf-app/issues/25)).

<details>
<summary>Teknisk</summary>

To uavhengige arbeidsstrømmer landet samme dag og delte versjonsnummer. Begge er samlet her for å holde semver-historikken ren (én versjon, én dato, én oppføring).

#### Changed — humanizer-pass på brukerrettet norsk
- 27 filer på tvers av mail-templates, auth-flyt, UI-primitives, spille-flyt og admin-flyt fikk en gjennomgang med `humanizer:humanizer`-skillet (fra `floka-marketplace`). Mønstrene fulgte etablert vokabular fra [PR #170](https://github.com/jdlarssen/golf-app/pull/170): anglisismer, em-dash-kjeder, «X-spillet»-redundans, særskriving, curly quotes og significance-puffery.
- **Mail** (`lib/mail/gameFinishedNotification.ts`, `lib/mail/scorecardSubmittedNotification.ts`, `docs/email-templates.md`) — em-dash-kjeder splittet, passiv-opener byttet ut («Vi mottok forespørsel om å endre…» → «Du har bedt om å endre…»), idiomatisk definitt-form («leaderboard er åpen» → «leaderboardet er åpent»).
- **Auth-flyt** (`app/(auth)/login/page.tsx`, `app/complete-profile/page.tsx`) — anglism «på login» fjernet, US-decimal i feilmelding (`54.0` → `54,0`), passiv-formulering («det navnet folk kjenner deg som» → «navnet du går under»).
- **UI-primitives** (`components/sync/SyncBanner.tsx`, `components/pwa/InstallInstructionsModal.tsx`) — feilmelding-tone («Tillatelse manglet» → «Du mangler tilgang», «Lagring mislyktes» → «Klarte ikke å lagre»), «nett-tilkoblingen» → «nettforbindelsen», em-dash-kjede i iOS-instruksjoner splittet.
- **Spille-flyt** (`components/hole/*.tsx`, `app/games/[id]/approve/*.tsx`, `app/games/[id]/leaderboard/*.tsx`) — «Tap» → «Trykk» (4 steder, anglism), AI-hedge i confirm-dialog, filler «akkurat nå» fjernet, synonym-overlap droppet i RevealBruttoView.
- **Admin-flyt** (12 filer i `app/admin/` + `lib/admin/gameErrorMessages.ts`) — em-dash-tells (~10 steder), «Vennligst»-overforbruk strammet, tailing-fragmenter omsporet, generisk «Noe gikk galt» → konkret «Klarte ikke å fullføre handlingen», «spennings-moment»-særskriving → «spenningsmoment».

#### Added — notifications-datalag (#25 Phase 1)
- `supabase/migrations/0032_notifications.sql` — `public.notifications`-tabell (polymorf med kind-discriminator + JSONB payload), RLS-policies (select/update kun egne), 2 indekser (uleste-partial + full-historikk), realtime-publikasjon. Applied mot prod via Supabase MCP.
- `lib/notifications/types.ts` — `NotificationKind`-union for de 5 v1 events (`invite`, `peer_approval_request`, `scorecard_submitted`, `scorecard_approved`, `game_finished`) + Zod-skjema per kind. `parseNotificationPayload()` validerer payload mot kind før insert. Bruker `z.guid()` (permissiv UUID-shape) framfor strict RFC 9562 `z.string().uuid()` siden test-sentinels og nil-UUID skal kunne valideres.
- `lib/notifications/notify.ts` — `notify()`-helper inserter notification-rad via admin-client (bypass RLS) + returnerer `shouldAlsoSendMail`-flagg basert på `users.last_seen_at` (off-app hvis null/ugyldig/> 5 min siden). Insert + last_seen_at-lookup kjøres i parallell. Feiler stille på DB-error (returnerer `shouldAlsoSendMail: false` for å unngå mail-uten-in-app). `shouldSendMailFallback()` er pure-helper eksportert for testing og direkte bruk.
- `lib/notifications/markRead.ts` — `markNotificationsRead({userId, kind?, entityId?})` UPDATEr matching uleste rader til `read_at = now()`. Bruker `getServerClient()` (cookies) — RLS-policy `notifications_update_own` gir authz «gratis». Kompositoriske filtre: bare userId (marker alle), userId+kind (alle av kind), userId+kind+entityId (game-scoped). Brukes både fra /innboks-knapper og fra server-side helpers på målsider.
- `zod ^4.4.3` lagt til som ny dep for payload-validering.
- 10 nye unit-tester (3 types, 4 notify, 3 markRead).

#### Notes
- Begge arbeidsstrømmer landet 2026-05-24 og fikk hver sin bump til 1.14.3 — humanizer-passet bumpet uavhengig av notifications-foundation som var commited noen timer tidligere. Konsolidert til én oppføring 2026-05-24 ([#181](https://github.com/jdlarssen/golf-app/issues/181)) for stakeholder-lesbarhet; git-historikken bevarer fortsatt begge commits separat (`9eb9aeb` notifications-foundation + `e488f8a` humanizer-pass).
- 5 parallelle humanizer-subagenter dispatched, hver mot disjoint overflate (mail / auth / UI-primitives / spille / admin). Alle 39 mail-tester grønne — verifisert at ingen subject-/body-snapshots ble brutt.
- Bevisst bevart: mail-subject «Resultatet er klart — ${gameName}» (5 snapshot-tester asserter eksakt streng), brand-tagline «Tørny — fyr opp golfturneringen» (kanonisk), «Sekretariat»-stemmen i admin-flatene, og engelske side-tournament-kategori-navn (Turkey/Solid/Snowman — bevisste achievement-navn).
- Foundation-commits for notifications er prefikset `chore(notifications)` siden de ikke endrer bruker-synlig oppførsel — kun datalag og helpers ikke ennå kalt fra noen actions. Phase 2 leverer bjelle + /innboks UI; Phase 3 wires inn de 5 events; Phase 4 aktiverer off-app mail-gating.

</details>

### [1.14.2] - 2026-05-24

> Når et stableford-spill med sideturnering avsluttes, vises sideturneringen som en egen fane på leaderbordet — akkurat som for best ball. Tidligere var sideturneringen helt usynlig på stableford selv om du hadde valgt å legge den til.

#### Added
- `app/games/[id]/leaderboard/page.tsx` — ny `renderStablefordWithSideTournament`-helper henter LD/CTP-vinnere fra `game_side_winners`, bygger `SideTournamentInput` per spiller/lag (perHoleGross + perHoleNetto med `strokesForHole`-justering), og pakker hoved-podiet + `SideTournamentView` inn i `LeaderboardTabs`. Solo-stableford mapper hver spiller til en «team of 1» med løpende teamId — lag-aggregerte sidekategorier (most_birdies_team etc.) faller bort som forventet via `userIds.length >= 2`-filteret i sideTournament.ts, mens individ-kategorier + LD/CTP + Snowman fungerer normalt. Par-stableford bruker eksisterende team_number-gruppering; nettoBestBallPerHole = MIN av lagets to spilleres netto per hull, samme logikk som best-ball-grenen lenger oppe.
- `renderStableford` ble async for å støtte sideturnerings-fetchen — kalt fra `LeaderboardBody` som allerede er async, så ingen call-site-endringer.

#### Changed
- `app/games/[id]/leaderboard/SoloStablefordPodium.tsx` + `TeamStablefordPodium.tsx` — ny `chromeless?: boolean`-prop (default false) som hopper over `Shell` (AppShell-wrapper) og `Header` (back-pil + kicker) når satt. Brukes når podiet rendres inni `LeaderboardTabs` — outer-callern eier AppShell + TopBar. Speilar `State4View.chromeless`-pattern. Eksisterende standalone-bruk (uten sideturnering) er upåvirket.

### [1.14.1] - 2026-05-24

> «Fortsett runden»-knappen på spill-hjem sender deg nå direkte til første tomme hull i stedet for alltid hull 1. Etter å ha tastet hull 1-9 og lagt fra deg telefonen, åpner appen rett på hull 10 når du tar opp igjen.

#### Changed
- `app/games/[id]/page.tsx` — `PrimaryCtaSection` fetcher nå listen av hull med score (i stedet for kun count via `head: true`) og sekvensielt-scanner 1→18 etter første hull uten score. Resultatet sendes som `nextHole`-prop til `PrimaryCta` og brukes i både «Start runden» og «Fortsett runden»-linkene (tidligere hardkodet `/holes/1`). For full-runde-state (`ready_to_submit`) er verdien ubrukt — CTA-en routes til `/submit` der i stedet, så fallback til 1 ved 0 tastede hull dekker både not_started og in_progress.

### [1.14.0] - 2026-05-24

> I solo stableford kan nå én spiller fungere som «marker» og taste slag for alle i flighten — akkurat som i best ball. Tidligere kunne hver spiller kun se og taste sitt eget scorekort.

#### Changed
- `app/games/[id]/holes/[holeNumber]/page.tsx` — flight-filtreringen i hull-siden behandler nå hele spillerlisten som én flight når `me.flight_number == null` (solo-modus: stableford og solo strokeplay netto), i stedet for å filtrere ned til kun `[me]`. Konsekvens: en av spillerne kan markere for alle de andre i samme spill — typisk bruksmønster når 1-4 kompiser går runden sammen og én av dem fører kortet. Best-ball- og matchplay-modus beholder per-flight-filtreringen som før (flight_number er satt i de modusene).

#### Notes
- `HoleClient`-komponenten støtter allerede multi-player rendering (`cards.map` itererer over alle innsendte spillere, `onSetScore(playerId, value)` godtar hvilken som helst userId), så ingen client-side endringer var nødvendige. Den eksisterende «Bekreft alle scorer»-bekreftelses-gaten på BottomActionBar gjelder fortsatt — marker må fylle inn for alle spillerne før «Neste hull» aktiveres, samme regel som best ball.

</details>

---

<details>
<summary><strong>1.13.y — Slagspill (3 entries) — klikk for å vise</strong></summary>

## 1.13.y — Slagspill

Klassisk slagspill (solo strokeplay netto) er nå tilgjengelig. Velg Slagspill som modus, meld på spillerne, og lavest netto-total over runden vinner. Hver spiller fører sitt eget kort — perfekt for klubbmesterskap og kompis-runder uten lag-fokus.

### [1.13.2] - 2026-05-24

> Når slagspillet avsluttes får spillerne mail med sin plassering og totalt antall netto-slag. Admin-flaten viser «Slagspill» konsistent for solo-strokeplay-spill.

<details>
<summary>Teknisk</summary>

#### Added
- `lib/mail/gameFinishedNotification.ts` — `GameFinishedNotificationMode` har ny `kind: 'solo_strokeplay_netto'`-gren med `rank`, `totalNetStrokes`, `totalGrossStrokes` og `totalPlayers`. Body-builder rendrer personlig plassering med netto-total og brutto som side-note: «Du endte på 2. plass av 8 med 72 slag netto (78 brutto)». Celebration-cascade speilar solo-stableford-grenen (1. → «Gratulerer med seieren!», 2-3 → «Solid plassering!», 4+ → nøytral). 6 nye tester dekker 1.-plass + netto/brutto, 2.-plass + solid, 3.-plass + solid, 4.-plass nøytral, plain-text-felter, og fallback når `playerFirstName` er null.
- `lib/mail/gameFinishedRecipients.ts` — ny `buildSoloStrokeplayRecipients`-helper bygger per-spiller mottakerliste fra `SoloStrokeplayResult`. Speilet solo-stableford-pattern strukturelt: kjører `computeLeaderboard` mode-router, narrower på `kind === 'solo_strokeplay_netto'`, og mapper hver spiller til mode-payload med rank + slag-totaler. Defensive fallbacks: hvis mode-router returnerer noe annet enn `solo_strokeplay_netto`, faller helperen tilbake til nøytral best-ball-default. Spillere uten email droppes (samme regel som de andre grenene). 3 nye tester dekker rank + slag-utregning, drop av spillere uten email (totalPlayers reflekterer FULL turnering), og brutto/netto-diff når HCP gir ekstra slag.

#### Changed
- `app/admin/games/[id]/page.tsx` — `isSolo`-narrowing utvidet til å dekke `solo_strokeplay_netto` i tillegg til solo-stableford (`team_size === 1`). Konsekvenser: admin-detalj-siden skjuler Lag-seksjon + Lag/Flight-kolonner for slagspill-spill (én spiller = én deltager), og Format-cardet viser «Slagspill» fra `MODE_LABELS` konsistent. `modeLabel`-JSDoc oppdatert til å reflektere at matchplay og slagspill begge leser ren mode-label.

#### Notes
- Phase 4 markerer epic #46 (solo strokeplay netto) som ferdig. Tidligere faser leverte scoring + validation (Phase 1), GameForm-UI med slagspill-modus (Phase 2), og leaderboard-view + podium (Phase 3). Mailen og admin-polish-en var de siste manglende stykkene før formatet er produksjons-klart.

</details>

### [1.13.1] - 2026-05-24

> Når slagspillet er i gang ser spillerne et leaderboard rangert på laveste netto-total. Avsluttet spill viser podium for topp 3 — 1.-plassen feires med konfetti.

<details>
<summary>Teknisk</summary>

#### Added
- `app/games/[id]/leaderboard/SoloStrokeplayView.tsx` (+ test) — live/post-finished leaderboard for solo strokeplay netto. Flat liste sortert på `totalNetStrokes` (lavest øverst, klassisk slagspill-format), speilar `SoloStablefordView` 1:1 med disse forskjellene: hoved-tallet er «slag» (ikke «poeng»), sekundær-linje viser brutto-total ved siden av hull-spilt («N brutto · N hull spilt»), sub-tittel «Slagspill · Sortert på laveste netto». Topp 3 får Medallion (gull/sølv/bronse), 4+ får rank-disc. Champagne-tinted Card kun for vinneren. 12 tester dekker rad-rendring, sortering, brutto-display, «slag»-label (ikke «poeng»), Medallion-vs-rank-disc, tabular-nums på netto-tallet, formatRevealName, tom liste, ukjent spiller-fallback, sub-tittel-tekst og tied-spillere.
- `app/games/[id]/leaderboard/SoloStrokeplayPodium.tsx` (+ test) — finished-state-view ved `game.status === 'finished'`. Speilar `SoloStablefordPodium` med samme 3-trinns podium-layout (1. midten, 2. venstre, 3. høyre), champagne accent for vinneren, sølv/bronse for 2-3, og rest-listen i collapsed `<details>`-element for rank 4+ med både netto og brutto-totaler. Distinkt sessionStorage-key `torny-solo-strokeplay-podium-confetti-seen-${gameId}` — verifisert via dedikert test at den ikke kolliderer med stableford-key-en. 19 tester dekker podium-trinn-rendring, slag-label (ikke poeng), hull-chip, konfetti-burst, konfetti-key-isolasjon, suppression når sessionStorage allerede har sett-flagg, champagne accent, collapsed details-rest med netto + brutto, ≤3-spillere-skip, 2- og 1-spiller-edge-cases, tom liste, formatRevealName-bruk, ukjent-fallback, sub-tittel og lavest-først-rangering.

#### Changed
- `app/games/[id]/leaderboard/page.tsx` — ny `renderSoloStrokeplay`-helper og branch i `LeaderboardBody`. Følger samme mønster som `renderStableford` og `renderMatchplay`: bygger `ScoringContext` fra DB-radene, kjører `computeModeResult`, narrower på `kind === 'solo_strokeplay_netto'` og velger view per `game.status` (finished → podium, ellers live-view). `teamNumber` sendes som null siden solo-strokeplay-validatoren håndhever solo-modus. State #3/#3.5-«venterom» bevisst skipped (samme RLS-pattern som stableford og matchplay — alle spillere ser hverandre umiddelbart).

#### Notes
- Scoring-motor + validator landet i Phase 1 (PR #159), admin-UI-flyten i Phase 2 (PR #160). Denne fasen lukker leaderboard-gapet slik at slagspill-spill rendres riktig fra start til finished-podium. Mail-template + admin/games-detalj-polish kommer i Phase 4 av epic #46.

</details>

### [1.13.0] - 2026-05-24

> Du kan nå opprette slagspill-turneringer — klassisk golf-format der hver spiller fører eget kort og laveste netto-total vinner. Velg Slagspill som modus og meld på spillerne.

<details>
<summary>Teknisk</summary>

#### Added
- `app/admin/games/new/ModeSelector.tsx` — fjerde tile «Slagspill» for solo strokeplay netto. Ny `StrokeplayIcon` (scorekort med tre score-linjer + blyant til høyre, samme stroke-stil som de andre tile-ikonene) signaliserer at hver spiller fører eget kort. Grid-layout byttet fra `grid-cols-1 sm:grid-cols-3` til `grid-cols-2 sm:grid-cols-4` slik at iPhone får 2×2-stacking (hver tile ~halve skjermbredden, komfortabel scanning) og tablet/desktop får 4-i-rad-symmetri. Beskrivelses-tekst: «Individuelt scorekort. Lavest netto-total vinner.» `ModeSelector.test.tsx` utvidet med assertion for slagspill-tile-rendering, beskrivelses-tekst, aria-checked-toggle og click → `onChange('solo_strokeplay_netto')`.
- `app/admin/games/new/GameForm.tsx` — solo strokeplay netto-grenen gjenbruker hele solo-stableford-UI-flyten via utvidet `isSolo`-narrowing-flag (`teamSize === 1 && (gameMode === 'stableford' || gameMode === 'solo_strokeplay_netto')`). Konsekvenser:
  - **Flat spiller-liste**: ingen lag-grid og ingen flight-seksjon — alle valgte spillere persisteres med `team_number = null` og `flight_number = null` (gamePayload-validatoren `validateSoloStrokeplayNetto` nullstiller defensivt uansett form-input).
  - **TeamSizeSelector synlig**: Solo aktiv, Par + 4-mann grayed-out som «kommer snart» (par/4-mann strokeplay er fremtidige varianter — par = fyrball strokeplay; 4-mann = bestest av 4 totaler). I motsetning til matchplay som skjuler hele TeamSizeSelector siden 1v1 er den eneste meningsfulle kombinasjonen.
  - **Per-spiller-tee-seksjon**: vises (slagspill krever individuell HCP-allokering for korrekt slope/CR per spiller). Section-nummer 4 (delt med solo-stableford siden ingen 4. Lag-seksjon ligger foran).
  - **Validering**: ≥1 spiller for publish, ingen øvre cap (i motsetning til matchplay som capper på 2). `missingForPublish` gjenbruker eksisterende «minst én spiller»-copy fra solo-stableford-grenen.
  - **Hidden inputs**: `game_mode = 'solo_strokeplay_netto'`, `team_size = 1`, ingen `stableford_team_size` (det hører kun til stableford-modus). Player-radene bærer tomme `team`/`flight`-strenger som validatoren tolker som null.
  - `defaultTeamSizeForMode` returnerer 1 også for `solo_strokeplay_netto` så form-state alltid har gyldig `team_size`.
- `app/admin/games/new/GameForm.test.tsx` — 7 nye tester for slagspill-flyten: TeamSizeSelector synlig med Solo aktiv + Par/4-mann disabled, hidden inputs (`game_mode='solo_strokeplay_netto'`/`team_size=1`/ingen `stableford_team_size`), flat spiller-liste (ingen 4. Lag- eller 5. Flights-heading), canPublish=true ved 1 spiller + øvrige felt satt, canPublish=false ved 0 spillere (med korrekt missingForPublish-copy «minst én spiller»), per-spiller-tee-seksjons-heading «4. Tee per spiller», ingen øvre spiller-cap (alle 8 spillere kan velges), og hidden-input-payload med tomme team/flight-strenger.

#### Notes
- Scoring-motor + payload-validator landet i Phase 1 (PR #159) — denne fasen aktiverer kun admin-UI-flyten. Solo-strokeplay-leaderboard-view kommer i Phase 3 (klassisk slagspill-tabell med plassering/totaler/topp-celebrasjon); mail-template + admin/games-detalj-polish kommer i Phase 4 av epic #46.
- TeamSizeSelector beholder `ENABLED_COMBOS.solo_strokeplay_netto = Set([1])` defensivt — `Record<GameMode, …>` krever alle keys, og Par/4-mann markeres som «kommer snart» istedenfor å fjernes helt (skaper en eksplisitt roadmap-signal for fremtidige varianter).

</details>

</details>

---

<details>
<summary><strong>1.12.y — Matchplay (3 oppføringer) — klikk for å vise</strong></summary>

## 1.12.y — Matchplay

Matchplay-turneringer mellom to spillere er nå tilgjengelig. Velg Matchplay som modus og tilordne én spiller til Side 1 og én til Side 2 — vinneren av hvert hull (laveste netto) får et hull-poeng, og matchen avgjøres som «X up» (etter 18 hull) eller «X&Y» (mat-em før hull 18) etter golfreglene.

### [1.12.2] - 2026-05-24

> Når matchen avsluttes får begge spillere mail med matchresultatet («Du vant 3&2 over Per» / «Du tapte 1up mot Per» / «AS — uavgjort»). Admin-flaten viser Sider i stedet for Lag for matchplay-spill.

<details>
<summary>Teknisk</summary>

#### Added
- `lib/mail/gameFinishedNotification.ts` — `GameFinishedNotificationMode` har ny `kind: 'singles_matchplay'`-gren med `matchResult` (`'won' | 'lost' | 'tied'`), `formattedResult` (golf-format: «3&2» / «1up» / «AS»), `opponentName` (motspillerens fornavn, `null` faller tilbake til «motstanderen») og `selfSide` (1 eller 2). Body-builder rendrer tre grener:
  - **won**: «Du vant {formatted} over {opponent}. Gratulerer med seieren!»
  - **lost**: «Du tapte {formatted} mot {opponent}. Godt spilt — kanskje revansje neste runde?»
  - **tied**: «Matchen mot {opponent} endte uavgjort (AS). En jevn match — kanskje neste gang.»
  - 5 nye tester dekker won / lost / tied / null-opponent-fallback / null-firstName-fallback. HTML escaper opponent-navn (XSS-defense), formatted-strengen rendres direkte siden den genereres internt fra tall.
- `lib/mail/gameFinishedRecipients.ts` — ny `buildMatchplayRecipients`-helper bygger per-spiller mottakerliste fra `SinglesMatchplayResult`. Hver spiller får motspillerens fornavn via `sideByUserId`-lookup (scoring-laget tuple-garantien gir oss 1+1) og matchResult mappet fra `result.result.winner` ('side1'/'side2'/'tied') sett FRA mottakerens `selfSide`. Defensive fallbacks: hvis matchen ikke er avgjort (`result.result === null` — sjelden gitt endGame-validering) eller hvis mode-router returnerer noe annet enn `singles_matchplay`, faller helperen tilbake til nøytral best-ball-default. 6 nye tester dekker side 1 vinner / side 2 mat-em (3&2) / AS / spiller uten mail / motspiller uten navn / live (ikke avgjort) → fallback.

#### Changed
- `app/admin/games/[id]/page.tsx` — ny `isMatchplay`-narrowing-flag (`game.game_mode === 'singles_matchplay'`) + tre tilpasninger:
  - **Lag-terminologi**: «Antall lag X / 4» blir «Antall sider X / 2», Lag-seksjonen tittel «Lag» blir «Sider» (kun viser Side 1 og Side 2, aldri 3/4), spillerlistens «Lag»-kolonne blir «Side», og «Leverte scorekort»-listen viser «Side N» i stedet for «Flight N · Lag N» for matchplay.
  - **Flights-seksjonen skjules**: flight = side mekanisk (validatoren håndhever `flight_number = team_number` for matchplay), så Flights-listen ville duplisert Sider-listen rett over — speilet par-stableford-pattern fra 1.11.2.
  - **Fremgang-kortet**: bytter «Hvor langt hver flight har kommet» til «Hvor langt hver side har kommet», og labelen «Flight N» til «Side N» for konsistens med resten av detail-pagen.

#### Notes
- Phase 4 markerer epic #45 (singles matchplay v1) som ferdig. Tidligere faser leverte scoring + validation (Phase 1), GameForm-UI med side-tilordning (Phase 2), og MatchplayMatchView-leaderboarden (Phase 3). Mailen og admin-polish-en var de siste manglende stykkene før formatet er produksjons-klart.

</details>

### [1.12.1] - 2026-05-24

> Når matchen er i gang ser begge spillerne sin sanntids match-status («X up etter Y hull»), og når matchen er over feires vinneren med resultat i golf-standard format («3&2», «1up», «AS»).

<details>
<summary>Teknisk</summary>

#### Added
- `app/games/[id]/leaderboard/MatchplayMatchView.tsx` (+ test) — ny match-view for singles matchplay. Erstatter leaderboard-grenene når `game_mode === 'singles_matchplay'`. Kombinerer live-state og finished-state i én komponent siden matchen er den samme historien som gradvis avgjøres — banner-formen bytter automatisk basert på `result.result`. Fire vertikalt-stablete seksjoner:
  - **Status-banner** øverst: «{Vinner} vant {formatted}»-card med Medallion + champagne-accent ved avgjort match (mat-em eller spilt 18 hull med vinner), «Matchen endte AS»-card uten konfetti ved tied-resultat etter 18 hull, «{Leder} leder {N} up»-card ved live-state midt i runden, «Alt likt etter N hull»-card ved tied-state midt i runden, og «Matchen er ikke startet ennå»-card ved 0 hull spilt.
  - **Sider-header**: to rader (S1 + S2) med spiller-navn (via `formatRevealName`) og course-handicap. Lederside får hårfin champagne-accent (`border-accent/60 bg-accent/[0.05]`).
  - **Per-hull-grid**: tabell med en rad per `MatchplayHoleRow` (skalerer til 9-hulls-baner ved kortere hulls-array). Kolonner: Hull, Par, Side 1 (gross + Nnet hvis extra), Side 2 (gross + Nnet), Vinner (S1/S2/=/—). Vinner-side får `font-semibold text-score-under-fg` på gross-cellen for visuell bekreftelse.
  - **Match-meta**: kompakt rad med Spilt / Igjen / Status — alle `tabular-nums` for konsistent skanning.
  - Konfetti fyrer en gang per browser-sesjon når matchen er avgjort med en vinner (`result.result.winner !== 'tied'`). SessionStorage-key `torny-matchplay-result-confetti-seen-${gameId}` er distinkt fra stableford-podiene (verifisert via dedikert test). AS-resultat får ingen konfetti.
  - Defensiv fallback: hvis `result.holes.length === 0` (scoring-laget returnerer empty-shell når sidene mangler) viser view-en en «Matchen kan ikke vises»-card i stedet for tom UI.
  - 22 nye tester dekker live/finished/AS-grener, konfetti-key-isolasjon, side-header med HCP + manglende info, per-hull-grid (uplayed/tied/won/extra strokes/9-hulls-bane), match-meta-tall og defensiv empty-shell-fallback.

#### Changed
- `app/games/[id]/leaderboard/page.tsx` — ny `renderMatchplay`-helper og branch i `LeaderboardBody`. Følger samme mønster som `renderStableford`: bygger `ScoringContext` fra DB-radene, kjører `computeModeResult`, narrower på `kind === 'singles_matchplay'` og rendrer `MatchplayMatchView` direkte. State #3/#3.5-«venterom» er bevisst skipped: matchplay-spillere ser hverandre umiddelbart (samme RLS-policy som stableford). `team_number` videresendes fra DB siden matchplay-validatoren håndhever 1+1-tilordning på påmelding.

#### Notes
- View-en kombinerer live + podium i én komponent i stedet for å speile stableford-mønstret (View + Podium). Matchplay har ingen rangering å vise — det er én match som har én løpende status, og finished-feiringen er en banner-bytte snarere enn en separat layout-omveltning.
- Per-spiller-scorecardet (når spiller taster slag) er IKKE endret i denne fasen — hver spiller fører fortsatt sitt eget kort. Match-status på scorecardet kan legges til senere som forbedring.
- Phase 4 av epic #45 dekker matchplay-mail-template (gameFinishedNotification med matchplay-copy) og admin/games-detalj-polish.

</details>

### [1.12.0] - 2026-05-24

> Du kan nå opprette matchplay-turneringer mellom to spillere — velg Matchplay som modus, tilordne én spiller til Side 1 og én til Side 2. Vinneren av hvert hull får poeng; matchen avgjøres som «X up» eller «X&Y» etter golfreglene.

<details>
<summary>Teknisk</summary>

#### Added
- `app/admin/games/new/ModeSelector.tsx` — ny `MatchplayIcon` (to flagg-stenger speilet mot hverandre med et «vs»-prikk i midten, samme stroke-stil som `BestBallIcon`/`StablefordIcon`) og en tredje tile «Matchplay» med beskrivelses-teksten «1v1 hull-for-hull. Vinneren avgjøres som «X up» eller «X&Y».». Grid-layout byttet fra `grid-cols-2` til `grid-cols-1 sm:grid-cols-3` slik at iPhone får vertikal stack (komfortabel scanning) og tablet/desktop får 3-kolonners symmetri. `ModeSelector.test.tsx` utvidet med assertion for matchplay-tile-rendering, beskrivelses-tekst, aria-checked-toggle og click → `onChange('singles_matchplay')`.
- `app/admin/games/new/GameForm.tsx` — ny `isMatchplay`-narrowing-flag + matchplay-spesifikke grener:
  - **Side-tilordnings-UI**: ny seksjon «4. Sider» som vises når ≥1 spiller er valgt og mode=matchplay. To dropdowns (Side 1 + Side 2) som tilordner spilleren til `teamByPlayer[pid] = 1 | 2`. Lag-grid (best-ball/par-stableford) og flight-seksjon rendres ALDRI for matchplay.
  - **`assignPlayerToSide`-handler** med swap-semantikk: hvis admin velger en spiller som allerede står på den andre siden, swappes okkupantene automatisk (én klikk fremfor to). `flightByPlayer[pid]` settes til `side` (samme som team_number, speiler par-stableford-mønstret for å oppfylle DB-CHECK `game_players_team_flight_consistency`).
  - **`orderedPayload` for matchplay**: itererer side 1 først, så side 2 — gir deterministisk `player_0` (side 1) + `player_1` (side 2)-rekkefølge i FormData. Hver rad bærer `team_number = side` og `flight_number = side`.
  - **`matchplayPlayersValid`-validitet**: krever nøyaktig 2 spillere, én på side 1 og én på side 2.
  - **`missingForPublish` for matchplay**: «2 spillere» (0 valgt), «1 spiller til» (1 valgt), «for mange spillere — matchplay krever nøyaktig 2» (≥3 valgt), «én spiller på hver side» (2 valgt men ikke 1+1).
  - **Spiller-cap på 2**: `atCap = isMatchplay ? selectedPlayerIds.length >= 2 : requiresTeams && >= 8` disabler 3.-spiller-checkboxen.
  - **Counter-copy**: «X av 2 spillere valgt» (primary når 2 er valgt, ellers muted).
  - **`TeamSizeSelector` skjules** (`{!isMatchplay && <TeamSizeSelector …/>}`): valget «Solo/Par/4-mann» har ingen mening for matchplay siden det kun er 1v1.
  - **Per-spiller-tee-seksjon** (M/D/J): vises også for matchplay (matchplay krever individuell HCP-allokering). Section-nummer 5 deles med par-stableford.
  - `defaultTeamSizeForMode` returnerer 1 også for `singles_matchplay` så form-state alltid har gyldig `team_size`.
- `app/admin/games/new/GameForm.test.tsx` — 12 nye tester for matchplay-flyten: TeamSizeSelector skjules, hidden inputs (`game_mode`/`team_size`/ingen `stableford_team_size`), side-tilordnings-UI vises ved ≥1 spiller, lag-grid + flight-seksjon vises aldri, «Trekk tilfeldig» skjules, spiller-cap på 2, counter «X av 2», canPublish=true ved gyldig 1+1, canPublish=false ved 1 spiller (med korrekt missingForPublish), canPublish=false ved 2 spillere på samme side, swap-semantikk i dropdown-bytte, hidden inputs (`player_0_team=1`/`player_1_team=2`/flight=team), per-spiller-tee-seksjons-heading.

#### Notes
- Scoring-motor + payload-validator landet i Phase 1 (PR #155) — denne fasen aktiverer kun UI-flyten. Matchplay-view (hull-for-hull-tabell med «AS»/«X up»/«X&Y»-status) kommer i Phase 3; matchplay-mail-templates + admin/games-detalj-polish kommer i Phase 4 av epic #45.
- TeamSizeSelector beholder `ENABLED_COMBOS.singles_matchplay = Set([1])` defensivt selv om komponenten ikke rendres for matchplay — TypeScript-en `Record<GameMode, …>` krever alle keys, og fjerning av entryen ville tvunget oss til `Partial<Record<>>`. Defensiv kode er trygt.

</details>

</details>

---

<details>
<summary><strong>1.11.y — Par-stableford (3 oppføringer) — klikk for å vise</strong></summary>

## 1.11.y — Par-stableford

Stableford-turneringer kan nå spilles som par (4BBB / fyrball). Velg Stableford som modus og Par som lagstørrelse, så kan du melde på 2/4/6/8 spillere fordelt på 1–4 lag à 2 — laget får poengene fra det høyeste stableford-resultatet på hvert hull.

### [1.11.2] - 2026-05-24

> Når par-stableford-runden avsluttes får spillerne mail om lagets plassering og poeng, ikke en generisk best-ball-mail. Admin-flaten viser lag-grupperingen korrekt for par-spill — kun de lag som faktisk har spillere vises, og redundante Flight-kolonner er skjult.

<details>
<summary>Teknisk</summary>

#### Added
- `lib/mail/gameFinishedNotification.ts` — `GameFinishedNotificationMode` har ny `kind: 'stableford', variant: 'team'`-gren med `teamRank`, `teamTotalPoints`, `teamPartnerName` (fornavn eller hele navnet hvis fornavn ikke kan parses, `null` for defensiv-fallback) og `totalTeams`. Solo-grenen er nå eksplisitt merket `variant: 'solo'` for symmetri. Body-builder rendrer team-grenen som «Laget endte på X. plass av N lag med Y poeng» + en partner-setning «Du og {partner} satt sammen på lag.» (droppet helt hvis partnernavn er `null`). Celebration-tilegget (1.-plass: «Gratulerer med seieren!», 2./3.: «Solid plassering!») er løftet ut til en `celebrationFor()`-helper som begge grenene deler. 4 nye snapshot-style tester dekker 1.-plass, 2.-plass (med partnernavn), 4.-plass (uten celebration) og null-partner-fallback.
- `lib/mail/gameFinishedRecipients.ts` — team-stableford-grenen bygger per-spiller mottakerliste der hver mottaker får sin egen `teamPartnerName` slik at Ada ser «Du og Bjørn satt sammen» og Bjørn ser «Du og Ada satt sammen». Selectsen utvidet med `team_number` (NOT NULL siden 0030, gratis å ta med for begge moduser), og scoring-context-en sender `teamNumber` videre slik at `computeTeam()` faktisk grupperer riktig. 4 nye tester: 4 spillere på 2 lag (begge får rett partnernavn), 8 spillere på 4 lag (totalTeams reflekterer lag, ikke spillere), spillere uten mail droppes men team-totalene består, partner uten navn → `teamPartnerName: null`.

#### Changed
- `app/admin/games/[id]/page.tsx` — fetcher nå `mode_config` slik at vi kan skille `isParStableford` fra solo-stableford og fra best-ball. Tre tilpasninger basert på narrow-ingen:
  - Spillform-raden i Format-cardet viser «Par-stableford» (i stedet for «Stableford») når `mode_config.team_size === 2`.
  - Lag-grid viser kun lag som faktisk har spillere for par-stableford (1-4 lag), i stedet for hardkodede 4 lag med «(tom)»-placeholdere. Best-ball beholder fast 4-grid siden formatet alltid er 4 lag à 2.
  - Spillere-tabellen dropper Flight-kolonnen for par-stableford (flight = team mekanisk siden Phase 2 — kolonnen ville duplisert Lag-tallet). Best-ball viser begge kolonnene som før. Solo dropper begge.
  - Flights-seksjonen skjules for par-stableford (samme grunn — duplikat av Lag-seksjonen).
  - «Leverte scorekort»-listen viser kun «Lag N» for par-stableford, og dropper hele lag/flight-linjen for solo.
  - «Antall lag X / 4»-raden i Påmelding-cardet skjules for solo (alltid 0).

#### Notes
- Mode-aware-mail er backwards-compatible: existing solo-spill og best-ball-spill får samme mail-copy som før (solo-snapshot-testene er kun strammet til å sende `variant: 'solo'` eksplisitt). Defensive narrowing — hvis mode-router returnerer noe uventet faller helperen til best-ball-grenen.
- Phase 4 lukker epic #43. Par-stableford er nå end-to-end shipped: scoring + validation (Phase 1, #151), admin GameForm (Phase 2, #152), live-leaderboard + podium (Phase 3, #153) og mail + admin-detalj-polish (denne fasen).

</details>

### [1.11.1] - 2026-05-24

> Når par-stableford-runden er i gang ser spillerne nå et lag-leaderboard med begge partnernes poeng. Avsluttet spill viser podium for topp 3 lag — 1.-plassen feires med konfetti.

<details>
<summary>Teknisk</summary>

#### Added
- `app/games/[id]/leaderboard/TeamStablefordView.tsx` (+ test) — ny live-leaderboard for par-stableford. Speilet `SoloStablefordView` strukturelt: flat liste sortert på lag-poeng (høyest øverst), 1.-plass får champagne-tinted Card + `Medallion`, 2–3 får sølv/bronse-`Medallion`, 4+ får ren rank-disc. Hver rad viser «Lag N» + begge partnernes fornavn (via `firstName()` + `formatRevealName`-fallback for kallenavn-only-spillere) + total stableford-poeng (`tabular-nums`). Tied lag deler rank med «Delt N. plass med Lag X»-melding. 11 nye tester dekker rendring, rekkefølge, partnernavn, medallion vs rank-disc, tied-with, tomt result, manglende playerInfo og tomme lag.
- `app/games/[id]/leaderboard/TeamStablefordPodium.tsx` (+ test) — ny finished-reveal-view for par-stableford. Speilet `SoloStablefordPodium`: 3-trinns podium med 1.-plass i midten (champagne `Medallion` 48px, `border-accent` + champagne-shadow), 2.-plass venstre (silver `Medallion` 36px), 3.-plass høyre (bronse `Medallion` + `border-warning/40`). Hver podium-trinn viser «Lag N» + begge partnernes fornavn + lag-total. 1.-plass får `ConfettiBurst` som auto-fyrer på første mount per browser-sesjon (sessionStorage-key `torny-par-stableford-podium-confetti-seen-${gameId}` — distinkt fra solo-key for å unngå krysstinta state). Resten av lagene (rank 4+) ligger i collapsed `<details>` under podiet. Skalerer ned ved <3 lag (1 lag → kun midten; 2 lag → midten + venstre). 16 nye tester dekker podium-trinn, partnernavn, konfetti-key-isolasjon (både separat fra solo og at samme team-key skipper re-burst), champagne-accent, rest-listen, skalerings-grenene og fallback-tilstander.

#### Changed
- `app/games/[id]/leaderboard/page.tsx` — `renderStableford`-routeren håndterer nå begge variantene av `StablefordResult`. Tidligere `notFound()`-fallback for `variant === 'team'` (Phase 1-midlertidig kode) er erstattet med en variant-router som velger `TeamStablefordView`/`TeamStablefordPodium` for team-spill og `SoloStablefordView`/`SoloStablefordPodium` for solo. State4-flippen (finished vs live) er identisk på begge: finished → podium med konfetti, alt annet → flat live-leaderboard.
- `renderStableford`-opts-typen utvidet med `team_number: number` på player-radene, og ScoringContext-en sender `teamNumber` til scoring-motoren når `mode_config.team_size === 2` (gjenbrukes for lag-gruppering i `computeTeam()`). Solo-spill får fortsatt `teamNumber: null` siden scoring-laget ignorerer feltet på solo-grenen.

#### Notes
- Spillerinfo (`playersById` med `{ name, nickname }` per userId) gjenbrukes fra solo-flyten — ingen ekstra DB-roundtrips. `getGameWithPlayers` cachen leverer alt teamdata + user-meta i ett kall.
- Mode-aware mail-utvidelse (gameFinishedNotification med par-stableford-copy) kommer i Phase 4 — utvidelsen her er rent UI på leaderboard-flaten.

</details>

### [1.11.0] - 2026-05-24

> Du kan nå opprette par-stableford-turneringer (fyrball / 4BBB). Velg Stableford som modus, så Par som lagstørrelse — admin tilordner 2/4/6/8 spillere til lag à 2.

<details>
<summary>Teknisk</summary>

#### Added
- `app/admin/games/new/GameForm.test.tsx` — 7 nye tester for par-stableford-flyten: hidden input `stableford_team_size`, lag-grid-synlighet, «Trekk tilfeldig»-knapp er skjult for par-stableford, publish-validitet for 4 spillere på 2 lag, blokkering ved odd count, blokkering ved ujevn lag-fordeling, og at flight-seksjonen ikke rendres.

#### Changed
- `app/admin/games/new/TeamSizeSelector.tsx` — `ENABLED_COMBOS.stableford` utvidet fra `{1}` til `{1, 2}` så Par-tile er aktiv for stableford. 4-mann er fortsatt grayed-out.
- `app/admin/games/new/GameForm.tsx` — tre nye narrowing-flags (`isSolo`, `isBestBall`, `isParStableford`) styrer mode-spesifikke grener av validering, lag-grid-synlighet, og copy. Par-stableford-spesifikke endringer:
  - Lag-grid renderes så snart admin har valgt ≥2 spillere (i motsetning til best-balls 8-krav). Helper-tekst: «Inntil 4 lag à 2 spillere. Hvert lag må ha enten 0 eller 2 spillere. Tomme lag publiseres ikke.»
  - Publish-validering krever ≥2 spillere, partall antall, alle tilordnet et lag, og hvert ikke-tomt lag à 2.
  - `missingForPublish` melder «partall antall spillere» eller «lag-fordeling (par à 2)» med mode-presis copy.
  - «Trekk tilfeldig»-knappen er kun synlig for best-ball (par-stableford har variabelt antall spillere — admin tilordner manuelt i fase 2). «Tøm lag» vises hvis det er noe å tømme.
  - Flight-seksjonen skipper helt; payloaden setter `flight_number = team_number` automatisk via `orderedPayload`.
  - Per-spiller-tee-seksjonen (M/D/J) gjenbrukes fra solo-flyten siden flight-seksjonen ikke rendres.
  - Hidden input `stableford_team_size` (verdi `'1'` eller `'2'`) sendes når mode = stableford slik at `validateStableford`-routeren i `lib/games/gamePayload.ts` velger riktig validator-gren.
- `app/admin/games/new/TeamSizeSelector.test.tsx` — eksisterende «Solo aktiv, Par disabled»-test oppdatert til «Solo + Par aktiv, 4-mann disabled». To nye tester: caller `onChange(2)` ved Par-klikk, og 4-mann-klikk ignoreres.

#### Notes
- Scoring-motor + payload-validator landet i Phase 1 (PR #151) — denne fasen aktiverer kun UI-flyten. Lag-leaderboard + team-podium kommer i Phase 3; mail-tekster + admin/games-detalj-polish kommer i Phase 4 av epic #43.
- Drag-tilfeldig-knappen for par-stableford ble bevisst utelatt fra Phase 2 for å holde scope strammere — kan generaliseres til 2/4/6/8 spillere i en senere fase hvis det blir vondt UX.

</details>

</details>

---

<details>
<summary><strong>1.10.y — Stableford spillerflyt (6 oppføringer) — klikk for å vise</strong></summary>

## 1.10.y — Stableford spillerflyt

Stableford-turneringer er nå spillbare end-to-end. Scorecard viser per-hull-poeng ved siden av netto-scoren, leaderboard rangerer spillerne på total stableford-poeng, og når runden avsluttes feires topp 3 med et eget podium — vinnerne får i tillegg en mail som forteller dem hvor de endte.

### [1.10.5] - 2026-05-23

> «Du trenger 8 spillere»-banneret i admin-flyten er ikke lenger misvisende for stableford. Når du redigerer et stableford-spill skjules det helt, og når du oppretter et nytt spill nevner det at best ball trenger 8 mens stableford holder med 1.

<details>
<summary>Teknisk</summary>

#### Fixed
- `app/admin/games/[id]/edit/page.tsx` — `PlayerShortageBanner` tar nå `gameMode`-prop og returnerer `null` for `'stableford'` (banner-en er en nudge om total klubb-størrelse i best-ball-kontekst, ikke per-spill-validering). For `best_ball_netto` med < 8 registrerte: copy presisert til «8 registrerte spillere for best ball».
- `app/admin/games/new/page.tsx` — banner-en kan ikke vite hvilken modus admin lander på (mode-velgeren ligger i form-en under), så copy-en er omskrevet til mode-nøytral: «Du har bare X registrerte spillere. Best ball trenger 8 — stableford holder med 1. Inviter flere fra Spillere-siden.» Singular/plural-bøying av «registrert{e}» og «spiller{e}» basert på `players.length`.

</details>

### [1.10.4] - 2026-05-23

> Bane-listen i admin viser nå datoen i samme korte format som resten av appen — «14. mai» i stedet for «14. mai 2026».

<details>
<summary>Teknisk</summary>

#### Changed
- `app/admin/courses/page.tsx` — bytter `formatShortDateNbWithYear` → `formatShortDateNb` for «Lagt til {dato}»-linjen i bane-listen. Året er sjelden informativ for inneværende sesong; konsistent med player-flater (f.eks. `app/profile/historikk/page.tsx`). `formatShortDateNbWithYear` beholdes for kontekster der året er meningsfullt (slett-confirmation, spiller-profil).

</details>

### [1.10.3] - 2026-05-23

> Når du åpner et stableford-spill i admin, ser du ikke lenger en tom «Lag»-seksjon eller Lag/Flight-kolonner i spillerlisten. De vises bare for spill som faktisk har lag.

<details>
<summary>Teknisk</summary>

#### Fixed
- `app/admin/games/[id]/page.tsx` — `<SectionCard ribbon="Lag">` skjules for `game_mode === 'stableford'` (alle `team_number`/`flight_number` er null for solo). Spillere-tabellen dropper Lag- og Flight-kolonnene under samme betingelse.

</details>

### [1.10.2] - 2026-05-23

> Admin-listen viser nå modus per spill, og resten av admin-flyten er forfinet for å støtte stableford-spill side om side med best-ball. Side-tournaments fungerer uendret for begge moduser.

<details>
<summary>Teknisk</summary>

#### Added
- `components/ui/ModeChip.tsx` (+ test) — subtil chip for spillmodus per spill-rad i admin-flater. Bevisst lavmælt sammenlignet med `StatusChip` (border + transparent bg, ikke uppercase) siden modus er permanent metadata, ikke en lifecycle-state som krever oppmerksomhet.
- `MODE_LABELS` i `lib/scoring/modes/types.ts` — single source of truth for norske visnings-labels per modus («Best ball» / «Stableford»). Brukes både av `ModeChip` og av admin/games/[id]-detalj-siden («Spillform»-raden i Format-cardet).
- Norske copy-strenger for fire mode-relaterte error-koder (`mode_required`, `unsupported_mode_size_combo`, `min_players_for_mode`, `mode_locked_after_publish`) i `ERROR_MESSAGES_NEW_GAME`. Manglet før, så admin fikk en tom Banner når payload-validatoren trigget dem.

#### Changed
- `app/admin/games/page.tsx` — ledger-raden viser ny `ModeChip` under meta-linjen så admin har et raskt overblikk over hvilket format hvert spill er konfigurert for. `game_mode` plukkes med i SELECT-listen.
- `app/admin/games/[id]/page.tsx` — header-en har ny `ModeChip` ved siden av `StatusChip`, og «Best ball netto»-strengen fra subtittelen er fjernet (den hardkodet en eneste modus). Format-cardets «Spillform»-rad bruker `MODE_LABELS[game.game_mode]` slik at stableford-spill viser «Stableford» i stedet for «Best ball netto».

#### Notes
- Side-tournament-flyten (`avslutt/page.tsx` + `SideWinnersForm.tsx`) er allerede flat-spiller-basert og fungerer for solo uendret — ingen kode-endring nødvendig. `endGameWithSideWinners` håndterer alle moduser via mode-aware mail-bygging fra fase 6.

</details>

### [1.10.1] - 2026-05-23

> Når en stableford-turnering avsluttes ser spillerne nå et topp 3 podium med 1.-plassen feiret med konfetti. Hele rangeringen ligger ett klikk unna under podiet. Vinnerne får tilpasset «Resultatet er klart»-mail med sin egen plassering og poeng.

<details>
<summary>Teknisk</summary>

#### Added
- `app/games/[id]/leaderboard/SoloStablefordPodium.tsx` (+ test) — ny reveal-view for `game.status === 'finished'` på stableford-spill. 3-trinns podium med 1.-plass i midten på høyeste trinn (champagne `Medallion` + champagne-tinted Card), 2.-plass venstre (sølv-Medallion + dempet ring), 3.-plass høyre (bronse-Medallion + `border-warning/40`). 1.-plassen får `ConfettiBurst` (gjenbrukt fra `State4View`) som auto-fyrer på første mount per browser-sesjon (sessionStorage-key `torny-stableford-podium-confetti-seen-${gameId}`). Layout skalerer ned ved <3 spillere (1 spiller → kun midten; 2 spillere → midten + venstre).
- `lib/mail/gameFinishedRecipients.ts` (+ test) — ny helper som bygger mottakerlisten for «Resultatet er klart»-mail-blasten. For stableford fetcher den scores + course_holes + course_handicap, kjører `computeLeaderboard` mode-router, og legger per-spiller rank/totalPoints/totalPlayers på hver mottaker. For best-ball returnerer den kun email+name (default nøytral mail-copy).
- `lib/mail/gameFinishedNotification.test.ts` — snapshot-style tester for HTML+text-body i begge moduser, inkl. celebration-tilegg per plassering (1. → «Gratulerer med seieren!», 2/3 → «Solid plassering!», 4+ → nøytral).

#### Changed
- `lib/mail/gameFinishedNotification.ts` — ny `mode`-prop med discriminated union (`{kind:'best_ball_netto'}` eller `{kind:'stableford', rank, totalPoints, totalPlayers}`). Stableford-grenen rendrer en personlig hovedlinje («Du endte på X. plass av N med Y poeng»); udefinert eller best-ball-grenen beholder dagens copy uendret.
- `app/admin/games/[id]/actions.ts` (endGame) + `app/admin/games/[id]/avslutt/actions.ts` (endGameWithSideWinners) — leser nå `game_mode` + `mode_config` + `course_id` fra games-raden og delegerer mottaker-bygging til `buildGameFinishedRecipients`. Mail-loopen passer `mode`-payload videre til mail-helperen.
- `app/games/[id]/leaderboard/page.tsx` — `renderStableford`-grenen velger view per `game.status`: `finished` → `SoloStablefordPodium`, alt annet → `SoloStablefordView` (uendret). Best-ball-grenen er upåvirket.
- `tests/serverActionMocks.ts` — `buildSupabaseMock` får `order` + `limit` som chainable pass-through-er, slik at helpers med sortert SELECT kan testes uten å endre kjøre-tid-koden.

#### Notes
- Side-tournaments for stableford verifiseres i fase 7 (sannsynligvis bare copy-justering). Modus-chip i admin-listen + edge-case-håndtering kommer også i fase 7.
- Confetti respekterer eksisterende `prefers-reduced-motion`-handling via `.confetti-piece { display: none }` i `globals.css` — ingen ekstra reduksjons-logikk trengs.

</details>

### [1.10.0] - 2026-05-23

> Stableford-turneringer er nå spillbare end-to-end. Spillerne taster slag som vanlig, men ser stableford-poeng per hull og en flat leaderboard sortert på totalt poeng.

<details>
<summary>Teknisk</summary>

#### Added
- `app/games/[id]/leaderboard/SoloStablefordView.tsx` (+ test) — ny leaderboard-view for solo-stableford. Flat liste sortert på `totalPoints` (høyest øverst), top-3 får Medallion (gull/sølv/bronse), 4+ får ren rank-disc. Hver rad: spillernavn (via `formatRevealName`), poeng-total i `score-num`, og «N hull spilt»-undertekst. Reuser `LeaderboardBackdrop` (samme fairway-vinje som best-ball state #4) og samme Card-padding/typografi-tokens.
- `app/games/[id]/leaderboard/page.tsx` — `renderStableford`-grenen short-circuiter LeaderboardBody før state #3/#3.5/reveal-active-routingen. Bygger `ScoringContext` fra game + players + holes + scores, kjører `computeLeaderboard` mode-router, og rendrer SoloStablefordView med en `Map<userId, {name, nickname}>`.

#### Changed
- `app/games/[id]/holes/[holeNumber]/page.tsx` — for stableford fetcher server-en i tillegg alle hull-pars/SI + alle av brukerens scorer slik at vi kan summere stableford-poeng server-side (både `myStablefordTotal` og `myStablefordForCurrentHole`). Best-ball-modus dropper de to ekstra queryene. Flight-filteret kollapses til `[me]` når `flight_number` er null (solo).
- `app/games/[id]/holes/[holeNumber]/HoleClient.tsx` — ny `gameMode`-prop styrer to ting: (1) en «Dine poeng: N»-subtittel under headeren (live-oppdatert via server-snapshot + Dexie-delta for current hull), (2) bottom-bar-CTA bytter fra «Lever scorekort» til «Lever ditt scorekort» for solo.
- `components/hole/ScoreCard.tsx` — ny valgfri `stablefordPoints`-prop. Når satt, vises «· N poeng» rett etter «Netto X» på samme helper-tekst-linje. Skjules sammen med netto-info når `hideNetto` er true (reveal-active). Alle eksisterende callsites er upåvirket (prop er null som default).
- `app/games/[id]/submit/page.tsx` — TopBar-kicker bytter fra «Lever scorekort» til «Lever ditt scorekort» for solo, og info-Card-en viser «Individuell stableford · CH N» i stedet for «Lag X · Flight Y · CH N» (lag/flight er null for solo).
- `app/games/[id]/page.tsx` — Solo-modus dropper «Lag X · Flight Y»-rad-en og viser i stedet en «Individuell stableford-turnering»-subtittel + CH-only-rad. I scheduled-state-en bytter «DIN FLIGHT»-roster med en ny «DELTAKERE»-roster (`SoloRoster`) som lister alle game-medlemmer.
- `lib/games/getGameWithPlayers.ts` — `GameForHole` utvides med `game_mode` + `mode_config` slik at konsumenter slipper å re-fetche. SELECT-listen oppdatert tilsvarende.

#### Notes
- Reveal-flow for stableford (podium + collapsed rest + completion-mail) er holdt til fase 6 av epic #41. Midt-runde og post-finished bruker samme SoloStablefordView i v1.10.0.
- Side-tournaments (LD/CTP) for stableford verifiseres i fase 7 — sannsynligvis bare copy-justering siden eksisterende UI bruker flat spiller-velger uten lag-kontekst.

</details>

</details>

---

<details>
<summary><strong>1.9.y — Valgbar spillmodus (1 oppføring) — klikk for å vise</strong></summary>

## 1.9.y — Valgbar spillmodus

Tørny er ikke lenger låst til 4 lag à 2 spillere best-ball. Admin-flyten viser nå tydelige modus-tiles for Stableford og Best ball netto, og lagstørrelser som ennå ikke er aktivert vises som «kommer snart» så roadmapen er synlig der den hører hjemme.

### [1.9.0] - 2026-05-23

> Når du oppretter et nytt spill ser du nå et tydelig valg mellom Stableford og Best ball netto. Spillerne plukkes først som en flat liste, og lag-grid-en dukker opp først hvis spillformatet krever lag. Lagstørrelser som ennå ikke er tilgjengelige vises som «kommer snart» så du ser hvor det bærer.

#### Added
- `app/admin/games/new/ModeSelector.tsx` (+ test) — to tiles for spillmodus med inline-SVG-ikoner (stilisert poeng-tavle for Stableford, 2×2-flagg-grid for Best ball netto). ARIA: `<fieldset>` + `role="radiogroup"` + tabbable `role="radio"`-button-er. Aktiv tile får forest border + inset-ring (primary-soft).
- `app/admin/games/new/TeamSizeSelector.tsx` (+ test) — tre tiles (Solo / Par / 4-mann). `ENABLED_COMBOS`-mapping styrer hvilke som er aktive per modus (Stableford → 1, Best ball netto → 2); inaktive vises grayed-out (`opacity-50`) med liten «kommer snart»-tekst over accent-deep. Disabled tiles ignorerer klikk og rapporterer `aria-disabled`.
- `app/admin/games/new/GameForm.test.tsx` (ny) — baseline-component-tests (5 stk) + nye fase-4-tests (5 stk): default mode/size, auto-bytte ved mode-change, hidden inputs i FormData, lock_game_mode-state for edit.

#### Changed
- `app/admin/games/new/GameForm.tsx` — players-first-flow: spiller-toggle setter bare `selectedPlayerIds` (ingen `nextAvailableTeam`-auto-fill lengre). Lag-grid + flights-seksjon rendres kun når `team_size >= 2`. Solo-modus får dedikert «Tee per spiller»-seksjon siden flights-seksjonen ikke gjelder. Counter «X av 8 spillere» bytter til «X spillere valgt» for solo (ingen øvre tak). Hidden inputs sender `game_mode` + `team_size` med i FormData; team/flight-feltene sender tom streng for solo.
- `app/admin/games/[id]/edit/page.tsx` — leser `game_mode` fra DB og pre-fyller form-en. `lock_game_mode` settes for ikke-draft spill så ModeSelector + TeamSizeSelector blir disabled (matcher backend mode-lock-guarden fra 0030).

#### Notes
- Aktive kombinasjoner i v1.9.0: Stableford + Solo (kommer ende-til-ende i v1.10.0) og Best ball netto + Par (dagens, men nå eksplisitt valgt). Par-stableford og 4-mann-stableford forberedes som disabled tiles — ingen DB-migrasjon nødvendig når en kombinasjon aktiveres, bare en mapping-utvidelse i `TeamSizeSelector.ENABLED_COMBOS`.
- Påfølgende fase 5/7 av epic #41 wires spillerflyten (scorecard + leaderboard) for stableford.

</details>

---

<details>
<summary><strong>1.8.y — Mørk modus (12 oppføringer) — klikk for å vise</strong></summary>

## 1.8.y — Mørk modus

Tørny følger nå mobilens mørk-modus-innstilling. Har du iPhonen på Dark Appearance, blir Tørny mørk når du åpner appen — uten at noe annet endrer seg.

### [1.8.12] - 2026-05-23

> Admin-listene over baner og spill har fått en designpass — Sekretariatet-paletten er gjennomført, og oversikten leser nå like premium som resten av appen.

<details>
<summary>Teknisk</summary>

#### Changed
- `app/admin/courses/page.tsx` — empty-state-flaten løftet til samme champagne-medallion-treatment som `admin/games`-listen (bruker `<ChampagneMedallion>` + `<BaneIcon>` + serif-tittel + body-tekst, i stedet for en flat surface-boks med én tekstlinje). BrassRibbon-kicker byttet fra «Baner · protokoll» til «Baner · katalog» — semantisk mer korrekt for en bane-liste (det er ikke en saksprotokoll). Footer-hint endret tilsvarende til «Tap en bane for å redigere katalogen.»
- `app/admin/games/page.tsx` — subtitle-kopi tightened: «X spill · sortert kronologisk» → «X spill · sortert nyeste først» (parallell med `admin/courses` og lettere å lese). Empty-state-kopi endret fra «turneringen» → «runden» / «rundene» (Tørny støtter også hverdagsrunder, ikke bare turneringer — i tråd med headingen «Sett opp ny runde» på `/admin/games/new`).
- `app/admin/games/page.tsx` + `app/admin/courses/page.tsx` — `reveal-up`-animasjons-stagger capped på rad 8 (`Math.min(i, 8)`) så lange listene (opp til 40 rader) ikke drar siste rad ut over ~½ sekund. Matcher `.lb-row`-mønsteret i `globals.css`. Closes [#129](https://github.com/jdlarssen/golf-app/issues/129).

</details>

### [1.8.11] - 2026-05-23

> Leaderboarden etter en ferdigspilt runde har nå en subtil fairway-vinje med flaggstang i bakgrunnen — atmosfære uten å konkurrere med leader-cardet.

<details>
<summary>Teknisk</summary>

#### Added
- `components/illustrations/LeaderboardBackdrop.tsx` — ny inline-SVG-komponent som tegner tre horisont-linjer og en enslig flaggstang med vimpel + ball. Bruker `currentColor` med wrapperens `text-accent` (champagne), opacity 0.07 i lys modus og 0.10 i dark via ny CSS-variabel `--leaderboard-backdrop-opacity`. `preserveAspectRatio="xMidYEnd meet"` forankrer scenen i bunnen av container-en så toppen aldri konkurrerer med leader-cardet. Closes [#27](https://github.com/jdlarssen/golf-app/issues/27).
- `components/illustrations/LeaderboardBackdrop.test.tsx` — smoke-test for ARIA-hidden, posisjon, tint og className-merge.

#### Changed
- `app/games/[id]/leaderboard/State4View.tsx` — `Shell` wrapper-en pakker nå innholdet i en `relative isolate`-container med `LeaderboardBackdrop` som første barn og selve innholdet i en `relative` søsken. Gjelder både chromeless (tab-modus) og standalone-modus.
- `app/globals.css` — ny token `--leaderboard-backdrop-opacity` (0.07 lys / 0.10 dark) styres fra både `prefers-color-scheme: dark`-blokk og `[data-theme='dark']`-blokk.

#### Notes
- SVG ble valgt fremfor raster (`next/image`) fordi vektor skalerer perfekt på alle viewports, `currentColor` gir gratis dark-mode-toning, og inline SVG matcher resten av kodebasen (`components/icons/`). Closes [#36](https://github.com/jdlarssen/golf-app/issues/36) — `next/image`-pipeline er ikke nødvendig for de subtile dekorative bakgrunnene Tørny trenger.
- Backdrop respekterer eksisterende `prefers-reduced-motion`-håndtering uten endring — illustrasjonen er statisk, ingen animasjon å suppressere.

</details>

### [1.8.10] - 2026-05-23

> Profil-utfylling etter første innlogging er pusset opp — passer nå inn i Tørny-stilen sammen med resten av appen, med en varmere velkomst og roligere typografi-rytme.

<details>
<summary>Teknisk</summary>

#### Changed
- `app/complete-profile/page.tsx` — onboarding-overskriften byttet fra generisk `<PageHeader title>` til en flat header med champagne-tonet `Kicker` («Velkommen til Tørny»), Fraunces-serif `h1`, og Inter-body undertittel («Fortell oss litt om deg, så er du klar til å spille.»). Erstatter den gamle «Velkommen! Fyll inn detaljene dine …»-prosaen inni cardet. Submit-knapp-label endret fra «Fullfør profilen» (repeterte tittelen) til «Sett i gang» — action-orientert Tørny-stemme. Form-spacing pustet ut fra `space-y-4` til `space-y-5`. Closes [#128](https://github.com/jdlarssen/golf-app/issues/128).

#### Notes
- Ingen funksjonsendringer: feltene (navn, kallenavn, hcp_index), validering (server-action), redirect-flyten (`/` ved completed, `/login` ved no-session) og error-message-mapping er uendret.
- Bruker etablerte UI-primitives + semantic tokens (`var(--text)`, `var(--muted)`, `var(--accent)`) — dark mode arver gratis fra resten av appen.
- TopBar bevisst utelatt: `/complete-profile` er obligatorisk onboarding-flyt etter første OTP-innlogging, så det er ingen tilbakeknapp å vise.

</details>

### [1.8.9] - 2026-05-23

> Admin-listene over baner og spill bruker nå samme top-bar som resten av appen — konsistent navigasjon på tvers av Tørny.

<details>
<summary>Teknisk</summary>

#### Changed
- `components/ui/TopBar.tsx` — utvidet med `action?: ReactNode`-prop som slotter en node (typisk en `<SmartLink>`-chip) inn på høyre side via `ml-auto`. Kicker forblir absolute-sentrert via `left-1/2 -translate-x-1/2`. Pass `action={null}` for å rendere en usynlig spacer-chip med samme dimensjoner — bevarer effektiv sentrering på filtrerte listevisninger som ellers ville mistet høyre-elementet.
- `app/admin/games/page.tsx` — migrert ad-hoc `flex justify-between`-div til `<TopBar action={...} />`. `filterFinished`-grenen sender `action={null}` (i stedet for v1.8.7s `invisible`-chip), så Resultatprotokoll-oppførselen fra [#113](https://github.com/jdlarssen/golf-app/issues/113) er bevart: «+ Nytt»-knappen skjult, «Sekretariatet»-kicker fortsatt sentrert.
- `app/admin/courses/page.tsx` — migrert ad-hoc top-bar til `<TopBar action={<SmartLink>+ Ny</SmartLink>} />`. Closes [#127](https://github.com/jdlarssen/golf-app/issues/127).

</details>

### [1.8.7] - 2026-05-23

> To rare UX-flater i admin/games er ryddet: «+ Nytt»-knappen er borte i Resultatprotokoll-arkivet, og sideturnering-toggle kan nå aktiveres uavhengig av lag-status under spill-opprett. Du slipper å scrolle opp-ned for å aktivere sideturnering etter å ha satt opp lag.

<details>
<summary>Teknisk</summary>

#### Changed
- `app/admin/games/page.tsx` — «+ Nytt»-chipsen skjules (via `invisible`-Tailwind-class) i Resultatprotokoll-visningen (`?status=finished`). Beholder layout-slot-en med samme padding så «Sekretariatet»-labelen forblir sentrert mellom BackLink og høyre kant. Closes [#113](https://github.com/jdlarssen/golf-app/issues/113).
- `app/admin/games/new/GameForm.tsx` — fjernet `sideTournamentEligible`-gaten (`distinctTeams >= 2`) og dens bruk på sideturnering-checkboxen. Toggle er nå alltid enable-able så lenge `lockSideTournament` ikke er satt (sistnevnte gjelder spill som allerede er publisert). Help-text «Krever minst 2 lag for å aktiveres» fjernet. LD/CTP-config viser så fort sideturnering er checked. Gaten var redundant siden `lib/games/gamePayload.ts:162-172` allerede krever eksakt 4 lag × 2 spillere ved publish — et publisert Tørny-spill har alltid 4 lag, så «≥2 lag»-sjekken kunne aldri feile. Closes [#115](https://github.com/jdlarssen/golf-app/issues/115).

#### Notes
- Forward-compatible med [#41](https://github.com/jdlarssen/golf-app/issues/41) (variable lagstruktur som epic) — endringene introduserer ingen nye antakelser om lagsantall, kun fjerner en redundant UI-gate. Når #41 lander og hardkoding 4×2 byttes ut med per-modus-validering, vil sideturnering-toggle-en allerede oppføre seg riktig uten gate.

</details>

### [1.8.6] - 2026-05-23

> Tilbake-pilen fra leaderboarden tar deg nå tilbake til Min historikk når du kom fra den listen. Bruker en eksplisitt URL-param i stedet for nettleser-history (som ikke var pålitelig i PWA-modus).

<details>
<summary>Teknisk</summary>

#### Fixed
- `app/profile/historikk/page.tsx` — «Se resultatliste»-lenken peker nå på `/games/${id}/leaderboard?from=/profile/historikk` istedenfor bare `/games/${id}/leaderboard`. Eksplisitt signal til leaderboard-pagen om hvor «Tilbake» skal lande.
- `app/games/[id]/leaderboard/page.tsx` — `SearchParams`-typen utvidet med `from?: string | string[]`. Ny `validateFromParam`-helper validerer at verdien er en relativ sti under en kjent Tørny-prefiks (`/profile/`, `/admin/`, `/games/`, eller root `/`) og rejecterer absolutte URL-er, protokoll-relative URL-er (`//evil.com`), og strenger lengre enn 200 tegn — så `?from=` ikke kan brukes som open-redirect-vektor. Validert verdi vinner over `?return=hole`-fallback.
- Issue [#117](https://github.com/jdlarssen/golf-app/issues/117) lukkes med dette. Tilnærmingen erstatter `document.referrer`-heuristikken som v1.8.3 introduserte og v1.8.4 reverterte (heuristikken brøt i iOS PWA standalone — `document.referrer` settes til appens start_url for hele session-en, så `router.back()`-grenen ble alltid valgt og skapte en ping-pong-loop mellom drilldown og hovedleaderboard).

#### Notes
- Drilldown (`/games/[id]/leaderboard/holes`) propagerer ikke `from` videre — den beholder dagens hardkodede SmartLink → `/games/${id}/leaderboard`. Brukerens navigation-kjede er: historikk → leaderboard (med `from`) → drilldown → leaderboard (med `from` bevart i URL) → historikk. Drilldown-→-back-pilen tar deg tilbake til leaderboarden hvor `from` fortsatt er i URL-en.
- Kun `/profile/historikk` har `?from=` i denne PR-en. Andre entry-points (`/`, `/admin/games`, etc.) beholder dagens oppførsel — kan utvides separat hvis ønskelig.

</details>

### [1.8.5] - 2026-05-23

> Replay-knappen for jubelscenene skjules nå hvis du har «Reduser bevegelse» på i iPhone-innstillinger — så du ikke får en knapp som ikke gjør noe. Konfetti-animasjonen var allerede skjult for brukere med den innstillingen; nå er trigger-knappen det også.

<details>
<summary>Teknisk</summary>

#### Fixed
- `app/games/[id]/leaderboard/State4View.tsx` — `ReplayButton` får ny class `confetti-replay-button`. `app/globals.css` (`@media (prefers-reduced-motion: reduce)`-blokken) skjuler knappen med `visibility: hidden` (bevarer 44×44 layout-slot for å holde header-chromet balansert). Dead-tap-UX-en oppstod fordi `.confetti-piece { display: none }` skjuler selve animasjonen for brukere med reduce-motion, men replay-knappen kom uendret gjennom — tap ga ingen visuell respons.

</details>

### [1.8.4] - 2026-05-23

> Tilbake-pilen fra en ferdigspilt leaderboard går tilbake til spillets hjemside igjen — fikser en loop som kunne oppstå mellom lag-drilldown og hovedturneringen i PWA-modus. Konsekvens: tilbake fra leaderboard lander ikke i Min historikk lenger (re-åpner det som et eget arbeid).

<details>
<summary>Teknisk</summary>

#### Fixed
- Revertert v1.8.3 (`fix(leaderboard): tilbake-nav respekterer historikk`, commit `00bd142`). Endringen byttet leaderboard-chevronen fra `SmartLink` til `HistoryBackLink`. Rotårsak til loopen: i iOS PWA standalone-modus settes `document.referrer` til appens start_url for hele session-en. Det er same-origin med `window.location.origin`, så `HistoryBackLink` traff alltid `router.back()`-grenen istedenfor `router.push(fallbackHref)`. Etter en drilldown→leaderboard-push tok `router.back()` deg tilbake til drilldown — der den hardkodede SmartLink-pushen igjen tok deg til leaderboard. Resultat: ping-pong mellom de to flatene. Drilldown-chevronen ble ikke endret i v1.8.3, så asymmetrien (push på drilldown, back på leaderboard) var grunnstammen i loopen.
- Issue [#117](https://github.com/jdlarssen/golf-app/issues/117) re-åpnes. Den riktige løsningen er sannsynligvis en eksplisitt `?from=`-query-param fra `/profile/historikk` (og lignende entry-points) istedenfor en referrer-heuristikk som ikke kan stole på SPA-navigasjon.

</details>

### [1.8.2] - 2026-05-23

> Knappene rundt scorekortet og leaderboarden roer seg ned — primary-knapper kun for hovedhandlinger, sekundære actions går outline-stil.

<details>
<summary>Teknisk</summary>

#### Changed
- `app/games/[id]/scorecard/page.tsx` — «Tilbake til spillet →»-knappen som vises etter levert scorekort byttet fra `variant="primary"` til `variant="secondary"`. Read-only-oppsummering uten klar hovedhandling skal ikke pushe en CTA med primary-fyll. Mid-round-grenen (knapp «Tilbake til hull N →») beholder primary-stilen siden den faktisk fortsetter pågående runde — den ER skjermens hovedhandling.
- `app/games/[id]/leaderboard/holes/page.tsx` — «Totalt — X hull vunnet — N»-summary-baren under team-drilldown byttet fra `bg-primary text-bg-tint` (heavy forest-fyll) til `border border-border bg-surface text-text`. Bar-en er en read-only oppsummering, ikke en CTA — en stille surface med subtil topp-border og accent-kicker bærer hierarkiet uten å trenge høy-kontrast fyll. `text-accent` på «hull vunnet» dempet til `text-muted` siden accent ikke trenger å bære vekten på en rolig flate.

#### Notes
- Per design-prinsipp: én klar primary action per skjerm. Game-home (finished) beholder «🏆 Se leaderboard →» som primary — det ER post-runde-hovedhandlingen. Summary-tekst og navigasjonsknapper som ikke har én tydelig hovedrolle får outline/quiet-stilen.

</details>

### [1.8.1] - 2026-05-23

> Du kan nå spille av jubelscenene igjen — replay-ikonet over leaderboarden trigger fyrverkeriet på nytt.

<details>
<summary>Teknisk</summary>

#### Fixed
- `app/games/[id]/leaderboard/ConfettiBurst.tsx` — replay-knappen («Spill av») trigget ikke ny burst i prod. Komponenten hadde tidligere et internt `key={trigger}`-mønster der React noen ganger ikke remountet animasjonen rent. Forenklet til en ren mount-engang-komponent; State4View kontrollerer remount via `<ConfettiBurst key={replayKey} />` på utsiden. Garanterer at CSS-animasjonene restarter fra 0%-keyframen hver gang knappen trykkes.

#### Changed
- `app/games/[id]/leaderboard/State4View.tsx` — tekst-pillen «Spill av» erstattet med ikon-knapp (`ReplayIcon`, counterclockwise pil). 44×44px tap-target (iOS HIG), diskret topp-høyre plassering over leaderboarden. `text-muted` resting tint shifts til `text-accent` på hover/focus så gesten føles belønnet. Plasseringen er identisk i begge moduser (chromeless tabs-mode + standalone solo-mode) — knappen sitter til høyre i header eller inline over tittel.
- `components/icons/Icons.tsx` + `index.ts` — ny `ReplayIcon` (24×24 line-icon, currentColor, 1.5 stroke) i Tørny-iconsettet. Counter-clockwise arc fra 9 til 5 med pil-spiss som peker inn i 9 o'clock.

</details>

### [1.8.0] - 2026-05-19

> Tørny støtter nå mørk modus. Har du iPhonen på Dark Appearance (Innstillinger → Skjerm og lysstyrke → Mørk), bytter Tørny automatisk til en mørk klubbhus-natt-palett. Står den på lys eller automatisk, fortsetter appen å se ut som før. Ingen knapp å trykke — appen følger telefonen.

<details>
<summary>Teknisk</summary>

#### Added
- `--surface-strong` token (deep forest i begge moduser, `#1b4332` light / `#1f3b2c` dark) for surfaces som trenger linen/gold-foreground. Dekker Spill-tile i Sekretariatet, kolonnetitler i `/admin/courses` og `/admin/games`, samt avatar-/hull-strip-current/onboarding-banner i hull-flaten — alle 8 sites migrert fra `var(--primary)`-bg (som ble lys sage i dark og gjorde foreground uleslig).

#### Changed
- `app/layout.tsx` — fjernet `data-theme="light"` på `<html>` og endret `colorScheme: "light"` → `"light dark"` i `viewport`-eksport. `globals.css` har siden v1.7.0 både `[data-theme='dark']`-blokk og `@media (prefers-color-scheme: dark)`; med tvangen borte slår sistnevnte inn automatisk basert på OS-preferanse.
- `@custom-variant dark` (lagt til i v1.7.0) gjør at eventuell fremtidig manuell theme-toggle også vil fungere via `data-theme='dark'`-attribute.

#### Notes
- Migrering av hardkodede farger til semantiske tokens ble gjort i v1.7.0 (refactor-PR #111, 22 filer / ~95 LOC). Visual-verifikasjon i dark mode skjedde via preview-deploy av denne PR-en — der oppdaget vi at `var(--primary)`-bg-surfaces ble uleselige i dark (sage primary + lys foreground), derav `--surface-strong`-tokenet.

</details>

</details>

---

<details>
<summary><strong>1.7.y — Spiller-picker for klubbskala (1 oppføring) — klikk for å vise</strong></summary>

Spill-opprett-formen har nå et søkefelt over spiller-listen. Klar for 100+ spillere når kompisgjengen vokser til klubb-størrelse.

### [1.7.0] - 2026-05-19

> Spiller-listen på spill-opprett (og edit) har nå et søkefelt. Skriv inn navn for å filtrere; valgte spillere vises som chips øverst så du ikke mister oversikten i lange lister. Klargjør for klubbskala når kompisgjengen vokser.

<details>
<summary>Teknisk</summary>

#### Added
- Søke-input + chip-row i `GameForm` (`app/admin/games/new/GameForm.tsx`, brukt av både `/admin/games/new` og `/admin/games/[id]/edit`). Substring-match case-insensitive på `name` / `nickname` / `email`. `useMemo` på filtrerte spillere; ingen server-roundtrip og ingen nye deps.
- Valgte spillere vises som klikkbare chips øverst i seksjon 2 (trykk for å fjerne). Filtrerte listen ekskluderer allerede-valgte siden de står som chips — holder listen kort i klubbskala.
- ARIA-label på søkefelt + chip-knapper. Tab-rekkefølge: chips → søk → filtrert liste. Tap-targets ≥44px.

</details>

</details>

---

<details>
<summary><strong>1.6.y — Eksport (1 oppføring) — klikk for å vise</strong></summary>

Du kan nå laste ned resultatet fra ferdigspilte spill som CSV — praktisk for utskrift og deling utenfor appen.

### [1.6.0] - 2026-05-19

> Etter et spill er avsluttet kan du nå laste ned resultatet som CSV-fil — åpnes rett i Numbers, Excel og Google Sheets. Praktisk hvis du vil henge resultatet opp i klubbhuset eller dele med folk uten Tørny-konto.

<details>
<summary>Teknisk</summary>

#### Added
- `app/games/[id]/leaderboard/export/route.ts` — server-route som returnerer `text/csv; charset=utf-8`. UTF-8 BOM + semikolon-separert (norsk Excel-locale) + CRLF line endings. Innholdet er en spill-metadata-blokk (navn, eksport-dato, course par) etterfulgt av leaderboard-tabellen med kolonner for plass, lag, spillere, brutto, netto, mot par og hull spilt. Auth-gated samme mønster som leaderboard-siden (cookie-basert server-client, admin eller deltaker i spillet). Begrenset til `status='finished'` — andre statuser gir 404.
- «Last ned resultat (CSV)»-knapp på finished-leaderboarden (`State4View.tsx`), under team-listen. Filnavn er ASCII-safe (`torny-{game-id}-{YYYY-MM-DD}.csv`) for å unngå browser-quirks med æøå i `Content-Disposition`.

</details>

</details>

---

<details>
<summary><strong>1.5.y — Klubbstatistikker (3 oppføringer) — klikk for å vise</strong></summary>

Vinnerliste og «mest aktive»-listen fyller seg automatisk fra ferdigspilte spill. Underlag for både kompisgjengen og kommende klubbskala.

### [1.5.2] - 2026-05-19

> Datoer vises nå konsistent på norsk i hele appen. Tee-off-tidspunktet i admin-detalj-visningen brukte en feilstavet locale-kode «no-NO» (en tag som ikke finnes i den internasjonale standarden), og det er nå rettet til «nb-NO». Ingen synlig endring for deg som bruker, men appen står seg bedre på tvers av nettlesere og fremtidige Node-oppgraderinger.

<details>
<summary>Teknisk</summary>

#### Added
- `lib/format/date.ts` — `formatShortDateNb` («14. mai») og `formatShortDateNbWithYear` («14. mai 2026») som single source of truth for nb-NO-kort-dato på tvers av admin-flatene. Hand-rolled måneds-tabell beholdes (matcher tidligere visuelt output uten trailing dot — `Intl`-ens nb-NO `short` ville gitt «mai.»).
- `lib/format/date.test.ts` — 6 unit-tester for nye helpers (dag uten leading zero, måneds-forkortelse, med/uten år, ISO-string vs. Date-input).

#### Fixed
- `app/admin/games/[id]/page.tsx` — locale-tag «no-NO» (ikke en gyldig BCP 47-tag) endret til «nb-NO» for `Intl.DateTimeFormat`-rendering av tee-off-tidspunkt.
- 7 admin-filer (`app/admin/page.tsx`, `app/admin/courses/page.tsx`, `app/admin/games/page.tsx`, `app/admin/games/[id]/page.tsx`, `app/admin/games/[id]/slett/page.tsx`, `app/admin/spillere/[id]/page.tsx`, `app/admin/spillere/_components/PendingInvitations.tsx`) hadde duplisert lokal `MONTHS_NB`-tabell + `shortNb`-helper — alle henter nå fra `lib/format/date.ts`.

#### Notes
- Interne parse-locales (`en-GB` i `lib/format/teeOff.ts`, `en-US` i `lib/games/gamePayload.ts`, `en-CA` i `app/admin/games/[id]/edit/page.tsx`) er bevart med vilje — de brukes for å ekstraktere stabile numeriske deler / datetime-local input-format, og er ikke bruker-synlige.

</details>

---

### [1.5.1] - 2026-05-19

> Innlogging- og invitasjons-formene har nå en usynlig honeypot mot bot-trafikk. Du som ekte bruker merker ingenting; bot-er som spammer skjemaet får et stilltiende «ok» uten at appen faktisk sender mail eller oppretter invitasjoner.

<details>
<summary>Teknisk</summary>

#### Added
- Honeypot-felt (`name="website"`, hidden + tabIndex=-1 + autoComplete=off) på `app/(auth)/login/_components/SendCodeForm.tsx` (OTP-request-fasen) og `app/admin/spillere/_components/InviteForm.tsx`. Server-actions silent-rejecter når feltet er fylt: logger til Vercel via `console.warn('[honeypot] silent reject', ...)` uten å kalle Supabase signInWithOtp eller inserte i `invitations`.
- Unit-tester som verifiserer silent-reject-pathen for begge skjemaene (`app/(auth)/login/actions.test.ts` + `app/admin/spillere/actions.test.ts`).

</details>

---

### [1.5.0] - 2026-05-18

> Ny side: Klubbstatistikker. Se hvem som har vunnet flest spill og hvem som har vært med på flest spill — toppen markert med champagne-gull. Lenken ligger på profil-siden din.

<details>
<summary>Teknisk</summary>

#### Added
- `app/profile/statistikk/page.tsx` — server-component med to seksjoner (Vinnerliste, Mest aktive). Aggregerer fra `games` × `game_players` × `users`-joins; teller kun `status='finished'`. Top-10 pr. seksjon.
- Vinner-beregning gjenbruker `computeLeaderboard` fra `lib/leaderboard.ts` (som internt bruker `bestBallForHole` + `rankTeams` fra `lib/scoring/`). Alle lag med `rank === 1` regnes som vinnere, så delt 1.-plass krediteres begge lag.
- Lenke fra `app/profile/page.tsx` til den nye siden, plassert i samme «Historikk»-cluster som «Min historikk».

#### Notes
- Bulk-fetch i fire round-trips (games, game_players, course_holes, scores) + in-memory aggregering. Skalerer fint for nåværende volum (<1000 finished games); kan flyttes til en SQL-view ved klubbskala.

</details>

</details>

---

<details>
<summary><strong>1.4.y — Multi-rating tee-bokser (3 oppføringer) — klikk for å vise</strong></summary>

## 1.4.y — Multi-rating tee-bokser

Hver fysisk tee legges nå inn én gang med valgfrie ratings pr. gender (Herrer / Damer / Junior). Lettere dataentry, og du kan fylle ut manglende ratings senere uten å re-opprette tees.

### [1.4.2] - 2026-05-18

> Når du går videre til neste hull eller bakover, fader innholdet kort inn istedenfor å bare poppe på plass. Liten polish, men gjør hull-byttet mykere.

<details>
<summary>Teknisk</summary>

#### Changed
- Subtle fade-inn (180ms, ease-out) på hovedinnholdet i `app/games/[id]/holes/[holeNumber]/page.tsx`. CSS-keyframe i `app/globals.css`. Respekterer `prefers-reduced-motion`.

</details>

---

### [1.4.1] - 2026-05-18

> Bane-redigering lagrer nå alle tee-bokser du har lagt inn. Tidligere mistet du tee 6 og 7 hvis du fylte ut mer enn fem rader.

<details>
<summary>Teknisk</summary>

#### Fixed
- `app/admin/courses/new/actions.ts` og `app/admin/courses/[id]/edit/actions.ts` looper nå over `MAX_TEE_BOXES` (importert fra `components/CourseForm`), ikke hardkodet `5`. Tees i posisjon 6 og 7 ble silently dropped fordi server-actionene aldri leste dem fra formData.

</details>

---

### [1.4.0] - 2026-05-17

> Tee-bokser kan nå ha rating for flere kjønn på samme rad — så du legger inn «Gul» én gang med slope/CR for Herrer og Damer, ikke to ganger. Spill-formen er forenklet til én tee-dropdown med M/D/J-toggle pr. spiller. Du kan også fylle ut manglende ratings på eksisterende tees i etterkant.

<details>
<summary>Teknisk</summary>

#### Added
- Migrasjon `0029_tee_box_multi_rating.sql` — `tee_boxes` får ni nye nullable rating-kolonner (`slope_${gender}`, `course_rating_${gender}`, `par_total_${gender}` for mens/ladies/juniors) + CHECK at minst én komplett gender-sett må være satt. `game_players` får `tee_gender` enum (`mens`/`ladies`/`juniors`), default `mens`.
- `lib/games/teeRating.ts` — pure helper `getRatingForGender(tee, gender)` som returnerer `{slope, courseRating, par}` eller `null`. 4 unit-tester.
- `tee_missing_rating`-feilmelding for tilfeller der spillerens tee_gender mangler rating på den valgte teen ved publish.
- M/D/J-toggle pr. spiller i `GameForm` (alltid synlig, default M).
- Tre rating-undersjons-kort pr. tee i `CourseForm` (Herrer / Damer / Junior, hver med slope/CR/par).
- Visning av alle tilgjengelige ratings på `/admin/games/[id]`.

#### Changed
- `tee_boxes` migrerer eksisterende data: én-rad-pr-(tee × gender) → én-rad-pr-tee med riktig gender-kolonneset utfylt. Ingen merging av variant-rader (admin rydder manuelt om ønsket).
- `game_players` migrerer: `tee_box_id` (per-tee override fra v1.3.0) → `tee_gender` flag basert på den teens gender.
- Course handicap freezes ved publish bruker nå `getRatingForGender(game.tee_box, player.tee_gender)`. Begge start-paths (`startGame` + `startScheduledGame`).
- `GameForm` har én tee-dropdown (ikke to). Tee-options viser hvilke gender-ratings som er tilgjengelige som badge: `Gul (herre · dame)`.
- `getGameWithPlayers` cache henter nå multi-rating-felter på teen og `tee_gender` pr. spiller.
- «Du spiller fra»-banner på scorekortet bruker `me.tee_gender` for å derive riktig rating fra teens multi-rating-felter.

#### Removed
- `tee_boxes.slope`, `tee_boxes.course_rating`, `tee_boxes.par_total`, `tee_boxes.gender` kolonner — erstattet av per-gender kolonneset.
- `tee_box_gender` enum — ikke lenger brukt.
- `game_players.tee_box_id` — erstattet av `tee_gender`.
- `lib/games/teeResolution.ts` + tester — helper overflødig i den nye modellen.
- «For hvem»-segmented control i `CourseForm` — multi-rating-modellen gjør den unødvendig.
- «Tee for damer»-dropdown i `GameForm` — én tee-dropdown nå.

</details>

</details>

---

<details>
<summary><strong>1.3.y — Mixed-gender tee-bokser (1 oppføring) — klikk for å vise</strong></summary>

## 1.3.y — Mixed-gender tee-bokser

Herrer og damer kan nå spille fra ulike tees i samme runde med korrekt course handicap. Tee-bokser tagges med kjønn (herre/dame/junior) i bane-admin, og spill-formen får en valgfri dame-tee + M/D-toggle pr. spiller.

### [1.3.0] - 2026-05-17

> Du kan nå arrangere spill der herrer og damer spiller fra ulike tees i samme runde — alle får riktig course handicap. Tee-bokser tagges med kjønn i bane-admin, og du kan redigere baner selv om det er ferdigspilte spill på dem.

#### Added
- Migrasjon `0028_tee_box_gender.sql` — `tee_box_gender` enum (`mens`/`ladies`/`juniors`) + `tee_boxes.gender` (NOT NULL, default `'mens'`) + `game_players.tee_box_id` (nullable per-player override)
- «For hvem»-segmented control (Herrer / Damer / Junior) pr. tee-rad i bane-formen (`CourseForm.tsx`)
- «Tee for damer»-dropdown i `GameForm` (valgfri; tom = ingen separat dame-tee, alle spillere på herre-tee)
- M/D-toggle pr. spiller i game-formen — synlig kun når dame-tee er valgt; default M
- `lib/games/teeResolution.ts` med pure helper `resolvePlayerTeeId(gender, ladiesTeeId)` + 3 unit-tester
- «Du spiller fra»-banner øverst på `/games/[id]/scorecard` med tee-navn, kjønn-merkelapp og slope/CR
- Begge tees vises på `/admin/games/[id]` når et spill har per-spiller tee-override
- Ny error-kode `bad_ladies_tee` i `lib/admin/gameErrorMessages.ts` for invalid dame-tee i game-form

#### Changed
- Bane-edit (`courses/[id]/edit/actions.ts`) bruker nå diff-basert tee-update i stedet for delete-all + reinsert-all. Editering av slope/CR/navn/gender tillatt uansett om tees er referert av spill — kun sletting blokkeres hvis tee-en er i bruk (sjekker både `games.tee_box_id` og `game_players.tee_box_id`).
- Course handicap freezes ved publish bruker nå spillerens egen tee (`game_players.tee_box_id ?? games.tee_box_id`) i både `startGame` (draft→active) og `startScheduledGame` (scheduled→active).
- Edit-flyten rekonstruerer M/D-state fra `game_players.tee_box_id` — appen husker forrige valg.
- `getGameWithPlayers` joiner nå `tee_boxes` pr. game_player og på selve spillet, så scorekortet kan rendre tee-info uten ekstra round-trip.

#### Notes
- Oppfølger-issue [#92](https://github.com/jdlarssen/golf-app/issues/92) — `users.gender` + `users.level` for auto-default av M/D-toggle.
- Oppfølger-issue [#93](https://github.com/jdlarssen/golf-app/issues/93) — pre-existing bug der tees 6-7 silent droppes i bane-actions (server-loop går bare 0..5).

</details>

---

<details>
<summary><strong>1.2.y — Utvidet sideturnerings-poeng (1 oppføring) — klikk for å vise</strong></summary>

## 1.2.y — Utvidet sideturnerings-poeng

Sideturneringen får 12 nye kategorier og 3 stackbare achievements (Turkey/Solid/Snowman) du kan slå av/på ved spill-opprett. Best netto totalt 18 forblir 10p-grunnpilaren.

### [1.2.0] - 2026-05-16

> Sideturneringen får 12 nye kategorier å spille om — fra «flest birdier» og «konge på par-3» til stackbare achievements som Turkey (3 birdier på rad) og Snowman (lagets felles katastrofe på ett hull). Du velger selv ved spill-opprett hvilke som er aktive.

<details><summary>Teknisk</summary>

#### Added
- Migrasjon `0026_side_tournament_categories` — `games.side_disabled_categories text[]` for per-spill kategori-toggle. CHECK-constraint validerer mot 27 kjente ID-er. Default tomt array (Full pakke).
- `lib/scoring/sideTournamentConfig.ts` — sentralisert poeng-vekter. Tier-vektet slik at best netto 18 (10p) står alene på topp; nye kategorier topper på 4p/2p (Tier 2) eller 2p/1p (Tier 3). Achievements stackbare. Eksporterer `SideCategoryId`, `ALL_CATEGORY_IDS`, `CLASSIC_DISABLED_CATEGORIES`.
- 10 nye vinner-tar-alt-kategorier i `lib/scoring/sideTournament.ts`: `most_birdies`, `most_eagles`, `most_pars`, `best_brutto_18`, `best_brutto_f9`, `best_brutto_b9`, `king_par3`, `king_par5` (alle med team-aggregat + individ-best), `longest_bogey_free_streak` og `lowest_single_hole_brutto` (individ-only).
- 3 stackbare achievements: **Turkey** (3 netto-birdier på rad, +4p per spiller + lag-koord-bonus 4p × N), **Solid** (5 netto-pars+ på rad, +2p / 2p × N), **Snowman** (hele lagets brutto ≥ par+5 på samme hull, −2p).
- `components/admin/SideCategoriesPicker.tsx` — preset-velger («Klassisk», «Full pakke», «Custom») + grupperte per-kategori-toggles. Dual-version-kategorier kobles til én toggle. Default ved spill-opprett er Klassisk for å matche dagens v1.1.x-oppførsel.
- Grupperte sub-headers i `SideTournamentView` (Hovedkonkurranser / Skill og rarity / Moderate / Hull-konkurranser / Achievements / Penalty). Penalty-gruppen for Snowman bruker eksisterende `text-danger`-token (muted brick `#b8463e`).
- Forklaringer på leaderboardet: Turkey/Solid/Snowman-rader har korte regel-undertekster, og et nytt kollapsibelt «ⓘ Slik gis poengene»-panel øverst på sideturnerings-fanen lister alle aktive kategorier med poeng + regel.
- 122 unit-tester + 2 integrasjonstester for team-size N=1 (1v1v1) og N=4 (4v4). 405/405 grønne.

#### Changed
- `SideTournamentInput`-shape utvidet med `coursePars`, `playerScoresPerHole` og `disabledCategories`. Eksisterende tester oppdatert med tomme defaults; ingen logikk-endring i eksisterende kategori-blokker.
- `parseSideTournamentFromFormData` håndterer nå `side_disabled_categories[]` (FormData.getAll-mønster med multi-checkbox-submit) og validerer mot `ALL_CATEGORY_IDS`. Ny error-kode `bad_side_disabled_categories`.
- Leaderboard-loader (`app/games/[id]/leaderboard/page.tsx`) bygger nå ekte `coursePars` fra `course_holes` og `playerScoresPerHole` fra eksisterende `computeLeaderboard`-output i stedet for stub-defaults.
- `SideCategoryAward` utvidet med optional `winnerUserId`, `coordBonus`, `streakStartHole`/`endHole`/`Length` og `score` for å støtte navn-attribusjon og streak-render i UI.

#### Notes
- Regelsettet er team-size-aware (1v1, 2v2, 4v4) klar for [#41](https://github.com/jdlarssen/golf-app/issues/41), men admin-UI lager fortsatt kun 2v2-spill til den epicen lander.
- Manuelle bragder (chip-ins, sand saves, one-putts, wow-shot) er ute av scope — egen leveranse v1.3.x med ny per-hull-UI for registrering.
- Edge-case test-dekning (same-team-tie dedup + mixed-size game team-aggregate) sporet som follow-up i [#90](https://github.com/jdlarssen/golf-app/issues/90).

</details>

</details>

---

<details>
<summary><strong>1.1.y — Sideturnering (11 oppføringer) — klikk for å vise</strong></summary>

## 1.1.y — Sideturnering

Første nye funksjon shipped etter v1.0.0. Lag kan nå konkurrere parallelt med best-ball-netto via en valgfri sideturnering med seks poeng-kategorier.

### [1.1.10] - 2026-05-16

> To admin-flater som tidligere bare hadde en kjedelig «Ingen X ennå»-tekst (invitasjons-køen og spill-lista) får nå en medaljong + ikon + et lite hint om hva som skjer videre, så de føler seg som invitasjoner heller enn glemte tomstader.

<details>
<summary>Teknisk</summary>

#### Changed
- `app/admin/spillere/_components/PendingInvitations.tsx` — empty state bruker nå `ChampagneMedallion size={64}` med `MailEnvelope`-ikon + serif-tittel + hint "Inviter en spiller ovenfor — så dukker vente-køen opp her." Samme palett-mønster som hjem-skjermens "KLUBBHUSET ER ÅPENT"-state.
- `app/admin/games/page.tsx` — empty state har egen variant per filter: `PinFlag` for "Ingen spill ennå" (CTA mot «+ Nytt»), `Laurel` for "Ingen signerte runder ennå" (resultatprotokollen). Medaljong-størrelse 72px så den passer den større page-konteksten.

</details>

### [1.1.9] - 2026-05-16

> Sensitive admin-handlinger (avslutte spill, godkjenne scorekort, gjenåpne spill/scorekort) skrives nå til en intern audit-log med hvem-gjorde-hva og når, så vi har et data-spor å se etter hvis noe ble endret feil.

<details>
<summary>Teknisk</summary>

#### Added
- Migrasjon `0027_admin_audit_log` — `public.admin_audit_log` (id, created_at, actor_user_id FK → users ON DELETE SET NULL, actor_name TEXT NOT NULL snapshot, event_type TEXT, target_type/target_id, payload JSONB). Tre composite-indexer for actor-, event- og target-spørringer. Tabellen er lukket for anon + authenticated; skriv går via service-role admin-client.
- `lib/admin/auditLog.ts` — `logAdminEvent({ actorId, actorName, eventType, targetType, targetId, payload })` skriver via `getAdminClient()`. Fail-soft: console.error ved feil, kaster aldri opp så et transient DB-hikk ikke ruller tilbake en vellykket spill-avslutning. `AdminAuditEventType`-union er single source of truth for hvilke events vi auditerer.
- 4 unit-tester for happy-path, default-felter, error-swallow, og throw-swallow.

#### Changed
- `endGame`, `endGameWithSideWinners`, `adminApproveScorecard`, `reopenScorecard`, `reopenGame` kaller `logAdminEvent` etter den primære DB-write-en lykkes. Hver requireAdmin-helper plukker også `users.name` så snapshot-felten kan settes uten ekstra round-trip.

</details>

### [1.1.8] - 2026-05-16

> Admin-invitasjons-flyten har nå rate-limiting (20 per admin, 30 per IP per minutt), så et bug eller kompromittert konto ikke kan sende ut bursts av invitasjoner og brenne mail-budsjettet.

<details>
<summary>Teknisk</summary>

#### Added
- Migrasjon `0026_admin_action_rate_limit` — tabell `public.admin_action_rate_limit` (fixed-window-teller per bucket) + RPC `consume_admin_rate_limit(p_bucket, p_max, p_window_seconds)` som atomisk inkrementerer og sjekker. SECURITY DEFINER så funksjonen tør kjøre uavhengig av RLS-state; tabellen selv har ingen client-policies.
- `lib/admin/rateLimit.ts` — `consumeAdminInviteRateLimit({ supabase, adminId, ip })` sjekker begge bucketene parallelt. Fail-open ved DB-feil så en transient outage ikke låser den eneste admin-en ute av sin egen invite-flow. `getClientIp()` plukker første verdi i `x-forwarded-for` (Vercel-edge garanterer at den er ekte). 5 unit-tester for happy-path, hver bucket exhausted, RPC-error → fail-open, og custom limits.
- `vitest.config.ts` aliasrer `server-only` til en tom stub så server-only-guarded moduler kan unit-testes.

#### Changed
- `sendInvitation` og `resendInvitation` i `app/admin/spillere/actions.ts` kaller helperen før hver Resend-mail går ut. Ved overskridelse redirectes admin tilbake til `/admin/spillere` med ny `error=rate_limited`-banner.

</details>

### [1.1.7] - 2026-05-16

> Du kan nå bytte mellom netto og brutto på det avsluttede leaderboardet — toggle-en er tydeligere (begge modus synes samtidig, gjeldende er framhevet), og "Total"-tallet på lederkortet oppdaterer seg når du bytter.

<details>
<summary>Teknisk</summary>

#### Fixed
- `app/games/[id]/leaderboard/State4View.tsx` — `LeaderCard` hadde hardkodet "Total netto"-label uavhengig av `mode`. Når brukeren bytta til brutto endret dataen seg (lederen, totals, drilldown-link) men label-en sa fortsatt "Total netto" — derav inntrykket av at toggle-en ikke virket. Now: `Total {mode}` følger gjeldende modus.

#### Changed
- `ModeChip` (samme fil) er løftet fra subtil "Bytt til X"-chip til en tab-stil toggle med begge moduser synlige samtidig — speiler state #3.5 sin `ModeToggle`-pattern så brutto/netto-affordansen leses likt uansett om runden pågår eller er ferdig. Sized down (28px min-height vs. 36px) så den ikke konkurrerer med leder-kortet visuelt.

</details>

### [1.1.6] - 2026-05-16

> Du ser nå netto-tallet ditt per hull på scorekort-oversikten — også mens runden pågår, ikke bare etter at spillet er avsluttet.

<details>
<summary>Teknisk</summary>

#### Changed
- `app/games/[id]/scorecard/page.tsx` — Netto-kolonnen gates nå på `!shouldHideNetto(state)` i stedet for `state === 'reveal-finished'`. Reveal-active er fortsatt den eneste tilstanden som skjuler netto (climax-bevaring); live-always og reveal-finished surfacer den begge nå.

</details>

### [1.1.5] - 2026-05-16

> Når tee-off-tiden passerer og runden starter automatisk, kommer du nå rett inn på hull-skjermen — uten å bli sendt tilbake til startskjermen først.

<details>
<summary>Teknisk</summary>

#### Fixed
- `app/games/[id]/page.tsx` — auto-start-fallback (server-component-path som flipper `games.status` fra `scheduled` til `active` når en spiller laster siden etter at tee-off har passert) inviderer nå `getGameWithPlayers`-cachen via `after(() => revalidateTag(\`game-\${id}\`, { expire: 0 }))`. Uten dette ville hull-page-en kunne servere pre-flip-snapshot (status='scheduled') og redirecte spilleren tilbake til game-home i opptil 15 min revalidate-vinduet. `revalidateTag` kan ikke kalles direkte under render — derav `after()` fra `next/server` som deferrer kallet til post-render. `{ expire: 0 }` forsterker til umiddelbar invalidering (vs. stale-while-revalidate som ville kostet én ekstra redirect-bounce). Admin-pathen (`startScheduledGameAction` i server-action-kontekst) var allerede dekket fra #76.

</details>

### [1.1.4] - 2026-05-16

> Du ser nå netto-tallet ditt diskret under navnet på hvert hull, så du slipper å regne i hodet — også som plus-golfer.

<details>
<summary>Teknisk</summary>

#### Changed
- `ScoreCard` helper-tekst viser nå «Netto X» (= score − extraStrokes) når score er satt, i stedet for «Bekreftet». Konsistent for plus-, scratch- og handicap-spillere.
- Helper-slot er tom i reveal-active mode (samme regel som `+N SLAG`-badgen som allerede skjules der).

#### Removed
- Unreachable «Justert · tap igjen for å bekrefte»-grenen i helper-tekst-logikken (rester fra ikke-implementert to-stegs flyt).
- «Bekreftet»-teksten — den dupliserte signalet fra gylden border + sync-pulse-linje.

</details>

### [1.1.3] - 2026-05-16

> Sideturneringen viser nå hvem som er på hvert lag, og du kan klikke på et lag for å se hvilke kategorier som ga poengene deres.

<details><summary>Teknisk</summary>

#### Changed
- `SideTournamentView` refaktorert fra én master-`<details>` (med per-kategori-linjer + hull-grid + LD/CTP-slot-seksjoner) til en liste av per-team-`<details>`-elementer. Hver lag-rad har medal + Lag N + fornavn-rad + total-poeng som summary, og lagets awards listet per kategori som expanded content
- `app/games/[id]/leaderboard/page.tsx` utvider `sideTeams.members` med `firstName` (via `lib/firstName.ts`-helperen) for kompakt visning av spillere-navn

#### Added
- `lib/leaderboard/formatHolesList.ts` — formatterer en hull-liste til kompakt Norwegian-streng (sammenhengende kjeder → range `"10–18"`, spredte → komma `"4, 7, 12"`, blandet kombineres). 8 unit-tester

#### Removed
- `HoleWinGrid`-komponenten (3×6-rutenett over hele runden — kan revurderes i senere iterasjon hvis savnet)
- `CategoryRow`, `SlotsSection`, `collectCategoryWinners` (per-kategori-seksjonen erstattet av per-team-collapse)

</details>

### [1.1.2] - 2026-05-16

> Initialene på scorekortet og hull-leaderboardet bruker nå første bokstav i fornavn og etternavn (f.eks. «Karl Hansen» → «KH»), i stedet for første bokstav i kallenavnet. Spillere med kun fornavn får fortsatt én bokstav.

<details>
<summary>Teknisk</summary>

#### Changed
- `lib/names/initials.ts` (ny) — `nameInitials(name)` returnerer første bokstav i første + siste token, eller én bokstav for one-word-navn. Unicode-safe (Å/Æ/Ø). Faller tilbake til `?` på null/tom input. 9 unit-tester.
- `app/games/[id]/holes/[holeNumber]/page.tsx` — `initial`-prop til `HoleClient` kommer nå fra `nameInitials(name)` i stedet for `firstInitial(nickname ?? name)`. Kallenavn brukes fortsatt som display-navn på kortet.
- `app/games/[id]/leaderboard/holes/page.tsx` — initial-kolonne på hull-leaderboardet bruker `nameInitials(p.name)`. Bredde utvidet fra `w-4` til `w-6` og fontstørrelse justert til 12px så to-bokstavs initialer ikke kuttes.
- `app/games/[id]/page.tsx` — flight-roster og draft-teams-oversikt bruker `nameInitials` for konsistens.
- `components/hole/ScoreCard.tsx` — avatar-fontstørrelse er nå 13px for to-bokstavs initialer, 15px for én. Holder visuell harmoni i den 36×36 sirkelen.

</details>

### [1.1.1] - 2026-05-16

> I reveal-modus ser nå alle deltakere live brutto-leaderboardet på tvers av flights — ikke bare sin egen flight. Netto-rangeringen forblir skjult til admin avslutter spillet, akkurat som før.

<details>
<summary>Teknisk</summary>

#### Fixed
- Migrasjon `0025_reveal_active_scores_visibility` — utvider `scores select gating`-policyen så deltakere i et reveal-modus-spill (`score_visibility='reveal'` + `status='active'`) kan lese alle scores i spillet, ikke bare egen-flight. Avdekket i første pilot-runde 2026-05-14 (SICKlestad) der `RevealBruttoView` viste «18 hull mangler» for andre flightenes lag for ikke-admin-spillere. Live-modus state3.5 (front-9-only) er uendret — climax-hiding der avhenger fortsatt av at back-9-scores er uleselige mid-round.

</details>

### [1.1.0] - 2026-05-14

> Du kan nå legge til en sideturnering i admin-formen. Lag samler poeng fra 6 kategorier — best netto 18, front 9, back 9, hole-wins, longest drive og closest to pin. Resultatet vises i en egen fane på leaderboarden etter at spillet er avsluttet.

<details><summary>Teknisk</summary>

#### Added
- Migrasjon `0024_side_tournament` — `games.side_tournament_enabled`, `games.side_ld_count`, `games.side_ctp_count` (alle med safe defaults) + ny tabell `game_side_winners` med RLS (select kun ved `status=finished`, mutations admin-only).
- `lib/scoring/sideTournament.ts` — `calculateSideTournament`-pure-funksjon med 13 unit-tester. Tie i netto-kategoriene gir alle full pott; hole-win krever alene-vinner. 10p best netto 18, 5p F9 + B9, 2p per hole-win, 2p per LD/CTP-vinner.
- Admin-form-seksjon i `GameForm` med master-toggle + radio-grupper for LD/CTP-antall (0/1/2). Gates på ≥2 lag.
- Ny route `app/admin/games/[id]/avslutt/` med dropdown-wizard for LD/CTP-vinnere. `EndGameButton` redirecter dit conditional på sideturnerings-config.
- Leaderboard-tabs (`LeaderboardTabs`) + `SideTournamentView` med poeng-tabell (medaljer for topp 3) + kollapsibel detalj-seksjon (hole-win-grid 3×6, LD/CTP-vinnere).

#### Changed
- `app/admin/games/[id]/page.tsx` henter nå sideturnerings-config og passerer det til `EndGameButton`.
- `app/games/[id]/leaderboard/page.tsx` henter `game_side_winners` når `status=finished AND side_tournament_enabled`, og bygger `SideTournamentInput` fra eksisterende score-data (gjenbruker `computeLeaderboard` for å unngå dobbel best-ball-beregning).

</details>

</details>

---

<details>
<summary><strong>1.0.x — Første stabile lansering (11 oppføringer) — klikk for å vise</strong></summary>

## 1.0.x — Første stabile lansering

Tørny er nå stabil. Tre funksjoner kobles til v1.0: reveal-modus for kompis-gjenger som vil ha drama under runden, scorekort-former som premium visuell touch, og navne-reveal når spillet er ferdig.

### [1.0.10] - 2026-05-14

> Hjemmesiden hilser deg nå proft uten håndvink-emoji, og kicker-overskriften i toppbar-en (SEKRETARIATET, PROFIL, …) står ekte sentrert i stedet for å lene mot venstre.

<details>
<summary>Teknisk</summary>

#### Changed
- `app/page.tsx` — droppet 👋-emoji fra hilsenen. Tittelen er nå `Hei, {navn}.` — matcher den nøkterne tonen i admin-greetingen (`God morgen, Jørgen.`).
- `components/ui/TopBar.tsx` — kicker er nå `absolute left-1/2 -translate-x-1/2` så den sentreres i viewport uavhengig av BackLink-bredden. Den gamle 80px høyre-spaceren er fjernet — den asymmetrien (32px BackLink vs 80px spacer) gjorde at kickeren lente venstre.

</details>

### [1.0.9] - 2026-05-14

> Hull-for-hull-oversikten viser nå per-spiller vs-par-pille rett ved siden av netto-scoren. TOTALT-kortet har fått mot-par-en flyttet inn ved siden av totalsummen (56 −16) i stedet for som egen linje under.

<details>
<summary>Teknisk</summary>

#### Added
- Per-spiller vs-par-pille (`E`/`+1`/`−1`) i `HoleRow` etter netto-tallet, samme tone-mapping som lag-pillen.

#### Changed
- Totalt-baren i `holes/page.tsx` viser `total + vsPar` inline i samme baseline-flex. «Mot par: X»-linja under er fjernet.
- Legend oppdatert: `initial · brutto · netto · vs par   →   lag`.

</details>

### [1.0.8] - 2026-05-14

> Hull-for-hull-oversikten er ryddet opp: vinner-av-hullet-prikken er borte (skapte mer støy enn verdi), netto-tall står nå tett ved brutto for hver spiller, og helt til høyre står lagets score for hullet med en E/+1/−1-pille — slik at du kan følge progresjonen nedover og se nøyaktig på hvilket hull dere gikk fra E til −1.

<details>
<summary>Teknisk</summary>

#### Changed
- `app/games/[id]/leaderboard/holes/page.tsx` — fjernet winner-of-hull-prikk-kolonnen + tilhørende legend-entry. Per-spiller-rad er nå `initial · brutto-shape · netto` (ingen per-spiller vs-par-pill). Helt til høyre er lagets best-ball-netto + vs-par-pill, sentrert vertikalt over begge spiller-radene. Sparet plass + gir en lesbar high-level «narrative»-kolonne.
- Legend forenklet til `B = brukt netto` + `initial · brutto · netto → lag · vs par`.

</details>

### [1.0.7] - 2026-05-14

> Hull-for-hull-oversikten har fått en helt ny layout: hver spiller har sin egen rad med initial (J, H, …) foran scoren — som på et fysisk scorekort. Bokstaven til den som «vant» netto-en for laget er uthevet. Sparer plass, ingen horisontal scroll selv på smaler iPhone.

<details>
<summary>Teknisk</summary>

#### Changed
- `app/games/[id]/leaderboard/holes/page.tsx` — `HoleRow` er omskrevet fra horisontal grid med to spillere side om side til vertikalt stack: hull-nummer + par på venstre side (spenner over begge spiller-rader), så én rad per spiller med `initial · brutto-shape · netto · vs-par-pill`. Lag-totalen (`teamNet` + pill) er fjernet fra hver rad siden hver spillers netto allerede er synlig — den lavere er det laget brukte. Kontributør markeres med uthevet initial (`font-bold`) i stedet for bakgrunns-fyll. Legend oppdatert til `B = brukt netto` og `initial · brutto · netto · vs par`.
- `HoleTable` mottar nå `teamPlayers: LbPlayer[]` for å mappe `userId → initial`.

</details>

### [1.0.6] - 2026-05-14

> Scorekortet passer nå på normal iPhone — +slag-kolonnen er flyttet til fotnoten som «Slag fått: N» totalt. Du kjenner din egen handicap-fordeling per hull, og kortet trenger ikke gjenta den på hver linje.

<details>
<summary>Teknisk</summary>

#### Changed
- `app/games/[id]/scorecard/page.tsx` — per-rad `+slag`-kolonne fjernet. Total ekstra-slag («Slag fått: N») surfaces i fotnoten via `showHandicapTotal`-flagget (gjelder i live-modus og reveal-finished; skjules i reveal-aktiv). Padding redusert fra `px-4` til `px-3` for å spare bredde. Footer-layout er nå wrap-vennlig flex i stedet for én lang setning.

</details>

### [1.0.5] - 2026-05-14

> Hull-for-hull-leaderboardet er overhalt: hver spiller-celle viser nå både brutto-tall (med form rundt), antall ekstra-slag og netto-tall i ett tydelig stack. «Brukt netto» har fått fargefylt bakgrunn så det er lett å se hvem som vant hullet. Form-strekene er tynnere så trippel- og kvadruppel-former tar mindre plass.

<details>
<summary>Teknisk</summary>

#### Changed
- `app/games/[id]/leaderboard/holes/page.tsx` — hver `pc`-celle er nå et vertikalt stack: ScoreShape med brutto på toppen, og «+slag · netto»-linje under. Kontributør markeres med `bg-accent/12` + `font-bold` (erstatter den lite synlige `font-semibold`-aleinemarkøren). Legend oppdatert til «brutto / +slag · netto».
- `components/scoring/ScoreShape.tsx` — strek-tykkelsen redusert: sm 1.25 → 1.0, md 1.5 → 1.25, lg 2 → 1.5. Gap mellom nestede former redusert: `max(3, stroke+1)` → `max(2, stroke+0.5)`. Trippel- og kvadruppel-former tar nå merkbart mindre plass.

</details>

### [1.0.4] - 2026-05-14

> Leaderboardet oppdaterer seg automatisk når admin trykker «Avslutt spillet» — du slipper å refreshe selv for å se reveal-en.

<details>
<summary>Teknisk</summary>

#### Added
- Migrasjon 0022 — `public.games` lagt til i `supabase_realtime`-publikasjonen
- `PreRoundLeaderboardRealtime` lytter nå på `games` UPDATEs i tillegg til `scores` INSERTs. Når admin avslutter spillet (status flippes til `finished`), trigges `router.refresh()` automatisk og leaderboardet veksler til `State4View` med formatRevealName + confetti.

</details>

### [1.0.3] - 2026-05-14

> Spill-hjem-siden har nå en «Leaderboard»-knapp så du kan se brutto-stillingen mens du venter på at admin avslutter spillet — ikke bare via hull-skjermen.

<details>
<summary>Teknisk</summary>

#### Added
- `app/games/[id]/page.tsx` — `Leaderboard`-SmartLink-card under «Mitt scorekort» når spillet er `active`. Lukker discoverability-gapet etter scorekort-levering: før denne fixen var leaderboardet kun nåbart via hull-skjerm-ikonet, og hull-skjermen redirecter etter levering.

</details>

### [1.0.2] - 2026-05-14

> Live brutto-leaderboardet viser nå hvor langt under/over par hvert lag og hver spiller er — du ser `+3` ved siden av brutto-totalen istedenfor bare det rå tallet.

<details>
<summary>Teknisk</summary>

#### Added
- `RevealBruttoView` viser `E` / `+N` / `−N` delta-mot-par på både lag-total og hver spiller-rad. Par-tellet er kumulativt over spilte hull (teamet: hull der minst én spiller har scoret; spilleren: hull der spilleren selv har scoret).

</details>

### [1.0.1] - 2026-05-14

> Par-scorene står nå på samme kolonne som birdies og bogeys på hull-skjermen — de skjøvet seg litt til venstre fordi de manglet form rundt seg.

<details>
<summary>Teknisk</summary>

#### Fixed
- `components/scoring/ScoreShape.tsx` — `shape='none'`-branchen reserverer nå samme `width`/`height` som de andre formene (`px × px`) og bruker `lineHeight: ${px}px` + `textAlign: center` for vertikal/horisontal sentrering. Par-tall okkuperer dermed samme kolonne-bredde som birdie/bogey-tall side om side.

</details>

### [1.0.0] - 2026-05-14

> Første stabile lansering. Tørny går fra alpha til 1.0 med tre nye funksjoner: reveal-modus skjuler netto-tall under runden og avslører på slutten (perfekt for kompis-gjenger der laget med høyere handicap kan slå brutto-lederen — virkelig spennings-moment når du trykker avslutt), scorekort-former gir birdies en sirkel og bogeys en firkant slik som på papir-scorekort, og når et spill er ferdig vises navnene som «Karl "Knølkis" Jensen» med kallenavnet midt i fullt navn.

<details>
<summary>Teknisk</summary>

Sammenslått leveranse av v0.10.23–v0.10.27 + ingen ytterligere endringer i denne commiten. Se de individuelle oppføringene under for hva hver bump brakte.

Hovedgrep:

#### Added
- Migrasjon 0021 — `games.score_visibility` enum (`live` / `reveal`) med CHECK-constraint og lås ved status=active
- `lib/games/visibility.ts` — `revealState(visibility, status)` + `shouldHideNetto(state)` helpers
- `lib/scoring/scoreShape.ts` — mapper score til form-kategori (sirkel/dobbel/trippel for under-par; firkant/dobbel/trippel/quadruple for over-par)
- `lib/names/formatRevealName.ts` — `Karl "Knølkis" Jensen`-format for finished games
- `components/scoring/ScoreShape.tsx` — SVG-pakker rundt score-tall, brukt på 5 skjermer
- `app/games/[id]/leaderboard/RevealBruttoView.tsx` — live brutto-leaderboard for reveal-mode aktiv (lag-totaler basert på brutto best-ball, ingen handicap-info)
- Admin-UI «Synlighet under runden» i `/admin/games/new` og `/admin/games/[id]/edit` med lås ved status=active
- Hull-skjerm-leaderboard-ikon (pokal) i headeren med `?return=hole&n=N` for retur til riktig hull
- SpecificValueSheet X-knapp som fjerner score helt (skriver null via writeScore)

#### Changed
- Hull-skjerm `ScoreCard` — delta-pillen droppet, erstattet av ScoreShape rundt stortallet. Numeriske størrelser skaleres ned ved nestede former. `+N SLAG`-badge skjult i reveal-aktiv.
- Scorekort-oversikt + lever + approve — Slag-tallene pakket i ScoreShape (size sm), `+slag`-kolonne skjult i reveal-aktiv, ny Netto-kolonne i reveal-finished. HULL-kolonne-header omdøpt til # for å spare plass.
- Hull-leaderboard (`/leaderboard/holes`) — per-hull-tallene i ScoreShape. Reveal-aktiv tvinger brutto-modus uten netto-fargekoding. formatRevealName ved status=finished.
- Hovedleaderboard (`/leaderboard`) — utvidet view-state-machine med `reveal-active` og `reveal-finished` branches. Alle finished-states bruker formatRevealName for spiller-navn.
- SpecificValueSheet — fra 8 til 4 knapper (eagle / birdie / par / X).

#### Removed
- Opprinnelig planlagt per-bruker `display_pref`-toggle ble strøket (erstattet av navne-reveal-mekanikken som er enklere og mer dramatisk).

</details>

</details>

---

<details>
<summary><strong>0.10.x — Resultat-mail og closing-the-loop (28 oppføringer) — klikk for å vise</strong></summary>

## 0.10.x — Resultat-mail og closing-the-loop

Mail begge veier rundt godkjennings-flyten: admin får mail når en spiller leverer, spillere får mail når admin avslutter. Ingen polling av appen for å vite om det er noe nytt å gjøre. Pilot-polish underveis: ærligere feilmeldinger i admin når noe går galt med å lese spillerlisten, og første pass på personvern-siden.

### [0.10.27] - 2026-05-14

> Live brutto-leaderboard for reveal-spill: du ser hvordan lagene ligger an på brutto, men vinneren er fortsatt skjult. Nytt: når et spill er ferdig vises navnene som «Karl "Knølkis" Jensen», med kallenavnet midt i fullt navn som en del av reveal-en. Og du kan nå hoppe direkte til leaderboardet fra hull-skjermen via en liten knapp i toppen.

<details>
<summary>Teknisk</summary>

#### Added
- `RevealBruttoView` for `state === 'reveal-active'` på leaderboard-siden — lag-totaler basert på brutto best-ball med ingen handicap-info
- Hull-skjerm-leaderboard-ikon (pokal) i headeren med `?return=hole&n=N` for return-to-hole
- Leaderboard-side respekterer `?return=hole&n=N`-param for back-knapp i alle view-states

#### Changed
- Leaderboard 'full'-view (State4View) bruker `formatRevealName(name, nickname)` for både leder-kortet og rad-listen, både i live-mode-finished og reveal-mode-finished
- Hull-leaderboard (`/leaderboard/holes`) bruker `formatRevealName` for spillerlinjen når spillet er ferdig (mid-round beholder den kompakte first-name + HCP-formen)

</details>

---

### [0.10.26] - 2026-05-14

> Reveal-modus er nå klar: admin kan velge om netto-tallene skjules under runden og avsløres på slutten. Funker overalt — hull-skjerm, scorekort, leaderboard, godkjenning.

<details>
<summary>Teknisk</summary>

#### Added
- `/admin/games/new` og `/admin/games/[id]/edit` — fieldset «Synlighet under runden» med radio-valg `live` / `reveal`
- Server-action validering på `score_visibility` med lås mot `active`/`finished` status

#### Changed
- Hull-skjerm (`ScoreCard`) — `+N SLAG`-badge skjult når `score_visibility = reveal` og spillet er aktivt
- Scorekort-oversikt — `+slag`-kolonne skjult i reveal-aktiv; ny `Netto`-kolonne i reveal-finished med ScoreShape og netto-totalt-fotnote
- Lever-skjerm + approve-skjerm — samme oppførsel som scorekort-oversikt
- Hull-leaderboard (`/leaderboard/holes`) — tvinger brutto-modus i reveal-aktiv, ingen netto-fargekoding

</details>

---

### [0.10.25] - 2026-05-14

> Scorekort-formene følger nå med over alt der tallene står — scorekort-oversikt, lever-skjerm, godkjenning og hull-leaderboard. Samtidig krymper «HULL»-kolonnen til kun «#» for å frigjøre plass på smale skjermer.

<details>
<summary>Teknisk</summary>

#### Changed
- `app/games/[id]/scorecard/page.tsx` — slag-kolonnen pakker tallene i `ScoreShape` (size `sm`), kolonneoverskrift `HULL` → `#`
- `app/games/[id]/submit/page.tsx` — samme behandling som scorekort-oversikten
- `app/games/[id]/approve/page.tsx` — samme behandling i det utvidbare 18-hulls-kortet
- `app/games/[id]/leaderboard/holes/page.tsx` — per-spiller-grossen i hull-griden pakkes i `ScoreShape` (size `sm`)

#### Notes
- `app/games/[id]/leaderboard/page.tsx` (state #3.5/#4) og `app/profile/historikk/page.tsx` rendrer ikke per-hull-tall, så `ScoreShape` ble bevisst hoppet over der

</details>

---

### [0.10.24] - 2026-05-14

> Tre justeringer på hull-skjermen etter første pilot-test: trippel-sirkel for albatross, dobbeltfirkant utvides til kvadruppel-firkant for blow-up-hull, og spesifikk-score-arket forenkles til kun eagle/birdie/par + X for å fjerne en score helt.

<details>
<summary>Teknisk</summary>

#### Changed
- `lib/scoring/scoreShape.ts` — utvidet shape-mapping: `triple-circle` for albatross (≤−3), `triple-square` for triple bogey, `quadruple-square` for quad bogey eller verre
- `components/scoring/ScoreShape.tsx` — rendrer 3 og 4 nestede former; sentrering fikset (lineHeight matcher shape-høyde, ikke flex)
- `components/hole/ScoreCard.tsx` — `numberFontSize` skalerer ned dynamisk basert på form-kompleksitet og siffer-antall så tallene aldri klipper innerste form
- `components/hole/SpecificValueSheet.tsx` — fra 8 til 4 knapper: eagle/birdie/par + X (fjerner score)

#### Added
- `onClear` callback i `SpecificValueSheet` som skriver `null` til scores via `writeScore`

</details>

---

### [0.10.23] - 2026-05-14

> Score-tallene på hull-skjermen får scorekort-former rundt seg — sirkel for birdies, firkant for bogeys, dobbel for eagle og double bogey.

<details>
<summary>Teknisk</summary>

#### Added
- `lib/games/visibility.ts` — `revealState` og `shouldHideNetto` helpers (foundation for kommende reveal-mode)
- `lib/scoring/scoreShape.ts` — mapper score til shape-kategori
- `lib/names/formatRevealName.ts` — full-format navn for grand-reveal moment
- `components/scoring/ScoreShape.tsx` — SVG-pakker rundt score-tall (sirkel/firkant/dobbel)
- Migrasjon 0021 — `games.score_visibility` enum-kolonne med CHECK-constraint

#### Changed
- `components/hole/ScoreCard.tsx` — delta-pillen ved siden av stortallet er fjernet og erstattet av en SVG-form rundt selve tallet (sirkel for birdie, firkant for bogey, dobbel for eagle/double-bogey)

</details>

---

### [0.10.22] - 2026-05-14

> Tilbake-knappen på personvern-siden returnerer deg nå til siden du kom fra, ikke alltid til hjem-siden.

<details>
<summary>Teknisk</summary>

#### Added

- **`components/ui/HistoryBackLink.tsx`** — client component som bruker `router.back()` når `document.referrer` er same-origin, og faller tilbake til en statisk `fallbackHref` (typisk `/`) når referrer mangler (deep link, bokmerke, eller direkte URL-tasting). Visuelt identisk med `BackLink`.
- **`TopBar` får ny `back?: 'link' | 'history'`-prop** (default `'link'`). `back="history"` bytter chevronen fra ren `<Link>` til `HistoryBackLink`. Egnet for sider som kan nås fra hvor som helst i appen.

#### Changed

- **`/legal/privacy`** bruker nå `back="history"` siden den linkes fra AppVersionFooter på praktisk talt hver side — brukeren skal returnere dit de kom fra, ikke alltid til `/`.

</details>

---

### [0.10.21] - 2026-05-14

> Personvern-siden er nå faktisk lesbar uten å logge inn — tidligere ble du sendt til /login fordi auth-gaten ikke gjorde unntak.

<details>
<summary>Teknisk</summary>

#### Fixed

- **`proxy.ts`-matcheren manglet `legal/`-unntak.** Den globale auth-gate-middleware-en redirecter alle ikke-matchende ruter til `/login?next=...` hvis bruker er uautentisert. `/legal/privacy` (og fremtidige legal-sider) skal være offentlige — særlig viktig for invitéer som skal lese personvern *før* de logger inn. La til `legal/` i matcherens negative-lookahead, parallelt med `login`, `register` og `auth/callback`.

</details>

---

### [0.10.20] - 2026-05-14

> «Personvern» er nå klikkbar fra bunnen av hver side ved siden av versjons-stempelet — også på login-siden, så invitéer kan lese den før de logger inn.

<details>
<summary>Teknisk</summary>

#### Changed

- **`AppVersionFooter`** viser nå `v0.10.20 · Personvern` i stedet for bare versjonsnummer. Lenken peker til `/legal/privacy` med samme muted-styling som footer-en. Bruker plain `<a>` (ikke SmartLink) for å unngå viewport-prefetch av personvern-siden på hver side-visning — link-en klikkes sjeldent og fortjener ikke bundle-cost. Footer rendres av AppShell på de fleste sider; game-i-progress-sider (approve/submit/scorecard) bruker `showVersion={false}` og påvirkes ikke.

</details>

---

### [0.10.19] - 2026-05-14

> Personvern-siden er nå nådbar fra profilen — liten muted-tekst med lenke rett under «Mine data»-seksjonen.

<details>
<summary>Teknisk</summary>

#### Added

- **Personvern-lenke i `/profile/page.tsx`** under GdprSection: «Les hvordan vi behandler og lagrer dataene dine i [personvernerklæringen](/legal/privacy).» Discret muted-text-stil, ingen visuell konkurranse med GDPR-kortene. Siden var allerede live på `/legal/privacy` men kunne ikke nås uten å skrive URL-en direkte — nå har den en faktisk inngang.

</details>

---

### [0.10.18] - 2026-05-14

> Hver side har nå en tydelig overskrift i den sticky top-baren — som «Sekretariatet» gjør på admin-sidene. Tidligere var det bare en chevron der med en tom plass i midten.

<details>
<summary>Teknisk</summary>

#### Changed

- **Kicker lagt til på 8 player-facing sider** i TopBar — fyller den tomme midtre slot'en med en konsekvent uppercase-section-label:
  - `/profile` → «Profil»
  - `/profile/historikk` → «Historikk»
  - `/profile/slett-konto` → «Slett konto»
  - `/legal/privacy` → «Personvern»
  - `/games/[id]` (default) → «Turnering»
  - `/games/[id]/approve` → «Godkjenning»
  - `/games/[id]/scorecard` → «Scorekort»
  - `/games/[id]/submit` → «Lever scorekort»

#### Removed

- **Dupliserte page-titler** fjernet under TopBar siden kicker'en nå bærer samme info: `PageHeader title="Min profil"` på `/profile`, `PageHeader title="Min historikk"` på historikk, `PageHeader title="Godkjenn scorekort"` på approve, `PageHeader title="Mitt scorekort"` på scorecard, `PageHeader title="Gjennomgå før levering"` på submit, `PageHeader title="Personvern"` på legal, og det custom-rendrede «Faresone» + «Slett konto»-block'en på slett-konto.
- **`/games/[id]` beholder PageHeader** med spillets navn — det er ekte sideinnhold (turneringsnavnet), ikke duplikat av kicker'en «Turnering».
- **«N fullførte runder»-subtitle** på historikk-siden er bevart som en liten muted-line rett under TopBar (den bærer faktisk informasjon — telling).

</details>

---

### [0.10.17] - 2026-05-14

> Tilbake-knappen klistrer seg nå til toppen av skjermen på alle lange admin- og profil-sider — du slipper å scrolle helt opp for å komme tilbake.

<details>
<summary>Teknisk</summary>

#### Added

- **`components/ui/TopBar.tsx`** — ny gjenbrukbar komponent som rendrer en sticky-top header med `BackLink` chevron til venstre, valgfri uppercase-kicker (f.eks. «Sekretariatet», «Spill · protokoll») i midten, og en 80 px placeholder til høyre for visuell balanse. Bruker `sticky top-0 z-30 -mx-5 px-5 bg-bg/90 backdrop-blur-sm -mt-8 pt-5 pb-2 mb-4` slik at baren strekker seg ut til AppShell-kantene og scroll-innholdet glir gjennomsiktig under.

#### Changed

- **19 sider migrert** fra inline `<div className="-mt-3 ...">`-wrapper rundt BackLink til `<TopBar />`-komponenten: alle profil-sider, alle legal-sider, alle admin-undersider unntatt de to liste-sidene med `+ Ny`-action-knapp, og fire game-undersider (approve, scorecard, submit, default-state av game-detalj). Sticky header gir også backdrop-blur-effekt så scrolling-innhold ses dempet gjennom baren — iOS-aktig følelse.

#### Skipped (med begrunnelse)

- `app/admin/courses/page.tsx` + `app/admin/games/page.tsx` — list-sider med «+ Ny»-action-knapp i topbar-høyre. Migreres senere når TopBar evt. får støtte for action-slot.
- `app/games/[id]/page.tsx` (scheduled-state) + `app/games/[id]/leaderboard/page.tsx` — bruker en `<header>`-custom-layout med `<Kicker>` i senter; matcher ikke TopBar-mønsteret.
- `app/page.tsx` — hjem-siden bruker `<BrandMark />` i stedet for en tilbake-knapp; ikke aktuelt.

</details>

---

### [0.10.16] - 2026-05-14

> Innloggings-flyten føles nå raskere og mindre forvirrende: «Send kode»-knappen viser «Sender kode …» mens den jobber, og koden logger deg inn automatisk så snart den er fylt inn — du trenger ikke trykke «Logg inn» selv.

<details>
<summary>Teknisk</summary>

#### Fixed

- **Mangler visuell tilbakemelding på «Send meg kode»-knappen.** Klikket ga ingen lokal feedback før Supabase + Resend round-trip (1–2 sek) returnerte. På mobil opplevde brukeren det som at appen ikke registrerte trykket. Skjemaet bytter nå til en sentrert «Sender kode til [email]»-state med spinner mens action'en er i flight (drevet av `useFormStatus().pending`).
- **«Koden er utløpt»-feil ved første forsøk (iOS Safari).** Når Mail.app foreslår OTP-koden over tastaturet og brukeren trykker på forslaget, fylles input'en uten visuell bekreftelse. Brukeren trykket ofte forslaget en gang til, eller trykket «Logg inn» mens iOS samtidig auto-submittet — dobbel-submission konsumerte OTP-en to ganger, og andre forsøk fikk «code expired». Skjemaet auto-submitter nå idet koden er full (8 sifre), og en `useRef`-guard pluss `useFormStatus().pending` blokkerer videre submit-forsøk fra samme komponent — selv om iOS-auto-submission fyrer parallelt.

#### Changed

- **Verify-skjemaet auto-submitter når koden er 8 sifre.** Spilleren trenger ikke trykke «Logg inn» — verken etter manuell tasting eller iOS-auto-fill fra Mail-forslag. Hvis Supabase i fremtiden konfigureres for kortere koder må `OTP_LENGTH`-konstanten i `app/(auth)/login/_components/VerifyCodeForm.tsx` oppdateres.
- **Kode-inputen strippes for ikke-sifre on-the-fly** (mail-malen formaterer koden som «1234 5678», og Safari har av og til vært observert å ta med mellomrommet ved auto-fill).
- **Kode-inputen får `autoFocus`** så virtuell tastatur åpner seg automatisk når man kommer til verify-steget.
- **Begge skjemaer ble flyttet til client components** i `app/(auth)/login/_components/` slik at vi kan bruke `useFormStatus` og `useRef` for pending-state og dobbel-submit-guard. Server-action-importer er uendret.

</details>

---

### [0.10.15] - 2026-05-14

> Du kan nå slette et spill helt uavhengig av status — også aktive spill der ikke alle har levert scorekort, og avsluttede spill. Slettesiden viser sterkere advarsel for aktive spill men blokkerer ikke handlingen.

<details>
<summary>Teknisk</summary>

#### Fixed

- **Fjernet active-blokken fra `/admin/games/[id]/slett`.** Tidligere ble admin sittende fast: `endGame` krever at alle har levert scorekort, men hvis en spiller har droppet midt i runden er det aldri tilfellet — og slett-flyten blokkerte aktive spill med beskjeden «avslutt det først». Slettsiden lar nå handlingen gå gjennom på alle statuser. Bruk-case-en var åpenbar (test-spill, avbrutte runder, etc.).
- **Status-bevisst advarsel** erstatter blokken: `draft` (ingen advarsel), `scheduled` («spillerne får ingen melding om at det er kansellert»), `active` (rød `tone="error"` banner: «slettingen fjerner alle slag som er registrert så langt»), `finished` («leaderboard og resultater forsvinner permanent — spillere som har bokmerket lenken vil få 404»).
- **Knappetekst varierer** med status: «Slett pågående spill for alltid» når status er `active`, ellers «Slett spillet for alltid» — gjør destruktiviteten mer eksplisitt på det mest risikable case'et.
- **Server-action `deleteGame`** mistet sin parallel-blokk. Kommentar dokumenterer hvorfor.

</details>

---

### [0.10.14] - 2026-05-14

> Ny «Installer Tørny som app»-knapp på hjem-siden og i profilen. Du trenger ikke lenger lete etter «Legg til på hjem-skjerm» i Safari-menyen — Tørny tilbyr installasjonen selv.

<details>
<summary>Teknisk</summary>

#### Added

- **Plattform-bevisst install-system** under `lib/pwa/` + `components/pwa/`:
  - `lib/pwa/install-state.ts` — modul-singleton som fanger `beforeinstallprompt`-event'en (Chromium-baserte nettlesere + desktop Edge) tidlig i app-livssyklus så banner/knapp kan trigge native install-dialog senere.
  - `lib/pwa/detect.ts` — SSR-trygge plattform-helpers (`isStandalone`, `isIos`, `isIosSafari`, `isIosNonSafari`).
  - `hooks/useInstallPrompt.ts` — React-hook som returnerer `status` (`loading | standalone | native | ios-safari | ios-other | unsupported`) + `install()`-funksjon. Lytter på `appinstalled`-event for å flippe til standalone-state.
  - `components/pwa/InstallPromptCapture.tsx` — montert i root layout, fanger eventen og lagrer den i singletonen.
  - `components/pwa/InstallInstructionsModal.tsx` — modal med tre varianter: iOS Safari (3 nummerte trinn med Safari-del-ikon SVG), iOS non-Safari («bytt til Safari»), og unsupported (generisk fallback).
  - `components/pwa/InstallBanner.tsx` — banner øverst på `/` med champagne-aksent. Lukker via X (localStorage: `torny-install-banner-dismissed=1`). Skjules hvis allerede installert.
  - `components/pwa/InstallButton.tsx` — permanent kort i `/profile` (over «Mine data») så brukere kan re-summe install-flyten hvis de lukket banneret.
- **Plattform-flyt:**
  - **Android Chrome / desktop Chrome+Edge:** «Installer»-klikk trigger native install-dialog via `beforeinstallprompt.prompt()`.
  - **iOS Safari:** «Installer»-klikk åpner modal med trinn-for-trinn-instruksjoner.
  - **iOS Chrome/Firefox/Edge:** modal forklarer at brukeren må bytte til Safari for å installere.
  - **Allerede installert (standalone-mode):** banner + knapp skjules helt.

#### Removed

- **`components/IosInstallHint.tsx`** — gammelt fixed-bottom-banner som bare dekket iOS Safari med én linje instruksjon. Erstattet av det nye system'et som dekker Android + iOS + desktop og har bedre instruksjoner.

</details>

---

### [0.10.13] - 2026-05-14

> Defensiv sikkerhetsstramming: innloggede brukere kan ikke lenger SELECTe vilkårlige invitasjons-rader fra `public.invitations` — kun sine egne.

<details>
<summary>Teknisk</summary>

#### Fixed

- **`invitations select by token using (true)`-policy droppet** (migrasjon `0020`) og erstattet med en smal policy `using (lower(email) = lower(auth.jwt() ->> 'email'))`. Den gamle policyen lot enhver innlogget bruker lese ALLE invitasjons-rader — app-laget filtrerte på token, men det var ikke RLS-enforced. Med magic-link-flyten retired (v0.4.0) har token-URL-er ikke vært relevant lenger.
- **Audit av kall-sites** før endring: alle `/admin/*`-paths går via `is_admin()`-gated «invitations admin write»-policy (FOR ALL); `app/invite/actions.ts` + `lib/invitations/quota.ts` bruker «invitations select own outgoing» (0008, filtrerer på `invited_by`); `app/profile/export/route.ts` bruker den nye «invitations select own incoming» (filtrerer på `email = auth.jwt()->>email`). Alle dekket.
- **Tester:** 180/180 grønne etter endring.

</details>

---

### [0.10.12] - 2026-05-14

> Ny «Min historikk»-side på profilen lar deg se alle dine fullførte runder med dato, brutto sum og snitt per hull.

<details>
<summary>Teknisk</summary>

#### Added

- **Ny rute `/profile/historikk`** — Server Component som viser brukerens fullførte runder (`games.status = 'finished'`) sortert nyeste først. Per runde: spillnavn, tee-off-dato (norsk format), brutto sum, snitt per hull, og lenke til den spesifikke leaderboarden.
- **Lenke fra `/profile`** — ny «Historikk»-seksjon med en `Card` over «Mine data» med «Se runder»-knapp som peker til `/profile/historikk`.

#### Implementation notes

- **2 round-trips totalt:** først `game_players` med `games!inner`-filter på `status='finished'` for å hente alle relevante spill, deretter ett `scores`-kall med `.in('game_id', gameIds)` + `.eq('user_id', me)` for alle scores samtidig. Aggregering skjer in-process.
- **Empty state:** «Du har ingen fullførte runder ennå. Bli med på et spill først.»
- **Date-fallback:** bruker `scheduled_tee_off_at`, faller tilbake til `ended_at` hvis NULL, dropper rad hvis begge er NULL.

</details>

---

### [0.10.11] - 2026-05-14

> Admin kan nå endre e-postadressen til en registrert spiller, og se sist innlogget + antall spill på spiller-detaljen.

<details>
<summary>Teknisk</summary>

#### Added

- **`users.last_seen_at timestamptz`** — ny kolonne (migrasjon `0019`) med index. Stamps fra `proxy.ts`-middleware på hver autentiserte request, debounced via WHERE-clause så Postgres no-op'er hvis verdien er ferskere enn 30 minutter. Best-effort, fire-and-forget via `void (async () => ...)` — feiler aldri requesten.
- **«Aktivitet»-seksjon på `/admin/spillere/[id]`** — viser «Sist innlogget: {relativeTime}» og «Antall spill: N». Null `last_seen_at` rendres som «Aldri».
- **E-post-felt i edit-formen** på samme side. Validering: må være gyldig e-post-format. Sjekker konflikt mot både `public.users` (via `email_is_registered`-RPC) og `auth.users` (via `email_is_in_auth_users`-RPC fra v0.10.6). Block: nekter å oppdatere hvis spilleren er med i et aktivt spill.

#### Changed

- **E-post-oppdatering går via service-role-klient** (`auth.admin.updateUserById`) først; bare hvis det lykkes oppdateres `public.users.email` i samme transaksjon-pakke. Sikrer at de to tabellene ikke kommer ut av synk ved feil.

</details>

---

### [0.10.10] - 2026-05-14

> Du kan nå slette et spill helt fra admin — nyttig hvis du opprettet noe ved et uhell eller vil rydde opp etter en test.

<details>
<summary>Teknisk</summary>

#### Added

- **Ny rute `/admin/games/[id]/slett`** — dedikert bekreftelses-side (per destruktiv-handling-mønsteret) som viser spillets navn, tee-off, status og hvor mye som blir slettet (game_players, scores, invitasjoner). Block-betingelse: hvis `game.status === 'active'` vises et rødt banner — admin må avslutte spillet først.
- **Server-action `deleteGame`** i `app/admin/games/[id]/slett/actions.ts` — re-sjekker admin + block-betingelsen, deretter `DELETE FROM games` (FK ON DELETE CASCADE rydder game_players, scores og invitasjoner automatisk). På suksess: redirect til `/admin/games?status=deleted&name=<spillet>` med bekreftelses-banner.
- **«Faresone»-seksjon** nederst på `/admin/games/[id]` med rødtonet ramme + lenke til slett-flyten, samme mønster som `/admin/spillere/[id]`.

</details>

---

### [0.10.9] - 2026-05-14

> Admin ser nå om en ventende invitasjon faktisk har bedt om innloggings-kode, så du vet om mailen ble lest eller bare ligger der.

<details>
<summary>Teknisk</summary>

#### Added

- **`invitations.opened_at timestamptz`** — ny kolonne (migrasjon `0018`) som stamps når invitéen ber om en OTP-kode på `/login`. Default NULL.
- **Hook i `sendCode`-actionen** i `app/(auth)/login/actions.ts` — etter `signInWithOtp` lykkes, oppdaterer service-role-klient `invitations.opened_at = now()` for rader med matching `email` (case-insensitive) der `accepted_at IS NULL AND opened_at IS NULL`. Service-role brukes fordi brukeren er pre-auth på dette punktet og RLS ville blokkert. Best-effort: feil logges men blokkerer aldri OTP-sendingen.
- **Admin-indikator i `PendingInvitations.tsx`** — under hver «Venter»-rad: «Har bedt om kode {timeAgo}» i forest-grønn hvis `opened_at IS NOT NULL`, eller «Mail sendt, men ikke åpnet ennå» i muted grå hvis NULL. `timeAgo`-helper gir norsk relativ tid («akkurat nå», «3 min siden», «i går», «5 dager siden»).

</details>

---

### [0.10.8] - 2026-05-14

> To nye GDPR-kontroller på profil-siden: du kan laste ned alt Tørny vet om deg som en JSON-fil, og du kan slette kontoen din selv (med mindre du er med i et pågående spill).

<details>
<summary>Teknisk</summary>

#### Added

- **`/profile/export`** — ny Route Handler (`app/profile/export/route.ts`) som returnerer JSON-fil med dataene Tørny har lagret om innlogget bruker. Krever auth (returnerer 401 ellers). Filnavn `torny-data-YYYY-MM-DD.json`. Eksporten inkluderer brukerens egen `users`-rad, alle `game_players`-rader, scores der `user_id` ELLER `entered_by` matcher (kun deres egne scores — ikke medspillere/motstandere, slik GDPR Article 20 tilsier), og invitasjoner der `email` matcher eller `invited_by` matcher. UI-trigger: «Last ned»-knapp i ny «Mine data»-seksjon nederst på `/profile`.
- **`/profile/slett-konto`** — ny dedikert bekreftelses-side (`app/profile/slett-konto/page.tsx`) per destruktiv-handling-mønsteret. Viser hva som slettes (profil, e-post, turnerings-tilknytninger) og hva som beholdes (scoring-data — tilhører turneringen). Block-betingelse: hvis brukeren har `game_players`-rader i et spill med `status IN ('active', 'scheduled')` vises et rødt banner i stedet for slett-knappen — kontoen kan ikke slettes mens man er med i et pågående eller planlagt spill. Server-action (`app/profile/slett-konto/actions.ts`) re-sjekker block-betingelsen før den kaller `auth.admin.deleteUser(userId)` via service-role-klient. `public.users` cascade-slettes via FK. Bruker redirectes til `/login?melding=konto_slettet` etter slettingen.
- **«Mine data»-seksjon** på `/profile/page.tsx` med to kort (eksport + slett) under «Invitér en venn». Slett-kortet bruker `#a04040`-akcent for å signalisere faresone.

#### Fixed

- **Privacy: eksport-endepunktet returnerer ikke lenger medspillere/motstanderes scores.** Første utkast av export-route returnerte ALLE scores for ALLE spill brukeren var med i — det ville lekket andre spilleres personlige data via GDPR-endepunktet. Strammet `.in('game_id', gameIds)` til `.or('user_id.eq...,entered_by.eq...')` så kun brukerens egne scores eksporteres.

</details>

---

### [0.10.7] - 2026-05-14

> Du kan nå legge til opptil 7 tee-bokser per bane i admin (var 5).

<details>
<summary>Teknisk</summary>

#### Changed

- **`MAX_TEE_BOXES` bumpet fra 5 til 7** i `app/admin/courses/CourseForm.tsx`. Norske baner har ofte 5 farger (hvit, gul, blå, rød, gull) pluss eventuelt championship-tees for herrer og damer — totalt 7 dekker den vanlige normen. Ingen DB-constraints blokkerer (verifisert mot `0001_initial_schema.sql` — `tee_boxes` har bare value-range CHECKs på slope og par_total).

</details>

---

### [0.10.6] - 2026-05-14

> Vennsinvitasjoner blokkeres nå korrekt hvis mottakeren allerede har startet en innlogging hos Tørny, ikke bare hvis de har fullført profilen.

<details>
<summary>Teknisk</summary>

#### Fixed

- **Friend-invite-gate i `app/invite/actions.ts`** sjekket bare `public.users` via `email_is_registered`-RPC-en. Brukere som var igjen i `auth.users` etter den retired magic-link-flyten (uten å fullføre `/complete-profile`) slapp gjennom — invitasjons-mailen ble sendt, og det påfølgende `signInWithOtp`-kallet overskrev deres `user_metadata.inviter_name`. Lagt til ny `email_is_in_auth_users(text)`-RPC som sjekker `auth.users` direkte, og gate-en kjører nå begge RPC-ene parallelt i `Promise.all`. Hvis enten returnerer true, blokkeres invitasjonen med samme «Denne personen er allerede på Tørny»-melding.

#### Added

- **Migrasjon `0017_email_in_auth_users_rpc.sql`** — ny SECURITY DEFINER-funksjon `public.email_is_in_auth_users(email_to_check text)` som returnerer bool. Eksplisitt `search_path = public, auth, pg_catalog` for å unngå search-path-injection. GRANT EXECUTE til anon + authenticated for defensiv symmetri med `email_is_invited`. Applied til prod via Supabase MCP.

</details>

---

### [0.10.5] - 2026-05-14

> Kontakt-lenken på personvern-siden går nå til en faktisk e-postadresse (`personvern@tornygolf.no`) i stedet for en admin-bare side spilleren ikke kunne nå.

<details>
<summary>Teknisk</summary>

#### Fixed

- **Kontakt-seksjonen på `app/legal/privacy/page.tsx`** pekte til `https://tornygolf.no/admin/spillere`, som er auth-gated til admin-brukere. En vanlig spiller som klikket for å utøve GDPR-rettighetene sine endte på en innloggingsvegg de ikke kom forbi. Erstattet med `mailto:personvern@tornygolf.no`. Domeneshop-aliaset må settes opp manuelt for at adressen skal motta mail.

</details>

---

### [0.10.4] - 2026-05-14

> Ny personvern-side på `/legal/privacy` forklarer hvilke data Tørny lagrer om deg, hvor de lagres, og hvilke rettigheter du har.

<details>
<summary>Teknisk</summary>

#### Added

- **Ny rute `app/legal/privacy/page.tsx`** — server-rendret Server Component, ingen auth-gate (offentlig tilgjengelig). Bruker eksisterende `AppShell` + `PageHeader` + `BackLink`-primitives. Norske bokmål-tekst, Fraunces serif for h1/h2 og Inter sans for body. Dekker: (1) hvilke data Tørny lagrer (navn, e-post, kallenavn, handicap, scorekort, invitasjoner), (2) hvor de lagres (Supabase EU/Frankfurt), (3) hvem som ser dem (medspillere ser navn/kallenavn/handicap/resultater, admin ser e-post), (4) hvor lenge (inntil sletting), (5) GDPR-rettigheter (innsyn, retting, sletting, portabilitet), (6) kontakt-info.
- **`export const metadata`** setter `<title>`-tag for siden.

</details>

---

### [0.10.3] - 2026-05-14

> Hvis admin-handlinger feiler på å lese spillerlisten fra databasen, sier banneret nå «Klarte ikke å lese» i stedet for misvisende «Klarte ikke å lagre».

<details>
<summary>Teknisk</summary>

#### Fixed

- **Splittet `db_players`-feilkoden i to.** Tidligere brukte alle databasefeil i admin/games-flyten samme `db_players`-key, så bruker så «Klarte ikke å lagre spillerne. Prøv igjen.» selv når det egentlige problemet var en SELECT-feil på roster. Innført ny `db_roster: 'Klarte ikke å lese spillerlisten fra databasen.'`-key som emit-es fra read-paths i tre server-actions: `app/admin/games/new/actions.ts` (publish-mode roster read), `app/admin/games/[id]/edit/actions.ts` (publish/update_scheduled roster read), og `app/admin/games/[id]/actions.ts` (start-game gamePlayers + roster reads). Write-paths (INSERT/UPDATE/DELETE på `game_players`) beholder `db_players`-meldingen.

#### Changed

- **Konsolidert duplisert `ERROR_MESSAGES` og `buildErrorMessage`-helper.** Tre admin/games-sider (`new/page.tsx`, `[id]/edit/page.tsx`, `[id]/page.tsx`) deklarerte hver sin egen kopi av samme error-message-objekt og helper. Trukket ut til `lib/admin/gameErrorMessages.ts` med to eksporterte map-er: `ERROR_MESSAGES_NEW_GAME` (brukt av new + edit, sier «kan publiseres») og `ERROR_MESSAGES_EXISTING_GAME` (brukt av detail-siden, sier «kan startes»). JSDoc dokumenterer denne kopi-variasjonen så fremtidig refaktor ikke uniformerer den ved et uhell.

</details>

---

### [0.10.2] - 2026-05-13

> SyncBanner viser nå norsk, lesbar forklaring («Mistet nett-tilkoblingen», «Innloggingen er utløpt») i stedet for tekniske Safari-feilmeldinger som «TypeError: Load failed».

<details>
<summary>Teknisk</summary>

#### Changed

- **`SyncBanner` — friendly error-mapping.** Raw `lastError` fra Supabase RPC mappes nå til norsk forklaring spilleren kan forstå og handle på:
  - `Load failed` / `Failed to fetch` / `NetworkError` → «Mistet nett-tilkoblingen»
  - `JWT` / `expired` / `session` / `401` / `unauthorized` → «Innloggingen er utløpt — logg inn på nytt»
  - `permission` / `forbidden` / `row-level` / `403` → «Tillatelse manglet»
  - `rate limit` / `429` / `too many` → «For mange forespørsler — vent litt»
  - Catch-all: «Lagring mislyktes»
- **Banneret går fra to-linjet (heading + raw-error subtext) til én-linjet** («Mistet nett-tilkoblingen. N slag venter.»). Renere på smale skjermer, ingen jargon.
- **Raw error bevares som `title`-attribute** på banner-elementet — admin kan long-press/hover for å se den eksakte underliggende meldingen til feilsøking, men spilleren ser ikke jargon-en før de eksplisitt graver i den.

</details>

---

### [0.10.1] - 2026-05-13

> Du får nå en mail hver gang en spiller leverer scorekortet sitt — du slipper å åpne appen for å sjekke om det er noe å godkjenne.

<details>
<summary>Teknisk</summary>

#### Added

- **`lib/mail/scorecardSubmittedNotification.ts`** — Resend-mail-helper med samme brand-stil som de andre mail-malene. Subject: `Scorekort levert: <playerName> — <gameName>`. CTA-button til `https://tornygolf.no/admin/games/<id>`.
- **`submitScorecard`-action** ([app/games/[id]/submit/actions.ts](app/games/[id]/submit/actions.ts)) fyrer mail til alle admin-brukere etter at submit-update lykkes. Henter submitter's navn + admin-emails i parallell (Promise.all) etter DB-update, filtrer ut submitter selv (slik at en player-admin ikke mailer seg selv), og sender via Promise.allSettled. Feil logges, blokkerer aldri.

#### Changed

- **Initial game-fetch i `submitScorecard`** inkluderer nå `name`-feltet (trengs som mail-subject).

</details>

---

### [0.10.0] - 2026-05-13

> Når du avslutter et spill får alle spillerne automatisk en mail med «Resultatet er klart» og lenke til leaderboard — du trenger ikke lenger sende beskjeden manuelt.

<details>
<summary>Teknisk</summary>

#### Added

- **`lib/mail/gameFinishedNotification.ts`** — ny Resend-mail-helper med brand-stilet HTML + plaintext-fallback. Subject: `Resultatet er klart — <gameName>`. Body: «Hei <fornavn>!» + kort hook + grønn CTA-button til `https://tornygolf.no/games/<id>/leaderboard`. Bruker samme palette + struktur som `inviteNotification.ts`.
- **`endGame`-action** ([app/admin/games/[id]/actions.ts](app/admin/games/[id]/actions.ts)) sender nå mail til alle spillere etter status-flippen til `finished`. Henter spillerne sammen med de eksisterende `submitted_at` / `approved_at`-validerings-queriene (én query, ikke to), filtrer på `users.email` ikke-tom, og fyrer `Promise.allSettled` over alle send-kall. Feil logges til Vercel via `console.error` og blokkerer aldri actionen — leaderboard er nådd in-app uavhengig av om mailen kom fram.

#### Changed

- **Initial game-fetch i `endGame`** inkluderer nå `name`-feltet (trengs som subject + body i mailen). Marginal data-overhead, sparer en re-fetch.

</details>

</details>

---

<details>
<summary><strong>0.9.x — Sync-feedback under runden (5 oppføringer) — klikk for å vise</strong></summary>

## 0.9.x — Sync-feedback under runden

Hvis et slag ikke kommer fram til serveren, sier appen ifra. Ny sticky banner viser hvor mange slag som mangler synk, surface'r faktiske feilmeldinger fra Supabase, og lar deg manuelt prøve igjen — i stedet for at sync-køen stille henger i bakgrunnen. Pilot-polish underveis: scorekort wiper ikke lenger settet score hvis du tilfeldigvis trykker på det igjen.

### [0.9.4] - 2026-05-13

> Game-hjem-sidens to gate-queries kjører nå parallelt, og audit av leaderboard/submit/scorecard bekrefter at de allerede gjorde det.

<details>
<summary>Teknisk</summary>

#### Changed

- **`app/games/[id]/page.tsx` — game + me i Promise.all.** Sekvensiell awaits (`game` deretter `me`) er nå én parallel-bølge. Sparer én Supabase round-trip per load. Side-en treffes på app-åpning, fra hjem-tile, fra hver «Hjem»-tap fra hull-pages, og fra leaderboard/submit-tilbakeknappen — ofte. Estimert ~200ms spart per load.
- **Pilot-instrumentering** lagt til samme sted (`game.page game=X · gate`), parallel med hole-page-instrumenteringen.

#### Audit

- **`app/games/[id]/leaderboard/page.tsx`** — allerede parallel (Promise.all på game + profile, deretter Promise.all på players + holes + scores i suspended body). Ingen endring trengs.
- **`app/games/[id]/submit/page.tsx`** — allerede parallel (Promise.all på game + me, deretter Promise.all på holes + scores i suspended body). Ingen endring trengs.
- **`app/games/[id]/scorecard/page.tsx`** — allerede parallel (Promise.all på game + me). Ingen endring trengs.

</details>

---

### [0.9.3] - 2026-05-13

> Hull-bytte er ~60% raskere — server-rundene som tidligere kjørte sekvensielt går nå parallelt, og to av dem er slått sammen til én.

<details>
<summary>Teknisk</summary>

#### Changed

- **Hull-page server-fetch-grafen refaktorert fra 7 sekvensielle awaits til 2 parallel-bølger.** Måling på production via instrumentering fra v0.9.2 viste at hver hull-bytte kostet 1.2–2.1s server-side med median fetch ~150–200ms og outliers opp i 800ms+ (Supabase round-trip-overhead, ikke query-kompleksitet). Nye struktur ([app/games/[id]/holes/[holeNumber]/page.tsx](app/games/[id]/holes/[holeNumber]/page.tsx)):
  - **Runde 1 (Promise.all):** `games`, ALL `game_players` for spillet (med users-join), `scoreCount`. Tre uavhengige queries fyres samtidig — max-tid er den tregeste enkelt-queryen i stedet for summen.
  - **In-memory:** finn `me` blant alle game_players, derive flight ved å filtrere `flight_number === me.flight_number`. Dette fjerner én helt round-trip (tidligere kjørte vi en separat `me`-query, deretter en flight-query med WHERE flight_number=X).
  - **Runde 2 (Promise.all):** `course_holes` for gjeldende hull + `scores` for flight-medlemmer på gjeldende hull. Begge avhenger av runde 1 men er uavhengige av hverandre.
- **Estimert speedup:** fra ~1.5s gjennomsnitt til ~600ms (–60%). Trade-off: allGamePlayers-queryen returnerer 8 rader i stedet for 4 fra den gamle flight-queryen — marginal data-overhead, men én round-trip spart. RLS er upåvirket: brukere ser fortsatt kun det `game_players`-policy-en allerede tillater.
- **Instrumentering oppdatert:** logger nå `round1`, `round2` og total i stedet for syv enkelt-fetches. Verifiserer at parallellisering faktisk skjer i prod.

</details>

---

### [0.9.2] - 2026-05-13

> Skjermlesere identifiserer nå ventende invitéer korrekt i opprett-spill-flyten, og lange e-postadresser dytter ikke lenger «Venter»-pillen ut av synsfeltet.

<details>
<summary>Teknisk</summary>

#### Fixed

- **A11y på `/admin/games/new` spiller-picker.** Checkboxen får nå `aria-label={`${playerLabel(p)}${p.pending ? ' — venter på å fullføre profil' : ''}`}` slik at skjermlesere annonserer status semantisk koblet til raden i stedet for å rapportere «Venter»-pillen som flytende tekst etter check-boxen. Pillen får `aria-hidden="true"` for å unngå dobbel-annonsering.
- **Truncation på `/admin/games/new` spiller-picker label-spannet.** La til `min-w-0 truncate` så patologisk lange e-postadresser (over container-bredde) klippes med ellipsis i stedet for å dytte «Venter»-pillen ut av viewportet på smale skjermer (iPhone SE 320px).

#### Changed

- **Server-side timing instrumentering på hull-siden** ([app/games/[id]/holes/[holeNumber]/page.tsx](app/games/[id]/holes/[holeNumber]/page.tsx)). `console.time/timeEnd` rundt hver av de syv server-side awaitsene (auth, game, me, hole, flight, scores, scoreCount) + en total-wrapper, med label-prefix `hole.page game=X hole=N · <step>`. Loggene fanges av Vercel og kan pulles etter pilot-runden for å bestemme om hull-bytte-latency dominans er på Supabase-runden, RSC-serialisering, eller cold-start. Ingen brukerflate-effekt — kun observasjon. Fjernes (eller gates bak dev-flag) når arkitektur-valget i TODO.md er gjort.

</details>

---

### [0.9.1] - 2026-05-13

> Et score du har justert med + eller − blir ikke lenger nullstilt til par hvis du tilfeldigvis trykker på kortet igjen — og onboarding-banneret beskriver knappene som faktisk finnes.

<details>
<summary>Teknisk</summary>

#### Fixed

- **`ScoreCard.onCardClick` no-op'er når score allerede er satt.** Tidligere kalte tap-på-kort-body alltid `onSetScore(par)` uansett current score, så et tilfeldig touch-event etter at brukeren hadde brukt + / − wipet justeringen tilbake til par. Card-tap er nå en first-entry-snarvei kun: hvis `score == null` setter den par som baseline, ellers er kortet en no-op-flate. +/− og «…» er fortsatt full-spektrum-redigerings-overflater. Ny test (`ScoreCard.test.tsx`) verifiserer at tap når `score` er satt ikke kaller `onSetScore`.
- **Onboarding-banner-copy speiler virkeligheten.** Tidligere tekst: «Klikk det øverste kortet for å sette par. Klikk-og-dra opp eller ned for +1/−1.» — men klikk-og-dra finnes ikke i koden (kun + / − / ⋯-knapper). Ny tekst: «Trykk det øverste kortet for å sette par. Bruk + og − for å justere.»

</details>

---

### [0.9.0] - 2026-05-13

> Hvis et slag ikke kommer fram til serveren, sier appen ifra — og du kan trykke «Prøv igjen» i stedet for å lure på om scoren ble lagret.

<details>
<summary>Teknisk</summary>

#### Added

- **`SyncBanner`-komponent ([components/sync/SyncBanner.tsx](components/sync/SyncBanner.tsx))** mounted i `app/games/[id]/layout.tsx`. Sticky-top på alle game-sider (hull, leaderboard, submit, approve, scorecard, venterom). Observerer `localDb.syncQueue` via `useLiveQuery` og rendrer kun når køen har items som enten har hatt minst ett feilet forsøk (`attemptCount > 0` eller `lastError != null`) ELLER har stått i køen > 30 sekunder. Inneholder «Prøv igjen»-knapp som kaller `drainQueue()` direkte — bruker eksisterende sync-listener-disiplin, krever ingen RLS- eller migrasjonsendringer.
- **Bruker-synlig feilmelding** når Supabase RPC `upsert_score_if_newer` feiler. Banneret ekstraherer `lastError`-feltet fra første queue-item med feil og viser det som sekundær-tekst under tagline-en (eks. «Failed to fetch» ved offline, «JWT expired» ved utløpt session). Hjelper Jørgen feilsøke under pilot uten å åpne devtools.
- **«X slag venter på lagring»**-banner med 30-sekunders threshold. Internal `setInterval(1000)`-tick reaktiv-evaluerer alder på eldste queue-item slik at banneret dukker opp uten å vente på neste sync-drain.

#### Changed

- **Retry-knapp**: minimum 500ms feedback-tid via `Promise.all([drainQueue(), sleep(500)])` så «Sender…»-state ikke flasher forbi når retry blir no-op'et av `inFlight`-guarden i syncWorker. Brukeren får visuell bekreftelse på at klikket ble registrert.

</details>

</details>

---

<details>
<summary><strong>0.8.x — Sletting og «trekk tilbake»-flyt (27 oppføringer) — klikk for å vise</strong></summary>

## 0.8.x — Sletting og «trekk tilbake»-flyt

Dedikert slett-side for spillere, fulgt av tre iterasjoner på «trekk tilbake»-bekreftelsen for å få den robust på iPhone-PWA. Pilot-polish på topp: tydeligere tekst utendørs i sol.

### [0.8.5] - 2026-05-13

> Hull-nummer og sekundær-tekst er nå tydeligere å lese på telefon utendørs — viktig før pilot-runden.

<details>
<summary>Teknisk</summary>

#### Changed

- **Bumpet `--text-muted` (#5C5347 → #4A3F30)** i light mode. Token brukes av tournament-name i hull-headeren, sync-status-linja, score-kort-helpere og ~20 admin-kickers — alle får en touch mer kontrast mot linen-bg (#F8F6F0). Hierarkiet bevares (#4A3F30 er fortsatt klart sekundært mot #1A2E1F text), men perseptuell vekt øker nok til at uppercase-tight-labels og 10–12px sekundær-tekst leses bedre i direkte sollys. Dark mode-tokenet er urørt.
- **`HoleStrip` future-state nummer: font-weight 500 → 600.** Hull som ikke er spilt enda (typisk 17 av 18 ved runde-start) hadde tynne 13px serif-tall som forsvant i sol. Bumpen fra 500 → 600 sharpenser nummer-rendering uten å endre farge eller hierarki — current og completed er fortsatt visuelt distinkte.

</details>

---

### [0.8.4] - 2026-05-13

> Du kan nå trekke tilbake en invitasjon fra iPhone uten at knappene oppfører seg rart.

<details>
<summary>Teknisk</summary>

#### Fixed

- **«Trekk tilbake»-flyten fungerer nå på iPhone-PWA.** Forrige fix (v0.8.3) erstattet `<details>`-popouten med en URL-toggle inline (Bekreft + Avbryt på samme rad), men brukeren rapporterte at Bekreft-knappen ikke var trykkbar på iPhone, og at Avbryt-knappen i stedet utløste tilbaketrekkingen — antagelig på grunn av en kollisjon mellom server-action form-submit og SmartLink-prefetch på samme touch-event. Bytter nå til samme mønster som slett-bruker (`/admin/spillere/[id]/slett`): «Trekk tilbake»-lenken navigerer til en dedikert bekreftelses-side på `/admin/spillere/invitations/[id]/trekk-tilbake/` med stor Bekreft-knapp og separat Avbryt-lenke. Ingen knapper deler tap-target, ingen flyktige toggle-tilstander.

</details>

---

### [0.8.3] - 2026-05-13

> Forsøk på å fikse «trekk tilbake»-bekreftelsen for iPhone — viste seg å ikke fungere helt, og ble erstattet av løsningen i 0.8.4.

<details>
<summary>Teknisk</summary>

#### Fixed

- **«Trekk tilbake»-bekreftelsen fungerte ikke på iPhone-PWA.** Den brukte `<details>`/`<summary>` for inline-popout, men iOS Safari håndterer tap-events inni open-state-popouten upålitelig (tap kan boble til summary og lukke popouten før Bekreft-knappen registrerer klikket). I tillegg ble popouten klippet av kortets `overflow-hidden`, og kunne overlappe nabo-radens knapper slik at et klikk for «Bekreft» traff «Send på nytt» på raden under. Erstattet med en server-rendret URL-toggle: trykk på «Trekk tilbake» legger til `?confirm=<id>` i URL-en, og den raden rendres i confirm-modus inline med tydelige Bekreft + Avbryt-knapper. Ingen JS, ingen popout-quirks, fungerer likt på alle nettlesere og PWA-shells.

</details>

---

### [0.8.2] - 2026-05-13

> Ventende invitéer dukker ikke lenger opp dobbelt i admin-spillerlista, og «trekk tilbake» frigjør e-postadressen som forventet.

<details>
<summary>Teknisk</summary>

#### Fixed

- **Spillerliste på `/admin/spillere` viser ikke lenger ventende invitéer dobbelt.** Etter at migrasjon `0014_pending_users` begynte å auto-opprette `public.users`-rader for hver `auth.users`, dukket ventende invitéer (de uten `profile_completed_at`) opp som «registrerte spillere» i tillegg til å være i ventende-invitasjoner-seksjonen. Spillerlista filtrerer nå på `profile_completed_at IS NOT NULL`, og «X registrert»-tellingen matcher.
- **«Trekk tilbake»-orphan-cleanup tilpasset trigger-baserte `public.users`-rader.** Sjekken var «hvis `public.users`-raden mangler, slett `auth.users`» — men siden trigger nå alltid oppretter raden, ble den sjekken alltid usann. Logikken bruker nå `profile_completed_at IS NULL` som signal på «invitéen fullførte aldri profil», så `auth.users` ryddes som forventet.
- **Null-safe visning av navn** på spiller-detalj og slett-bekreftelses-sider — invitéer uten utfylt navn vises med e-postadressen i stedet for en tom overskrift.

</details>

---

### [0.8.1] - 2026-05-13

> Hvis sletting av en spiller mislykkes, sier appen nå hvorfor — i stedet for å se ut som om ingenting skjedde.

<details>
<summary>Teknisk</summary>

#### Fixed

- **Silent banner-feil ved feilet sletting.** Detalj-siden (`/admin/spillere/[id]`) viste ingen tilbakemelding når slett-flyten feilet eller ble blokkert av self-protect — den manglet meldinger for `self_delete_forbidden`, `still_has_games` og `auth_delete_failed` i sin `ERROR_MESSAGES`-tabell. Nå viser banneret en ærlig forklaring i alle tre tilfeller, inkludert hint om mulige FK-grunner («data knyttet til seg — invitasjoner sendt, baner opprettet eller scores skrevet»).
- **Ærligere kode-kommentar om FK-cascade-grensene** i `deleteUser`-action: dokumenterer at `public.users`-cascaden kun cleaner opp én rad, og at andre FK-er (`scores.entered_by`, `invitations.invited_by` osv.) er trygt dekket i dagens admin-modell men må sjekkes eksplisitt når arrangør-rollen lander.

</details>

---

### [0.8.0] - 2026-05-13

> Du kan slette en spiller fra admin — nyttig hvis du sendte invitasjon til feil e-postadresse.

<details>
<summary>Teknisk</summary>

#### Added

- **Slett-flyt for spillere på `/admin/spillere/[id]/slett`.** Dedikert bekreftelses-side viser navn, e-post og forklaring. Slett-knappen kaller `auth.admin.deleteUser` via service-role-klienten — `auth.users`-raden slettes, `public.users` cascade-slettes automatisk, og e-posten frigjøres for ny invitasjon.
- **Block-betingelser** på server-side: kan ikke slette deg selv (self-protect), kan ikke slette en spiller som har en eller flere `game_players`-rader.

</details>

---

<details>
<summary><strong>0.7.x — Bruker-detalj-redigering (1 oppføring) — klikk for å vise</strong></summary>

Klikk på en spiller i admin for å redigere navn, kallenavn og handicap. Faresone-seksjon på detalj-siden forbereder slett-flyten som lander i 0.8.0.

### [0.7.0] - 2026-05-13

> Klikk på en spiller i admin for å redigere navn, kallenavn og handicap-indeks.

#### Added

- **Bruker-detalj på `/admin/spillere/[id]`.** Klikkbar rad i spillerlista åpner form for å redigere navn, kallenavn og handicap-indeks. Lagre-knapp gir ærlig success/feil-banner.
- **Faresone-seksjon** på detalj-siden viser slett-lenken som disabled inntil neste leveranse aktiverer den. Forklarende tekst hvis spilleren har historikk eller hvis det er deg selv.

#### Changed

- **RLS:** Ny policy `users admin update` lar admin oppdatere andre bruker-rader (tidligere kun egen rad). Migrasjonen heter `0015_admin_user_management` (filnavn-kollisjon med `0014_pending_users` ble rensket opp ved merge).

</details>

---

<details>
<summary><strong>0.6.x — Samlet spilleradministrasjon (1 oppføring) — klikk for å vise</strong></summary>

Erstatter den gamle `/admin/invitations`-flata med `/admin/spillere`, som samler registrerte spillere, ventende invitasjoner og invitasjons-form på ett sted og legger til «Send på nytt» og «Trekk tilbake»-actions.

### [0.6.0] - 2026-05-13

> Ny «Spillere»-side i admin samler registrerte spillere, ventende invitasjoner og invitasjons-form på ett sted, og du kan re-sende eller trekke tilbake invitasjoner derfra.

#### Added

- **Ny samlet spilleradministrasjon på `/admin/spillere`.** Erstatter gamle `/admin/invitations`. Tre seksjoner i én flate: registrerte spillere (med søk på navn/kallenavn/e-post), ventende invitasjoner, og en sammenfoldet «Inviter ny spiller»-form nederst.
- **«Send på nytt»-knapp på ventende invitasjoner.** Trigger ny notifikasjons-mail via Resend til samme adresse. Ingen ny DB-rad.
- **«Trekk tilbake»-knapp på ventende invitasjoner** med inline to-trinn-bekreft. Sletter `invitations`-raden; hvis invitéen hadde bedt om kode men aldri fullført profil (`profile_completed_at IS NULL`), ryddes også `auth.users`-raden via service-role slik at e-posten er ledig igjen.

#### Changed

- **Admin-hjemmeside-tile «Invitasjoner» erstattet av «Spillere»** med kombinert telling («12 registrert · 4 venter»).
- **Lenker fra «Opprett spill» og «Rediger spill»** når man trenger flere spillere peker nå til `/admin/spillere` i stedet for `/admin/invitations`.

#### Removed

- **Rute `/admin/invitations`** — funksjonaliteten finnes nå på `/admin/spillere`.

</details>

---

<details>
<summary><strong>0.5.x — Pending-invitees-integrasjon (11 oppføringer) — klikk for å vise</strong></summary>

Ventende invitéer kan nå velges til lag og flight før de selv har logget inn. Ti patch-bumps fulgte for å rydde fallouten fra migrasjon 0014, som auto-oppretter `public.users`-rader for hver `auth.users` og som dermed brøt onboarding-gate, picker-filter, draft-validering og start-spill-guard.

### [0.5.10] - 2026-05-13

> «Akseptert»-statusen på en invitasjon stemmer nå med om spilleren faktisk har fullført profilen sin.

#### Fixed
- `Akseptert`-pille på `/admin/invitations` reflekterer nå faktisk onboarding (`profile_completed_at IS NOT NULL`), ikke bare at invitasjons-raden ble markert akseptert ved OTP-verify. Stoppet misvisende «Akseptert»-status for brukere som klikket gammel magic-link-mail uten å fullføre profil.

### [0.5.9] - 2026-05-13

> Beskytter mot at en bruker blir hengende som «Venter» selv etter at de har lagret profilen sin.

#### Fixed
- Profil-oppdateringen stamper nå `profile_completed_at` som defence-in-depth, så en bruker som havner på `/profile` uten å ha fullført onboarding (deploy-vindu-race i tidligere release) blir ikke sittende fast som «Venter» i picker-en.

### [0.5.8] - 2026-05-13

> Du kan ikke starte et planlagt spill hvis noen av deltakerne fortsatt mangler å fullføre profilen.

#### Fixed
- «Start spillet» (draft → aktiv) blokkeres nå hvis ikke alle valgte spillere har fullført profil — samme guard som scheduled-pathen.
- Invitér-en-venn-actionen sjekker `profile_completed_at` i stedet for "rad finnes ikke" som ble dødt etter migrasjon 0014.

### [0.5.7] - 2026-05-13

> Ventende invitéer uten utfylt navn vises med e-postadressen i stedet for tom plass.

#### Fixed
- Rendring av ventende invitéer (uten utfylt navn) faller tilbake til e-postadressen i stedet for å vise tom tekst — gjelder admins spill-detaljside (lag/flight-oversikt) og spillernes venterom-visning av draft-spill.

### [0.5.6] - 2026-05-13

> Nye brukere sendes igjen til onboarding-skjermen ved første innlogging.

#### Fixed
- Nye brukere ble ikke sendt til onboarding på `/` og `/profile` etter at trigger-en fra migrasjon 0014 begynte å pre-opprette `public.users`-rader. Gate-en sjekker nå `profile_completed_at` i stedet for "rad finnes ikke".

### [0.5.5] - 2026-05-13

> Førstegangs-onboarding fungerer igjen for nye brukere — var midlertidig brutt etter en bakgrunnsendring.

#### Fixed
- `complete-profile` oppdaterer nå den auto-opprettede `public.users`-raden i stedet for å forsøke å sette inn på nytt. Uten denne ville migrasjon 0014 brutt all ny brukerregistrering.

### [0.5.4] - 2026-05-13

> Feilmeldingen for ventende spillere på opprett-spill-siden viser nå e-postadressene i stedet for «{LIST}».

#### Fixed
- Feilmelding for ventende spillere viste `{LIST}`-plassholderen bokstavelig på opprett-spill-siden. Bruker nå samme `buildErrorMessage`-helper som rediger-spill og spill-detalj.

### [0.5.3] - 2026-05-13

> Ekstra sikkerhets-sjekk: et publisert spill kan ikke startes med ventende spillere selv om databasen blir manuelt redigert.

#### Fixed
- Start spill blokkeres også (defence-in-depth) hvis et publisert spill noensinne skulle få ventende spillere via direkte DB-redigering.

### [0.5.2] - 2026-05-13

> Du kan ikke endre et eksisterende spill til publisert hvis det fortsatt har ventende invitéer.

#### Fixed
- Publisering/oppdatering fra rediger-spill blokkeres med tydelig e-postliste hvis ventende invitasjoner står på rosteret.

### [0.5.1] - 2026-05-13

> Du kan ikke publisere et nytt spill hvis noen av deltakerne ikke har fullført profilen sin.

#### Fixed
- Publisering av nytt spill blokkeres nå hvis ikke alle valgte spillere har fullført profil.

### [0.5.0] - 2026-05-13

> Du kan nå velge ventende invitéer til lag og flight før de selv har logget inn.

#### Added
- Inviterte spillere som ikke har logget inn ennå dukker opp i game-picker-en med en gul `Venter`-pille. Admin kan velge dem til lag og flight og lagre utkast.

</details>

---

<details>
<summary><strong>0.4.x — OTP-kode-innlogging (4 oppføringer) — klikk for å vise</strong></summary>

Bytte fra magic-link til 6–8-sifret kode i mail, som fjernet to iOS-PWA-blokkerings-bugs samtidig. Inkluderer ærligere admin-invitasjons-banner ved Resend-feil og forberedelse for pending-invitees-sporing i 0.5.x.

### [0.4.3] - 2026-05-13

> Tørny vet nå hvilke spillere som har fullført profilen — forberedelse for å vise ventende invitéer riktig i spill-pickeren.

#### Added

- Inviterte spillere som ikke har fullført registrering blir nå sporet via `profile_completed_at`. Forberedelse for å vise dem i game-picker-en.

### [0.4.2] - 2026-05-13

> Hvis «Du er invitert»-mailen ikke kommer fram, sier admin-banneret det ærlig i stedet for å lyve «Invitasjon sendt».

#### Fixed

- **Admin-invitasjons-banneret lyver ikke lenger om mail-utsending.** Tidligere viste `/admin/invitations` alltid «✓ Invitasjon sendt»-banner etter at raden var lagret, selv om Resend-utsendingen faktisk feilet — feilen ble bare stille logget i Vercel-runtime-loggene. Hvis Resend kaster nå, vises et ærlig feil-banner: «Invitasjonen ble lagret, men «Du er invitert»-mail kom ikke ut. Sjekk Vercel-loggene for detaljer.» Raden i `invitations`-tabellen bevares fortsatt (admin kan re-sende manuelt når mail-konfigen er fikset).

### [0.4.1] - 2026-05-13

> Innloggings-kode-feltet godtar nå 8-sifrede koder, som er Supabase' faktiske standard.

#### Fixed

- **Kode-input godtar nå 6–8 sifre, ikke bare 6.** Supabase' default OTP-lengde er 8 sifre (endret i mai 2024) — vi hardkodet 6 sifre i kode-feltet, så brukere som fikk en 8-sifret kode kunne kun skrive inn de første 6 og fikk feilmelding. Pattern og maxLength er nå fleksible, hjelpe-tekst sier «kode» i stedet for «6-sifret kode».

### [0.4.0] - 2026-05-13

> Du logger inn med en 6–8-sifret kode du taster inn, i stedet for å klikke en lenke i mailen. Inviterte spillere får først en notifikasjons-mail og må be om innloggings-kode selv etterpå.

#### Changed

- **Innlogging går nå via 6-sifret kode i mail i stedet for å klikke lenke.** Du skriver inn e-post som før, men i stedet for å klikke en lenke i mailen mottar du en kode (f.eks. `482 619`) som du taster inn på samme side. Fjerner to pre-existing problemer som blokkerte PWA-innlogging på iPhone: (a) magic-link åpnet seg i Safari i stedet for PWA-en og brøt PKCE-handoff-en, (b) mail-scannere konsumerte engangs-token-en før brukeren faktisk klikket. Begge problemene forsvinner når det ikke finnes noen URL å konsumere — bare en kode som leses med øynene og tastes inn.
- **Invitasjons-mailen er ny.** Når admin inviterer en kompis sender Tørny nå en kort notifikasjons-mail («Du er invitert. Gå til tornygolf.no og logg inn med din e-post.») via Resend. Selve innloggings-koden får invitéen først når de kommer til /login og taster e-posten sin der. To mailer per invitasjon (notifikasjon + kode), men én og samme innloggings-flyt for alle.

#### Removed

- **Magic-link-URL-flyten.** `/auth/callback`-route-en redirecter alle gamle klikk til `/login?error=link_expired` i en 30-dagers overgangsperiode. Etter 2026-06-13 fjernes route-en helt (tracked in TODO.md).

</details>

---

<details>
<summary><strong>0.3.x — Logo og pre-OTP-fixes (4 oppføringer) — klikk for å vise</strong></summary>

Tørny fikk sin egen visuelle identitet (wordmark med champagne-prikk på login og app-ikoner), pluss tre fixes som ryddet opp før OTP-omleggingen: invitasjoner som sto som «VENTER» etter aksept, tee-off-tider som lå 1–2 timer feil, og «lagre utkast» som låste seg på native HTML5-validering.

### [0.3.3] - 2026-05-13

> Invitasjoner flippes nå korrekt til «Akseptert» når mottakeren logger inn første gang — før dette sto alle som «Venter» uansett.

#### Fixed

- **Invitasjoner sto som «VENTER» selv etter aksept.** Hele tabellen `public.invitations` hadde `accepted_at = NULL` på alle 8 rader — ingen kode skrev til kolonnen noensinne. Auth-callback (`app/auth/callback/route.ts`) markerer nå alle ventende invitasjoner for innlogget brukers e-post som akseptert etter vellykket `exchangeCodeForSession`. Best-effort: feil i side-effekten blokkerer aldri innloggingen. Ny RLS-policy (`migration 0012`) lar bruker UPDATEe sin egen invitasjon — kun `accepted_at`-flippen er tillatt, alle andre kolonner må forbli identiske. Backfill kjørt mot 4 stranded rader som hadde `auth.users.confirmed_at` satt.

### [0.3.2] - 2026-05-13

> Tee-off-tider viser nå riktig tid på alle skjermer — var av med 1–2 timer i et kort vindu rett etter sideinnlasting.

#### Fixed

- **Tee-off-tider rendret 1–2 timer feil under hydration.** `lib/format/teeOff.ts` brukte lokal-TZ `Date.getHours/getMinutes/getDate/getMonth` — på Vercel-serveren (UTC) ga det feil tid i HTML-en før hydration på iPhone (Europe/Oslo) tok over. Rammet hjem-skjermen, runde-siden og leaderboarden. Bytter til `Intl.DateTimeFormat` med eksplisitt `timeZone: 'Europe/Oslo'`, så server og klient nå renderer identiske strenger uavhengig av host-TZ. DST håndteres riktig (UTC → Oslo sommer +02, vinter +01). 11 nye tester verifiserer oppførselen under flere host-TZ-er.

### [0.3.1] - 2026-05-13

> Du kan lagre et halvferdig spill-utkast uten at bane- og handicap-feltene må fylles ut først.

#### Fixed

- **«Lagre utkast» låste seg på native HTML5-validering.** Knappen blokkerte sending så snart et `<select required>`-felt (bane/tee/handicap-allowance) var tomt, selv om hele poenget med utkast er å lagre delvis utfylt skjema. Lagt til `formNoValidate` på utkast-knappen — publiser-knappen validerer fortsatt normalt, og server-siden tar fortsatt vare på `name` som eneste obligatoriske felt for utkast.

### [0.3.0] - 2026-05-13

> Tørny har fått sin egen logo — wordmark med champagne-prikk på login-skjermen og som app-ikon.

#### Changed

- **Visuell identitet — Tørny-logoen.** Login-skjermen viser nå hovedlogoen (wordmark «Tørny» + champagne-prikk + tagline *«Fyr opp golfturneringen på et par minutter»*) over innloggings-kortet, sentrert på linen-bakgrunnen. Den ekstra T-flisen og den dekorative medallion-en er fjernet — de duplikerte logoen og bråket mot brand-mark.svg-spec-en.
- **BrandMark-låsen i øverste venstre hjørne** (hjem, profil, admin) er strippet til kun wordmark «Tørny» med en liten champagne-prikk. Den mørke T-flisen og «TURNERING»-undertittelen er fjernet.
- **Tagline-formuleringen** *«Fyr opp golfturneringen på et par minutter»* (med wordplay-«par») er nå canonical i `CLAUDE.md`. Tidligere kortform uten «et par» er erstattet.

#### Added

- **App-ikoner (192×192, 512×512, 180×180)** og `brand-mark-icon-only.svg` har fått en champagne-prikk til høyre for T-en, slik at hjemskjerm-ikonet på iOS/Android og favicon-en bærer samme brand-aksent som logoen i appen.

#### Removed

- «Logg inn»-overskriften på `/login`. Hero-en + «Send meg lenke»-knappen + hjelpeteksten gir nok kontekst.

</details>

</details>

---

## [0.2.0] - 2026-05-12

> Innfører versjonerings-disiplin: hver bruker-synlig endring skal bumpe versjonen og legge til CHANGELOG-oppføring i samme commit.

<details>
<summary>Teknisk</summary>

#### Added

- Versjonerings-disiplin: hver commit som endrer bruker-synlig oppførsel bumper `package.json` og legger til oppføring i denne fila. Reglene står i `CLAUDE.md`.

#### Notes

- Versjonen som vises i app-footeren (`AppVersionFooter.tsx`) er allerede koblet til `package.json` via `next.config.ts` — fra og med dette bumpet vil footeren reflektere reell release-versjon istedenfor en konstant `v0.1.0`.

</details>

---

## Pre-disiplin (`0.1.0`)

Versjonen `0.1.0` dekker all utvikling fra Phase 0 til og med Phase 12.5. Ingen detaljerte lanseringsnotater ble ført i denne perioden. Et grovt sammendrag:

- **Phase 0–4**: prosjektoppsett, datamodell, Supabase + RLS, scoring-bibliotek (`lib/scoring/`) med 40 unit-tester
- **Phase 5–8**: auth-flyt (magic link), invitasjons-system, admin-flate for baner og spill, hull-skjerm med score-input
- **Phase 9–10**: offline-sync via Dexie, realtime-oppdateringer, peer-godkjenning og admin-overstyring
- **Phase 11–12**: PWA-oppsett, premium-stil med forest-and-champagne palett, leaderboard og scorekort
- **Phase 12.5**: draft-mode på venterom med progressive disclosure, fargeharmonisering for status-bannere

Full historikk: `git log` mellom prosjektstart og commit `02cf8c0`.
