import { describe, expect, it } from 'vitest';
import { GATHERING_WORDS, buildRoundNewsFacts, buildRoundNewsPrompt, checkRoundNews } from './roundNewsPrompt';
import type { RoundSummary } from './roundSummary';

/**
 * Type A (#2979): what the language model gets to see, and which answers are
 * thrown away. The model call itself is in `roundNews.test.ts`.
 */

const row = (userId: string, place: number, name: string | null, value: number, behind: number) => ({
  userId,
  place,
  name,
  value,
  behind,
});

const summary: RoundSummary = {
  leagueName: 'Vinterliga 2026-2027',
  roundId: 'r1',
  roundLabel: 'Runde 1',
  courseName: 'Byneset North',
  simulator: true,
  model: 'best_n',
  pointsBased: true,
  roundsPlayed: 1,
  roundsTotal: 10,
  countingRounds: 8,
  playersInLeague: 5,
  playedThisRound: 4,
  round: [row('ole', 1, 'Ole H.', 44, 0), row('lysb', 2, 'Mathias L.', 43, 1), row('nei', 3, 'Nina N.', 42, 2), row('phil', 4, 'Philip M.', 36, 8)],
  table: [row('ole', 1, 'Ole H.', 44, 0), row('lysb', 2, 'Mathias L.', 43, 1), row('nei', 3, 'Nina N.', 42, 2), row('phil', 4, 'Philip M.', 36, 8)],
};
const yes = new Set(['ole', 'lysb', 'phil']);
const facts = buildRoundNewsFacts(summary, 'Runde 2', yes)!;

describe('buildRoundNewsFacts', () => {
  it('only the players who said yes are in the facts; the counts still cover everyone', () => {
    expect(facts.round).toEqual([
      { place: 1, name: 'Ole H.', value: 44, behindBest: 0 },
      { place: 2, name: 'Mathias L.', value: 43, behindBest: 1 },
      { place: 4, name: 'Philip M.', value: 36, behindBest: 8 },
    ]);
    expect(facts.table).toEqual([
      { place: 1, name: 'Ole H.', total: 44, behindLeader: 0 },
      { place: 2, name: 'Mathias L.', total: 43, behindLeader: 1 },
      { place: 4, name: 'Philip M.', total: 36, behindLeader: 8 },
    ]);
    expect(JSON.stringify(facts)).not.toMatch(/Nina|nei/);
    expect(facts).toMatchObject({
      leagueName: 'Vinterliga 2026-2027',
      roundLabel: 'Runde 1',
      nextRoundLabel: 'Runde 2',
      roundsPlayed: 1,
      roundsTotal: 10,
      countingRounds: 8,
      roundMetric: 'poeng, flest er best',
      tableMetric: 'sum av de 8 beste rundene (poeng, flest er best)',
      roundBestShown: true,
      tableLeaderShown: true,
      courseName: 'Byneset North',
      simulator: true,
      playersInLeague: 5,
      playedThisRound: 4,
    });
  });

  it('a stroke league says lowest is best, and the table total follows the standings model', () => {
    const stroke = { ...summary, pointsBased: false, countingRounds: null };
    expect(buildRoundNewsFacts({ ...stroke, model: 'total' }, 'Runde 2', yes)).toMatchObject({
      roundMetric: 'slag mot par, lavest er best',
      tableMetric: 'sum av rundene (slag mot par, lavest er best)',
    });
    expect(buildRoundNewsFacts({ ...stroke, model: 'average' }, 'Runde 2', yes)!.tableMetric).toBe(
      'snitt per runde (slag mot par, lavest er best)',
    );
    // Placement points: the total is league points, where most is best, also
    // when a round value is strokes to par.
    expect(buildRoundNewsFacts({ ...stroke, model: 'points' }, 'Runde 2', yes)).toMatchObject({
      roundMetric: 'slag mot par, lavest er best',
      tableMetric: 'ligapoeng etter plassering i hver runde, flest er best',
    });
  });

  it('the round best said no: the facts say that nobody shown won the round or leads the table', () => {
    // Ole (place 1) is hidden. The best of the shown players is second.
    const hidden = buildRoundNewsFacts(summary, 'Runde 2', new Set(['lysb', 'phil']))!;
    expect(hidden.round.map((r) => r.place)).toEqual([2, 4]);
    expect(hidden).toMatchObject({ roundBestShown: false, tableLeaderShown: false });
    expect(JSON.stringify(hidden)).not.toMatch(/Ole/);
  });

  it('a player without a name is left out, and nobody to write about gives no facts', () => {
    const nameless = { ...summary, round: [row('ole', 1, null, 44, 0)], table: [row('ole', 1, null, 44, 0)] };
    expect(buildRoundNewsFacts(nameless, 'Runde 2', yes)).toBeNull();
    expect(buildRoundNewsFacts(summary, 'Runde 2', new Set())).toBeNull();
    expect(buildRoundNewsFacts(summary, 'Runde 2', new Set(['nei-ikke-i-runden']))).toBeNull();
  });
});

describe('buildRoundNewsPrompt', () => {
  it('the user message carries the facts as they are, and nothing else about the players', () => {
    const { system, user } = buildRoundNewsPrompt(facts);
    expect(user).toContain(JSON.stringify(facts, null, 2));
    expect(system).not.toMatch(/Ole|Mathias|Philip|Nina/);
  });

  it('the rules the drafts broke are in the system prompt', () => {
    const { system } = buildRoundNewsPrompt(facts);
    expect(system).toContain('Regn ALDRI ut noe selv');
    expect(system).toContain('møtte opp');
    expect(system).toContain('NØYAKTIG slik det står i «name»');
    // The evaluator's finding (23.11): without the round best in the facts,
    // «B vant runden» passed every check.
    // The owner 23.11: «poeng» is enough.
    expect(system).toContain('aldri «stablefordpoeng»');
    expect(JSON.stringify(facts)).not.toMatch(/stableford/i);
    expect(system).toContain('Er roundBestShown false');
    expect(system).toContain('tableLeaderShown false');
  });

  it('a second attempt is the same task, with the reason the first draft was dropped', () => {
    const first = buildRoundNewsPrompt(facts);
    const second = buildRoundNewsPrompt(facts, 'Utkastet inneholdt «møtte opp», som er forbudt når simulator er true.');
    expect(second.system).toBe(first.system);
    expect(second.user.startsWith(first.user)).toBe(true);
    expect(second.user.slice(first.user.length)).toBe(
      '\n\nEt tidligere utkast ble forkastet. Utkastet inneholdt «møtte opp», som er forbudt når simulator er true. Skriv saken på nytt og følg alle reglene.',
    );
  });
});

describe('checkRoundNews', () => {
  it('a story whose numbers all stand in the facts goes out, trimmed', () => {
    const story = '  Ole H. tok Runde 1 med 44 poeng, 1 foran Mathias L. Philip M. er 8 bak. Runde 2 er åpen nå.  ';
    expect(checkRoundNews(story, facts)).toEqual({ story: story.trim(), fault: null });
  });

  it.each([
    ['a score nobody has', 'Ole H. tok runden med 45 poeng.', '45'],
    ['a gap the facts do not hold', 'Philip M. er 7 poeng bak Ole H.', '7'],
    ['a decimal that is not there', 'Ole H. snittet 44,5 poeng.', '44.5'],
    ['a year that is not in the league name', 'Ole H. åpnet 2025-sesongen med 44 poeng.', '2025'],
  ])('a number that is not in the facts drops the story, and the fault names it: %s', (_name, story, number) => {
    expect(checkRoundNews(story, facts)).toEqual({
      story: null,
      fault: `Utkastet inneholdt tall som ikke står i fakta-objektet: ${number}.`,
    });
  });

  it('the limit of the check: a number from the facts used about the wrong thing passes', () => {
    // 10 is the number of rounds in the league, not Philip's gap (8). The
    // digits are known, so the check lets it through: the prompt forbids the
    // model's own arithmetic, and the gaps stand in the facts for that reason.
    expect(checkRoundNews('Philip M. er 10 poeng bak Ole H.', facts).story).not.toBeNull();
  });

  it('digits from the league name and the round labels are known', () => {
    expect(checkRoundNews('Vinterliga 2026-2027 er i gang, og Runde 2 er åpen.', facts).story).not.toBeNull();
  });

  it('an empty or far too long answer drops the story', () => {
    const fault = 'Utkastet var tomt eller for langt.';
    expect(checkRoundNews('   ', facts)).toEqual({ story: null, fault });
    expect(checkRoundNews('Ole H. '.repeat(200), facts)).toEqual({ story: null, fault });
  });

  it('a hidden player’s numbers are unknown, so a story that leaks them is dropped', () => {
    // 42 belongs to the player who said no: it is not in the facts.
    expect(checkRoundNews('Tredjeplassen gikk på 42 poeng.', facts).story).toBeNull();
  });
});

describe('checkRoundNews: a simulator league has no meeting place', () => {
  // The first story the model wrote in prod (23.11.2026) held this sentence,
  // here without the name. Every number is in the facts, so it went out.
  const sent =
    'Nederst av de som møtte opp finner vi en spiller med 36 poeng, åtte bak toppen, så der er det absolutt rom for forbedring.';

  it('the sentence from the first real mail is dropped, and the fault names the word', () => {
    expect(checkRoundNews(sent, facts)).toEqual({
      story: null,
      fault: 'Utkastet inneholdt «møtte opp», som er forbudt når simulator er true.',
    });
  });

  it('the same sentence goes out in a league on a real course', () => {
    const outdoors = { ...facts, simulator: false };
    expect(checkRoundNews(sent, outdoors)).toEqual({ story: sent, fault: null });
  });

  it.each([
    'Ti av elleve har møtt opp.',
    'Én spiller møtte ikke opp.',
    'Oppmøtet var godt i Runde 1.',
    'Gjengen møttes på Byneset North.',
    'Vi møtes igjen i Runde 2.',
    'Ti spillere dukket opp.',
    'Én dukket aldri opp.',
    'Hele gjengen troppet opp.',
    'Spillerne samlet seg rundt skjermen.',
  ])('a word for turning up or meeting drops the story: %s', (story) => {
    expect(checkRoundNews(story, facts).story).toBeNull();
  });

  it.each([
    'Ole H. møtte ingen motstand og tok 44 poeng.',
    'Ole H. samlet 44 poeng og er på toppen.',
    'Philip M. må opp fra bunnen. Runde 2 er åpen nå.',
    'Mathias L. klatret opp og fant veien til skjermen.',
  ])('a word that only looks like one of them goes out: %s', (story) => {
    expect(checkRoundNews(story, facts)).toEqual({ story, fault: null });
  });

  it('two faults in one draft are both named', () => {
    expect(checkRoundNews('Ti dukket opp, og oppmøtet ga 45 poeng.', facts).fault).toBe(
      'Utkastet inneholdt tall som ikke står i fakta-objektet: 45. Utkastet inneholdt «oppmøte» og «dukket opp», som er forbudt når simulator er true.',
    );
  });

  it('one home for the rule: every word the check drops is named in the prompt, and the other way round', () => {
    const { system } = buildRoundNewsPrompt(facts);
    for (const { word } of GATHERING_WORDS) {
      expect(system).toContain(`«${word}»`);
      expect(checkRoundNews(`Gjengen ${word} i Runde 1.`, facts).fault).toContain(`«${word}»`);
    }
  });
});
