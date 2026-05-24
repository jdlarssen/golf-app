# Tørny

> Fyr opp golfturneringen på et par minutter.

Mobil-først PWA for å arrangere golfturneringer. Skalerer fra fire kompiser på lørdagsrunden til klubb-skala med 150 deltakere. Du oppretter spillet, inviterer gjengen og taster slag mens dere går runden. Resten tar appen seg av: regning, leaderboard, sideturneringer og varsling.

Prod: [tornygolf.no](https://tornygolf.no) (også `tørny.no`).

## Hva du får

- Best ball netto med riktig WHS-handicap per hull
- Sideturneringer for longest drive og closest to pin. Vinnerne plukkes når spillet avsluttes
- Leaderboard som oppdateres live mens flighten din taster
- Offline-først scoring. Taster du i en dødsone på banen, syncer det når mobilen får signal igjen
- Innboks med varsler om invitasjoner, peer-godkjenninger, leverte scorekort og spill som er avsluttet. Mail kommer kun når du ikke allerede er i appen
- Installerbar på hjem-skjermen. Åpner som en vanlig app, uten nettleserlinjer på toppen
- GDPR-self-service. Eksporter eller slett dataene dine fra profilsiden uten å maile noen

## Stack

| | |
|---|---|
| Rammeverk | Next.js 16 (App Router) + React 19 + TypeScript |
| Stil | Tailwind v4, forest-and-champagne-palett |
| Database og auth | Supabase (Postgres + Auth + Realtime, EU-region) |
| Offline-sync | Dexie (IndexedDB) med last-write-wins-RPC |
| Mail | Resend via verifisert `tornygolf.no` |
| Test | Vitest + Testing Library + Playwright |
| Drift | Vercel, auto-deploy på push til `main` |

Auth bruker OTP-kode på mail. Magic-link gikk i søpla fordi iOS PWA-handoff og mail-scannere brøt flyten på hver sin måte samtidig.

## Kjøre lokalt

```bash
npm install
npm run dev
```

Åpne [http://localhost:3000](http://localhost:3000). Krever `.env.local` med Supabase- og Resend-nøkler (ligger ikke i repoet, spør Jørgen).

```bash
npm test          # vitest (840+ unit + integration)
npm run e2e       # playwright
npm run lint
npm run build
```

## Hvordan det henger sammen

Scoring-logikken ([`lib/scoring/`](lib/scoring/)) er ren TypeScript uten Supabase-avhengighet. Den har egne tester og egen TDD-disiplin. Rør den ikke uten å skrive ny test først. Det er her WHS-formelen, slag-allokeringen, best-ball-aggregeringen og 5-tiers-tiebreakeren bor.

Offline-sync ([`lib/sync/`](lib/sync/)) skriver til Dexie først og tømmer køen mot Supabase når mobilen får signal igjen. Last-write-wins via `client_updated_at`. Dexie-databasen heter `'golf-app'` av historiske grunner. Ikke endre navnet. Det invaliderer lokale data hos alle eksisterende brukere.

RLS håndheves strengt i Postgres. Du ser dine egne scores, samme-flight-scores under aktivt spill, og alle scores etter at admin har avsluttet spillet. Realtime krever eksplisitt `supabase.realtime.setAuth()`. Auto-propagering virker ikke for WebSocket-kanalen. Det er en kjent rar oppførsel.

Migrasjoner ligger i [`supabase/migrations/`](supabase/migrations/) (20+ filer, kronologisk).

## Hvor du finner resten

- [CLAUDE.md](CLAUDE.md) er hovedoppslagsverket. Arbeidsmodell, konvensjoner, brand-stemme, nøkkelfiler.
- [AGENTS.md](AGENTS.md) er kort, men viktig. Next.js 16 har brytende endringer mot det du tror du vet.
- [CHANGELOG.md](CHANGELOG.md) er versjonshistorikken, med taglines på vanlig norsk og teknisk prosa kollapset under.
- [GitHub Issues](https://github.com/jdlarssen/golf-app/issues) er hele arbeidskøen. Tagget etter type, område og scope.
- [`docs/`](docs/) har lanseringssjekkliste, mail-maler og opprinnelig design.

## Versjonering

Semver. Hver bruker-synlig endring bumper `package.json` og legger til CHANGELOG-oppføring i samme commit. Disiplinen er ikke valgfri. `.githooks/commit-msg` blokkerer alle `feat`/`fix`/`perf`-commits som ikke stager begge filene. Footer-versjonen i prod hentes fra `package.json` ved build, så bumpen blir synlig så snart Vercel har deployet.
