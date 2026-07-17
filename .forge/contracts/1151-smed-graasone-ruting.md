# Spec: Smedens gråsone-ruting — Discord A/B for enkle valg, kontrakt-økt for komplekse (#1151)

## Problem

Kontrakt-smeden (docs/loops/kontrakt-smeden.md, steg 2) hopper i dag over ALLE
gråsone-kandidater fail-closed. Riktig for en maskin som ikke skal gjette — men
det betyr at gråsoner dør i stillhet: #1151 og #1212 treffes av smeden hver natt
og droppes hver natt, uten at eieren noen gang får spørsmålet. «Spør, ikke anta»
må gjelde agenten selv: enkle binære valg skal til eieren som ett Discord-tapp,
komplekse skal bli et forberedt `/forge:contract`-oppdrag. I tillegg finnes
eier-svar-strengen i to varianter (trap #4 i issue-bodyen) — smeden skal LESE
svar, så én kanonisk streng er en forutsetning.

## Research Findings (in-repo ground truth, lest 2026-07-17)

- `lib/loops/discordActions.ts` er mønsteret: `parseCustomId` (regex per action)
  → `executeAction` (switch, mock-bar `GitHubClient`, ærlige feilmeldinger).
  Testene (`discordActions.test.ts`) har én describe per action med mock-gh.
- **`GitHubClient.rest` støtter kun `GET | POST | PUT`** (discordActions.ts:132).
  Å lukke et issue krever `PATCH /repos/{repo}/issues/{n}`; å fjerne en label
  krever `DELETE .../labels/{name}`. Method-unionen må utvides — `githubClient()`
  i route.ts sender method rett gjennom til fetch, så kun typen endres der.
- Kanonisk svar-streng emittes av answer-handleren i dag:
  `Eierbeslutning via Discord: **A**` (discordActions.ts:172).
  `docs/loops/morgenbriefen.md:17` bærer den foreldede varianten
  «Eierbeslutning tatt: A» — rettes.
- Labels `autonomy:needs-decision` / `autonomy:needs-contract-session` finnes
  IKKE ennå (verifisert med `gh label list`). `parked` finnes («Bevisst parkert
  bak en trigger — ikke bygg ennå») og gjenbrukes for snooze.
- custom_id ≤ 100 tegn (dokumentert i koden) — `drop_issue:<n>`/`snooze_issue:<n>`
  er trivielt innenfor.
- Commit-presedens for loop-infra: `feat(loops)` + minor-bump + `[no-changelog]`
  (9be5cbf7, #1207).

## Prior Decisions

- Kontrakter postes som issue-kommentar med «📋 Forge-kontrakt tilgjengelig»-header
  (docs/forge-workflow.md) — smeden, briefen og nattkjøreren detekterer på den.
- Smedens throttle (≥8 ventende kontrakter → skriv ingen) står urørt; rutede
  gråsoner er IKKE kontrakter og teller ikke der.
- Rebase-merge, aldri squash; alle commits `Refs #1151`.

## Design

To halvdeler: (A) app-kode for to nye Discord-knapper, (B) docs-endringer som
styrer routinene (smeden og briefen KJØRER docs-filene sine — docs er
implementasjonen av deres atferd).

### A. Nye Discord-actions (`lib/loops/discordActions.ts` + route + tester)

- `DiscordAction`-union: `+ { kind: 'drop_issue'; issue: number }`
  `+ { kind: 'snooze_issue'; issue: number }`.
- `parseCustomId`: `drop_issue:<n>` og `snooze_issue:<n>` (samme regex-stil).
- `GitHubClient.rest`-method-union utvides med `'PATCH' | 'DELETE'`;
  `githubClient()` i `app/api/discord/interactions/route.ts` trenger kun
  type-endringen (fetch tar method som den er).
- `executeAction`:
  - **`drop_issue`** (eierbeslutning: lukk som «not planned»):
    1. POST kommentar `Eierbeslutning via Discord: droppet 🗑` (audit-trail FØR
       tilstandsendring; feiler den → ærlig melding, IKKE lukk).
    2. PATCH issuet `{ state: 'closed', state_reason: 'not_planned' }`;
       feiler → ærlig melding som navngir at kommentaren står men lukkingen feilet.
    3. Kvittering: `🗑 #N er droppet — lukket som «not planned».`
  - **`snooze_issue`** (eierbeslutning: parked-label, manuell av-parkering):
    1. POST kommentar `Eierbeslutning via Discord: utsatt ⏸ — parkert til
       eieren fjerner parked-labelen.`
    2. POST label `parked`.
    3. DELETE labels `autonomy:needs-decision` og `autonomy:needs-contract-session`
       — **404 = OK** (labelen var der ikke; dobbel-tapp-idempotens).
    4. Kvittering: `⏸ #N er parkert — fjern parked-labelen når den blir aktuell igjen.`
- **Svar-streng-kontrakt (test-låst):** smedens deteksjons-regex er
  `^Eierbeslutning via Discord: \*\*(A|B)\*\*` — én test asserter at
  answer-kommentaren matcher og at droppet-/utsatt-kommentarene IKKE gjør det
  (ingen falsk A/B-parse av dropp/snooze).

### B. Docs som styrer routinene

**`docs/loops/kontrakt-smeden.md`:**
- Steg 1: nytt eksklusjonskrav «ikke `parked`».
- Steg 2 skrives om fra «hopp i v1» til ruting:
  - `epic`-labelede kandidater: fortsatt hopp — en epic er aldri én kontrakt.
  - **Nøyaktig 1 binært valg** → post kommentar med header
    `## 🅰️🅱️ Eierbeslutning trengs` (A og B forklart + anbefaling + hvorfor)
    + sett label `autonomy:needs-decision`.
  - **Flere valg / uklart omfang** → post kontrakt-forarbeid med header
    `## 🛠 Kontrakt-forarbeid (gråsone)` (scoped kontekst, filer, åpne
    spørsmål, anbefalt retning — IKKE spekulativ full kontrakt)
    + sett label `autonomy:needs-contract-session`.
  - **Re-run-semantikk:** kandidat med `autonomy:needs-decision` → let etter
    kommentar som matcher `^Eierbeslutning via Discord: \*\*(A|B)\*\*` postet
    ETTER spørsmålskommentaren. Funnet → fjern labelen, skriv kontrakt (steg 3)
    med valget som Key Decision. Ikke funnet → hopp (venter, ingen ny handling).
    Kandidat med `autonomy:needs-contract-session` → hopp (eierens trekk).
  - **Dedupe:** label til stede = allerede rutet; aldri re-post spørsmål.
  - **Cap:** ruting-handlinger teller mot 5-per-kjøring-capen. I tillegg: ≥5
    åpne issues med `autonomy:needs-*` → ingen ny ruting denne kjøringen
    (heartbeat «venter på eier: N ubesvarte»).
- Heartbeat-vokabular utvides med `rutet N til eier (#a …)`.

**`docs/loops/morgenbriefen.md`:**
- Rett «Eierbeslutning tatt: A» → «Eierbeslutning via Discord: **A**».
- «Trenger deg nå» løfter begge grupper (med eksisterende ferskhets-sjekk —
  besvart/droppet/snoozet → utelat linja):
  - `autonomy:needs-decision`: «Svar A/B på #N — <spørsmål>» med knapperad
    **A · B · 🗑 · ⏸** (`answer:<n>:A`, `answer:<n>:B`, `drop_issue:<n>`,
    `snooze_issue:<n>`).
  - `autonomy:needs-contract-session`: «🛠 #N trenger kontrakt-økt — kjør
    `/forge:contract` på #N» (kopier-lim-klar) med knapperad **🗑 · ⏸**.
- Discord-speiling-seksjonens custom_id-liste utvides med de to nye.

**Labels (ops i bygget, dokumentert i PR-body):** opprett
`autonomy:needs-decision` («Smeden trenger ett A/B-svar fra eieren (#1151)») og
`autonomy:needs-contract-session` («Gråsone — trenger interaktiv kontrakt-økt
(#1151)») i autonomy-fargefamilien.

## Edge Cases & Guardrails

- Dobbel-tapp 🗑: PATCH på allerede lukket issue er harmløst; duplikat-kommentar
  aksepteres (answer-knappen har samme egenskap i dag).
- Dobbel-tapp ⏸: POST `parked` er idempotent; DELETE på fraværende label gir
  404 som tolereres.
- Eier som skriver den kanoniske strengen manuelt på GitHub = likeverdig med
  knappen (smeden leser kommentarer, ikke opphav).
- Dropp-/snooze-kommentarene må ALDRI kunne parses som A/B-svar (test-låst,
  se over).
- `epic`-issues rutes aldri; #1110 er allerede hardt ekskludert i steg 1.
- Ingen nye env-variabler; GITHUB_LOOP_PAT (Issues RW) dekker PATCH/DELETE på
  issues og labels.

## Key Decisions

- Kanonisk svar-streng = knappens variant `Eierbeslutning via Discord: **A**`;
  briefens doc-eksempel rettes (eier, økt 2026-07-17).
- 🗑 = lukk som «not planned» med beslutnings-kommentar (eier 2026-07-17).
- ⏸ = `parked`-label, manuell av-parkering, ingen dato-logikk (eier 2026-07-17).
- 🗑/⏸ på BÅDE A/B-rader og kontrakt-økt-rader (eier 2026-07-17).
- Epics rutes aldri — hoppes som i dag (premiss fra smed-specen).

**Claude's Discretion:** eksakte kommentar-maler utover headerne/strengene over,
label-farger, testgranularitet, norsk ordlyd i Discord-kvitteringene (følg
eksisterende stil i executeAction).

## Success Criteria

- [ ] `npx vitest run lib/loops` grønn med nye tester: parseCustomId for begge
      nye id-er; drop_issue happy + kommentar-feil (ingen lukking) + lukke-feil;
      snooze_issue happy + 404-toleranse + parked-feil. Mock-assertions beviser
      PATCH bærer `state_reason: 'not_planned'` og at BEGGE needs-labels DELETEs.
- [ ] Svar-streng-kontrakten test-låst: answer matcher deteksjons-regexen,
      droppet/utsatt gjør det ikke.
- [ ] `grep -rn "Eierbeslutning tatt" docs/` → tomt.
- [ ] kontrakt-smeden.md: parked-eksklusjon i steg 1, begge ruting-grener med
      label-navn, re-run-regex, cap-integrasjon. morgenbriefen.md: begge
      knapperader med riktige custom_id-er. Samme to label-navn i begge filer.
- [ ] `gh label list --search autonomy` viser 5 labels (3 gamle + 2 nye).
- [ ] Gates grønne (under).

## Gates

- [ ] `npm run typecheck`
- [ ] `npx vitest run lib/loops`
- [ ] `npm run lint`
- [ ] `npm run build` (route.ts røres — full bygg per tsc-gate-fella)
- [ ] `bash tests/hooks/guard.test.sh`
- [ ] Versjon: `feat(loops)` → minor-bump + `[no-changelog]` (presedens 9be5cbf7)

## Files Likely Touched

- `lib/loops/discordActions.ts` — union, parse, to nye handlers, method-union
- `lib/loops/discordActions.test.ts` — nye describes + svar-streng-kontrakt
- `app/api/discord/interactions/route.ts` — kun method-union i githubClient-typen
- `docs/loops/kontrakt-smeden.md` — steg 1-eksklusjon + steg 2-omskriving + heartbeat
- `docs/loops/morgenbriefen.md` — kanonisk streng + to knapperader + custom_id-liste
- `package.json` / `package-lock.json` — minor-bump

## Out of Scope

- Surfaceren #1149 og øvrige brief-endringer.
- Tidsbasert snooze (avvist av eier — parked er manuell).
- Ruting av epics (#1040/#1073 forblir hoppet).
- Selve routine-promptene (uendret — de leser docs-filene).
- Kontrakten for #1212 (blir rutingens første kunde når smeden kjører).
