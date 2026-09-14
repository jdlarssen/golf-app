// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createAdminClientMock,
  type QueryOp,
  type QueryResponse,
} from '@/lib/supabase/testing/adminClientMock';
import type { FilledRosterRow } from '@/lib/games/filledHoles';

/**
 * Type A (#2041): auto-purringen teller lagets hull, ikke bare spillerens egne
 * rader.
 *
 * Eierskaps-regelen (`filledHolesByPlayer`) har egen suite og re-asserteres
 * ikke her. Denne fila beviser koblingen: purringen henter radene regelen
 * trenger (spilleren OG lagkapteinen), og tar kravet og sender bare når tallet
 * når `expectedHoles`.
 */

const GAME_ID = 'spill-1';

/** Radene i `scores`. Hver test setter sine egne. */
let scores: { user_id: string; hole_number: number }[] = [];

function member(user_id: string, team_number: number | null): FilledRosterRow {
  return { user_id, team_number, withdrawn_at: null };
}

/** Rader for hullene `from..to` (inklusive), alle eid av `user_id`. */
function holes(user_id: string, from: number, to: number) {
  return Array.from({ length: to - from + 1 }, (_, i) => ({
    user_id,
    hole_number: from + i,
  }));
}

/** «kaptein» er lex-min og eier lagets delte rader. */
const team = [member('kaptein', 1), member('makker', 1)];

function respond(op: QueryOp): QueryResponse {
  if (op.table === 'scores') {
    // Dobbelen forstår ikke filtre, så user_id-filteret gjøres her: en henting
    // uten kapteinen skal faktisk gå glipp av kapteinens rader.
    const byUser = op.filters.filter((f) => f.column === 'user_id');
    const ids = byUser.flatMap((f) =>
      f.op === 'in' ? (f.value as string[]) : [f.value as string],
    );
    return { data: scores.filter((s) => ids.includes(s.user_id)) };
  }
  if (op.table === 'game_players' && op.kind === 'update') {
    return { data: { user_id: 'makker' } };
  }
  if (op.table === 'users') {
    return {
      data: {
        email: 'makker@example.test',
        name: 'Makker',
        locale: 'no',
        is_guest: false,
      },
    };
  }
  throw new Error(`uventet spørring: ${op.kind} ${op.table}`);
}

const fake = createAdminClientMock({ respond: (op) => respond(op) });

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => fake.client,
}));
vi.mock('./notify', () => ({
  notify: vi.fn(async () => ({ shouldAlsoSendMail: false })),
}));
vi.mock('@/lib/mail/deliverReminderNotification', () => ({
  sendDeliverReminderNotification: vi.fn(),
}));

import { notify } from './notify';
import { maybeSendDeliveryReminder } from './deliveryReminder';

const notifyMock = vi.mocked(notify);

/** Update-spørringene purringen sendte. Tom = kravet ble aldri tatt. */
function writes() {
  return fake.ops.filter((op) => op.kind === 'update');
}

beforeEach(() => {
  vi.clearAllMocks();
  fake.reset();
  scores = [];
});

describe('maybeSendDeliveryReminder — lagkort (#2041)', () => {
  it('patsome: makkeren med 6 egne rader og 12 på kapteinen purres', async () => {
    scores = [...holes('kaptein', 1, 18), ...holes('makker', 1, 6)];

    await maybeSendDeliveryReminder({
      gameId: GAME_ID,
      userId: 'makker',
      gameName: 'Tirsdagsrunden',
      players: team,
      mode: 'patsome',
    });

    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(notifyMock.mock.calls[0][0]).toMatchObject({
      userId: 'makker',
      kind: 'deliver_reminder',
    });
    // Hentingen spør etter begge id-ene, og bare etter hull med slag:
    // tellingen ser ikke `strokes` selv.
    const read = fake.ops.find((op) => op.table === 'scores');
    expect(read?.filters).toEqual(
      expect.arrayContaining([
        { op: 'eq', column: 'game_id', value: GAME_ID },
        { op: 'in', column: 'user_id', value: ['makker', 'kaptein'] },
        { op: 'not', column: 'strokes', value: null },
      ]),
    );
  });

  it('best ball: makkeren med 0 egne rader purres ikke, selv om kapteinen har 18', async () => {
    scores = holes('kaptein', 1, 18);

    await maybeSendDeliveryReminder({
      gameId: GAME_ID,
      userId: 'makker',
      gameName: 'Tirsdagsrunden',
      players: team,
      mode: 'best_ball',
    });

    expect(notifyMock).not.toHaveBeenCalled();
    expect(writes()).toEqual([]);
  });

  it('under expectedHoles: verken krav eller purring', async () => {
    scores = holes('kaptein', 1, 17);

    await maybeSendDeliveryReminder({
      gameId: GAME_ID,
      userId: 'makker',
      gameName: 'Tirsdagsrunden',
      players: team,
      mode: 'texas_scramble',
    });

    expect(notifyMock).not.toHaveBeenCalled();
    expect(writes()).toEqual([]);
  });
});
