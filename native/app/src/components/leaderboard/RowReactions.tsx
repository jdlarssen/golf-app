// #2754: Stripa, forslaget eieren valgte (lerretet, `Reaksjoner-b-*`).
//
// Tre biter: skiltet på raden (opptil tre reaksjoner og ett samlet tall, som
// alltid får plass ved prikkene), raden du trykker på, og stripa nederst med de
// seks reaksjonene. Et trykk på raden lagrer ingenting, og radene flytter seg
// ikke, men tavla ruller hvis stripa ellers ville dekket raden. Emojiene er spillernes eget innhold og står (#2728).
import { useEffect, useRef, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { topReactions } from '../../../../../lib/games/reactions/aggregate';
import {
  EMOJI_NAME_KEY,
  REACTION_EMOJIS,
  type ReactionEmoji,
} from '../../../../../lib/games/reactions/palette';
import { BOARD_TEXT, REACTIONS_APP_TEXT, REACTIONS_TEXT } from '../../lib/boardCopy';
import { formatMessage } from '../../lib/kavalkadeCopy';
import type { ReactionRowState, ReactionTarget } from '../../lib/useGameReactions';
import { FONTS, boardStripShadow, fraunces, interLine, useTheme } from '../../theme';
import { LukkIcon } from '../icons/Icons';
import { useReactionsContext } from './ReactionsProvider';

/** Radens reaksjoner i opplesningen: «Reaksjoner: Klappe 3, Ild 2». */
export function reactionsSpoken(counts: ReactionRowState['counts']): string | null {
  const given = REACTION_EMOJIS.filter((emoji) => (counts[emoji] ?? 0) > 0);
  if (given.length === 0) return null;
  const parts = given.map((emoji) => `${REACTIONS_TEXT[EMOJI_NAME_KEY[emoji]]} ${counts[emoji]}`);
  return `${REACTIONS_TEXT.groupLabel}: ${parts.join(', ')}`;
}

/** Skiltet: opptil tre reaksjoner, flest først, og summen av alle. */
export function ReactionPlate({ userId, ink }: { userId: string; ink?: string }) {
  const ctx = useReactionsContext();
  const { colors } = useTheme();
  if (!ctx) return null;
  const { counts } = ctx.getRow(userId);
  const top = topReactions(counts);
  if (top.length === 0) return null;
  const total = Object.values(counts).reduce((sum, count) => sum + (count ?? 0), 0);
  return (
    <View
      style={styles.plate}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={`reaction-plate-${userId}`}
    >
      <Text style={styles.plateEmoji}>{top.map(([emoji]) => emoji).join('')}</Text>
      <Text style={[styles.plateCount, { color: ink ?? colors.muted }]}>{total}</Text>
    </View>
  );
}

/**
 * Raden. Kan du reagere, er den én knapp, for VoiceOver leser den som én
 * setning. Ellers er den en vanlig flate uten trykk, aldri en knapp som ikke
 * gjør noe.
 */
export function ReactableRow({
  target,
  label,
  plainAccessible = false,
  style,
  testID,
  children,
}: {
  target: ReactionTarget;
  /** Opplesningen av raden, uten reaksjonene. */
  label: string;
  /** Tavlas rad er ett element for skjermleseren også uten knapp. */
  plainAccessible?: boolean;
  style?: StyleProp<ViewStyle>;
  testID: string;
  children: ReactNode;
}) {
  const ctx = useReactionsContext();
  const ref = useRef<View>(null);
  const spoken = ctx ? reactionsSpoken(ctx.getRow(target.userId).counts) : null;
  const fullLabel = spoken ? `${label}. ${spoken}` : label;

  if (!ctx?.canReact) {
    return (
      <View
        style={style}
        testID={testID}
        {...(plainAccessible || spoken ? { accessible: true, accessibilityLabel: fullLabel } : null)}
      >
        {children}
      </View>
    );
  }
  return (
    <Pressable
      ref={ref}
      style={style}
      onPress={() => {
        ctx.openFor(target);
        ref.current?.measureInWindow((_x, y, _width, height) => ctx.onRowOpened(y + height));
      }}
      accessibilityRole="button"
      accessibilityLabel={fullLabel}
      accessibilityHint={formatMessage(BOARD_TEXT.reactionsTo, { name: target.name })}
      accessibilityState={{ expanded: ctx.target?.userId === target.userId }}
      testID={testID}
    >
      {children}
    </Pressable>
  );
}

/** Linja på en tom tavle mens runden går. */
export function ReactionHint({ color }: { color?: string }) {
  const ctx = useReactionsContext();
  const { colors } = useTheme();
  if (!ctx?.showHint) return null;
  return (
    <Text style={[styles.hint, { color: color ?? colors.muted }]} testID="reaction-hint">
      {REACTIONS_APP_TEXT.hint}
    </Text>
  );
}

function ReactionButton({
  emoji,
  count,
  mine,
  onPress,
}: {
  emoji: ReactionEmoji;
  count: number;
  mine: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const name = REACTIONS_TEXT[EMOJI_NAME_KEY[emoji]];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={formatMessage(mine ? REACTIONS_TEXT.toggleActive : REACTIONS_TEXT.toggle, {
        emoji: name,
        count,
      })}
      accessibilityState={{ selected: mine }}
      style={[
        styles.button,
        mine
          ? { borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.primarySoft }
          : { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
      ]}
      testID={`reaction-button-${EMOJI_NAME_KEY[emoji]}`}
    >
      <Text style={styles.buttonEmoji}>{emoji}</Text>
      <Text style={[styles.buttonCount, { color: mine ? colors.primary : colors.muted }]}>
        {count > 0 ? count : ' '}
      </Text>
    </Pressable>
  );
}

/**
 * Stripa med de seks reaksjonene. Den står der «Din runde» står, med samme
 * marger, og blir stående til du lukker den, så du kan gi flere.
 */
export function ReactionStrip({
  bottom,
  onLayout,
}: {
  bottom: number;
  onLayout?: (height: number) => void;
}) {
  const ctx = useReactionsContext();
  const { colors, scheme } = useTheme();
  const target = ctx?.target ?? null;
  const title = target ? formatMessage(BOARD_TEXT.reactionsTo, { name: target.name }) : null;
  const failure = ctx?.failure ?? null;
  const message =
    failure === 'denied'
      ? REACTIONS_APP_TEXT.denied
      : failure === 'save'
        ? REACTIONS_APP_TEXT.saveFailed
        : null;

  // Stripa kommer langt fra raden du trykket på, så VoiceOver må få vite det.
  useEffect(() => {
    if (title) AccessibilityInfo.announceForAccessibility(title);
  }, [title]);
  useEffect(() => {
    if (message) AccessibilityInfo.announceForAccessibility(message);
  }, [message]);

  if (!ctx || !target) return null;
  const row = ctx.getRow(target.userId);
  return (
    <View
      style={[
        styles.strip,
        {
          bottom,
          backgroundColor: colors.surface,
          borderColor: colors.border,
          boxShadow: boardStripShadow(scheme),
        },
      ]}
      onLayout={(event) => onLayout?.(event.nativeEvent.layout.height)}
      testID="reaction-strip"
    >
      <View style={styles.head}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1} testID="reaction-strip-title">
          {title}
        </Text>
        <Pressable
          onPress={ctx.close}
          accessibilityRole="button"
          accessibilityLabel={REACTIONS_TEXT.close}
          style={styles.close}
          testID="reaction-strip-close"
        >
          <LukkIcon size={20} color={colors.text} />
        </Pressable>
      </View>
      {message ? (
        <Text
          style={[
            styles.error,
            { backgroundColor: colors.dangerSoft, borderColor: colors.dangerBorder, color: colors.scoreOver2Fg },
          ]}
          accessibilityRole="alert"
          testID="reaction-strip-error"
        >
          {message}
        </Text>
      ) : null}
      <View style={styles.buttons}>
        {REACTION_EMOJIS.map((emoji) => (
          <ReactionButton
            key={emoji}
            emoji={emoji}
            count={row.counts[emoji] ?? 0}
            mine={row.mine.includes(emoji)}
            onPress={() => ctx.toggle(target.userId, emoji)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  plate: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 0 },
  plateEmoji: { fontSize: 14, lineHeight: 16, letterSpacing: 1 },
  plateCount: { ...interLine(12, 15), fontFamily: FONTS.sansSemiBold, fontVariant: ['tabular-nums'] },
  hint: { ...interLine(11, 14), fontFamily: FONTS.sans, paddingTop: 2, paddingHorizontal: 4 },
  strip: {
    position: 'absolute',
    left: 12,
    right: 12,
    borderRadius: 16,
    borderWidth: 1,
    paddingTop: 4,
    paddingBottom: 10,
    paddingLeft: 14,
    paddingRight: 10,
    gap: 4,
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  title: { ...fraunces(500, 18), flexShrink: 1 },
  close: { width: 44, height: 44, marginRight: -6, alignItems: 'center', justifyContent: 'center' },
  error: {
    ...interLine(13, 17),
    fontFamily: FONTS.sans,
    marginRight: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  buttons: { flexDirection: 'row', gap: 4, marginRight: 4 },
  button: {
    flex: 1,
    height: 52,
    minWidth: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonEmoji: { fontSize: 22, lineHeight: 26 },
  buttonCount: { ...interLine(11, 14), fontFamily: FONTS.sansSemiBold, fontVariant: ['tabular-nums'] },
});
