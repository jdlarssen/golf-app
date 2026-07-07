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
- **Fail-closed:** hvert utfall etterlater artefakt (PR, label, kommentar).
  Stille exit er forbudt — heartbeat postes ALLTID (steg 6).

## Steg 1 — Kø

`gh issue list --label autonomy:ready --state open --json number,createdAt` →
plukk det ELDSTE. Tom kø → heartbeat «ingen kø» på #1110 og avslutt. Det er
suksess, ikke tomgang.

**Budsjett v1: maks 1 issue per natt.** Økes kun av eieren (endre dette tallet
via PR når tilliten er etablert).

## Steg 2 — Per-issue preflight (fail-closed)

1. **Kontrakt-krav:** issuet MÅ ha en forge-kontrakt som issue-kommentar
   (header «Forge-kontrakt tilgjengelig», jf. docs/forge-workflow.md). Mangler
   den → sett `autonomy:blocked` + norsk kommentar («mangler kontrakt — kjør
   /forge:contract i en interaktiv økt»), fjern `autonomy:ready`, og plukk
   NESTE fra køen (maks ett ekstra forsøk per natt — deretter avslutt).
2. **Grønn-main-sjekk:** `npm ci` + `npm run typecheck && npm test && npm run lint
   && bash tests/hooks/guard.test.sh` på fersk main FØR bygging. Rød →
   avbryt hele natten: verifiser at CI-vakt-varselissue finnes (opprett hvis
   ikke), heartbeat «avbrutt — main rød», ferdig. Nattkjøreren fikser ikke
   main; det er CI-vaktas jobb.

## Steg 3 — Bygg (forge:auto-disiplin)

- Ny branch `claude/natt-<issuenr>-<slug>`.
- Bygg mot kontrakten: implementer → kjør gates → evaluer skeptisk i fersk
  kontekst → fiks. **#1077-konvergensreglene gjelder** (docs/forge-workflow.md
  → Konvergensregler): runde-historikk i `.forge/evaluations/<slug>-runder.md`
  committes, maks 5 evaluate-runder, strategibytte etter to identiske
  finding-sett, aldri «én runde til» forbi taket.
- Atomiske commits med `Refs #<issuenr>`; versjonsbump/CHANGELOG per
  CLAUDE.md-reglene for feat/fix.

## Steg 4 — Verifisering utover gates

- Finnes staging-env i routine-miljøet (`NEXT_PUBLIC_SUPABASE_URL` peker på
  staging-ref `snwmueecmfqqdurxedxv`): kjør `npm run e2e:gate`. Grønn → noter
  i PR-kommentaren.
- Mangler env, eller e2e dekker ikke den berørte flyten: sett
  `needs-manual-qa`-label på PR-en og skriv i PR-kommentaren nøyaktig hvilken
  flyt som må klikkes gjennom (stagingbevis-porten #1076 tar den i en
  interaktiv økt). Dette er et eksplisitt utfall — aldri hopp stille over.

## Steg 5 — Lever

- **Konvergert (ACCEPT):** DRAFT-PR med `Closes #<issuenr>` i body,
  `autonomy:review`-label, norsk PR-kommentar: hva som er bygget, hvilke
  kriterier som er bevist (med kommando-utfall), hva som evt. gjenstår manuelt.
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
(review-klar)` / `blokkerte #N (<grunn>)` / `ingen kø` / `avbrutt — main rød` /
`avbrutt — <miljøfeil>`.

Morgenbriefen (#1080) bruker heartbeaten som liveness-signal — mangler den,
flagges det.
