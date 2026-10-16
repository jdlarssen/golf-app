// #2580: boksen over leverknappen når noen på laget mangler utslag
// (`Utslag-forslag-levering`), og den sperrede leverknappen under. Webbens
// `TeeShotShortBox` i appens form: varseltittel, regelen og hva laget gjør, og
// antallet per spiller med de som mangler, innrammet. Setningene kommer ferdig
// fra `teeShotBoxText`/`teeShotCountText` (teeShotsCopy.ts).
//
// Knappen er sperret uten `disabled`: `accessibilityState` og `aria-disabled`
// sier det, og den står i fokusrekkefølgen. Et trykk flytter fokus til boksen,
// så VoiceOver leser hvorfor.
import { forwardRef, useEffect, type RefObject } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { FONTS, interLine, useTheme } from '../../theme';
import { UtslagHakeIcon, UtslagVarselIcon } from '../icons/Icons';

export interface TeeShotShortBoxPlayer {
  userId: string;
  name: string;
  /** «har 7» eller «2 av 4». */
  countText: string;
  short: boolean;
}

export const TeeShotShortBox = forwardRef<
  View,
  {
    title: string;
    body: string;
    players: readonly TeeShotShortBoxPlayer[];
    /**
     * Boksen dukket opp etter en endring på kortet (ikke ved åpning): da leses
     * tittelen opp, som en live-region.
     */
    announce?: boolean;
  }
>(function TeeShotShortBox({ title, body, players, announce = false }, ref) {
  const { colors } = useTheme();
  useEffect(() => {
    if (announce) AccessibilityInfo.announceForAccessibility(`${title}. ${body}`);
    // Bare når boksen kommer til, ikke når teksten endres mens den står.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <View
      ref={ref}
      accessible
      style={[styles.box, { backgroundColor: colors.warningSoft }]}
      testID="tee-shot-short-box"
    >
      <View style={styles.titleRow}>
        <UtslagVarselIcon color={colors.warningText} />
        <Text style={[styles.title, { color: colors.warningText }]}>{title}</Text>
      </View>
      <Text style={[styles.body, { color: colors.text }]}>{body}</Text>
      <View style={styles.players}>
        {players.map((p) => (
          <View
            key={p.userId}
            style={[
              styles.player,
              { backgroundColor: colors.surface },
              p.short ? [styles.playerShort, { borderColor: colors.warningText }] : null,
            ]}
            testID={`tee-shot-short-player-${p.userId}`}
          >
            <Text style={[styles.playerName, { color: colors.text }]} numberOfLines={1}>
              {p.name}
            </Text>
            <View style={styles.countRow}>
              {p.short ? null : <UtslagHakeIcon color={colors.muted} />}
              <Text
                style={[
                  styles.count,
                  p.short
                    ? { color: colors.warningText, fontFamily: FONTS.sansSemiBold }
                    : { color: colors.muted, fontFamily: FONTS.sans },
                ]}
              >
                {p.countText}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
});

/**
 * «Lever lagets kort» (eller «Lever scorekort» / «Lever N kort») mens noen
 * mangler: `trackBg` med `muted` tekst, sperret for skjermleseren, og et trykk
 * flytter fokus til boksen.
 */
export function TeeShotLockedSubmit({
  label,
  boxRef,
  testID,
  onLayout,
}: {
  label: string;
  boxRef: RefObject<View | null>;
  testID: string;
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  const { colors, ui } = useTheme();
  return (
    <Pressable
      style={[ui.button, { backgroundColor: colors.trackBg }]}
      onPress={() => {
        if (boxRef.current) AccessibilityInfo.sendAccessibilityEvent(boxRef.current, 'focus');
      }}
      accessibilityRole="button"
      accessibilityState={{ disabled: true }}
      aria-disabled
      onLayout={onLayout}
      testID={testID}
    >
      <Text style={[ui.buttonText, { color: colors.muted }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: 14, padding: 14, gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { ...interLine(15, 19), fontFamily: FONTS.sansSemiBold, flexShrink: 1 },
  body: { ...interLine(13, 18.85, { multiline: true }), fontFamily: FONTS.sans },
  players: { flexDirection: 'row', gap: 6 },
  player: { flex: 1, minWidth: 0, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 8, gap: 1 },
  playerShort: { borderWidth: 1.5, paddingVertical: 5, paddingHorizontal: 7 },
  playerName: { ...interLine(12, 15), fontFamily: FONTS.sansSemiBold },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  count: { ...interLine(12, 15), fontVariant: ['tabular-nums'] },
});
