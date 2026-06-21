import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';

/**
 * Unit tests for createCourse — #366 (vanlige brukere oppretter baner) +
 * #737 (atomisk oppretting via SECURITY DEFINER RPC).
 *
 * Fokus:
 * - Gate åpnet til ENHVER innlogget bruker (uinnlogget → /login).
 * - #737: de tre sekvensielle insertene (courses → course_holes → tee_boxes) er
 *   erstattet med ett `create_course_with_layout`-RPC-kall som kjører dem i én
 *   transaksjon. created_by tvinges til auth.uid() INNE i RPC-en — aldri en param.
 *   En RPC-feil ruller alt tilbake (ingen orphan course) og viser lokalisert feil.
 * - redirect_base / success_redirect respekteres OG saniteres (open-redirect).
 */

const redirectMock = makeRedirectMock();
vi.mock('@/i18n/navigation', () => ({
  redirect: (arg: { href: string; locale?: string } | string) =>
    redirectMock(typeof arg === 'string' ? arg : arg.href),
}));
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'no',
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

/**
 * Mock whose `create_course_with_layout` RPC resolves to a new course id —
 * the #737 happy path. No `.from()` queries run anymore (the action is auth →
 * pure parse → single RPC).
 */
function happyMock() {
  return buildSupabaseMock([], { create_course_with_layout: 'course-1' });
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

function rpcCall(name: string) {
  return supabaseMock.__rpcCalls.find((c) => c.name === name);
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
    // No write attempted — neither a direct insert nor the RPC.
    expect(
      supabaseMock.__fromCalls.some((c) => c.method === 'insert'),
    ).toBe(false);
    expect(supabaseMock.__rpcCalls).toHaveLength(0);
  });

  it('creates a course atomically via the create_course_with_layout RPC (#737)', async () => {
    supabaseMock = happyMock();
    setAuth({ id: regularUserId });
    const { createCourse } = await import('./actions');

    await expect(createCourse(validCourseFormData())).rejects.toThrow(
      RedirectError,
    );

    // #737: one atomic RPC, never three sequential table inserts.
    expect(supabaseMock.__fromCalls.some((c) => c.method === 'insert')).toBe(
      false,
    );
    const rpc = rpcCall('create_course_with_layout');
    expect(rpc, 'create_course_with_layout invoked').toBeDefined();
    const params = rpc!.params as {
      p_name: string;
      p_holes: unknown[];
      p_tees: unknown[];
    };
    expect(params.p_name).toBe('Testbanen');
    expect(params.p_holes).toHaveLength(18);
    expect(params.p_tees).toHaveLength(1);
    // created_by is set server-side (auth.uid()) inside the RPC — never a
    // client-supplied param, which is a stronger guarantee than the old insert.
    expect(params).not.toHaveProperty('created_by');
    // Default success redirect (admin path) when no override supplied.
    expect(lastRedirect()).toBe(
      '/admin/courses?status=created&name=Testbanen',
    );
  });

  it('honors success_redirect + redirect_base for the non-admin /opprett-bane route', async () => {
    supabaseMock = happyMock();
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

  // #737 chaos-injection: the atomicity lives in Postgres (the RPC runs the three
  // inserts in one transaction). This proves the TS path routes through the RPC
  // and surfaces a localized error — never a partial multi-insert — when it
  // fails, so a half-built course can never leak to the user.
  it('rolls back cleanly: an RPC failure shows a localized error and leaks no insert (#737)', async () => {
    supabaseMock = buildSupabaseMock([]);
    setAuth({ id: regularUserId });
    // Override the RPC to fail (the shared mock always resolves error:null).
    // Still record the call into __rpcCalls so the assertion below can see it.
    supabaseMock.rpc = vi.fn(async (name: string, params?: unknown) => {
      supabaseMock.__rpcCalls.push({ name, params });
      return { data: null, error: { message: 'boom' } };
    }) as unknown as typeof supabaseMock.rpc;
    const { createCourse } = await import('./actions');

    await expect(createCourse(validCourseFormData())).rejects.toThrow(
      RedirectError,
    );
    // No direct courses/holes/tees insert could have leaked a partial course.
    expect(supabaseMock.__fromCalls.some((c) => c.method === 'insert')).toBe(
      false,
    );
    // The RPC was attempted, and the failure bounced to a localized error.
    expect(rpcCall('create_course_with_layout')).toBeDefined();
    expect(lastRedirect()).toBe('/admin/courses/new?error=db_course');
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
