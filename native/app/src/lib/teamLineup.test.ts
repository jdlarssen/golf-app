// #2840: oppstillingen i lagskjemaet og hvem i svaret som er deg (Type A).
import type { AppTeamSignupMember } from '../../../../lib/games/appRoundInviteView';
import {
  emptySlots,
  openSlotCount,
  pickedIds,
  placeInSlots,
  removeFromSlots,
  selfMemberIndex,
} from './teamLineup';

describe('plassene', () => {
  it.each([
    [4, 3],
    [2, 1],
    [1, 0],
    [0, 0],
  ])('et lag på %i har %i plasser etter deg', (teamSize, count) => {
    expect(emptySlots(teamSize)).toEqual(Array(count).fill(null));
  });

  it('en venn går til første ledige plass fra venstre', () => {
    expect(placeInSlots([null, null, null], 'ola')).toEqual({ slots: ['ola', null, null], index: 0 });
    expect(placeInSlots(['ola', null, 'per'], 'kari')).toEqual({ slots: ['ola', 'kari', 'per'], index: 1 });
  });

  it('et fullt lag og en venn som alt står der, gir ingen plass', () => {
    expect(placeInSlots(['ola', 'kari'], 'per')).toBeNull();
    expect(placeInSlots(['ola', null], 'ola')).toBeNull();
  });

  it('en venn ut gir en ledig plass, og de andre blir stående', () => {
    expect(removeFromSlots(['ola', 'kari', 'per'], 'kari')).toEqual(['ola', null, 'per']);
    expect(removeFromSlots(['ola', null], 'ingen')).toEqual(['ola', null]);
  });

  it('teller de ledige og gir de valgte fra venstre', () => {
    expect(openSlotCount(['ola', null, null])).toBe(2);
    expect(pickedIds([null, 'kari', 'ola'])).toEqual(['kari', 'ola']);
  });
});

describe('hvem på laget som er deg', () => {
  const captain: AppTeamSignupMember = { name: 'Kari Nord', isCaptain: true, status: 'pending' };
  const ola: AppTeamSignupMember = { name: 'Ola Kompis', isCaptain: false, status: 'approved' };
  const me: AppTeamSignupMember = { name: 'Martin Berg', isCaptain: false, status: 'pending' };
  const per: AppTeamSignupMember = { name: 'Per Hansen', isCaptain: false, status: 'pending' };
  const self = { name: 'Martin Berg', email: 'martin@example.com' };

  it('den eneste som ikke har svart, er deg, også uten navn', () => {
    expect(selfMemberIndex([captain, ola, me], { name: null, email: null })).toBe(2);
  });

  it('med flere som ikke har svart, er det navnet ditt som avgjør', () => {
    expect(selfMemberIndex([captain, ola, me, per], self)).toBe(2);
  });

  it('uten navn er det den maskerte adressen andre ser', () => {
    const masked: AppTeamSignupMember = { name: 'ma•••@example.com', isCaptain: false, status: 'pending' };
    expect(selfMemberIndex([captain, per, masked], { name: null, email: 'martin@example.com' })).toBe(2);
  });

  it.each([
    ['to med samme navn', [captain, me, { ...me }]],
    ['ingen med navnet ditt', [captain, per, { ...per, name: 'Ingrid Næss' }]],
    ['ingen som venter', [captain, ola]],
  ])('%s: ingen er merket', (_label, members) => {
    expect(selfMemberIndex(members as AppTeamSignupMember[], self)).toBe(-1);
  });
});
