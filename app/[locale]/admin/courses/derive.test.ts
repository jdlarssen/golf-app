import { describe, it, expect } from 'vitest';
import {
  deriveLastPlayedAt,
  deriveCourseItem,
  type CourseGameRow,
  type CourseRow,
} from './derive';

function makeGame(overrides: Partial<CourseGameRow> = {}): CourseGameRow {
  return {
    status: 'finished',
    scheduled_tee_off_at: null,
    ended_at: null,
    ...overrides,
  };
}

describe('deriveLastPlayedAt', () => {
  it('returnerer null når ingen spill finnes', () => {
    expect(deriveLastPlayedAt([])).toBeNull();
  });

  it('returnerer null når kun draft og scheduled spill finnes', () => {
    const games = [
      makeGame({ status: 'draft', scheduled_tee_off_at: '2026-05-01T12:00:00Z' }),
      makeGame({ status: 'scheduled', scheduled_tee_off_at: '2026-06-01T12:00:00Z' }),
    ];
    expect(deriveLastPlayedAt(games)).toBeNull();
  });

  it('bruker ended_at for finished spill', () => {
    const games = [
      makeGame({
        status: 'finished',
        ended_at: '2026-05-12T18:30:00Z',
        scheduled_tee_off_at: '2026-05-12T14:00:00Z',
      }),
    ];
    expect(deriveLastPlayedAt(games)).toBe('2026-05-12T18:30:00Z');
  });

  it('faller tilbake til scheduled_tee_off_at når finished mangler ended_at', () => {
    const games = [
      makeGame({
        status: 'finished',
        ended_at: null,
        scheduled_tee_off_at: '2026-05-12T14:00:00Z',
      }),
    ];
    expect(deriveLastPlayedAt(games)).toBe('2026-05-12T14:00:00Z');
  });

  it('ignorerer finished spill uten både ended_at og scheduled_tee_off_at', () => {
    const games = [
      makeGame({ status: 'finished', ended_at: null, scheduled_tee_off_at: null }),
      makeGame({ status: 'finished', ended_at: '2026-04-01T12:00:00Z' }),
    ];
    expect(deriveLastPlayedAt(games)).toBe('2026-04-01T12:00:00Z');
  });

  it('bruker scheduled_tee_off_at for active spill', () => {
    const games = [
      makeGame({
        status: 'active',
        scheduled_tee_off_at: '2026-05-26T10:00:00Z',
      }),
    ];
    expect(deriveLastPlayedAt(games)).toBe('2026-05-26T10:00:00Z');
  });

  it('ignorerer active spill uten scheduled_tee_off_at', () => {
    const games = [
      makeGame({ status: 'active', scheduled_tee_off_at: null }),
      makeGame({ status: 'finished', ended_at: '2026-04-01T12:00:00Z' }),
    ];
    expect(deriveLastPlayedAt(games)).toBe('2026-04-01T12:00:00Z');
  });

  it('returnerer MAX over blandede status', () => {
    const games = [
      makeGame({ status: 'finished', ended_at: '2026-04-01T12:00:00Z' }),
      makeGame({ status: 'finished', ended_at: '2026-05-20T18:00:00Z' }),
      makeGame({ status: 'active', scheduled_tee_off_at: '2026-05-26T10:00:00Z' }),
      makeGame({ status: 'draft', scheduled_tee_off_at: '2026-12-01T12:00:00Z' }),
      makeGame({ status: 'scheduled', scheduled_tee_off_at: '2026-12-01T12:00:00Z' }),
    ];
    expect(deriveLastPlayedAt(games)).toBe('2026-05-26T10:00:00Z');
  });
});

describe('deriveCourseItem', () => {
  function makeRow(overrides: Partial<CourseRow> = {}): CourseRow {
    return {
      id: 'c1',
      name: 'Stiklestad GK',
      created_at: '2026-04-01T12:00:00Z',
      updated_at: '2026-04-01T12:00:00Z',
      tee_boxes: [],
      games: [],
      ...overrides,
    };
  }

  it('inkluderer last_played_at i avledet item', () => {
    const item = deriveCourseItem(
      makeRow({
        games: [
          makeGame({ status: 'finished', ended_at: '2026-05-12T18:00:00Z' }),
        ],
      }),
    );
    expect(item.last_played_at).toBe('2026-05-12T18:00:00Z');
  });

  it('last_played_at er null når banen aldri har vært spilt', () => {
    const item = deriveCourseItem(
      makeRow({
        games: [
          makeGame({ status: 'draft', scheduled_tee_off_at: '2026-06-01T12:00:00Z' }),
        ],
      }),
    );
    expect(item.last_played_at).toBeNull();
  });

  it('beholder eksisterende derived-felter (tee_count, has_ladies_tee, active_game_count)', () => {
    const item = deriveCourseItem(
      makeRow({
        tee_boxes: [
          {
            slope_ladies: 130,
            course_rating_ladies: 72.0,
            slope_juniors: null,
            course_rating_juniors: null,
            archived_at: null,
          },
          {
            slope_ladies: null,
            course_rating_ladies: null,
            slope_juniors: null,
            course_rating_juniors: null,
            archived_at: '2026-04-15T12:00:00Z', // arkivert — telles ikke
          },
        ],
        games: [
          makeGame({ status: 'active', scheduled_tee_off_at: '2026-05-26T10:00:00Z' }),
          makeGame({ status: 'scheduled', scheduled_tee_off_at: '2026-06-01T12:00:00Z' }),
        ],
      }),
    );
    expect(item.tee_count).toBe(1);
    expect(item.has_ladies_tee).toBe(true);
    expect(item.has_juniors_tee).toBe(false);
    expect(item.active_game_count).toBe(2); // active + scheduled
    expect(item.last_played_at).toBe('2026-05-26T10:00:00Z'); // active = sist brukt
  });
});
