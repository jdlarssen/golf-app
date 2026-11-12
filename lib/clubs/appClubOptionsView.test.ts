import { describe, expect, it } from 'vitest';
import { canCreateClubGame } from '@/lib/wizard/clubChoice';
import { buildAppClubOptions, type AppClubMember, type AppClubOptionsInput } from './appClubOptionsView';

/**
 * Type A (#2753): the app's «Klubb-turnering» answer. The tile rule is the
 * web's own, so the two surfaces give the same answer for the same user (trap 4).
 */

const member = (id: string, name: string): AppClubMember => ({
  id,
  name,
  nickname: null,
  hcpIndex: 10,
  gender: 'mens',
  level: 'normal',
  pending: false,
});

const base: AppClubOptionsInput = {
  isAdmin: false,
  isClubAdmin: true,
  clubs: [
    { id: 'b', name: 'Trondheim GK', role: 'owner' },
    { id: 'a', name: 'Byneset Golfklubb', role: 'member' },
  ],
  memberIdsByClub: { a: ['me', 'u2'], b: ['me', 'u3', 'u4'] },
  members: [member('me', 'Meg Selv'), member('u2', 'Ada'), member('u3', 'Per'), member('u4', 'Kari')],
};

describe('buildAppClubOptions', () => {
  it.each([
    { isAdmin: false, isClubAdmin: false, clubs: 2 },
    { isAdmin: false, isClubAdmin: true, clubs: 2 },
    { isAdmin: true, isClubAdmin: false, clubs: 2 },
    { isAdmin: true, isClubAdmin: true, clubs: 0 },
    { isAdmin: false, isClubAdmin: true, clubs: 0 },
  ])('gir samme svar som nettets flis: %o', ({ isAdmin, isClubAdmin, clubs }) => {
    const input = { ...base, isAdmin, isClubAdmin, clubs: base.clubs.slice(0, clubs) };
    expect(buildAppClubOptions(input).canCreateClubGame).toBe(
      canCreateClubGame({ isAdmin, isClubAdmin, hasClub: clubs > 0 }),
    );
  });

  it('uten flis: ingen klubber og ingen medlemslister', () => {
    expect(buildAppClubOptions({ ...base, isClubAdmin: false })).toEqual({
      canCreateClubGame: false,
      clubs: [],
      membersByClub: {},
    });
  });

  it('klubbene står på navn, med din rolle og antall medlemmer', () => {
    expect(buildAppClubOptions(base).clubs).toEqual([
      { id: 'a', name: 'Byneset Golfklubb', role: 'member', memberCount: 2 },
      { id: 'b', name: 'Trondheim GK', role: 'owner', memberCount: 3 },
    ]);
  });

  it('medlemmene per klubb, du inkludert, på navn', () => {
    const { membersByClub } = buildAppClubOptions(base);
    expect(membersByClub.a!.map((m) => m.id)).toEqual(['u2', 'me']);
    expect(membersByClub.b!.map((m) => m.id)).toEqual(['u4', 'me', 'u3']);
  });

  it('en klubb du ikke er med i, kommer aldri med, selv om oppslaget har den', () => {
    const out = buildAppClubOptions({
      ...base,
      memberIdsByClub: { ...base.memberIdsByClub, fremmed: ['u9'] },
      members: [...base.members, member('u9', 'Fremmed')],
    });
    expect(Object.keys(out.membersByClub).sort()).toEqual(['a', 'b']);
    expect(out.clubs.map((c) => c.id)).not.toContain('fremmed');
  });

  it('en klubb uten medlemsliste får tom liste og 0, ikke en krasj', () => {
    const out = buildAppClubOptions({ ...base, memberIdsByClub: {} });
    expect(out.membersByClub).toEqual({ a: [], b: [] });
    expect(out.clubs.map((c) => c.memberCount)).toEqual([0, 0]);
  });
});
