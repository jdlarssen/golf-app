// #2752: ordlyden er nettets der de to sier det samme, og tallene skrives likt.
import { formatPoints } from '../../../../lib/cup/formatPoints';
import { CUP_TEXT, contributionLine, cupPoints, homeCupLine, matchOutcomeLine, matchScore, matchStatusLabel, pointsHeader } from './cupCopy';
import source from '../../../../messages/no.json';

const web = source.cup;

describe('ordlyden er nettets', () => {
  it.each<[keyof typeof CUP_TEXT, string]>([
    ['firstTo', web.public.firstTo],
    ['pointsPendingDraft', web.public.pointsPendingDraft],
    ['pointsPendingActive', web.public.pointsPendingActive],
    ['matchesSummary', web.public.matchesSummary],
    ['noMatches', web.public.noMatches],
    ['resultsPending', web.public.resultsPending],
    ['sideAwardPoints', web.public.sideAwardPoints],
    ['matchInProgress', web.public.matchInProgress],
    ['matchDraft', web.public.matchDraft],
    ['matchPlayed', web.public.matchPlayed],
    ['matchScorecardsSubmitted', web.public.matchScorecardsSubmitted],
    ['matchDecidedHalved', web.public.matchDecidedHalved],
    ['matchDecidedWalkover', web.public.matchDecidedWalkover],
    ['matchPlayOnPending', web.public.matchPlayOnPending],
    ['matchSoloPlayOn', web.public.matchSoloPlayOn],
    ['matchFallback', web.matchFallback],
    ['mot', web.manage.mot],
    ['matchesHeading', web.manage.matchesHeading],
    ['winner', web.results.winner],
    ['tied', web.results.tied],
    ['playerPointsHeading', web.results.playerPointsHeading],
    ['yourPoints', web.results.yourPoints],
    ['wonAgainst', web.results.wonAgainst],
    ['tiedWith', web.results.tiedWith],
    ['sideContribution', web.results.sideContribution],
    ['awardsHeading', web.results.awardsHeading],
    ['mvpLabel', web.results.mvpLabel],
    ['mvpValue', web.results.mvpValue],
    ['underperformerLabel', web.results.underperformerLabel],
    ['underperformerValue', web.results.underperformerValue],
    ['matchTied', web.results.matchTied],
    ['resultTo', web.results.resultTo],
    ['sideAwardsHeading', web.results.sideAwardsHeading],
    ['sideAwardsHint', web.results.sideAwardsHint],
    ['sideAwardWinnerOnTeam', web.results.sideAwardWinnerOnTeam],
    ['sideAwardNoWinner', web.results.sideAwardNoWinner],
    ['sideAwardUnregistered', web.results.sideAwardUnregistered],
    ['sideAwardPlus', web.results.sideAwardPoints],
    ['sideAwardGirTeam', web.results.sideAwardGirTeam],
    ['kindCtp', web.sideAwards.kindCtp],
    ['kindLd', web.sideAwards.kindLd],
    ['kindGir', web.sideAwards.kindGir],
    ['holeShort', web.sideAwards.holeShort],
    ['slotOfCount', web.sideAwards.slotOfCount],
    ['withdrawnChip', web.manage.withdrawnChip],
    ['gameLink', source.game.home.cupStandings],
  ])('%s', (key, text) => {
    expect(CUP_TEXT[key]).toBe(text);
  });
});

describe('tallene', () => {
  it.each([0, 0.5, 1, 2.5, 14.5, 100])('%s skrives som nettets formatPoints', (value) => {
    expect(cupPoints(value)).toBe(formatPoints(value, 'no'));
  });
});

describe('linjene', () => {
  it('poengmålet, eller hva som gjelder før det finnes', () => {
    expect(pointsHeader(14.5, 'active')).toBe('Først til 14,5 poeng vinner');
    expect(pointsHeader(null, 'active')).toBe(CUP_TEXT.pointsPendingActive);
    expect(pointsHeader(null, 'draft')).toBe(CUP_TEXT.pointsPendingDraft);
    expect(pointsHeader(null, 'finished')).toBeNull();
  });

  it('linja på Hjem', () => {
    expect(homeCupLine('active', { played: 3, total: 8 })).toBe('3 av 8 matcher spilt');
    expect(homeCupLine('draft', { played: 0, total: 0 })).toBe('Ikke startet ennå');
    expect(homeCupLine('active', null)).toBe('Fikk ikke lest kampene');
  });

  it('statusen setter inn hvem som trakk seg og hvem som fikk kampen', () => {
    const base = { withdrawnName: 'Kari', walkoverTeam: 'Team Nord' };
    expect(matchStatusLabel({ ...base, status: 'decidedWalkover' })).toBe('Walkover til Team Nord — Kari trakk seg');
    expect(matchStatusLabel({ ...base, status: 'decidedHalved' })).toBe('Halvert — Kari trakk seg');
    expect(matchStatusLabel({ ...base, status: 'playOnPending' })).toBe('Valg venter — Kari trakk seg');
    expect(matchStatusLabel({ ...base, status: 'played' })).toBe('Spilt');
  });

  it('utfallet på et kampkort', () => {
    const won = { points1: 1, points2: 0, tied: false, formatted: '3&2', winnerName: 'Team Nord' };
    expect(matchOutcomeLine(won)).toBe('3&2 til Team Nord');
    expect(matchScore(won)).toBe('1–0');
    expect(matchOutcomeLine({ ...won, tied: true, winnerName: null })).toBe('Delt (AS)');
    expect(matchScore({ ...won, points1: 0.5, points2: 0.5 })).toBe('0,5–0,5');
    expect(matchOutcomeLine(null)).toBeNull();
    expect(matchOutcomeLine({ ...won, formatted: null })).toBeNull();
  });

  it('hva spilleren fikk poeng for', () => {
    expect(
      contributionLine({ type: 'match', gameId: 'g', matchLabel: null, opponentLabel: 'Kari', outcome: 'won', points: 1 }),
    ).toBe('Vant mot Kari · +1');
    expect(
      contributionLine({ type: 'match', gameId: 'g', matchLabel: null, opponentLabel: 'Kari', outcome: 'tied', points: 0.5 }),
    ).toBe('Delte med Kari · +0,5');
    expect(contributionLine({ type: 'ctp', holeNumber: 7, points: 1 })).toBe('Nærmest pinnen, hull 7 · +1');
  });
});
