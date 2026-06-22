import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';

/**
 * Unit tests for restoreTee — Fase 3 av #223. Covers the happy path plus
 * the three rejection paths (tee not found, wrong course, not archived)
 * and the audit-bump on courses.
 */

const redirectMock = makeRedirectMock();
vi.mock('@/i18n/navigation', () => ({
  redirect: (arg: { href: string; locale?: string } | string) =>
    redirectMock(typeof arg === 'string' ? arg : arg.href),
}));
// lib/admin/auth.ts still redirects via next/navigation — route to the same spy.
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}));
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'no',
}));

const revalidatePathMock = vi.fn();
vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => revalidatePathMock(path),
}));

let supabaseMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => supabaseMock,
}));

// Service-role-bypass client used by trusted-non-admin writes. Tests that
// exercise trusted paths replace `adminClientMock` with a separate
// buildSupabaseMock instance so we can inspect the bypass-writes
// independently from the request-scoped reads.
let adminClientMock: ReturnType<typeof buildSupabaseMock> | null = null;
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => {
    if (!adminClientMock) {
      throw new Error('adminClientMock not configured for this test');
    }
    return adminClientMock;
  },
}));

function lastRedirect(): string | undefined {
  return redirectMock.mock.calls.at(-1)?.[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  adminClientMock = null;
});

const courseId = '11111111-1111-1111-1111-111111111111';
const teeId = '22222222-2222-2222-2222-222222222222';
const adminUserId = '33333333-3333-3333-3333-333333333333';
const trustedUserId = '44444444-4444-4444-4444-444444444444';
const trustedEmail = 'fornes.even@yahoo.no';

function setupAdminAuth() {
  supabaseMock.auth.getUser = vi.fn(async () => ({
    data: { user: { id: adminUserId, email: 'admin@example.com' } },
    error: null,
  }));
}

function setupTrustedAuth() {
  supabaseMock.auth.getUser = vi.fn(async () => ({
    data: { user: { id: trustedUserId, email: trustedEmail } },
    error: null,
  }));
}

describe('restoreTee', () => {
  it('happy path: clears archived_at + bumps courses audit + redirects to status=restored', async () => {
    supabaseMock = buildSupabaseMock([
      // requireAdmin: users.is_admin lookup
      { data: { is_admin: true }, error: null },
      // tee_boxes.maybeSingle — tee found, belongs to course, is archived
      {
        data: {
          id: teeId,
          course_id: courseId,
          archived_at: '2026-05-20T10:00:00.000Z',
        },
        error: null,
      },
      // tee_boxes.update — restore
      { error: null },
      // courses.update — audit bump
      { error: null },
    ]);
    setupAdminAuth();

    const { restoreTee } = await import('./actions');

    await expect(restoreTee(courseId, teeId)).rejects.toBeInstanceOf(
      RedirectError,
    );

    expect(lastRedirect()).toBe(
      `/admin/courses/${courseId}/edit?status=restored`,
    );

    // Regression: revalidatePath must fire for the edit-page so the next
    // render's CourseForm fetch returns the now-active tee. Without this,
    // a subsequent Lagre would send stale formData missing the restored
    // tee and updateCourse would re-archive it.
    expect(revalidatePathMock).toHaveBeenCalledWith(
      `/admin/courses/${courseId}/edit`,
    );
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin/courses');
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin/games/new');

    const updateCalls = supabaseMock.__fromCalls.filter(
      (c) => c.method === 'update',
    );
    expect(updateCalls).toHaveLength(2);

    // First update: tee_boxes archived_at = null
    expect(updateCalls[0].table).toBe('tee_boxes');
    expect(updateCalls[0].args[0]).toEqual({ archived_at: null });

    // Second update: courses audit bump with admin user id
    expect(updateCalls[1].table).toBe('courses');
    const courseUpdate = updateCalls[1].args[0] as {
      updated_at: string;
      updated_by: string;
    };
    expect(courseUpdate.updated_by).toBe(adminUserId);
    expect(typeof courseUpdate.updated_at).toBe('string');
    expect(Number.isNaN(Date.parse(courseUpdate.updated_at))).toBe(false);
  });

  it('rejects when tee does not exist: redirects with error=tee_not_found, no mutations', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null },
      // tee_boxes.maybeSingle — null
      { data: null, error: null },
    ]);
    setupAdminAuth();

    const { restoreTee } = await import('./actions');

    await expect(restoreTee(courseId, teeId)).rejects.toBeInstanceOf(
      RedirectError,
    );

    expect(lastRedirect()).toBe(
      `/admin/courses/${courseId}/edit?error=tee_not_found`,
    );

    const updateCalls = supabaseMock.__fromCalls.filter(
      (c) => c.method === 'update',
    );
    expect(updateCalls).toHaveLength(0);
  });

  it('rejects when tee belongs to a different course: redirects with error=tee_not_found, no mutations', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null },
      {
        data: {
          id: teeId,
          course_id: 'wrong-course-uuid',
          archived_at: '2026-05-20T10:00:00.000Z',
        },
        error: null,
      },
    ]);
    setupAdminAuth();

    const { restoreTee } = await import('./actions');

    await expect(restoreTee(courseId, teeId)).rejects.toBeInstanceOf(
      RedirectError,
    );

    expect(lastRedirect()).toBe(
      `/admin/courses/${courseId}/edit?error=tee_not_found`,
    );

    const updateCalls = supabaseMock.__fromCalls.filter(
      (c) => c.method === 'update',
    );
    expect(updateCalls).toHaveLength(0);
  });

  it('rejects when tee is not archived: redirects with error=tee_not_archived, no mutations', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null },
      {
        data: {
          id: teeId,
          course_id: courseId,
          archived_at: null,
        },
        error: null,
      },
    ]);
    setupAdminAuth();

    const { restoreTee } = await import('./actions');

    await expect(restoreTee(courseId, teeId)).rejects.toBeInstanceOf(
      RedirectError,
    );

    expect(lastRedirect()).toBe(
      `/admin/courses/${courseId}/edit?error=tee_not_archived`,
    );

    const updateCalls = supabaseMock.__fromCalls.filter(
      (c) => c.method === 'update',
    );
    expect(updateCalls).toHaveLength(0);
  });

  it('rejects non-admin caller: redirects to /, no tee lookup', async () => {
    supabaseMock = buildSupabaseMock([
      // users lookup — not admin
      { data: { is_admin: false }, error: null },
    ]);
    setupAdminAuth();

    const { restoreTee } = await import('./actions');

    await expect(restoreTee(courseId, teeId)).rejects.toBeInstanceOf(
      RedirectError,
    );

    expect(lastRedirect()).toBe('/');

    // tee_boxes table never touched
    const teeCalls = supabaseMock.__fromCalls.filter(
      (c) => c.table === 'tee_boxes',
    );
    expect(teeCalls).toHaveLength(0);
  });

  it('rejects unauthenticated caller: redirects to /login, no DB queries', async () => {
    supabaseMock = buildSupabaseMock([]);
    supabaseMock.auth.getUser = vi.fn(async () => ({
      data: { user: null },
      error: null,
    }));

    const { restoreTee } = await import('./actions');

    await expect(restoreTee(courseId, teeId)).rejects.toBeInstanceOf(
      RedirectError,
    );

    expect(lastRedirect()).toBe('/login');
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it('regression: updateCourse parses the tee loop and sends it to the atomic RPC (v1.26.1 + #846)', async () => {
    // v1.26.1 bug: MAX_TEE_BOXES was exported from a 'use client' module and
    // became a throw-function on the server, so the parsing loop never iterated
    // and every save returned error=tee_required. #846 moved the writes into one
    // atomic RPC; this still guards the parse — the new tee must reach
    // p_tee_inserts. See feedback_use_client_exports_to_server memory.
    supabaseMock = buildSupabaseMock([
      // requireAdminOrTrustedCreator: users.is_admin lookup
      { data: { is_admin: true }, error: null },
      // SELECT existing tees (toDelete computation) → none
      { data: [], error: null },
    ]);
    setupAdminAuth();

    const formData = new FormData();
    formData.set('name', 'Sjø-bane Trondheim');
    for (let i = 1; i <= 18; i++) {
      formData.set(`hole_${i}_par_mens`, '4');
      formData.set(`hole_${i}_si`, String(i));
    }
    // Single mens-rated tee at index 0; index 1+ left blank (continue-branch).
    formData.set('tee_0_name', 'Gul');
    formData.set('tee_0_length_meters', '5670');
    formData.set('tee_0_slope_mens', '113');
    formData.set('tee_0_cr_mens', '70.0');

    const { updateCourse } = await import('./actions');
    await expect(updateCourse(courseId, formData)).rejects.toBeInstanceOf(
      RedirectError,
    );

    expect(lastRedirect()).toMatch(/\/admin\/courses\?status=updated/);

    // #846: one atomic RPC, never per-table writes.
    const writes = supabaseMock.__fromCalls.filter(
      (c) =>
        c.method === 'insert' || c.method === 'update' || c.method === 'delete',
    );
    expect(writes).toHaveLength(0);
    // The parsed tee reached the RPC's p_tee_inserts (proves the loop iterated).
    const rpc = supabaseMock.__rpcCalls.find(
      (c) => c.name === 'update_course_with_layout',
    );
    expect(rpc, 'update_course_with_layout invoked').toBeDefined();
    const params = rpc!.params as {
      p_name: string;
      p_holes: unknown[];
      p_tee_inserts: unknown[];
      p_tee_updates: unknown[];
    };
    expect(params.p_name).toBe('Sjø-bane Trondheim');
    expect(params.p_holes).toHaveLength(18);
    expect(params.p_tee_inserts).toHaveLength(1);
    expect(params.p_tee_updates).toHaveLength(0);
  });

  it('#846 chaos: a failed updateCourse RPC shows a localized error and leaks no per-table write', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null }, // gate
      { data: [], error: null }, // existing tees
    ]);
    setupAdminAuth();
    // Force the atomic RPC to fail (shared mock resolves error:null otherwise);
    // still record the call so the assertion can see it.
    supabaseMock.rpc = vi.fn(async (name: string, params?: unknown) => {
      supabaseMock.__rpcCalls.push({ name, params });
      return { data: null, error: { message: 'boom' } };
    }) as unknown as typeof supabaseMock.rpc;

    const formData = new FormData();
    formData.set('name', 'Sjø-bane');
    for (let i = 1; i <= 18; i++) {
      formData.set(`hole_${i}_par_mens`, '4');
      formData.set(`hole_${i}_si`, String(i));
    }
    formData.set('tee_0_name', 'Gul');
    formData.set('tee_0_slope_mens', '113');
    formData.set('tee_0_cr_mens', '70.0');

    const { updateCourse } = await import('./actions');
    await expect(updateCourse(courseId, formData)).rejects.toBeInstanceOf(
      RedirectError,
    );

    // Atomicity is enforced in Postgres; here we prove the TS path routes through
    // the RPC and surfaces a localized error rather than a partial multi-write.
    const writes = supabaseMock.__fromCalls.filter(
      (c) =>
        c.method === 'insert' || c.method === 'update' || c.method === 'delete',
    );
    expect(writes).toHaveLength(0);
    expect(
      supabaseMock.__rpcCalls.find(
        (c) => c.name === 'update_course_with_layout',
      ),
    ).toBeDefined();
    expect(lastRedirect()).toBe(
      `/admin/courses/${courseId}/edit?error=db_course`,
    );
  });

  it('#846: trusted tries to restore a tee on a course they do NOT own → not_owned, no write', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: false, email: trustedEmail, name: 'Even' }, error: null }, // loadRole
      // tee_boxes.maybeSingle — found, belongs to course, archived
      {
        data: {
          id: teeId,
          course_id: courseId,
          archived_at: '2026-05-20T10:00:00.000Z',
        },
        error: null,
      },
      // courses.select created_by — owned by ANOTHER user
      { data: { created_by: adminUserId }, error: null },
    ]);
    setupTrustedAuth();
    adminClientMock = buildSupabaseMock([]);

    const { restoreTee } = await import('./actions');
    await expect(restoreTee(courseId, teeId)).rejects.toBeInstanceOf(
      RedirectError,
    );
    expect(lastRedirect()).toBe(
      `/admin/courses/${courseId}/edit?error=not_owned`,
    );
    // No write on either client.
    expect(
      supabaseMock.__fromCalls.filter((c) => c.method === 'update'),
    ).toHaveLength(0);
    expect(
      adminClientMock.__fromCalls.filter((c) => c.method === 'update'),
    ).toHaveLength(0);
  });

  it('redirects with error=db_tees when archived_at update fails', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null },
      {
        data: {
          id: teeId,
          course_id: courseId,
          archived_at: '2026-05-20T10:00:00.000Z',
        },
        error: null,
      },
      // tee_boxes.update fails
      { error: { message: 'simulated db error' } },
    ]);
    setupAdminAuth();

    const { restoreTee } = await import('./actions');

    await expect(restoreTee(courseId, teeId)).rejects.toBeInstanceOf(
      RedirectError,
    );

    expect(lastRedirect()).toBe(
      `/admin/courses/${courseId}/edit?error=db_tees`,
    );

    // courses.update never reached
    const courseCalls = supabaseMock.__fromCalls.filter(
      (c) => c.table === 'courses',
    );
    expect(courseCalls).toHaveLength(0);
  });
});

describe('deleteCourse — admin path', () => {
  it('admin deletes course not in use: redirects with status=deleted', async () => {
    supabaseMock = buildSupabaseMock([
      // loadRole: users.is_admin lookup
      { data: { is_admin: true, email: 'admin@example.com', name: 'Jørgen' }, error: null },
      // games.select — no usage
      { data: [], error: null },
      // courses.delete (admin uses request-scoped supabase as writeClient)
      { error: null },
    ]);
    setupAdminAuth();

    const { deleteCourse } = await import('./actions');

    await expect(deleteCourse(courseId)).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe('/admin/courses?status=deleted');

    // Admin never touches getAdminClient (writeClient = request-scoped).
    expect(adminClientMock).toBeNull();

    const deleteCalls = supabaseMock.__fromCalls.filter(
      (c) => c.method === 'delete' && c.table === 'courses',
    );
    expect(deleteCalls).toHaveLength(1);
  });

  it('admin blocked by in_use guard: redirects, no delete', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true, email: 'admin@example.com', name: 'Jørgen' }, error: null },
      // games.select — usage found
      { data: [{ id: 'game-1' }], error: null },
    ]);
    setupAdminAuth();

    const { deleteCourse } = await import('./actions');

    await expect(deleteCourse(courseId)).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/admin/courses?error=in_use');

    const deleteCalls = supabaseMock.__fromCalls.filter(
      (c) => c.method === 'delete',
    );
    expect(deleteCalls).toHaveLength(0);
  });
});

describe('deleteCourse — trusted-non-admin path (Fase 4 ownership-check)', () => {
  it('trusted deletes OWN course (not in use): redirects with status=deleted, write goes via admin-client', async () => {
    supabaseMock = buildSupabaseMock([
      // loadRole: users.is_admin lookup — trusted, NOT admin
      { data: { is_admin: false, email: trustedEmail, name: 'Even' }, error: null },
      // games.select — no usage
      { data: [], error: null },
      // courses.select created_by — owned by trusted user
      { data: { created_by: trustedUserId }, error: null },
    ]);
    setupTrustedAuth();
    // Separate write-mock for the service-role bypass-client.
    adminClientMock = buildSupabaseMock([
      // courses.delete via admin-client
      { error: null },
    ]);

    const { deleteCourse } = await import('./actions');

    await expect(deleteCourse(courseId)).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/admin/courses?status=deleted');

    // The DELETE call landed on the service-role client, NOT the request-
    // scoped one (which would trip the is_admin()-RLS-policy).
    const requestScopedDeletes = supabaseMock.__fromCalls.filter(
      (c) => c.method === 'delete',
    );
    expect(requestScopedDeletes).toHaveLength(0);
    const adminDeletes = adminClientMock.__fromCalls.filter(
      (c) => c.method === 'delete' && c.table === 'courses',
    );
    expect(adminDeletes).toHaveLength(1);
  });

  it('trusted tries to delete OTHER user\'s course: redirects with error=not_owned, no delete', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: false, email: trustedEmail, name: 'Even' }, error: null },
      // games.select — no usage (so we get past in_use guard)
      { data: [], error: null },
      // courses.select created_by — owned by ANOTHER user (admin, here)
      { data: { created_by: adminUserId }, error: null },
    ]);
    setupTrustedAuth();
    // Admin-client should NEVER be consumed in this rejection path. We still
    // configure it so that an unexpected access shows up as a queue mismatch
    // rather than a misleading «not configured» error.
    adminClientMock = buildSupabaseMock([]);

    const { deleteCourse } = await import('./actions');

    await expect(deleteCourse(courseId)).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/admin/courses?error=not_owned');

    // No write should have fired on either client.
    const requestScopedDeletes = supabaseMock.__fromCalls.filter(
      (c) => c.method === 'delete',
    );
    const adminDeletes = adminClientMock.__fromCalls.filter(
      (c) => c.method === 'delete',
    );
    expect(requestScopedDeletes).toHaveLength(0);
    expect(adminDeletes).toHaveLength(0);
  });

  it('trusted tries to delete a course IN USE: in_use error fires BEFORE ownership-check', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: false, email: trustedEmail, name: 'Even' }, error: null },
      // games.select — usage found → in_use redirect fires immediately
      { data: [{ id: 'game-1' }], error: null },
    ]);
    setupTrustedAuth();
    adminClientMock = buildSupabaseMock([]);

    const { deleteCourse } = await import('./actions');

    await expect(deleteCourse(courseId)).rejects.toBeInstanceOf(RedirectError);
    // Critical: trusted-non-owner of an in-use course sees the informative
    // «in_use» message, not the confusing «not_owned».
    expect(lastRedirect()).toBe('/admin/courses?error=in_use');

    // courses.select created_by should NEVER have been queried — the
    // in_use guard short-circuits before ownership-check.
    const ownershipSelects = supabaseMock.__fromCalls.filter(
      (c) => c.table === 'courses' && c.method === 'select',
    );
    expect(ownershipSelects).toHaveLength(0);
  });

  it('trusted DELETE against missing-course row: treated as not_owned (defense-in-depth)', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: false, email: trustedEmail, name: 'Even' }, error: null },
      // games.select — no usage
      { data: [], error: null },
      // courses.select created_by — row not found
      { data: null, error: null },
    ]);
    setupTrustedAuth();
    adminClientMock = buildSupabaseMock([]);

    const { deleteCourse } = await import('./actions');

    await expect(deleteCourse(courseId)).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/admin/courses?error=not_owned');
  });
});

describe('updateCourse — trusted-non-admin path (Fase 4 + #846)', () => {
  it('trusted edit: ownership-checked, atomic RPC routed via admin-client, audit uses trusted id', async () => {
    supabaseMock = buildSupabaseMock([
      // loadRole — trusted, NOT admin
      { data: { is_admin: false, email: trustedEmail, name: 'Even' }, error: null },
      // #846 ownership check: courses.created_by — owned by the trusted user
      { data: { created_by: trustedUserId }, error: null },
      // SELECT existing tees (toDelete computation) — request-scoped read is OK
      { data: [], error: null },
    ]);
    setupTrustedAuth();
    // The atomic RPC routes to the service-role client (RLS writes are admin-only).
    adminClientMock = buildSupabaseMock([]);

    const formData = new FormData();
    formData.set('name', 'Sjø-bane Trondheim');
    for (let i = 1; i <= 18; i++) {
      formData.set(`hole_${i}_par_mens`, '4');
      formData.set(`hole_${i}_si`, String(i));
    }
    formData.set('tee_0_name', 'Gul');
    formData.set('tee_0_length_meters', '5670');
    formData.set('tee_0_slope_mens', '113');
    formData.set('tee_0_cr_mens', '70.0');

    const { updateCourse } = await import('./actions');
    await expect(updateCourse(courseId, formData)).rejects.toBeInstanceOf(
      RedirectError,
    );

    expect(lastRedirect()).toMatch(/\/admin\/courses\?status=updated/);

    // No writes and no RPC on the request-scoped client (would trip is_admin RLS).
    const reqWrites = supabaseMock.__fromCalls.filter(
      (c) =>
        c.method === 'update' ||
        c.method === 'insert' ||
        c.method === 'delete',
    );
    expect(reqWrites).toHaveLength(0);
    expect(supabaseMock.__rpcCalls).toHaveLength(0);

    // The atomic RPC landed on the service-role client, carrying the trusted id.
    const rpc = adminClientMock.__rpcCalls.find(
      (c) => c.name === 'update_course_with_layout',
    );
    expect(rpc, 'RPC routed via admin-client').toBeDefined();
    const params = rpc!.params as {
      p_updated_by: string;
      p_tee_inserts: unknown[];
    };
    expect(params.p_updated_by).toBe(trustedUserId);
    expect(params.p_tee_inserts).toHaveLength(1);
  });

  it('#846: trusted edit of a course they do NOT own → not_owned, before parse, no RPC', async () => {
    supabaseMock = buildSupabaseMock([
      // loadRole — trusted, NOT admin
      { data: { is_admin: false, email: trustedEmail, name: 'Even' }, error: null },
      // ownership check: courses.created_by — owned by ANOTHER user
      { data: { created_by: adminUserId }, error: null },
    ]);
    setupTrustedAuth();
    adminClientMock = buildSupabaseMock([]);

    const formData = new FormData();
    formData.set('name', 'Sjø-bane');
    for (let i = 1; i <= 18; i++) {
      formData.set(`hole_${i}_par_mens`, '4');
      formData.set(`hole_${i}_si`, String(i));
    }
    formData.set('tee_0_name', 'Gul');
    formData.set('tee_0_slope_mens', '113');
    formData.set('tee_0_cr_mens', '70.0');

    const { updateCourse } = await import('./actions');
    await expect(updateCourse(courseId, formData)).rejects.toBeInstanceOf(
      RedirectError,
    );
    expect(lastRedirect()).toBe(
      `/admin/courses/${courseId}/edit?error=not_owned`,
    );
    // The guard fires before any write/RPC on either client.
    expect(supabaseMock.__rpcCalls).toHaveLength(0);
    expect(adminClientMock.__rpcCalls).toHaveLength(0);
  });
});
