# Discord PR-kort — merge-knapp for ALLE grønne PR-er (#1159, Del A)

Hendelses-drevet GitHub Action som poster ett Discord-kort med merge-knapp hver
gang en åpen PR blir CI-grønn — uansett opphav (natt-runner, CI-vakt,
dok-avstemmer ELLER interaktiv økt). Målet: eieren merger enhver klar PR fra
mobilen, uten å måtte inn i GitHub (#1073, «styr fra mobilen»).

Dette er **sender-siden**. Mottaker-siden (selve mergen når du trykker) er det
eksisterende interactions-endepunktet fra #1124
(`app/api/discord/interactions/route.ts`) — kortet gjenbruker `merge_pr:<N>`
uendret.

## Hva Action-en gjør

Fil: `.github/workflows/discord-pr-card.yml` → `scripts/loops/post-pr-card.ts`
(ren logikk i `lib/loops/prCard.ts`, unit-testet).

1. **Trigger:** `check_suite: completed` (fyrer per suite som fullfører) +
   `workflow_dispatch` (manuell test/re-post mot ett PR-nummer).
2. **Gate per kandidat-PR:** åpen · alle check-runs på PR-head grønne
   (`classifyChecks`) · ikke allerede kortet. Tidlige fyringer der ikke alt er
   grønt er ufarlige no-ops.
3. **Kort:** PR-tittel (+ 📝 Draft-merkelapp for draft) · norsk oppsummering
   (taglinen trukket ut av PR-body-en — repoets `Closes #N\n\n<tagline>`-mal) ·
   PR-lenke · grønn **✅ Merge**-knapp (`custom_id: merge_pr:<N>`) + lenke-knapp.
4. **Post → label:** posterer kortet via bot-API-et, legger så dedup-labelen
   `discord:merge-kort` på PR-en. Poster FØRST, labler etterpå — et tapt kort er
   verre enn en sjelden dobbel.

**Menneske-porten står:** kortet gir deg knappen; det er ingen auto-merge. Når
du trykker, verifiserer #1124-endepunktet CI grønn på nytt, av-drafter og
rebase-merger.

## Dedup & race

`discord:merge-kort`-labelen sikrer ett kort per PR: senere `check_suite`-fyringer
ser labelen og hopper over. `concurrency`-gruppa (per head-SHA,
`cancel-in-progress`) serialiserer samtidige suite-fullføringer. Restrisiko: to
suiter som blir grønne i samme øyeblikk kan i sjeldne tilfeller gi to kort —
akseptert for v1 (mildt) fremfor å risikere et stille tapt kort.

## Eier-oppsett (engangs) — Actions-secrets

Selve mottaker-env-en (`DISCORD_PUBLIC_KEY`, `DISCORD_OWNER_ID`,
`GITHUB_LOOP_PAT`) ligger allerede i Vercel fra #1124. Action-en trenger i tillegg
bot-token + kanal som **GitHub Actions-secrets** (ikke bare i routine-env-en):

1. **Hvor:** GitHub → repoet `jdlarssen/golf-app` → **Settings → Secrets and
   variables → Actions → New repository secret**.
2. **Hva å legge inn (to secrets):**
   - `DISCORD_BOT_TOKEN` — den nyroterte bot-tokenen (samme som morgenbrief-routinen bruker).
   - `DISCORD_CHANNEL_ID` — ID-en til kanalen kortene skal i (høyreklikk kanalen i Discord → «Copy Channel ID»; krever Developer Mode på).
3. **Hva du forventer å se etter:** begge secrets listet under «Repository
   secrets» med navnene over. (Verdiene vises aldri igjen — det er normalt.)
4. **Verifiser:** GitHub → **Actions → Discord PR-kort → Run workflow**, skriv
   inn et PR-nummer for en åpen, grønn, ufarlig PR, kjør. Forventet: ett kort
   dukker opp i Discord-kanalen med en fungerende merge-knapp. Ser du ingen ting:
   åpne kjøringen i Actions og les loggen fra steget «Post merge-kort» (den sier
   ærlig hvorfor — f.eks. HTTP-status fra Discord).

Uten secrets-ene hopper Action-en stille over (guard-steget) — den feiler ikke.

## Fix-protokoll (referert av failure-alarmen)

Går workflowen rød, åpner den (dedupet) et `CI-vakt:`-issue. Diagnose:

- **Kort kommer ikke:** sjekk `Post merge-kort`-loggen. Vanligst: Discord HTTP 401
  (token utløpt/feil) eller 403/404 (bot ikke i kanalen / feil `DISCORD_CHANNEL_ID`).
- **Dobbelt kort:** labelen `discord:merge-kort` ble ikke lagt (se labeling-loggen)
  — sjekk `issues: write`-tilgang.
- **Kort for PR uten grønn CI:** skal ikke skje (`classifyChecks` gater); rapportér
  i så fall, det er en logikk-bug i `lib/loops/prCard.ts`.

Discord-feil er best-effort (logges, gir ikke rød kjøring) — morgenbriefens
«Discord-speiling feilet»-helselinje er backstop for «kortene sluttet å komme».

## Forhold til morgenbriefen

Morgenbriefen (`docs/loops/morgenbriefen.md`) speiler fortsatt sine
handlingslinjer med knapper i sin daglige kjøring. Dette PR-kortet er
komplementært: det dekker **alle** grønne PR-er hendelses-drevet, ikke bare de
briefen surfacer. Overlapp (en PR som både briefes og kortes) er ufarlig —
begge peker på samme `merge_pr:<N>`-knapp.

## Avgrenset ut (Del B, neste PR)

Skjermbilder av GUI-endringer (Playwright mot staging festet på kortet) er **Del
B** av #1159 og bygges separat.
