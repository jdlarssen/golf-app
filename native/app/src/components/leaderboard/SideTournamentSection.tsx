// Native (#1850): sideturneringen — runden ved siden av runden.
//
// Speiler webbens to flater i én: `MatchplaySideTournamentSection` sine
// LD/CTP-linjer på toppen, og `SideTournamentView` sin poengjakt under. De to
// er samme data i webben også; her slås de sammen fordi appen ikke har en
// fane-rad å dele dem på.
//
// Fire ting bærer fila:
//
//  1. **Ingen poeng regnes her.** `result` kommer ferdig fra
//     `buildSideTournament` → den DELTE `calculateSideTournament`. Denne fila
//     velger ord og rekkefølge, ingenting annet. Poengverdiene som VISES leses
//     fra `SIDE_TOURNAMENT_POINTS` — samme konstant webben leser, så de to
//     flatene ikke kan vise ulike tall for samme utdeling.
//  2. **Detaljene leses fra de STRUKTURERTE feltene** på `SideCategoryAward`
//     (`holeNumber`, `streakStartHole`, `score`, `delta`, `winnerUserId`,
//     `coordBonus`) — aldri ved å parse `detail`-fritekst. Fritekstfeltet er
//     motorens interne notat, ikke et API.
//  3. **All norsk copy kommer fra `sideTournamentCopy.ts`**, som er
//     paritetstestet mot webbens `no.json`. Den ENE strengen som ikke gjør det
//     er {@link SIDE_WINNERS_UNAVAILABLE_MESSAGE} — den har ingen web-motpart
//     (webben renderer på serveren og kan ikke miste vinnerradene), og bor
//     derfor her, etter samme mønster som `WEB_ONLY_RESULT_MESSAGE`.
//  4. **Regelpanelet «Slik gis poengene» er ute av v1.** Webbens
//     `AchievementRow` viser en regel-undertittel under turkey/solid/snowman
//     (`achievementRules.*`); de strengene er bevisst ikke speilet, så appen
//     viser hovedlinjen alene.
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatHolesList } from '../../../../../lib/leaderboard/formatHolesList';
import type {
  SideCategory,
  SideCategoryAward,
  SideTournamentResult,
} from '../../../../../lib/scoring/sideTournament';
import { SIDE_TOURNAMENT_POINTS } from '../../../../../lib/scoring/sideTournamentConfig';
import type {
  SideTournamentData,
  SideTournamentSlotWinner,
  SideTournamentTeam,
} from '../../lib/sideTournament';
import {
  awardLabel,
  fillCopy,
  MATCHPLAY_SIDE_TEXT,
  SIDE_AWARD_LABELS,
  SIDE_GROUP_LABELS,
  SIDE_TEXT,
  type SideGroupId,
} from '../../lib/sideTournamentCopy';
import { COLORS, FONTS, TAP, ui } from '../../theme';
import { CalmNote } from './Table';

/**
 * Når LD/CTP-vinnerne ikke lot seg hente.
 *
 * Hver slot er verdt 2p, så en tabell uten dem viser feil totaler — og en
 * poengtavle ser like autoritativ ut enten tallene stemmer eller ikke. Samme
 * avveining som `PROBLEM_MESSAGES['missing-choices']` på leaderboard-skjermen:
 * heller si det som det er enn å vise noe som ser riktig ut.
 */
export const SIDE_WINNERS_UNAVAILABLE_MESSAGE =
  'Fikk ikke tak i hvem som vant lengste drive og nærmest pinnen. Poengtavla kommer når nettet er tilbake.';

/**
 * Visnings-rekkefølgen på under-overskriftene i en lag-utvidelse. Fast, og
 * identisk med webbens `GROUP_ORDER`. Tomme grupper hoppes stille over.
 */
const GROUP_ORDER: readonly SideGroupId[] = [
  'hovedkonkurranser',
  'skill',
  'moderate',
  'hull',
  'achievements',
  'penalty',
];

/**
 * Lag-/individ-parene som følger ÉN rigid mal: lag-varianten med
 * uavgjort-halen, individ-varianten med vinnerens fornavn.
 *
 * Rekkefølgen ER webbens emisjons-rekkefølge (par-4 ligger bevisst etter
 * eagles, ikke ved par-3/par-5). Den endelige visnings-rekkefølgen avgjøres
 * uansett av per-gruppe-sorteringen, men lista holdes i emisjons-rekkefølge
 * for et etterprøvbart diff mot webbens `SIMPLE_DUAL_AWARDS`.
 *
 * Etikett-nøklene er utelatt her (webben bærer dem): `awardLabel()` slår dem
 * opp fra kategorien via `AWARD_LABEL_KEY_BY_CATEGORY`, som er den samme
 * tabellen — én kilde i stedet for to som kan sile fra hverandre.
 */
type SimpleDualAward = {
  group: SideGroupId;
  teamCategory: SideCategory;
  individualCategory: SideCategory;
  teamPointsKey: keyof typeof SIDE_TOURNAMENT_POINTS;
  individualPointsKey: keyof typeof SIDE_TOURNAMENT_POINTS;
};

const SIMPLE_DUAL_AWARDS: readonly SimpleDualAward[] = [
  // ─── Skill og rarity (4p lag / 2p individ) ──────────────────────────────
  {
    group: 'skill',
    teamCategory: 'best_brutto_18_team',
    individualCategory: 'best_brutto_18_individual',
    teamPointsKey: 'bestBrutto18Team',
    individualPointsKey: 'bestBrutto18Individual',
  },
  {
    group: 'skill',
    teamCategory: 'king_par3_team',
    individualCategory: 'king_par3_individual',
    teamPointsKey: 'kingPar3Team',
    individualPointsKey: 'kingPar3Individual',
  },
  {
    group: 'skill',
    teamCategory: 'king_par5_team',
    individualCategory: 'king_par5_individual',
    teamPointsKey: 'kingPar5Team',
    individualPointsKey: 'kingPar5Individual',
  },
  {
    group: 'skill',
    teamCategory: 'most_eagles_team',
    individualCategory: 'most_eagles_individual',
    teamPointsKey: 'mostEaglesTeam',
    individualPointsKey: 'mostEaglesIndividual',
  },
  {
    group: 'skill',
    teamCategory: 'king_par4_team',
    individualCategory: 'king_par4_individual',
    teamPointsKey: 'kingPar4Team',
    individualPointsKey: 'kingPar4Individual',
  },
  {
    group: 'skill',
    teamCategory: 'most_albatrosses_team',
    individualCategory: 'most_albatrosses_individual',
    teamPointsKey: 'mostAlbatrossesTeam',
    individualPointsKey: 'mostAlbatrossesIndividual',
  },
  {
    group: 'skill',
    teamCategory: 'most_hole_in_ones_team',
    individualCategory: 'most_hole_in_ones_individual',
    teamPointsKey: 'mostHoleInOnesTeam',
    individualPointsKey: 'mostHoleInOnesIndividual',
  },
  // ─── Moderat (2p lag / 1p individ) ──────────────────────────────────────
  {
    group: 'moderate',
    teamCategory: 'best_brutto_f9_team',
    individualCategory: 'best_brutto_f9_individual',
    teamPointsKey: 'bestBruttoF9Team',
    individualPointsKey: 'bestBruttoF9Individual',
  },
  {
    group: 'moderate',
    teamCategory: 'best_brutto_b9_team',
    individualCategory: 'best_brutto_b9_individual',
    teamPointsKey: 'bestBruttoB9Team',
    individualPointsKey: 'bestBruttoB9Individual',
  },
  {
    group: 'moderate',
    teamCategory: 'most_birdies_team',
    individualCategory: 'most_birdies_individual',
    teamPointsKey: 'mostBirdiesTeam',
    individualPointsKey: 'mostBirdiesIndividual',
  },
  {
    group: 'moderate',
    teamCategory: 'most_pars_team',
    individualCategory: 'most_pars_individual',
    teamPointsKey: 'mostParsTeam',
    individualPointsKey: 'mostParsIndividual',
  },
];

/**
 * Én ferdig utdelings-linje.
 *
 * `label` står før poengsummen, `tail` rett etter den uten skilletegn —
 * uavgjort-halen begynner selv med et mellomrom, mens hull-lista sender sitt
 * eget. Todelingen er webbens: der er poengsummen et eget `<span>` med
 * `tabular-nums` midt i setningen.
 */
type AwardRow = {
  key: string;
  category: string;
  points: number;
  label: string;
  tail: string;
};

type RankedStanding = SideTournamentResult['teamStandings'][number] & {
  rank: number;
};

export type SideTournamentSectionProps = SideTournamentData & {
  /**
   * `true` når vinnerradene ikke lot seg hente. Sammen med minst én
   * LD-/CTP-slot bytter seksjonen ut hele poengtavla med
   * {@link SIDE_WINNERS_UNAVAILABLE_MESSAGE}.
   */
  sideWinnersUnavailable?: boolean;
  /**
   * Første henting av vinnerradene er ikke ferdig ennå.
   *
   * Skilles fra {@link sideWinnersUnavailable} med vilje: mens vi venter er det
   * hverken riktig å vise tavla (den mangler 2p per slot) eller noten (den ville
   * meldt en feil som ikke har skjedd). Da vises seksjonen rett og slett ikke.
   */
  sideWinnersLoading?: boolean;
};

/**
 * Sideturneringen for ett spill.
 *
 * Tre lag på skjermen: overskriften, de kårede LD/CTP-slotene, og poengjakten
 * — én utvidbar rad per lag, rangert på totalpoeng.
 */
export function SideTournamentSection({
  teams,
  result,
  ldCount,
  ctpCount,
  sideWinners,
  coursePars,
  sideWinnersUnavailable = false,
  sideWinnersLoading = false,
}: SideTournamentSectionProps) {
  // `<details>` finnes ikke i RN, så utvidelsen er vår egen. Et sett, ikke én
  // id: webbens rader åpnes uavhengig av hverandre, og et lag som lukker seg
  // selv når du åpner nabolaget ville vært en ny regel.
  const [openTeamIds, setOpenTeamIds] = useState<ReadonlySet<number>>(
    () => new Set<number>(),
  );

  const teamById = useMemo(
    () => new Map(teams.map((team) => [team.teamId, team])),
    [teams],
  );

  const standings = useMemo(() => rankByPoints(result.teamStandings), [result]);

  const headlineLines = useMemo(
    () => buildHeadlineLines(teams, sideWinners, ldCount, ctpCount),
    [teams, sideWinners, ldCount, ctpCount],
  );

  const toggle = (teamId: number) => {
    setOpenTeamIds((open) => {
      const next = new Set(open);
      if (!next.delete(teamId)) next.add(teamId);
      return next;
    });
  };

  // Uten vinnerradene mangler hver slot 2p i lagenes totaler. En tabell med
  // feil totaler er verre enn ingen tabell — den ser riktig ut.
  const winnersMissing = sideWinnersUnavailable && ldCount + ctpCount > 0;

  // Venter vi fortsatt på radene, viser vi ingenting i stedet for å velge
  // mellom to feil: en tavle som mangler 2p per slot, eller en note om en feil
  // som ikke har skjedd ennå. Uten slots er det ingenting å vente på.
  if (sideWinnersLoading && ldCount + ctpCount > 0) return null;

  return (
    <View testID="side-tournament-section">
      <Text style={ui.sectionTitle}>{MATCHPLAY_SIDE_TEXT.heading}</Text>

      {!winnersMissing &&
        headlineLines.map((line) => (
          <Text
            key={line.key}
            style={styles.headline}
            testID={`side-headline-${line.key}`}
          >
            {line.text}
          </Text>
        ))}

      {winnersMissing ? (
        <CalmNote
          text={SIDE_WINNERS_UNAVAILABLE_MESSAGE}
          testID="side-tournament-unavailable"
        />
      ) : (
        standings.map((standing) => (
          <TeamRow
            key={standing.teamId}
            standing={standing}
            standings={standings}
            team={teamById.get(standing.teamId)}
            teamById={teamById}
            ldCount={ldCount}
            ctpCount={ctpCount}
            sideWinners={sideWinners}
            coursePars={coursePars}
            expanded={openTeamIds.has(standing.teamId)}
            onToggle={() => toggle(standing.teamId)}
          />
        ))
      )}
    </View>
  );
}

/**
 * Én lag-rad: alltid synlig topplinje, utdelingene under når den er åpen.
 *
 * Radtittelen følger webbens regel. Et lag med nøyaktig ETT medlem viser
 * medlemmets `displayName` og ingen undertittel — for et solo-format er
 * `label` allerede fornavnet, og de to under hverandre ville vært samme navn
 * to ganger. Et lag med flere viser «Lag N» med fornavnene under.
 */
function TeamRow({
  standing,
  standings,
  team,
  teamById,
  ldCount,
  ctpCount,
  sideWinners,
  coursePars,
  expanded,
  onToggle,
}: {
  standing: RankedStanding;
  standings: readonly RankedStanding[];
  team: SideTournamentTeam | undefined;
  teamById: Map<number, SideTournamentTeam>;
  ldCount: number;
  ctpCount: number;
  sideWinners: readonly SideTournamentSlotWinner[];
  coursePars: number[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const label =
    team?.label ?? fillCopy(SIDE_TEXT.teamFallback, { id: standing.teamId });
  const soloMember = team && team.members.length === 1 ? team.members[0] : null;
  const title = soloMember ? soloMember.displayName : label;
  const memberNames = soloMember
    ? ''
    : (team?.members.map((member) => member.firstName).join(' · ') ?? '');
  const medal = MEDALS[standing.rank] ?? '·';

  return (
    <View style={styles.teamCard} testID={`side-team-${standing.teamId}`}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={onToggle}
        style={styles.summary}
        testID={`side-team-${standing.teamId}-toggle`}
      >
        <View style={styles.summaryMain}>
          <View style={styles.titleRow}>
            <Text style={styles.medal}>{medal}</Text>
            <Text style={styles.teamTitle} numberOfLines={1}>
              {title}
            </Text>
          </View>
          {memberNames ? (
            <Text style={styles.members} numberOfLines={1}>
              {memberNames}
            </Text>
          ) : null}
        </View>
        <Text
          style={[styles.points, ui.num]}
          testID={`side-team-${standing.teamId}-points`}
        >
          {standing.totalPoints}p
        </Text>
        <Text style={styles.chevron}>{expanded ? '▴' : '▾'}</Text>
      </Pressable>

      {expanded ? (
        <TeamAwards
          teamId={standing.teamId}
          standings={standings}
          teamById={teamById}
          ldCount={ldCount}
          ctpCount={ctpCount}
          sideWinners={sideWinners}
          coursePars={coursePars}
        />
      ) : null}
    </View>
  );
}

/** Ett lags utdelinger, gruppert i de seks gruppene. Tomme grupper faller bort. */
function TeamAwards({
  teamId,
  standings,
  teamById,
  ldCount,
  ctpCount,
  sideWinners,
  coursePars,
}: {
  teamId: number;
  standings: readonly RankedStanding[];
  teamById: Map<number, SideTournamentTeam>;
  ldCount: number;
  ctpCount: number;
  sideWinners: readonly SideTournamentSlotWinner[];
  coursePars: number[];
}) {
  const rows = buildAwardRows({
    teamId,
    standings,
    teamById,
    ldCount,
    ctpCount,
    sideWinners,
    coursePars,
  });

  if (rows === null) {
    return (
      <View style={styles.body}>
        <Text style={ui.muted} testID={`side-team-${teamId}-empty`}>
          {SIDE_TEXT.noPoints}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.body}>
      {GROUP_ORDER.map((group) => {
        const groupRows = rows[group];
        if (groupRows.length === 0) return null;
        return (
          <View key={group} testID={`side-team-${teamId}-group-${group}`}>
            <Text
              style={[
                styles.groupTitle,
                group === 'penalty' ? styles.groupTitlePenalty : null,
              ]}
            >
              {SIDE_GROUP_LABELS[group]}
            </Text>
            {groupRows.map((row) => (
              <Text
                key={row.key}
                style={styles.awardRow}
                testID={`side-award-${teamId}-${row.key}`}
              >
                {row.label}{' '}
                <Text
                  style={[ui.num, row.points < 0 ? styles.negative : null]}
                >{`${row.points}p`}</Text>
                {row.tail}
              </Text>
            ))}
          </View>
        );
      })}
    </View>
  );
}

// --- interne hjelpere ---

const MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

/**
 * Tett rangering på totalpoeng, synkende. Uavgjort DELER plass: to lag på topp
 * får begge plass 1 (og begge gullet), neste lag får plass 2. Indeks-basert
 * rangering ville stille degradert det ene til sølv.
 */
function rankByPoints<T extends { totalPoints: number }>(
  items: readonly T[],
): Array<T & { rank: number }> {
  const sorted = [...items].sort((a, b) => b.totalPoints - a.totalPoints);
  let lastTotal: number | null = null;
  let rank = 0;
  return sorted.map((item) => {
    if (item.totalPoints !== lastTotal) {
      rank += 1;
      lastTotal = item.totalPoints;
    }
    return { ...item, rank };
  });
}

/**
 * Én linje per KÅRET LD-/CTP-slot.
 *
 * `position` er hvilket hull sloten gjelder, ikke en plassering — samme spiller
 * kan derfor stå på begge slots, og da er to linjer riktig svar. Slots uten
 * kåret vinner hoppes stille over: «ingen vant ennå» er ikke en nyhet.
 */
function buildHeadlineLines(
  teams: readonly SideTournamentTeam[],
  sideWinners: readonly SideTournamentSlotWinner[],
  ldCount: number,
  ctpCount: number,
): Array<{ key: string; text: string }> {
  const firstNameById = new Map<string, string>();
  for (const team of teams) {
    for (const member of team.members) {
      firstNameById.set(member.userId, member.firstName);
    }
  }

  const lines: Array<{ key: string; text: string }> = [];
  const push = (
    category: SideTournamentSlotWinner['category'],
    template: string,
    prefix: string,
    count: number,
  ) => {
    for (let pos = 1; pos <= count; pos++) {
      const winner = sideWinners.find(
        (row) => row.category === category && row.position === pos,
      );
      if (!winner?.winnerUserId) continue;
      lines.push({
        key: `${prefix}-${pos}`,
        text: fillCopy(template, {
          pos,
          name: firstNameById.get(winner.winnerUserId) ?? '?',
        }),
      });
    }
  };

  push('longest_drive', MATCHPLAY_SIDE_TEXT.longestDrive, 'ld', ldCount);
  push('closest_to_pin', MATCHPLAY_SIDE_TEXT.closestToPin, 'ctp', ctpCount);
  return lines;
}

/** Fornavnet bak en userId, på tvers av lagene. `null` når ingen eier den. */
function firstNameOf(
  userId: string | null | undefined,
  teamById: Map<number, SideTournamentTeam>,
): string | null {
  if (!userId) return null;
  for (const team of teamById.values()) {
    const member = team.members.find((m) => m.userId === userId);
    if (member) return member.firstName;
  }
  return null;
}

/** Hvilket lag eier spilleren? `null` når ingen gjør det. */
function findTeamForUser(
  userId: string,
  teamById: Map<number, SideTournamentTeam>,
): number | null {
  for (const [id, team] of teamById) {
    if (team.members.some((member) => member.userId === userId)) return id;
  }
  return null;
}

/**
 * Bygger ett lags utdelings-linjer, gruppert og ferdig sortert.
 *
 * `null` betyr «ingen poeng denne runden» — kalleren viser tomteksten i stedet
 * for seks tomme overskrifter.
 *
 * Sorteringen innad i en gruppe er webbens, tegn for tegn: poeng synkende, så
 * `category.localeCompare` som stabil tie-break. (Webbens kommentar sier
 * lag-varianten vinner en lik poengsum; koden sorterer alfabetisk, og
 * `_individual` < `_team`. Ulikheten er teoretisk — lag- og individ-varianten
 * av samme kategori har aldri lik poengsum — og koden er fasiten vi speiler.)
 */
function buildAwardRows({
  teamId,
  standings,
  teamById,
  ldCount,
  ctpCount,
  sideWinners,
  coursePars,
}: {
  teamId: number;
  standings: readonly RankedStanding[];
  teamById: Map<number, SideTournamentTeam>;
  ldCount: number;
  ctpCount: number;
  sideWinners: readonly SideTournamentSlotWinner[];
  coursePars: number[];
}): Record<SideGroupId, AwardRow[]> | null {
  const myStanding = standings.find((s) => s.teamId === teamId);
  if (!myStanding) return null;
  const awards = myStanding.awards;

  // Et 1-manns-lag: «hele laget +6 på hull 12» leses feil når laget er én
  // spiller. Snowman er den eneste lag-formede utdelingen som fyrer for solo
  // (resten er gated på minst to medlemmer i motoren).
  const isSoloTeam = (teamById.get(teamId)?.members.length ?? 0) === 1;

  const rows: Record<SideGroupId, AwardRow[]> = {
    hovedkonkurranser: [],
    skill: [],
    moderate: [],
    hull: [],
    achievements: [],
    penalty: [],
  };

  const push = (
    group: SideGroupId,
    category: string,
    points: number,
    key: string,
    label: string,
    tail = '',
  ) => {
    rows[group].push({ key, category, points, label, tail });
  };

  /** Hvilke ANDRE lag deler denne utdelingen? */
  const tieMates = (category: string): number[] =>
    standings
      .filter(
        (s) =>
          s.teamId !== teamId && s.awards.some((a) => a.category === category),
      )
      .map((s) => s.teamId);

  const tieSuffix = (others: number[]): string => {
    if (others.length === 0) return '';
    const labels = others.map(
      (id) =>
        teamById.get(id)?.label ?? fillCopy(SIDE_TEXT.teamFallback, { id }),
    );
    if (labels.length === 1) {
      return fillCopy(SIDE_TEXT.tieOne, { team: labels[0] ?? '' });
    }
    if (labels.length === 2) {
      return fillCopy(SIDE_TEXT.tieTwo, {
        team1: labels[0] ?? '',
        team2: labels[1] ?? '',
      });
    }
    return fillCopy(SIDE_TEXT.tieMany, {
      teams: labels.slice(0, -1).join(', '),
      last: labels[labels.length - 1] ?? '',
    });
  };

  const findAward = (category: SideCategory): SideCategoryAward | undefined =>
    awards.find((a) => a.category === category);

  const has = (category: SideCategory): boolean =>
    awards.some((a) => a.category === category);

  const winnerName = (award: SideCategoryAward | undefined): string =>
    firstNameOf(award?.winnerUserId, teamById) ?? '?';

  /** «hull 3–9» eller «hull 7» når streaken er ett hull. */
  const streakRange = (startHole: number, endHole: number): string =>
    startHole === endHole
      ? fillCopy(SIDE_TEXT.streakSingle, { hole: startHole })
      : fillCopy(SIDE_TEXT.streakRange, { start: startHole, end: endHole });

  /** Lag- + individ-linjene for gruppens {@link SIMPLE_DUAL_AWARDS}-par. */
  const pushSimpleDualAwards = (group: SideGroupId) => {
    for (const def of SIMPLE_DUAL_AWARDS) {
      if (def.group !== group) continue;
      if (has(def.teamCategory)) {
        const points = SIDE_TOURNAMENT_POINTS[def.teamPointsKey];
        push(
          group,
          def.teamCategory,
          points,
          def.teamCategory,
          awardLabel(def.teamCategory),
          tieSuffix(tieMates(def.teamCategory)),
        );
      }
      if (has(def.individualCategory)) {
        const points = SIDE_TOURNAMENT_POINTS[def.individualPointsKey];
        push(
          group,
          def.individualCategory,
          points,
          def.individualCategory,
          awardLabel(def.individualCategory, {
            name: winnerName(findAward(def.individualCategory)),
          }),
        );
      }
    }
  };

  // ─── Hovedkonkurranser ──────────────────────────────────────────────────
  const mainCompetitions: ReadonlyArray<
    [SideCategory, keyof typeof SIDE_TOURNAMENT_POINTS]
  > = [
    ['best_netto_18', 'bestNetto18'],
    ['best_netto_front9', 'bestNettoF9'],
    ['best_netto_back9', 'bestNettoB9'],
  ];
  for (const [category, pointsKey] of mainCompetitions) {
    if (!has(category)) continue;
    push(
      'hovedkonkurranser',
      category,
      SIDE_TOURNAMENT_POINTS[pointsKey],
      category,
      awardLabel(category),
      tieSuffix(tieMates(category)),
    );
  }

  // ─── Ferdighet og sjeldenhet ────────────────────────────────────────────
  pushSimpleDualAwards('skill');
  const skillSolos: ReadonlyArray<
    [SideCategory, keyof typeof SIDE_TOURNAMENT_POINTS]
  > = [
    ['clean_front_9', 'cleanFront9'],
    ['clean_back_9', 'cleanBack9'],
    ['no_double_plus_round', 'noDoublePlusRound'],
  ];
  for (const [category, pointsKey] of skillSolos) {
    const award = findAward(category);
    if (!award) continue;
    push(
      'skill',
      category,
      SIDE_TOURNAMENT_POINTS[pointsKey],
      category,
      awardLabel(category, { name: winnerName(award) }),
    );
  }
  {
    const streak = findAward('longest_bogey_free_streak');
    if (streak) {
      const name = winnerName(streak);
      const range =
        streak.streakStartHole != null && streak.streakEndHole != null
          ? streakRange(streak.streakStartHole, streak.streakEndHole)
          : null;
      const detail = range
        ? fillCopy(SIDE_TEXT.longestBogeyFreeDetail, {
            name,
            count: streak.streakLength ?? 0,
            range,
          })
        : name;
      push(
        'skill',
        'longest_bogey_free_streak',
        SIDE_TOURNAMENT_POINTS.longestBogeyFreeStreak,
        'longest_bogey_free_streak',
        awardLabel('longest_bogey_free_streak', { detail }),
      );
    }
  }

  // ─── Moderat ────────────────────────────────────────────────────────────
  pushSimpleDualAwards('moderate');
  {
    const low = findAward('lowest_single_hole_brutto');
    if (low) {
      const name = winnerName(low);
      const detail =
        low.score != null && low.holeNumber != null
          ? fillCopy(SIDE_TEXT.scoreOnHole, {
              name,
              score: low.score,
              hole: low.holeNumber,
            })
          : name;
      push(
        'moderate',
        'lowest_single_hole_brutto',
        SIDE_TOURNAMENT_POINTS.lowestSingleHoleBrutto,
        'lowest_single_hole_brutto',
        awardLabel('lowest_single_hole_brutto', { detail }),
      );
    }
  }
  {
    const hardest = findAward('hardest_hole_winner');
    if (hardest) {
      const name = winnerName(hardest);
      const detail =
        hardest.score != null && hardest.holeNumber != null
          ? fillCopy(SIDE_TEXT.scoreOnHoleBrutto, {
              name,
              score: hardest.score,
              hole: hardest.holeNumber,
            })
          : name;
      push(
        'moderate',
        'hardest_hole_winner',
        SIDE_TOURNAMENT_POINTS.hardestHoleWinner,
        'hardest_hole_winner',
        awardLabel('hardest_hole_winner', { detail }),
      );
    }
  }
  {
    const comeback = findAward('comeback_kid');
    if (comeback) {
      const name = winnerName(comeback);
      const detail =
        comeback.delta != null
          ? fillCopy(SIDE_TEXT.comebackDetail, {
              name,
              delta: Math.abs(comeback.delta),
            })
          : name;
      push(
        'moderate',
        'comeback_kid',
        SIDE_TOURNAMENT_POINTS.comebackKid,
        'comeback_kid',
        awardLabel('comeback_kid', { detail }),
      );
    }
  }
  const moderateSolos: ReadonlyArray<
    [SideCategory, keyof typeof SIDE_TOURNAMENT_POINTS]
  > = [
    ['all_par_groups_birdie', 'allParGroupsBirdie'],
    ['even_par_round', 'evenParRound'],
  ];
  for (const [category, pointsKey] of moderateSolos) {
    const award = findAward(category);
    if (!award) continue;
    push(
      'moderate',
      category,
      SIDE_TOURNAMENT_POINTS[pointsKey],
      category,
      awardLabel(category, { name: winnerName(award) }),
    );
  }
  {
    // Stablebar: én utdeling per birdie-par. Slås sammen per spiller, med
    // hullene listet — to separate «To birdier på rad»-linjer for samme mann
    // ville lest som en feil.
    const backToBack = awards.filter(
      (a) => a.category === 'back_to_back_birdies',
    );
    if (backToBack.length > 0) {
      const byUser = new Map<string, { points: number; ranges: string[] }>();
      for (const award of backToBack) {
        const uid = award.winnerUserId ?? '?';
        const entry = byUser.get(uid) ?? { points: 0, ranges: [] };
        entry.points += award.points;
        if (award.streakStartHole != null && award.streakEndHole != null) {
          entry.ranges.push(
            streakRange(award.streakStartHole, award.streakEndHole),
          );
        }
        byUser.set(uid, entry);
      }
      for (const [uid, entry] of byUser) {
        const name = firstNameOf(uid === '?' ? null : uid, teamById) ?? '?';
        const detail =
          entry.ranges.length > 0 ? `${name}, ${entry.ranges.join(', ')}` : name;
        push(
          'moderate',
          'back_to_back_birdies',
          entry.points,
          `back_to_back_birdies_${uid}`,
          awardLabel('back_to_back_birdies', { detail }),
        );
      }
    }
  }

  // ─── Hull-konkurranser ──────────────────────────────────────────────────
  {
    const holeWins = awards.filter((a) => a.category === 'hole_win');
    if (holeWins.length > 0) {
      const holes = holeWins
        .map((a) => a.holeNumber)
        .filter((hole): hole is number => typeof hole === 'number');
      const points = holeWins.reduce((sum, a) => sum + a.points, 0);
      push(
        'hull',
        'hole_win',
        points,
        'hole_win',
        awardLabel('hole_win'),
        ` ${fillCopy(SIDE_AWARD_LABELS.holeWinsOn, {
          count: holes.length,
          holes: formatHolesList(holes, SIDE_TEXT.holeWord),
        })}`,
      );
    }
  }
  // LD/CTP: sloten havner hos laget vinneren spiller for.
  const pushSlots = (
    category: SideTournamentSlotWinner['category'],
    count: number,
    pointsKey: keyof typeof SIDE_TOURNAMENT_POINTS,
    prefix: string,
  ) => {
    for (let pos = 1; pos <= count; pos++) {
      const winner = sideWinners.find(
        (row) => row.category === category && row.position === pos,
      );
      if (!winner) continue;
      const winnerTeamId = winner.winnerUserId
        ? findTeamForUser(winner.winnerUserId, teamById)
        : null;
      if (winnerTeamId !== teamId) continue;
      push(
        'hull',
        category,
        SIDE_TOURNAMENT_POINTS[pointsKey],
        `${prefix}_${pos}`,
        awardLabel(category, {
          pos,
          name: firstNameOf(winner.winnerUserId, teamById) ?? '?',
        }),
      );
    }
  };
  pushSlots('longest_drive', ldCount, 'longestDrive', 'ld');
  pushSlots('closest_to_pin', ctpCount, 'closestToPin', 'ctp');

  // ─── Bragder ────────────────────────────────────────────────────────────
  // Turkey og Solid er stablebare, og finnes i to former: én per spiller med
  // streak, og lag-bonusen når ALLE på laget har en streak over samme vindu.
  // `coordBonus` skiller dem — og bærer poengsummen selv, siden lag-bonusen
  // multipliseres med antall medlemmer.
  for (const category of ['turkey', 'solid'] as const) {
    for (const award of awards.filter((a) => a.category === category)) {
      const start = award.streakStartHole;
      const end = award.streakEndHole;
      const range =
        start != null && end != null ? ` (${streakRange(start, end)})` : '';
      if (award.coordBonus) {
        push(
          'achievements',
          category,
          award.points,
          `${category}_coord_${start ?? '?'}_${end ?? '?'}`,
          awardLabel(category, { range }, 'coord'),
        );
      } else {
        const name = firstNameOf(award.winnerUserId, teamById) ?? '?';
        const detail =
          start != null && end != null
            ? `${name}, ${streakRange(start, end)}`
            : name;
        push(
          'achievements',
          category,
          award.points,
          `${category}_${award.winnerUserId ?? '?'}_${start ?? '?'}_${end ?? '?'}`,
          awardLabel(category, { detail }),
        );
      }
    }
  }
  for (const award of awards.filter(
    (a) => a.category === 'team_all_birdied_bonus',
  )) {
    push(
      'achievements',
      'team_all_birdied_bonus',
      award.points,
      `team_all_birdied_bonus_${award.teamId}`,
      awardLabel('team_all_birdied_bonus'),
    );
  }
  for (const award of awards.filter(
    (a) => a.category === 'team_no_bogey_hole_coord',
  )) {
    const detail =
      award.holeNumber != null
        ? ` (${fillCopy(SIDE_TEXT.streakSingle, { hole: award.holeNumber })})`
        : '';
    push(
      'achievements',
      'team_no_bogey_hole_coord',
      award.points,
      `team_no_bogey_hole_coord_${award.holeNumber ?? '?'}`,
      awardLabel('team_no_bogey_hole_coord', { detail }),
    );
  }

  // ─── Minuspoeng ─────────────────────────────────────────────────────────
  for (const award of awards.filter((a) => a.category === 'snowman')) {
    const hole = award.holeNumber;
    const overDelta = award.score;
    let detail = '?';
    if (hole != null && overDelta != null) {
      detail = fillCopy(
        isSoloTeam ? SIDE_TEXT.snowmanDetailSolo : SIDE_TEXT.snowmanDetail,
        { delta: overDelta, hole },
      );
    } else if (hole != null) {
      // Uten par for hullet kan vi ikke si hvor mye over det var; da står
      // hullet alene i stedet for at en «+undefined» slipper ut.
      detail =
        coursePars[hole - 1] != null
          ? fillCopy(
              isSoloTeam
                ? SIDE_TEXT.snowmanDetailHoleSolo
                : SIDE_TEXT.snowmanDetailHole,
              { hole },
            )
          : fillCopy(SIDE_TEXT.streakSingle, { hole });
    }
    push(
      'penalty',
      'snowman',
      award.points,
      `snowman_${hole ?? '?'}`,
      awardLabel('snowman', { detail }),
    );
  }
  {
    const worst = findAward('worst_single_hole_brutto');
    if (worst) {
      const name = winnerName(worst);
      const detail =
        worst.score != null && worst.holeNumber != null
          ? fillCopy(SIDE_TEXT.scoreOnHole, {
              name,
              score: worst.score,
              hole: worst.holeNumber,
            })
          : name;
      push(
        'penalty',
        'worst_single_hole_brutto',
        SIDE_TOURNAMENT_POINTS.worstSingleHoleBrutto,
        'worst_single_hole_brutto',
        awardLabel('worst_single_hole_brutto', { detail }),
      );
    }
  }
  {
    const doubles = findAward('most_double_bogeys_individual');
    if (doubles) {
      push(
        'penalty',
        'most_double_bogeys_individual',
        SIDE_TOURNAMENT_POINTS.mostDoubleBogeysIndividual,
        'most_double_bogeys_individual',
        awardLabel('most_double_bogeys_individual', {
          name: winnerName(doubles),
        }),
      );
    }
  }

  const total = GROUP_ORDER.reduce((sum, group) => sum + rows[group].length, 0);
  if (total === 0) return null;

  for (const group of GROUP_ORDER) {
    rows[group].sort((a, b) =>
      b.points !== a.points
        ? b.points - a.points
        : a.category.localeCompare(b.category),
    );
  }
  return rows;
}

const styles = StyleSheet.create({
  headline: {
    fontSize: 15,
    fontFamily: FONTS.serifDisplay,
    color: COLORS.forest,
    marginTop: 2,
  },
  teamCard: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 8,
    overflow: 'hidden',
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: TAP,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  summaryMain: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  medal: { fontSize: 18 },
  teamTitle: {
    flexShrink: 1,
    fontSize: 16,
    fontFamily: FONTS.serifScore,
    color: COLORS.forest,
  },
  members: {
    marginTop: 2,
    fontSize: 12,
    fontFamily: FONTS.sans,
    color: COLORS.muted,
  },
  points: { fontSize: 16, fontFamily: FONTS.serifScore, color: COLORS.forest },
  chevron: { fontSize: 14, fontFamily: FONTS.sans, color: COLORS.muted },
  body: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 12,
  },
  groupTitle: {
    marginBottom: 4,
    fontSize: 11,
    fontFamily: FONTS.sansSemiBold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: COLORS.muted,
  },
  groupTitlePenalty: { color: COLORS.error },
  awardRow: {
    marginTop: 2,
    fontSize: 15,
    fontFamily: FONTS.serifDisplay,
    color: COLORS.forest,
  },
  negative: { color: COLORS.error },
});
