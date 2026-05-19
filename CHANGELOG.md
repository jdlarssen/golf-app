# Changelog

Alle bruker-synlige endringer i Tørny logges her. Versjonering følger [Semantic Versioning](https://semver.org/lang/no/).

Pre-1.0.0 (`0.x.y`) regnes som alpha — vi er fortsatt under uttesting med kompisgjengen. Disiplinen ble innført ved `0.2.0`; alt før det er samlet under «Pre-disiplin».

Hver entry begynner med én **bold setning på vanlig norsk** — hva endringen betyr for deg som bruker — etterfulgt av en sammenfoldbar **Teknisk**-seksjon med utvikler-prosa i [Keep a Changelog](https://keepachangelog.com/no/)-stil. Minor-serier (`0.X.y`) er gruppert under et tema-heading med kort sammendrag; eldre serier er sammenfoldet by default for å holde fila lett å scrolle.

Regler for når en bump utløses er beskrevet i [CLAUDE.md](CLAUDE.md) under «Versjonering / CHANGELOG».

---

## 1.6.y — Eksport

Du kan nå laste ned resultatet fra ferdigspilte spill som CSV — praktisk for utskrift og deling utenfor appen.

### [1.6.0] - 2026-05-19

**Etter et spill er avsluttet kan du nå laste ned resultatet som CSV-fil — åpnes rett i Numbers, Excel og Google Sheets. Praktisk hvis du vil henge resultatet opp i klubbhuset eller dele med folk uten Tørny-konto.**

<details>
<summary>Teknisk</summary>

#### Added
- `app/games/[id]/leaderboard/export/route.ts` — server-route som returnerer `text/csv; charset=utf-8`. UTF-8 BOM + semikolon-separert (norsk Excel-locale) + CRLF line endings. Innholdet er en spill-metadata-blokk (navn, eksport-dato, course par) etterfulgt av leaderboard-tabellen med kolonner for plass, lag, spillere, brutto, netto, mot par og hull spilt. Auth-gated samme mønster som leaderboard-siden (cookie-basert server-client, admin eller deltaker i spillet). Begrenset til `status='finished'` — andre statuser gir 404.
- «Last ned resultat (CSV)»-knapp på finished-leaderboarden (`State4View.tsx`), under team-listen. Filnavn er ASCII-safe (`torny-{game-id}-{YYYY-MM-DD}.csv`) for å unngå browser-quirks med æøå i `Content-Disposition`.

</details>

---

## 1.5.y — Klubbstatistikker

Vinnerliste og «mest aktive»-listen fyller seg automatisk fra ferdigspilte spill. Underlag for både kompisgjengen og kommende klubbskala.

### [1.5.2] - 2026-05-19

**Datoer vises nå konsistent på norsk i hele appen. Tee-off-tidspunktet i admin-detalj-visningen brukte en feilstavet locale-kode («no-NO» — en tag som ikke finnes i den internasjonale standarden) — det er nå rettet til «nb-NO». Ingen synlig endring for deg som bruker, men appen står seg bedre på tvers av nettlesere og fremtidige Node-oppgraderinger.**

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

**Innlogging- og invitasjons-formene har nå en usynlig honeypot mot bot-trafikk. Du som ekte bruker merker ingenting; bot-er som spammer skjemaet får et stilltiende «ok» uten at appen faktisk sender mail eller oppretter invitasjoner.**

<details>
<summary>Teknisk</summary>

#### Added
- Honeypot-felt (`name="website"`, hidden + tabIndex=-1 + autoComplete=off) på `app/(auth)/login/_components/SendCodeForm.tsx` (OTP-request-fasen) og `app/admin/spillere/_components/InviteForm.tsx`. Server-actions silent-rejecter når feltet er fylt: logger til Vercel via `console.warn('[honeypot] silent reject', ...)` uten å kalle Supabase signInWithOtp eller inserte i `invitations`.
- Unit-tester som verifiserer silent-reject-pathen for begge skjemaene (`app/(auth)/login/actions.test.ts` + `app/admin/spillere/actions.test.ts`).

</details>

---

### [1.5.0] - 2026-05-18

**Ny side: Klubbstatistikker. Se hvem som har vunnet flest spill og hvem som har vært med på flest spill — toppen markert med champagne-gull. Lenken ligger på profil-siden din.**

<details>
<summary>Teknisk</summary>

#### Added
- `app/profile/statistikk/page.tsx` — server-component med to seksjoner (Vinnerliste, Mest aktive). Aggregerer fra `games` × `game_players` × `users`-joins; teller kun `status='finished'`. Top-10 pr. seksjon.
- Vinner-beregning gjenbruker `computeLeaderboard` fra `lib/leaderboard.ts` (som internt bruker `bestBallForHole` + `rankTeams` fra `lib/scoring/`). Alle lag med `rank === 1` regnes som vinnere, så delt 1.-plass krediteres begge lag.
- Lenke fra `app/profile/page.tsx` til den nye siden, plassert i samme «Historikk»-cluster som «Min historikk».

#### Notes
- Bulk-fetch i fire round-trips (games, game_players, course_holes, scores) + in-memory aggregering. Skalerer fint for nåværende volum (<1000 finished games); kan flyttes til en SQL-view ved klubbskala.

</details>

---

## 1.4.y — Multi-rating tee-bokser

Hver fysisk tee legges nå inn én gang med valgfrie ratings pr. gender (Herrer / Damer / Junior). Lettere dataentry, og du kan fylle ut manglende ratings senere uten å re-opprette tees.

### [1.4.2] - 2026-05-18

**Når du går videre til neste hull eller bakover, fader innholdet kort inn istedenfor å bare poppe på plass. Liten polish, men gjør hull-byttet mykere.**

<details>
<summary>Teknisk</summary>

#### Changed
- Subtle fade-inn (180ms, ease-out) på hovedinnholdet i `app/games/[id]/holes/[holeNumber]/page.tsx`. CSS-keyframe i `app/globals.css`. Respekterer `prefers-reduced-motion`.

</details>

---

### [1.4.1] - 2026-05-18

**Bane-redigering lagrer nå alle tee-bokser du har lagt inn. Tidligere mistet du tee 6 og 7 hvis du fylte ut mer enn fem rader.**

<details>
<summary>Teknisk</summary>

#### Fixed
- `app/admin/courses/new/actions.ts` og `app/admin/courses/[id]/edit/actions.ts` looper nå over `MAX_TEE_BOXES` (importert fra `components/CourseForm`), ikke hardkodet `5`. Tees i posisjon 6 og 7 ble silently dropped fordi server-actionene aldri leste dem fra formData.

</details>

---

### [1.4.0] - 2026-05-17

**Tee-bokser kan nå ha rating for flere kjønn på samme rad — så du legger inn «Gul» én gang med slope/CR for Herrer og Damer, ikke to ganger. Spill-formen er forenklet til én tee-dropdown med M/D/J-toggle pr. spiller. Du kan også fylle ut manglende ratings på eksisterende tees i etterkant.**

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

---

<details>
<summary><strong>1.3.y — Mixed-gender tee-bokser (1 entry) — klikk for å vise</strong></summary>

## 1.3.y — Mixed-gender tee-bokser

Herrer og damer kan nå spille fra ulike tees i samme runde med korrekt course handicap. Tee-bokser tagges med kjønn (herre/dame/junior) i bane-admin, og spill-formen får en valgfri dame-tee + M/D-toggle pr. spiller.

### [1.3.0] - 2026-05-17

**Du kan nå arrangere spill der herrer og damer spiller fra ulike tees i samme runde — alle får riktig course handicap. Tee-bokser tagges med kjønn i bane-admin, og du kan redigere baner selv om det er ferdigspilte spill på dem.**

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
<summary><strong>1.2.y — Utvidet sideturnerings-poeng (1 entry) — klikk for å vise</strong></summary>

## 1.2.y — Utvidet sideturnerings-poeng

Sideturneringen får 12 nye kategorier og 3 stackbare achievements (Turkey/Solid/Snowman) du kan slå av/på ved spill-opprett. Best netto totalt 18 forblir 10p-grunnpilaren.

### [1.2.0] - 2026-05-16

**Sideturneringen får 12 nye kategorier å spille om — fra «flest birdier» og «konge på par-3» til stackbare achievements som Turkey (3 birdier på rad) og Snowman (lagets felles katastrofe på ett hull). Du velger selv ved spill-opprett hvilke som er aktive.**

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
<summary><strong>1.1.y — Sideturnering (11 entries) — klikk for å vise</strong></summary>

## 1.1.y — Sideturnering

Første feature shipped etter v1.0.0. Lag kan nå konkurrere parallelt med best-ball-netto via en valgfri sideturnering med seks poeng-kategorier.

### [1.1.10] - 2026-05-16

**To admin-flater som tidligere bare hadde en kjedelig "Ingen X ennå"-tekst — invitasjons-køen og spill-lista — får nå en medaljong + ikon + et lite hint om hva som skjer videre, så de føler seg som invitasjoner heller enn glemte tomstader.**

<details>
<summary>Teknisk</summary>

#### Changed
- `app/admin/spillere/_components/PendingInvitations.tsx` — empty state bruker nå `ChampagneMedallion size={64}` med `MailEnvelope`-ikon + serif-tittel + hint "Inviter en spiller ovenfor — så dukker vente-køen opp her." Samme palett-mønster som hjem-skjermens "KLUBBHUSET ER ÅPENT"-state.
- `app/admin/games/page.tsx` — empty state har egen variant per filter: `PinFlag` for "Ingen spill ennå" (CTA mot «+ Nytt»), `Laurel` for "Ingen signerte runder ennå" (resultatprotokollen). Medaljong-størrelse 72px så den passer den større page-konteksten.

</details>

### [1.1.9] - 2026-05-16

**Sensitive admin-handlinger (avslutte spill, godkjenne scorekort, gjenåpne spill/scorekort) skrives nå til en intern audit-log med hvem-gjorde-hva og når, så vi har et data-spor å se etter hvis noe ble endret feil.**

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

**Admin-invitasjons-flyten har nå rate-limiting (20 per admin, 30 per IP per minutt), så et bug eller kompromittert konto ikke kan sende ut bursts av invitasjoner og brenne mail-budsjettet.**

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

**Du kan nå bytte mellom netto og brutto på det avsluttede leaderboardet — toggle-en er tydeligere (begge modus synes samtidig, gjeldende er framhevet), og "Total"-tallet på lederkortet oppdaterer seg når du bytter.**

<details>
<summary>Teknisk</summary>

#### Fixed
- `app/games/[id]/leaderboard/State4View.tsx` — `LeaderCard` hadde hardkodet "Total netto"-label uavhengig av `mode`. Når brukeren bytta til brutto endret dataen seg (lederen, totals, drilldown-link) men label-en sa fortsatt "Total netto" — derav inntrykket av at toggle-en ikke virket. Now: `Total {mode}` følger gjeldende modus.

#### Changed
- `ModeChip` (samme fil) er løftet fra subtil "Bytt til X"-chip til en tab-stil toggle med begge moduser synlige samtidig — speiler state #3.5 sin `ModeToggle`-pattern så brutto/netto-affordansen leses likt uansett om runden pågår eller er ferdig. Sized down (28px min-height vs. 36px) så den ikke konkurrerer med leder-kortet visuelt.

</details>

### [1.1.6] - 2026-05-16

**Du ser nå netto-tallet ditt per hull på scorekort-oversikten — også mens runden pågår, ikke bare etter at spillet er avsluttet.**

<details>
<summary>Teknisk</summary>

#### Changed
- `app/games/[id]/scorecard/page.tsx` — Netto-kolonnen gates nå på `!shouldHideNetto(state)` i stedet for `state === 'reveal-finished'`. Reveal-active er fortsatt den eneste tilstanden som skjuler netto (climax-bevaring); live-always og reveal-finished surfacer den begge nå.

</details>

### [1.1.5] - 2026-05-16

**Når tee-off-tiden passerer og runden starter automatisk, kommer du nå rett inn på hull-skjermen — uten å bli sendt tilbake til startskjermen først.**

<details>
<summary>Teknisk</summary>

#### Fixed
- `app/games/[id]/page.tsx` — auto-start-fallback (server-component-path som flipper `games.status` fra `scheduled` til `active` når en spiller laster siden etter at tee-off har passert) inviderer nå `getGameWithPlayers`-cachen via `after(() => revalidateTag(\`game-\${id}\`, { expire: 0 }))`. Uten dette ville hull-page-en kunne servere pre-flip-snapshot (status='scheduled') og redirecte spilleren tilbake til game-home i opptil 15 min revalidate-vinduet. `revalidateTag` kan ikke kalles direkte under render — derav `after()` fra `next/server` som deferrer kallet til post-render. `{ expire: 0 }` forsterker til umiddelbar invalidering (vs. stale-while-revalidate som ville kostet én ekstra redirect-bounce). Admin-pathen (`startScheduledGameAction` i server-action-kontekst) var allerede dekket fra #76.

</details>

### [1.1.4] - 2026-05-16

**Du ser nå netto-tallet ditt diskret under navnet på hvert hull, så du slipper å regne i hodet — også som plus-golfer.**

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

**Sideturneringen viser nå hvem som er på hvert lag, og du kan klikke på et lag for å se hvilke kategorier som ga poengene deres.**

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

**Initialene på scorekortet og hull-leaderboardet bruker nå første bokstav i fornavn og etternavn (f.eks. «Karl Hansen» → «KH»), i stedet for første bokstav i kallenavnet. Spillere med kun fornavn får fortsatt én bokstav.**

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

**I reveal-modus ser nå alle deltakere live brutto-leaderboardet på tvers av flights — ikke bare sin egen flight. Netto-rangeringen forblir skjult til admin avslutter spillet, akkurat som før.**

<details>
<summary>Teknisk</summary>

#### Fixed
- Migrasjon `0025_reveal_active_scores_visibility` — utvider `scores select gating`-policyen så deltakere i et reveal-modus-spill (`score_visibility='reveal'` + `status='active'`) kan lese alle scores i spillet, ikke bare egen-flight. Avdekket i første pilot-runde 2026-05-14 (SICKlestad) der `RevealBruttoView` viste «18 hull mangler» for andre flightenes lag for ikke-admin-spillere. Live-modus state3.5 (front-9-only) er uendret — climax-hiding der avhenger fortsatt av at back-9-scores er uleselige mid-round.

</details>

### [1.1.0] - 2026-05-14

**Du kan nå legge til en sideturnering i admin-formen. Lag samler poeng fra 6 kategorier — best netto 18, front 9, back 9, hole-wins, longest drive og closest to pin. Resultatet vises i en egen fane på leaderboarden etter at spillet er avsluttet.**

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
<summary><strong>1.0.x — Første stabile release (11 entries) — klikk for å vise</strong></summary>

## 1.0.x — Første stabile release

Tørny er nå klar for ekte bruk. Tre features kobles til v1.0: reveal-modus for kompis-gjenger som vil ha drama under runden, scorekort-former som premium visuell touch, og navne-reveal når spillet er ferdig.

### [1.0.10] - 2026-05-14

**Hjemmesiden hilser deg nå proft uten håndvink-emoji, og kicker-overskriften i toppbar-en (SEKRETARIATET, PROFIL, …) står ekte sentrert i stedet for å lene mot venstre.**

<details>
<summary>Teknisk</summary>

#### Changed
- `app/page.tsx` — droppet 👋-emoji fra hilsenen. Tittelen er nå `Hei, {navn}.` — matcher den nøkterne tonen i admin-greetingen (`God morgen, Jørgen.`).
- `components/ui/TopBar.tsx` — kicker er nå `absolute left-1/2 -translate-x-1/2` så den sentreres i viewport uavhengig av BackLink-bredden. Den gamle 80px høyre-spaceren er fjernet — den asymmetrien (32px BackLink vs 80px spacer) gjorde at kickeren lente venstre.

</details>

### [1.0.9] - 2026-05-14

**Hull-for-hull-oversikten viser nå per-spiller vs-par-pille rett ved siden av netto-scoren. TOTALT-kortet har fått mot-par-en flyttet inn ved siden av totalsummen (56 −16) i stedet for som egen linje under.**

<details>
<summary>Teknisk</summary>

#### Added
- Per-spiller vs-par-pille (`E`/`+1`/`−1`) i `HoleRow` etter netto-tallet, samme tone-mapping som lag-pillen.

#### Changed
- Totalt-baren i `holes/page.tsx` viser `total + vsPar` inline i samme baseline-flex. «Mot par: X»-linja under er fjernet.
- Legend oppdatert: `initial · brutto · netto · vs par   →   lag`.

</details>

### [1.0.8] - 2026-05-14

**Hull-for-hull-oversikten er ryddet opp: vinner-av-hullet-prikken er borte (skapte mer støy enn verdi), netto-tall står nå tett ved brutto for hver spiller, og helt til høyre står lagets score for hullet med en E/+1/−1-pille — slik at du kan følge progresjonen nedover og se nøyaktig på hvilket hull dere gikk fra E til −1.**

<details>
<summary>Teknisk</summary>

#### Changed
- `app/games/[id]/leaderboard/holes/page.tsx` — fjernet winner-of-hull-prikk-kolonnen + tilhørende legend-entry. Per-spiller-rad er nå `initial · brutto-shape · netto` (ingen per-spiller vs-par-pill). Helt til høyre er lagets best-ball-netto + vs-par-pill, sentrert vertikalt over begge spiller-radene. Sparet plass + gir en lesbar high-level «narrative»-kolonne.
- Legend forenklet til `B = brukt netto` + `initial · brutto · netto → lag · vs par`.

</details>

### [1.0.7] - 2026-05-14

**Hull-for-hull-oversikten har fått en helt ny layout: hver spiller har sin egen rad med initial (J, H, …) foran scoren — som på et fysisk scorekort. Bokstaven til den som «vant» netto-en for laget er uthevet. Sparer plass, ingen horisontal scroll selv på smaler iPhone.**

<details>
<summary>Teknisk</summary>

#### Changed
- `app/games/[id]/leaderboard/holes/page.tsx` — `HoleRow` er omskrevet fra horisontal grid med to spillere side om side til vertikalt stack: hull-nummer + par på venstre side (spenner over begge spiller-rader), så én rad per spiller med `initial · brutto-shape · netto · vs-par-pill`. Lag-totalen (`teamNet` + pill) er fjernet fra hver rad siden hver spillers netto allerede er synlig — den lavere er det laget brukte. Kontributør markeres med uthevet initial (`font-bold`) i stedet for bakgrunns-fyll. Legend oppdatert til `B = brukt netto` og `initial · brutto · netto · vs par`.
- `HoleTable` mottar nå `teamPlayers: LbPlayer[]` for å mappe `userId → initial`.

</details>

### [1.0.6] - 2026-05-14

**Scorekortet passer nå på normal iPhone — +slag-kolonnen er flyttet til fotnoten som «Slag fått: N» totalt. Du kjenner din egen handicap-fordeling per hull, og kortet trenger ikke gjenta den på hver linje.**

<details>
<summary>Teknisk</summary>

#### Changed
- `app/games/[id]/scorecard/page.tsx` — per-rad `+slag`-kolonne fjernet. Total ekstra-slag («Slag fått: N») surfaces i fotnoten via `showHandicapTotal`-flagget (gjelder i live-modus og reveal-finished; skjules i reveal-aktiv). Padding redusert fra `px-4` til `px-3` for å spare bredde. Footer-layout er nå wrap-vennlig flex i stedet for én lang setning.

</details>

### [1.0.5] - 2026-05-14

**Hull-for-hull-leaderboardet er overhalt: hver spiller-celle viser nå både brutto-tall (med form rundt), antall ekstra-slag og netto-tall i ett tydelig stack. «Brukt netto» har fått fargefylt bakgrunn så det er lett å se hvem som vant hullet. Form-strekene er tynnere så trippel- og kvadruppel-former tar mindre plass.**

<details>
<summary>Teknisk</summary>

#### Changed
- `app/games/[id]/leaderboard/holes/page.tsx` — hver `pc`-celle er nå et vertikalt stack: ScoreShape med brutto på toppen, og «+slag · netto»-linje under. Kontributør markeres med `bg-accent/12` + `font-bold` (erstatter den lite synlige `font-semibold`-aleinemarkøren). Legend oppdatert til «brutto / +slag · netto».
- `components/scoring/ScoreShape.tsx` — strek-tykkelsen redusert: sm 1.25 → 1.0, md 1.5 → 1.25, lg 2 → 1.5. Gap mellom nestede former redusert: `max(3, stroke+1)` → `max(2, stroke+0.5)`. Trippel- og kvadruppel-former tar nå merkbart mindre plass.

</details>

### [1.0.4] - 2026-05-14

**Leaderboardet oppdaterer seg automatisk når admin trykker «Avslutt spillet» — du slipper å refreshe selv for å se reveal-en.**

<details>
<summary>Teknisk</summary>

#### Added
- Migrasjon 0022 — `public.games` lagt til i `supabase_realtime`-publikasjonen
- `PreRoundLeaderboardRealtime` lytter nå på `games` UPDATEs i tillegg til `scores` INSERTs. Når admin avslutter spillet (status flippes til `finished`), trigges `router.refresh()` automatisk og leaderboardet veksler til `State4View` med formatRevealName + confetti.

</details>

### [1.0.3] - 2026-05-14

**Spill-hjem-siden har nå en «Leaderboard»-knapp så du kan se brutto-stillingen mens du venter på at admin avslutter spillet — ikke bare via hull-skjermen.**

<details>
<summary>Teknisk</summary>

#### Added
- `app/games/[id]/page.tsx` — `Leaderboard`-SmartLink-card under «Mitt scorekort» når spillet er `active`. Lukker discoverability-gapet etter scorekort-levering: før denne fixen var leaderboardet kun nåbart via hull-skjerm-ikonet, og hull-skjermen redirecter etter levering.

</details>

### [1.0.2] - 2026-05-14

**Live brutto-leaderboardet viser nå hvor langt under/over par hvert lag og hver spiller er — du ser `+3` ved siden av brutto-totalen istedenfor bare det rå tallet.**

<details>
<summary>Teknisk</summary>

#### Added
- `RevealBruttoView` viser `E` / `+N` / `−N` delta-mot-par på både lag-total og hver spiller-rad. Par-tellet er kumulativt over spilte hull (teamet: hull der minst én spiller har scoret; spilleren: hull der spilleren selv har scoret).

</details>

### [1.0.1] - 2026-05-14

**Par-scorene står nå på samme kolonne som birdies og bogeys på hull-skjermen — de skjøvet seg litt til venstre fordi de manglet form rundt seg.**

<details>
<summary>Teknisk</summary>

#### Fixed
- `components/scoring/ScoreShape.tsx` — `shape='none'`-branchen reserverer nå samme `width`/`height` som de andre formene (`px × px`) og bruker `lineHeight: ${px}px` + `textAlign: center` for vertikal/horisontal sentrering. Par-tall okkuperer dermed samme kolonne-bredde som birdie/bogey-tall side om side.

</details>

### [1.0.0] - 2026-05-14

**Første stabile release. Tørny går fra alpha til 1.0 med tre nye features som markerer at appen er klar for ekte bruk: reveal-modus skjuler netto-tall under runden og avslører på slutten (perfekt for kompis-gjenger der laget med høyere handicap kan slå brutto-lederen — det blir et virkelig spennings-moment når du trykker avslutt), scorekort-former gir birdies en sirkel og bogeys en firkant slik som ekte papir-scorekort, og når et spill er ferdig vises navnene som «Karl "Knølkis" Jensen» med kallenavnet midt i fullt navn.**

<details>
<summary>Teknisk</summary>

Sammenslått leveranse av v0.10.23–v0.10.27 + ingen ytterligere endringer i denne commiten. Se de individuelle entries under for hva hver bumps brakte.

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
<summary><strong>0.10.x — Resultat-mail og closing-the-loop (28 entries) — klikk for å vise</strong></summary>

## 0.10.x — Resultat-mail og closing-the-loop

Mail begge veier rundt godkjennings-flyten: admin får mail når en spiller leverer, spillere får mail når admin avslutter. Ingen polling av appen for å vite om det er noe nytt å gjøre. Pilot-polish underveis: ærligere feilmeldinger i admin når noe går galt med å lese spillerlisten, og første pass på personvern-siden.

### [0.10.27] - 2026-05-14

**Live brutto-leaderboard for reveal-spill — du ser hvordan lagene ligger an på brutto, men vinneren er fortsatt skjult. Nytt: når et spill er ferdig vises navnene som «Karl "Knølkis" Jensen» — kallenavnet midt i fullt navn som en del av reveal-en. Og du kan nå hoppe direkte til leaderboardet fra hull-skjermen via en liten knapp i toppen.**

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

**Reveal-modus er nå klar: admin kan velge om netto-tallene skjules under runden og avsløres på slutten. Funker overalt — hull-skjerm, scorekort, leaderboard, godkjenning.**

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

**Scorekort-formene følger nå med over alt der tallene står — scorekort-oversikt, lever-skjerm, godkjenning og hull-leaderboard. Samtidig krymper «HULL»-kolonnen til kun «#» for å frigjøre plass på smale skjermer.**

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

**Tre justeringer på hull-skjermen etter første pilot-test: trippel-sirkel for albatross, dobbeltfirkant utvides til kvadruppel-firkant for blow-up-hull, og spesifikk-score-arket forenkles til kun eagle/birdie/par + X for å fjerne en score helt.**

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

**Score-tallene på hull-skjermen får scorekort-former rundt seg — sirkel for birdies, firkant for bogeys, dobbel for eagle og double bogey.**

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

**Tilbake-knappen på personvern-siden returnerer deg nå til siden du kom fra, ikke alltid til hjem-siden.**

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

**Personvern-siden er nå faktisk lesbar uten å logge inn — tidligere ble du sendt til /login fordi auth-gaten ikke gjorde unntak.**

<details>
<summary>Teknisk</summary>

#### Fixed

- **`proxy.ts`-matcheren manglet `legal/`-unntak.** Den globale auth-gate-middleware-en redirecter alle ikke-matchende ruter til `/login?next=...` hvis bruker er uautentisert. `/legal/privacy` (og fremtidige legal-sider) skal være offentlige — særlig viktig for invitéer som skal lese personvern *før* de logger inn. La til `legal/` i matcherens negative-lookahead, parallelt med `login`, `register` og `auth/callback`.

</details>

---

### [0.10.20] - 2026-05-14

**«Personvern» er nå klikkbar fra bunnen av hver side ved siden av versjons-stempelet — også på login-siden, så invitéer kan lese den før de logger inn.**

<details>
<summary>Teknisk</summary>

#### Changed

- **`AppVersionFooter`** viser nå `v0.10.20 · Personvern` i stedet for bare versjonsnummer. Lenken peker til `/legal/privacy` med samme muted-styling som footer-en. Bruker plain `<a>` (ikke SmartLink) for å unngå viewport-prefetch av personvern-siden på hver side-visning — link-en klikkes sjeldent og fortjener ikke bundle-cost. Footer rendres av AppShell på de fleste sider; game-i-progress-sider (approve/submit/scorecard) bruker `showVersion={false}` og påvirkes ikke.

</details>

---

### [0.10.19] - 2026-05-14

**Personvern-siden er nå nådbar fra profilen — liten muted-tekst med lenke rett under «Mine data»-seksjonen.**

<details>
<summary>Teknisk</summary>

#### Added

- **Personvern-lenke i `/profile/page.tsx`** under GdprSection: «Les hvordan vi behandler og lagrer dataene dine i [personvernerklæringen](/legal/privacy).» Discret muted-text-stil, ingen visuell konkurranse med GDPR-kortene. Siden var allerede live på `/legal/privacy` men kunne ikke nås uten å skrive URL-en direkte — nå har den en faktisk inngang.

</details>

---

### [0.10.18] - 2026-05-14

**Hver side har nå en tydelig overskrift i den sticky top-baren — som «Sekretariatet» gjør på admin-sidene. Tidligere var det bare en chevron der med en tom plass i midten.**

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

**Tilbake-knappen klistrer seg nå til toppen av skjermen på alle lange admin- og profil-sider — du slipper å scrolle helt opp for å komme tilbake.**

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

**Innloggings-flyten føles nå raskere og mindre forvirrende: «Send kode»-knappen viser «Sender kode …» mens den jobber, og koden logger deg inn automatisk så snart den er fylt inn — du trenger ikke trykke «Logg inn» selv.**

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

**Du kan nå slette et spill helt uavhengig av status — også aktive spill der ikke alle har levert scorekort, og avsluttede spill. Slettesiden viser sterkere advarsel for aktive spill men blokkerer ikke handlingen.**

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

**Ny «Installer Tørny som app»-knapp på hjem-siden og i profilen. Du trenger ikke lenger lete etter «Legg til på hjem-skjerm» i Safari-menyen — Tørny tilbyr installasjonen selv.**

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

**Defensiv sikkerhetsstramming: innloggede brukere kan ikke lenger SELECTe vilkårlige invitasjons-rader fra `public.invitations` — kun sine egne.**

<details>
<summary>Teknisk</summary>

#### Fixed

- **`invitations select by token using (true)`-policy droppet** (migrasjon `0020`) og erstattet med en smal policy `using (lower(email) = lower(auth.jwt() ->> 'email'))`. Den gamle policyen lot enhver innlogget bruker lese ALLE invitasjons-rader — app-laget filtrerte på token, men det var ikke RLS-enforced. Med magic-link-flyten retired (v0.4.0) har token-URL-er ikke vært relevant lenger.
- **Audit av kall-sites** før endring: alle `/admin/*`-paths går via `is_admin()`-gated «invitations admin write»-policy (FOR ALL); `app/invite/actions.ts` + `lib/invitations/quota.ts` bruker «invitations select own outgoing» (0008, filtrerer på `invited_by`); `app/profile/export/route.ts` bruker den nye «invitations select own incoming» (filtrerer på `email = auth.jwt()->>email`). Alle dekket.
- **Tester:** 180/180 grønne etter endring.

</details>

---

### [0.10.12] - 2026-05-14

**Ny «Min historikk»-side på profilen lar deg se alle dine fullførte runder med dato, brutto sum og snitt per hull.**

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

**Admin kan nå endre e-postadressen til en registrert spiller, og se sist innlogget + antall spill på spiller-detaljen.**

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

**Du kan nå slette et spill helt fra admin — nyttig hvis du opprettet noe ved et uhell eller vil rydde opp etter en test.**

<details>
<summary>Teknisk</summary>

#### Added

- **Ny rute `/admin/games/[id]/slett`** — dedikert bekreftelses-side (per destruktiv-handling-mønsteret) som viser spillets navn, tee-off, status og hvor mye som blir slettet (game_players, scores, invitasjoner). Block-betingelse: hvis `game.status === 'active'` vises et rødt banner — admin må avslutte spillet først.
- **Server-action `deleteGame`** i `app/admin/games/[id]/slett/actions.ts` — re-sjekker admin + block-betingelsen, deretter `DELETE FROM games` (FK ON DELETE CASCADE rydder game_players, scores og invitasjoner automatisk). På suksess: redirect til `/admin/games?status=deleted&name=<spillet>` med bekreftelses-banner.
- **«Faresone»-seksjon** nederst på `/admin/games/[id]` med rødtonet ramme + lenke til slett-flyten, samme mønster som `/admin/spillere/[id]`.

</details>

---

### [0.10.9] - 2026-05-14

**Admin ser nå om en ventende invitasjon faktisk har bedt om innloggings-kode, så du vet om mailen ble lest eller bare ligger der.**

<details>
<summary>Teknisk</summary>

#### Added

- **`invitations.opened_at timestamptz`** — ny kolonne (migrasjon `0018`) som stamps når invitéen ber om en OTP-kode på `/login`. Default NULL.
- **Hook i `sendCode`-actionen** i `app/(auth)/login/actions.ts` — etter `signInWithOtp` lykkes, oppdaterer service-role-klient `invitations.opened_at = now()` for rader med matching `email` (case-insensitive) der `accepted_at IS NULL AND opened_at IS NULL`. Service-role brukes fordi brukeren er pre-auth på dette punktet og RLS ville blokkert. Best-effort: feil logges men blokkerer aldri OTP-sendingen.
- **Admin-indikator i `PendingInvitations.tsx`** — under hver «Venter»-rad: «Har bedt om kode {timeAgo}» i forest-grønn hvis `opened_at IS NOT NULL`, eller «Mail sendt, men ikke åpnet ennå» i muted grå hvis NULL. `timeAgo`-helper gir norsk relativ tid («akkurat nå», «3 min siden», «i går», «5 dager siden»).

</details>

---

### [0.10.8] - 2026-05-14

**To nye GDPR-kontroller på profil-siden: du kan laste ned alt Tørny vet om deg som en JSON-fil, og du kan slette kontoen din selv (med mindre du er med i et pågående spill).**

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

**Du kan nå legge til opptil 7 tee-bokser per bane i admin (var 5).**

<details>
<summary>Teknisk</summary>

#### Changed

- **`MAX_TEE_BOXES` bumpet fra 5 til 7** i `app/admin/courses/CourseForm.tsx`. Norske baner har ofte 5 farger (hvit, gul, blå, rød, gull) pluss eventuelt championship-tees for herrer og damer — totalt 7 dekker den vanlige normen. Ingen DB-constraints blokkerer (verifisert mot `0001_initial_schema.sql` — `tee_boxes` har bare value-range CHECKs på slope og par_total).

</details>

---

### [0.10.6] - 2026-05-14

**Vennsinvitasjoner blokkeres nå korrekt hvis mottakeren allerede har startet en innlogging hos Tørny, ikke bare hvis de har fullført profilen.**

<details>
<summary>Teknisk</summary>

#### Fixed

- **Friend-invite-gate i `app/invite/actions.ts`** sjekket bare `public.users` via `email_is_registered`-RPC-en. Brukere som var igjen i `auth.users` etter den retired magic-link-flyten (uten å fullføre `/complete-profile`) slapp gjennom — invitasjons-mailen ble sendt, og det påfølgende `signInWithOtp`-kallet overskrev deres `user_metadata.inviter_name`. Lagt til ny `email_is_in_auth_users(text)`-RPC som sjekker `auth.users` direkte, og gate-en kjører nå begge RPC-ene parallelt i `Promise.all`. Hvis enten returnerer true, blokkeres invitasjonen med samme «Denne personen er allerede på Tørny»-melding.

#### Added

- **Migrasjon `0017_email_in_auth_users_rpc.sql`** — ny SECURITY DEFINER-funksjon `public.email_is_in_auth_users(email_to_check text)` som returnerer bool. Eksplisitt `search_path = public, auth, pg_catalog` for å unngå search-path-injection. GRANT EXECUTE til anon + authenticated for defensiv symmetri med `email_is_invited`. Applied til prod via Supabase MCP.

</details>

---

### [0.10.5] - 2026-05-14

**Kontakt-lenken på personvern-siden går nå til en faktisk e-postadresse (`personvern@tornygolf.no`) i stedet for en admin-bare side spilleren ikke kunne nå.**

<details>
<summary>Teknisk</summary>

#### Fixed

- **Kontakt-seksjonen på `app/legal/privacy/page.tsx`** pekte til `https://tornygolf.no/admin/spillere`, som er auth-gated til admin-brukere. En vanlig spiller som klikket for å utøve GDPR-rettighetene sine endte på en innloggingsvegg de ikke kom forbi. Erstattet med `mailto:personvern@tornygolf.no`. Domeneshop-aliaset må settes opp manuelt for at adressen skal motta mail.

</details>

---

### [0.10.4] - 2026-05-14

**Ny personvern-side på `/legal/privacy` forklarer hvilke data Tørny lagrer om deg, hvor de lagres, og hvilke rettigheter du har.**

<details>
<summary>Teknisk</summary>

#### Added

- **Ny rute `app/legal/privacy/page.tsx`** — server-rendret Server Component, ingen auth-gate (offentlig tilgjengelig). Bruker eksisterende `AppShell` + `PageHeader` + `BackLink`-primitives. Norske bokmål-tekst, Fraunces serif for h1/h2 og Inter sans for body. Dekker: (1) hvilke data Tørny lagrer (navn, e-post, kallenavn, handicap, scorekort, invitasjoner), (2) hvor de lagres (Supabase EU/Frankfurt), (3) hvem som ser dem (medspillere ser navn/kallenavn/handicap/resultater, admin ser e-post), (4) hvor lenge (inntil sletting), (5) GDPR-rettigheter (innsyn, retting, sletting, portabilitet), (6) kontakt-info.
- **`export const metadata`** setter `<title>`-tag for siden.

</details>

---

### [0.10.3] - 2026-05-14

**Hvis admin-handlinger feiler på å lese spillerlisten fra databasen, sier banneret nå «Klarte ikke å lese» i stedet for misvisende «Klarte ikke å lagre».**

<details>
<summary>Teknisk</summary>

#### Fixed

- **Splittet `db_players`-feilkoden i to.** Tidligere brukte alle databasefeil i admin/games-flyten samme `db_players`-key, så bruker så «Klarte ikke å lagre spillerne. Prøv igjen.» selv når det egentlige problemet var en SELECT-feil på roster. Innført ny `db_roster: 'Klarte ikke å lese spillerlisten fra databasen.'`-key som emit-es fra read-paths i tre server-actions: `app/admin/games/new/actions.ts` (publish-mode roster read), `app/admin/games/[id]/edit/actions.ts` (publish/update_scheduled roster read), og `app/admin/games/[id]/actions.ts` (start-game gamePlayers + roster reads). Write-paths (INSERT/UPDATE/DELETE på `game_players`) beholder `db_players`-meldingen.

#### Changed

- **Konsolidert duplisert `ERROR_MESSAGES` og `buildErrorMessage`-helper.** Tre admin/games-sider (`new/page.tsx`, `[id]/edit/page.tsx`, `[id]/page.tsx`) deklarerte hver sin egen kopi av samme error-message-objekt og helper. Trukket ut til `lib/admin/gameErrorMessages.ts` med to eksporterte map-er: `ERROR_MESSAGES_NEW_GAME` (brukt av new + edit, sier «kan publiseres») og `ERROR_MESSAGES_EXISTING_GAME` (brukt av detail-siden, sier «kan startes»). JSDoc dokumenterer denne kopi-variasjonen så fremtidig refaktor ikke uniformerer den ved et uhell.

</details>

---

### [0.10.2] - 2026-05-13

**SyncBanner viser nå norsk, lesbar forklaring («Mistet nett-tilkoblingen», «Innloggingen er utløpt») i stedet for tekniske Safari-feilmeldinger som «TypeError: Load failed».**

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

**Du får nå en mail hver gang en spiller leverer scorekortet sitt — du slipper å åpne appen for å sjekke om det er noe å godkjenne.**

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

**Når du avslutter et spill får alle spillerne automatisk en mail med «Resultatet er klart» og lenke til leaderboard — du trenger ikke lenger sende beskjeden manuelt.**

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
<summary><strong>0.9.x — Sync-feedback under runden (5 entries) — klikk for å vise</strong></summary>

## 0.9.x — Sync-feedback under runden

Hvis et slag ikke kommer fram til serveren, sier appen ifra. Ny sticky banner viser hvor mange slag som mangler synk, surface'r faktiske feilmeldinger fra Supabase, og lar deg manuelt prøve igjen — i stedet for at sync-køen stille henger i bakgrunnen. Pilot-polish underveis: scorekort wiper ikke lenger settet score hvis du tilfeldigvis trykker på det igjen.

### [0.9.4] - 2026-05-13

**Game-hjem-sidens to gate-queries kjører nå parallelt, og audit av leaderboard/submit/scorecard bekrefter at de allerede gjorde det.**

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

**Hull-bytte er ~60% raskere — server-rundene som tidligere kjørte sekvensielt går nå parallelt, og to av dem er slått sammen til én.**

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

**Skjermlesere identifiserer nå ventende invitéer korrekt i opprett-spill-flyten, og lange e-postadresser dytter ikke lenger «Venter»-pillen ut av synsfeltet.**

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

**Et score du har justert med + eller − blir ikke lenger nullstilt til par hvis du tilfeldigvis trykker på kortet igjen — og onboarding-banneret beskriver knappene som faktisk finnes.**

<details>
<summary>Teknisk</summary>

#### Fixed

- **`ScoreCard.onCardClick` no-op'er når score allerede er satt.** Tidligere kalte tap-på-kort-body alltid `onSetScore(par)` uansett current score, så et tilfeldig touch-event etter at brukeren hadde brukt + / − wipet justeringen tilbake til par. Card-tap er nå en first-entry-snarvei kun: hvis `score == null` setter den par som baseline, ellers er kortet en no-op-flate. +/− og «…» er fortsatt full-spektrum-redigerings-overflater. Ny test (`ScoreCard.test.tsx`) verifiserer at tap når `score` er satt ikke kaller `onSetScore`.
- **Onboarding-banner-copy speiler virkeligheten.** Tidligere tekst: «Klikk det øverste kortet for å sette par. Klikk-og-dra opp eller ned for +1/−1.» — men klikk-og-dra finnes ikke i koden (kun + / − / ⋯-knapper). Ny tekst: «Trykk det øverste kortet for å sette par. Bruk + og − for å justere.»

</details>

---

### [0.9.0] - 2026-05-13

**Hvis et slag ikke kommer fram til serveren, sier appen ifra — og du kan trykke «Prøv igjen» i stedet for å lure på om scoren ble lagret.**

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
<summary><strong>0.8.x — Sletting og «trekk tilbake»-flyt (27 entries) — klikk for å vise</strong></summary>

## 0.8.x — Sletting og «trekk tilbake»-flyt

Dedikert slett-side for spillere, fulgt av tre iterasjoner på «trekk tilbake»-bekreftelsen for å få den robust på iPhone-PWA. Pilot-polish på topp: tydeligere tekst utendørs i sol.

### [0.8.5] - 2026-05-13

**Hull-nummer og sekundær-tekst er nå tydeligere å lese på telefon utendørs — viktig før pilot-runden.**

<details>
<summary>Teknisk</summary>

#### Changed

- **Bumpet `--text-muted` (#5C5347 → #4A3F30)** i light mode. Token brukes av tournament-name i hull-headeren, sync-status-linja, score-kort-helpere og ~20 admin-kickers — alle får en touch mer kontrast mot linen-bg (#F8F6F0). Hierarkiet bevares (#4A3F30 er fortsatt klart sekundært mot #1A2E1F text), men perseptuell vekt øker nok til at uppercase-tight-labels og 10–12px sekundær-tekst leses bedre i direkte sollys. Dark mode-tokenet er urørt.
- **`HoleStrip` future-state nummer: font-weight 500 → 600.** Hull som ikke er spilt enda (typisk 17 av 18 ved runde-start) hadde tynne 13px serif-tall som forsvant i sol. Bumpen fra 500 → 600 sharpenser nummer-rendering uten å endre farge eller hierarki — current og completed er fortsatt visuelt distinkte.

</details>

---

### [0.8.4] - 2026-05-13

**Du kan nå trekke tilbake en invitasjon fra iPhone uten at knappene oppfører seg rart.**

<details>
<summary>Teknisk</summary>

#### Fixed

- **«Trekk tilbake»-flyten fungerer nå på iPhone-PWA.** Forrige fix (v0.8.3) erstattet `<details>`-popouten med en URL-toggle inline (Bekreft + Avbryt på samme rad), men brukeren rapporterte at Bekreft-knappen ikke var trykkbar på iPhone, og at Avbryt-knappen i stedet utløste tilbaketrekkingen — antagelig på grunn av en kollisjon mellom server-action form-submit og SmartLink-prefetch på samme touch-event. Bytter nå til samme mønster som slett-bruker (`/admin/spillere/[id]/slett`): «Trekk tilbake»-lenken navigerer til en dedikert bekreftelses-side på `/admin/spillere/invitations/[id]/trekk-tilbake/` med stor Bekreft-knapp og separat Avbryt-lenke. Ingen knapper deler tap-target, ingen flyktige toggle-tilstander.

</details>

---

### [0.8.3] - 2026-05-13

**Forsøk på å fikse «trekk tilbake»-bekreftelsen for iPhone — viste seg å ikke fungere helt, og ble erstattet av løsningen i 0.8.4.**

<details>
<summary>Teknisk</summary>

#### Fixed

- **«Trekk tilbake»-bekreftelsen fungerte ikke på iPhone-PWA.** Den brukte `<details>`/`<summary>` for inline-popout, men iOS Safari håndterer tap-events inni open-state-popouten upålitelig (tap kan boble til summary og lukke popouten før Bekreft-knappen registrerer klikket). I tillegg ble popouten klippet av kortets `overflow-hidden`, og kunne overlappe nabo-radens knapper slik at et klikk for «Bekreft» traff «Send på nytt» på raden under. Erstattet med en server-rendret URL-toggle: trykk på «Trekk tilbake» legger til `?confirm=<id>` i URL-en, og den raden rendres i confirm-modus inline med tydelige Bekreft + Avbryt-knapper. Ingen JS, ingen popout-quirks, fungerer likt på alle nettlesere og PWA-shells.

</details>

---

### [0.8.2] - 2026-05-13

**Ventende invitéer dukker ikke lenger opp dobbelt i admin-spillerlista, og «trekk tilbake» frigjør e-postadressen som forventet.**

<details>
<summary>Teknisk</summary>

#### Fixed

- **Spillerliste på `/admin/spillere` viser ikke lenger ventende invitéer dobbelt.** Etter at migrasjon `0014_pending_users` begynte å auto-opprette `public.users`-rader for hver `auth.users`, dukket ventende invitéer (de uten `profile_completed_at`) opp som «registrerte spillere» i tillegg til å være i ventende-invitasjoner-seksjonen. Spillerlista filtrerer nå på `profile_completed_at IS NOT NULL`, og «X registrert»-tellingen matcher.
- **«Trekk tilbake»-orphan-cleanup tilpasset trigger-baserte `public.users`-rader.** Sjekken var «hvis `public.users`-raden mangler, slett `auth.users`» — men siden trigger nå alltid oppretter raden, ble den sjekken alltid usann. Logikken bruker nå `profile_completed_at IS NULL` som signal på «invitéen fullførte aldri profil», så `auth.users` ryddes som forventet.
- **Null-safe visning av navn** på spiller-detalj og slett-bekreftelses-sider — invitéer uten utfylt navn vises med e-postadressen i stedet for en tom overskrift.

</details>

---

### [0.8.1] - 2026-05-13

**Hvis sletting av en spiller mislykkes, sier appen nå hvorfor — i stedet for å se ut som om ingenting skjedde.**

<details>
<summary>Teknisk</summary>

#### Fixed

- **Silent banner-feil ved feilet sletting.** Detalj-siden (`/admin/spillere/[id]`) viste ingen tilbakemelding når slett-flyten feilet eller ble blokkert av self-protect — den manglet meldinger for `self_delete_forbidden`, `still_has_games` og `auth_delete_failed` i sin `ERROR_MESSAGES`-tabell. Nå viser banneret en ærlig forklaring i alle tre tilfeller, inkludert hint om mulige FK-grunner («data knyttet til seg — invitasjoner sendt, baner opprettet eller scores skrevet»).
- **Ærligere kode-kommentar om FK-cascade-grensene** i `deleteUser`-action: dokumenterer at `public.users`-cascaden kun cleaner opp én rad, og at andre FK-er (`scores.entered_by`, `invitations.invited_by` osv.) er trygt dekket i dagens admin-modell men må sjekkes eksplisitt når arrangør-rollen lander.

</details>

---

### [0.8.0] - 2026-05-13

**Du kan slette en spiller fra admin — nyttig hvis du sendte invitasjon til feil e-postadresse.**

<details>
<summary>Teknisk</summary>

#### Added

- **Slett-flyt for spillere på `/admin/spillere/[id]/slett`.** Dedikert bekreftelses-side viser navn, e-post og forklaring. Slett-knappen kaller `auth.admin.deleteUser` via service-role-klienten — `auth.users`-raden slettes, `public.users` cascade-slettes automatisk, og e-posten frigjøres for ny invitasjon.
- **Block-betingelser** på server-side: kan ikke slette deg selv (self-protect), kan ikke slette en spiller som har en eller flere `game_players`-rader.

</details>

---

<details>
<summary><strong>0.7.x — Bruker-detalj-redigering (1 entry) — klikk for å vise</strong></summary>

Klikk på en spiller i admin for å redigere navn, kallenavn og handicap. Faresone-seksjon på detalj-siden forbereder slett-flyten som lander i 0.8.0.

### [0.7.0] - 2026-05-13

**Klikk på en spiller i admin for å redigere navn, kallenavn og handicap-indeks.**

#### Added

- **Bruker-detalj på `/admin/spillere/[id]`.** Klikkbar rad i spillerlista åpner form for å redigere navn, kallenavn og handicap-indeks. Lagre-knapp gir ærlig success/feil-banner.
- **Faresone-seksjon** på detalj-siden viser slett-lenken som disabled inntil neste leveranse aktiverer den. Forklarende tekst hvis spilleren har historikk eller hvis det er deg selv.

#### Changed

- **RLS:** Ny policy `users admin update` lar admin oppdatere andre bruker-rader (tidligere kun egen rad). Migrasjonen heter `0015_admin_user_management` (filnavn-kollisjon med `0014_pending_users` ble rensket opp ved merge).

</details>

---

<details>
<summary><strong>0.6.x — Samlet spilleradministrasjon (1 entry) — klikk for å vise</strong></summary>

Erstatter den gamle `/admin/invitations`-flata med `/admin/spillere`, som samler registrerte spillere, ventende invitasjoner og invitasjons-form på ett sted og legger til «Send på nytt» og «Trekk tilbake»-actions.

### [0.6.0] - 2026-05-13

**Ny «Spillere»-side i admin samler registrerte spillere, ventende invitasjoner og invitasjons-form på ett sted, og du kan re-sende eller trekke tilbake invitasjoner derfra.**

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
<summary><strong>0.5.x — Pending-invitees-integrasjon (11 entries) — klikk for å vise</strong></summary>

Ventende invitéer kan nå velges til lag og flight før de selv har logget inn. Ti patch-bumps fulgte for å rydde fallouten fra migrasjon 0014, som auto-oppretter `public.users`-rader for hver `auth.users` og som dermed brøt onboarding-gate, picker-filter, draft-validering og start-spill-guard.

### [0.5.10] - 2026-05-13

**«Akseptert»-statusen på en invitasjon stemmer nå med om spilleren faktisk har fullført profilen sin.**

#### Fixed
- `Akseptert`-pille på `/admin/invitations` reflekterer nå faktisk onboarding (`profile_completed_at IS NOT NULL`), ikke bare at invitasjons-raden ble markert akseptert ved OTP-verify. Stoppet misvisende «Akseptert»-status for brukere som klikket gammel magic-link-mail uten å fullføre profil.

### [0.5.9] - 2026-05-13

**Beskytter mot at en bruker blir hengende som «Venter» selv etter at de har lagret profilen sin.**

#### Fixed
- Profil-oppdateringen stamper nå `profile_completed_at` som defence-in-depth, så en bruker som havner på `/profile` uten å ha fullført onboarding (deploy-vindu-race i tidligere release) blir ikke sittende fast som «Venter» i picker-en.

### [0.5.8] - 2026-05-13

**Du kan ikke starte et planlagt spill hvis noen av deltakerne fortsatt mangler å fullføre profilen.**

#### Fixed
- «Start spillet» (draft → aktiv) blokkeres nå hvis ikke alle valgte spillere har fullført profil — samme guard som scheduled-pathen.
- Invitér-en-venn-actionen sjekker `profile_completed_at` i stedet for "rad finnes ikke" som ble dødt etter migrasjon 0014.

### [0.5.7] - 2026-05-13

**Ventende invitéer uten utfylt navn vises med e-postadressen i stedet for tom plass.**

#### Fixed
- Rendring av ventende invitéer (uten utfylt navn) faller tilbake til e-postadressen i stedet for å vise tom tekst — gjelder admins spill-detaljside (lag/flight-oversikt) og spillernes venterom-visning av draft-spill.

### [0.5.6] - 2026-05-13

**Nye brukere sendes igjen til onboarding-skjermen ved første innlogging.**

#### Fixed
- Nye brukere ble ikke sendt til onboarding på `/` og `/profile` etter at trigger-en fra migrasjon 0014 begynte å pre-opprette `public.users`-rader. Gate-en sjekker nå `profile_completed_at` i stedet for "rad finnes ikke".

### [0.5.5] - 2026-05-13

**Førstegangs-onboarding fungerer igjen for nye brukere — var midlertidig brutt etter en bakgrunnsendring.**

#### Fixed
- `complete-profile` oppdaterer nå den auto-opprettede `public.users`-raden i stedet for å forsøke å sette inn på nytt. Uten denne ville migrasjon 0014 brutt all ny brukerregistrering.

### [0.5.4] - 2026-05-13

**Feilmeldingen for ventende spillere på opprett-spill-siden viser nå e-postadressene i stedet for «{LIST}».**

#### Fixed
- Feilmelding for ventende spillere viste `{LIST}`-plassholderen bokstavelig på opprett-spill-siden. Bruker nå samme `buildErrorMessage`-helper som rediger-spill og spill-detalj.

### [0.5.3] - 2026-05-13

**Ekstra sikkerhets-sjekk: et publisert spill kan ikke startes med ventende spillere selv om databasen blir manuelt redigert.**

#### Fixed
- Start spill blokkeres også (defence-in-depth) hvis et publisert spill noensinne skulle få ventende spillere via direkte DB-redigering.

### [0.5.2] - 2026-05-13

**Du kan ikke endre et eksisterende spill til publisert hvis det fortsatt har ventende invitéer.**

#### Fixed
- Publisering/oppdatering fra rediger-spill blokkeres med tydelig e-postliste hvis ventende invitasjoner står på rosteret.

### [0.5.1] - 2026-05-13

**Du kan ikke publisere et nytt spill hvis noen av deltakerne ikke har fullført profilen sin.**

#### Fixed
- Publisering av nytt spill blokkeres nå hvis ikke alle valgte spillere har fullført profil.

### [0.5.0] - 2026-05-13

**Du kan nå velge ventende invitéer til lag og flight før de selv har logget inn.**

#### Added
- Inviterte spillere som ikke har logget inn ennå dukker opp i game-picker-en med en gul `Venter`-pille. Admin kan velge dem til lag og flight og lagre utkast.

</details>

---

<details>
<summary><strong>0.4.x — OTP-kode-innlogging (4 entries) — klikk for å vise</strong></summary>

Bytte fra magic-link til 6–8-sifret kode i mail, som fjernet to iOS-PWA-blokkerings-bugs samtidig. Inkluderer ærligere admin-invitasjons-banner ved Resend-feil og forberedelse for pending-invitees-sporing i 0.5.x.

### [0.4.3] - 2026-05-13

**Tørny vet nå hvilke spillere som har fullført profilen — forberedelse for å vise ventende invitéer riktig i spill-pickeren.**

#### Added

- Inviterte spillere som ikke har fullført registrering blir nå sporet via `profile_completed_at`. Forberedelse for å vise dem i game-picker-en.

### [0.4.2] - 2026-05-13

**Hvis «Du er invitert»-mailen ikke kommer fram, sier admin-banneret det ærlig i stedet for å lyve «Invitasjon sendt».**

#### Fixed

- **Admin-invitasjons-banneret lyver ikke lenger om mail-utsending.** Tidligere viste `/admin/invitations` alltid «✓ Invitasjon sendt»-banner etter at raden var lagret, selv om Resend-utsendingen faktisk feilet — feilen ble bare stille logget i Vercel-runtime-loggene. Hvis Resend kaster nå, vises et ærlig feil-banner: «Invitasjonen ble lagret, men «Du er invitert»-mail kom ikke ut. Sjekk Vercel-loggene for detaljer.» Raden i `invitations`-tabellen bevares fortsatt (admin kan re-sende manuelt når mail-konfigen er fikset).

### [0.4.1] - 2026-05-13

**Innloggings-kode-feltet godtar nå 8-sifrede koder, som er Supabase' faktiske standard.**

#### Fixed

- **Kode-input godtar nå 6–8 sifre, ikke bare 6.** Supabase' default OTP-lengde er 8 sifre (endret i mai 2024) — vi hardkodet 6 sifre i kode-feltet, så brukere som fikk en 8-sifret kode kunne kun skrive inn de første 6 og fikk feilmelding. Pattern og maxLength er nå fleksible, hjelpe-tekst sier «kode» i stedet for «6-sifret kode».

### [0.4.0] - 2026-05-13

**Du logger inn med en 6–8-sifret kode du taster inn, i stedet for å klikke en lenke i mailen. Inviterte spillere får først en notifikasjons-mail og må be om innloggings-kode selv etterpå.**

#### Changed

- **Innlogging går nå via 6-sifret kode i mail i stedet for å klikke lenke.** Du skriver inn e-post som før, men i stedet for å klikke en lenke i mailen mottar du en kode (f.eks. `482 619`) som du taster inn på samme side. Fjerner to pre-existing problemer som blokkerte PWA-innlogging på iPhone: (a) magic-link åpnet seg i Safari i stedet for PWA-en og brøt PKCE-handoff-en, (b) mail-scannere konsumerte engangs-token-en før brukeren faktisk klikket. Begge problemene forsvinner når det ikke finnes noen URL å konsumere — bare en kode som leses med øynene og tastes inn.
- **Invitasjons-mailen er ny.** Når admin inviterer en kompis sender Tørny nå en kort notifikasjons-mail («Du er invitert. Gå til tornygolf.no og logg inn med din e-post.») via Resend. Selve innloggings-koden får invitéen først når de kommer til /login og taster e-posten sin der. To mailer per invitasjon (notifikasjon + kode), men én og samme innloggings-flyt for alle.

#### Removed

- **Magic-link-URL-flyten.** `/auth/callback`-route-en redirecter alle gamle klikk til `/login?error=link_expired` i en 30-dagers overgangsperiode. Etter 2026-06-13 fjernes route-en helt (tracked in TODO.md).

</details>

---

<details>
<summary><strong>0.3.x — Logo og pre-OTP-fixes (4 entries) — klikk for å vise</strong></summary>

Tørny fikk sin egen visuelle identitet (wordmark med champagne-prikk på login og app-ikoner), pluss tre fixes som ryddet opp før OTP-omleggingen: invitasjoner som sto som «VENTER» etter aksept, tee-off-tider som lå 1–2 timer feil, og «lagre utkast» som låste seg på native HTML5-validering.

### [0.3.3] - 2026-05-13

**Invitasjoner flippes nå korrekt til «Akseptert» når mottakeren logger inn første gang — før dette sto alle som «Venter» uansett.**

#### Fixed

- **Invitasjoner sto som «VENTER» selv etter aksept.** Hele tabellen `public.invitations` hadde `accepted_at = NULL` på alle 8 rader — ingen kode skrev til kolonnen noensinne. Auth-callback (`app/auth/callback/route.ts`) markerer nå alle ventende invitasjoner for innlogget brukers e-post som akseptert etter vellykket `exchangeCodeForSession`. Best-effort: feil i side-effekten blokkerer aldri innloggingen. Ny RLS-policy (`migration 0012`) lar bruker UPDATEe sin egen invitasjon — kun `accepted_at`-flippen er tillatt, alle andre kolonner må forbli identiske. Backfill kjørt mot 4 stranded rader som hadde `auth.users.confirmed_at` satt.

### [0.3.2] - 2026-05-13

**Tee-off-tider viser nå riktig tid på alle skjermer — var av med 1–2 timer i et kort vindu rett etter sideinnlasting.**

#### Fixed

- **Tee-off-tider rendret 1–2 timer feil under hydration.** `lib/format/teeOff.ts` brukte lokal-TZ `Date.getHours/getMinutes/getDate/getMonth` — på Vercel-serveren (UTC) ga det feil tid i HTML-en før hydration på iPhone (Europe/Oslo) tok over. Rammet hjem-skjermen, runde-siden og leaderboarden. Bytter til `Intl.DateTimeFormat` med eksplisitt `timeZone: 'Europe/Oslo'`, så server og klient nå renderer identiske strenger uavhengig av host-TZ. DST håndteres riktig (UTC → Oslo sommer +02, vinter +01). 11 nye tester verifiserer oppførselen under flere host-TZ-er.

### [0.3.1] - 2026-05-13

**Du kan lagre et halvferdig spill-utkast uten at bane- og handicap-feltene må fylles ut først.**

#### Fixed

- **«Lagre utkast» låste seg på native HTML5-validering.** Knappen blokkerte sending så snart et `<select required>`-felt (bane/tee/handicap-allowance) var tomt, selv om hele poenget med utkast er å lagre delvis utfylt skjema. Lagt til `formNoValidate` på utkast-knappen — publiser-knappen validerer fortsatt normalt, og server-siden tar fortsatt vare på `name` som eneste obligatoriske felt for utkast.

### [0.3.0] - 2026-05-13

**Tørny har fått sin egen logo — wordmark med champagne-prikk på login-skjermen og som app-ikon.**

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

**Innfører versjonerings-disiplin: hver bruker-synlig endring skal bumpe versjonen og legge til CHANGELOG-entry i samme commit.**

<details>
<summary>Teknisk</summary>

#### Added

- Versjonerings-disiplin: hver commit som endrer bruker-synlig oppførsel bumper `package.json` og legger til entry i denne fila. Reglene står i `CLAUDE.md`.

#### Notes

- Versjonen som vises i app-footeren (`AppVersionFooter.tsx`) er allerede koblet til `package.json` via `next.config.ts` — fra og med dette bumpet vil footeren reflektere reell release-versjon istedenfor en konstant `v0.1.0`.

</details>

---

## Pre-disiplin (`0.1.0`)

Versjonen `0.1.0` dekker all utvikling fra Phase 0 til og med Phase 12.5. Ingen detaljerte release-notes ble ført i denne perioden. Et grovt sammendrag:

- **Phase 0–4**: prosjektoppsett, datamodell, Supabase + RLS, scoring-bibliotek (`lib/scoring/`) med 40 unit-tester
- **Phase 5–8**: auth-flyt (magic link), invitasjons-system, admin-flate for baner og spill, hull-skjerm med score-input
- **Phase 9–10**: offline-sync via Dexie, realtime-oppdateringer, peer-godkjenning og admin-overstyring
- **Phase 11–12**: PWA-oppsett, premium-stil med forest-and-champagne palett, leaderboard og scorekort
- **Phase 12.5**: draft-mode på venterom med progressive disclosure, fargeharmonisering for status-bannere

Full historikk: `git log` mellom prosjektstart og commit `02cf8c0`.
