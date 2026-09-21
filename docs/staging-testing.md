# Testing — staging, aldri prod

> Flyttet ordrett fra CLAUDE.md (#2100). Leses før en staging-klikkrunde og før du tester noe som skriver data (`docs/agent-discipline/bindings.md` §T5/§T7).

**Tørny er i ekte bruk i prod (fra 2026-06-20). Test ALDRI ved å skrive til prod.** All testing — automatisk og manuell klikk-gjennom — skjer mot `torny-staging` (Supabase-ref `snwmueecmfqqdurxedxv`). Den gamle «production-only testing»-konvensjonen er opphevet.

**Bruker-synlige fikser MÅ verifiseres på staging før merge** (erstatter den manuelle prod-QA-en). De automatiske portene — `tsc` + `lint` + `vitest` (pre-push + CI) pluss e2e-`@gate`-en mot staging — fanger type-/skjema-drift, testet logikk og de tre kjerne-flytene (slag→lever→godkjenn, cup-smoke, liga-smoke), men IKKE at den spesifikke fiksen oppfører seg riktig ende-til-ende. Den siste milen er en staging-klikkrunde av den berørte flyten.

**Kjør appen mot staging (oppsett ligger klart i repoet):**

- **Node 22 kreves** (`source ~/.nvm/nvm.sh && nvm use 22`) — appen krasjer på Node 20 (supabase-js krever native WebSocket).
- `.env.staging.local` (gitignorert) har staging-URL + anon + `SUPABASE_SERVICE_ROLE_KEY` + `E2E_ADMIN_EMAIL`/`E2E_PLAYER_EMAIL`. Din vanlige `.env.local` (prod) røres ikke.
- Boot via `preview_start("torny-staging")` (launch-config i `.claude/launch.json`); driv med `preview_*`-verktøyene.
- **Autonom login** (ingen e-post/SMTP): mint kode via service-role REST `POST $NEXT_PUBLIC_SUPABASE_URL/auth/v1/admin/generate_link` → `email_otp` → fyll login-skjemaet (`input[type=email]` → «Send meg kode» → `input[name=token]` → «Logg inn»). Admin = `E2E_ADMIN_EMAIL`, spiller = `E2E_PLAYER_EMAIL`.
- **Eier-tapptest i native-appen (#1923):** innloggingsskjermen i Tørny Dev har trykk-innlogging for rollebesetningen (Anne Admin, Kari Arrangør, Ola Kompis, Per Putter, Testspiller Tapp — alle `@example.test`). Rigg testspill til eieren med disse. Trenger du en annen bruker: `node scripts/dev-login-users.mjs add --email torny+dev-<slug>@example.test --name "<Navn>" --role spiller --issue <N>` — den står i appen neste gang innloggingsskjermen åpnes, uten nytt bygg. Passord: `DEV_LOGIN_PASSWORD` i `.env.staging.local` = `EXPO_PUBLIC_DEV_LOGIN_PASSWORD` i `native/app/.env.local` (begge gitignorert). Skriptet nekter alt annet enn staging. Detaljer: `docs/native/app-spike.md` «Testbrukere i appen».
- **Prod-vakt:** en staging-mintet kode validerer kun mot staging — bekreft det (og at data er staging-formet) før du skriver noe.

**DB-/skjema-endringer:** påfør staging først via Supabase MCP, verifiser, DERETTER prod (0107-mønsteret). Aldri uverifiserte migrasjoner rett på prod. (`gen:types` leser prod-skjemaet read-only — greit; prod er fasiten for det som er deployet.)
