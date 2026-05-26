import { vi } from 'vitest';

// Shared Resend-mock for Type B-tester i lib/mail/. Brukes av
// resend-contract.test.ts og kan over tid migrere inn i de eksisterende
// per-modul-testene som i dag kopier-limer samme oppsett (separat
// follow-up, ikke denne PR-en).

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

export type SendResult = {
  data: { id: string } | null;
  error: { message: string } | null;
};

/**
 * Returnerer `{ sendMock, install }`. `install()` registrerer
 * `vi.mock('resend', ...)` på modul-nivå i forbruker-filen FØR `beforeEach`.
 * `sendMock` er en `vi.fn` med default success-return; tester overrider
 * per-case via `sendMock.mockResolvedValueOnce(...)`.
 */
export function createResendMock() {
  const sendMock = vi.fn<(...args: SendArgs) => Promise<SendResult>>(
    async () => ({ data: { id: 'mock-id' }, error: null }),
  );

  function install() {
    vi.mock('resend', () => ({
      Resend: class {
        emails = { send: (...args: SendArgs) => sendMock(...args) };
      },
    }));
  }

  return { sendMock, install };
}
