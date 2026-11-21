import { beforeEach, describe, expect, it, vi } from 'vitest';

const insertResult = vi.fn();
const insertSpy = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => ({
    from: () => ({
      insert: (row: unknown) => {
        insertSpy(row);
        return { select: () => insertResult() };
      },
    }),
  }),
}));

const callerIdMock = vi.fn<() => Promise<string | null>>(async () => 'user-1');
vi.mock('@/lib/auth/userId', () => ({
  getProxyVerifiedUserId: () => callerIdMock(),
}));

import { saveGreenPin } from './greenPinActions';

const PIN = { courseId: 'course-1', holeNumber: 7, lat: 63.4, lng: 10.4, accuracyM: 8 };

beforeEach(() => {
  insertResult.mockReset();
  insertSpy.mockReset();
  callerIdMock.mockResolvedValue('user-1');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('saveGreenPin', () => {
  it('saves the pin as the signed-in player', async () => {
    insertResult.mockResolvedValueOnce({ data: [{ id: 'pin-1' }], error: null });

    await expect(saveGreenPin(PIN)).resolves.toEqual({ ok: true });
    expect(insertSpy).toHaveBeenCalledWith({
      course_id: 'course-1',
      hole_number: 7,
      lat: 63.4,
      lng: 10.4,
      accuracy_m: 8,
      user_id: 'user-1',
    });
  });

  it('a second pin on the same hole inside the window is a thank-you, not a failure (0251)', async () => {
    insertResult.mockResolvedValueOnce({
      data: null,
      error: { code: '23505', message: 'green_pins_gate: already_pinned' },
    });

    await expect(saveGreenPin(PIN)).resolves.toEqual({ ok: true });
  });

  it('the full gate and the «not playing here» refusal stay failures', async () => {
    insertResult.mockResolvedValueOnce({
      data: null,
      error: { code: '23514', message: 'green_pins_gate: already has 3 pins' },
    });
    await expect(saveGreenPin(PIN)).resolves.toEqual({ ok: false, error: 'save_failed' });

    insertResult.mockResolvedValueOnce({
      data: null,
      error: { code: '42501', message: 'green_pins_gate: not playing a round in progress' },
    });
    await expect(saveGreenPin(PIN)).resolves.toEqual({ ok: false, error: 'save_failed' });
  });

  it('weak GPS and a signed-out caller never reach the database', async () => {
    await expect(saveGreenPin({ ...PIN, accuracyM: 80 })).resolves.toEqual({
      ok: false,
      error: 'weak_gps',
    });
    callerIdMock.mockResolvedValueOnce(null);
    await expect(saveGreenPin(PIN)).resolves.toEqual({ ok: false, error: 'unauthenticated' });
    expect(insertSpy).not.toHaveBeenCalled();
  });
});
