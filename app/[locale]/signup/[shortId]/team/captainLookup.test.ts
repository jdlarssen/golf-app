import { describe, it, expect } from 'vitest';
import { pickCaptainRequest } from './captainLookup';

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
