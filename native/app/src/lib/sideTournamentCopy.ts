// native/app/src/lib/sideTournamentCopy.ts
// Native (#1850): sideturneringens norske etiketter, speilet fra webbens
// `messages/no.json`.
//
// Hvorfor en egen fil i stedet for å lese kilden direkte:
//
//  1. **`messages/no.json` er 341 KB.** Appen trenger de ~74 strengene under
//     `leaderboard.sideTournament` + `leaderboard.matchplaySide`. Å importere
//     fila ville dratt hele webbens ordforråd — alle skjermer, alle e-poster,
//     alle admin-flater — inn i JS-bundelen for det. Metro shaker ikke JSON.
//  2. **Paritetstesten er drift-vernet.** `sideTournamentCopy.test.ts` leser
//     `no.json` fra node-siden (aldri bundlet) og krever tegn-for-tegn likhet.
//     Endrer noen en streng på web uten å følge etter her, blir CI rød — så
//     kopien kan ikke sile ut av takt uten at noen ser det.
//  3. **Regelpanelet er utenfor v1.** `rulesPanel`, `achievementRules` og
//     `panel` («Slik gis poengene») speiles bevisst ikke; appen viser bare
//     resultatet, ikke regelverket.
//
// Strengene er hentet programmatisk ut av `no.json` — ingen av dem er skrevet
// for hånd.
import type { SideCategory } from '../../../../lib/scoring/sideTournament';

/**
 * Etikettene under `leaderboard.sideTournament.awards` — alle 48.
 *
 * Nøklene er webbens i18n-nøkler (camelCase), IKKE kategori-ID-er. Bruk
 * {@link AWARD_LABEL_KEY_BY_CATEGORY} for oppslag på en `SideCategory`.
 */
export const SIDE_AWARD_LABELS = {
  bestNetto18: 'Best netto 18 hull:',
  bestNettoFront9: 'Best netto front 9:',
  bestNettoBack9: 'Best netto back 9:',
  bestBrutto18Team: 'Best brutto totalt 18 (lag):',
  bestBrutto18Individual: 'Best brutto totalt 18 ({name}):',
  kingPar3Team: 'Konge på par-3 (lag):',
  kingPar3Individual: 'Konge på par-3 ({name}):',
  kingPar5Team: 'Konge på par-5 (lag):',
  kingPar5Individual: 'Konge på par-5 ({name}):',
  kingPar4Team: 'Konge på par-4 (lag):',
  kingPar4Individual: 'Konge på par-4 ({name}):',
  mostEaglesTeam: 'Flest eagles+ (lag):',
  mostEaglesIndividual: 'Flest eagles+ ({name}):',
  mostAlbatrossesTeam: 'Flest albatrosser (lag):',
  mostAlbatrossesIndividual: 'Flest albatrosser ({name}):',
  mostHoleInOnesTeam: 'Flest hole-in-one (lag):',
  mostHoleInOnesIndividual: 'Flest hole-in-one ({name}):',
  cleanFront9: 'Rein front-9 ({name}):',
  cleanBack9: 'Rein back-9 ({name}):',
  noDoublePlusRound: 'Ren runde — ingen double ({name}):',
  longestBogeyFreeStreak: 'Lengste bogey-fri ({detail}):',
  bestBruttoF9Team: 'Best brutto front 9 (lag):',
  bestBruttoF9Individual: 'Best brutto front 9 ({name}):',
  bestBruttoB9Team: 'Best brutto back 9 (lag):',
  bestBruttoB9Individual: 'Best brutto back 9 ({name}):',
  mostBirdiesTeam: 'Flest birdier (lag):',
  mostBirdiesIndividual: 'Flest birdier ({name}):',
  mostParsTeam: 'Flest pars+ (lag):',
  mostParsIndividual: 'Flest pars+ ({name}):',
  lowestSingleHoleBrutto: 'Lavest enkelthull ({detail}):',
  hardestHoleWinner: 'Hardeste hull ({detail}):',
  comebackKid: 'Comeback kid ({detail}):',
  allParGroupsBirdie: 'Allsidig birdie ({name}):',
  evenParRound: 'Even-par-runden ({name}):',
  backToBackBirdies: 'To birdier på rad ({detail}):',
  holeWins: 'Hole-wins:',
  holeWinsOn: 'på {count} hull ({holes})',
  longestDrive: 'Longest drive #{pos} ({name}):',
  closestToPin: 'Closest to pin #{pos} ({name}):',
  turkeyPlayer: 'Turkey ({detail}):',
  turkeyCoord: 'Turkey lag-bonus{range}:',
  solidPlayer: 'Solid ({detail}):',
  solidCoord: 'Solid lag-bonus{range}:',
  teamAllBirdied: 'Alle birdied (lag-bonus):',
  teamNoBogeyHole: 'Lag-par-hull{detail}:',
  snowman: 'Snowman ({detail}):',
  worstSingleHole: 'Verste enkelthull ({detail}):',
  mostDoubleBogeys: 'Flest double-bogeys ({name}):',
} as const;

export type SideAwardLabelKey = keyof typeof SIDE_AWARD_LABELS;

/** Under-overskriftene i lag-utvidelsen (`...sideTournament.groups`). */
export const SIDE_GROUP_LABELS = {
  hovedkonkurranser: 'Hovedkonkurranser',
  skill: 'Ferdighet og sjeldenhet',
  moderate: 'Moderat',
  hull: 'Hull-konkurranser',
  achievements: 'Bragder',
  penalty: 'Minuspoeng',
} as const;

export type SideGroupId = keyof typeof SIDE_GROUP_LABELS;

/**
 * Løse strenger rett under `leaderboard.sideTournament` — tomtilstand,
 * lag-fallback, uavgjort-halene og detalj-malene de bespoke radene bygger.
 */
export const SIDE_TEXT = {
  noPoints: 'Ingen poeng denne runden.',
  teamFallback: 'Lag {id}',
  holeWord: 'hull',
  tieOne: ' (uavgjort med {team})',
  tieTwo: ' (uavgjort med {team1} og {team2})',
  tieMany: ' (uavgjort med {teams} og {last})',
  streakRange: 'hull {start}–{end}',
  streakSingle: 'hull {hole}',
  snowmanDetail: 'hele laget +{delta} på hull {hole}',
  snowmanDetailSolo: '+{delta} på hull {hole}',
  snowmanDetailHole: 'hele laget på hull {hole}',
  snowmanDetailHoleSolo: 'på hull {hole}',
  longestBogeyFreeDetail: '{name}, {count} hull {range}',
  scoreOnHole: '{name}, {score} på hull {hole}',
  scoreOnHoleBrutto: '{name}, {score} brutto på hull {hole}',
  comebackDetail: '{name}, snudd {delta} slag',
} as const;

/** Den kompakte sideturnerings-seksjonen under matchplay-duellkortet. */
export const MATCHPLAY_SIDE_TEXT = {
  heading: 'Sideturnering',
  longestDrive: 'Lengste drive #{pos}: {name}',
  closestToPin: 'Nærmest pinnen #{pos}: {name}',
  showBasis: 'Vis poenggrunnlaget',
} as const;

/**
 * Kategori → etikett-nøkkel.
 *
 * **Avvik verdt å kjenne til.** Oppgaven ba om oppslag på `SideCategoryId`
 * (`lib/scoring/sideTournamentConfig.ts`). To ting gjør et rett oppslag umulig:
 *
 *  - **Ordforrådet stemmer ikke overens med i18n-nøklene.** Kategoriene er
 *    snake_case (`most_birdies_team`), etikettene camelCase
 *    (`mostBirdiesTeam`). Det finnes ingen mekanisk regel som dekker begge
 *    veier (`king_par3_team` → `kingPar3Team`, `clean_front_9` →
 *    `cleanFront9`), så tabellen under ER kartet.
 *  - **Det finnes to kategori-unioner.** `SideCategoryId` er config-
 *    ordforrådet (hva admin kan skru AV), `SideCategory` er det utdelte
 *    resultatet bærer. Begge har 45 medlemmer og er identiske bortsett fra to:
 *    config sier `best_netto_f9`/`best_netto_b9`, utdelingen sier
 *    `best_netto_front9`/`best_netto_back9`. Komponentlaget itererer over
 *    `SideCategoryAward.category`, altså `SideCategory` — så tabellen er
 *    nøklet på den. `Record` gir uttømmende dekning: legger noen til en
 *    kategori i motoren, stopper `tsc` her.
 *
 * Tre awards-nøkler står med vilje utenfor tabellen: `holeWinsOn` (halesetning
 * til `holeWins`, ikke en egen kategori) og `turkeyCoord`/`solidCoord` — se
 * {@link COORD_AWARD_LABEL_KEY}.
 */
export const AWARD_LABEL_KEY_BY_CATEGORY: Record<SideCategory, SideAwardLabelKey> = {
  best_netto_18: 'bestNetto18',
  best_netto_front9: 'bestNettoFront9',
  best_netto_back9: 'bestNettoBack9',
  best_brutto_18_team: 'bestBrutto18Team',
  best_brutto_18_individual: 'bestBrutto18Individual',
  best_brutto_f9_team: 'bestBruttoF9Team',
  best_brutto_f9_individual: 'bestBruttoF9Individual',
  best_brutto_b9_team: 'bestBruttoB9Team',
  best_brutto_b9_individual: 'bestBruttoB9Individual',
  king_par3_team: 'kingPar3Team',
  king_par3_individual: 'kingPar3Individual',
  king_par4_team: 'kingPar4Team',
  king_par4_individual: 'kingPar4Individual',
  king_par5_team: 'kingPar5Team',
  king_par5_individual: 'kingPar5Individual',
  most_birdies_team: 'mostBirdiesTeam',
  most_birdies_individual: 'mostBirdiesIndividual',
  most_pars_team: 'mostParsTeam',
  most_pars_individual: 'mostParsIndividual',
  most_eagles_team: 'mostEaglesTeam',
  most_eagles_individual: 'mostEaglesIndividual',
  most_albatrosses_team: 'mostAlbatrossesTeam',
  most_albatrosses_individual: 'mostAlbatrossesIndividual',
  most_hole_in_ones_team: 'mostHoleInOnesTeam',
  most_hole_in_ones_individual: 'mostHoleInOnesIndividual',
  clean_front_9: 'cleanFront9',
  clean_back_9: 'cleanBack9',
  no_double_plus_round: 'noDoublePlusRound',
  longest_bogey_free_streak: 'longestBogeyFreeStreak',
  lowest_single_hole_brutto: 'lowestSingleHoleBrutto',
  hardest_hole_winner: 'hardestHoleWinner',
  comeback_kid: 'comebackKid',
  all_par_groups_birdie: 'allParGroupsBirdie',
  even_par_round: 'evenParRound',
  back_to_back_birdies: 'backToBackBirdies',
  hole_win: 'holeWins',
  longest_drive: 'longestDrive',
  closest_to_pin: 'closestToPin',
  turkey: 'turkeyPlayer',
  solid: 'solidPlayer',
  team_all_birdied_bonus: 'teamAllBirdied',
  team_no_bogey_hole_coord: 'teamNoBogeyHole',
  snowman: 'snowman',
  worst_single_hole_brutto: 'worstSingleHole',
  most_double_bogeys_individual: 'mostDoubleBogeys',
};

/**
 * Lag-bonus-varianten av turkey og solid. Motoren gir begge variantene samme
 * kategori, og skiller dem på om utdelingen gjelder én spiller (`detail`) eller
 * hele laget (`range`) — derfor to etiketter per kategori.
 */
export const COORD_AWARD_LABEL_KEY: Record<'turkey' | 'solid', SideAwardLabelKey> = {
  turkey: 'turkeyCoord',
  solid: 'solidCoord',
};

/** Verdiene en etikett kan interpolere. Webben sender både tekst og tall. */
export type CopyValues = Record<string, string | number>;

/**
 * Fyller `{plassholder}` med verdier — samme syntaks som next-intl-strengene.
 *
 * Ingen av de speilede strengene bruker ICU (plural/select/number), verifisert
 * mot kilden, så et rett bytte holder. En plassholder uten verdi blir stående
 * som `{navn}` i teksten: en synlig feil er lettere å oppdage enn `undefined`.
 */
export function fillCopy(template: string, values: CopyValues = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

/**
 * Ferdig etikett for en utdelt kategori.
 *
 * `variant: 'coord'` gjelder kun turkey/solid og henter lag-bonus-teksten;
 * for alle andre kategorier gir den samme etikett som `'player'`.
 */
export function awardLabel(
  category: SideCategory,
  values: CopyValues = {},
  variant: 'player' | 'coord' = 'player',
): string {
  const key =
    variant === 'coord' && (category === 'turkey' || category === 'solid')
      ? COORD_AWARD_LABEL_KEY[category]
      : AWARD_LABEL_KEY_BY_CATEGORY[category];
  return fillCopy(SIDE_AWARD_LABELS[key], values);
}
