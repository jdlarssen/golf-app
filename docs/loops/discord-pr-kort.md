# Discord PR-kort — merge-knapp + GUI-skjermbilder for ALLE grønne PR-er (#1159)

Hendelses-drevet GitHub Action som poster ett Discord-kort med merge-knapp hver
gang en åpen PR blir CI-grønn — uansett opphav (natt-runner, CI-vakt,
dok-avstemmer ELLER interaktiv økt). Rører PR-en en visuell flate, festes
staging-skjermbilder av de berørte rutene på kortet (Del B). Målet: eieren
merger enhver klar PR fra mobilen, og ser GUI-endringen før han trykker
(#1073, «styr fra mobilen»).

Dette er **sender-siden**. Mottaker-siden (selve mergen når du trykker) er det
eksisterende interactions-endepunktet fra #1124
(`app/api/discord/interactions/route.ts`) — kortet gjenbruker `merge_pr:<N>`
uendret.

## Hva Action-en gjør

Fil: `.github/workflows/discord-pr-card.yml`. Tre steg (`scripts/loops/`):

1. **Trigger:** `workflow_run` når **CI**-workflowen fullfører (+ `workflow_dispatch`
   for manuell test mot ett PR-nummer). Checker ut PR-head-koden så skjermbildene
   viser koden under review. (Vi bruker `workflow_run`, ikke `check_suite`:
   check_suite fyrer ikke for GitHub-Actions-suiter, så CI trigget aldri kortet.)
2. **`decide-pr-card.ts` — gate + visuell-diff:** åpen · alle check-runs grønne
   (`classifyChecks`) · ikke allerede kortet. Avgjør om diffen rører en visuell
   flate (`isVisualChange`). Skriver `pr-card-plan.json` + `should_card`/`is_gui`.
   Tidlige, ufullstendige fyringer er ufarlige no-ops. (Ingen npm ci.)
3. **`screenshot-routes.ts` — kun visuell diff:** booter appen mot staging,
   kartlegger endrede filer til ruter (`lib/loops/prScreenshots`), logger inn via
   OTP-mint og tar mobil-skjermbilder. Best-effort — feil her feller ikke kortet.
4. **`post-pr-card.ts` — post → label:** PR-tittel (+ 📝 Draft) · norsk
   oppsummering (tagline fra body) · PR-lenke · grønn **✅ Merge**-knapp
   (`custom_id: merge_pr:<N>`) + lenke-knapp; fester skjermbilder via multipart.
   Poster FØRST, legger så dedup-labelen `discord:merge-kort` — et tapt kort er
   verre enn en sjelden dobbel.

**Menneske-porten står:** kortet gir deg knappen; det er ingen auto-merge. Når
du trykker, verifiserer #1124-endepunktet CI grønn på nytt, av-drafter og
rebase-merger.

## Del B — skjermbilder av GUI-endringer

Rører diffen `app/[locale]/**/*.tsx` eller `components/**` (ekskl. tester), tar
Action-en skjermbilder mot **staging** (aldri prod — samme rigg som `e2e:gate`:
appen bootes mot torny-staging, login via service-role OTP-mint).

- **Rute-oppslag** (`lib/loops/prScreenshots.ts`, unit-testet): page-endringer →
  rute fra stien med fikstur-substitusjon (`[id]`→seedet spill, `[slug]`→bane,
  osv.); kuraterte komponent-familier (leaderboard/scorecard/hull/podium) → seedet
  spill-rute; alt uoppløst → forsiden. Dedup + **cap 3** skjermbilder.
- **Fiksturer** resolveres mot staging (seeder ett spill, henter course/klubb
  (`groups`)/liga (`leagues`)/cup (`tournaments`)/spiller). Alt best-effort:
  manglende fikstur dropper bare den ruten. Seedet spill ryddes etterpå.
- **Mobil-viewport** (390×844) — appens primærcase.
- Ikke-visuell PR (backend/docs) → `is_gui=false` → hopper booten, poster kort uten bilder.

## Dedup & race

`discord:merge-kort`-labelen sikrer ett kort per PR: en senere `workflow_run`-fyring
(f.eks. re-kjørt CI) ser labelen og hopper over. `concurrency`-gruppa (per head-SHA,
`cancel-in-progress`) serialiserer samtidige fyringer. Restrisiko: to fyringer i
samme øyeblikk kan i sjeldne tilfeller gi to kort — akseptert for v1 (mildt) fremfor
å risikere et stille tapt kort.

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
- **Skjermbilder mangler på en GUI-PR:** les `Skjermbilder av GUI-ruter`-loggen
  (steget er `continue-on-error`, så det feller aldri jobben). Vanligst: dev-serveren
  booter ikke i tide, OTP-login feiler, eller en fikstur mangler på staging → ruten
  droppes. Kortet postes uansett uten bildene.

Discord-feil er best-effort (logges, gir ikke rød kjøring) — morgenbriefens
«Discord-speiling feilet»-helselinje er backstop for «kortene sluttet å komme».

## Forhold til morgenbriefen

Morgenbriefen (`docs/loops/morgenbriefen.md`) speiler fortsatt sine
handlingslinjer med knapper i sin daglige kjøring. Dette PR-kortet er
komplementært: det dekker **alle** grønne PR-er hendelses-drevet, ikke bare de
briefen surfacer. Overlapp (en PR som både briefes og kortes) er ufarlig —
begge peker på samme `merge_pr:<N>`-knapp.

## Avgrenset ut

- **Auto-merge:** aldri — menneske-porten står.
- **Vercel-preview-lenke på kortet:** til Vercel Preview er wiret mot staging
  («Fase 2») screenshotter vi den bootede appen, ikke previewen (som kan backe prod).
- **Diff-region-annotering / visuell regresjon:** kun rå skjermbilder i v1.
