import { beforeEach, describe, expect, it, vi } from 'vitest';
import { redirect as nextRedirect } from 'next/navigation';
import { redirect as serverRedirect } from './redirect';

// #2746: redirecten i server-handlingene med rå stier. Type A.

vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

// Den ekte returnerer `never`; mocken returnerer, og testen skal lese videre.
const redirect = serverRedirect as (url: string, type?: 'replace' | 'push') => void;

describe('redirect', () => {
  beforeEach(() => vi.mocked(nextRedirect).mockClear());

  it('erstatter siden som standard', () => {
    redirect('/games/x');
    expect(nextRedirect).toHaveBeenCalledWith('/games/x', 'replace');
  });

  it('`push` må sies med ord', () => {
    redirect('/games/x', 'push');
    expect(nextRedirect).toHaveBeenCalledWith('/games/x', 'push');
  });
});
