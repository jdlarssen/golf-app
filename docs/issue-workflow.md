# Issue-arbeidsflyt

> Flyttet ordrett fra CLAUDE.md (#2100). Leses når du oppretter, plukker opp eller lukker et issue, eller finner noe utenfor scope (`docs/agent-discipline/core.md` T11).

Alt backlog-arbeid spores i [GitHub Issues](https://github.com/jdlarssen/golf-app/issues), ikke i markdown-filer.

#### Milestone på alle nye issues (mandatory)

Hvert `gh issue create` MÅ ha `--milestone` (bash-guard-hooken minner på det). Velg mot flyt-kompasset; passer ingen → default `Backlog — uplanlagt / scale-triggered` og si fra i meldingen. **Mojibake-felle:** Tier 1/Tier 5-titlene har korrupte tegn lagret, så `--milestone "<tittel>"` matcher ikke — sett via nummer: `gh api -X PATCH repos/jdlarssen/golf-app/issues/N -F milestone=<num>` (nummer fra `gh api .../milestones`).

#### Brukerflyt-forankring (mandatory, før alt annet)

Brukerflytene er sannhetskilden for hva som er core. `docs/flows/*-fremtid.svg` = fremtidig kjerne-flyt vi bygger mot; `docs/user-flows.md` = tekst-referanse. `docs/hva-er-nok.md` = ferdiggrensen: hva som er fryst og parkert, og hvilke triggere som vekker noe — sjekk den FØR du oppretter eller bygger feature-issues. Før du løser et issue:

1. **Sjekk at issuet hører hjemme i en flyt.** Er featuren ikke representert i fremtids-flytene, still spørsmålet «trenger vi den?» og ta det med brukeren før du bygger — et eldre issue isolert er ikke mandat nok. Flytene definerer prioritet, ikke issue-alderen.
2. **Prioriter mot flytene.** Når du velger hva som skal gjøres, vei det mot hvilken flyt det gjør optimal. Funksjonelle hull i kjernesløyfa (opprett → bli med → spill → avslutt) går foran polish.
3. **Hold flytene levende.** Endrer arbeidet en flyt, oppdater diagrammet (regenerer PNG per `docs/flows/README.md`) i samme PR — ellers bygger vi noe som ikke står i kartet.

Presedens: #318 (sømløs invitasjons-innlogging) ble satt til side fordi fremtids-flyten ikke inkluderte den — self-reg dekket retningen. Verifiser mot flyten, ikke mot et to-dager-gammelt issue.

#### Closing-kommentar (ALLTID — og bare én per issue)

Når en issue lukkes, MÅ det stå en closing-kommentar på den. **Sjekk tråden først** (`gh api repos/jdlarssen/golf-app/issues/N/comments --jq '.[] | "\(.id) | \(.body | split("\n")[0])"'`), for det finnes ofte en fra før:

- **Finnes det alt en leveranse-/closing-kommentar** (typisk byggeøktas eller nattkjørerens «Bygget på PR #M — venter på merge …» med `## Teknisk`/`## Funksjonell`): IKKE post en ny. Gå gjennom den og korrigér det som ikke lenger står seg — merge-status og merge-SHA, prod-migrasjonsstatus, avvik som kom til underveis — med `gh api -X PATCH repos/jdlarssen/golf-app/issues/comments/<id> --input <json-fil med body>`. Postet du en dublett likevel: slett din egen og fold rettelsene inn i originalen. (Eierregel 2026-09-02 etter #1884, jf. #1907 — bash-guard minner om det i det du kjører `gh issue comment` på en tråd som alt har en.)
- **Finnes ingen:** post én med `gh issue comment N --body-file …`. Kommentaren har to seksjoner:
  - **`## Teknisk`** — hvilke filer/komponenter endret, hvilken approach, evt. avvik fra issue-design, PR-link + commit-SHA-er, og linja `Nye issues: 0` (§Null-vekst).
  - **`## Funksjonell`** — hva brukeren ser i appen nå, på vanlig norsk, action-orientert. Samme tone som CHANGELOG-taglines («Du kan nå …», «Når X skjer, sier appen nå …»).

Gjelder også når subagenter har gjort selve implementasjonen — hovedchatten skriver (eller korrigerer) closing-kommentaren, ikke subagenten.

#### Avvik fra issue-design

Skal eksplisitt nevnes under «Teknisk» i closing-kommentaren — ikke skjul kutt, scope-endringer eller utsatte deler.

#### Null-vekst — funn underveis (mandatory; eierbeslutning 2026-09-15, #2096)

**En PR som lukker et issue oppretter ingen nye.** Småfiks-runde 2 lukket 37 issues og opprettet 41 (82 → 106 åpne) fordi den gamle regelen «reviewer-funn → issue før merge» ikke hadde noen motvekt: å file var alltid lov, å fikse var valgfritt. Ferdiggrensen (`docs/hva-er-nok.md`) sier at backloggen skal vokse av ekte behov, ikke av at maskineriet finner ting. Derfor:

1. **Scope = mønsteret, ikke stedet.** Sier issuet «X har flere hjem», «Y sjekker ikke Z» eller «lenkene er for små», er ALLE forekomstene av mønsteret i scope (trap 4, T2 steg 3). Søsken fikses i samme PR, gjerne som egne commits. «Eget issue for søsknene» og «rest etter #N» er forbudt — det betyr at du ikke var ferdig.
2. **Funn i koden PR-en rører fikses i PR-en.** Evaluator- og reviewer-funn i diffen (feil tekst, feil melding, manglende test, kant-tilfelle i ny kode, UX-nit på ny flate) er ikke funn, det er ugjort arbeid. Fiks før merge — eller aksepter eksplisitt i PR-body under `## Akseptert` med én setning hvorfor. Aldri issue.
3. **Funn utenfor diffen** (noe du så mens du leste naboen): er det en bug en spiller kan treffe, reprodusert (test eller staging) og liten (under ~50 linjer, 1–2 filer) → fiks den i samme PR som egen commit (`Refs #<issuet du løser>` + «søsken-funn» i body). Alt annet → én linje under `## Observert, ikke rørt` i PR-body. Ikke issue, ingen liste andre steder. Eieren ber om et issue hvis han vil ha det bygget — det er slik «speak up» (samarbeidsklausul 3) praktiseres her.
4. **Aldri file som issue:** manglende tester (skriv den eller dropp), refactor-ønsker og «N hjem» (fiks nå eller dropp), spekulasjon utledet fra kode uten reproduksjon, spørsmål (→ PR-ens `## Alternativer (produktvalg)`), UX-nits i egen PR.
5. **Eneste unntak — maks ett per PR, alltid begrunnet i PR-body:** funnet krever DB-migrasjon, auth-/RLS-endring eller et produktvalg utenfor issuet, OG er reprodusert. Da `gh issue create` med lenke til PR-en, repro-steg og milestone (jf. «Milestone på alle nye issues»).
6. **Evaluatoren vurderer kontrakten og diffen, ikke naboområdet.** Subagent-prompter til evaluator/reviewer skal si det rett ut: «Funn utenfor diffen rapporteres som én linje hver under Observert; de teller ikke mot ACCEPT.» Kontraktens «Out of Scope» avgrenser bygget — den er ikke en liste som skal bli issues.
7. **Måles i closing-kommentaren:** fast linje `Nye issues: 0` under `## Teknisk` (eller `Nye issues: 1 — #N, unntak: <grunn>`). Batch-runder rapporterer opprettet mot lukket i sluttrapporten.

Arbeid brukeren bestiller uten issue er intake, ikke funn: der gjelder fortsatt `gh issue create` ved oppstart (bindings §T6 «Untracked work»).

#### Ingen ceremoni utenom selve PR-en

Ingen start-kommentar, ingen self-assign, ingen `in-progress`-label, ingen `gh issue develop`-call (PR-en gir auto-link til issue-en). Solo dev → minimer ceremoni.
