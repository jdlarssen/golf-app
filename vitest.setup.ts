import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';
import { createTranslator } from 'use-intl/core';
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

// Stub @/i18n/navigation so components that import Link/useRouter/usePathname
// from the locale-aware wrapper don't fail in unit tests.
// GameWizard migrated to @/i18n/navigation in i18n phase 2b (#561).
vi.mock('@/i18n/navigation', async () => {
  const { createElement } = await import('react');
  return {
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
    // Link renders as a plain <a> element in tests.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Link: ({ href, children, ...rest }: { href: string; children: any; [k: string]: unknown }) =>
      createElement('a', { href, ...rest }, children),
    redirect: vi.fn(),
    getPathname: vi.fn(() => '/'),
  };
});

// Stub next-intl's locale hook and useTranslations so components render
// without a NextIntlClientProvider in unit tests. Default locale 'no' keeps
// rendered output identical to the pre-i18n snapshots/assertions (#475).
//
// Uses next-intl's real createTranslator (from use-intl/core) so ICU
// plurals/interpolation resolve correctly in component tests. Missing keys
// return the full dot-path (same fallback as the old hand-rolled resolver).
function makeTranslator(namespace: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createTranslator<any, any>({
    locale: 'no',
    messages: noMessages,
    namespace: namespace || undefined,
    onError: () => {
      // Suppress errors — missing keys fall back to the key path below.
    },
    getMessageFallback: ({ namespace: ns, key }) =>
      ns ? `${ns}.${key}` : key,
  });
}

vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>();
  return {
    ...actual,
    useLocale: () => 'no',
    useTranslations: (namespace: string = '') => makeTranslator(namespace),
  };
});

// Stub next-intl/server so async server components that call getTranslations /
// getLocale can be rendered in jsdom unit tests (no Next.js request context).
// Default locale 'no' keeps output byte-identical to pre-i18n assertions.
vi.mock('next-intl/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl/server')>();
  return {
    ...actual,
    getLocale: () => Promise.resolve('no'),
    getTranslations: (namespaceOrOptions: string | { namespace?: string } = '') => {
      const ns =
        typeof namespaceOrOptions === 'string'
          ? namespaceOrOptions
          : (namespaceOrOptions?.namespace ?? '');
      return Promise.resolve(makeTranslator(ns));
    },
  };
});
