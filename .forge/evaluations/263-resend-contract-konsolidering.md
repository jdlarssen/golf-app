# Evaluering: Resend-kontrakt-konsolidering (issue #263, kategori 5)

**Verdikt:** ACCEPT
**Dato:** 2026-05-26
**Branch:** claude/musing-wu-f6f1ac
**Commits gjennomgått:** 9943a8a, a494737, 4e84e43, 608d17a

## Success-kriterier

- [x] `npx vitest run lib/mail/` grønn — `Test Files 9 passed (9) / Tests 78 passed (78)` (Duration 1.11s).
- [x] Alle 7 aktive sendere har contract-test i `lib/mail/__tests__/resend-contract.test.ts` — `grep -c "^    name:"` = 7. Verifisert ved manuell gjennomgang av fila L40–130: `sendGameFinishedNotification`, `sendInviteNotification`, `sendRegistrationApprovedMail`, `sendRegistrationRejectedMail`, `sendRegistrationRequestMail`, `sendTeamInvitationMail`, `sendProductUpdateDigest` — eksakt match med spec-tabellen.
- [x] De 2 strukturelle testene fjernet fra `gameFinishedNotification.test.ts` — `grep -n "kaster når Resend\|sender til mottakeren"` returnerer 0 treff. Diffen viser kun fjerning av L739–766-blokken og erstattes av 2-linjers kommentar som peker til konsolidert fil. Test-count for fila gikk fra 24 → 22 (commit 608d17a).
- [x] `lib/mail/__tests__/_helpers.ts` finnes, ≤ 50 LOC — `wc -l` = 39. Eksporterer `SendArgs` + `SendResult` types samt dokumentert vi.hoisted-pattern (se «Spec-compliance vs deviation» nedenfor for API-avvik).
- [x] `lib/mail/__tests__/resend-contract.test.ts` finnes — 148 LOC.
- [x] Ingen endring i `lib/mail/*.ts` source-filer — `git diff main..HEAD --stat -- lib/mail/` viser kun 3 endrede filer, alle test-filer (`__tests__/_helpers.ts` ny, `__tests__/resend-contract.test.ts` ny, `gameFinishedNotification.test.ts` -25 linjer).

## Gates

- [x] `npx vitest run lib/mail/` passerer — 78 tester grønne.
- [x] `npx tsc --noEmit` — ingen errors i lib/mail/ (grep mot output ga tom respons).
- [x] `git status` viser ingen utilsiktede endringer (clean working tree på branch).
- [x] Isolert kjøring `npx vitest run lib/mail/__tests__/resend-contract.test.ts` — 7 tests passed, 1 file passed.

## Spec-compliance vs deviation

**Kjent godkjent avvik:** Kontrakten foreslo `createResendMock()`-funksjon med `{ sendMock, install }`-API i `_helpers.ts`. Implementeringen valgte i stedet å eksportere kun typene (`SendArgs`, `SendResult`) og dokumentere vi.hoisted-pattern som kommentar — Vitest hoister `vi.mock` til toppen av modulen før import-statements løses, så `install()`-API-en ville ikke virket på runtime. Dette ble eksplisitt nevnt i evaluator-briefen som godkjent under Check Alignment og er dokumentert i commit-body på a494737. Helper-fila er fortsatt ≤ 50 LOC (39 LOC) og oppfyller kopier-lim-reduksjons-formålet for fremtidig migrasjon.

**Compliance med spec ellers:**

- Test-shape per rad (L132–148): asserter alle tre kriteriene (a) error-propagation (`/Resend send failed/`), (b) from-format (`'Tørny <noreply@tornygolf.no>'`), (c) call-count (`toHaveBeenCalledTimes(1)`) i samme test-body — eksakt som spec-en.
- Edge case-håndtering på plass: `sendMock.mockClear()` mellom (a) og (b) (L143), `delete process.env.RESEND_FROM_EMAIL` i beforeEach (L34), dynamic import inni `invoke()` per sender (L43–53 etc.).
- Bevart module-spesifikke tester verifisert:
  - `productUpdateDigest.test.ts` L319 (RFC 8058 List-Unsubscribe), L336 (URL-encoding av token), L352 (`'kaster ved Resend-error'`) — alle tre intakte.
  - `teamInvitation.test.ts` L164 (`URL-encoded next=/signup/[shortId]/team`) — intakt.
- Atomic commit-disiplin holdt: 4 commits, hver et logisk steg (helper → 2 senders → 7 senders → fjern duplikate). Alle med `Refs #263` per repo-konvensjon.
- Ingen endring i andre mail-test-filer (`git diff --stat` mot de øvrige 7 testfilene returnerte tom output).

## Funn

Ingen blockers. Et par observasjoner på NIT-nivå:

- **NIT:** `_helpers.ts` brukes kun til typer i denne PR-en. Spec-en åpnet eksplisitt for at den «er klart for migrasjon av eksisterende per-modul-tester (separat follow-up)» — den dokumenterte vi.hoisted-patternen i kommentaren leverer dette godt. Ingen handling kreves.
- **NIT:** Kommentaren på L14–16 i `resend-contract.test.ts` («Per-modul-testene beholder fortsatt sin egen Resend-mock for å snapshot-e copy/HTML — denne fila kompletterer dem») er presis og hjelpsom dokumentasjon for fremtidige lesere.
- **NIT:** Ingen pre-commit-warns trigget på endrede filer (kunne ikke verifiseres direkte uten å re-commitere, men commit-historikken viser at hooken slapp gjennom alle 4 commits uten `--no-verify`).

## Konklusjon

Implementeringen leverer eksakt det spec-en ber om: 7 sendere konsolidert i én parametrisert `it.each`-tabell, alle tre Resend-kontrakter (error-propagation, from-format, call-count) verifisert per sender, 2 duplikate tester fjernet fra `gameFinishedNotification.test.ts`, source-filer urørt, og module-spesifikke tester (productUpdateDigest RFC 8058 + URL-encoding + kaster-ved-error, teamInvitation URL-encoding) bevart. Det dokumenterte API-avviket i `_helpers.ts` er Vitest-idiomatisk korrekt og ble pre-godkjent. Verdikt: **ACCEPT**.
