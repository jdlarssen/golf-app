// #2259 PR 2: delene Topplista er bygget av, som designlerretets «Toppliste B»
// (`Aeresbrett-tilstander`, rad 95): segmentkontrollen, «Din plass»-kortet,
// lederkortet, lista med streker og de to meldingskortene. All tekst står på
// én linje i 390 og 320 (`numberOfLines={1}`); ingenting brekker.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type {
  TopplisteLeaderModel,
  TopplisteRowModel,
  TopplisteTab,
  TopplisteYouModel,
} from '../../lib/toppliste';
import { TOPPLISTE_TABS } from '../../lib/toppliste';
import { TOPPLISTE_TEXT } from '../../lib/topplisteCopy';
import { FONTS, fraunces, interLine, TAP, useTheme, withAlpha } from '../../theme';
import { RankMedal } from '../RankMedal';

/** Metallene og krem-tonene på skogflaten er like i begge drakter (designet). */
const GOLD = '#C9A961';
const GOLD_NUMBER = '#D4B870';
const CREAM = '#ECE5D2';

const TAB_LABEL: Readonly<Record<TopplisteTab, string>> = {
  wins: TOPPLISTE_TEXT.tabWins,
  birdies: TOPPLISTE_TEXT.tabBirdies,
  rounds: TOPPLISTE_TEXT.tabRounds,
};

/** Segmentkontrollen: sporet er 4 pt luft, og hver knapp er 44 høy rundt en 40 høy pille. */
export function TopplisteTabs({
  tab,
  onChange,
  disabled = false,
}: {
  tab: TopplisteTab;
  onChange: (next: TopplisteTab) => void;
  /** Mens lista hentes: fanene står, men de gjør ingenting. */
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={TOPPLISTE_TEXT.tabsLabel}
      style={[styles.track, { backgroundColor: colors.surface2, borderColor: colors.border }]}
      testID="toppliste-tabs"
    >
      {TOPPLISTE_TABS.map((id) => {
        const selected = id === tab;
        return (
          <Pressable
            key={id}
            accessibilityRole="tab"
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={() => onChange(id)}
            style={styles.tabHit}
            testID={`toppliste-tab-${id}`}
          >
            <View style={[styles.tabPill, { backgroundColor: selected ? colors.primary : 'transparent' }]}>
              <Text
                numberOfLines={1}
                style={[styles.tabText, { color: selected ? colors.onPrimary : colors.text }]}
              >
                {TAB_LABEL[id]}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** «Du er på 7. plass», under fanene. */
export function TopplisteYou({ you }: { you: TopplisteYouModel }) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.card, styles.youCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
      testID="toppliste-you"
    >
      <View style={[styles.youAvatar, { backgroundColor: colors.youFill }]} accessibilityElementsHidden>
        <Text style={[styles.youInitials, { color: colors.avatarInk }]}>{you.initials}</Text>
      </View>
      <View style={styles.flex}>
        <Text numberOfLines={1} style={[styles.youTitle, { color: colors.text }]}>
          {you.title}
        </Text>
        <Text numberOfLines={1} style={[styles.youDetail, { color: colors.muted }]}>
          {you.detail}
        </Text>
      </View>
    </View>
  );
}

/** Lederen: bare når én har plass 1. */
export function TopplisteLeader({ leader }: { leader: TopplisteLeaderModel }) {
  const { colors, scheme } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${leader.label}, ${leader.name}, ${leader.value} ${leader.unit}`}
      style={[
        styles.leader,
        {
          backgroundColor: colors.surfaceStrong,
          boxShadow: scheme === 'dark' ? '0 10px 24px rgba(0,0,0,0.4)' : '0 10px 24px rgba(26,46,31,0.16)',
        },
      ]}
      testID="toppliste-leader"
    >
      <View style={styles.leaderRing} importantForAccessibility="no-hide-descendants">
        <Text style={styles.leaderInitials}>{leader.initials}</Text>
      </View>
      <View style={styles.flex}>
        <Text numberOfLines={1} style={styles.leaderLabel}>
          {leader.label}
        </Text>
        <Text numberOfLines={1} style={[styles.leaderName, { color: colors.onStrongWarm }]}>
          {leader.name}
        </Text>
      </View>
      <View style={styles.leaderCount} importantForAccessibility="no-hide-descendants">
        <Text style={styles.leaderValue}>{leader.value}</Text>
        <Text style={[styles.leaderUnit, { color: withAlpha(CREAM, 0.85) }]}>{leader.unit}</Text>
      </View>
    </View>
  );
}

function Place({ row }: { row: TopplisteRowModel }) {
  const { colors } = useTheme();
  if (row.medal) return <RankMedal rank={row.place} medal={row.medal} size={28} />;
  return (
    <Text style={[styles.place, { color: row.isViewer ? colors.text : colors.muted }]}>{row.place}</Text>
  );
}

/** Lista med streker: plass 1–10, antallet mot lederen som en strek under navnet. */
export function TopplisteList({ rows }: { rows: readonly TopplisteRowModel[] }) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.card, styles.list, { backgroundColor: colors.surface, borderColor: colors.border }]}
      testID="toppliste-list"
    >
      {rows.map((row, index) => (
        <View
          key={`${row.place}-${row.name}-${index}`}
          accessible
          accessibilityLabel={row.spoken}
          style={[
            styles.row,
            row.isViewer ? { backgroundColor: colors.youFill } : null,
            index < rows.length - 1 ? { borderBottomWidth: 1, borderBottomColor: colors.divider } : null,
          ]}
          testID={`toppliste-row-${index}`}
        >
          <View style={styles.placeCell} importantForAccessibility="no-hide-descendants">
            <Place row={row} />
          </View>
          <View style={styles.rowMiddle} importantForAccessibility="no-hide-descendants">
            <View style={styles.nameLine}>
              <Text numberOfLines={1} style={[styles.name, { color: colors.text }]}>
                {row.name}
              </Text>
              {row.isViewer ? (
                <View style={[styles.youPill, { backgroundColor: colors.primary }]}>
                  <Text style={[styles.youPillText, { color: colors.onPrimary }]}>{TOPPLISTE_TEXT.you}</Text>
                </View>
              ) : null}
            </View>
            <View style={[styles.barTrack, { backgroundColor: colors.trackBg }]}>
              <View
                style={[
                  styles.barFill,
                  { width: `${row.barPercent}%`, backgroundColor: row.place === 1 ? colors.accent : colors.primary },
                ]}
              />
            </View>
          </View>
          <Text
            importantForAccessibility="no-hide-descendants"
            style={[styles.count, { color: row.place === 1 ? colors.accentText : colors.text }]}
          >
            {row.count}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Skogkortet når ingen runder er levert: «Ingen runder ennå». */
export function TopplisteEmpty({ heading, body }: { heading: string; body: string }) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="summary"
      style={[styles.empty, { backgroundColor: colors.surfaceStrong }]}
      testID="toppliste-empty"
    >
      <Text numberOfLines={1} accessibilityRole="header" style={[styles.emptyHeading, { color: colors.onStrongWarm }]}>
        {heading}
      </Text>
      <Text numberOfLines={1} style={[styles.emptyBody, { color: withAlpha(CREAM, 0.85) }]}>
        {body}
      </Text>
    </View>
  );
}

/** «Du er uten nett» og feilene, med «Prøv igjen» i full bredde. */
export function TopplisteMessage({
  heading,
  body,
  onRetry,
  testID,
}: {
  heading: string;
  body: string;
  onRetry: () => void;
  testID: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="alert"
      style={[styles.card, styles.message, { backgroundColor: colors.surface, borderColor: colors.border }]}
      testID={testID}
    >
      <Text numberOfLines={1} accessibilityRole="header" style={[styles.messageHeading, { color: colors.text }]}>
        {heading}
      </Text>
      <Text numberOfLines={1} style={[styles.messageBody, { color: colors.muted }]}>
        {body}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={({ pressed }) => [styles.retry, { borderColor: colors.primary }, pressed ? styles.pressed : null]}
        testID={`${testID}-retry`}
      >
        <Text style={[styles.retryText, { color: colors.primary }]}>{TOPPLISTE_TEXT.retry}</Text>
      </Pressable>
    </View>
  );
}

/** En flate i skjelettet: ingen glans, som tegningen («Hentes»). */
function Bone({
  width,
  height,
  radius = 999,
  tone = 'surface',
}: {
  width?: number;
  height: number;
  radius?: number;
  tone?: 'surface' | 'forest';
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width,
        height,
        borderRadius: radius,
        backgroundColor: tone === 'forest' ? withAlpha(CREAM, 0.14) : colors.skeleton,
      }}
    />
  );
}

const ROW_BONES = [118, 96, 132, 104, 88] as const;

/** Siden mens lista hentes: overskriften står, resten er flater, skjult for skjermleseren. */
export function TopplisteSkeleton() {
  const { colors, scheme } = useTheme();
  return (
    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden testID="toppliste-skeleton">
      <View style={[styles.card, styles.youCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Bone width={40} height={40} />
        <View style={styles.flex}>
          <View style={styles.boneLine23}>
            <Bone width={150} height={14} />
          </View>
          <View style={styles.boneLine16}>
            <Bone width={110} height={10} />
          </View>
        </View>
      </View>
      <View
        style={[
          styles.leader,
          {
            backgroundColor: colors.surfaceStrong,
            boxShadow: scheme === 'dark' ? '0 10px 24px rgba(0,0,0,0.4)' : '0 10px 24px rgba(26,46,31,0.16)',
          },
        ]}
      >
        <Bone width={52} height={52} tone="forest" />
        <View style={styles.flex}>
          <View style={styles.boneLine15}>
            <Bone width={92} height={10} tone="forest" />
          </View>
          <View style={styles.boneLine30}>
            <Bone width={120} height={18} tone="forest" />
          </View>
        </View>
        <View style={styles.leaderCount}>
          <View style={styles.boneLine44}>
            <Bone width={26} height={32} radius={8} tone="forest" />
          </View>
          <View style={styles.boneLine15}>
            <Bone width={30} height={10} tone="forest" />
          </View>
        </View>
      </View>
      <View style={[styles.card, styles.list, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {ROW_BONES.map((nameWidth, index) => (
          <View
            key={nameWidth}
            style={[
              styles.row,
              index < ROW_BONES.length - 1 ? { borderBottomWidth: 1, borderBottomColor: colors.divider } : null,
            ]}
          >
            <Bone width={28} height={28} />
            <View style={styles.rowMiddle}>
              <View style={styles.nameLine}>
                <Bone width={nameWidth} height={12} />
              </View>
              <View style={[styles.barTrack, { backgroundColor: colors.trackBg }]} />
            </View>
            <View style={styles.countBone}>
              <Bone width={14} height={14} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Undertittelen som en grå strek mens sesongen ikke er kjent. */
export function SubtitleBone() {
  return (
    <View style={styles.subtitleBone}>
      <Bone width={172} height={10} />
    </View>
  );
}

const TAB = interLine(14, 17);
const NAME = interLine(15, 18);

const styles = StyleSheet.create({
  flex: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
  pressed: { opacity: 0.6 },
  card: { marginHorizontal: 16, marginTop: 12, borderWidth: 1, borderRadius: 16 },

  // Sporet: 4 pt luft og 1 pt kant. Knappene er 44 høye og trekker 2 pt fra
  // sporet over og under, så pillen er 40 og trykkflaten 44 (TAP).
  track: {
    marginHorizontal: 16,
    marginTop: 14,
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  tabHit: { flex: 1, minWidth: 0, height: TAP, marginVertical: -2 },
  tabPill: { height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  tabText: { ...TAB, fontFamily: FONTS.sansSemiBold },

  youCard: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  youAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  youInitials: { ...interLine(13, 16), fontFamily: FONTS.sansSemiBold },
  youTitle: { ...fraunces(600, 18, 23), fontVariant: ['tabular-nums'] },
  youDetail: { ...interLine(13, 16), marginTop: 1, fontVariant: ['tabular-nums'] },

  leader: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  leaderRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: GOLD,
    backgroundColor: withAlpha(CREAM, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  leaderInitials: { ...interLine(16, 19), fontFamily: FONTS.sansSemiBold, color: CREAM },
  leaderLabel: { ...interLine(12, 15), fontFamily: FONTS.sansSemiBold, color: GOLD },
  leaderName: fraunces(600, 24, 30),
  leaderCount: { flexShrink: 0, alignItems: 'flex-end' },
  leaderValue: { ...fraunces(600, 40, 44), color: GOLD_NUMBER, fontVariant: ['tabular-nums'] },
  leaderUnit: interLine(12, 15),

  list: { overflow: 'hidden' },
  row: {
    minHeight: 60,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  placeCell: { width: 28, alignItems: 'center' },
  place: { ...interLine(15, 18), fontFamily: FONTS.sansSemiBold, fontVariant: ['tabular-nums'], textAlign: 'center' },
  rowMiddle: { flexGrow: 1, flexShrink: 1, minWidth: 0, gap: 7 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  name: { ...NAME, flexShrink: 1, minWidth: 0 },
  youPill: { flexShrink: 0, height: 20, paddingHorizontal: 8, borderRadius: 999, justifyContent: 'center' },
  youPillText: { ...interLine(12, 20), fontFamily: FONTS.sansSemiBold },
  barTrack: { height: 4, borderRadius: 999, overflow: 'hidden' },
  barFill: { height: 4, borderRadius: 999 },
  count: { ...fraunces(600, 17, 21), minWidth: 24, textAlign: 'right', fontVariant: ['tabular-nums'], flexShrink: 0 },

  empty: { marginHorizontal: 16, marginTop: 12, borderRadius: 20, paddingVertical: 20, paddingHorizontal: 18 },
  emptyHeading: fraunces(600, 22, 28),
  emptyBody: { ...interLine(14, 18), marginTop: 4 },

  message: { padding: 16 },
  messageHeading: fraunces(600, 18, 23),
  messageBody: { ...interLine(14, 18), marginTop: 4 },
  retry: {
    marginTop: 14,
    minHeight: TAP,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: { ...interLine(16, 20), fontFamily: FONTS.sansSemiBold },

  subtitleBone: { height: 16, justifyContent: 'center', marginTop: 2 },
  boneLine15: { height: 15, justifyContent: 'center' },
  boneLine16: { height: 16, justifyContent: 'center', marginTop: 1 },
  boneLine23: { height: 23, justifyContent: 'center' },
  boneLine30: { height: 30, justifyContent: 'center' },
  boneLine44: { height: 44, justifyContent: 'center' },
  countBone: { width: 24, height: 21, alignItems: 'flex-end', justifyContent: 'center', flexShrink: 0 },
});
