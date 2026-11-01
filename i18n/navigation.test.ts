import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// #2746: et skjema du har sendt, er borte fra historikken. Type A.

const { intlRedirect } = vi.hoisted(() => ({ intlRedirect: vi.fn() }));

vi.unmock('@/i18n/navigation');
vi.mock('next-intl/navigation', () => ({
  createNavigation: () => ({
    Link: () => null,
    usePathname: () => '/',
    useRouter: () => ({}),
    getPathname: () => '/',
    redirect: intlRedirect,
  }),
}));

describe('redirect', () => {
  beforeEach(() => intlRedirect.mockClear());

  it('erstatter siden som standard', async () => {
    const { redirect } = await import('./navigation');
    redirect({ href: '/games/x', locale: 'no' });
    expect(intlRedirect).toHaveBeenCalledWith({ href: '/games/x', locale: 'no' }, 'replace');
  });

  it('`push` må sies med ord', async () => {
    const { redirect } = await import('./navigation');
    redirect({ href: '/games/x', locale: 'no' }, 'push');
    expect(intlRedirect).toHaveBeenCalledWith({ href: '/games/x', locale: 'no' }, 'push');
  });
});

/** Alle `.ts`/`.tsx` under `dir`, uten testene. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const USES_SERVER = /^\s*['"]use server['"]/m;
const NEXT_REDIRECT_IMPORT = /import\s*\{[^}]*\bredirect\b[^}]*\}\s*from\s*['"]next\/navigation['"]/;

describe('server-handlingene', () => {
  it('ingen henter `redirect` rett fra next/navigation, der den legger en ny side i historikken', () => {
    const offenders = ['app', 'components', 'lib'].flatMap(sourceFiles).filter((path) => {
      const source = readFileSync(path, 'utf8');
      return USES_SERVER.test(source) && NEXT_REDIRECT_IMPORT.test(source);
    });
    expect(offenders).toEqual([]);
  });
});
