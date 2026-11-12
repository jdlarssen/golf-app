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
  const captain: AppTeamSignupMember = { name: 'Kari Nord', isCaptain: true, isYou: false, status: 'pending' };
  const ola: AppTeamSignupMember = { name: 'Ola Kompis', isCaptain: false, isYou: false, status: 'approved' };
  const me: AppTeamSignupMember = { name: 'Martin Berg', isCaptain: false, isYou: true, status: 'pending' };
  const per: AppTeamSignupMember = { name: 'Per Hansen', isCaptain: false, isYou: false, status: 'pending' };

  it('#2840: serveren sier hvem som er deg, også når to har samme navn', () => {
    expect(selfMemberIndex([captain, { ...per, name: 'Martin Berg' }, me])).toBe(2);
  });

  it('uten merket rad (eldre server) er ingen merket', () => {
    expect(selfMemberIndex([captain, ola, per])).toBe(-1);
  });
});
