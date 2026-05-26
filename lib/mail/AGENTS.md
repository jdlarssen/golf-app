# lib/mail — test-disiplin (Type B)

Mail-modulene produserer Resend-payloads (`subject` + `html` + `text`). Tester her er **Type B — Rendered output**. Referanse: `docs/test-discipline.md`.

## Minimal form per fil

```ts
// Module-level Resend mock (capture send-payload uten å treffe nettverk)
const sendMock = vi.fn<(...args: SendArgs) => Promise<SendResult>>(
  async () => ({ data: { id: 'mock-id' }, error: null }),
);
vi.mock('resend', () => ({
  Resend: class { emails = { send: (...args: SendArgs) => sendMock(...args) }; },
}));

beforeEach(() => { vi.clearAllMocks(); process.env.RESEND_API_KEY = 'test-key'; });

async function send(params: <ModuleParams>) {
  const { sendXxx } = await import('./xxx');
  await sendXxx(params);
  return sendMock.mock.calls[0]![0];
}
```

Per case:

```ts
it('beskrivende test-navn', async () => {
  const payload = await send({ ...fixture });
  expect(payload.subject).toMatchInlineSnapshot();
  expect(payload.text).toMatchInlineSnapshot();
  expect(bodyLineHtml(payload.html)).toMatchInlineSnapshot();
});
```

Per fil: **én** full-HTML-chrome-lås for default-case. Ikke per case.

## Gjør

- Snapshot `subject` + `text` + en extracted body-region (`bodyLineHtml`/`mainBodyHtml`) per case
- Bygg en extractor som matcher på unik styling i template-en (eks. `margin:0 0 24px` for body-line-paragrafen)
- Behold strukturelle kontrakter (URL-encoding, RFC-headere, error-propagation) som eksplisitte assertions — én gang per fil hvis den er module-spesifikk, eller én delt fil hvis den gjelder hele mail-familien
- Bruk `npx vitest -u` for å populere snapshots, deretter re-run uten `-u` for å verifisere stable

## Gjør ikke

- Aldri snapshot HTML-chrome på hver case (chrome er identisk → bare støy i diff når den endres)
- Aldri kopier-lim Resend-mock-setup mellom filer — flytt til `__tests__/_helpers.ts` hvis du finner samme oppsett i 3+ filer
- Aldri legg til strukturelle Resend-kontrakt-tester per modul (to/from/call-count, error propagation) — de hører i ÉN delt fil per familie
- Aldri `toContain` på mer enn 3 substrings i samme test — bruk snapshot
- Aldri `not.toContain('substring')` for å verifisere fravær — snapshot på det området som inneholder substring viser fravær mer ekspressivt

## Referanse-implementasjon

`lib/mail/gameFinishedNotification.test.ts` (etter [PR #260](https://github.com/jdlarssen/golf-app/pull/260)). 24 tester, 48 snapshots, ÉN chrome-lås, 2 strukturelle assertions. Bruk denne som mønster — ikke kopier hele strukturen, men match disiplinen.

## Når du legger til ny mail-sender

1. Skriv source-modulen først (`lib/mail/xxx.ts`) — pure function som returnerer Resend-payload
2. Lag testfilen `lib/mail/xxx.test.ts` med minimal-formen over, **tomme** inline-snapshots
3. Kjør `npx vitest run lib/mail/xxx.test.ts -u` for å populere
4. Re-run uten `-u` for å verifisere
5. Spør hovedchat hvis du vurderer å legge til mer enn snapshot per case + én chrome-lås

## Når du endrer copy i eksisterende mail

1. Endre source-strengen i `lib/mail/xxx.ts`
2. Kjør `npx vitest run lib/mail/xxx.test.ts -u`
3. Review HVER snapshot-diff visuelt — sjekk om noe annet endret seg utilsiktet
4. Aldri legg til nye tester. Aldri.
