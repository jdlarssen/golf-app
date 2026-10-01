import { describe, expect, it } from 'vitest';
import type { GameMode } from '@/lib/scoring/modes/types';
import noMessages from '@/messages/no.json';
import enMessages from '@/messages/en.json';
import { fitsPlayerCount, soloPlayerCap } from '@/lib/wizard/fitsPlayerCount';
import { rotationSlotRange } from '@/lib/games/assignRotationSlots';
import { buildGameInsertPayload } from '@/lib/games/gamePayload';
import {
  START_COUNT_MODES,
  START_COUNT_RANGES,
  startPlayerCountRange,
  type StartCountMode,
} from '@/lib/games/startPlayerCount';

describe('startPlayerCountRange (#2071)', () => {
  it.each([
    ['wolf', 3, 5],
    ['round_robin', 4, 4],
    ['acey_deucey', 4, 4],
    ['nines', 3, 3],
    ['nassau', 2, 16],
    ['skins', 2, 16],
    ['bingo_bango_bongo', 2, 16],
  ] as const)('%s → %i–%i', (mode, min, max) => {
    expect(startPlayerCountRange(mode)).toEqual({ min, max });
  });

  it.each(['stableford', 'singles_matchplay', 'texas_scramble', 'fourball_matchplay'])(
    '%s har ingen startgrense',
    (mode) => {
      expect(startPlayerCountRange(mode)).toBeNull();
    },
  );

  it('lista over formater har samme sju som hjelperen gir område for', () => {
    expect([...START_COUNT_MODES].sort()).toEqual(
      [
        'acey_deucey',
        'bingo_bango_bongo',
        'nassau',
        'nines',
        'round_robin',
        'skins',
        'wolf',
      ].sort(),
    );
  });
});

// Felle 4: grensen lever i startvakta, veiviser-filteret og påmeldingstaket.
// Endres én av dem alene, blir denne rød.
describe('startPlayerCountRange samsvarer med fitsPlayerCount og soloPlayerCap', () => {
  it.each([...START_COUNT_MODES])('%s', (mode) => {
    const range = startPlayerCountRange(mode);
    expect(range).not.toBeNull();
    const { min, max } = range!;
    for (let n = 1; n <= 17; n++) {
      expect({ n, fits: fitsPlayerCount(mode as GameMode, n) }).toEqual({
        n,
        fits: n >= min && n <= max,
      });
    }
    const cap = soloPlayerCap(mode as GameMode);
    if (cap !== null) expect(max).toBe(cap);
  });

  it('rotationSlotRange leser de samme tallene for wolf og round_robin', () => {
    expect(rotationSlotRange('wolf')).toEqual(startPlayerCountRange('wolf'));
    expect(rotationSlotRange('round_robin')).toEqual(
      startPlayerCountRange('round_robin'),
    );
    expect(rotationSlotRange('acey_deucey')).toBeNull();
    expect(rotationSlotRange('nines')).toBeNull();
  });
});

// #2222: publiseringen er det fjerde laget. Den leste egne slot-tall (6, 8, 17)
// og egne grenser, så et hevet tak i hjemmet ble stoppet her uten at noen
// test merket det.
function publishFd(mode: string, n: number): FormData {
  const data = new FormData();
  data.set('name', 'Testrunden');
  data.set('course_id', 'c1');
  data.set('tee_box_id', 't1');
  data.set('game_mode', mode);
  data.set('registration_mode', 'invite_only');
  if (mode === 'round_robin') data.set('round_robin_allowance_pct', '85');
  for (let i = 0; i < n; i++) data.set(`player_${i}_id`, `player-${i}`);
  return data;
}

describe('publiseringen leser samme grense som startvakta (#2222)', () => {
  const cases = START_COUNT_MODES.flatMap((mode) => {
    const { min, max } = startPlayerCountRange(mode)!;
    return [
      [mode, min - 1, 'min_players_for_mode'],
      [mode, min, null],
      [mode, max, null],
      [mode, max + 1, 'too_many_players_for_mode'],
    ] as const;
  });

  it.each(cases)('%s med %i spillere → %s', (mode, n, expected) => {
    const payload = buildGameInsertPayload(publishFd(mode, n), 'publish');
    if (expected === null) {
      expect(payload.errorCode).toBeUndefined();
      expect(payload.players).toHaveLength(n);
    } else {
      expect(payload.errorCode).toBe(expected);
    }
  });
});

// #2222: veiviser- og startmeldingene har tallene skrevet i teksten. De kan
// ikke lese hjemmet (appen er låst tegn for tegn mot no.json), så her låses de.
// En melding som oppgir hele spennet («3 til 5», «2–16»), må ha begge tallene;
// en som bare oppgir taket («maks 16», «nøyaktig 4»), bare taket.
const TOO_MANY_KEY: Record<StartCountMode, string> = {
  wolf: 'wolfTooMany',
  nassau: 'nassauTooMany',
  skins: 'skinsTooMany',
  bingo_bango_bongo: 'bbbTooMany',
  nines: 'ninesTooMany',
  round_robin: 'rrTooMany',
  acey_deucey: 'aceyTooMany',
};

describe('tallene i copyen følger START_COUNT_RANGES (#2222)', () => {
  const locales = [
    ['no', noMessages],
    ['en', enMessages],
  ] as const;

  const cases = START_COUNT_MODES.flatMap((mode) => {
    const { min, max } = START_COUNT_RANGES[mode];
    const span = min === max ? [max] : [min, max];
    return locales.flatMap(([locale, messages]) => {
      const missing = messages.wizard.form.missing as Record<string, string>;
      const errors = messages.admin.game.errors as Record<string, string>;
      const rows: [string, string, number[], string][] = [
        [
          locale,
          `wizard.form.missing.${TOO_MANY_KEY[mode]}`,
          mode === 'wolf' ? span : [max],
          missing[TOO_MANY_KEY[mode]],
        ],
        [
          locale,
          `admin.game.errors.rotation_player_count_${mode}`,
          span,
          errors[`rotation_player_count_${mode}`],
        ],
      ];
      if (mode === 'wolf') {
        rows.push([locale, 'wizard.form.missing.wolfUnderMin', [min], missing.wolfUnderMin]);
      }
      return rows;
    });
  });

  it.each(cases)('%s: %s nevner %j', (_locale, _key, numbers, text) => {
    for (const n of numbers) expect(text).toContain(String(n));
  });
});

// Varselet og banneret leser tekstene sine fra messages; en format-setning som
// mangler, gir arrangøren den generelle teksten i stedet.
describe('meldingene for startvakta (#2071)', () => {
  it.each([...START_COUNT_MODES])('%s har format-setning på norsk og engelsk', (mode) => {
    const key = `rotation_player_count_${mode}`;
    for (const messages of [noMessages, enMessages]) {
      const errors = messages.admin.game.errors as Record<string, string>;
      expect(errors[key]).toContain('{count}');
    }
  });

  it('varselårsaken nevner ikke rotasjon — den gjelder flere formater', () => {
    expect(noMessages.inbox.blockReasons.rotation_player_count).not.toMatch(
      /rotasjon/i,
    );
    expect(enMessages.inbox.blockReasons.rotation_player_count).not.toMatch(
      /rotation/i,
    );
  });
});
