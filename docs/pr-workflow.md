# PR-arbeidsflyt

> Flyttet ordrett fra CLAUDE.md (#2100). Leses når du åpner, presenterer eller merger en PR (`docs/agent-discipline/core.md` T10).

#### Branch + PR-flyt (default post-v1.0)

Alt arbeid via PR — **aldri direkte push til `main`**. Hooks håndhever dette: `.githooks/pre-push` blokkerer push til main; `.claude/hooks/bash-guard.sh` blokkerer `--no-verify` og `gh pr merge --squash`, og spør om lov før `git push --force` (`--force-with-lease` slipper gjennom); `.githooks/commit-msg` krever `Refs #N` i body.

1. Jobb på worktree-branchen (eller en beskrivende ny branch fra `main`).
2. Atomiske commits, alle med `Refs #N` i body. Subagent-prompter må inkludere issue-nr + Refs-instruks.
3. Push + PR:
   ```bash
   git push origin <branch>
   gh pr create --base main --title "<tittel>" --body "Closes #N

   <tagline fra CHANGELOG>"
   ```
   `Closes #N` i PR-body er den autoritative auto-close-triggeren.

   **Draft-først (#1516):** fortsetter økta å pushe etter PR-opprettelse (forge-bokføring
   o.l.), opprettes PR-en som draft (`gh pr create --draft`); `gh pr ready` er øktas
   siste handling etter at all bokføring er pushet og `ls-remote` bekrefter remote =
   lokal HEAD. Kortet noop-er drafts. Detaljer: `docs/forge-workflow.md`.

   **PR-presentasjon (fast form, alle aktører — eierbestilling 2026-07-30, #1413).**
   Dette er formens ene hjem; loop-dokumentene (kontrakt-smeden, nattkjøreren)
   peker hit.
   - **Alle feat/fix/perf-PR-er** har en kort «Fordeler/ulemper»-blokk i body eller
     første kommentar: 2–3 fordeler og 2–3 ulemper ved valgt løsning, i eierens
     produktspråk — også når det bare finnes ett fornuftig alternativ.
     docs/chore/refactor/test-PR-er: kun når det fantes et reelt valg.
   - **Finnes reelle alternativer** (produktvalg per definisjonen i steg 5): full
     seksjon `## Alternativer (produktvalg)`:
     1. **Anbefaling** øverst: én setning — hvilket alternativ og hvorfor.
     2. **Per alternativ (A, B, evt. C):** 2–3 fordeler og 2–3 ulemper som
        punktliste — også for bygget A; eieren skal kunne veie, ikke bare godta.
     3. **Ombyggingskostnad** per ikke-valgt alternativ: liten/middels/stor + én
        frase (f.eks. «liten — samme data, annen visning»).
     4. **Reversibilitet:** kan valget snus senere uten datatap, eller er det
        vanskelig å angre?
     Avslutt med svar-instruksen («svar 'alternativ B' her, så bygges det om på
     samme branch») og «ingen hast — PR-en venter til du svarer eller merger».
4. Bruker-synlige endringer: verifiser berørt flyt på `torny-staging` FØR merge (se «Testing — staging, aldri prod»).
5. Merge — **auto-merge-policyen** (eierbeslutning 2026-07-28, #1406): når portene er
   grønne (CI + steg 4-staging-verifisering der den kreves) og PR-en ikke inneholder noe
   produktvalg, merger økten selv med `gh pr merge --rebase --delete-branch` — ikke vent
   på eieren. (Squash brukes ikke — mister granulær audit-trail; remote-økter uten `gh`
   bruker GitHub-MCP-merge med `merge_method: rebase`.)
   - **Produktvalg** = to fornuftige løsninger finnes OG forskjellen merkes av
     eier/spillere i bruk (UX, tekst, oppførsel). Da venter PR-en: Alternativ A er bygget
     og testbart på staging; B/C beskrives med fordeler/ulemper på norsk (i PR/Discord);
     velger eieren noe annet enn A, bygges det om på samme branch før merge. Rene
     tekniske valg (implementasjonsdetaljer) er aldri et produktvalg — de avgjøres i
     økten og eskaleres ikke.
   - **Aldri auto-merge:** prod-DB-migrasjoner (prod-brannmuren #1074 står), destruktive
     flyter (sletting av data/kontoer), auth-/sikkerhetsendringer, noe som koster penger,
     endringer i selve merge-porten (`lib/loops/`, `scripts/loops/` — #1655) og hele
     native-appen (`native/app/**` — #1944; appens egne auth-flater matchet ingen
     web-rad, så PR #1943 ble auto-merget forbi eieren). Disse venter alltid på
     eksplisitt eier-godkjenning.
   - Eieren orienteres i etterkant i produktspråk (aldri teknisk, jf. #1302): morgen-
     briefens «Skjedde i natt» + CHANGELOG. Ingen egen merge-melding kreves.
   - Discord-PR-kortet (docs/loops/discord-pr-kort.md) håndhever samme policy på
     loop-siden (#1406): grønne PR-er uten produktvalg auto-merges av kortet selv,
     resten beholder merge-knappen. Maskin-markøren kortet leser for «produktvalg»:
     **økter som presenterer et produktvalg MÅ ha en markdown-heading som enten
     inneholder ordet «produktvalg» (`## Produktvalg`, `## Alternativer
     (produktvalg)`) eller starter med `## Alternativ A`–`E`** — uten den leser
     kortet PR-en som valgfri og merger den. **PR-body-en er den foreskrevne
     plassen**; kortet leser i tillegg PR-ens kommentarer, så en alternativ-seksjon
     som (også) står i en kommentar stopper auto-mergen (#1656). Prosa uten heading
     teller ikke. (#1623: markøren krevde tidligere at «produktvalg» sto FØRST i
     headingen, mens malen over foreskrev «Alternativer (produktvalg)» — de to
     motsa hverandre, og et ekte produktvalg ble auto-merget forbi eieren. #1656:
     doccene tillot kommentar-plassering mens porten kun leste body-en — samme
     utfall, annen vei inn.)
