import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeRedirectMock,
  RedirectError,
  type QueryResult,
} from '@/tests/serverActionMocks';

/**
 * Unit tests for createCourse — #366 (vanlige brukere oppretter baner).
 *
 * Fokus på det #366 endrer:
 * - Gate åpnet til ENHVER innlogget bruker (uinnlogget → /login).
 * - Writes via request-scoped klient (ingen getAdminClient-bypass) — RLS
 *   håndhever created_by = auth.uid(). Beviset er at action-en ikke en gang
 *   importerer admin-klienten lenger; en regular user insert lykkes på den
 *   vanlige mock-en.
 * - created_by settes til den innloggede brukeren.
 * - redirect_base / success_redirect respekteres OG saniteres (open-redirect).
 */

const redirectMock = makeRedirectMock();
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}));

let supabaseMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => supabaseMock,
}));

const regularUserId = 'd7aa1db4-3ce0-4a2e-8375-c02a88076363';

function setAuth(user: { id: string } | null) {
  supabaseMock.auth.getUser = vi.fn(async () => ({
    data: { user },
  })) as unknown as typeof supabaseMock.auth.getUser;
}

/** Three queue entries: course-insert (single), holes-insert, tees-insert. */
function happyQueue(): QueryResult[] {
  return [
    { data: { id: 'course-1' }, error: null },
    { error: null },
    { error: null },
  ];
}

/** Build a complete, valid course FormData (18 holes + one rated tee). */
function validCourseFormData(
  extra: Record<string, string> = {},
): FormData {
  const fd = new FormData();
  fd.set('name', 'Testbanen');
  for (let i = 1; i <= 18; i++) {
    fd.set(`hole_${i}_par_mens`, '4');
    fd.set(`hole_${i}_si`, String(i));
  }
  fd.set('tee_0_name', 'Gul');
  fd.set('tee_0_slope_mens', '120');
  fd.set('tee_0_cr_mens', '70.0');
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return fd;
}

function lastRedirect(): string | undefined {
  return redirectMock.mock.calls.at(-1)?.[0];
}

function coursesInsertArgs(): Record<string, unknown> | undefined {
  const call = supabaseMock.__fromCalls.find(
    (c) => c.table === 'courses' && c.method === 'insert',
  );
  return call?.args[0] as Record<string, unknown> | undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createCourse — #366 gate + RLS-write', () => {
  it('redirects to /login when not authenticated', async () => {
    supabaseMock = buildSupabaseMock([]);
    setAuth(null);
    const { createCourse } = await import('./actions');

    await expect(createCourse(validCourseFormData())).rejects.toThrow(
      RedirectError,
    );
    expect(lastRedirect()).toBe('/login');
    // No write attempted.
    expect(
      supabaseMock.__fromCalls.some((c) => c.method === 'insert'),
    ).toBe(false);
  });

  it('lets a regular (non-admin) user create a course via the request-scoped client', async () => {
    supabaseMock = buildSupabaseMock(happyQueue());
    setAuth({ id: regularUserId });
    const { createCourse } = await import('./actions');

    await expect(createCourse(validCourseFormData())).rejects.toThrow(
      RedirectError,
    );

    // created_by is forced to the logged-in user — never client-supplied.
    expect(coursesInsertArgs()).toMatchObject({
      name: 'Testbanen',
      created_by: regularUserId,
    });
    // All three tables written through the same (request-scoped) client.
    const tables = supabaseMock.__fromCalls
      .filter((c) => c.method === 'insert')
      .map((c) => c.table);
    expect(tables).toEqual(['courses', 'course_holes', 'tee_boxes']);
    // Default success redirect (admin path) when no override supplied.
    expect(lastRedirect()).toBe(
      '/admin/courses?status=created&name=Testbanen',
    );
  });

  it('honors success_redirect + redirect_base for the non-admin /opprett-bane route', async () => {
    supabaseMock = buildSupabaseMock(happyQueue());
    setAuth({ id: regularUserId });
    const { createCourse } = await import('./actions');

    const fd = validCourseFormData({
      redirect_base: '/opprett-bane',
      success_redirect: '/opprett-bane?status=created',
    });
    await expect(createCourse(fd)).rejects.toThrow(RedirectError);
    expect(lastRedirect()).toBe(
      '/opprett-bane?status=created&name=Testbanen',
    );
  });

  it('bounces validation errors to redirect_base (non-admin route)', async () => {
    supabaseMock = buildSupabaseMock([]);
    setAuth({ id: regularUserId });
    const { createCourse } = await import('./actions');

    const fd = validCourseFormData({ redirect_base: '/opprett-bane' });
    fd.set('name', ''); // trigger name_required
    await expect(createCourse(fd)).rejects.toThrow(RedirectError);
    expect(lastRedirect()).toBe('/opprett-bane?error=name_required');
  });

  it('rejects an external redirect_base (open-redirect guard) and falls back to the admin default', async () => {
    supabaseMock = buildSupabaseMock([]);
    setAuth({ id: regularUserId });
    const { createCourse } = await import('./actions');

    const fd = validCourseFormData({ redirect_base: 'https://evil.example' });
    fd.set('name', ''); // trigger an error so we observe the bounce target
    await expect(createCourse(fd)).rejects.toThrow(RedirectError);
    expect(lastRedirect()).toBe('/admin/courses/new?error=name_required');
  });

  it('rejects a protocol-relative redirect_base (//evil)', async () => {
    supabaseMock = buildSupabaseMock([]);
    setAuth({ id: regularUserId });
    const { createCourse } = await import('./actions');

    const fd = validCourseFormData({ redirect_base: '//evil.example' });
    fd.set('name', '');
    await expect(createCourse(fd)).rejects.toThrow(RedirectError);
    expect(lastRedirect()).toBe('/admin/courses/new?error=name_required');
  });

  it('rejects a backslash redirect_base (/\\evil — browsers normalize \\ to /)', async () => {
    supabaseMock = buildSupabaseMock([]);
    setAuth({ id: regularUserId });
    const { createCourse } = await import('./actions');

    const fd = validCourseFormData({ redirect_base: '/\\evil.example' });
    fd.set('name', '');
    await expect(createCourse(fd)).rejects.toThrow(RedirectError);
    expect(lastRedirect()).toBe('/admin/courses/new?error=name_required');
  });
});
