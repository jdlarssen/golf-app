# Nattkjøreren — kø-drevet natt-autonomi (#1079, epic #1073)

Nattlig cloud-routine som bygger eier-merkede issues til ferdig-verifiserte
draft-PR-er. Kjøres i fersk klone i isolert sky-VM — det finnes ingen lokal
worktree-tilstand å skade.

## Harde rammer (brudd er aldri OK)

- **ALDRI merge.** Leveransen er draft-PR-er på `claude/`-brancher. Eieren merger.
- **Aldri prod.** Prod-brannmuren (#1074) følger repoet og gjelder i klonen;
  miljøet skal kun ha staging-nøkler.
- **Kun eier-mandat:** bygg KUN issues merket `autonomy:ready`. Aldri plukk
  «noe som ser nyttig ut» — flyt-forankring er eierbeslutning (jf. #318-presedensen).
  Et eier-svar «alternativ B/C» på en `autonomy:review`-PR er likestilt mandat
  med `autonomy:ready` (#1406-modellen) — det er en eierbeslutning som allerede
  er tatt, bare i PR-tråden i stedet for på issuet. Slike Steg 0-ombygginger er
  det ENESTE bevisste unntaket fra #1307-PR-vakta, som ellers forbyr å bygge på
  et issue med åpen PR: her er det nettopp PR-en mandatet gjelder.
- **Fail-closed:** hvert utfall etterlater artefakt (PR, label, kommentar).
  Stille exit er forbudt — heartbeat postes ALLTID (steg 6).

## Steg 0 — Ombyggings-svar i åpne natt-PR-er

Eieren svarer «alternativ B» i PR-tråden når det bygde alternativ A ikke var
riktig (auto-merge-policyen #1406, PR-presentasjonsformen #1413). Det svaret er
et ferdig eier-mandat som ligger og venter, og **et ventende eiersvar er eldre
mandat enn et nytt kø-issue — ombygging går derfor FORAN kø-plukking.** Kjør
dette steget først, hver natt.

1. **List kandidatene:** `gh pr list --state open --label autonomy:review --json
   number,createdAt,body`. Ingen treff → rett til Steg 1. Interaktive økters
   PR-er bærer ikke labelen og er utenfor filteret per design.
2. **Les KUN kommentarene** på hver PR (`gh pr view <M> --json comments`).
   **PR-body-en skannes ALDRI** — den inneholder selv hele
   `## Alternativer (produktvalg)`-seksjonen og svar-instruksen «svar
   'alternativ B' her», så en body-skanning false-matcher garantert på sin egen
   tekst (verifisert på live PR #1414).
3. **Hva som teller som svar:** en kommentar som matcher **anchored**
   `^\s*alternativ\s*(B|C)\b` (case-insensitivt) OG er postet ETTER baseline.
   Anchoringen er hentet fra kontrakt-smedens
   `^Eierbeslutning via Discord: \*\*(A|B)\*\*`-presedens (kontrakt-smeden.md,
   test-låst) — nettopp fordi kvitterings- og instruksjonstekst ellers
   false-matcher.
   - **Baseline** = tidsstempelet på nattkjørerens siste leveranse- eller
     🔁-kvitteringskommentar på PR-en. Finnes ingen slik kommentar: PR-ens
     `createdAt`.
   - **Egen-kommentar-filter (belte og seler):** kommentarer som bærer
     🤖- eller 🔁-markøren er nattkjørerens egne og teller aldri som svar.
   - **Forfatter-sjekk er informasjon, IKKE vakten.** Agent-postede PR-er og
     kommentarer bærer eierens `jdlarssen`-login (bekreftet på #1414; jf.
     morgenbriefen.md om at GitHub aldri varsler eieren om aktivitet under hans
     egen identitet). Vakten er mønsteret + baselinen + markør-filteret.
   - **Flere svar på samme PR:** det siste svaret etter siste 🔁-kvittering
     vinner.
   - **«alternativ A» matcher med vilje ikke** — A er allerede bygget, og PR-en
     venter da bare på merge.
   - **Utydelige svar** («kanskje B?», lange resonnement) matcher ikke.
     Mønsteret er bevisst smalt: det som ikke fanges her, surfacer morgenbriefen
     som en åpen PR neste morgen — bedre enn en gjetning midt på natten.
4. **Svar funnet → bygg om, i denne rekkefølgen:**
   1. **Preflight først:** kjør Steg 2.2 (grønn-main-sjekken, inkl. `npm ci` —
      den ferske klonen har ingen `node_modules`) hvis den ikke alt er kjørt
      denne natten. Rød main → avbryt natten som ellers i Steg 2.2.
   2. **Post kvitteringen FØR du bygger:** `🔁 Bygger om til alternativ <X> i
      natt` som PR-kommentar. Den er dedupe-markøren OG den nye baselinen —
      uten den plukker neste natt det samme svaret om igjen.
   3. **Slå opp kontrakten:** `Closes #<n>` i PR-body-en → issuets
      kontrakt-kommentar → `## Alternativer (produktvalg)`-seksjonen →
      beskrivelsen av det valgte alternativet. Finner du ikke seksjonen: ikke
      gjett hva B er. Post en norsk kommentar om at alternativet ikke lot seg
      slå opp, og la PR-en stå.
   4. **Bygg om på SAMME branch** — aldri ny branch, aldri ny PR; svaret gjelder
      denne PR-en. Steg 3 mot det valgte alternativet (hopp over «Ny
      branch»-punktet — PR-ens branch beholdes), deretter Steg 4 og Steg
      4.5 i sin helhet på nytt. Kryss-modell-gaten kjøres om igjen: en
      ombygging er en ny leveranse, ikke en rettelse.
   5. **Oppdater PR-kommentaren** med en ny 🤖-kommentar per Steg 5: nytt bevis
      (gate-utfall, e2e, kryss-modell-gate) + oppdatert alternativ-status
      («valgt: B — nå bygget»), med A beholdt i listen så historikken er lesbar.
5. **Uferdig ombygging (krasjet natt):** en 🔁-kvittering UTEN en påfølgende
   oppdatert leveransekommentar betyr at forrige natt døde midt i ombyggingen.
   **Gjenoppta den** — samme branch, samme alternativ — før du plukker noe nytt
   fra køen.
6. Ingen svar på noen av PR-ene → gå til Steg 1 som ellers.

Ombygginger er leveranser og teller i budsjettet: mot de 2 i Steg 1 og mot
4-totalen i Steg 2.1.

## Steg 1 — Kø

`gh issue list --label autonomy:ready --state open --json number,createdAt` →
plukk det ELDSTE. Tom kø → heartbeat «ingen kø» på #1110 og avslutt. Det er
suksess, ikke tomgang.

**PR-vakt før bygging (#1307):** har det plukkede issuet allerede en åpen PR med
`Closes #<issuenr>` i body (`gh pr list --state open --search "Closes #<n>"`),
IKKE bygg på nytt — det er en rest-tilstand (levert før Steg 5 fjernet labelen,
eller en umerget natt-PR). Fjern `autonomy:ready`, noter i heartbeaten, og gå
til neste i køen. Re-kø etter en PR som lukkes ubygd er et eier-tapp, aldri
automatikk.

**Budsjett: maks 2 issues per natt** (hevet fra 1 den 2026-07-09 — Discord-kortet
+ skjermbilde (#1159) gjorde review-loopen rask nok til å håndtere to leveranser).
Bygg det ELDSTE ready-issuet gjennom steg 2–5, og **gjenta steg 2–5 for
neste-eldste** til 2 er levert ELLER køen er tom. **Ombygginger fra steg 0
teller med i de 2** — en natt med to ombygginger plukker ingen nye issues.
Grønn-main-sjekken (steg 2.2) kjøres kun ÉN gang, ved nattens første bygg eller
ombygging: draft-PR-er merges ikke, så main endres ikke mellom byggene. Økes
videre kun av eieren via PR når tilliten er etablert.

## Steg 2 — Per-issue preflight (fail-closed)

1. **Kontrakt-krav:** issuet MÅ ha en forge-kontrakt som issue-kommentar
   (header «Forge-kontrakt tilgjengelig», jf. docs/forge-workflow.md). Mangler
   den → sett `autonomy:blocked` + norsk kommentar («mangler kontrakt — kjør
   /forge:contract i en interaktiv økt»), fjern `autonomy:ready`, og plukk
   NESTE fra køen. Blokkerte issues teller IKKE mot bygg-budsjettet, men se på
   maks **4 issues totalt** per natt (leverte + blokkerte + steg 0-ombygginger)
   — deretter avslutt, så en natt aldri drukner i skip.
2. **Grønn-main-sjekk:** `npm ci` + `npm run typecheck && npm test && npm run lint
   && bash tests/hooks/guard.test.sh` på fersk main FØR bygging. Rød →
   avbryt hele natten: verifiser at CI-vakt-varselissue finnes (opprett hvis
   ikke), heartbeat «avbrutt — main rød», ferdig. Nattkjøreren fikser ikke
   main; det er CI-vaktas jobb.

## Steg 3 — Bygg (forge:auto-disiplin)

- **Modell-ruting (eierbeslutning 2026-07-30, #1413):** routinen kjører på
  **Fable** som orkestrator; selve implementasjonsarbeidet dispatches til
  subagenter med `model` eksplisitt satt til **Opus**. Fable organiserer (kø,
  preflight, gates, leveranse), Opus bygger.
- Ny branch `claude/natt-<issuenr>-<slug>` (unntak: Steg 0-ombygginger beholder
  PR-ens eksisterende branch).
- Bygg mot kontrakten: implementer → kjør gates → evaluer skeptisk i fersk
  kontekst → fiks. **#1077-konvergensreglene gjelder** (docs/forge-workflow.md
  → Konvergensregler): runde-historikk i `.forge/evaluations/<slug>-runder.md`
  committes, maks 5 evaluate-runder, strategibytte etter to identiske
  finding-sett, aldri «én runde til» forbi taket.
- Atomiske commits med `Refs #<issuenr>`; notatfil under `.changes/` per
  CLAUDE.md-reglene for feat/fix — aldri versjonsbump, aldri CHANGELOG-linje
  (ukesrutinen bokfører mandag; mal: `.changes/README.md`).

## Steg 4 — Verifisering utover gates

- Finnes staging-env i routine-miljøet (`NEXT_PUBLIC_SUPABASE_URL` peker på
  staging-ref `snwmueecmfqqdurxedxv`): kjør `npm run e2e:gate`. Grønn → noter
  i PR-kommentaren.
- Matcher ikke miljøets pre-installerte browser-build pinnet Playwright (feiler
  med «Executable doesn't exist»): eksportér
  `PW_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium` før `npm run e2e:gate`
  — da brukes binæren direkte i stedet for det bundlede registry-oppslaget (#1183).
- Mangler env, eller e2e dekker ikke den berørte flyten: sett
  `needs-manual-qa`-label på PR-en og skriv i PR-kommentaren nøyaktig hvilken
  flyt som må klikkes gjennom (stagingbevis-porten #1076 tar den i en
  interaktiv økt). Dette er et eksplisitt utfall — aldri hopp stille over.

## Steg 4.5 — Kryss-modell-gate (annen modell enn byggeren)

Byggeren og forges egen evaluator kjører på samme modell, så de deler blindsoner —
en plausibel-men-feil build kan bli ACCEPT-et av sitt eget hode (#1073-fragiliteten,
verifisert på #1152: `forge/evaluate.md` setter ingen modell, arver orkestratoren).
Derfor: ETT siste, uavhengig skeptisk gjennomsyn på en **annen modell** før levering.

- Spawn en general-purpose Task-agent med `model` eksplisitt satt til en annen
  modell enn BYGGEREN (bygg-subagentene kjører Opus, jf. Steg 3 → gate
  **Sonnet**). Gi den KUN kontrakten,
  diffen (`git diff origin/main`) og forges evalueringsrapport — fersk kontekst,
  ingen bygg-historikk.
- Prompt: prøv å **motbevise** at kontraktens Success Criteria er oppfylt. Finn én
  konkret, etterprøvbar defekt (feil fil, uoppfylt kriterium, manglende edge-case).
  I tvil: REJECT (fail-closed).
- **CONFIRMS** (ingen substansiell defekt) → noter «kryss-modell-gate: Sonnet
  CONFIRM» i PR-kommentaren, gå til Steg 5.
- **REJECTS** med substansielt funn → behandle som én konvergensrunde til: fiks
  innenfor #1077-taket (maks 5 evaluate-runder TOTALT, gaten teller med), kjør
  gaten på nytt. Tak nådd eller gaten avviser fortsatt → IKKE lever som review-klar;
  eskalér per Steg 5 «Ikke konvergert».
- Kan du ikke spawne en annen modell (utilgjengelig) → behandl som ikke-bestått
  gate og eskalér. Aldri lever ubekreftet fordi kryss-sjekken ikke lot seg kjøre.

## Steg 5 — Lever

- **Konvergert (ACCEPT):** DRAFT-PR med `Closes #<issuenr>` i body,
  `autonomy:review`-label, norsk PR-kommentar: hva som er bygget, hvilke
  kriterier som er bevist (med kommando-utfall), hva som evt. gjenstår manuelt.
  **Kommentaren MÅ åpne med 🤖-markøren** (gjelder også ombyggings-oppdateringen
  fra Steg 0) — det er denne markøren steg 0s egen-kommentar-filter leser for å
  skille nattkjørerens egen tekst fra et eier-svar.
  - **Produktvalg i kontrakten** (`## Alternativer (produktvalg)`-seksjon eller
    `"produktvalg": true` i json-blokken): gjengi HELE seksjonen i
    PR-kommentaren på norsk, i den faste formen fra CLAUDE.md
    §«PR-presentasjon» (formens ene hjem) — anbefaling først, fordeler/ulemper
    per alternativ (også bygget A), ombyggingskostnad, reversibilitet, og
    avslutningen med svar-instruks + «ingen hast». Produktvalg-PR-er
    auto-merges aldri av noen økt før eieren har valgt.
  - **Uten produktvalg:** feat/fix/perf-leveranser får likevel en kort
    «Fordeler/ulemper»-blokk for valgt løsning i PR-kommentaren (2–3 hver,
    produktspråk — CLAUDE.md §«PR-presentasjon»).
  **Fjern deretter `autonomy:ready` fra issuet (#1307)** — PR-en bærer mandatet
  videre, og labelen skal aldri overleve leveringen (ellers re-plukkes issuet
  neste natt og bygges som duplikat, jf. #1253-varselet 2026-07-18).
- **Closing-kommentar ved levering:** post samtidig CLAUDE.md-konvensjonens
  Teknisk/Funksjonell-kommentar på ISSUET, innledet med «Lukkes automatisk når
  eieren merger PR #<M>». Auto-close ved merge skriver ingen kommentar selv,
  og eieren skal slippe — kommentaren må derfor stå klar FØR merge (hull
  funnet ved første kjøring: #1099 lukket kommentar-løst).
- **Ikke konvergert:** push delarbeidet som draft-PR, post utfylt
  `.forge/templates/eskalering.md` som issue-kommentar (runde-tabell + ETT
  A/B-spørsmål), sett `autonomy:blocked`, fjern `autonomy:ready`.

## Steg 6 — Heartbeat (ALLTID, uansett utfall)

Én avsluttende kommentar på det pinnede Loop-drift-issuet **#1110**:

`🌙 Nattkjøreren <dato>: <utfall>` der utfall er ett av: `bygde #N → PR #M
(review-klar)` / `bygde om PR #M → alternativ B` / `blokkerte #N (<grunn>)` /
`ingen kø` / `avbrutt — main rød` / `avbrutt — <miljøfeil>`.

Morgenbriefen (#1080) bruker heartbeaten som liveness-signal — mangler den,
flagges det.
