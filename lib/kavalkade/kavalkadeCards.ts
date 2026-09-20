/**
 * Kortstokken for Kavalkaden (#2129, epic #1040).
 *
 * Fakta-byggeren (#2127) svarer på «hva er tallene». Denne fila svarer på
 * «hvilke kort finnes, i hvilken rekkefølge, og hvilken fane starter vi i» —
 * og ingenting mer. Den regner ikke ett eneste tall: hvert felt er kopiert rett
 * fra `KavalkadeFacts`, så et tall på skjermen kan alltid spores til fakta-JSON-en
 * uten mellomregning (kravet i kontrakten på #1040).
 *
 * Grunnen til at dette er en ren funksjon og ikke JSX: «hopp over kortet når
 * faktaet er `null`», terskelen og fane-valget er regler, ikke utseende. Som
 * regler hører de i en Type A-test (`docs/test-discipline.md`), og da kan
 * komponentene være rent presentasjonelle med én render-test hver.
 *
 * Kort-ID-en er samtidig nøkkelen K4 (#2130) hekter deleknappen sin på, så den
 * er stabil og unik innenfor en kortstokk.
 *
 * Ren og I/O-fri (Type A).
 */
import type {
  BestRoundFact,
  FormPeakFact,
  GangLeaderFact,
  KavalkadeFacts,
  NemesisHoleFact,
  RivalFact,
  TeamRoundFact,
  TeammateFact,
  TightestFinishFact,
} from './buildKavalkadeFacts';

/** Fanene. «Som lag» er kort inne i «Ditt år», ikke en egen fane (#1040 Tillegg 2). */
export type KavalkadeTab = 'personal' | 'gang';

/** Stabil, unik nøkkel per kort — også K4s feste for deleknappen. */
export type KavalkadeCardId =
  | 'year'
  | 'best-round'
  | 'nemesis-hole'
  | 'rival'
  | 'form-peak'
  | 'below-threshold'
  | 'team'
  | 'gang-summary'
  | 'gang-winner'
  | 'gang-birdies'
  | 'gang-snowmen'
  | 'gang-tightest';

/**
 * Hvem laget scoret best med, eller — under terskelen for det — hvem spilleren
 * gikk flest lagrunder med. `teammates` har mer enn én oppføring bare ved ekte
 * likhet.
 */
export type TeamHighlight =
  | { kind: 'best'; teammates: TeammateFact[] }
  | { kind: 'mostRounds'; teammates: TeammateFact[] }
  | { kind: 'none' };

export type KavalkadeCard =
  /** Åpningen: året i tre tall, og AI-innledningen når den finnes. */
  | {
      id: 'year';
      year: number;
      rounds: number;
      soloRounds: number;
      teamRounds: number;
      /** `null` ⇒ kortet vises uten innledningstekst (ingen API-nøkkel, K2). */
      narrative: string | null;
    }
  | { id: 'best-round'; fact: BestRoundFact }
  | { id: 'nemesis-hole'; fact: NemesisHoleFact }
  | { id: 'rival'; fact: RivalFact }
  | { id: 'form-peak'; fact: FormPeakFact }
  /** Under terskelen: kort melding i «Ditt år», ingen personlige tall. */
  | {
      id: 'below-threshold';
      soloRounds: number;
      roundsNeeded: number;
      teamRounds: number;
    }
  | {
      id: 'team';
      rounds: number;
      bestRound: TeamRoundFact | null;
      highlight: TeamHighlight;
    }
  | { id: 'gang-summary'; members: number; games: number }
  | { id: 'gang-winner'; fact: GangLeaderFact }
  | { id: 'gang-birdies'; fact: GangLeaderFact }
  | { id: 'gang-snowmen'; fact: GangLeaderFact }
  | { id: 'gang-tightest'; fact: TightestFinishFact };

export type KavalkadeDeck = {
  /** «Ditt år» — åpningen, de personlige kortene og «Som lag». */
  personal: KavalkadeCard[];
  /** «Gjengen» — kretsen du spilte med i år. */
  gang: KavalkadeCard[];
  /**
   * Fanen som åpnes først. «Gjengen» når spilleren er under terskelen: der er
   * det noe å se, mens «Ditt år» bare har meldingen (eierens beslutning
   * 2026-09-16, gjengitt i kontrakten på #1040).
   */
  defaultTab: KavalkadeTab;
};

/**
 * Har spilleren noe kavalkade i det hele tatt?
 *
 * Ingen ferdige runder i året ⇒ ingen kort, og siden viser en tom tilstand i
 * stedet for en kortstokk. `gang` er `null` i nøyaktig det tilfellet
 * (`buildKavalkadeFacts`), men vi spør på rundetallet fordi det er det leseren
 * faktisk mener.
 */
export function isKavalkadeEmpty(facts: KavalkadeFacts): boolean {
  return facts.rounds === 0;
}

/**
 * Bygger kortstokken.
 *
 * `narrative` kommer fra den lagrede raden (K2) og er `null` i
 * forhåndsvisningen og når modellen ikke svarte. Kort uten fakta finnes ikke:
 * er faktaet `null`, er kortet borte — bedre enn et kort med en tankestrek.
 */
export function buildKavalkadeDeck(
  facts: KavalkadeFacts,
  narrative: string | null = null,
): KavalkadeDeck {
  const personal: KavalkadeCard[] = [];

  if (!isKavalkadeEmpty(facts)) {
    personal.push({
      id: 'year',
      year: facts.year,
      rounds: facts.rounds,
      soloRounds: facts.soloRounds,
      teamRounds: facts.teamRounds,
      narrative,
    });
  }

  if (facts.personal) {
    const { bestRound, nemesisHole, rival, formPeak } = facts.personal;
    if (bestRound) personal.push({ id: 'best-round', fact: bestRound });
    if (nemesisHole) personal.push({ id: 'nemesis-hole', fact: nemesisHole });
    if (rival) personal.push({ id: 'rival', fact: rival });
    // Formtoppen har to former (#2127). Kortet vises hvis minst én finnes.
    if (formPeak.stretch || formPeak.season) {
      personal.push({ id: 'form-peak', fact: formPeak });
    }
  } else if (!isKavalkadeEmpty(facts)) {
    personal.push({
      id: 'below-threshold',
      soloRounds: facts.soloRounds,
      roundsNeeded: facts.roundsNeeded,
      teamRounds: facts.teamRounds,
    });
  }

  if (facts.team) {
    personal.push({
      id: 'team',
      rounds: facts.team.rounds,
      bestRound: facts.team.bestRound,
      highlight: teamHighlight(facts.team.bestTeammates, facts.team.teammates),
    });
  }

  const gang: KavalkadeCard[] = [];
  if (facts.gang) {
    const g = facts.gang;
    gang.push({ id: 'gang-summary', members: g.members, games: g.games });
    if (g.topWinner) gang.push({ id: 'gang-winner', fact: g.topWinner });
    if (g.mostBirdies) gang.push({ id: 'gang-birdies', fact: g.mostBirdies });
    if (g.mostSnowmen) gang.push({ id: 'gang-snowmen', fact: g.mostSnowmen });
    if (g.tightestFinish) {
      gang.push({ id: 'gang-tightest', fact: g.tightestFinish });
    }
  }

  return {
    personal,
    gang,
    // Under terskelen har «Ditt år» bare meldingen, så vi åpner der det er noe
    // å bla i. «Som lag» teller som noe: da er «Ditt år» ikke tomt.
    defaultTab:
      facts.personal == null && facts.team == null && gang.length > 0
        ? 'gang'
        : 'personal',
  };
}

/**
 * Lagkameraten kortet fremhever.
 *
 * Over terskelen (to felles komplette lagrunder, #2127) er det den laget scoret
 * best med. Under den faller vi tilbake til den spilleren gikk flest lagrunder
 * med — lista over lagkamerater følger med fra fakta nettopp for det. Likhet
 * gir flere navn, aldri et tilfeldig valg.
 */
function teamHighlight(
  bestTeammates: TeammateFact[],
  teammates: TeammateFact[],
): TeamHighlight {
  if (bestTeammates.length > 0) return { kind: 'best', teammates: bestTeammates };
  if (teammates.length === 0) return { kind: 'none' };

  const mostRounds = Math.max(...teammates.map((mate) => mate.rounds));
  return {
    kind: 'mostRounds',
    teammates: teammates.filter((mate) => mate.rounds === mostRounds),
  };
}
