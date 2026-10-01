// Force a non-Oslo host TZ: Vercel runs UTC, and the card must still show the
// Oslo wall clock (#2270 — 09:20 read as 07:20 on the server).
process.env.TZ = 'UTC';

import { describe, expect, it } from 'vitest';
import { invitationWhen } from './invitationCard';

describe('invitationWhen (#2266)', () => {
  it('summer time: 07:20Z is 09:20 on the Oslo Saturday', () => {
    expect(invitationWhen('2026-10-03T07:20:00Z', 'no')).toEqual({
      weekday: 'lørdag',
      date: '3. okt',
      time: '09:20',
    });
  });

  it('winter time: 08:20Z is 09:20 on the Oslo Saturday', () => {
    expect(invitationWhen('2026-11-14T08:20:00Z', 'no')).toEqual({
      weekday: 'lørdag',
      date: '14. nov',
      time: '09:20',
    });
  });

  it('the Oslo date wins when UTC is still the day before', () => {
    expect(invitationWhen('2026-10-03T22:30:00Z', 'no')).toEqual({
      weekday: 'søndag',
      date: '4. okt',
      time: '00:30',
    });
  });

  it('English gives an English weekday', () => {
    expect(invitationWhen('2026-10-03T07:20:00Z', 'en')).toEqual({
      weekday: 'Saturday',
      date: '3 Oct',
      time: '09:20',
    });
  });

  it('no tee-off or an unparseable one gives null', () => {
    expect(invitationWhen(null, 'no')).toBeNull();
    expect(invitationWhen('not-a-date', 'no')).toBeNull();
  });
});
