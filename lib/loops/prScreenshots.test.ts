import { describe, expect, it } from 'vitest';
import {
  deriveTargetsFromChangedFiles,
  isVisualChange,
  MAX_SHOTS,
  type Fixtures,
} from './prScreenshots';

const FX: Fixtures = {
  gameId: 'game-1',
  finishedGameId: 'finished-1',
  courseSlug: 'miklagard',
  clubId: 'club-1',
  cupId: 'cup-1',
  ligaId: 'liga-1',
  playerId: 'player-1',
};

describe('isVisualChange', () => {
  it('er sann for app/[locale]-sider og components', () => {
    expect(isVisualChange(['app/[locale]/games/[id]/leaderboard/page.tsx'])).toBe(true);
    expect(isVisualChange(['components/hole/HoleHero.tsx'])).toBe(true);
  });

  it('er usann for backend/docs/tester', () => {
    expect(isVisualChange(['lib/loops/prCard.ts', 'docs/x.md'])).toBe(false);
    expect(isVisualChange(['components/hole/HoleHero.test.tsx'])).toBe(false);
    expect(isVisualChange(['app/api/discord/interactions/route.ts'])).toBe(false);
  });
});

describe('deriveTargetsFromChangedFiles — page-ruter', () => {
  it('utleder statisk rute fra en page.tsx', () => {
    const t = deriveTargetsFromChangedFiles(['app/[locale]/demo/page.tsx'], FX);
    expect(t).toEqual([{ path: '/demo', auth: 'none', label: 'app/[locale]/demo/page.tsx' }]);
  });

  it('mapper forsiden (app/[locale]/page.tsx → /)', () => {
    const t = deriveTargetsFromChangedFiles(['app/[locale]/page.tsx'], FX);
    expect(t[0].path).toBe('/');
    expect(t[0].auth).toBe('none');
  });

  it('stripper route-grupper: (auth)/login → /login', () => {
    const t = deriveTargetsFromChangedFiles(['app/[locale]/(auth)/login/page.tsx'], FX);
    expect(t[0].path).toBe('/login');
  });

  it('substituerer dynamiske segmenter fra fikstur', () => {
    const t = deriveTargetsFromChangedFiles(
      ['app/[locale]/games/[id]/leaderboard/page.tsx'],
      FX,
    );
    expect(t[0].path).toBe('/games/game-1/leaderboard');
    expect(t[0].auth).toBe('player');
  });

  it('mapper [id] etter kontekst (cup/liga/klubber) og [holeNumber]→1', () => {
    expect(deriveTargetsFromChangedFiles(['app/[locale]/cup/[id]/page.tsx'], FX)[0].path).toBe(
      '/cup/cup-1',
    );
    expect(deriveTargetsFromChangedFiles(['app/[locale]/liga/[id]/page.tsx'], FX)[0].path).toBe(
      '/liga/liga-1',
    );
    expect(deriveTargetsFromChangedFiles(['app/[locale]/klubber/[id]/page.tsx'], FX)[0].path).toBe(
      '/klubber/club-1',
    );
    expect(
      deriveTargetsFromChangedFiles(['app/[locale]/games/[id]/holes/[holeNumber]/page.tsx'], FX)[0]
        .path,
    ).toBe('/games/game-1/holes/1');
  });

  it('gir admin-auth for admin-ruter', () => {
    const t = deriveTargetsFromChangedFiles(['app/[locale]/admin/spillere/page.tsx'], FX);
    expect(t[0]).toMatchObject({ path: '/admin/spillere', auth: 'admin' });
  });

  it('dropper rute uten fikstur helt (baner/[slug] uten courseSlug) — ingen fallback', () => {
    const t = deriveTargetsFromChangedFiles(['app/[locale]/baner/[slug]/page.tsx'], {});
    // #1295: intetsigende forsiden-fallback fjernet — heller null bilder enn feil bilde.
    expect(t).toEqual([]);
  });

  it('dropper ukjent [id]-kontekst (lanseringer) — ingen fallback', () => {
    const t = deriveTargetsFromChangedFiles(
      ['app/[locale]/admin/lanseringer/[id]/rediger/page.tsx'],
      FX,
    );
    expect(t).toEqual([]);
  });
});

describe('deriveTargetsFromChangedFiles — komponent-familier', () => {
  it('mapper leaderboard-komponent til FERDIG spill (finishedGameId)', () => {
    const t = deriveTargetsFromChangedFiles(['components/illustrations/LeaderboardBackdrop.tsx'], FX);
    expect(t[0]).toMatchObject({ path: '/games/finished-1/leaderboard', auth: 'player' });
  });

  it('mapper samlokalisert leaderboard-tsx under app/[locale] (#1295 — formats-fila fra PR #1294)', () => {
    const t = deriveTargetsFromChangedFiles(
      ['app/[locale]/games/[id]/leaderboard/formats/stableford.tsx'],
      FX,
    );
    expect(t[0]).toMatchObject({ path: '/games/finished-1/leaderboard', auth: 'player' });
  });

  it('faller tilbake til aktivt spill når finishedGameId mangler', () => {
    const { finishedGameId: _omitted, ...withoutFinished } = FX;
    const t = deriveTargetsFromChangedFiles(
      ['components/illustrations/LeaderboardBackdrop.tsx'],
      withoutFinished,
    );
    expect(t[0].path).toBe('/games/game-1/leaderboard');
  });

  it('scorecard- og hull-familiene bruker fortsatt AKTIVT spill', () => {
    expect(
      deriveTargetsFromChangedFiles(['components/scorecard/ScorecardGrid.tsx'], FX)[0].path,
    ).toBe('/games/game-1/scorecard');
    expect(deriveTargetsFromChangedFiles(['components/hole/HoleHero.tsx'], FX)[0].path).toBe(
      '/games/game-1/holes/1',
    );
  });

  it('komponent uten game-fiksturer → ingen targets (ingen fallback)', () => {
    const t = deriveTargetsFromChangedFiles(['components/hole/HoleHero.tsx'], {});
    expect(t).toEqual([]);
  });
});

describe('deriveTargetsFromChangedFiles — dedupe, cap, ingen fallback', () => {
  it('dedupliserer sammenfallende ruter', () => {
    const t = deriveTargetsFromChangedFiles(
      [
        'components/illustrations/LeaderboardBackdrop.tsx',
        'components/podium/Podium.tsx', // begge → /games/finished-1/leaderboard
      ],
      FX,
    );
    expect(t.filter((x) => x.path === '/games/finished-1/leaderboard')).toHaveLength(1);
  });

  it(`capper til ${MAX_SHOTS}`, () => {
    const files = [
      'app/[locale]/demo/page.tsx',
      'app/[locale]/klubbhuset/page.tsx',
      'app/[locale]/innboks/page.tsx',
      'app/[locale]/finn-turneringer/page.tsx',
    ];
    expect(deriveTargetsFromChangedFiles(files, FX)).toHaveLength(MAX_SHOTS);
  });

  it('page-ruter består når en komponent-fil ikke resolverer til noen familie', () => {
    const t = deriveTargetsFromChangedFiles(
      ['app/[locale]/demo/page.tsx', 'components/layout/Weird.tsx'],
      FX,
    );
    expect(t).toHaveLength(1);
    expect(t[0].path).toBe('/demo');
  });

  it('ikke-visuell diff gir ingen targets', () => {
    expect(deriveTargetsFromChangedFiles(['lib/loops/prCard.ts'], FX)).toEqual([]);
  });
});
