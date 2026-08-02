import { describe, it, expect } from 'vitest';
import { pickCaptainRequest, pickPendingInvitation } from './captainLookup';

/**
 * Type A — ren utvalgs-logikk for hvilken kaptein en e-post-invitert
 * medspiller hører til (#1343). Radene kommer alltid sortert nyest først
 * (`order created_at desc` i kallende query), så «fallback» = rows[0].
 */

const NEWEST = {
  id: 'req-newest',
  user_id: 'captain-newest',
  team_name: 'Lag Sist',
  status: 'pending' as const,
};
const OLDER = {
  id: 'req-older',
  user_id: 'captain-older',
  team_name: 'Lag Først',
  status: 'approved' as const,
};

describe('pickCaptainRequest', () => {
  it('velger invited_by-kapteinen selv om en annen kaptein er nyere', () => {
    const picked = pickCaptainRequest([NEWEST, OLDER], OLDER.user_id);
    expect(picked).toEqual({ row: OLDER, source: 'invited_by' });
  });

  it('faller tilbake til nyeste rad når invited_by ikke er kaptein', () => {
    const picked = pickCaptainRequest([NEWEST, OLDER], 'arrangor-uten-lag');
    expect(picked).toEqual({ row: NEWEST, source: 'fallback' });
  });

  it('faller tilbake til nyeste rad når invited_by mangler', () => {
    expect(pickCaptainRequest([NEWEST, OLDER], null)).toEqual({
      row: NEWEST,
      source: 'fallback',
    });
  });

  it('gir null når spillet ikke har noen kaptein-rader', () => {
    expect(pickCaptainRequest([], OLDER.user_id)).toBeNull();
  });
});

/**
 * Type A — hvilken av flere åpne invitasjoner vi skal gå videre med (#1343).
 * Både arrangøren og en kaptein kan ha invitert samme e-post til samme spill;
 * raden fra en kaptein er den eneste som gjør laget sikkert kjent.
 */

const FROM_ORGANIZER = { id: 'inv-nyest', invited_by: 'arrangor' };
const FROM_CAPTAIN = { id: 'inv-eldre', invited_by: OLDER.user_id };

describe('pickPendingInvitation', () => {
  it('velger kapteinens invitasjon selv om arrangørens er nyere', () => {
    const picked = pickPendingInvitation(
      [FROM_ORGANIZER, FROM_CAPTAIN],
      new Set([OLDER.user_id, NEWEST.user_id]),
    );
    expect(picked).toEqual(FROM_CAPTAIN);
  });

  it('faller tilbake til nyeste invitasjon når ingen kaptein har invitert', () => {
    const picked = pickPendingInvitation(
      [FROM_ORGANIZER, { id: 'inv-eldst', invited_by: null }],
      [NEWEST.user_id],
    );
    expect(picked).toEqual(FROM_ORGANIZER);
  });

  it('gir null når det ikke finnes noen åpen invitasjon', () => {
    expect(pickPendingInvitation([], [OLDER.user_id])).toBeNull();
  });
});
