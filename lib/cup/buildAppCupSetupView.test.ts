import { describe, expect, it } from 'vitest';
import { buildAppCupParticipantsView, buildAppCupSetupView } from './buildAppCupSetupView';

/** Type A (#2752): det veiviseren og spillerlista får, ren funksjon av radene. */

const CUP = { id: 'cup', name: 'Cup', status: 'draft', team_1_name: 'Nord', team_2_name: 'Sør' };

describe('buildAppCupSetupView', () => {
  const plan = {
    course_id: 'bane',
    tee_box_id: 'tee',
    scheduled_tee_off_at: null,
    preset_id: null,
    custom_sessions: null,
    strategy: null,
    best_ball_allowance_pct: null,
  };

  it('en plan uten verdier får samme standard som skjemaet på nettet', () => {
    expect(buildAppCupSetupView(CUP, plan, []).plan).toEqual({
      courseId: 'bane',
      teeBoxId: 'tee',
      teeOffAt: null,
      presetId: 'klassisk',
      customSessions: null,
      strategy: 'handicap',
      bestBallAllowancePct: null,
    });
  });

  it('sammensatte økter følger med bare for «tilpasset», og uten ukjente format', () => {
    const custom = { ...plan, preset_id: 'tilpasset', custom_sessions: ['singles_matchplay', 'ukjent'] };
    expect(buildAppCupSetupView(CUP, custom, []).plan?.customSessions).toEqual(['singles_matchplay']);
    const preset = { ...plan, preset_id: 'singler', custom_sessions: ['singles_matchplay'] };
    expect(buildAppCupSetupView(CUP, preset, []).plan?.customSessions).toBeNull();
  });

  it('plassene på samme hull blir én rad med antall', () => {
    const rows = [
      { kind: 'ld' as const, holeNumber: 9, points: 1, maxPerTeam: null },
      { kind: 'ld' as const, holeNumber: 9, points: 1, maxPerTeam: null },
    ];
    expect(buildAppCupSetupView(CUP, null, rows).sideAwards).toEqual([
      { kind: 'ld', holeNumber: 9, points: 1, winnerCount: 2 },
    ]);
  });
});

describe('buildAppCupParticipantsView', () => {
  it('den som står på lista, står ikke blant kandidatene', () => {
    const view = buildAppCupParticipantsView({
      cup: { ...CUP, short_id: 'abcd2345' },
      cap: 40,
      participants: [{ userId: 'a', name: 'A', hcpIndex: 1, isCaptain: false }],
      candidates: [
        { userId: 'a', name: 'A', hcpIndex: 1, pending: false },
        { userId: 'b', name: 'B', hcpIndex: 2, pending: true },
      ],
    });
    expect(view.candidates.map((c) => c.userId)).toEqual(['b']);
    expect(view).toMatchObject({ shortId: 'abcd2345', cap: 40, team1Name: 'Nord' });
  });
});
