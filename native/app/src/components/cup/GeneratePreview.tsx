// #2752: steg 2 i «Fordel & generer»: forslaget, med bytte av spillere. Nettets
// `Step2Preview`, `Step2BundlePreview`, `GreensomeCard` og `Step2Confirm`. På nettet er
// plassene `<select>`. Her åpner et trykk lista under kortet, og valget lukker den.
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  computeSpillehandicap,
  greensomeDefaultOrFallback,
  isSplitDayPreset,
  playerLookup,
  type CupBatchMatch,
  type PlanMatch,
  type TeamStrokesInputs,
  type WizardPlayer,
  type WizardTeeBox,
} from '../../../../../lib/cup/matchPlan';
import {
  getFlightMatchupRows,
  groupBundleMatchesByFlight,
  type FlightTeamSide,
} from '../../../../../lib/cup/splitDayLineup';
import type { CupBundleFormat, PlannedBundleMatch } from '../../../../../lib/cup/cupPairing';
import { ChevronIcon } from '../icons/Icons';
import { FORMAT_LABELS, GENERATE_TEXT, spillehandicapText } from '../../lib/cupGenerateCopy';
import { formatMessage } from '../../lib/kavalkadeCopy';
import { formatHcpNb } from '../../lib/profileCopy';
import { FONTS, fraunces, interLine, TAP, useTheme } from '../../theme';

type SharedProps = {
  matches: readonly PlanMatch[];
  team1Name: string;
  team2Name: string;
  team1Players: WizardPlayer[];
  team2Players: WizardPlayer[];
};

export function GeneratePreview({
  presetId,
  selectedTee,
  teamStrokesInputs,
  onTeamStrokesChange,
  onMatchChange,
  onSwapPlayer,
  ...shared
}: SharedProps & {
  presetId: string;
  selectedTee: WizardTeeBox;
  teamStrokesInputs: TeamStrokesInputs;
  onTeamStrokesChange: (matchId: string, side: 'team1' | 'team2', value: string) => void;
  onMatchChange: (matchId: string, side: 'side1' | 'side2', idx: number, userId: string) => void;
  onSwapPlayer: (flightIndex: number, side: FlightTeamSide, slotIndex: 0 | 1, playerId: string) => void;
}) {
  return isSplitDayPreset(presetId) ? (
    <BundlePreview
      {...shared}
      selectedTee={selectedTee}
      teamStrokesInputs={teamStrokesInputs}
      onTeamStrokesChange={onTeamStrokesChange}
      onSwapPlayer={onSwapPlayer}
    />
  ) : (
    <PlainPreview {...shared} onMatchChange={onMatchChange} />
  );
}

function PlainPreview({
  matches,
  team1Name,
  team2Name,
  team1Players,
  team2Players,
  onMatchChange,
}: SharedProps & {
  onMatchChange: (matchId: string, side: 'side1' | 'side2', idx: number, userId: string) => void;
}) {
  const { colors, ui } = useTheme();
  const [open, setOpen] = useState<string | null>(null);
  const name = nameLookup(team1Players, team2Players);
  const formats = [...new Set(matches.map((match) => match.format))];

  const sideOf = (match: PlanMatch, side: 'side1' | 'side2') => {
    const team = side === 'side1' ? team1Name : team2Name;
    const ids = side === 'side1' ? match.side1 : match.side2;
    return (
      <View style={styles.side}>
        <Text style={[styles.label, { color: colors.muted }]}>{team}</Text>
        {ids.map((userId, idx) => {
          const key = `${match.id}:${side}:${idx}`;
          return (
            <PlayerSlot
              key={key}
              name={name(userId)}
              open={open === key}
              label={formatMessage(GENERATE_TEXT.matchPlayer, { match: match.label, team, n: idx + 1 })}
              onPress={() => setOpen(open === key ? null : key)}
              testID={`cup-generate-slot-${key}`}
            />
          );
        })}
      </View>
    );
  };

  const pickerFor = (match: PlanMatch) => {
    const parts = open?.split(':');
    if (!parts || parts[0] !== match.id) return null;
    const side = parts[1] as 'side1' | 'side2';
    const idx = Number(parts[2]);
    const ids = side === 'side1' ? match.side1 : match.side2;
    const current = ids[idx];
    return (
      <PlayerPicker
        players={side === 'side1' ? team1Players : team2Players}
        isDisabled={(id) => id !== current && ids.includes(id)}
        current={current}
        onChoose={(id) => {
          setOpen(null);
          if (id !== current) onMatchChange(match.id, side, idx, id);
        }}
        testID={`cup-generate-picker-${match.id}`}
      />
    );
  };

  return (
    <View testID="cup-generate-preview">
      {formats.map((format) => (
        <View key={format}>
          <Text style={[ui.sectionTitle, styles.heading]}>{FORMAT_LABELS[format]}</Text>
          {matches
            .filter((match) => match.format === format)
            .map((match) => (
              <Card key={match.id} testID={`cup-generate-match-${match.id}`}>
                <Text style={[styles.label, { color: colors.muted }]}>{match.label}</Text>
                <View style={styles.versus}>
                  {sideOf(match, 'side1')}
                  <Text style={[styles.mot, { color: colors.muted }]}>{GENERATE_TEXT.mot}</Text>
                  {sideOf(match, 'side2')}
                </View>
                {pickerFor(match)}
              </Card>
            ))}
        </View>
      ))}
    </View>
  );
}

function BundlePreview({
  matches,
  team1Name,
  team2Name,
  team1Players,
  team2Players,
  selectedTee,
  teamStrokesInputs,
  onTeamStrokesChange,
  onSwapPlayer,
}: SharedProps & {
  selectedTee: WizardTeeBox;
  teamStrokesInputs: TeamStrokesInputs;
  onTeamStrokesChange: (matchId: string, side: 'team1' | 'team2', value: string) => void;
  onSwapPlayer: (flightIndex: number, side: FlightTeamSide, slotIndex: 0 | 1, playerId: string) => void;
}) {
  const { colors, ui } = useTheme();
  const [open, setOpen] = useState<string | null>(null);
  const name = nameLookup(team1Players, team2Players);
  const pair = (ids: readonly string[]) => ids.map(name).join(' / ');
  const flights = groupBundleMatchesByFlight(matches as PlannedBundleMatch[]);

  return (
    <View testID="cup-generate-bundle">
      <Text style={[ui.muted, styles.irish]} testID="cup-generate-irish">
        {GENERATE_TEXT.irishHint}
      </Text>
      {flights.map((flight) => {
        const rows = getFlightMatchupRows(flight);
        const slotKey = (side: FlightTeamSide, slot: number) => `${flight.flightIndex}:${side}:${slot}`;
        const opened = open?.split(':');
        const openSide = opened && Number(opened[0]) === flight.flightIndex ? (opened[1] as FlightTeamSide) : null;
        const openSlot = (opened ? Number(opened[2]) : 0) as 0 | 1;
        const openRow = rows.find((row) => row.slotIndex === openSlot);

        const slot = (side: FlightTeamSide, slotIndex: 0 | 1, playerId: string | undefined) => {
          const key = slotKey(side, slotIndex);
          return (
            <PlayerSlot
              name={playerId ? name(playerId) : ''}
              open={open === key}
              label={formatMessage(GENERATE_TEXT.lineupPlayer, {
                flight: flight.flightIndex,
                team: side === 'side1' ? team1Name : team2Name,
                n: slotIndex + 1,
              })}
              onPress={() => setOpen(open === key ? null : key)}
              testID={`cup-generate-lineup-${key}`}
            />
          );
        };

        const current = openSide === 'side1' ? openRow?.side1PlayerId : openRow?.side2PlayerId;
        return (
          <View key={flight.flightIndex}>
            <Text style={[ui.sectionTitle, styles.heading]}>
              {formatMessage(GENERATE_TEXT.flight, { n: flight.flightIndex })}
            </Text>
            <Card testID={`cup-generate-lineup-${flight.flightIndex}`}>
              <Text style={[styles.label, { color: colors.muted }]}>{GENERATE_TEXT.lineupHeading}</Text>
              <View style={styles.versus}>
                <Text style={[styles.label, styles.side, { color: colors.muted }]}>{team1Name}</Text>
                <View style={styles.motSpace} />
                <Text style={[styles.label, styles.side, { color: colors.muted }]}>{team2Name}</Text>
              </View>
              {rows.map((row) => (
                <View key={row.slotIndex} style={styles.versus}>
                  <View style={styles.side}>{slot('side1', row.slotIndex, row.side1PlayerId)}</View>
                  <Text style={[styles.mot, { color: colors.muted }]}>{GENERATE_TEXT.mot}</Text>
                  <View style={styles.side}>{slot('side2', row.slotIndex, row.side2PlayerId)}</View>
                </View>
              ))}
              {openSide ? (
                <PlayerPicker
                  players={openSide === 'side1' ? team1Players : team2Players}
                  isDisabled={() => false}
                  current={current ?? null}
                  onChoose={(id) => {
                    setOpen(null);
                    if (id !== current) onSwapPlayer(flight.flightIndex, openSide, openSlot, id);
                  }}
                  testID={`cup-generate-picker-${flight.flightIndex}`}
                />
              ) : null}
              <Text style={[ui.muted, styles.hint]}>{GENERATE_TEXT.lineupHint}</Text>
            </Card>

            <GreensomeCard
              match={flight.greensome}
              team1Name={team1Name}
              team2Name={team2Name}
              team1Players={team1Players}
              team2Players={team2Players}
              selectedTee={selectedTee}
              teamStrokesInputs={teamStrokesInputs}
              onTeamStrokesChange={onTeamStrokesChange}
            />

            <Card testID={`cup-generate-bestball-${flight.flightIndex}`}>
              <Text style={[styles.label, { color: colors.muted }]}>
                {`${FORMAT_LABELS.best_ball} · ${GENERATE_TEXT.back9}`}
              </Text>
              <Text style={[styles.names, { color: colors.text }]}>
                {`${pair(flight.bestBall.side1)} ${GENERATE_TEXT.mot} ${pair(flight.bestBall.side2)}`}
              </Text>
            </Card>
          </View>
        );
      })}
    </View>
  );
}

function GreensomeCard({
  match,
  team1Name,
  team2Name,
  team1Players,
  team2Players,
  selectedTee,
  teamStrokesInputs,
  onTeamStrokesChange,
}: {
  match: PlannedBundleMatch;
  team1Name: string;
  team2Name: string;
  team1Players: WizardPlayer[];
  team2Players: WizardPlayer[];
  selectedTee: WizardTeeBox;
  teamStrokesInputs: TeamStrokesInputs;
  onTeamStrokesChange: (matchId: string, side: 'team1' | 'team2', value: string) => void;
}) {
  const { colors, ui } = useTheme();
  const lookup = playerLookup(team1Players, team2Players);
  const side1 = match.side1.map(lookup).filter((p): p is WizardPlayer => Boolean(p));
  const side2 = match.side2.map(lookup).filter((p): p is WizardPlayer => Boolean(p));
  const raw = teamStrokesInputs[match.id];
  const helper = (players: WizardPlayer[]) =>
    players.map((p) => `${p.displayName}: ${regnehjelpText(p, selectedTee)}`).join(' · ');

  const field = (side: 'team1' | 'team2', team: string, players: WizardPlayer[]) => (
    <View style={styles.side}>
      <Text style={[styles.label, { color: colors.muted }]}>
        {formatMessage(GENERATE_TEXT.teamStrokes, { team })}
      </Text>
      <TextInput
        style={ui.input}
        value={raw?.[side] ?? String(greensomeDefaultOrFallback(players, selectedTee))}
        onChangeText={(value) => onTeamStrokesChange(match.id, side, value)}
        keyboardType="number-pad"
        testID={`cup-generate-strokes-${match.id}-${side}`}
      />
      <Text style={[styles.helper, { color: colors.muted }]} testID={`cup-generate-helper-${match.id}-${side}`}>
        {helper(players)}
      </Text>
    </View>
  );

  return (
    <Card testID={`cup-generate-greensome-${match.id}`}>
      <Text style={[styles.label, { color: colors.muted }]}>
        {`${FORMAT_LABELS.greensome_matchplay} · ${GENERATE_TEXT.front9}`}
      </Text>
      <Text style={[styles.names, { color: colors.text }]}>
        {`${side1.map((p) => p.displayName).join(' / ')} ${GENERATE_TEXT.mot} ${side2.map((p) => p.displayName).join(' / ')}`}
      </Text>
      <View style={styles.fields}>
        {field('team1', team1Name, side1)}
        {field('team2', team2Name, side2)}
      </View>
      <Text style={[ui.muted, styles.hint]}>{GENERATE_TEXT.strokesHint}</Text>
    </Card>
  );
}

/** Spillehandicap når teen har ratingsett for spillerens kjønn, ellers rå indeks. */
function regnehjelpText(player: WizardPlayer, tee: WizardTeeBox): string {
  const value = computeSpillehandicap(player, tee);
  return value !== null
    ? spillehandicapText(value)
    : formatMessage(GENERATE_TEXT.hcpIndex, { n: formatHcpNb(player.hcpIndex) });
}

export function GenerateRecap({
  matches,
  courseName,
  teeName,
}: {
  matches: readonly CupBatchMatch[];
  courseName: string;
  teeName: string;
}) {
  const { colors, ui } = useTheme();
  const byFormat = new Map<CupBundleFormat, number>();
  for (const match of matches) byFormat.set(match.format, (byFormat.get(match.format) ?? 0) + 1);
  return (
    <View testID="cup-generate-recap">
      <Text style={[ui.sectionTitle, styles.heading]}>{GENERATE_TEXT.recapHeading}</Text>
      <Card>
        <Text style={[styles.label, { color: colors.muted }]}>{GENERATE_TEXT.courseTee}</Text>
        <Text style={[styles.value, { color: colors.text }]}>{`${courseName} · ${teeName}`}</Text>
        <Text style={[styles.label, styles.recapLabel, { color: colors.muted }]}>{GENERATE_TEXT.matches}</Text>
        {[...byFormat.entries()].map(([format, count]) => (
          <Text key={format} style={[styles.value, { color: colors.text }]}>
            {`${count} ${FORMAT_LABELS[format]}`}
          </Text>
        ))}
        <Text style={[styles.total, { color: colors.primary }]} testID="cup-generate-total">
          {formatMessage(GENERATE_TEXT.matchesTotal, { count: matches.length })}
        </Text>
      </Card>
    </View>
  );
}

function nameLookup(team1Players: WizardPlayer[], team2Players: WizardPlayer[]) {
  const lookup = playerLookup(team1Players, team2Players);
  return (userId: string) => lookup(userId)?.displayName ?? '';
}

function Card({ children, testID }: { children: ReactNode; testID?: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} testID={testID}>
      {children}
    </View>
  );
}

function PlayerSlot({
  name,
  open,
  label,
  onPress,
  testID,
}: {
  name: string;
  open: boolean;
  label: string;
  onPress: () => void;
  testID: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${name}`}
      accessibilityState={{ expanded: open }}
      onPress={onPress}
      style={[
        styles.slot,
        open
          ? { backgroundColor: colors.primarySoft, borderColor: colors.primary }
          : { backgroundColor: colors.bg, borderColor: colors.border },
      ]}
      testID={testID}
    >
      <Text style={[styles.slotName, { color: colors.text }]} numberOfLines={2}>
        {name}
      </Text>
      <ChevronIcon direction={open ? 'up' : 'down'} color={colors.muted} size={14} strokeWidth={2} />
    </Pressable>
  );
}

function PlayerPicker({
  players,
  isDisabled,
  current,
  onChoose,
  testID,
}: {
  players: readonly WizardPlayer[];
  isDisabled: (id: string) => boolean;
  current: string | null;
  onChoose: (id: string) => void;
  testID: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.picker, { borderColor: colors.border }]} testID={testID}>
      {players.map((player) => {
        const disabled = isDisabled(player.id);
        return (
          <Pressable
            key={player.id}
            accessibilityRole="button"
            accessibilityState={{ disabled, selected: player.id === current }}
            disabled={disabled}
            onPress={() => onChoose(player.id)}
            style={[
              styles.pickerRow,
              { borderBottomColor: colors.border },
              player.id === current && { backgroundColor: colors.primarySoft },
              disabled && styles.dimmed,
            ]}
            testID={`${testID}-${player.id}`}
          >
            <Text style={[styles.value, { color: colors.text }]}>{player.displayName}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { marginTop: 16 },
  irish: { marginTop: 4 },
  card: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 6, marginTop: 8 },
  label: { ...interLine(12, 16), fontFamily: FONTS.sansSemiBold },
  versus: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  side: { flex: 1, minWidth: 0, gap: 6 },
  mot: { ...interLine(12, 16), fontFamily: FONTS.sansSemiBold, paddingTop: 14, minWidth: 24, textAlign: 'center' },
  motSpace: { minWidth: 24 },
  slot: {
    minHeight: TAP,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  slotName: { flex: 1, minWidth: 0, ...interLine(13, 17, { multiline: true }), fontFamily: FONTS.sans },
  picker: { borderWidth: 1, borderRadius: 12, overflow: 'hidden', marginTop: 2 },
  pickerRow: { minHeight: TAP, justifyContent: 'center', paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  dimmed: { opacity: 0.4 },
  value: { ...interLine(14, 19), fontFamily: FONTS.sans },
  names: { ...fraunces(500, 14, 19) },
  fields: { flexDirection: 'row', gap: 10 },
  helper: { ...interLine(11, 15, { multiline: true }), fontFamily: FONTS.sans },
  hint: { marginTop: 2 },
  recapLabel: { marginTop: 6 },
  total: { ...fraunces(500, 15, 20), marginTop: 2 },
});
