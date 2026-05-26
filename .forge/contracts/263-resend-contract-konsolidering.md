# Spec: Resend-kontrakt-konsolidering (issue #263, kategori 5)

## Problem

`lib/mail/`-suiten har strukturelle Resend-kontrakt-tester (error-propagation, from-format, call-count) som hører hjemme i ÉN delt fil per Type B-disiplinen i `docs/test-discipline.md`. I dag finnes disse kun i `gameFinishedNotification.test.ts` (kanonisk referanse fra PR #260), mens de øvrige 6 mail-sender-testene ikke verifiserer Resend-kontrakten i det hele tatt — en regresjon-risiko som ikke fanges hvis en sender glemmer error-håndtering.

PR #261 forsøkte å lukke dette ved å duplisere kontrakt-testene per fil, men det ble reversert som AI Slop-anti-mønster. Denne PR-en gjør det riktig: én parametrisert tabell i `lib/mail/__tests__/resend-contract.test.ts` som dekker alle aktive sendere.

Kun kategori 5 fra #263 er i scope. Kategori 1–4 og 6 (leaderboard, admin-form, toContain-sweep, E2E-sweep) er IKKE i scope og må flagges som follow-up hvis noe oppdages.

## Prior Decisions

- **PR #260** (kanonisk Type B-referanse) — `gameFinishedNotification.test.ts` etablerte approval-snapshot-stilen med ÉN chrome-lås per template. Resend-kontrakt-tester (`'kaster når Resend returnerer feil'` + `'sender til mottakeren med korrekt avsender + ett kall per call'`) ligger der i dag som referanse-implementasjon. Disse flyttes til delt fil i denne PR-en.
- **PR #261** — duplisert kontrakt på tvers av 6 filer = AI Slop. Lærdom: strukturelle kontrakter hører i ÉN delt fil per familie, aldri per modul.
- **`docs/test-discipline.md` § Type B** — eksplisitt: «Strukturelle kontrakter … hører hjemme i ÉN delt fil per familie, aldri duplisert per modul. Eksempel-mønster: `lib/mail/__tests__/resend-contract.test.ts` med parametrisert tabell over alle sendere.»
- **`lib/mail/AGENTS.md` § Gjør ikke** — «Aldri legg til strukturelle Resend-kontrakt-tester per modul … de hører i ÉN delt fil per familie».

## Design

### Filer som opprettes

**`lib/mail/__tests__/_helpers.ts`** (~30 LOC, ny):

```ts
import { vi } from 'vitest';

export type SendArgs = [
  { from: string; to: string; subject: string; html: string; text: string;
    headers?: Record<string, string> },
];
export type SendResult = {
  data: { id: string } | null;
  error: { message: string } | null;
};

// Returnerer { sendMock, install }. `install()` registrerer vi.mock('resend', ...)
// på modul-nivå i forbruker-filen FØR beforeEach. sendMock er en vi.fn med
// default success-return; tester overrider per-case via sendMock.mockResolvedValueOnce.
export function createResendMock() {
  const sendMock = vi.fn<(...args: SendArgs) => Promise<SendResult>>(
    async () => ({ data: { id: 'mock-id' }, error: null }),
  );

  function install() {
    vi.mock('resend', () => ({
      Resend: class { emails = { send: (...args: SendArgs) => sendMock(...args) }; },
    }));
  }

  return { sendMock, install };
}
```

Brukes KUN i `resend-contract.test.ts` i denne PR-en. Eksisterende mail-test-filer migreres IKKE — det er separat follow-up-arbeid.

**`lib/mail/__tests__/resend-contract.test.ts`** (ny):

Parametrisert tabell over 7 aktive sendere. Per sender én `it.each`-rad som verifiserer tre ting i samme test-body:

1. **Error-propagation** — når Resend returnerer `{ data: null, error: { message: 'rate-limited' } }`, skal sender kaste med `/Resend send failed/` i meldingen.
2. **From-format** — `payload.from === 'Tørny <noreply@tornygolf.no>'` (default når `RESEND_FROM_EMAIL` ikke er satt).
3. **Call-count** — `sendMock` kalles eksakt 1 gang per invocation.

Tabell-rader (sender-navn + fixture-payload + invoker-funksjon):

| Sender                          | Import                                       | Fixture-shape                          |
|---------------------------------|----------------------------------------------|----------------------------------------|
| `sendGameFinishedNotification`  | `./gameFinishedNotification`                 | `GameFinishedNotificationParams`       |
| `sendInviteNotification`        | `./inviteNotification`                       | `InviteNotificationParams`             |
| `sendRegistrationApprovedMail`  | `./registrationApproved`                     | `RegistrationApprovedParams`           |
| `sendRegistrationRejectedMail`  | `./registrationRejected`                     | `RegistrationRejectedParams`           |
| `sendRegistrationRequestMail`   | `./registrationRequest`                      | `RegistrationRequestParams`            |
| `sendTeamInvitationMail`        | `./teamInvitation`                           | `TeamInvitationMailParams`             |
| `sendProductUpdateDigest`       | `./productUpdateDigest`                      | `ProductUpdateDigestParams`            |

Hver rad har en minimal-fixture som er gyldig payload for den senderen (kopiér fra eksisterende `*.test.ts`-filers `baseParams`/`base`-objekter — IKKE finn på nye verdier).

### Filer som endres

**`lib/mail/gameFinishedNotification.test.ts`** — fjern de to siste `it`-ene:

- L747–758: `it('kaster når Resend returnerer feil', ...)`
- L760–766: `it('sender til mottakeren med korrekt avsender + ett kall per call', ...)`

Pluss kommentar-headeren på L742–745 («Strukturelle tester …») kan fjernes siden den introduserer en seksjon som nå er tom.

Resterende 22 tester (alle approval-snapshots + chrome-lås) beholdes uendret.

### Filer som IKKE endres

- `lib/mail/teamInvitation.test.ts` — URL-encoding-testen på L164–173 er module-spesifikk (kontrakt mot login-flyt), bevares. Kommentaren på L175–177 oppdateres ikke (peker fortsatt korrekt på issue #263, og PR-en realiserer det den lover).
- `lib/mail/productUpdateDigest.test.ts` — RFC 8058-headere (L319–334) + unsub-token-encoding (L336–350) er module-spesifikke. `'kaster ved Resend-error'` (L352–367) er pre-eksisterende fra før PR #261 og bevares per user-brief (selv om kontrakt-filen formelt sett dekker det også, holder vi historisk integritet).
- Øvrige test-filer (`inviteNotification`, `registrationApproved`, `registrationRejected`, `registrationRequest`, `gameFinishedRecipients`) — uendret. De har ingen duplikate strukturelle tester per dags dato.

### Test-shape per rad (referanse)

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createResendMock } from './_helpers';

const { sendMock, install } = createResendMock();
install();

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RESEND_API_KEY = 'test-key';
  delete process.env.RESEND_FROM_EMAIL;
});

const senders = [
  {
    name: 'sendGameFinishedNotification',
    invoke: async () => {
      const { sendGameFinishedNotification } = await import('../gameFinishedNotification');
      return sendGameFinishedNotification({ /* minimal valid fixture */ });
    },
  },
  // ... 6 til
] as const;

describe('Resend-kontrakt — alle aktive mail-sendere', () => {
  it.each(senders)('$name overholder Resend-kontrakten', async ({ invoke }) => {
    // (a) Error-propagation
    sendMock.mockResolvedValueOnce({
      data: null, error: { message: 'rate-limited' },
    });
    await expect(invoke()).rejects.toThrow(/Resend send failed/);

    // (b) From-format + (c) call-count = 1 — i en fresh invocation
    sendMock.mockClear();
    await invoke();
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0]![0].from).toBe('Tørny <noreply@tornygolf.no>');
  });
});
```

(Skjelett — IKKE endelig kode. Builder-subagenten finrengjør syntax og fikstur-detaljer under Check Alignment.)

## Edge Cases & Guardrails

- **RESEND_FROM_EMAIL-env** — `delete process.env.RESEND_FROM_EMAIL` i beforeEach for å sikre default `Tørny <noreply@tornygolf.no>`. Hvis env-variabelen er satt i CI uten reset, kan testen feile uventet.
- **Dynamic import inni invoke()** — `await import('../gameFinishedNotification')` skjer per call. Hvis vi cacher modulen utenfor `invoke()`, kan `vi.mock('resend')` ikke ha tatt effekt enda. Hold importen inni for å være safe.
- **`sendMock.mockClear()` mellom (a) og (b)** — error-pathen i (a) kaller `sendMock` 1 gang før den kaster. Hvis vi ikke klarer mocken, vil (c) `toHaveBeenCalledTimes(1)` feile fordi count blir 2.
- **Ikke endre source-koden** — hvis en sender mangler `throw new Error(...)`-pattern (alle 7 har det per nå), STOPP og flagg follow-up. Kontrakt-testen forutsetter den eksisterende pattern.
- **3 ikke-testede sendere finnes** — `cupFinishedNotification.ts`, `cupStartedNotification.ts`, `scorecardSubmittedNotification.ts` har source men ingen test-fil. Disse er IKKE med i kontrakt-tabellen per user-brief (kun aktive sendere med eksisterende test-infrastruktur). Flagges som follow-up under «Out of Scope».

## Key Decisions

- **Granularitet:** 7 tester (én `it.each(senders)`-rad per sender, alle tre asserts i samme body). Net +5 mot baseline 73 → 78 tester totalt. Begrunnelse: sender-spesifikk feilrapportering. Vitest viser hvilken sender som feilet uten å parse assertion-output. Alternativene (1 sammenslått test eller 30 splittede) byttet enten reporting-fidelity eller signal-renhet bort. Konsistent med Type B-disiplinen, ikke et brudd på den.
- **Aktive sendere = 7** (per user-brief): gameFinishedNotification, inviteNotification, registrationApproved, registrationRejected, registrationRequest, teamInvitation, productUpdateDigest. De 3 ekskluderte (cup×2 + scorecardSubmitted) mangler test-infrastruktur og er separat audit-arbeid.
- **`_helpers.ts` opprettes nå, men brukes kun av `resend-contract.test.ts`** i denne PR-en. Eksisterende 6 mail-test-filer migrerer IKKE — separat follow-up. Helper ≤ 30 LOC. Større API = signal om over-design.
- **`productUpdateDigest`-testene som overlapper** (RFC 8058, unsub-encoding, `'kaster ved Resend-error'`) bevares i sin opprinnelige fil per user-brief. Aksepter teknisk overlapp i error-propagation til fordel for historisk integritet.
- **Net +5 test-count accepted** — «hver ny test må forsvares mot scope», ikke «count må holde seg flat». 7 contract-tester for 7 sendere er minimal uttrykksform.

**Claude's Discretion:**

- Eksakt minimal-fixture per sender — kopiér fra eksisterende `baseParams`/`base`-objekter i hver senders test-fil. Ikke finn på nye verdier.
- Beskrivelses-templatet i `it.each(...)` — `$name overholder Resend-kontrakten` eller tilsvarende. Norsk, ett-linjes, ikke poetisk.
- Plassering av seksjon-kommentarer — minimal struktur, ikke chrome.

## Success Criteria

- [ ] `npx vitest run lib/mail/` grønn (verifisert via terminal-output)
- [ ] Alle 7 aktive sendere har contract-test i `lib/mail/__tests__/resend-contract.test.ts` (verifiseres ved å grep `it.each` table-content mot listen i denne spec-en)
- [ ] De 2 strukturelle testene fjernet fra `lib/mail/gameFinishedNotification.test.ts` (L747–766) — verifisert ved `grep -n "kaster når Resend\|sender til mottakeren" lib/mail/gameFinishedNotification.test.ts` returnerer 0 treff
- [ ] `lib/mail/__tests__/_helpers.ts` finnes, eksporterer `createResendMock()`, er ≤ 50 LOC inkl. kommentarer
- [ ] `lib/mail/__tests__/resend-contract.test.ts` finnes
- [ ] Pre-commit-hooken trigger ikke nye warns på endrede filer (verifisert ved test-commit i worktree)
- [ ] Ingen endring i `lib/mail/*.ts` source-filer (verifisert ved `git diff --stat lib/mail/*.ts` etter alle commits)

## Gates

Etter hver atomic commit:

- [ ] `npx vitest run lib/mail/` passerer
- [ ] `npx tsc --noEmit` passerer (TS-kompilering)
- [ ] `git status` viser ingen utilsiktede endringer i source-filer

Sluttgate før PR:

- [ ] Hele `npx vitest run` (full suite) grønn — ikke bare lib/mail/
- [ ] `npm run lint` passerer (hvis konfigurert i prosjektet)

## Files Likely Touched

- `lib/mail/__tests__/_helpers.ts` — NY (~30 LOC)
- `lib/mail/__tests__/resend-contract.test.ts` — NY (~80 LOC inkl. tabell)
- `lib/mail/gameFinishedNotification.test.ts` — fjern 2 `it`-block + 1 seksjon-kommentar (~25 linjer fjernet)

## Out of Scope

- **Kategori 1–4 og 6 fra #263** (leaderboard Type C-sweep, admin-form A/C/D-split, `toContain`-sweep, E2E `getByText`-sweep) — IKKE rør. Hvis noe oppdages underveis, opprett separat issue og legg til som follow-up i PR-body.
- **Migrasjon av eksisterende 6 mail-test-filer til `_helpers.ts`** — separat follow-up. Helper-fil opprettes for kun den nye kontrakt-testen i denne PR-en.
- **`cupFinishedNotification.ts`, `cupStartedNotification.ts`, `scorecardSubmittedNotification.ts`** — mangler test-infrastruktur helt. Ikke med i kontrakt-tabellen. **Forslag til ny issue:** «Audit: cup + scorecardSubmitted-sendere mangler test-dekning» — vurder om disse trenger snapshot-tester + om de skal med i kontrakt-tabellen.
- **Endringer i `lib/mail/*.ts` source-filer** — hvis konsolideringen avdekker at en sender bør endre error-håndtering, STOPP og flagg follow-up. Denne PR-en er kun test-refactor.
- **Migrasjon av `productUpdateDigest`'s `'kaster ved Resend-error'`-test** — bevares i sin opprinnelige fil per user-brief, selv om kontrakt-filen formelt sett dekker den.

## Disiplin-anker (for builder-subagent)

- **Check Alignment før batch:** vis skjelett (parametriseringstabell + struktur, INGEN endelig implementasjon) på `resend-contract.test.ts` først. Vent på eksplisitt go-ahead fra hovedchat før utvidelse.
- **Refinement Loop:** start med 2 sendere i tabellen, verifiser at mønsteret kjører grønt, deretter ekspander til alle 7. Ikke last opp full struktur på første pass.
- **Happy to Delete:** foreslå sletting framfor konvertering hvis du oppdager redundans underveis. Krever go-ahead.
- **Atomic commits:** ett logisk steg per commit. Forslag til sekvens:
  1. `test(mail): add createResendMock helper for shared Resend contract testing`
  2. `test(mail): consolidate Resend contract tests into parametrized table`
  3. `test(mail): remove duplicated structural tests from gameFinishedNotification`
- **Scope-utvidelse må flagges** — hvis du finner deg selv i å legge til tester utenfor de tre punktene (a)/(b)/(c), STOPP og spør hovedchat.
- **Subagent-modell:** sonnet (mekanisk arbeid med detaljert spec).
