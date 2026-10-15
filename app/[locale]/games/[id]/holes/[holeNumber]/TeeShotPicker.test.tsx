import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { LocalTeeShot } from '@/lib/sync/db';

const rowsMock = vi.fn<() => LocalTeeShot[] | undefined>();
const givenUpMock = vi.fn<() => number | undefined>(() => 0);
vi.mock('./holeLiveQueries', () => ({
  useTeamTeeShots: () => rowsMock(),
  useGivenUpTeeShotCount: () => givenUpMock(),
}));
const writeTeeShotMock = vi.fn(async () => ({}));
vi.mock('@/lib/sync/writeTeeShot', () => ({ writeTeeShot: (...args: unknown[]) => writeTeeShotMock(...(args as [])) }));
vi.mock('@/lib/sync/syncWorker', () => ({ drainQueue: vi.fn() }));
const refreshMock = vi.fn();
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ refresh: refreshMock, push: vi.fn(), replace: vi.fn() }) }));

import { TeeShotPicker } from './TeeShotPicker';

// Type C render tests (docs/test-discipline.md): what the picker renders and
// sends, read from structure (test ids, disabled, aria-pressed), never from the
// Norwegian copy. Who can be picked is Type A in lib/games/teeShots.test.ts;
// the sentences are in components/games/teeShotCopy.test.ts.
const NAMES = ['Marte', 'Jonas', 'Sigrid', 'Per'];
function members(withdrawn: string[] = []) {
  return NAMES.map((name) => ({
    userId: name.toLowerCase(),
    name,
    submittedAt: null,
    withdrawnAt: withdrawn.includes(name.toLowerCase()) ? '2026-10-15T10:00:00.000Z' : null,
  }));
}
// Holes 1–15 as on the artboard: Marte 6, Jonas 4, Sigrid 3, Per 2.
const OWNERS = ['sigrid', 'marte', 'marte', 'jonas', 'sigrid', 'marte', 'marte', 'jonas', 'per', 'sigrid', 'marte', 'jonas', 'per', 'jonas', 'marte'];
const ROWS: LocalTeeShot[] = OWNERS.map((owner, i) => ({
  id: `g1:1:${i + 1}`,
  gameId: 'g1',
  teamNumber: 1,
  holeNumber: i + 1,
  teeShotBy: owner,
  enteredBy: 'marte',
  clientUpdatedAt: '2026-10-14T10:00:00.000Z',
  serverUpdatedAt: null,
}));

function renderPicker(props: { holeNumber?: number; withdrawn?: string[]; disabled?: boolean; myUserId?: string } = {}) {
  return render(
    <TeeShotPicker
      gameId="g1"
      holeNumber={props.holeNumber ?? 16}
      gameMode="texas_scramble"
      minimum={4}
      teams={[{ teamNumber: 1, members: members(props.withdrawn) }]}
      myUserId={props.myUserId ?? 'sigrid'}
      disabled={props.disabled ?? false}
    />,
  );
}
const button = (id: string) => screen.getByTestId(`tee-shot-${id}`);

beforeEach(() => {
  vi.clearAllMocks();
  rowsMock.mockReturnValue(ROWS);
  givenUpMock.mockReturnValue(0);
});

describe('TeeShotPicker', () => {
  it('Utslag 2b: the names that cannot take hole 16 are locked, the others open, and the line describes the group', () => {
    renderPicker();

    expect(button('marte')).toBeDisabled();
    expect(button('jonas')).toBeDisabled();
    expect(button('sigrid')).toBeEnabled();
    expect(button('per')).toBeEnabled();
    for (const id of ['marte', 'jonas', 'sigrid', 'per']) expect(button(id)).toHaveAttribute('aria-pressed', 'false');
    const group = screen.getByRole('group');
    const lineId = group.getAttribute('aria-describedby');
    expect(lineId).toBeTruthy();
    expect(document.getElementById(lineId!)).not.toBeNull();
  });

  it('a tap on an open name writes the hole for the team; a locked name writes nothing', () => {
    renderPicker();

    fireEvent.click(button('marte'));
    expect(writeTeeShotMock).not.toHaveBeenCalled();

    fireEvent.click(button('sigrid'));
    expect(writeTeeShotMock).toHaveBeenCalledWith({
      gameId: 'g1',
      teamNumber: 1,
      holeNumber: 16,
      teeShotBy: 'sigrid',
      enteredBy: 'sigrid',
    });
  });

  it('the chosen name is pressed, and a tap on it clears the hole', () => {
    renderPicker({ holeNumber: 15 });

    expect(button('marte')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(button('marte'));
    expect(writeTeeShotMock).toHaveBeenCalledWith(expect.objectContaining({ holeNumber: 15, teeShotBy: null }));
  });

  it('a withdrawn player cannot pick, as with the score rows (the RPC refuses them)', () => {
    renderPicker({ withdrawn: ['sigrid'], myUserId: 'sigrid' });

    for (const id of ['marte', 'jonas', 'per']) expect(button(id)).toBeDisabled();
    fireEvent.click(button('per'));
    expect(writeTeeShotMock).not.toHaveBeenCalled();
  });

  it('a teammate is not locked out because someone else on the team withdrew', () => {
    renderPicker({ withdrawn: ['marte'], myUserId: 'sigrid' });

    expect(button('per')).toBeEnabled();
  });

  it('a round that is not active locks every name', () => {
    renderPicker({ disabled: true });

    for (const id of ['sigrid', 'per']) expect(button(id)).toBeDisabled();
  });
});

describe('TeeShotPicker — the sync gives up a choice (#2580)', () => {
  it('refreshes the page when the given-up count rises, once', () => {
    const view = renderPicker();
    expect(refreshMock).not.toHaveBeenCalled();

    givenUpMock.mockReturnValue(1);
    view.rerender(
      <TeeShotPicker gameId="g1" holeNumber={16} gameMode="texas_scramble" minimum={4} teams={[{ teamNumber: 1, members: members() }]} myUserId="sigrid" disabled={false} />,
    );
    expect(refreshMock).toHaveBeenCalledTimes(1);

    view.rerender(
      <TeeShotPicker gameId="g1" holeNumber={16} gameMode="texas_scramble" minimum={4} teams={[{ teamNumber: 1, members: members() }]} myUserId="sigrid" disabled={false} />,
    );
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('choices given up before the page opened do not refresh it', () => {
    givenUpMock.mockReturnValue(undefined);
    const view = renderPicker();
    givenUpMock.mockReturnValue(2);
    view.rerender(
      <TeeShotPicker gameId="g1" holeNumber={16} gameMode="texas_scramble" minimum={4} teams={[{ teamNumber: 1, members: members() }]} myUserId="sigrid" disabled={false} />,
    );
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
