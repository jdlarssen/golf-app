# Evaluering: #1468 Cup-resultatside — kontrakt `.forge/contracts/1468-cup-resultatside.md`

## Runde 3 (2026-08-07, etter fix `ace667b7` — SISTE runde)

**Verdikt: ACCEPT**

Runde-2-MAJOR-en (tilbake-pil-404 for cup-publikummet) er fikset korrekt på alle
rapporterte steder, søsken-sveipen er verifisert, og gjenværende funn er utenfor
kontraktens scope (minor/#1488-kandidater). Ingen brukersynlig svikt igjen i
kjerneflyten cup-side/resultatside/styringsside → matchkort → leaderboard → tilbake.

### Verifikasjon av runde-2-fiksen (`ace667b7`, diff-lest linje for linje)

- **`?from=`-kontekst på alle tre flatene, kun ferdige matcher:** cup-siden
  (`page.tsx:156-157` → `?from=/cup/${id}`), resultatsiden (`resultater/page.tsx:209-210`
  → `?from=/cup/${id}/resultater`), klubb-styringsvarianten (`CupManagement.tsx:457-459`
  → `?from=/klubber/${groupId}/cup/${tournamentId}`). Alle tre ligger INNE i den
  eksisterende `status === 'finished'`-betingelsen fra runde-1-fiksen — uferdige kamper
  er fortsatt rene kort. Klubb-URL-formen matcher den faktiske ruta
  (`app/[locale]/klubber/[id]/cup/[cupId]/page.tsx`; `groupId = tournament.group_id`,
  samme form som rom-dørene l. 259-260). Admin-drilldown `/admin/games/<id>` uendret.
- **`validateFromParam`-utvidelsen er trygg** (`leaderboard/page.tsx:40-61`): kun to nye
  prefikser i allowlisten (`/cup/`, `/klubber/`); alle eksisterende avvisninger står —
  `startsWith('/')`-krav, `//`-avvisning (protokoll-relativ), `://`-avvisning, 200-tegns
  cap, root kun som literal `/`. Ingen prefiks har `/` som andre-tegn, så `//`-varianter
  kan ikke matche. Verdien brukes kun som SmartLink-href (same-origin navigasjon) —
  ingen redirect, ingen open-redirect-klasse.
- **Default-retur `/` treffer KUN ikke-deltakere** (`leaderboard/page.tsx:142-143`):
  `fromOverride ?? (isParticipant || isAdmin ? defaultBackHref : '/')`. Deltakere/admin
  beholder eksakt gammel heuristikk — `?return=hole&n=N` → `/games/<id>/holes/<n>`,
  ellers game-home (`defaultBackHref`, l. 88-95, uendret logikk kun omdøpt). Hull-skjermens
  retur-flyt sender aldri `from`, så `fromOverride` er null der og hole-returen vinner som
  før. `from` vinner over `return=hole` når begge finnes — dokumentert pre-eksisterende
  semantikk (#117-kommentaren), uendret.
- **Holes-gaten er kodeidentisk** (`holes/page.tsx:78-84` vs `leaderboard/page.tsx:135`):
  samme tre konjunkter (`!isAdmin && game.status !== 'finished' && !participant`), kun
  &&-rekkefølgen avviker (semantisk lik). Draft+scheduled-redirecten står FØR gaten
  (l. 61-63, uendret). Reveal-grenen i holes (`RevealHiddenView` med game-home-backHref,
  l. 184-186) er unåbar for ikke-deltakere: den krever `shouldHideNetto` ≠ finished, og
  ikke-finished stoppes allerede av gaten.
- **Lenke-sveip over hele det åpnede leaderboardet** (alle rendrende views grep-et for
  `href`): matchplay-familien (`MatchplayMatchView`, `FourballMatchplayView`,
  `FoursomesMatchplayView`), `RoundReportCard`, `MatchplaySideTournamentSection`,
  `sideTournament.tsx` og `LeaderboardChrome` har INGEN lenker utover tilbake-pilen
  (`backHref`) — replay-knappen i State4View er ren client-state (confetti-remount,
  `State4View.tsx:95`), ingen navigasjon. State4Views øvrige mål: mode-toggle →
  `/games/<id>/leaderboard?mode=…` (åpen), lagrad-drilldown →
  `/games/<id>/leaderboard/holes?team=…` (nå åpen via holes-unntaket), holes-tilbake →
  `/games/<id>/leaderboard?mode=…` (`drilldown.tsx:112,214`, åpen). Ingen 404-mål igjen
  fra cup-flytens flater.
- **Sikkerhet:** ingen ny eksponering utover «ferdige spill lesbare for innloggede»
  (runde 2-vurderingen står). `from`-utvidelsen endrer kun navigasjonsmål, ikke authz;
  gate-uttrykkene er uendret utover refaktoreringen til `isParticipant`-variabel.

### Addendum 2-oraklene (PR #1498)

Dekker fiksens tre kanter med struktur-orakler: landings-URL inneholder `from=/cup/<id>`,
`header a`-href = `/cup/<id>` + faktisk klikk som lander på cup-siden
(`cup-results-pending` synlig), og direkte-URL uten `from` → `header a`-href = `/`
(ikke game-home) med SQL-orakel på at vieweren ikke er i `game_players`. Prod-vakt mot
staging-ref, feillogger tomme, testdata slettet. Holes-drilldownen ble ikke UI-drevet
(singles-fixtur har ingen drilldown — deklarert i addendumet); dekket av kode-
verifiseringen over. Tilstrekkelig.

### Nye funn (velter ikke verdiktet)

1. **Minor (#1488-kandidat) — CSV-eksportknappen er brukket for ikke-deltakere.**
   `State4View` rendrer «Last ned CSV» ubetinget for ferdige best_ball-spill
   (`State4View.tsx:173,193` → `/games/<id>/leaderboard/export`), men export-ruta har
   fortsatt den GAMLE deltaker/admin-gaten uten finished-unntak
   (`leaderboard/export/route.ts:107`) — en ikke-deltaker fra cup-flyten får lastet ned
   en 404-JSON som `.csv`. Samme søsken-gate-klasse som runde 2-funnene, men smalere
   og mildere: kun best_ball-matcher, ingen navigasjon (siden består, `<a download>`),
   og RLS gjør innholdet lesbart uansett. Fix: speil finished-unntaket i export-gaten
   ELLER deltaker-gate knappen.
2. **Info — cup-konteksten overlever ikke interne hopp:** mode-toggle
   (`State4View.tsx:295`) og holes-rundturen (`drilldown.tsx:112,214`) sender ikke
   `from` videre, så tilbake-pilen faller til `/` (Hjem) for ikke-deltakere etter et
   internt hopp. Ingen død flate (bevisst designet fallback) — kun kontekst-tap.
3. **Info — allowlisten i `validateFromParam` er utestet:** funksjonen er ikke
   eksportert og har ingen unit-test; utvidelsen verifiseres i dag kun av staging-
   kjøringen. Kandidat ved neste leaderboard-rydding.

### Runde-2-funn — status

1. MAJOR (tilbake-pil-404): **FIKSET** — alle tre flater + default-retur, verifisert over.
2. Minor (holes-gate): **FIKSET** — kodeidentisk unntak (`holes/page.tsx:78-84`).
3. Info (reactions for ikke-deltakere): **UENDRET** — fortsatt harmløs (RLS-gatet,
   stille catch); #1488-kandidat.

### Gates (kjørt selv, runde 3, Node 22, worktree-rota)

- `npm run build`: **EXIT=0** (kun pre-eksisterende lockfile-warning).
- `npx vitest run`: **Test Files 440 passed (440) · Tests 5644 passed (5644)** · EXIT=0.
- `npm run lint`: **✖ 58 problems (0 errors, 58 warnings)** · EXIT=0 — samme
  pre-eksisterende warnings som runde 1+2.
- Versjon: `ace667b7` bumpet 1.226.1 → 1.226.2 (fix → patch, `[no-changelog]` — korrekt).

---

## Runde 2 (2026-08-07, etter fix `52755c96` + `ff0ef2ed`)

**Verdikt: NEEDS WORK**

Runde-1-fiksen er korrekt på det rapporterte stedet — gaten, lenke-betingelsene, JSDoc-en,
404-testid-en og kontrakt-revisjonen er alle verifisert — men den åpnede siden fører den nye
målgruppen rett inn i to søsken-gater som IKKE fikk finished-unntaket. Tilbake-pilen på
kamp-leaderboardet 404-er for hele cup-publikummet (samme #752-klasse som runde-1-funnet,
ett tapp senere), så NEEDS WORK står.

### Verifikasjon av fiksen

- **Gate-endringen** (`app/[locale]/games/[id]/leaderboard/page.tsx:131-141`): KUN et
  finished-unntak — `!isAdmin && game.status !== 'finished' && !participant → notFound()`.
  Draft redirectes til game-home FØR gaten (l. 127-129, uendret rekkefølge, diff-verifisert
  mot `52755c96`); scheduled/active er fortsatt kun deltakere/admin. Anonym → login-redirect
  (l. 109, uendret) — akseptert i revisjonens «alle innloggede».
- **Lenke-betingelsene, alle tre flater:** cup-siden (`page.tsx:155`), resultatsiden
  (`resultater/page.tsx:154,208`) og klubb-styringsvarianten (`CupManagement.tsx:457-461`)
  lenker alle KUN når `m.status === 'finished'`; uferdige kamper er rene kort. Admin-
  drilldown til `/admin/games/<id>` uendret. `m.status` og `m.gameId` kommer fra SAMME
  game-rad i snapshoten (`getCupSnapshot.ts:422-430`) — også for avledede singles-spill og
  best_ball-back9 — så lenke-betingelsen og side-gaten kan ikke drifte fra hverandre.
- **Sikkerhet — åpner unntaket noe utilsiktet?** Nei, på side-nivå matcher det dokumentert
  RLS-design («alle scores etter finished»; spectate-ruta eksponerer alt ferdig for anonyme
  allerede). Reveal-spill: `revealState(score_visibility, status)` viser `RevealHiddenView`
  kun når status ≠ finished (`leaderboardContent.tsx:468,508`) — ikke-deltakere slipper
  ikke inn før finished, så ingenting vises før arrangøren avslutter. D12-blindgatingen i
  snapshoten er urørt. Revansje-CTA (l. 176-180), «Mitt scorekort» (l. 188-190) og
  putts-nag er alle deltaker-gatet og lekker ikke. `markNotificationsRead` for
  ikke-deltakere er harmløs: admin-klient men alltid scopet `.eq('user_id', userId)` +
  kind/entityId — 0-raders update, best-effort (`lib/notifications/markRead.ts:39-47`).
- **Runde-1-funn 2 (JSDoc):** rettet (`CupManagement.tsx:173-176`).
- **`data-testid="not-found"`:** på plass (`app/[locale]/not-found.tsx:25`).
- **Revisjon 1:** dokumentert i kontrakten med ASSUMPTION-markør for lenk-kun-ferdige-valget.

### Staging-addendum (PR #1498)

Oraklene dekker fiksens kjerne godt: lenke-konditionalitet (`a[href*=<match>]`-tellinger
mot DB-status), ferdig kamp åpner for verifisert ikke-deltaker (SQL-orakel på
`game_players`), aktiv kamp fortsatt branded 404 (innholdsbasert assertion — riktig valg
under PPR-streaming), prod-vakt mot staging-ref. Men kjøringen stopper ved «leaderboardet
rendrer» — den navigerer aldri VIDERE fra den åpnede siden, og akkurat der bor det nye
MAJOR-funnet.

### Nye funn

1. **MAJOR — tilbake-pilen på kamp-leaderboardet 404-er for hele cup-publikummet.**
   Cup-flatene lenker `/games/<id>/leaderboard` uten `?from=`, så `backHref` defaulter til
   `/games/<id>` (game-home, `leaderboard/page.tsx:88-96`). Game-home er deltaker-gatet uten
   finished-unntak (`(home)/page.tsx:248` — `if (!me) notFound()`), og pilen er en ren
   `SmartLink href={backHref}` (`LeaderboardChrome.tsx:122-128`; matchplay-viewene bruker
   samme header via `MatchplayMatchView.tsx:117,142`). Konsekvens: enhver ikke-deltaker som
   åpner et matchkort og tapper ‹ lander på branded 404 — eneste utvei i UI-et er
   «til forsiden». Eier-scenarioet i #1456 er å bla i FLERE kamper etter runden; rundturen
   knekker på første exit. Samme #752-brudd («aldri en død flate») som veltet runde 1, i
   samme nyåpnede flyt. Merk: `validateFromParam`-allowlisten (`leaderboard/page.tsx:54`)
   har IKKE `/cup/`-prefiks, så cup-flatene kan ikke sende `?from=/cup/<id>` uten at
   allowlisten utvides — fixen er liten (allowlist + `?from=` fra de tre flatene, eller
   ikke-deltaker-aware backHref), men målvalget (cup-siden vs. resultatsiden) er byggerens.
2. **Minor — holes-drilldownen mangler samme finished-unntak.**
   `leaderboard/holes/page.tsx:76` har fortsatt den GAMLE gaten (deltaker/admin, intet
   finished-unntak). En ferdig best_ball-cupmatch (D4-back9) rendrer State4View der HVER
   lagrad er lenke til `/games/<id>/leaderboard/holes?team=…` (`State4View.tsx:330,444-449`)
   → 404 for alle utenfor kampen. Samme klasse som funn 1, smalere flate (kun
   best_ball-matcher i cup-flyten). Speil unntaket i holes-gaten.
3. **Info — reactions-flaten for ikke-deltakere:** `includeReactions: true` sendes
   ubetinget, men RLS (0119) gater SELECT+INSERT på deltakelse — en ikke-deltaker ser tom
   reaksjonsflate og taps feiler stille (`ReactionsProvider.tsx:136` catcher og logger).
   Når cup-flyten kun ferdes i matchplay-/State4-views (som ikke rendrer RowReactions) er
   dette bare nåbart via direkte-URL til andre formats ferdige spill. Harmløst datamessig;
   kan strammes ved neste cup-rydding (#1488).

### Runde-1-funn — status

1. MAJOR (matchkort-404): **FIKSET på rapportert sted** — men de to søsken-flatene over
   (game-home-retur, holes-drilldown) manglet i sveipen (T2-steg-3-mønsteret).
2. Minor (JSDoc): **FIKSET** (`CupManagement.tsx:173-176`).
3. Minor (hardkodet norsk «mot»/«Delt (AS)»): **UENDRET** — pre-eksisterende klasse, ikke
   krevd i runde 1.
4. Minor (status-label-ternary i to hjem): **UENDRET** — kontrakten tillot slank
   duplisering; fortsatt to hjem (`page.tsx:118-123`, `CupManagement.tsx:427-432`) pluss
   en delvis variant på resultatsiden (l. 156-160).
5. Info (`formatPoints` × 3): **UENDRET** — kandidat for #1488.

### Gates (kjørt selv, runde 2, Node 22, worktree-rota)

- `npm run build`: **EXIT=0** (ruta i manifestet, kun pre-eksisterende lockfile-warning).
- `npx vitest run`: **Test Files 440 passed (440) · Tests 5644 passed (5644)** · EXIT=0.
- `npm run lint`: **✖ 58 problems (0 errors, 58 warnings)** · EXIT=0 — samme
  pre-eksisterende warnings som runde 1.

---

# Runde 1

**Verdikt: NEEDS WORK**

Én major-funn velter verdiktet: matchkort-lenkene (S5/#1456) fører de fleste seere til en
404. Alt annet — S1–S4, S6, alle gates, i18n, versjon, ryddighet — er verifisert grønt.
Rot-årsaken er en feil premiss i kontrakten selv (ikke bygge-slurv), men PR-en er umerget
og feilen er bruker-synlig på en world-readable flate, så den må avgjøres før merge.

## Per suksesskriterium

### S1 — cup-siden er blind: PASS (kode-verifisert)

Hele `app/[locale]/cup/[id]/page.tsx` lest post-diff. Ingen resultatbærende elementer
igjen: lagtotal-grid, sidepoeng-linje (`cup-side-award-points`), vinner-banner/«vant»/
«Uavgjort», per-match `m.result`-tekst og poeng-kolonnen (`scoreLabel` med
`pointsTeam1–pointsTeam2`) er alle fjernet. Består: cup-navn (l. 59–61), poengmål-header
(`pointsHeaderCopy`, l. 62–68 — config, ikke resultat), «X av N kamper spilt»
(`public.matchesSummary`, l. 69–74), matchliste med nøytral status «Spilt/Pågår/Utkast»
(l. 117–123). Grep etter `team1Points|team2Points|sideAwardPoints|leaderboard.winner` i
`app/` + `components/` treffer kun `resultater/page.tsx` og #1449-kortet
(`FinishedCupDayCard`, bevisst urørt). Staging-evidens (`.text-5xl`=0, skjermbilde) er
konsistent med koden.

### S2 — resultatsiden er låst: PASS (kode-verifisert)

`app/[locale]/cup/[id]/resultater/page.tsx`: låsen er `tournament.status !== 'finished'`
(l. 55) — dekker draft OG active, ingen rolle-unntak (admin/arrangør går samme sti).
Rekkefølgen er riktig: snapshot→`notFound` (l. 39), klubb-gate→`notFound` (l. 44–49),
DERETTER låse-sjekken — ikke-medlem av klubb-cup får `notFound` også i låst tilstand.
Låst render (l. 56–70) viser kun cup-navn, `results.lockedBody`-ventetekst og
«X av N kamper spilt» — ingen winner/points/sideAwards beregnes eller rendres før gaten.
E2e-assertion (`cup-results-locked` synlig, `cup-results-totals`=0) bruker testid-er som
faktisk skiller låst/åpen render.

### S3 — styringssiden er skjermet: PASS (kode-verifisert)

Hele `CupManagement.tsx` lest post-diff (komponenten er delt — én kodesti for begge
varianter): totaler (`text-4xl`-grid), `manage.sideAwardPoints`-linje og per-match
resultattekst/poengkolonne er fjernet; matchkort viser nøytral statusLabel (l. 426–431).
Roster (l. 321–361), `SideAwardsPanel` (l. 365–373), tre-roms-dørene (l. 378–406),
start/avslutt + `canFinish = status === 'active'` (l. 228, 485–492) er urørt.
`cupMatchesSummary` (fremdrift) består. Nye dører: `manage.openCupPage` +
`manage.openResults` (l. 302–315). Staging-evidens (før/etter ctp-registrering,
winner_user_id-SQL) plausibel.

### S4 — seremonien: PASS (kode-verifisert + evidens)

Åpen resultatside (status=finished) rendrer vinner-banner (`results.winner`/
`results.tied`, uavgjort → ingen gull, samme `winner_team`-null-semantikk som før),
lagtotaler med gull-markering (`GOLD_CARD_STYLE` ved `leaderboard.winner`), sidepoeng
(`public.sideAwardPoints`, kun når `sideAwards.length > 0`) og matchliste MED
resultattekst + poeng — innholdsmessig identisk med gammel cup-side (diffet mot
origin/main-versjonen). Cup-siden viser dør-kort (`cup-results-door`) etter finish og
dempet lenket linje (`cup-results-pending`) før. Staging-evidensen (ekte avslutt-klikk,
SQL-orakel status=finished/winner_team=1, «10&8» på resultatsiden) dekker flyten.

### S5 — kamp-lenkene (#1456): PASS PÅ BOKSTAVEN, FEILER PÅ INTENSJONEN — se funn 1

Lenkene finnes som bestilt: cup-siden l. 126 og resultatsiden l. 163 →
`/games/<gameId>/leaderboard`; klubb-styringsvariant l. 456 → samme; admin-variant →
`/admin/games/<id>` (bevisst). MEN: `/games/[id]/leaderboard/page.tsx` gater
`if (!isAdmin && !gwp.players.some(p => p.user_id === userId)) notFound()` — uten
finished-unntak — og krever innlogging (redirect til /login). Se funn 1.

### S6 — regresjon: PASS

Full vitest, build og lint kjørt selv (se Gates). Diff-avgrensning verifisert:
`git diff origin/main...HEAD --stat -- lib/cup supabase/` viser KUN ny
`lib/cup/cupPageAccess.ts`; `getCupSnapshot.ts`, `computeCupLeaderboard.ts`,
`actions.ts`, RLS/migrasjoner urørt. Ingen andre `getCupSnapshot`-konsumenter enn de
fire kjente + ny resultatside. Playwright mot staging ikke re-kjørt (fixtur slettet,
per oppdrag); e2e-diffen asserter kun testid-er som finnes, og claimet 2/2 er plausibelt.

## Delt gate-helper (`lib/cup/cupPageAccess.ts`)

Semantisk identisk med origin/main-inline-gaten, linje for linje sammenlignet:
`group_id` null → true (personlig cup world-read); proxy-id med `auth.getUser()`-
fallback; deltaker → true; anonym ikke-deltaker → false; ellers `group_members`-
medlemskap ELLER `users.is_admin` — samme kortslutningsrekkefølge og samme queries.
`'server-only'`-import. Ingen Type A-test (kontrakten sa «hvis logikken bærer» —
helperen er IO-dominert, OK).

## i18n

- Nye nøkler i BEGGE kataloger (diff-verifisert): `manage.openCupPage`,
  `manage.openResults`, `public.matchPlayed`, `public.resultsDoor`,
  `public.resultsPending`, `results.kicker/lockedBody/winner/tied`.
- Fjernet fra begge: `manage.openLeaderboard`, `manage.matchTied`,
  `manage.sideAwardPoints`. Grep av call-sites: ingen konsumenter igjen (treffene
  `cupStarted.openLeaderboard` og `result.matchTied` er andre namespaces, begge
  fortsatt i katalogene).
- `public.sideAwardPoints` beholdt og brukt av resultatsiden. `public.firstTo`
  pre-eksisterende i begge kataloger (no.json:4761/en.json:4761).
- `game.home.cupStandings` omformulert («Se cupen»/«View the cup»); eneste call-site er
  `CupStandingsLink.tsx`.

## Versjon / CHANGELOG / commits / PR

- `package.json` 1.225.0 → 1.226.0 (minor, feat ✓); `package-lock.json` fulgt med.
- Én Funksjon-oppføring i CHANGELOG (1.226, riktig format med issue-lenke + ↳-sti),
  bumpet i samme commit som feat-en (41218095).
- Alle 5 commits har `Refs #1468`; feat-commiten nevner co-delivery #1459/#1456.
- PR #1498: `Closes #1468/#1459/#1456`, Fordeler/ulemper-blokk, eksplisitt notat om
  eier-avgjorte produktvalg uten `## Produktvalg`-heading, `staging-verified`-label +
  grundig bevis-kommentar (struktur-orakler, SQL-orakler, prod-vakt mot staging-ref).

## Gates (kjørt selv, Node 22, worktree-rota)

- `npm run build`: **EXIT=0**; ruta `/[locale]/cup/[id]/resultater` (+ /no + /en) i
  manifestet; eneste warning er den pre-eksisterende lockfile-advarselen.
- `npx vitest run`: **Test Files 440 passed (440) · Tests 5644 passed (5644)** · EXIT=0.
- `npm run lint`: **✖ 58 problems (0 errors, 58 warnings)** · EXIT=0. Eneste warning i
  berørte filer er `CupManagement` complexity 34 — pre-eksisterende (origin/main-versjonen
  linter til complexity 35; diffen REDUSERTE den).

## Funn

1. **MAJOR — matchkort-lenkene 404-er for de fleste som kan se dem.**
   `/games/[id]/leaderboard` krever innlogging OG deltakelse i AKKURAT det spillet
   (eller global admin) — `page.tsx`: `if (!isAdmin && !gwp.players.some(...)) notFound()`,
   ingen finished-unntak (RLS åpner scorene etter finish, men side-gaten gjør det ikke;
   det er derfor `/spectate/[token]` finnes). Cup-siden er world-read (personlig cup) /
   klubb-lesbar, og matchkortene lenker nå ALLE seere dit. Konsekvens: en cup-deltaker
   som klikker en ANNEN kamp enn sin egen → 404; klubb-medlem utenfor cupen → 404 på alle
   kort; klubb-styrer (ikke global admin, ikke i kampen) → 404 fra styringssiden; anonym
   på delt personlig cup-lenke → login-redirect. Det er nøyaktig eier-scenarioet i #1456
   («så man kan se hvordan de andre gjorde det») som feiler for målgruppen — og et brudd
   på #752-prinsippet («aldri en død flate») som kontrakten selv lister under Prior
   Decisions. e2e viser at cup-matcher kun har sine egne 2 spillere i `game_players`, så
   dette er ikke en teoretisk kant. Ingen andre flater i appen lenker ikke-deltakere til
   game-leaderboards (grep-verifisert) — 404-flaten er ny med denne diffen.
   **Rot-årsak: kontraktens premiss** («etter at et enkelt spill er avsluttet er kampens
   eget leaderboard åpent … frivillig drill-in» og #1456-forskningen «trygt også under
   aktiv blind runde») er feil på side-nivå — byggeren fulgte bokstaven. Evidensen fanget
   det ikke fordi S5 klikket én kamp med en identitet som passerte gaten (deltaker/admin).
   **Krever produktvalg** før merge: (a) åpne leaderboard-side-gaten for finished spill
   (matcher RLS-realiteten, men er en authz-flateendring), (b) render kort som lenke kun
   for seere som kan åpne målet, (c) annet mål/spectate-mekanisme, eller (d) eier
   aksepterer 404-flaten eksplisitt. Ikke evaluators valg.

2. **Minor — utdatert JSDoc i `CupManagement.tsx` (l. 173–175):** «club-varianten viser
   matchene som rene info-kort» stemmer ikke lenger (de lenker nå til kampens
   leaderboard). Én-linjes doc-fix.

3. **Minor (pre-eksisterende, kopiert videre):** hardkodet norsk i offentlige flater —
   «mot» (cup-siden l. 135, resultatsiden l. 135) og «Delt (AS)» + «til»-konstruksjonen
   (resultatsiden l. 167–180) er ikke i18n-nøkler. Arvet ordrett fra origin/main-cup-siden
   (manage-varianten bruker `t('manage.mot')`), så ingen regresjon — men den nye filen
   dupliserer gapet.

4. **Minor — regelen «nøytral match-status-label» har nå to hjem:** samme
   finished/active/draft-ternary i `page.tsx` (l. 118–123) og `CupManagement.tsx`
   (l. 426–431). Kontrakten tillot slank duplisering, men blir label-logikken endret
   (f.eks. ny status), må to steder huskes (AGENTS.md-felle 4-lite).

5. **Info — `formatPoints` finnes nå i tre filer** (cup-side, resultatside,
   CupManagement) — to av dem pre-eksisterende; kandidat for delt helper ved neste
   cup-rydding (#1488), ikke denne PR-en.
