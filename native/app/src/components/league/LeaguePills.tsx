// #2638 Del 2: pillene og chipene på ligaskjermene (tegningene 1–4).
//
//  - `PlayedPill`: «Ikke spilt», «✓ Har spilt» og «● I gang» til høyre på en
//    rad (Hjem og rundelista), tegningenes `.pill` og `.pill.done`.
//  - `StatusPill`: «● Pågår» ved navnet på ligasiden, `.pill.done` 24 høy.
//  - `WindowChip`: «ÅPEN», «KOMMER», «LUKKET» ved rundenavnet, `.chip`.
import { StyleSheet, Text, View } from 'react-native';
import { FONTS, interLine, useTheme } from '../../theme';
import { LigaHakeIcon } from '../icons/Icons';
import { LEAGUE_TEXT, WINDOW_CHIP, type RoundWindow } from '../../lib/leagueCopy';

export type PlayedState = 'delivered' | 'inProgress' | 'notPlayed';

export function PlayedPill({ state, testID }: { state: PlayedState; testID?: string }) {
  const { colors } = useTheme();
  const done = state === 'delivered';
  const text =
    state === 'delivered' ? LEAGUE_TEXT.delivered : state === 'inProgress' ? LEAGUE_TEXT.inProgress : LEAGUE_TEXT.notPlayed;
  return (
    <View
      style={[
        styles.pill,
        done
          ? { backgroundColor: colors.primarySoft, borderColor: colors.youBorder }
          : { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
      testID={testID}
    >
      {done ? <LigaHakeIcon color={colors.primary} size={12} /> : null}
      {state === 'inProgress' ? <View style={[styles.dot, { backgroundColor: colors.live }]} /> : null}
      <Text style={[styles.pillText, { color: done ? colors.primary : colors.text }]}>{text}</Text>
    </View>
  );
}

export function StatusPill({ label, live }: { label: string; live: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.pill,
        styles.status,
        live
          ? { backgroundColor: colors.primarySoft, borderColor: colors.youBorder }
          : { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
      testID="league-status"
    >
      {live ? <View style={[styles.dot, { backgroundColor: colors.live }]} /> : null}
      <Text style={[styles.pillText, { color: live ? colors.primary : colors.text }]}>{label}</Text>
    </View>
  );
}

export function WindowChip({ window, testID }: { window: RoundWindow; testID?: string }) {
  const { colors } = useTheme();
  const look =
    window === 'open'
      ? { backgroundColor: colors.primary, color: colors.onPrimary, borderWidth: 0 }
      : window === 'upcoming'
        ? { backgroundColor: colors.trackBg, color: colors.muted, borderWidth: 0 }
        : { backgroundColor: 'transparent', color: colors.muted, borderWidth: 1, borderColor: colors.border };
  const { color, ...box } = look;
  return (
    <View
      style={[styles.chip, box]}
      testID={testID}
    >
      <Text style={[styles.chipText, { color }]}>{WINDOW_CHIP[window]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // `.pill`: 26 høy, 10 inn, 1 pt kant; teksten 12/16 halvfet.
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    flexShrink: 0,
  },
  status: { height: 24 },
  pillText: { ...interLine(12, 16), fontFamily: FONTS.sansSemiBold },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  // `.chip`: 20 høy, 8 inn, 10 pt sperret versal. Bare den lukkede har kant.
  chip: {
    height: 20,
    paddingHorizontal: 8,
    borderRadius: 999,
    justifyContent: 'center',
  },
  chipText: {
    ...interLine(10, 12),
    fontFamily: FONTS.sansSemiBold,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
});
