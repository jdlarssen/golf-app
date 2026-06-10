import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Stub next/navigation so components that call useRouter / usePathname /
// useSearchParams (e.g. SmartLink) don't throw "invariant: app router not
// mounted" during unit tests.
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    pathname: '/',
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

// Stub next-intl's locale hook so components render without a
// NextIntlClientProvider in unit tests. Default locale 'no' keeps rendered
// output identical to the pre-i18n snapshots/assertions (#475). Everything
// else (formatters, provider) stays real via importOriginal.
vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>();
  return {
    ...actual,
    useLocale: () => 'no',
  };
});
