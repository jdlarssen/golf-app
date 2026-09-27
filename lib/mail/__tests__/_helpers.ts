// Shared types for Resend-mock i Type B-tester (lib/mail/). Brukes av
// resend-contract.test.ts og er klart for migrasjon av de eksisterende
// per-modul-testene (separat follow-up, ikke denne PR-en).
//
// Selve vi.mock('resend', ...) MÅ ligge i forbruker-filen — Vitest hoister
// vi.mock-kall til toppen av modulen, før imports er løst. Det betyr at
// `sendMock` ikke kan eksporteres fra denne fila (vi.hoisted forbyr eksport,
// og en factory inni vi.hoisted-callback-en får ikke aksess til importer).
//
// Pattern per forbruker-fil:
//
//   import { vi } from 'vitest';
//   import type { SendArgs, SendResult } from './_helpers';
//
//   const { sendMock } = vi.hoisted(() => ({
//     sendMock: vi.fn<(...args: SendArgs) => Promise<SendResult>>(
//       async () => ({ data: { id: 'mock-id' }, error: null }),
//     ),
//   }));
//
//   vi.mock('resend', () => ({
//     Resend: class { emails = { send: sendMock }; },
//   }));

export type SendArgs = [
  {
    from: string;
    to: string;
    subject: string;
    html: string;
    text: string;
    headers?: Record<string, string>;
  },
];

// `name`, `statusCode` and `headers` mirror what the SDK returns on a failed
// call (resend 6.x `fetchRequest`). `lib/mail/send.ts` reads `error.name` and
// the `retry-after` header to decide whether a 429 is worth a second try.
export type SendResult = {
  data: { id: string } | null;
  error: { message: string; name?: string; statusCode?: number | null } | null;
  headers?: Record<string, string> | null;
};
