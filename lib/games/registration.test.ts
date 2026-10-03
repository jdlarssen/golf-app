import { describe, it, expect } from 'vitest';
import {
  gameModeSupportsTeams,
  isClubTournament,
  isDiscoverableRegistrationMode,
  isRegistrationMode,
  isRegistrationType,
  REGISTRATION_MODES,
  rosterOptionalAtPublish,
  type RegistrationMode,
  type RegistrationType,
} from './registration';

describe('gameModeSupportsTeams', () => {
  it('returns true for best_ball', () => {
    expect(gameModeSupportsTeams('best_ball')).toBe(true);
  });

  it('returns true for texas_scramble', () => {
    expect(gameModeSupportsTeams('texas_scramble')).toBe(true);
  });

  // #640 item 5: lag-påmelding utvidet fra best ball + Texas til hele lag-grid-
  // familien (scramble-familien + shamble + patsome). Admin fordeler fortsatt
  // lag i steg 4, men «meld på som lag» gir nå mening for alle disse.
  it.each([
    'ambrose',
    'florida_scramble',
    'shamble',
    'patsome',
  ] as const)('returns true for team-grid format %s', (mode) => {
    expect(gameModeSupportsTeams(mode)).toBe(true);
  });

  it('returns false for stableford (solo-modus i v1)', () => {
    expect(gameModeSupportsTeams('stableford')).toBe(false);
  });

  it('returns false for singles_matchplay (1v1, ikke lag-påmelding)', () => {
    expect(gameModeSupportsTeams('singles_matchplay')).toBe(false);
  });

  // Matchplay-familien er lag-format (formatPlayStyle === 'team' for 2v2-
  // variantene), men lag-påmelding gjøres via sider (matchplaySides), ikke
  // den generiske team-registreringen. Hold dem ute så vi ikke regresserer.
  it.each([
    'fourball_matchplay',
    'foursomes_matchplay',
    'greensome_matchplay',
    'chapman_matchplay',
    'gruesome_matchplay',
  ] as const)('returns false for matchplay-family %s', (mode) => {
    expect(gameModeSupportsTeams(mode)).toBe(false);
  });

  it('returns false for solo_strokeplay', () => {
    expect(gameModeSupportsTeams('solo_strokeplay')).toBe(false);
  });
});

describe('isRegistrationMode', () => {
  it('accepts the three valid values', () => {
    expect(isRegistrationMode('invite_only')).toBe(true);
    expect(isRegistrationMode('manual_approval')).toBe(true);
    expect(isRegistrationMode('open')).toBe(true);
  });

  it('rejects unknown values', () => {
    expect(isRegistrationMode('public')).toBe(false);
    expect(isRegistrationMode('')).toBe(false);
    expect(isRegistrationMode(null)).toBe(false);
    expect(isRegistrationMode(undefined)).toBe(false);
    expect(isRegistrationMode(42)).toBe(false);
  });
});

describe('isRegistrationType', () => {
  it('accepts the three valid values', () => {
    expect(isRegistrationType('solo')).toBe(true);
    expect(isRegistrationType('team')).toBe(true);
    expect(isRegistrationType('both')).toBe(true);
  });

  it('rejects unknown values', () => {
    expect(isRegistrationType('group')).toBe(false);
    expect(isRegistrationType('')).toBe(false);
    expect(isRegistrationType(null)).toBe(false);
    expect(isRegistrationType(undefined)).toBe(false);
    expect(isRegistrationType(0)).toBe(false);
  });
});

describe('isDiscoverableRegistrationMode', () => {
  // Speiler getDiscoverableGames-filteret (#357): open + manual_approval
  // oppdages i «Finn turneringer», invite_only er privat.
  it('open og manual_approval er oppdagbare', () => {
    expect(isDiscoverableRegistrationMode('open')).toBe(true);
    expect(isDiscoverableRegistrationMode('manual_approval')).toBe(true);
  });

  it('invite_only er privat', () => {
    expect(isDiscoverableRegistrationMode('invite_only')).toBe(false);
  });

  it('dekker hver definerte modus (ingen modus uten klassifisering)', () => {
    // Vakt mot at en framtidig modus glemmes: hver REGISTRATION_MODE må gi
    // et eksplisitt boolsk svar, og nøyaktig invite_only skal være privat.
    const privat = REGISTRATION_MODES.filter(
      (m) => !isDiscoverableRegistrationMode(m),
    );
    expect(privat).toEqual(['invite_only']);
  });
});

describe('rosterOptionalAtPublish (#2433)', () => {
  // A club tournament with individual signup publishes without a roster: the
  // signup page lets club members straight in only when the type is 'solo'.
  // Every other invite_only game still needs its players.
  it.each([
    ['invite_only', 'solo', true, true],
    ['invite_only', 'solo', false, false],
    ['invite_only', 'team', true, false],
    ['open', 'solo', false, true],
    ['manual_approval', 'team', false, true],
    ['open', 'team', true, true],
  ] as const)(
    '%s + %s, clubScoped %s → %s',
    (registrationMode, registrationType, clubScoped, expected) => {
      expect(
        rosterOptionalAtPublish({
          registrationMode: registrationMode as RegistrationMode,
          registrationType: registrationType as RegistrationType,
          clubScoped,
        }),
      ).toBe(expected);
    },
  );
});

describe('isClubTournament (#2433)', () => {
  // A cup match in a club cup carries group_id too (insertCupMatches), so a
  // tournament id makes it a cup match, never a club tournament.
  it.each([
    ['club-1', null, true],
    ['club-1', '', true],
    ['club-1', 'cup-1', false],
    [null, null, false],
    ['', '', false],
  ] as const)('groupId %s, tournamentId %s → %s', (groupId, tournamentId, expected) => {
    expect(isClubTournament({ groupId, tournamentId })).toBe(expected);
  });
});
