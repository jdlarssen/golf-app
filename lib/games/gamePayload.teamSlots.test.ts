/**
 * #2673 — parseTeamSlotPlayers (Type A): slot-løkka som Texas, Ambrose,
 * Florida, shamble og patsome deler. Lag = flight, positivt heltall som lag,
 * én slot over taket. Bygget på ekte FormData — ingen mocks.
 */

import { describe, it, expect } from 'vitest';

import { parseTeamSlotPlayers } from './gamePayload';
import { MAX_TEAM_FORMAT_PLAYERS } from './teamFormatLimits';

function form(slots: Record<number, { id: string; team?: string }>): FormData {
  const fd = new FormData();
  for (const [i, { id, team }] of Object.entries(slots)) {
    fd.set(`player_${i}_id`, id);
    if (team !== undefined) fd.set(`player_${i}_team`, team);
  }
  return fd;
}

describe('parseTeamSlotPlayers', () => {
  it('returns no players for an empty form', () => {
    expect(parseTeamSlotPlayers(new FormData())).toEqual({ ok: true, players: [] });
  });

  it('sets the flight to the team, in slot order, and skips empty slots', () => {
    const result = parseTeamSlotPlayers(
      form({ 0: { id: 'a', team: '1' }, 1: { id: '' }, 3: { id: ' b ', team: '2' }, 4: { id: 'c', team: '1' } }),
    );
    expect(result).toEqual({
      ok: true,
      players: [
        { user_id: 'a', team_number: 1, flight_number: 1 },
        { user_id: 'b', team_number: 2, flight_number: 2 },
        { user_id: 'c', team_number: 1, flight_number: 1 },
      ],
    });
  });

  it('has no upper team limit', () => {
    const result = parseTeamSlotPlayers(form({ 0: { id: 'a', team: '37' } }));
    expect(result).toEqual({ ok: true, players: [{ user_id: 'a', team_number: 37, flight_number: 37 }] });
  });

  it('reads one slot past the cap, and no further', () => {
    const result = parseTeamSlotPlayers(
      form({
        [MAX_TEAM_FORMAT_PLAYERS]: { id: 'last', team: '1' },
        [MAX_TEAM_FORMAT_PLAYERS + 1]: { id: 'beyond', team: '1' },
      }),
    );
    expect(result).toEqual({
      ok: true,
      players: [{ user_id: 'last', team_number: 1, flight_number: 1 }],
    });
  });

  it('rejects a player in two slots', () => {
    const result = parseTeamSlotPlayers(form({ 0: { id: 'a', team: '1' }, 2: { id: 'a', team: '2' } }));
    expect(result).toEqual({ ok: false, errorCode: 'duplicate_player' });
  });

  it('checks the duplicate before the team of the repeated slot', () => {
    const result = parseTeamSlotPlayers(form({ 0: { id: 'a', team: '1' }, 1: { id: 'a', team: 'x' } }));
    expect(result).toEqual({ ok: false, errorCode: 'duplicate_player' });
  });

  it.each(['0', '-1', '1.5', 'x', ''])('rejects team %j', (team) => {
    expect(parseTeamSlotPlayers(form({ 0: { id: 'a', team } }))).toEqual({
      ok: false,
      errorCode: 'bad_team',
    });
  });

  it('rejects a player with no team field', () => {
    expect(parseTeamSlotPlayers(form({ 0: { id: 'a' } }))).toEqual({ ok: false, errorCode: 'bad_team' });
  });
});
