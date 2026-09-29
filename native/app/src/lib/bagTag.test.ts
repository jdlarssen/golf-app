// #2256: bag-taggen — hva kortet sier om spilleren. Type A.
//
// Tekstene kommer fra `profileCopy` og låses der mot webben; her låses bare
// hvilke deler kortet setter sammen, og når.
import type { OwnProfile } from '../data/profile';
import { bagTagModel } from './bagTag';
import { PROFILE_TEXT, formatHcpNb, hcpUpdatedLine } from './profileCopy';

const NOW = new Date('2026-09-29T12:00:00.000Z');
const DAY = 86_400_000;

function profile(partial: Partial<OwnProfile> = {}): OwnProfile {
  return {
    name: 'Kari Nordmann',
    nickname: null,
    hcpIndex: 14.2,
    handicapUpdatedAt: new Date(NOW.getTime() - 3 * DAY).toISOString(),
    gender: 'ladies',
    level: 'junior',
    isAdmin: false,
    profileCompletedAt: '2026-04-12T18:00:00.000Z',
    createdAt: '2026-04-12T18:00:00.000Z',
    ...partial,
  };
}

describe('bagTagModel', () => {
  it('reads the club, name, subline, handicap and initials', () => {
    const model = bagTagModel(profile(), 'Losby GK', NOW);
    expect(model).toEqual({
      kicker: 'Losby GK',
      name: 'Kari Nordmann',
      subline: `${PROFILE_TEXT.genderFemale} · ${PROFILE_TEXT.levelJunior} · med siden 2026`,
      hcpText: formatHcpNb(14.2),
      hcpAge: { stale: false, text: hcpUpdatedLine('26. sep') },
      initials: 'KN',
    });
  });

  it('falls back to Tørny without a club', () => {
    expect(bagTagModel(profile(), null, NOW).kicker).toBe(PROFILE_TEXT.bagTagFallbackKicker);
    expect(bagTagModel(profile(), '   ', NOW).kicker).toBe(PROFILE_TEXT.bagTagFallbackKicker);
  });

  it.each([
    ['men, adult level', { gender: 'mens', level: 'normal' }, `${PROFILE_TEXT.genderMale} · med siden 2026`],
    ['senior, no gender', { gender: null, level: 'senior' }, `${PROFILE_TEXT.levelSenior} · med siden 2026`],
    ['unknown values', { gender: 'x', level: 'y' }, 'med siden 2026'],
    ['no join date', { gender: null, level: null, createdAt: null }, ''],
    ['unreadable join date', { gender: 'ladies', level: null, createdAt: 'ikke en dato' }, PROFILE_TEXT.genderFemale],
  ] as const)('skips the parts that are not set: %s', (_label, partial, subline) => {
    expect(bagTagModel(profile(partial), null, NOW).subline).toBe(subline);
  });

  it('says «Voksen» nowhere on the card', () => {
    expect(bagTagModel(profile({ level: 'normal' }), null, NOW).subline).not.toContain(
      PROFILE_TEXT.levelAdult,
    );
  });

  it('marks a handicap older than a month as stale', () => {
    const model = bagTagModel(
      profile({ handicapUpdatedAt: new Date(NOW.getTime() - 40 * DAY).toISOString() }),
      null,
      NOW,
    );
    expect(model.hcpAge).toEqual({ stale: true, text: PROFILE_TEXT.hcpStaleShort });
  });

  it('shows no handicap for a profile that was never completed, not the default 54', () => {
    const model = bagTagModel(profile({ hcpIndex: 54, profileCompletedAt: null }), null, NOW);
    expect(model.hcpText).toBeNull();
    expect(model.hcpAge).toBeNull();
  });

  it('shows a plus handicap with its sign', () => {
    expect(bagTagModel(profile({ hcpIndex: -1.5 }), null, NOW).hcpText).toBe('+1,5');
  });

  it('uses the e-mail when there is no name, like the rest of the profile', () => {
    const model = bagTagModel(profile({ name: '  ' }), null, NOW, 'kari@example.com');
    expect(model.name).toBe('kari@example.com');
    expect(model.initials).toBe('K');
  });

  it('falls back to the literal when there is neither name nor e-mail', () => {
    const model = bagTagModel(profile({ name: null }), null, NOW, null);
    expect(model.name).toBe(PROFILE_TEXT.displayNameFallback);
  });
});
