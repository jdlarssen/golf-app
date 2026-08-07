# Spec: Cup-avslutningsvarslene peker på resultatsiden og teaser bare (#1499)

## Problem

Etter #1468 viser cup-siden (`/cup/[id]`) kampene UTEN resultater — fasiten bor på
resultatsiden (`/cup/[id]/resultater`). To avslutnings-berøringspunkter henger igjen:

1. **In-app-deeplinken** for `cup_finished` peker fortsatt på `/cup/{id}`
   ([deeplink.ts:81](lib/notifications/deeplink.ts)) — varselet «Cupen er ferdigspilt»
   lander på en resultat-fri flate.
2. **Mailen** «Resultatet er klart» røper fasiten i body (vinnerlinje + stilling
   «Lag1 3 — 2 Lag2») — det gjør seremonien på resultatsiden poengløs.

Mail-CTA-URL-en ble ALLEREDE flyttet til `/cup/{id}/resultater` i #1488 (K10) — den
delen av issuet er ferdig og skal ikke røres på nytt.

## Prior Decisions

- **Eierbeslutning 2026-08-07 (på issuet): alternativ B — mailen teaser bare.**
  Ingen vinner/stilling i mailen. «Hvis ikke gir det ingen mening å åpne mailen.»
- #1468: resultatsiden er seremonien; cup-siden spoiler aldri. #1501: cup-finished-mailen
  er cupens ENESTE reveal-signal — desto viktigere at den ikke røper i selve mailen.
- `cup_started`-deeplinken skal IKKE endres (issue-krav): cup-siden er riktig
  landingsflate ved start.
- In-app-kortet («Cupen er ferdigspilt» + navn, `cardContent.ts`) røper ingenting —
  ingen endring der.

## Design

**1. Deeplink** (`lib/notifications/deeplink.ts`): `case 'cup_finished'` returnerer
`/cup/${p.tournament_id}/resultater`. Skjema-kommentaren for `cup_finished` i
`lib/notifications/types.ts` (som sier «deeplink til /cup/[id]») oppdateres tilsvarende.
`cup_started` uendret.

**2. Mail-templaten** (`lib/mail/cupFinishedNotification.ts`):
- Fjern vinnerlinjen (`resultWinner`/`resultWinnerText`/`resultDraw`) og score-linjen
  (`scoreLine`/`scoreLineText`) fra HTML + text.
- `team1Name`/`team2Name`/`team1Points`/`team2Points`/`winnerTeamName` går ut av
  `CupFinishedNotificationParams` (ingen av dem brukes lenger). `formatNumber`-importen
  ryker med.
- Body etter ombygging: salutation + «Cup-en {navn} er avgjort.»-linjen + CTA-knapp.
  Én kort teaser-setning i tillegg er builder-skjønn (humanizer avgjør) — men ALDRI
  vinner, stilling eller noe som impliserer utfallet.
- CTA-copy: «Se hele leaderboardet» → noe à la «Se resultatet». Katalognøklene
  `viewLeaderboard`/`viewLeaderboardText` får nye navn som matcher ny mening
  (f.eks. `viewResult`/`viewResultText`) i `messages/no.json` + `messages/en.json`;
  gamle result-/score-nøkler slettes. Ny copy tar humanizer-runde.

**3. Kallstedet** (`lib/cup/actions.ts`, `finishTournament` ~L470–495): slutt å sende
de fjernede parametrene. `winnerName`-utledningen i mail-blokken slettes hvis ingen
andre bruker den (`winnerTeam` brukes fortsatt i DB-oppdateringen — den står).
Sjekk om `finalLeaderboard` har andre konsumenter i funksjonen før evt. opprydding.

**4. Tester:**
- `lib/notifications/deeplink.test.ts`: `cup_finished`-forventningen → `/resultater`;
  `cup_started`-forventningen står urørt som vakt.
- `lib/mail/cupFinishedNotification.test.ts` (Type B, se `lib/mail/AGENTS.md`):
  `resultBlockHtml`-extractoren mister sine paragrafer — bygges om/erstattes med
  extractor for gjenværende body. Vinner/uavgjort-variantene kollapser (ingen branch
  igjen i templaten) → antall cases KRYMPER; fixtures mister de fjernede feltene.
  Snapshots repopuleres med `-u` og reviewes visuelt. Aldri nye tester utover dette.

## Edge Cases & Guardrails

- `playerFirstName: null` → generisk salutation (eksisterende case, skal fortsatt dekkes).
- `locale: 'en'` → engelsk katalog (eksisterende case, skal fortsatt dekkes).
- Uavgjort cup: mailen er nå IDENTISK med vinner-cup — ingen branch, ingen leak.
- Ingen DB-, RLS- eller payload-skjemaendring (`cupFinishedSchema` urørt — payloaden
  har aldri båret resultatdata).
- Mail er fortsatt best-effort (`Promise.allSettled` på kallstedet) — ikke rør mønsteret.

## Key Decisions

- Alternativ B (eier): mailen teaser bare — se Prior Decisions.
- To atomiske commits: (1) `fix(notifications)` deeplink, (2) `fix(mail)` teaser-ombygging
  + katalog + kallsted + tester. Begge patch-bump + én CHANGELOG-linje hver (Feilrettinger).

**Claude's Discretion:**
- Eksakt teaser-copy (med humanizer) og nye katalognøkkel-navn.
- Om extractoren i mail-testen beholder navnet eller byttes.

## Success Criteria

- [x] `deeplink.test.ts` grønn med `cup_finished` → `/cup/{id}/resultater` og
      `cup_started` → `/cup/{id}` (kommando-output).
      BEVIS: `npx vitest run lib/mail/cupFinishedNotification.test.ts
      lib/notifications/deeplink.test.ts` → «Test Files 2 passed / Tests 9 passed»
      (kjørt 2026-08-07 22:58). Ny cup_started-vakt i deeplink.test.ts:59–68.
- [x] `CupFinishedNotificationParams` har ingen team-/poeng-/vinnerfelt
      (file:line-bevis: lib/mail/cupFinishedNotification.ts:22–29 — kun to/
      playerFirstName/tournamentName/tournamentId/locale), og `npm run build` er
      grønn (fanger alle kallsteder).
      BEVIS: `npm run build` → EXIT=0 (2026-08-07 23:0x; første kjøring feilet
      kun på manglende `.env.local` i worktree — miljø, ikke kode).
      Øvrige gates: `npx vitest run lib/mail lib/notifications lib/cup` →
      608 passed; `npm run lint` → 0 errors (56 pre-eksisterende warnings).
- [x] Mail-snapshots viser body UTEN vinner/stilling for både vinner- og
      uavgjort-scenarioet (snapshot-diff som bevis).
      BEVIS: templaten har ingen vinner/uavgjort-branch lenger (én identisk body);
      default-text-snapshot = «Hei Per! / Cup-en "Høst-cup 2026" er avgjort. /
      Hvordan endte det? Svaret venter på resultatsiden. / Se resultatet: …» —
      ingen lagnavn/poeng/vinner. Commit d434d801 (−184 linjer).
- [x] CTA-copy er «Se resultatet»-familien i begge locales; ingen forlatte
      `cupFinished.*`-nøkler igjen i katalogene (grep-bevis).
      BEVIS: `mail.cupFinished` i messages/no.json + en.json har nå kun subject/
      salutationNamed/salutationGeneric/bodySettled/bodySettledText/teaser/
      viewResult/viewResultText; result*/viewLeaderboard* slettet i d434d801.
- [x] Berørt flyt verifisert på staging (innboks-kort for avsluttet cup deeplinker til
      resultatsiden) FØR merge — bevis-kommentar + label på PR-en.
      BEVIS: innboks-kort tappet som e2e-spiller → RESULTATER-siden; nettverkslogg
      `GET /cup/5c9eefec-…/resultater → 200`; kommentar
      github.com/jdlarssen/golf-app/pull/1513#issuecomment-5222054121 +
      `staging-verified`-label satt.

## Gates

- [ ] `npm run build` (tsc-porten — ikke filtrer «pre-existing»)
- [ ] `npx vitest run lib/mail/cupFinishedNotification.test.ts lib/notifications/deeplink.test.ts`
- [ ] `npx vitest run lib/mail lib/notifications lib/cup` (naboer)
- [ ] `npm run lint`

## Files Likely Touched

- `lib/notifications/deeplink.ts` — cup_finished-case
- `lib/notifications/deeplink.test.ts` — forventning
- `lib/notifications/types.ts` — kommentar (cup_finished)
- `lib/mail/cupFinishedNotification.ts` — teaser-ombygging + params
- `lib/mail/cupFinishedNotification.test.ts` — extractor + cases + snapshots
- `messages/no.json` + `messages/en.json` — `mail.cupFinished`-nøkler
- `lib/cup/actions.ts` — kallstedet i `finishTournament`
- `package.json`/`package-lock.json` + `CHANGELOG.md` — bump + linjer

## Out of Scope

- `cup_started`-deeplinken (issue-krav: urørt).
- In-app-kortets copy (`cardContent.ts`) — røper ingenting i dag.
- Resultatsiden selv (#1468 — shipped) og mail-CTA-URL-en (#1488 K10 — shipped).
- Per-kamp-mail-undertrykkingen (#1501 — shipped).
