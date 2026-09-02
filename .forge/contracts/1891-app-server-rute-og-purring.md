# Spec: App→server-ruta, purreknappen og slutten på «gå til nettsiden»-blindveiene

Dekker **#1891** (henvisningene) og **#1889** (purreknappen) i én PR. #1889 er en
eksplisitt del-leveranse: kriteriene 3–5 under ER #1889. Kontraktøkt 2026-09-02
med eieren; alle seks gråsonene ble avgjort der (Key Decisions).

## Problem

Appen har ingen autentisert HTTP-vei til serveren. Alt som trenger Node —
`notify()`, Resend-mail, push, service-role — er utenfor rekkevidde, og appen
løser det i dag med tekst: «det gjør du på nettsiden», uten lenke. Appen og
Safari deler ikke pålogging (OTP-kode), så selv en lenke gir ny innlogging.
Eieren: «Vi kan ikke bare si 'gå til nettsiden' … Helst blir dette løst av at
vi får inn dette i appen.»

Konkret bit: står arrangøren på avslutt-skjermen og noen mangler kort, er
eneste vei videre å merke dem som trukket — en destruktiv handling presentert
som eneste alternativ (#1889). Webben HAR purringen (`remindUnsubmittedPlayers`),
men på status-siden, ikke på avslutt-flaten; appen har den ikke i det hele tatt.

## Research Findings (verifisert mot main `b21a0381`, 2026-09-02)

- **Den første bruker-token-ruta finnes alt:** `app/api/account/delete/route.ts`
  (#1876, merget 2026-09-02). `authenticatedUserId(request)` leser
  `Authorization: Bearer <access_token>` og validerer med
  `getAdminClient().auth.getUser(token)`; bruker-id KUN fra tokenet; faste,
  ugjennomsiktige feilkoder; `maxDuration = 60`; `api/` er utenfor
  proxy-matcheren, så ruta eier egen auth. App-siden: `native/app/src/data/account.ts`
  har `callRoute` med vakt-rekkefølgen nett → `EXPO_PUBLIC_WEB_BASE_URL` →
  token → kall, og typede utfall. Runbook: `docs/native/app-spike.md` ≥ :1011.
  **Dette er mønsteret. Ikke lag en tredje variant.**
- **Purre-kjernen:** `remindUnsubmittedPlayers`
  (`app/[locale]/admin/games/[id]/status/actions.ts`) — `requireAdmin`, krever
  `status === 'active'`, teller fylte hull per spiller (`scores.strokes not null`,
  `holeCountForSegment` for front9/back9), ekskluderer #1466-søsken, velger mål
  med `selectDeliveryReminderTargets` (`lib/games/deliveryStatus.ts`: ferdig +
  ikke levert + ikke trukket + ikke gjest), sender `sendDeliveryReminder`
  (`lib/notifications/deliveryReminder.ts`) per mål med `Promise.allSettled`, og
  stempler `deliver_reminder_sent_at`. Alt dette er kjernen som skal få ett hjem.
- **Kanal-regelen bor i `notify()`** (`lib/notifications/notify.ts`): innboks-rad
  alltid; push (Web Push + APNs, `sendPushToUser`) og `shouldAlsoSendMail`
  KUN når `last_seen_at` er eldre enn 5 min (`OFF_APP_THRESHOLD_MS`). **Appen
  skriver aldri `last_seen_at`** (kun `proxy.ts` gjør det) og **har ingen
  innboks-skjerm** — en ren app-spiller regnes derfor alltid som «ikke inne» og
  får e-post nå, og APNs-push på samme gren den dagen appen registrerer
  tokens (N7). Ingen ny regel trengs for det.
- **Godkjenn på vegne av gruppa er ren DB for arrangøren.** Webbens override
  `adminApproveScorecard` (`admin/games/[id]/actions.ts:174`,
  `loadAdminOrCreatorContext`, #429) skriver `approved_at/approved_by_user_id`
  på RLS-klienten og **varsler ikke** («success without re-notifying»).
  `guard_game_players_self_update` (0147) slipper oppretteren gjennom på andres
  rad («creator bypass»), og appens `approveScorecard`
  (`native/app/src/data/playerActions.ts:141`) skriver nøyaktig de kolonnene.
  Ingen rute, ingen migrasjon.
- **Trekk deg selv er IKKE ren DB** (smedens gjetning var feil): vakt (c) i
  0147 nekter egen rad, webbens `withdrawFromGame` bruker service-role →
  oppfølger #1917. Lagkort-levering kaskaderer med service-role + varsler →
  #1918. Invitasjon = Resend + rate-limit → #1919. Gjenåpning er admin-only
  by design (N6c). Cup-avslutning eies av cup-flyten (service-role, Should).
- **Innlogget web-åpning finnes ikke:** webben har ingen `token_hash`-/
  magic-link-rute (grep tomt) — «åpne nettsiden innlogget» ville vært en ny
  auth-mekanisme. Forkastet (Key Decisions). Det som finnes: proxyen sender
  uinnloggede til `/login?next=<sti>` (proxy.ts:304), så en dyplenke lander
  riktig etter kode-innlogging.
- **Webbens avslutt-flater** som viser «mangler kort» uten purring:
  `app/[locale]/games/[id]/avslutt/page.tsx` (oppretter, `requireAdminOrCreator`,
  `missingList`), `admin/games/[id]/avslutt/page.tsx` (side-kåring) og
  `admin/games/[id]/avslutt-likevel/page.tsx` (`requireAdmin`).
- **`Linking.openURL`** er del av react-native — ingen ny modul. Ingen
  universal links/`associatedDomains` er satt opp (`app.json`), og trengs ikke.
- Rate-limit-presedens: `lib/admin/rateLimit.ts` (`consume_admin_rate_limit`) —
  brukes IKKE her (eiervalg: ingen sperre), notert for #1919.
- DeepWiki utilgjengelig i økta; påstandene over er lest i repoet, som er
  ferskere enn treningsdata.

## Prior Decisions (videreført)

- Ingen service-role i appen; RLS/server er authz (AGENTS trap 3). Bruker-id
  KUN fra validert token (#1876).
- En regel har ett hjem (trap 4): purre-målregelen bor i
  `selectDeliveryReminderTargets`, kanal-regelen i `notify()` — speiles ALDRI i
  appen; appen spør serveren.
- Ærlig-feil-guardrailen: manglende env → synlig melding, aldri stille no-op.
  Skriv krever nett (N6-linja). Typede utfall i datalaget, copy i skjermen.
- Design-tokens/`useTheme` (#1830/#1833), `[no-changelog]` på native-commits,
  relative imports i `native/app`, én simulator per økt.
- Web-endringer som er bruker-synlige får `.changes/`-notat (feat).
- «Sekretariatet bor på nettsiden» er rollefordeling, ikke et hull (#1856).
- **Auth-flate ⇒ PR-en auto-merges ALDRI** (merge-policyen); ingen prod-DB-
  migrasjon i denne PR-en.

## Design

### 1. Delt adgangssjekk (web)

Trekk `authenticatedUserId` ut av `app/api/account/delete/route.ts` til en delt
modul (`lib/api/appAuth.ts` — navn = diskresjon) og la slette-ruta bruke den;
dens tester består uendret. Legg til den token-baserte tvillingen av
`requireAdminOrCreator`: `isGameOrganiser(userId, gameId)` → `is_admin` ELLER
`games.created_by === userId`, lest med admin-klient (ingen cookies i ruter).
Alle framtidige app→server-ruter (#1917–#1919) bruker de to.

### 2. Purre-kjernen får ett hjem (web)

`lib/games/remindUnsubmitted.ts` (`server-only`, navn = diskresjon):

- `previewReminder(gameId)` → `{ targets: number; lastRemindedAt: string | null }`
  — samme målregel som i dag (fylte hull ≥ `expectedHoles`, #1466-søsken
  ekskludert, gjester ekskludert); `lastRemindedAt` = `max(deliver_reminder_sent_at)`
  over spillets `game_players` (også auto-purringens stempel teller — det ER
  «sist noen fikk purring»).
- `sendReminders(gameId)` → `{ reminded: number }` — send + stempel, eksakt
  som `remindUnsubmittedPlayers` gjør i dag. Krever `status === 'active'`
  (typet `not_active`-utfall). Ingen idempotens-sperre (eiervalg).
- Admin-klient for lesing/skriving; **authz ligger hos kalleren** (server-action
  gate eller rute-gate). `remindUnsubmittedPlayers` på status-siden blir en tynn
  wrapper (samme redirect-semantikk, `actions.test.ts` består).

### 3. Ruta (web)

`app/api/games/[id]/remind/route.ts` (+ `route.test.ts`), samme form som
slette-ruta, wire frosset i filhodet:

```
GET  200 { targets, lastRemindedAt }          POST 200 { reminded }
401 { error: 'unauthorized' }   403 { error: 'forbidden' }   404 { error: 'not_found' }
409 { error: 'not_active' }     500 { error: 'remind_failed' }
```

Ingen body, ingen query-id utover `[id]` i stien. `maxDuration = 60` (mail
til N spillere). Feil-bodyer er faste koder, aldri `err.message`.

### 4. Purreknappen på webbens avslutt-flater

I «mangler kort»-blokken på alle tre flatene (Research): knapp
**«Purr på dem som mangler (N)»** der N = `targets`. N = 0 → ingen knapp, én
setning: «Ingen av dem har ført alle hullene ennå. Purring hjelper først da.»
Etter purring: suksessbanner **«Purret. De får et varsel nå.»** (search-param-
mønsteret fra status-siden). Server-action bak knappen gater med
`requireAdminOrCreator` (oppretter-flaten) / `requireAdmin` (admin-flatene) og
kaller kjernen. Copy via `messages/*.json` som ellers på webben; kjør humanizer.

### 5. Purreknappen i appen (EndGame)

`native/app/src/data/remind.ts` (+tester): `fetchReminderPreview(gameId)` (GET)
og `sendReminder(gameId)` (POST) med vakt-rekkefølgen fra `account.ts`. Trekk
gjerne `callRoute`/`readBody`/`accessToken` ut av `account.ts` til en delt
`data/webApi.ts` så mønsteret har ett hjem (anbefalt, diskresjon).

I `EndGame.tsx`, under «Disse mangler kort», når det finnes mangler:
- Knapp «Purr på dem som mangler (N)» (N fra GET). `plan.missing.length − N > 0`
  → setning «M av dem har ikke ført alle hullene ennå. Purring hjelper først da.»
  N = 0 → bare setningen, ingen knapp.
- `lastRemindedAt` satt → «Sist purret kl. HH.MM» (Oslo-tid; bruk samme
  formatering som appen ellers — ALDRI webbens Oslo-parser, jf. Hermes-fella).
- Suksess → «Purret. De får et varsel nå.» + ny GET (oppdatert «Sist purret»).
- Ærlige feil: offline → «Purring krever nett.»; `unauthorized` → «Logg inn på
  nytt og prøv igjen.»; `not_active` → `END_GAME_TEXT.notActive`; mangler env →
  samme melding som slette-flyten; ellers «Fikk ikke purret. Prøv igjen.»
  Knappen er disabled mens kallet pågår. Ingen sperre etterpå (eiervalg).

### 6. Godkjenn på vegne av gruppa (app, ren DB)

I `plan.unapproved`-banneret på EndGame: per spiller en knapp
**«Godkjenn på vegne av gruppa»** → `Alert`-bekreftelse («Godkjenn kortet til
{navn}? Du står som den som godkjente.») → eksisterende
`approveScorecard(gameId, playerUserId)` → `refresh()`. Ny `unapprovedNote`:
«En medspiller må godkjenne hvert kort før du kan avslutte. Be dem åpne runden
og godkjenne — eller godkjenn på vegne av gruppa her.» Ingen varsel (webbens
override sender heller ikke). 0 rader → samme `resolveZeroRows`-tolkning som i
dag (alt godkjent = idempotent; nektet = ærlig feil).

### 7. Ekte knapper på henvisningene som blir igjen (app)

`native/app/src/lib/webLink.ts` (+tester): `webUrl(path)` bygger
`${EXPO_PUBLIC_WEB_BASE_URL}${path}` (mangler env → typet feil, skjermen viser
den) og `openWeb(path)` kaller `Linking.openURL`. Én liten `WebLinkButton`
(sekundær knapp + fast undertekst **«Åpner nettsiden i nettleseren. Der logger
du inn med kode.»**). Proxyen sørger for `?next=` etter innlogging.

| # | Sted | Ny knapp → sti | Status |
|---|---|---|---|
| 2 | `endGameCopy.ts` `CUP_NOTE` (GameHome/OrganiserSection) | «Åpne cupen» → `/cup/{tournamentId}` | bevisst grense |
| 3 | `endGameCopy.ts` `ownRowHint` + `rosterCopy.ts:50` | «Trekk deg på nettsiden» → `/games/{id}/trekk-fra` | midlertidig, #1917 |
| 5 | `Scorecard.tsx:232` (+ `Hole.tsx:399`-kommentaren) | «Lever lagkortet på nettsiden» → `/games/{id}/submit` | midlertidig, #1918 |
| 6 | `OrganiserSection.tsx:365`, `PlayersStep.tsx:130` | «Inviter på nettsiden» → `/games/{id}/spillere` (opprett-steget: `/opprett-spill`) | midlertidig, #1919 |
| 7 | `FormatStep.tsx:69`, `createGameCopy.ts:99` | «Opprett på nettsiden» → `/opprett-spill` | bevisst gate |
| 8 | `formatGate.ts:74-75`, `ResultView.tsx:20` | «Åpne runden på nettsiden» → `/games/{id}` | bevisst gate |
| 9 | `CourseStep.tsx:158` | «Legg inn teer på nettsiden» → `/admin/courses/{courseId}` | bevisst grense |

Ikke rørt: #1 (erstattes av seksjon 6), #4 `confirmBody` (informasjon i en
dialog, ikke en blindvei — gjenåpning er admin-only by design), #10 (kommentar).
Stiene verifiseres mot `app/[locale]/` ved bygging (I1); finnes ikke sida for
rollen, velg den nærmeste som gater riktig. Teksten «på nettsiden ennå» beholdes
der den er sann.

### 8. Runbook

`docs/native/app-spike.md`: ny seksjon «App→server-ruter» — den delte
adgangssjekken, wire-kontrakten for purring, at appen ikke viser innboks-varsler
(kanal-regelen og N7-koblingen), lenkeknapp-mønsteret, og at #1917–#1919 arver
alt dette. Kartleggingstabellen over med avgjørelsene bokføres i #1891.

## Edge Cases & Guardrails

- **Ikke arrangør** (spiller med gyldig token) → 403; appen viser aldri knappen
  for andre enn oppretteren (EndGame er alt oppretter-skjerm).
- **Utløpt token** → 401 → «Logg inn på nytt» — aldri lokal opprydding.
- **Runden avsluttet/ikke startet** → 409 `not_active`; appen viser
  `notActive`/`alreadyFinished` og henter bundelen på nytt.
- **Cup-runder**: purring tillates (status-siden tillater det i dag); kjernen
  arver #1466-ekskluderingen for front9/back9.
- **Gjester** purres aldri (arves fra målregelen). **Trukne** teller ikke.
- **Mail-/push-feil** er best-effort (`allSettled`) — 200 med `reminded` =
  antall mål, som i dag; ingen falsk 500 for én død adresse.
- **Dobbelttrykk**: knapp disabled under kall; to fullførte kall = to purringer
  (eiervalg: tillit + «Sist purret»-linja).
- **Manglende `EXPO_PUBLIC_WEB_BASE_URL`** i et bygg: både purring og
  lenkeknapper sier det tydelig (delt melding), ingen stille knapp.
- **`Linking.openURL` feiler** (ingen nettleser) → «Fikk ikke åpnet nettsiden.»
- **Godkjenn på vegne av gruppa** når kortet i mellomtiden er avvist/gjenåpnet
  → 0 rader → ærlig feil + refresh; aldri godkjenning av et ulevert kort
  (UPDATE-filteret `submitted_at not null` står).
- **Staging-vern**: e2e purrer kun spill seeded med `E2E_*`-brukere; ingen
  ekte adresser får mail.

## Key Decisions (eier, 2026-09-02)

1. **Ruta bor på nettsiden, én adresse per handling, én delt adgangssjekk**
   (også slette-ruta flyttes over). Forkastet: én generell «gjør dette»-adresse
   med handlingsfelt — billigere per handling, tyngre å sikre/teste.
2. **Purre-kanal = webbens regel** (innboks alltid; push + e-post når ikke inne).
   Eieren spurte om app-spillere merker noe: ja — appen melder aldri «inne», så
   de får e-post nå og APNs-push når N7 lander. Bokføres i runbooken.
3. **Hvem purres = ferdige som ikke har levert** (som webben). Knappen viser
   antallet den treffer; de midt i runden får en setning, ikke purring.
4. **Ingen sperre på gjentatt purring**; «Sist purret kl.» vises. Forkastet:
   10-minutters sperre.
5. **Ingen innlogget web-åpning.** Handlinger inn i appen der det går; resten
   får ekte knapp + ærlig setning om kode-innlogging. Forkastet: engangslenke-
   handoff (ny auth-flate for få, mest admin-nære tilfeller).
6. **Omfang A:** ruta + purring (#1889) + godkjenn-på-vegne-av + lenkeknapper
   nå; trekk deg selv (#1917), lagkort (#1918), invitasjon (#1919) som egne
   små issues når ruta finnes. Forkastet: alt i én PR.

**Claude's Discretion:** modul-/rutenavn, om `callRoute` trekkes ut til
`webApi.ts`, hvordan «Sist purret»-tida formateres, om web-knappen får samme
«Sist purret»-linje (fint, ikke krav), plassering/utseende av `WebLinkButton`,
i18n-nøkkelnavn på webben, om 404 vs 403 ved ukjent spill (velg én, dokumentér
i wire-blokken).

## Success Criteria

- [ ] 1. **Delt adgangssjekk:** `app/api/account/delete/route.ts` importerer
  `authenticatedUserId` fra den delte modulen (diff-bevis), dens `route.test.ts`
  består uendret; `isGameOrganiser` har Type A-tester (admin / oppretter /
  fremmed / ukjent spill).
- [ ] 2. **Rute-tester (rot):** 401 uten/ugyldig token; 403 for spiller som ikke
  er arrangør; 409 på ikke-aktivt spill; GET returnerer `targets` som matcher
  `selectDeliveryReminderTargets` og `lastRemindedAt`; POST sender via
  `sendDeliveryReminder` KUN til målene og stempler `deliver_reminder_sent_at`;
  bruker-id fra body/query ignoreres. `npx vitest run` grønn.
- [ ] 3. **Web-avslutt-flatene (#1889):** de tre flatene viser knappen med
  riktig N; status-sidens purring er oppførselsuendret (`actions.test.ts`
  består). Staging-klikk i prod-server-modus: purr fra oppretter-flaten →
  `deliver_reminder`-rad for målet, `deliver_reminder_sent_at` satt, en spiller
  med 12 hull IKKE purret (service-role-lesing før/etter + skjermbilde).
- [ ] 4. **App-purring (#1889):** jest — knapp med N fra GET, «M har ikke ført
  ferdig»-linja, «Sist purret», suksess-copy, alle fire feilgrener, ingen kall
  uten nett. Staging: purr fra simulatoren mot lokal web i prod-server-modus →
  samme DB-bevis som 3 + skjermbilde.
- [ ] 5. **Godkjenn på vegne av gruppa:** jest — knapp per ulevert-godkjent,
  bekreftelse, `approveScorecard` kalt med riktig id, refresh etterpå. Staging:
  ikke-admin oppretter godkjenner en medspillers kort fra EndGame →
  `approved_by_user_id` = oppretteren (service-role-lesing).
- [ ] 6. **Lenkeknapper:** jest på `webUrl` (env-fella, sti-sammensetting) og
  én render-test på `WebLinkButton`; hvert sted i tabellen har knapp
  (grep: ingen bruker-synlig «på nettsiden»-tekst i `native/app/src` uten
  tilhørende knapp, unntatt #4 og kommentarer). Simulator-skjermbilde av minst
  to av dem (cup-note og lagkort).
- [ ] 7. **Porter + runbook:** alle Gates grønne; app-spike-seksjonen skrevet;
  `.changes/1889-purreknapp.md` (feat) for web-delen; #1891 får
  kartleggingstabellen med utfall som kommentar. Eier-tapptest hvis
  tilgjengelig, ellers `VERIFICATION GAP` + restanse.

## Gates

(Fersk worktree: `npm install` i BÅDE repo-rot og `native/app/`. Node 22.
Ingen nye native moduler. Staging-verify i prod-server-modus — `next build` m/
staging-env + `next start`, aldri dev; appen peker på den via
`EXPO_PUBLIC_WEB_BASE_URL`.)

- [ ] `npx jest` i `native/app/` grønt
- [ ] `npx tsc --noEmit` i `native/app/` grønt
- [ ] `npx expo export --platform ios` grønt (slett `dist/` etterpå)
- [ ] `npm run typecheck` (rot) grønt
- [ ] `npx vitest run` (rot) grønt — inkl. rute-, kjerne- og adgangstester
- [ ] `npx eslint native/app app/api lib/api lib/games` grønt
- [ ] `npm run build` (rot) grønt m/ pipefail

## Files Likely Touched

- `lib/api/appAuth.ts` (ny, +test) — delt token-sjekk + `isGameOrganiser`
- `app/api/account/delete/route.ts` — bytter til den delte sjekken
- `lib/games/remindUnsubmitted.ts` (ny, +test) — purre-kjernen
- `app/[locale]/admin/games/[id]/status/actions.ts` — tynn wrapper
- `app/api/games/[id]/remind/route.ts` (ny, +test) — ruta
- `app/[locale]/games/[id]/avslutt/{page,actions}.tsx|ts`,
  `admin/games/[id]/avslutt/…`, `admin/games/[id]/avslutt-likevel/…` — knappen
- `messages/no.json` + `en.json` — knapp/banner-copy
- `native/app/src/data/remind.ts` (ny, +test), evt. `data/webApi.ts`
- `native/app/src/screens/EndGame.tsx` + `lib/endGameCopy.ts` — purring + override
- `native/app/src/lib/webLink.ts` (ny, +test) + `components/WebLinkButton.tsx`
- de sju filene i tabellen (seksjon 7)
- `docs/native/app-spike.md`, `.changes/1889-purreknapp.md`

## Out of Scope

- Trekk deg selv (#1917), lever lagkort (#1918), inviter nye (#1919) — egne
  små kontrakter når ruta er merget
- Innlogget web-handoff (forkastet), innboks-skjerm i appen, APNs-registrering
  (N7), `last_seen_at` fra appen
- Cup-avslutning i appen, gjenåpning i appen, portering av patsome/segment-spill
- Endringer i purre-copyen (mail/innboks), i målregelen eller i `notify()`
- Alternativ C fra PR #1888 (umiddelbar finish-hale fra appen) — ruta gjør det
  billig, men det er sin egen kontrakt

---

**Til byggeren:** drift-verifisering mot HEAD før første kodelinje
(#1850-mønsteret) og sjekk natt-PR-ene for overlapp — særlig alt som rører
`EndGame.tsx`. PR-en er en auth-flate: **auto-merges aldri**, eier godkjenner.
Ingen prod-DB-migrasjon. Presentér ingen produktvalg — alle er tatt her; men
skriv «Fordeler/ulemper»-blokka i PR-en som vanlig, på norsk.
