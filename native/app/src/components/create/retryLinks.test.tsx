// #2928: «Prøv igjen» når en liste ikke kom, i formatsteget, banesteget og
// spillersteget (Type C). Lenka er en ekte knapp med rollen button, når 44 pt
// med en usynlig utvidelse inne i banneret, og henter på nytt.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import type { ReactElement } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { teamLayoutFor } from '../../lib/rosterLimits';
import { INTER_LINE, TAP, themeFor } from '../../theme';
import { CourseStep } from './CourseStep';
import { FormatStep } from './FormatStep';
import { PlayersStep } from './PlayersStep';

jest.mock('../../supabase', () => require('../../test/supabaseMock'));

const steps: [string, string, (onRetry: () => void) => ReactElement][] = [
  [
    'formatsteget',
    'create-format-retry',
    (onRetry) => <FormatStep entries={null} failed selected={null} onSelect={jest.fn()} onRetry={onRetry} />,
  ],
  [
    'banesteget',
    'create-course-retry',
    (onRetry) => (
      <CourseStep
        courses={null}
        failed
        courseId={null}
        teeBoxId={null}
        teeOff={new Date('2026-11-24T09:00:00.000Z')}
        onCourse={jest.fn()}
        onTee={jest.fn()}
        onTeeOff={jest.fn()}
        onRetry={onRetry}
        isAdmin={false}
      />
    ),
  ],
  [
    'spillersteget',
    'create-players-retry',
    (onRetry) => (
      <PlayersStep
        candidates={null}
        failed
        meId="me"
        selfPending={false}
        mode="best_ball"
        players={[]}
        teamLayout={teamLayoutFor('best_ball', false)}
        teeAvailability={{ M: true, D: false, J: false }}
        onToggle={jest.fn()}
        onTeam={jest.fn()}
        onTee={jest.fn()}
        onRetry={onRetry}
      />
    ),
  ],
];

describe('«Prøv igjen» i «Opprett spill»', () => {
  it.each(steps)('er en knapp på 44 pt i %s som henter på nytt', async (_step, testID, element) => {
    const onRetry = jest.fn();
    await render(element(onRetry));
    const retry = screen.getByTestId(testID);
    expect(retry).toHaveProp('accessibilityRole', 'button');
    const text = within(retry).getByText('Prøv igjen');
    // Inter 15 er 18,15 pt høy; resten er usynlig utvidelse over og under, og
    // den holder seg inne i bannerets luft.
    const { top, bottom } = retry.props.hitSlop as { top: number; bottom: number };
    const size = StyleSheet.flatten(text.props.style).fontSize as number;
    expect(top + size * INTER_LINE + bottom).toBeGreaterThanOrEqual(TAP);
    const bannerPadding = StyleSheet.flatten(themeFor('light').ui.banner).padding as number;
    expect(Math.max(top, bottom)).toBeLessThanOrEqual(bannerPadding);

    await fireEvent.press(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
