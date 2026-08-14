# Evaluering: #1437 — Team-attach-stien håndhever invitasjons-utløp

**Dato:** 2026-08-14
**Branch:** `claude/1437-team-attach-expiry` (HEAD 071f0860)
**Kontrakt:** `.forge/contracts/1437-team-attach-expiry.md`
**Evaluator:** fresh-context forge-evaluator

## Per kriterium

### S1 — Test i teamActions.test.ts, RED mot HEAD, suite grønn: PASS

- Ny test `#1437: invitasjons-oppslaget håndhever utløp (.gt på expires_at)`
  (`app/[locale]/signup/[shortId]/teamActions.test.ts:816`) driver
  `attachToCaptainTeam` gjennom full flyt og asserter via `__fromCalls` at et
  kall `{table: 'invitations', method: 'gt', args: ['expires_at', <parsebar ISO>]}`
  ble kjedet. Den validerer også at arg[1] er en gyldig timestamp
  (`Date.parse` ikke NaN) — ikke bare at metoden ble kalt.
- **RED-bevis mot origin/main:** `git show origin/main:...teamActions.ts | grep -c "\.gt("`
  = **0**. På main finnes ingen gt-kjeding, `find` returnerer `undefined`,
  `toBeDefined()` feiler. Testen kan heller ikke bli falskt grønn ved
  early-return: uten at invitations-oppslaget faktisk kjøres med `.gt`
  registreres ingen matchende `__fromCalls`-rad.
- Mock-endringen (`tests/serverActionMocks.ts:103`) er rent additiv: `'gt'`
  lagt til i den chainable-lista, ingen andre endringer i fila (1 linje i diff).
- Suite grønn: se S2.

### S2 — Gates: PASS

- `npx vitest run "app/[locale]/signup/[shortId]/"` (Node v22.23.0):
  **10 filer / 120 tester passed** — kjørt av evaluator i denne økten.
- `npx tsc --noEmit`: **exit 0** — kjørt av evaluator.
- `npm run build`: builder rapporterer exit 0 (ikke re-kjørt av evaluator —
  dev-server på :3131 kjører fra samme worktree; tsc + vitest dekker
  type-/testflatene uavhengig).

### S3 — Staging-flip-test med bevis-kommentar + label: PASS

- Bevis-kommentar på PR #1640 (forfatter jdlarssen) dokumenterer flip-designet
  presist: (1) rigget lag-spill `x1437tst` med kaptein + invitasjon til
  e2e-spiller med `expires_at` i FORTID → team-siden viser INGEN attach-tilbud,
  kun generisk «ikke et lag»-skjerm; (2) SQL-flip av KUN `expires_at` til
  fremtid; (3) samme side viser nå kaptein-tekst + «Bli med på lag»-knapp.
  Eneste variabel mellom fasene er utløpsfeltet → beviser at det er
  utløpsfilteret som gater, nøyaktig det kontraktens S3 krever.
- Prod-vakt: kommentaren attesterer 0 supabase-kall utenfor staging-ref
  `snwmueecmfqqdurxedxv`. Opprydding: hele riggen slettet.
- `staging-verified`-label satt på PR #1640 (verifisert via `gh pr view --json labels`).
- Begrensning: dette er en bevis-vurdering (kommentar + label), ikke en
  gjenkjøring av klikkrunden. Designet er sundt og selv-kontrollert
  (flip-metodikken isolerer variabelen). Base-sidens lag-peker (oppslag 3,
  page.tsx) er ikke eksplisitt nevnt i fase-beskrivelsene — men den bruker
  identisk filter-figur og dekkes av samme mekanisme; svakheten er kosmetisk.

### S4 — .changes-notat: PASS

- `.changes/1437-utlopt-lag-invitasjon.md`: frontmatter `type: fix`,
  `issue: 1437` — gyldig for fix (title/link/cta kreves kun for feat).
  Hele fila er 169 bytes; body én linje, langt under 400 tegn.
- Fail-closed-validering: `node scripts/weekly-release.mjs --dry-run`
  exit 0 med notatet listet blant ukas 37.

## D1/D2-etterlevelse

- **D1:** Alle TRE oppslag fikk eksakt samme figur
  `.gt('expires_at', new Date().toISOString())`:
  `teamActions.ts:948` (attach-oppslaget), `team/page.tsx:126`
  (invitasjonslista), `page.tsx:235` (hasPendingInvitation). Samme form som
  #1348-presedensen.
- **D2:** Accepted-semantikken urørt — attach-oppslaget filtrerer fortsatt
  KUN på `id` + utløp (ingen ny `accepted_at`-betingelse), de to
  side-oppslagene beholder sin eksisterende `.is('accepted_at', null)`.
  Ingen copy-endringer: diffen inneholder kun kode-kommentarer og
  changelog-notatet, null endrede UI-strenger.

## Scope

- Tracked diff (utenom `.forge/`): 6 filer, alle sporbare til #1437
  (3 produktfiler med kun gt-linje + kommentar, 1 test, 1 additiv
  mock-endring, 1 changes-notat). Ingen drive-by-endringer.
- `.staging-*.mjs`-filene er untracked (`git status` bekrefter) — ikke del
  av PR-en.

## Risikovurdering

- **Utløper mellom sidelast og klikk:** attach-oppslaget håndhever selv →
  `not_found` → generisk feilsti. Kontraktens edge-case-tabell sier eksplisitt
  at dette er intendert (samme valg som #1348: ingen egen utløpt-melding).
- **NULL-utløp:** `.gt` ville stille filtrert bort rader med
  `expires_at IS NULL` — men kolonnen er `timestamptz not null`
  (0001_initial_schema.sql:87), så klassen finnes ikke. Ingen legitim
  invitasjon kan falle ut.
- **`pickPendingInvitation` (#1343) med smalere liste:** ren funksjon over
  lista den får; tom liste nås aldri (guarden `invitations.length > 0` står
  foran). Nytt utfall: er KAPTEINENS invitasjon utløpt men arrangørens gyldig,
  faller pickeren tilbake til arrangør-raden → stopp-skjerm i stedet for
  attach-tilbud. Det er korrekt per issue-intensjonen — en utløpt
  kaptein-invitasjon skal ikke gi lag-kobling.
- **RLS/authz:** uendret — admin-client + call-site-eierskapssjekk som før,
  kun et ekstra WHERE-ledd.

## Konklusjon

Alle fire suksesskriterier verifisert med evidens i denne økten (S3 som
bevis-vurdering per oppdrag). Diffen er minimal, presis og sporbar; testen
er et ærlig RED-bevis gitt FIFO-mockens begrensninger; ingen legitim flyt
brytes.

VERDICT: ACCEPT
