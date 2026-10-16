// «Hvem sitt utslag ble brukt?» på hullsiden i appen (#2580), som
// `Utslag-forslag-hull`, `-hull-laast` og `-shamble-hull` tegner det, og som
// webbens TeeShotPicker. Ett trykk velger lagets utslag på hullet, et trykk på
// det valgte navnet tømmer det. Hvem som kan velges, låsen mot slutten,
// leveringslåsen og linja under knappene kommer fra lib/games/teeShots.ts;
// setningene fra `teeShotsCopy.ts`. Skrivingen gjør skjermen (`onPick`), så
// komponenten bare viser og melder trykket.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { GameMode } from '../../../../../lib/scoring/modes/types';
import { deliveryCoversWholeTeam } from '../../../../../lib/games/teamDelivery';
import { selectableOnHole, teamTeeShotDelivery, teeShotHoleLine } from '../../../../../lib/games/teeShots';
import { FONTS, interLine, useTheme } from '../../theme';
import {
  teamTeeShotState,
  teeShotNameOf,
  type TeeShotRowLike,
  type TeeShotTeam,
} from '../../lib/teeShotTeams';
import { teeShotButtonLabel, teeShotCountText, teeShotHoleLineText, teeShotsT } from '../../lib/teeShotsCopy';
import { UtslagHakeIcon } from '../icons/Icons';

export function TeeShotPicker({
  holeNumber,
  gameMode,
  minimum,
  teams,
  rows,
  disabled,
  onPick,
}: {
  holeNumber: number;
  gameMode: GameMode;
  minimum: number;
  /** Lagene i flighten: ett per lagkort i scramble, ett i shamble. */
  teams: readonly TeeShotTeam[];
  /** Spillets valg fra den lokale basen (`useTeamTeeShots`). */
  rows: readonly TeeShotRowLike[];
  /** Spillet er ikke aktivt, eller den som ser siden er trukket. */
  disabled: boolean;
  /** Lagets nye valg på hullet; null tømmer det. */
  onPick: (teamNumber: number, teeShotBy: string | null) => void;
}) {
  return (
    <View testID="tee-shot-picker">
      {teams.map((team) => (
        <TeamBlock
          key={team.teamNumber}
          holeNumber={holeNumber}
          gameMode={gameMode}
          minimum={minimum}
          team={team}
          rows={rows}
          showTeamLabel={teams.length > 1}
          disabled={disabled}
          onPick={onPick}
        />
      ))}
    </View>
  );
}

function TeamBlock({
  holeNumber,
  gameMode,
  minimum,
  team,
  rows,
  showTeamLabel,
  disabled,
  onPick,
}: {
  holeNumber: number;
  gameMode: GameMode;
  minimum: number;
  team: TeeShotTeam;
  rows: readonly TeeShotRowLike[];
  showTeamLabel: boolean;
  disabled: boolean;
  onPick: (teamNumber: number, teeShotBy: string | null) => void;
}) {
  const { colors } = useTheme();
  const nameOf = teeShotNameOf(team);
  const { input, status } = teamTeeShotState(team, minimum, rows);
  const delivery = teamTeeShotDelivery(gameMode, team.members);
  const selectable = new Set(selectableOnHole(status, input, holeNumber, delivery));
  const current =
    rows.find((r) => r.teamNumber === team.teamNumber && r.holeNumber === holeNumber)?.teeShotBy ?? null;
  const lockInEffect = input.memberIds.some((id) => !selectable.has(id));
  const line = teeShotHoleLineText(teeShotHoleLine(status, delivery), nameOf);
  // Tegningene: 56 pt under et lagkort, 52 pt under shamble-radene.
  const minHeight = deliveryCoversWholeTeam(gameMode) ? 56 : 52;

  return (
    <View testID={`tee-shot-team-${team.teamNumber}`}>
      <View style={[styles.head, deliveryCoversWholeTeam(gameMode) ? null : styles.headShamble]}>
        <Text style={[styles.question, { color: colors.text }]} accessibilityRole="header">
          {showTeamLabel ? `${teeShotsT('teamLabel', { team: team.teamNumber })} · ` : ''}
          {teeShotsT('question')}
        </Text>
        <Text style={[styles.minimum, { color: colors.muted }]} numberOfLines={1}>
          {teeShotsT('minimum', { min: minimum })}
        </Text>
      </View>
      <View style={styles.grid}>
        {status.players.map((player) => {
          const name = nameOf(player.userId);
          const chosen = player.userId === current;
          const canTap = !disabled && selectable.has(player.userId);
          const reached = player.missing === 0;
          const look = !canTap
            ? { backgroundColor: colors.bg, borderColor: colors.scoreUnsetFg, borderWidth: 1, borderStyle: 'dashed' as const }
            : chosen
              ? { backgroundColor: colors.primary, borderColor: colors.primary, borderWidth: 2 }
              : lockInEffect
                ? { backgroundColor: colors.surface, borderColor: colors.primary, borderWidth: 2 }
                : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 };
          const nameColor = !canTap ? colors.muted : chosen ? colors.onPrimary : colors.text;
          const countColor = !canTap
            ? colors.muted
            : chosen
              ? colors.onPrimary
              : lockInEffect
                ? colors.primary
                : colors.muted;
          const countBold = canTap && (chosen || lockInEffect);
          return (
            <Pressable
              key={player.userId}
              onPress={() => onPick(team.teamNumber, chosen ? null : player.userId)}
              disabled={!canTap}
              accessibilityRole="button"
              accessibilityLabel={teeShotButtonLabel(name, player, minimum, canTap)}
              accessibilityHint={!canTap && line ? line : undefined}
              accessibilityState={{ selected: chosen, disabled: !canTap }}
              testID={`tee-shot-${player.userId}`}
              style={[styles.button, { minHeight }, look]}
            >
              <Text
                style={[styles.name, { color: nameColor, fontFamily: canTap ? FONTS.sansSemiBold : FONTS.sansMedium }]}
                numberOfLines={1}
              >
                {name}
              </Text>
              <View style={styles.countRow}>
                {reached ? <UtslagHakeIcon color={countColor} /> : null}
                <Text
                  style={[
                    styles.count,
                    { color: countColor, fontFamily: countBold ? FONTS.sansSemiBold : FONTS.sans },
                  ]}
                >
                  {teeShotCountText(player, minimum)}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      {line ? (
        <Text style={[styles.line, { color: colors.muted }]} testID={`tee-shot-line-${team.teamNumber}`}>
          {line}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Tegningene: 16/20/8 over lagkortet, 12/20/8 under shamble-radene.
  head: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  headShamble: { paddingTop: 12 },
  question: { ...interLine(14, 17), fontFamily: FONTS.sansSemiBold, flexShrink: 1 },
  minimum: { ...interLine(12, 15), fontFamily: FONTS.sans },
  grid: { flexDirection: 'row', gap: 8, paddingHorizontal: 16 },
  button: {
    flex: 1,
    minWidth: 0,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  name: { ...interLine(14, 17), maxWidth: '100%' },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  count: { ...interLine(11, 14), fontVariant: ['tabular-nums'] },
  line: { ...interLine(12, 15), fontFamily: FONTS.sans, paddingTop: 8, paddingHorizontal: 20 },
});
