import { describe, expect, it } from 'vitest';
import noMessages from '@/messages/no.json';
import { START_COUNT_MODES } from '@/lib/games/startPlayerCount';
import { START_REFUSAL_CODES, startErrorMessageArgs } from '@/lib/games/startErrorMessage';

describe('startErrorMessageArgs (#2202)', () => {
  it.each(START_COUNT_MODES)('rotation_player_count with %s → the format key and the count', (mode) => {
    expect(startErrorMessageArgs({ code: 'rotation_player_count', mode, count: '3' })).toEqual({
      key: `rotation_player_count_${mode}`,
      values: { count: 3 },
    });
  });

  it.each([undefined, 'stableford', 'nonsense'])(
    'rotation_player_count with mode %s falls back to the bare code',
    (mode) => {
      expect(startErrorMessageArgs({ code: 'rotation_player_count', mode, count: '3' })).toEqual({
        key: 'rotation_player_count',
        values: {},
      });
    },
  );

  it('a plain code is its own key, without values', () => {
    expect(startErrorMessageArgs({ code: 'tee_missing', mode: 'wolf', count: '2' })).toEqual({
      key: 'tee_missing',
      values: {},
    });
  });

  it('a missing count reads as 0', () => {
    expect(startErrorMessageArgs({ code: 'rotation_player_count', mode: 'wolf' })).toEqual({
      key: 'rotation_player_count_wolf',
      values: { count: 0 },
    });
  });

  it('a count as a number gives the same answer as the same count as text', () => {
    expect(startErrorMessageArgs({ code: 'rotation_player_count', mode: 'nines', count: 4 })).toEqual(
      startErrorMessageArgs({ code: 'rotation_player_count', mode: 'nines', count: '4' }),
    );
  });
});

describe('START_REFUSAL_CODES (#2202, trap 4)', () => {
  const errors = noMessages.admin.game.errors as Record<string, string>;

  it.each(START_REFUSAL_CODES.filter((c) => c !== 'rotation_player_count'))(
    '%s has a text in admin.game.errors',
    (code) => {
      expect(errors[code]).toEqual(expect.any(String));
    },
  );

  it('the game page fallback «unknown» has a text', () => {
    expect(errors.unknown).toEqual(expect.any(String));
  });
});
