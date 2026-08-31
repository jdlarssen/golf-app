// native/app/src/lib/sideTournamentCopy.test.ts
// Paritets-porten mellom appens lokale sideturnerings-copy og webbens kilde.
//
// `sideTournamentCopy.ts` er en HÅNDKOPI av ~74 strenger fra `messages/no.json`
// — appen kan ikke importere kildefila (341 KB for 74 strenger, og Metro shaker
// ikke JSON). Prisen for kopien er drift: en tekst rettes på web, appen blir
// hengende igjen, og ingen merker det før en spiller ser to ulike ord for det
// samme.
//
// Denne fila er forsikringen. Den leser `no.json` fra node-siden — testen
// bundles aldri, så importen koster ingenting på enheten — og krever
// tegn-for-tegn likhet. Tre ting gjør den rød:
//   1. en streng endres på web uten at appen følger etter,
//   2. en nøkkel forsvinner fra `no.json`,
//   3. appen har en nøkkel som ikke finnes i `no.json`.
//
// Den fjerde raden («Regelpanelet er fortsatt utenfor») er en scope-vakt:
// `rulesPanel`/`achievementRules`/`panel` er bevisst ikke speilet i v1. Kommer
// det en ny gren under `sideTournament`, skal noen ta stilling til den — ikke
// oppdage den et halvår senere.
import source from '../../../../messages/no.json';
import {
  AWARD_LABEL_KEY_BY_CATEGORY,
  COORD_AWARD_LABEL_KEY,
  MATCHPLAY_SIDE_TEXT,
  SIDE_AWARD_LABELS,
  SIDE_GROUP_LABELS,
  SIDE_TEXT,
  awardLabel,
  fillCopy,
} from './sideTournamentCopy';

const sideSource: Record<string, unknown> = source.leaderboard.sideTournament;

/** Grener under `sideTournament` appen med vilje IKKE speiler (se toppen). */
const UNMIRRORED_SOURCE_KEYS = ['achievementRules', 'panel', 'rulesPanel'];

/**
 * Den ene awards-nøkkelen ingen kategori peker på: `holeWinsOn` er
 * halesetningen til `holeWins` («på 3 hull (4, 9, 12)»), ikke en egen
 * utdeling. Turkey/solid har to etiketter per kategori, men begge er nådd —
 * spiller-varianten via `AWARD_LABEL_KEY_BY_CATEGORY`, lag-bonusen via
 * `COORD_AWARD_LABEL_KEY`.
 */
const UNMAPPED_AWARD_KEYS = ['holeWinsOn'];

describe('paritet med messages/no.json', () => {
  it.each([
    ['awards', SIDE_AWARD_LABELS, source.leaderboard.sideTournament.awards],
    ['groups', SIDE_GROUP_LABELS, source.leaderboard.sideTournament.groups],
    ['matchplaySide', MATCHPLAY_SIDE_TEXT, source.leaderboard.matchplaySide],
  ])('%s er identisk med kilden', (_name, mirrored, sourceNode) => {
    expect(mirrored).toStrictEqual(sourceNode);
  });

  it('de løse strengene er identiske med kilden', () => {
    const sliceOfSource = Object.fromEntries(
      Object.keys(SIDE_TEXT).map((key) => [key, sideSource[key]]),
    );
    expect({ ...SIDE_TEXT }).toStrictEqual(sliceOfSource);
  });

  it('regelpanelet er fortsatt det eneste som ikke er speilet', () => {
    const mirrored = new Set([...Object.keys(SIDE_TEXT), 'awards', 'groups']);
    const rest = Object.keys(sideSource)
      .filter((key) => !mirrored.has(key))
      .sort();
    expect(rest).toEqual(UNMIRRORED_SOURCE_KEYS);
  });
});

describe('oppslag på kategori', () => {
  it('kartlegger hver awards-nøkkel unntatt halesetningen', () => {
    const mapped = new Set<string>([
      ...Object.values(AWARD_LABEL_KEY_BY_CATEGORY),
      ...Object.values(COORD_AWARD_LABEL_KEY),
    ]);
    const unmapped = Object.keys(SIDE_AWARD_LABELS)
      .filter((key) => !mapped.has(key))
      .sort();
    expect(unmapped).toEqual(UNMAPPED_AWARD_KEYS);
  });

  it('gir spiller- og lag-bonus-varianten av samme kategori', () => {
    expect(awardLabel('turkey', { detail: 'hull 4–6' })).toBe('Turkey (hull 4–6):');
    expect(awardLabel('turkey', { range: ' hull 4–6' }, 'coord')).toBe(
      'Turkey lag-bonus hull 4–6:',
    );
  });
});

describe('fillCopy', () => {
  it('fyller kjente plassholdere og lar ukjente stå urørt', () => {
    expect(fillCopy(SIDE_TEXT.scoreOnHole, { name: 'Per', score: 2, hole: 7 })).toBe(
      'Per, 2 på hull 7',
    );
    expect(fillCopy(SIDE_TEXT.comebackDetail, { name: 'Per' })).toBe('Per, snudd {delta} slag');
  });
});
