// #2254: teksten på startboden.
//
// To jobber, samme mønster som `profileCopy.test.ts`:
//  1. **Paritetsport mot webben.** Det som også står på nettsiden, hentes fra
//     `messages/no.json` og sammenlignes tegn for tegn.
//  2. **Ingen tekst uten setning**, og riktige former for tall, plass og avstand.
import source from '../../../../messages/no.json';
import { finishedResultBadge } from '../../../../lib/games/finishedResultBadge';
import type { ResultSummary } from '../../../../lib/scoring/resultSummary';
import { isFinishedSentence } from '../test/copy';
import {
  HOME_TEXT,
  approvalsLine,
  companionsLabel,
  continueOnHole,
  finishedResultText,
  greeting,
  hcpA11yLabel,
  holesPlayedLine,
  moreAvatars,
  placeLine,
  proximityText,
  ringNextLabel,
  standingDetail,
  ticketA11yLabel,
} from './homeCopy';

/** Fyller `{navn}`-plassholdere i en webstreng. ICU-flertall fylles ikke her. */
function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key]));
}

/** Stubben skriver nærheten med liten forbokstav, som designet (#2385). */
function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

const web = source;
const board = web.leaderboard.board;

describe('paritet mot messages/no.json', () => {
  it('seksjonene og knappene som finnes på webben', () => {
    expect(HOME_TEXT.playerFallback).toBe(web.home.playerFallback);
    expect(HOME_TEXT.inProgress).toBe(web.home.sectionInProgress);
    expect(HOME_TEXT.myGames).toBe(web.home.sectionMyGames);
    expect(HOME_TEXT.teamRound).toBe(web.home.roundTeamBall);
    expect(HOME_TEXT.submit).toBe(board.stripSubmit);
    // Samme ord som webben; bare forbokstaven er liten i stubben.
    expect(HOME_TEXT.tomorrow).toBe(lowerFirst(web.home.proximity.tomorrow));
    expect(proximityText({ kind: 'days', days: 3 })).toBe(
      lowerFirst(fill(web.home.proximity.days, { days: 3 })),
    );
  });

  it('plassen og avstanden er tavlas', () => {
    expect(placeLine({ rank: 3, tied: false })).toBe(fill(board.stripPlace, { rank: 3 }));
    expect(placeLine({ rank: 3, tied: true })).toBe(fill(board.stripTiedPlace, { rank: 3 }));
    const standing = { rank: 3, total: 15, holesPlayed: 7, gap: 3, fieldSize: 12 };
    expect(standingDetail(standing, 'points')).toContain(
      fill(board.behindPointsLead, { gap: 3 }),
    );
    expect(standingDetail(standing, 'net')).toContain(fill(board.behindStrokesLead, { gap: 3 }));
    expect(standingDetail(standing, 'toPar')).toContain(
      fill(board.behindStrokesLead, { gap: 3 }),
    );
  });

  it('forrige runde bruker webbens finishedCard-tekster for hver form', () => {
    const r = web.finishedCard.result;
    const cases: [ResultSummary, string][] = [
      [{ kind: 'placement', rank: 1, fieldSize: 8, isTeam: false }, r.youWon],
      [{ kind: 'placement', rank: 1, fieldSize: 8, isTeam: true }, r.teamWon],
      [
        { kind: 'placement', rank: 2, fieldSize: 8, isTeam: false },
        fill(r.placement, { rank: 2, fieldSize: 8 }),
      ],
      [
        { kind: 'placement', rank: 3, fieldSize: 4, isTeam: true },
        fill(r.teamPlacement, { rank: 3, fieldSize: 4 }),
      ],
      [{ kind: 'matchplay', outcome: 'win', margin: '3&2' }, fill(r.matchWon, { margin: '3&2' })],
      [{ kind: 'matchplay', outcome: 'loss', margin: '2 up' }, fill(r.matchLost, { margin: '2 up' })],
      [{ kind: 'matchplay', outcome: 'tie', margin: null }, r.matchTied],
    ];
    for (const [summary, expected] of cases) {
      expect(finishedResultText(finishedResultBadge(summary))).toBe(expected);
    }
  });

  it('skins følger webbens flertallsform', () => {
    // `{count, plural, one {# skin} other {# skins}}` — fylt for hånd.
    expect(web.finishedCard.result.skins).toBe('{count, plural, one {# skin} other {# skins}}');
    expect(web.finishedCard.result.skinsWon).toBe(
      '🥇 {count, plural, one {# skin} other {# skins}}',
    );
    const text = (skins: number, rank: number) =>
      finishedResultText(finishedResultBadge({ kind: 'skins', skins, rank, fieldSize: 4 }));
    expect(text(1, 2)).toBe('1 skin');
    expect(text(3, 2)).toBe('3 skins');
    expect(text(3, 1)).toBe('🥇 3 skins');
    // Plass 1 uten skins er ingen seier, og får ingen medalje.
    expect(text(0, 1)).toBe('0 skins');
  });
});

describe('startbodens egne tekster', () => {
  it('er ferdige setninger', () => {
    for (const text of Object.values(HOME_TEXT)) {
      expect(isFinishedSentence(text)).toBe(true);
    }
    for (const text of [
      continueOnHole(8),
      ringNextLabel(8, 18, 7),
      holesPlayedLine(7, 18),
      approvalsLine(2),
      moreAvatars(1),
      companionsLabel(['Marte', 'Ola'], true, 4),
    ]) {
      expect(isFinishedSentence(text)).toBe(true);
    }
  });

  it('hilsenen følger klokka: morgen 05–10, dag 10–18, kveld 18–05', () => {
    const at = (hour: number, minute = 0) => greeting('Sigrid', new Date(2026, 8, 27, hour, minute));
    expect(at(4, 59)).toBe('God kveld, Sigrid');
    expect(at(5)).toBe('God morgen, Sigrid');
    expect(at(9, 59)).toBe('God morgen, Sigrid');
    expect(at(10)).toBe('God dag, Sigrid');
    expect(at(17, 59)).toBe('God dag, Sigrid');
    expect(at(18)).toBe('God kveld, Sigrid');
    expect(at(0)).toBe('God kveld, Sigrid');
  });

  it('HCP-pillen leses som veien til profilen', () => {
    expect(hcpA11yLabel('14,2')).toBe('Profil, handicap 14,2');
  });

  it('knapp, ring og hull-linje', () => {
    expect(continueOnHole(8)).toBe('Fortsett på hull 8 →');
    expect(ringNextLabel(8, 18, 7)).toBe('Hull 8 av 18, 7 spilt');
    expect(holesPlayedLine(7, 18)).toBe('7 av 18 hull spilt');
  });

  it('leder, delt ledelse og plass', () => {
    expect(placeLine({ rank: 1, tied: false })).toBe('Du leder');
    expect(placeLine({ rank: 1, tied: true })).toBe('Delt ledelse');
    expect(placeLine({ rank: 4, tied: false })).toBe('4. plass');
  });

  it('linja under plassen for hver enhet, med og uten avstand', () => {
    const s = (rank: number, total: number, holesPlayed: number, gap: number | null, fieldSize: number) =>
      ({ rank, total, holesPlayed, gap, fieldSize });
    expect(standingDetail(s(3, 15, 7, 3, 12), 'points')).toBe(
      '15 poeng etter 7 hull · 3 poeng bak ledelsen',
    );
    expect(standingDetail(s(2, 31, 7, 2, 12), 'net')).toBe(
      '31 slag netto etter 7 hull · 2 slag bak ledelsen',
    );
    // Uten avstand står feltet først, for det hører til plassen over.
    expect(standingDetail(s(4, -2, 9, null, 12), 'toPar')).toBe(
      'av 12 spillere · −2 etter 9 hull',
    );
    expect(standingDetail(s(1, 21, 7, null, 12), 'points')).toBe(
      'blant 12 spillere · 21 poeng etter 7 hull',
    );
    // Avstand 0 (lik sum, men rangert bak) vises ikke, som på tavla.
    expect(standingDetail(s(2, 20, 7, 0, 5), 'points')).toBe('av 5 spillere · 20 poeng etter 7 hull');
  });

  it('nærhet, avatarer og billettens skjermlesertekst', () => {
    expect(proximityText({ kind: 'today' })).toBe('i dag');
    expect(proximityText({ kind: 'days', days: 7 })).toBe('om 7 dager');
    expect(proximityText(null)).toBeNull();
    expect(moreAvatars(1)).toBe('+1 til');
    expect(companionsLabel(['Marte', 'Ola', 'Kari'], true, 4)).toBe('Flighten din: Marte, Ola, Kari');
    expect(companionsLabel(['Marte'], false, 4)).toBe('Med i runden: Marte');
    expect(companionsLabel(['A', 'B', 'C', 'D', 'E', 'F'], false, 4)).toBe(
      'Med i runden: A, B, C, D og 2 til',
    );
    expect(ticketA11yLabel(['Klubbmesterskap', 'Lør 3. okt kl. 09:30', null, ''])).toBe(
      'Neste start. Klubbmesterskap. Lør 3. okt kl. 09:30',
    );
  });

  it('godkjenningsraden', () => {
    expect(approvalsLine(1)).toBe('1 kort venter på godkjenningen din →');
    expect(approvalsLine(3)).toBe('3 kort venter på godkjenningen din →');
  });
});
