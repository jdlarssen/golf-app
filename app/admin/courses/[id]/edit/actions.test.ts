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
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}));

let supabaseMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => supabaseMock,
}));

function lastRedirect(): string | undefined {
  return redirectMock.mock.calls.at(-1)?.[0];
}

beforeEach(() => {
  vi.clearAllMocks();
});

const courseId = '11111111-1111-1111-1111-111111111111';
const teeId = '22222222-2222-2222-2222-222222222222';
const adminUserId = '33333333-3333-3333-3333-333333333333';

function setupAdminAuth() {
  supabaseMock.auth.getUser = vi.fn(async () => ({
    data: { user: { id: adminUserId } },
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

  it('regression: updateCourse iterates the tee-parsing loop (v1.26.1 fix)', async () => {
    // v1.26.1 bug: MAX_TEE_BOXES was exported from a 'use client' module and
    // became a throw-function on the server, so the parsing loop never
    // iterated and every save returned error=tee_required. This test runs
    // the full FormData parse path; if MAX_TEE_BOXES regresses back into the
    // client boundary, the loop never sees tee_0_name and the assertion
    // fails. See feedback_use_client_exports_to_server memory.
    supabaseMock = buildSupabaseMock([
      // requireAdmin: users.is_admin lookup
      { data: { is_admin: true }, error: null },
      // SELECT existing tees (toDelete computation)
      { data: [], error: null },
      // UPDATE courses (audit bump)
      { error: null },
      // DELETE course_holes
      { error: null },
      // INSERT course_holes
      { error: null },
      // INSERT tee_boxes (single new tee)
      { error: null },
    ]);
    setupAdminAuth();

    const formData = new FormData();
    formData.set('name', 'Sjø-bane Trondheim');
    for (let i = 1; i <= 18; i++) {
      formData.set(`hole_${i}_par`, '4');
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

    // Critical: the tee_boxes.insert was reached, proving the loop iterated.
    const insertCalls = supabaseMock.__fromCalls.filter(
      (c) => c.method === 'insert' && c.table === 'tee_boxes',
    );
    expect(insertCalls).toHaveLength(1);
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
