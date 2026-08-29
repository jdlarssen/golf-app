# Spec: #1786 — merge_pr: rollback av draft-flippen når mergen feiler

Eierbestilling 2026-08-29 («fiks #1786 også»). `lib/loops/` = aldri-auto-merge-lista →
**leveres som draft-PR som venter på eksplisitt eier-merge** (samme form som PR #1787).
Branch: `claude/mange-issues-a70214` (rebaset == origin/main `06e6ed73`).

## Problem

`handleMergePr` (`lib/loops/discordActions.ts:276`, etter #1782-dekomponeringen):
1. **Rollback-mangelen (#1786):** en draft-PR flippes ready via GraphQL FØR merge-PUT-en;
   feiler mergen (konflikt, 405, GitHub-feil) finnes ingen kompenserende handling —
   PR-en står igjen som ready uten at noen valgte det. Med #1769-sweepen i drift er
   ready-tilstanden mer betydningsfull enn før.
2. **Søster-glipp i samme linjer (verifisert på HEAD :299–304):** flip-guarden sjekker
   kun `ready.status !== 200` — GraphQL svarer 200 MED `errors`-felt ved mutasjonsfeil
   (`sweep-natt-drafts.ts` håndterer nettopp dette; her mangler det). En feilet flip
   kan dermed passere guarden og gå videre til merge.

## Design

I `handleMergePr`, kun flip/merge-stien:

- Husk `flippedFromDraft`. Flip-guarden utvides til også å behandle 200-med-errors som
  feil (samme mønster som `sweep-natt-drafts.ts`): feil → samme retur som i dag
  («Fikk ikke tatt PR … ut av draft … — ikke merget»), ingen merge-forsøk.
- Feiler merge-PUT-en OG `flippedFromDraft`: best-effort kompenserende GraphQL
  `convertPullRequestToDraft(input: { pullRequestId })` (samme id). Discord-svaret
  utvides: lyktes kompensasjonen → «… PR-en er lagt tilbake som draft.»; feilet den →
  «… ⚠️ PR-en står igjen som ready — legg den tilbake som draft manuelt om ønsket.»
  Kompensasjonsfeil kaster ALDRI (best-effort).
- Ikke-draft-stien er uendret: samme feilmelding som i dag, ingen GraphQL-kall.
- Happy path uendret. Ingen andre helpers røres.

## Edge Cases & Guardrails

- Kompensasjonen vurderes som lykkes kun ved 200 UTEN errors (samme dobbeltsjekk).
- Ny norsk Discord-copy: kort, i samme stemme som eksisterende svar (humanizer-hensyn).
- Ingen endring i CI-gate-grenene (:285–296) eller andre custom_id-familier.

## Success Criteria

- [x] U1: Nye tester i `discordActions.test.ts` (APPEND — eksisterende tester urørte;
      må en eksisterende test for draft+merge-feil-komboen justeres, flagg det):
      (a) draft + grønn gate + merge-feil → `convertPullRequestToDraft` kalt med
      PR-ens node_id og svaret inneholder «lagt tilbake som draft»; (b) samme men
      kompensasjonen feiler (non-200 ELLER 200-med-errors) → ⚠️-svaret, ingen throw;
      (c) ikke-draft + merge-feil → INGEN convert-kall, svar som før; (d) flip svarer
      200-med-errors → behandles som feilet flip, ingen merge-PUT.
      EVIDENS: commit ee58eafa; testfil append-only (99/0 numstat); TDD-bevis 5 røde
      før implementasjon; evaluator kjørte den nye blokka mot GAMMEL kode: 5/7 røde,
      de to grønne er regresjonslåsene. (c) bevist med toBe + kall-sekvens
      ['GET','GET','PUT'].
- [x] U2: `npx vitest run lib/loops app/api/discord` grønn; `npx tsc --noEmit` grønn;
      `npx eslint lib/loops scripts/loops` null problemer (ingen funksjon > 25).
      EVIDENS: 288/288 exit 0, tsc exit 0, eslint null problemer (også etter
      nit-herding 2a41cbdd — « — »-skjøt i rollback-svaret); handleMergePr 13→14.
      Evaluator: ACCEPT, null MUST-FIX (alle adversarielle sjekker negative;
      try/catch svelger IKKE merge-PUT-feil — PUT-en awaites utenfor try).
- [x] U3: `npm run build` + full `npx vitest run` grønne (hovedchat).
      EVIDENS: build exit 0; full vitest 513 filer/6919 tester exit 0 (HEAD ee58eafa;
      2a41cbdd re-gatet skopert: 288/288 + tsc + eslint grønne).
- [ ] U4: Draft-PR med grønn CI, eier-melding i body; IKKE merget av økta (eierens
      «merge»-svar er porten).

## Files Likely Touched

- `lib/loops/discordActions.ts` (kun handleMergePr) + `lib/loops/discordActions.test.ts`
  (append)

## Out of Scope

- publish_lansering-månedstelleren (notert i #1782-closing, kosmetisk).
- classifyAutoMerge-aldri-liste-gapet (#1655 — annen økt).
