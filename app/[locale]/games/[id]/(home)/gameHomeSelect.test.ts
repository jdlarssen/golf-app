import { describe, it, expect } from 'vitest';
import { GAME_HOME_SELECT } from './gameHomeSelect';

/**
 * #2164: game-home refetches the game after a visit wins the auto-start flip
 * and replaces the cached row wholesale. A column missing from that select is
 * `undefined` for the rest of the render — a missing `mode_config` crashed the
 * page (`formatDisplayLabelKey` reads `.kind`) for whoever started the round.
 */

/** Top-level column names of a PostgREST select (embeds reduced to their table). */
function topLevelColumns(select: string): string[] {
  const columns: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of select) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      columns.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  columns.push(current);
  return columns.map((c) => c.trim().split('(')[0].trim());
}

describe('GAME_HOME_SELECT', () => {
  // Every `game.*` field game-home reads after the auto-start refetch.
  const READ_AFTER_REFETCH = [
    'courses',
    'game_mode',
    'hole_segment',
    'id',
    'league_round_id',
    'mode_config',
    'name',
    'require_peer_approval',
    'scheduled_tee_off_at',
    'source_game_id',
    'status',
    'tee_boxes',
    'tournament_id',
  ];

  it.each(READ_AFTER_REFETCH)('selects %s', (column) => {
    expect(topLevelColumns(GAME_HOME_SELECT)).toContain(column);
  });

  it('keeps the tee ratings the course card reads', () => {
    expect(GAME_HOME_SELECT).toMatch(/tee_boxes\([^)]*par_total_ladies[^)]*\)/);
  });
});
