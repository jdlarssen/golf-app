import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';
import noMessages from './messages/no.json';

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

// Stub next-intl's locale hook and useTranslations so components render
// without a NextIntlClientProvider in unit tests. Default locale 'no' keeps
// rendered output identical to the pre-i18n snapshots/assertions (#475).
// useTranslations resolves keys against messages/no.json so component tests
// keep asserting the real Norwegian copy.
function resolveKey(catalog: Record<string, unknown>, dotPath: string): string {
  const parts = dotPath.split('.');
  let node: unknown = catalog;
  for (const part of parts) {
    if (node == null || typeof node !== 'object') return dotPath;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : dotPath;
}

function makeTranslator(namespace: string) {
  return function t(key: string): string {
    return resolveKey(
      noMessages as Record<string, unknown>,
      namespace ? `${namespace}.${key}` : key,
    );
  };
}

vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>();
  return {
    ...actual,
    useLocale: () => 'no',
    useTranslations: (namespace: string = '') => makeTranslator(namespace),
  };
});
