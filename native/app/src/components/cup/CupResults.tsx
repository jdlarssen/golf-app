// #2752: resultatene i en ferdig cup, det nettets `/cup/[id]/resultater` viser:
// vinneren eller delt seier, lagenes poeng, kåringene, spillerpoengene og
// sidepoengene hull for hull. Tallene kommer ferdig regnet fra serveren.
//
// Bare en ferdig cup har `results` (#1468), så denne tegnes aldri mens den pågår.
import { StyleSheet, Text, View } from 'react-native';
import type { AppCupResults, AppCupView } from '../../../../../lib/cup/appCupView';
import type { CupSideAwardDetailRow } from '../../../../../lib/cup/sideAwardDetails';
import { CUP_TEXT, contributionLine, cupPoints, matchesSummary } from '../../lib/cupCopy';
import { formatNameList } from '../../lib/display';
import { formatMessage } from '../../lib/kavalkadeCopy';
import { FONTS, fraunces, interLine, useTheme, withAlpha } from '../../theme';

/** Vinneren eller «Uavgjort», under navnet i toppen. */
export function CupResultLine({ results }: { results: AppCupResults }) {
  const { colors } = useTheme();
  return results.winnerName ? (
    <Text style={[styles.winner, { color: colors.accentText }]} testID="cup-winner">
      {formatMessage(CUP_TEXT.winner, { team: results.winnerName })}
    </Text>
  ) : (
    <Text style={[styles.tied, { color: colors.muted }]} testID="cup-tied">
      {CUP_TEXT.tied}
    </Text>
  );
}

export function CupResults({
  view,
  results,
  userId,
}: {
  view: AppCupView;
  results: AppCupResults;
  userId: string;
}) {
  const { colors } = useTheme();
  const nameOfTeam = (team: 1 | 2) => (team === 1 ? view.team1Name : view.team2Name);
  const sidePoints = results.sideAwardPoints;
  // «8 av 8 matcher spilt · Sidepoeng: 2–1»
  const summary = [
    matchesSummary(view.progress),
    ...(sidePoints
      ? [
          formatMessage(CUP_TEXT.sideAwardPoints, {
            points: `${cupPoints(sidePoints.team1)}–${cupPoints(sidePoints.team2)}`,
          }),
        ]
      : []),
  ].join(' · ');

  return (
    <View testID="cup-results">
      <View style={styles.teams} testID="cup-totals">
        {([1, 2] as const).map((team) => {
          const won = results.winner === team;
          return (
            <View
              key={team}
              style={[
                styles.team,
                won
                  ? { backgroundColor: withAlpha(colors.accent, 0.14), borderColor: withAlpha(colors.accent, 0.45) }
                  : { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
              testID={`cup-team-${team}`}
            >
              <Text style={[styles.teamName, { color: colors.muted }]}>{nameOfTeam(team)}</Text>
              <Text style={[styles.teamPoints, { color: colors.primary }]}>
                {cupPoints(team === 1 ? results.team1Points : results.team2Points)}
              </Text>
            </View>
          );
        })}
      </View>
      <Text style={[styles.centered, { color: colors.muted }]} testID="cup-summary">
        {summary}
      </Text>

      {results.mvp || results.underperformer ? (
        <View testID="cup-awards">
          <Heading text={CUP_TEXT.awardsHeading} />
          {results.mvp ? (
            <Card
              label={CUP_TEXT.mvpLabel}
              title={formatNameList(results.mvp.names)}
              value={formatMessage(CUP_TEXT.mvpValue, { points: cupPoints(results.mvp.points) })}
            />
          ) : null}
          {results.underperformer ? (
            <Card
              label={CUP_TEXT.underperformerLabel}
              title={formatNameList(results.underperformer.names)}
              value={formatMessage(CUP_TEXT.underperformerValue, { strokes: results.underperformer.overPar })}
            />
          ) : null}
        </View>
      ) : null}

      {results.playerGroups.length > 0 ? (
        <View testID="cup-player-points">
          {results.playerGroups.map((group) => (
            <View key={group.team}>
              <Heading text={`${CUP_TEXT.playerPointsHeading} · ${group.teamName}`} />
              {group.rows.map((row) => (
                <View
                  key={row.userId}
                  style={[
                    styles.card,
                    row.userId === userId
                      ? { backgroundColor: withAlpha(colors.accent, 0.14), borderColor: withAlpha(colors.accent, 0.45) }
                      : { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                  testID={`cup-player-${row.userId}`}
                >
                  <View style={styles.cardText}>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>
                      {row.displayName}
                      {row.withdrawn ? <Text style={{ color: colors.muted }}> · {CUP_TEXT.withdrawnChip}</Text> : null}
                    </Text>
                    {row.userId === userId ? (
                      <Text style={[styles.cardLabel, { color: colors.accentText }]}>{CUP_TEXT.yourPoints}</Text>
                    ) : null}
                    {row.contributions.map((contribution) => (
                      <Text
                        key={contribution.type === 'match' ? contribution.gameId : `${contribution.type}-${contribution.holeNumber}`}
                        style={[styles.sub, { color: colors.muted }]}
                      >
                        {contributionLine(contribution)}
                      </Text>
                    ))}
                  </View>
                  <Text style={[styles.points, { color: colors.primary }]}>{cupPoints(row.points)}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      ) : null}

      {results.sideAwards.length > 0 ? (
        <View testID="cup-side-awards">
          <Heading text={CUP_TEXT.sideAwardsHeading} />
          <Text style={[styles.hint, { color: colors.muted }]}>{CUP_TEXT.sideAwardsHint}</Text>
          {results.sideAwards.map((group) => (
            <View key={group.holeNumber}>
              {group.rows.map((row) => (
                <SideAwardRow key={row.id} holeNumber={group.holeNumber} row={row} nameOfTeam={nameOfTeam} />
              ))}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function SideAwardRow({
  holeNumber,
  row,
  nameOfTeam,
}: {
  holeNumber: number;
  row: CupSideAwardDetailRow;
  nameOfTeam: (team: 1 | 2) => string;
}) {
  const { colors } = useTheme();
  const cardColors = { backgroundColor: colors.surface, borderColor: colors.border };
  const hole = formatMessage(CUP_TEXT.holeShort, { n: holeNumber });

  if (row.kind === 'gir') {
    return (
      <View style={[styles.card, cardColors]} testID={`cup-side-award-${row.id}`}>
        <View style={styles.cardText}>
          <Text style={[styles.cardLabel, { color: colors.muted }]}>{`${hole} · ${CUP_TEXT.kindGir}`}</Text>
          {row.registered ? (
            row.teams.map((team) => (
              <Text key={team.team} style={[styles.sub, { color: colors.text }]}>
                {formatMessage(CUP_TEXT.sideAwardGirTeam, {
                  team: nameOfTeam(team.team),
                  count: team.count ?? 0,
                  max: row.maxPerTeam,
                  points: cupPoints(team.points),
                })}
              </Text>
            ))
          ) : (
            <Text style={[styles.sub, { color: colors.muted }]}>{CUP_TEXT.sideAwardUnregistered}</Text>
          )}
        </View>
      </View>
    );
  }

  const kind = row.kind === 'ctp' ? CUP_TEXT.kindCtp : CUP_TEXT.kindLd;
  const slot = row.showSlot ? ` ${formatMessage(CUP_TEXT.slotOfCount, { slot: row.slot, count: row.slotCount })}` : '';
  const text =
    row.outcome === 'noWinner'
      ? CUP_TEXT.sideAwardNoWinner
      : row.outcome === 'unregistered'
        ? CUP_TEXT.sideAwardUnregistered
        : row.winnerTeam
          ? formatMessage(CUP_TEXT.sideAwardWinnerOnTeam, {
              name: row.winnerName ?? '',
              team: nameOfTeam(row.winnerTeam),
            })
          : (row.winnerName ?? '');
  return (
    <View style={[styles.card, cardColors]} testID={`cup-side-award-${row.id}`}>
      <View style={styles.cardText}>
        <Text style={[styles.cardLabel, { color: colors.muted }]}>{`${hole} · ${kind}${slot}`}</Text>
        <Text style={[styles.cardTitle, { color: colors.text }]}>{text}</Text>
      </View>
      {row.outcome === 'won' ? (
        <Text style={[styles.points, { color: colors.primary }]}>
          {formatMessage(CUP_TEXT.sideAwardPlus, { points: cupPoints(row.points) })}
        </Text>
      ) : null}
    </View>
  );
}

function Heading({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <Text accessibilityRole="header" style={[styles.heading, { color: colors.muted }]}>
      {text}
    </Text>
  );
}

function Card({ label, title, value }: { label: string; title: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.cardText}>
        <Text style={[styles.cardLabel, { color: colors.muted }]}>{label}</Text>
        <Text style={[styles.cardTitle, { color: colors.text }]}>{title}</Text>
      </View>
      <Text style={[styles.value, { color: colors.muted }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  winner: { fontSize: 15, fontFamily: FONTS.sansSemiBold },
  tied: { fontSize: 15, fontFamily: FONTS.sans },
  teams: { flexDirection: 'row', gap: 10, marginTop: 4 },
  team: { flex: 1, alignItems: 'center', gap: 4, padding: 14, borderRadius: 16, borderWidth: 1 },
  teamName: { fontSize: 12, fontFamily: FONTS.sansSemiBold, textAlign: 'center' },
  teamPoints: { ...fraunces(500, 36, 40) },
  centered: { ...interLine(12, 16, { multiline: true }), fontFamily: FONTS.sans, textAlign: 'center', paddingTop: 4 },
  heading: { fontSize: 12, fontFamily: FONTS.sansSemiBold, marginTop: 16, marginBottom: 6 },
  hint: { ...interLine(12, 16, { multiline: true }), fontFamily: FONTS.sans, marginBottom: 8 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, marginBottom: 8 },
  value: { flexShrink: 1, maxWidth: 150, textAlign: 'right', fontSize: 12, fontFamily: FONTS.sans },
  cardText: { flex: 1, gap: 2 },
  cardLabel: { fontSize: 12, fontFamily: FONTS.sansSemiBold },
  cardTitle: { ...fraunces(500, 15, 20, { multiline: true }) },
  sub: { ...interLine(12, 16, { multiline: true }), fontFamily: FONTS.sans },
  points: { ...fraunces(500, 18) },
});
