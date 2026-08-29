# Discord PR-kort — auto-merge + kvittering, eller knapp der du trengs (#1159 + #1406)

Hendelses-drevet GitHub Action som reagerer hver gang en åpen PR blir CI-grønn
(og når en draft flippes til ready, #1516) —
uansett opphav (natt-runner, CI-vakt, dok-avstemmer ELLER interaktiv økt). Siden
eierbeslutningen 2026-07-28 (#1406) er kortet et **kvitteringskort**, ikke et
godkjenningskort: er PR-en kvalifisert og fri for produktvalg, merger kortet den
selv og poster en kvittering; trengs eieren (produktvalg, aldri-liste, manglende
staging-bevis), beholder kortet merge-knappen. Rører PR-en en visuell flate,
festes staging-skjermbilder av de berørte rutene på kortet (Del B) — for begge
kort-typene. Målet: eieren styrer fra mobilen, men slipper å trykke der det ikke
finnes et valg (#1073, «styr fra mobilen»).

Dette er **sender-siden**. Mottaker-siden (selve mergen når du trykker knappen)
er det eksisterende interactions-endepunktet fra #1124
(`app/api/discord/interactions/route.ts`) — knapp-kortet gjenbruker `merge_pr:<N>`
uendret. Auto-mergen bruker en egen helper (`lib/loops/autoMerge.ts`), ikke
mottakeren: mottakerens CI-port leser kun `ci.yml`-runs og ville avvist
docs-only-PR-er, som ikke kjører ci.yml (de har Vercel-checks pluss
no-op-tvillingens `verify`/`e2e` og `scan`, jf. #1477).

**Branch protection er backstop bak begge merge-veiene (#1477, fra 2026-08-07).**
Main krever grønn `verify` + `e2e` + `scan` på head-SHA-en server-side, så verken
auto-merge-helperen (`PUT …/merge`) eller knapp-endepunktet KAN fullføre en merge
hvis påkrevde checks mangler eller er røde — GitHub svarer 405. Kortets egne
porter (re-verifisering mot `headSha`, `sha`-guarden) beholdes for presise utfall
og feilmeldinger, men en logikk-glipp i dem kan ikke lenger komponere en
uverifisert merge. Docs-only-PR-er oppfyller kravene via no-op-tvillingen
(`ci-docs-noop.yml`).

## Hva Action-en gjør

Fil: `.github/workflows/discord-pr-card.yml`. Tre steg (`scripts/loops/`):

1. **Trigger:** `workflow_run` når **CI** eller **CI (docs no-op)** fullfører
   (tvillingen dekker docs-only-PR-ene hendelsesdrevet, #1483), ELLER
   `pull_request: ready_for_review` når en draft flippes til ready (#1516 —
   øktas «jeg er ferdig»-signal, se «Draft»-seksjonen under), ELLER
   `workflow_dispatch` mot ett PR-nummer (manuell test/re-post — se egen seksjon).
   Ved dispatch, tvilling-fyring OG ready-flipp VENTER decide-steget på at
   checkene lander (30 s-poll, maks ~10 min) i stedet for å gi opp på pending
   (#1301/#1483/#1516) — tvillingen fullfører før scan/Vercel, og en ready-flipp
   kan komme rett etter siste push, så uten venting fantes
   ingen senere fyring å falle tilbake på. Blandet PR (kode + docs): ci.yml-fyringen
   kansellerer den ventende tvilling-kjøringen (concurrency per head-SHA).
   Checker ut PR-head-koden så skjermbildene viser koden under review. (Vi bruker
   `workflow_run`, ikke `check_suite`: check_suite fyrer ikke for
   GitHub-Actions-suiter, så CI trigget aldri kortet.)
2. **`decide-pr-card.ts` — gate + tre-utfalls-klassifisering:** åpen · ikke draft
   (#1516, draft = «økta jobber fortsatt») · alle
   check-runs grønne (`classifyChecks`) · ikke allerede kortet → ellers `noop`.
   Klassifiserer så utfallet (`classifyAutoMerge`, se «Tre utfall» under) og avgjør
   om diffen rører en visuell flate (`isVisualChange`). Skriver `pr-card-plan.json`
   + `outcome`/`is_gui`. Tidlige, ufullstendige fyringer er ufarlige no-ops. (Ingen npm ci.)
3. **`screenshot-routes.ts` — kun visuell diff:** booter appen mot staging,
   kartlegger endrede filer til ruter (`lib/loops/prScreenshots`), logger inn via
   OTP-mint og tar mobil-skjermbilder. Best-effort — feil her feller ikke kortet.
   Tas for BEGGE kort-typene (auto-merge OG knapp) når `is_gui`.
4. **`post-pr-card.ts` — merge/post → dispatch → label:**
   - `outcome: 'card'` → dagens knapp-kort: PR-tittel (+ 📝 Draft) · norsk
     oppsummering · PR-lenke · grønn **✅ Merge**-knapp (`custom_id: merge_pr:<N>`)
     + lenke-knapp. Poster FØRST, legger så dedup-labelen `discord:merge-kort`.
   - `outcome: 'auto-merge'` → `mergePullRequest` (re-verifiser åpen + ikke draft
     (fail-closed, #1516) + CI grønn mot
     `headSha`, `PUT …/merge` rebase + `sha`-guard). Suksess → **lukk issuene**
     (#1634, se under) → **kvitteringskort**
     (✅ Merget + funksjonell-setning + lenke, KUN lenke-knapp) → main-verify-dispatch
     → dedup-label. Enhver merge-feil → fall tilbake til knapp-kortet i samme kjøring.

**Eksplisitt issue-lukking etter auto-merge (#1634).** GitHubs egen auto-close fyrer
IKKE når mergen kommer fra kortets workflow-identitet (`GITHUB_TOKEN`) — mønsteret var
6 av 6: ferdigbygde issues sto igjen åpne, med duplikat-bygg som konsekvens. Kortet gjør
derfor jobben selv:

- Decide trekker ut numrene fra PR-body-en med `closingIssueNumbers`
  (`lib/loops/autoMerge.ts`) — **kun** closing-nøkkelordene `close(s|d)`, `fix(es|ed)`,
  `resolve(s|d)`. `refs #N` og `part of #N` betyr «beslektet», ikke «levert», og lukker
  aldri. Numrene bæres i `pr-card-plan.json` (`closesIssues`), siden post-steget ikke
  har body-en.
- Post-steget kjører `closeLinkedIssues` rett etter merge-suksess og FØR
  main-verify-dispatchen (som kan gi exit 1). Per issue: GET (allerede `closed` → hopp
  over, aldri reopen) → `PATCH state=closed, state_reason=completed` → en kort kommentar
  som sier at kortet lukket issuet og at den ekte closing-kommentaren
  (Teknisk/Funksjonell) fortsatt er øktas ansvar.
- Best-effort per issue: enhver feil logges og lar løpet gå videre — en tapt lukking
  skal aldri felle en gjennomført merge. `DRY_RUN=1` logger kun hvilke issues som ville
  blitt lukket.

**Kvitteringskort, ikke godkjenningskort:** kvalifiserte PR-er merges av kortet
selv; knappen står bare igjen der eieren faktisk trengs. Trykker eieren en
gjenværende merge-knapp, verifiserer #1124-endepunktet CI grønn på nytt,
av-drafter og rebase-merger (uendret) — den stien merger med eierens egen
`GITHUB_LOOP_PAT`-identitet, ikke workflow-identiteten, så GitHubs auto-close
antas å fungere der som før og har ikke fått lukke-steget. Ser du et issue stå
åpent etter en knapp-merge også, er antakelsen feil: da hører `closeLinkedIssues`
hjemme i `executeAction`s `merge_pr`-gren i tillegg.

## Tre utfall (decide-steget, #1406)

`classifyAutoMerge` (`lib/loops/autoMerge.ts`, unit-testet) avgjør — første treff
vinner:

1. **`noop`** som før: ingen kandidat-PR · ikke åpen · draft (#1516) · allerede kortet · CI ikke grønn.

   **Hva «CI grønn» betyr (#1520):** `classifyChecks` (`lib/loops/prCard.ts`) filtrerer
   først bort kortets EGEN `post-card`-check (`CARD_CHECK_NAME`) — den er
   `in_progress` under hele decide-pollingen (den ER decide), og en kansellert
   kortkjøring etterlater `cancelled`, så uten filteret ville kortet aldri sett grønt
   eller sett rødt for alltid på samme SHA. Filteret gjelder både decide-steget og
   merge-endepunktets re-sjekk (ett hjem). Deretter **ci.yml-gaten**
   (`classifyWithCiGate` + `expectsRealCi`): rører diffen noe utenfor `paths-ignore`
   (`**.md`, `docs/**`, `.forge/**`), må GitHub ha REGISTRERT en `ci.yml`-kjøring for
   head-SHA-en før grønt slippes gjennom — tvillingen `ci-docs-noop.yml` rapporterer
   samme jobnavn og fullfører på sekunder, så på en blandet PR ser vinduet før
   ci.yml er registrert ellers grønt ut. Fail-closed: HTTP-feil, «ingen kjøring
   enda», eller at endrede filer ikke lot seg lese (`expectsRealCi(null)` → gate PÅ)
   → `pending`, aldri `green`. Docs-only-PR-er er uendret (gaten er av).
2. **`card`** (knapp-kort) når NOEN treffer:
   - base-branch ≠ `main`, eller tittelen inneholder ordet `WIP` (case-insensitivt).
   - **Aldri-lista** (`NEVER_AUTO_MERGE_GLOBS`): minst én endret fil rører
     `supabase/**`, `**/slett/**`, `**/slett-konto/**`, `proxy.ts`, `lib/auth/**`,
     `lib/supabase/**`, `app/api/**`, `app/[locale]/(auth)/**`, `**/betaling/**`,
     `lib/payment/**`, `.github/**`, `.githooks/**`, `.claude/**`, `lib/loops/**`
     eller `scripts/loops/**`. Migrasjoner, destruktive flyter, auth/sikkerhet,
     penger, enforcement-flater og merge-porten selv beholder menneske-porten
     (fail-closed, bredere enn issue-ets liste). Merk om porten-selv-radene
     (#1655): workflowen henter alltid main sin versjon av `lib/loops` +
     `scripts/loops` (#1181), så en PR dømmer aldri seg selv med egne regler —
     lista hindrer at en gate-endring auto-merges av den gamle gaten og deretter
     styrer alle senere PR-er uten at et menneske har sett den.
   - **Valg-markør:** PR-body **eller en av PR-ens kommentarer** har en markdown-
     heading som enten inneholder ordet «produktvalg» (`## Produktvalg`,
     `## Alternativer (produktvalg)`) eller starter med `## Alternativ A`–`E` (a–e),
     ELLER et lenket issue (`closes|fixes|resolves|refs|part of #N`) har labelen
     `autonomy:needs-decision`. Headingen er maskin-markøren økter MÅ sette når de
     presenterer et valg (CLAUDE.md steg 5); body er den foreskrevne plassen, men
     kommentarene leses fordi nattkjøreren gjengir alternativ-seksjonen DER (#1656).
     Kortets og nattkjørerens EGNE kommentarer teller med — en markør de har skrevet
     er nettopp et valg eieren skal ta. Prosa uten heading teller ikke; en negasjon
     («## Ingen produktvalg») teller derimot — bevisst fail-closed (#1623). Det
     samme gjelder en historisk alternativ-kommentar på en ombygd PR: den holder
     PR-en på knapp-kortet for alltid, og eieren merger manuelt.
     Kommentar-oppslaget er selv fail-closed: lar kommentarene seg ikke lese, blir
     utfallet `noop` (ingen kort, ingen merge) — en fail-open her ville gjenåpnet
     hullet #1656 lukket.
   - **Staging-porten:** PR-en er bruker-synlig (≥1 commit med `feat|fix|perf`-prefiks
     uten `[no-changelog]`, §T7) OG mangler `staging-verified`-labelen (#1076).
3. **`auto-merge`** ellers.

Hver degradering fra auto-merge til knapp-kort logges med `demotedReason` — ingen
stille tak.

**main-verify-dispatch:** en GITHUB_TOKEN-merge trigger ALDRI `main-verify.yml`
(#1075-nettet) via push (anti-rekursjon), så post-steget dispatcher det eksplisitt
etter en vellykket merge — MED MINDRE alle endrede filer matcher main-verifys egne
ignore-globs (`**.md`, `docs/**`, `.forge/**`; en slik merge kan ikke komponere rød
main). Dispatch-feil ETTER en merge gir exit 1 → failure-alarmen åpner CI-vakt-issue.

## Draft = «økta jobber fortsatt» (#1516)

Kortet rører ALDRI en draft-PR: decide noop-er den (ingen kort, ingen dedup-label,
ingen merge), og `mergePullRequest` er fail-closed på draft (race-guard: re-draftet
etter decide → knapp-kort-fallback). Draft-status er øktens/produsentens signal om at
flere pusher er på vei (forge-bokføring, natt-runnerens haler) — mønsteret som ellers
fikk kortet til å merge på eldre HEAD (#1499/#1513 → opprydnings-PR #1515).

`gh pr ready` er det eksplisitte «jeg er ferdig»-signalet: ready-flippen fyrer kortet
via `pull_request: ready_for_review`-triggeren, og siden flippen kan komme rett etter
siste push, venter decide på at checkene lander (samme mekanisme som dispatch/tvilling).
Nattkjører-drafts følger samme flyt: de ligger kortløse til hovedchatten kjører
`gh pr ready`.

**Unntak — mottakeren (knappen/#1124):** trykker eieren en merge-knapp på en draft
(f.eks. fra morgenbriefen), av-drafter mottakeren fortsatt før merge — et eier-trykk ER
menneskeporten. Økt-disiplinen (draft ved opprettelse, ready som siste handling) står i
`docs/forge-workflow.md` («Draft-først i økt-PR-flyten»).

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

**Spore en kort-kjøring (vakt-runder, #1802):** søk ALDRI etter kort-kjøringer på
PR-ens head-SHA — `workflow_run`-utløste relékjøringer listes under **main** sin
`head_branch`/`head_sha`, så SHA-søket finner bare den kansellerte
`pull_request`-kjøringen og konkluderer feilaktig «kortet uteble» (falsk alarm
#1802: kortet VAR postet av relékjøringen). Spor i stedet: list kandidatene med
`gh run list --workflow=discord-pr-card.yml --limit 20`, og finn riktig kjøring
via (a) PR-nummeret i Decide-loggen (`gh run view <id> --log | grep
decide-pr-card`), eller (b) `labeled`-tidsstempelet for `discord:merge-kort` på
PR-ens issue-timeline (`gh api repos/<repo>/issues/<pr>/timeline`) — kjøringen
som dekker det tidspunktet er den som postet.

## Docs-only-PR-er — hendelsesdrevet via no-op-tvillingen (#1483, før: #1301)

Docs-only-PR-er kjører ikke ci.yml (kvote-trimmen #1195: `paths-ignore` på `**.md`,
`docs/**`, `.forge/**`), men no-op-tvillingen `CI (docs no-op)` (#1477) kjører på
nøyaktig de path-ene og står i kortets `workflow_run`-trigger — kortet kommer
altså av seg selv, som for alle andre PR-er. Tvilling-fyringen venter på at
resten av checkene (scan, Vercel) lander før den gater (samme ventemekanisme som
dispatch, se steg 1).

Den gamle #1301-konvensjonen — produsenten dispatcher kortet selv
(`gh workflow run discord-pr-card.yml -f pr="$PR_NUMBER"`) — er avviklet, og
produsent-dispatchene er fjernet (`dok-skjema.sh` og morgenbriefens arkiv-PR,
#1483-oppryddingen). Produsenter skal IKKE legge til dispatch. Manuell dispatch
består som test-/re-post-verktøy, og er ufarlig som duplikat (dedup-labelen
`discord:merge-kort` + concurrency-gruppa sluker den).

## Robot-åpnede PR-er må ha menneskelig forfatter (#1701)

To Actions-produsenter åpner PR-er mot `main`: ukesversjon (mandag) og dok-skjema
(søndag). Begge MÅ åpne PR-en med secreten `PR_AUTHOR_PAT` — ikke med
`github.token`.

**Hva GitHub endret:** fra **11. juni 2026** («Bot-created pull requests can run
workflows if approved») blir `pull_request`-kjøringene for PR-er som
`github.token` åpner *opprettet*, men parkert som `action_required` («Approve and
run») til noen med skrivetilgang klikker. Ingen repo- eller org-innstilling skrur
kravet av; GitHubs egen anbefaling er å bruke et personlig token eller en GitHub
App til selve PR-opprettelsen. Verifisert her: 3 av 3 robot-PR-er de siste tre
ukene (#1699, #1681, #1552) — og #1335 fra 26. juli — hadde attempt 1 =
`action_required`.

**Hvorfor det stoppet kortet:** parkerte kjøringer er ikke grønne, så branch
protection nekter merge, OG `classifyChecks` ser `action_required` ∈
`BAD_CONCLUSIONS` → `red` → `noCard('CI red')`. Selv etter et manuelt «Approve and
run» kom det ingen kort: `workflow_run`-kjeden fyrer ikke fra en
`github.token`-startet PR. Fiksen ligger derfor i **forfatterskapet**, ikke i
klassifisereren — `action_required` skal fortsatt være rødt (fail-closed).

**Regelen:**

- Produsenter i Actions åpner PR-en med `GH_TOKEN="$PR_AUTHOR_PAT" gh pr create`.
  Delt helper: `.github/scripts/robot-pr.sh` (`robot_pr_create`).
- Pushen kan fortsatt gå med `github.token` — `push`-eventet trigger ingen
  workflows her (ci.yml/secret-scan er `pull_request`-only).
- ⚠️ **ALDRI push til robot-branchen med `github.token` ETTER at PR-en er åpnet** —
  `synchronize` parkeres like fullt, og PR-en står like langt tilbake.
- **Produsenter skal fortsatt IKKE dispatche kortet** (#1483 står). PAT-
  forfatterskap gjør hendelseskjeden identisk med menneske-PR-ene — det er hele
  poenget, og da trengs ingen dispatch.
- Mangler eller avvises PAT-en, faller helperen tilbake til `github.token`, og
  parkerings-detektoren (`robot_pr_verify_not_parked`) filer et dedupet issue (se
  fix-protokollen). PR-en er verdifull selv parkert — bokføringen rulles aldri
  tilbake av dette.

### Eier-oppsett: `PR_AUTHOR_PAT` (engangs)

1. **Hvor:** GitHub → **Settings** (din egen profil, ikke repoet) → **Developer
   settings** → **Personal access tokens** → **Fine-grained tokens** →
   **Generate new token**.
2. **Hva du legger inn:** Repository access = **Only select repositories** →
   `jdlarssen/golf-app`. Permissions: **Pull requests: Read and write** +
   **Contents: Read-only** (Metadata: Read følger automatisk). Utløp: det lengste
   GitHub tilbyr. Kopier tokenet, gå så til repoet → **Settings → Secrets and
   variables → Actions → New repository secret**, navn `PR_AUTHOR_PAT`, lim inn
   verdien.
3. **Hva du forventer å se etter:** `PR_AUTHOR_PAT` listet under «Repository
   secrets». (Verdien vises aldri igjen — det er normalt.)
4. **Hvis det ikke ser slik ut:** neste robot-PR åpnes med `github.token`, og du
   får et issue som heter «… PR-en står med «Approve and run» …». Det issuet ER
   signalet om at secreten mangler eller er utløpt.

Tokenet trenger **ikke** Contents: write — pushen går fortsatt med
`github.token`, og PAT-en brukes kun til `gh pr create`. Minst mulig makt.

## Eier-oppsett (engangs) — Actions-secrets

**Steg 0 — Interactions Endpoint URL (mottakerens av/på-bryter):** knappene
virker KUN når Discord-appen (Developer Portal → *Tørny-loopene* → **General
Information**) har **Interactions Endpoint URL** satt til
`https://tornygolf.no/api/discord/interactions`. Uten den leveres trykk til
gateway-en der ingen lytter, og hvert trykk ender som «svarte ikke i tide» —
env-ene i Vercel var på plass fra #1124, men dette feltet sto tomt til
2026-07-19 (#1297). Discord PING-validerer URL-en ved lagring; blir lagringen
avvist, er `DISCORD_PUBLIC_KEY` i Vercel feil.

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
- **Kort kommer ikke for en draft-PR:** forventet (#1516) — draft = «økta jobber
  fortsatt», decide noop-er. Kortet kommer når PR-en markeres ready (`gh pr ready`).
- **Robot-PR (ukesversjon/dok-skjema) står med «Approve and run»:** `PR_AUTHOR_PAT`
  mangler eller er utløpt — se «Robot-åpnede PR-er må ha menneskelig forfatter
  (#1701)». Kortet er ikke buggy her: parkerte kjøringer ER røde, med vilje.
  Godkjenn kjøringene på PR-en for å få den gjennom nå, og forny secreten for å
  slippe klikket neste uke. Rutinen har selv filet et issue om det.
- **Dobbelt kort:** labelen `discord:merge-kort` ble ikke lagt (se labeling-loggen)
  — sjekk `issues: write`-tilgang.
- **Kort for PR uten grønn CI:** skal ikke skje (`classifyChecks` gater); rapportér
  i så fall, det er en logikk-bug i `lib/loops/prCard.ts`.
- **Skjermbilder mangler på en GUI-PR:** les `Skjermbilder av GUI-ruter`-loggen
  (steget er `continue-on-error`, så det feller aldri jobben). Vanligst: dev-serveren
  booter ikke i tide, OTP-login feiler, eller en fikstur mangler på staging → ruten
  droppes. Kortet postes uansett uten bildene.
- **Auto-merge falt tilbake til knapp-kort:** forventet fail-closed — en åpen/CI-race
  (409 sha-mismatch), rebase-konflikt (405) eller draft ved re-sjekk (#1516) gjør at
  kortet poster knappen i stedet. Grunnen står i `Post merge-kort`-loggen (`demotedReason` /
  `falt tilbake til knapp-kort — <grunn>`); dette er ikke en bug, bare menneske-porten.
- **Issuet står åpent etter en auto-merge:** les `Post merge-kort`-loggen. Enten fant
  `closingIssueNumbers` ingen closing-referanse i PR-body-en (`Refs #N` alene lukker
  ikke — bruk `Closes #N`), eller lukkingen feilet med en HTTP-status som står i loggen
  (`#N: lukking feilet …`). Lukk manuelt og sjekk `issues: write` i workflowen.
- **main-verify-dispatch feilet (dette issuet):** mergen er gjennomført, men
  #1075-nettet ble ikke dispatchet (post-steget ga exit 1). Kjør main-verify manuelt:
  GitHub → Actions → **Main verify → Run workflow** (ref `main`) — eller sjekk om main
  allerede er verifisert grønn av en senere push. Rot-årsak i loggen (HTTP-status fra
  dispatch-kallet; typisk manglende `actions: write`).

Discord-feil er best-effort (logges, gir ikke rød kjøring) — morgenbriefens
«Discord-speiling feilet»-helselinje er backstop for «kortene sluttet å komme».

## Forhold til morgenbriefen

Morgenbriefen (`docs/loops/morgenbriefen.md`) speiler fortsatt sine
handlingslinjer med knapper i sin daglige kjøring. Dette PR-kortet er
komplementært: det dekker **alle** grønne PR-er hendelses-drevet, ikke bare de
briefen surfacer. Overlapp (en PR som både briefes og kortes) er ufarlig —
begge peker på samme `merge_pr:<N>`-knapp.

## Avgrenset ut

- **GitHubs innebygde auto-merge / branch protection** (Pro-gated): vi merger selv
  fra post-steget, ikke via GitHub-funksjonen.
- **Retroaktiv behandling** av allerede-åpne PR-er/kort: klassifiseringen kjører kun
  på nye events; dedup-labelen gater eksisterende kort uansett.
- **Vercel-preview-lenke på kortet:** til Vercel Preview er wiret mot staging
  («Fase 2») screenshotter vi den bootede appen, ikke previewen (som kan backe prod).
- **Diff-region-annotering / visuell regresjon:** kun rå skjermbilder i v1.
