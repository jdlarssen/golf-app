// #2579 PR 2 (Type C): lagtavla tegner modellen den får. Tallene og tekstene
// er låst i `lib/teamBoard.test.ts`; her gjelder det formen: kortene i
// modellens rekkefølge, gullskiva og avatarene bare på lederen, prikkene der
// modellen gir dem, best balls overskrift, skraverte stav og låskort, likt-
// linja ferdig, «Ditt lag på hull N», og stripas knapp.
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { TeamBoardModel, TeamBoardRow } from '../../lib/teamBoard';
import { TeamBoard, TeamStrip } from './TeamBoard';

const row = (teamNumber: number, rank: number, extra: Partial<TeamBoardRow> = {}): TeamBoardRow => ({
  teamNumber,
  name: `team ${teamNumber}`,
  place: String(rank),
  leader: rank === 1,
  you: false,
  members: 'members',
  initials: ['AA', 'BB', 'CC'],
  total: String(30 + rank),
  under: 'under',
  dots: null,
  holesNote: null,
  movement: null,
  note: null,
  a11y: `team ${teamNumber}`,
  ...extra,
});

// Prikkene og avatarene er dekor for skjermleseren (kortets linje sier det).
const HIDDEN = { includeHiddenElements: true };

const recent = ['under', 'par', 'over1', 'over2', 'par'] as const;

const live: TeamBoardModel = {
  variant: 'live',
  pill: { text: 'pill', live: true },
  rows: [
    row(3, 1, { dots: [...recent], holesNote: 'holes' }),
    row(1, 2, { you: true, dots: [...recent], holesNote: 'holes', movement: 1 }),
    row(4, 3),
  ],
  viewerTeam: 1,
  halves: null,
  lock: null,
  holeCard: { heading: 'heading', lead: null, score: 'score' },
  strip: null,
};

it('tegner live, best ball og ferdig lagtavle i modellens form, og stripas knapp virker', async () => {
  const { rerender } = await render(<TeamBoard model={live} />);

  expect(screen.getAllByTestId(/^team-row-\d+$/).map((r) => r.props.testID)).toEqual([
    'team-row-3',
    'team-row-1',
    'team-row-4',
  ]);
  expect(screen.getAllByTestId('board-leader-disc')).toHaveLength(1);
  // Lederen har avatarene i stedet for navnelinja; de andre har navnelinja.
  expect(screen.getAllByTestId('team-avatar', HIDDEN)).toHaveLength(3);
  expect(screen.getAllByTestId('team-members')).toHaveLength(2);
  expect(screen.getAllByTestId('team-you')).toHaveLength(1);
  expect(screen.getAllByTestId('board-dot', HIDDEN)).toHaveLength(2 * 5);
  expect(screen.queryByTestId('team-hatch', HIDDEN)).toBeNull();
  expect(screen.getByTestId('team-hole-card')).toBeTruthy();
  expect(screen.queryByTestId('leaderboard-first-half-locked')).toBeNull();
  // Skjermleseren får kortets linje fra modellen.
  expect(screen.getByTestId('team-row-1')).toHaveProp('accessibilityLabel', 'team 1');

  const nine = [...recent, 'par', 'under', 'over1', 'unset'] as const;
  const firstHalf: TeamBoardModel = {
    ...live,
    variant: 'first-half',
    rows: live.rows.map((r) => ({ ...r, dots: [...nine], holesNote: null, movement: null })),
    halves: { shown: 'shown', hidden: 'hidden' },
    lock: { heading: 'heading', sub: 'sub' },
  };
  await rerender(<TeamBoard model={firstHalf} />);
  expect(screen.getByTestId('team-board-halves')).toBeTruthy();
  expect(screen.getByTestId('leaderboard-first-half-locked')).toBeTruthy();
  expect(screen.getAllByTestId('board-dot', HIDDEN)).toHaveLength(3 * 9);
  expect(screen.getAllByTestId('team-hatch', HIDDEN)).toHaveLength(3);

  const finished: TeamBoardModel = {
    ...live,
    variant: 'finished',
    rows: [row(3, 1), row(1, 2, { you: true }), row(4, 3, { note: 'note' })],
    holeCard: null,
  };
  await rerender(<TeamBoard model={finished} />);
  expect(screen.queryAllByTestId('board-dot', HIDDEN)).toHaveLength(0);
  expect(screen.queryAllByTestId('team-avatar', HIDDEN)).toHaveLength(0);
  expect(screen.getAllByTestId('board-tie-note')).toHaveLength(1);
  expect(screen.getAllByTestId('board-leader-disc')).toHaveLength(1);
  expect(screen.queryByTestId('team-hole-card')).toBeNull();

  const onAction = jest.fn();
  const strip = { kicker: 'kicker', place: 'place', detail: 'detail' };
  await rerender(
    <TeamStrip
      strip={{ ...strip, action: { kind: 'scorecard', label: 'label' } }}
      tabular
      bottomInset={0}
      onAction={onAction}
    />,
  );
  await fireEvent.press(screen.getByTestId('board-strip-action'));
  expect(onAction).toHaveBeenCalledTimes(1);
  await rerender(<TeamStrip strip={{ ...strip, action: null }} tabular={false} bottomInset={0} onAction={onAction} />);
  expect(screen.queryByTestId('board-strip-action')).toBeNull();
});
