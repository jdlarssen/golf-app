import { describe, it, expect } from 'vitest';
import {
  evaluateCupJoin,
  evaluateCupLeave,
  type CupJoinDecision,
  type CupJoinFacts,
  type CupLeaveDecision,
} from './joinValidation';
import { MAX_PERSONAL_CUP_PLAYERS } from './limits';

/**
 * Tilstandstabellen for selvpåmelding via delbar lenke (#1490). Ren beslutning:
 * ingen DB, ingen session — kalleren samler fakta, denne avgjør.
 *
 * Capet leses fra `lib/cup/limits` (regelens ene hjem, #526), aldri som et tall
 * skrevet inn her — ellers ville en heving av taket latt testen bli stående grønn
 * på det gamle.
 */

/** Påmeldbar draft-cup uten klubb, skapt av en vanlig bruker. */
function facts(overrides: Partial<CupJoinFacts> = {}): CupJoinFacts {
  return {
    cupExists: true,
    status: 'draft',
    groupId: null,
    creatorIsAdmin: false,
    profileCompleted: true,
    isClubMember: false,
    participantCount: 0,
    alreadyJoined: false,
    ...overrides,
  };
}

const AT_CAP = MAX_PERSONAL_CUP_PLAYERS;
const BELOW_CAP = MAX_PERSONAL_CUP_PLAYERS - 1;

describe('evaluateCupJoin', () => {
  it.each<[string, Partial<CupJoinFacts>, CupJoinDecision]>([
    ['ukjent lenke', { cupExists: false }, 'not_found'],
    ['cupen er startet', { status: 'active' }, 'closed'],
    ['cupen er avsluttet', { status: 'finished' }, 'closed'],
    ['påmeldbar personlig cup', {}, 'can_join'],
    ['allerede påmeldt', { alreadyJoined: true }, 'already_joined'],
    ['profil ikke fullført', { profileCompleted: false }, 'profile_incomplete'],
    [
      'klubb-cup, ikke medlem',
      { groupId: 'club-1', isClubMember: false },
      'not_member',
    ],
    [
      'klubb-cup, medlem',
      { groupId: 'club-1', isClubMember: true },
      'can_join',
    ],
    [
      'personlig cup ett under taket',
      { participantCount: BELOW_CAP },
      'can_join',
    ],
    ['personlig cup på taket', { participantCount: AT_CAP }, 'full'],
    [
      'admin-skapt personlig cup er uten tak',
      { participantCount: AT_CAP, creatorIsAdmin: true },
      'can_join',
    ],
    [
      'klubb-cup er uten tak',
      { groupId: 'club-1', isClubMember: true, participantCount: AT_CAP },
      'can_join',
    ],
  ])('%s → %s', (_name, overrides, expected) => {
    expect(evaluateCupJoin(facts(overrides))).toBe(expected);
  });

  // Rekkefølgen mellom vaktene er selve kontrakten: en spiller som ALLEREDE er
  // påmeldt skal se avmeldingsveien sin, ikke «cupen er full» eller «kun for
  // medlemmer» — men en stengt cup slår alt, for da finnes ingen vei videre.
  it.each<[string, Partial<CupJoinFacts>, CupJoinDecision]>([
    [
      'påmeldt i en cup som har passert taket',
      { alreadyJoined: true, participantCount: AT_CAP },
      'already_joined',
    ],
    [
      'påmeldt, men ikke lenger klubbmedlem',
      { alreadyJoined: true, groupId: 'club-1', isClubMember: false },
      'already_joined',
    ],
    [
      'påmeldt i en startet cup',
      { alreadyJoined: true, status: 'active' },
      'closed',
    ],
    [
      'ufullstendig profil i en full cup',
      { profileCompleted: false, participantCount: AT_CAP },
      'profile_incomplete',
    ],
  ])('vaktrekkefølge: %s → %s', (_name, overrides, expected) => {
    expect(evaluateCupJoin(facts(overrides))).toBe(expected);
  });
});

describe('evaluateCupLeave', () => {
  it.each<[string, Partial<CupJoinFacts>, CupLeaveDecision]>([
    ['ukjent lenke', { cupExists: false, alreadyJoined: true }, 'not_found'],
    ['cupen er startet', { status: 'active', alreadyJoined: true }, 'closed'],
    ['ikke påmeldt', { alreadyJoined: false }, 'not_joined'],
    ['påmeldt i utkast', { alreadyJoined: true }, 'can_leave'],
  ])('%s → %s', (_name, overrides, expected) => {
    expect(evaluateCupLeave(facts(overrides))).toBe(expected);
  });

  // Avmelding bryr seg ikke om profil, medlemskap eller tak — de vaktene
  // beskytter kun veien INN. En spiller skal alltid komme seg ut av en
  // utkast-cup hun står i.
  it('slipper ut selv om join-vaktene ville avvist en ny påmelding', () => {
    expect(
      evaluateCupLeave(
        facts({
          alreadyJoined: true,
          profileCompleted: false,
          groupId: 'club-1',
          isClubMember: false,
          participantCount: AT_CAP,
        }),
      ),
    ).toBe('can_leave');
  });
});
