// #2265: statistikken bak Rundedagboka («Se all statistikk»), i webbens
// rekkefølge på `/profile/historikk`: Mine tall, Handicap-form, Sesongen din,
// Serien din, Bragd-veggen, Putte-snitt og Baner. Den gamle formkurven er
// borte; formen står i formkortet på Rundedagboka.
//
// Designlerretet har ingen tegning av denne skjermen, så kortene bruker
// formkortets ramme (18 pt hjørner, 14 pt luft) og samme tallstil (Fraunces
// 22 over en liten etikett), og tekstene er webbens (`historyCopy.ts`).
// Tallene er regnet i `historyStats` (Type A), og hver seksjon viser dem bare.
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Achievements } from '../../../../../lib/stats/achievements';
import type { CourseStat } from '../../../../../lib/stats/courseStats';
import type { MyStats } from '../../../../../lib/stats/playerStats';
import type { PuttsStats } from '../../../../../lib/stats/puttsStats';
import type { SeasonSummary } from '../../../../../lib/stats/seasonStats';
import { MIN_STREAK_WEEKS, type StreakSummary } from '../../../../../lib/stats/streak';
import {
  HISTORY_TEXT,
  bestLabel,
  diffCurveLabel,
  formatOneDecimal,
  puttsNearMiss,
  seasonVsPrevious,
  streakSeason,
} from '../../lib/historyCopy';
import { PROFILE_TEXT } from '../../lib/profileCopy';
import { FONTS, TAP, useTheme, withAlpha } from '../../theme';
import { FormCurve } from './FormCurve';

function Section({
  heading,
  subtitle,
  children,
  testID,
}: {
  heading: string;
  subtitle?: string;
  children: ReactNode;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      testID={testID}
    >
      <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>
        {heading}
      </Text>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: colors.muted }]}>{subtitle}</Text>
      ) : null}
      {children}
    </View>
  );
}

/** Tre tall på rad med en etikett under, som stripa i formkortet. */
function NumberRow({
  cells,
  testID,
}: {
  cells: readonly { label: string; value: number | null; delta?: number | null }[];
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.numbers, { borderTopColor: colors.divider }]} testID={testID}>
      {cells.map((cell, i) => {
        const shown = cell.value != null ? String(cell.value) : PROFILE_TEXT.tileEmpty;
        const spoken = cell.value != null ? String(cell.value) : PROFILE_TEXT.tileEmptySpoken;
        const delta = cell.delta != null && cell.delta !== 0 ? cell.delta : null;
        const deltaText = delta == null ? null : delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`;
        return (
          <View
            key={cell.label}
            style={[
              styles.cell,
              i === 1 ? [styles.middle, { borderColor: colors.divider }] : null,
            ]}
            accessible
            accessibilityLabel={[`${cell.label}: ${spoken}`, deltaText].filter(Boolean).join(', ')}
          >
            <Text style={[styles.value, { color: colors.text }]}>{shown}</Text>
            <Text style={[styles.cellLabel, { color: colors.muted }]}>{cell.label}</Text>
            {deltaText ? (
              <Text style={[styles.delta, { color: colors.muted }]}>{deltaText}</Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

export function MyStatsSection({ stats }: { stats: MyStats }) {
  return (
    <Section heading={HISTORY_TEXT.myStatsHeading} testID="stats-my">
      <NumberRow
        cells={[
          { label: HISTORY_TEXT.myStatsRounds, value: stats.roundsPlayed },
          { label: HISTORY_TEXT.myStatsAverage, value: stats.grossAverage },
          { label: HISTORY_TEXT.myStatsBest, value: stats.bestRound },
        ]}
      />
    </Section>
  );
}

/** Handicap-formen: samme kurve som formkortet, med én desimal. Fra to runder. */
export function HandicapFormSection({ differentials }: { differentials: readonly number[] }) {
  if (differentials.length < 2) return null;
  const best = Math.min(...differentials);
  return (
    <Section heading={HISTORY_TEXT.diffHeading} testID="stats-handicap-form">
      <FormCurve
        values={differentials}
        formatValue={formatOneDecimal}
        bestText={bestLabel(formatOneDecimal(best), false)}
        accessibilityLabel={diffCurveLabel(differentials.length)}
        testID="stats-handicap-curve"
      />
    </Section>
  );
}

const BRAG_KEYS = ['holeInOne', 'eagle', 'birdie', 'turkey'] as const;

/** «Sesongen din»: årsvalg (nyeste valgt), runder, snitt, beste og bragdene. */
export function SeasonSection({ seasons }: { seasons: readonly SeasonSummary[] }) {
  const { colors } = useTheme();
  const [year, setYear] = useState<number | null>(seasons[0]?.year ?? null);

  if (seasons.length === 0) {
    return (
      <Section heading={HISTORY_TEXT.seasonHeading} testID="stats-season">
        <Text style={[styles.body, { color: colors.muted }]}>{HISTORY_TEXT.seasonEmpty}</Text>
      </Section>
    );
  }

  const selected = seasons.find((s) => s.year === year) ?? seasons[0];
  const previous = seasons.find((s) => s.year === selected.year - 1) ?? null;
  const brags = BRAG_KEYS.map((key) => ({ key, count: selected.achievements[key] })).filter(
    (b) => b.count > 0,
  );
  const diff = (a: number | null, b: number | null | undefined) =>
    previous && a != null && b != null ? a - b : null;

  return (
    <Section
      heading={HISTORY_TEXT.seasonHeading}
      subtitle={HISTORY_TEXT.seasonSubtitle}
      testID="stats-season"
    >
      {seasons.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.years}
          accessibilityRole="tablist"
          accessibilityLabel={HISTORY_TEXT.seasonYearAriaLabel}
        >
          {seasons.map((s) => {
            const active = s.year === selected.year;
            return (
              <Pressable
                key={s.year}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => setYear(s.year)}
                style={[
                  styles.yearPill,
                  active
                    ? { backgroundColor: colors.primary, borderColor: colors.primary }
                    : { borderColor: colors.border },
                ]}
                testID={`stats-season-year-${s.year}`}
              >
                <Text
                  style={[styles.yearText, { color: active ? colors.onPrimary : colors.muted }]}
                >
                  {s.year}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
      <NumberRow
        testID="stats-season-numbers"
        cells={[
          {
            label: HISTORY_TEXT.seasonColRounds,
            value: selected.rounds,
            delta: diff(selected.rounds, previous?.rounds),
          },
          {
            label: HISTORY_TEXT.seasonColAvg,
            value: selected.grossAverage,
            delta: diff(selected.grossAverage, previous?.grossAverage),
          },
          {
            label: HISTORY_TEXT.seasonColBest,
            value: selected.bestRound,
            delta: diff(selected.bestRound, previous?.bestRound),
          },
        ]}
      />
      {previous ? (
        <Text style={[styles.note, { color: colors.muted }]}>{seasonVsPrevious(previous.year)}</Text>
      ) : null}
      {brags.length > 0 ? (
        <View style={styles.brags}>
          <Text style={[styles.microLabel, { color: colors.muted }]}>
            {HISTORY_TEXT.seasonBragderLabel}
          </Text>
          <View style={styles.chips}>
            {brags.map((b) => (
              <View
                key={b.key}
                style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.bg }]}
                accessible
                accessibilityLabel={`${HISTORY_TEXT.brag[b.key]}: ${b.count}`}
              >
                <Text style={[styles.chipText, { color: colors.text }]}>{HISTORY_TEXT.brag[b.key]}</Text>
                <Text style={[styles.chipCount, { color: colors.primary }]}>{b.count}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </Section>
  );
}

/**
 * «Serien din»: uker på rad når en serie på minst to uker pågår, ellers en
 * vennlig linje (aldri et tap). Året er telefonens.
 */
export function StreakSection({ streak, year }: { streak: StreakSummary; year: number }) {
  const { colors } = useTheme();
  const active = streak.weeklyStreakActive && streak.weeklyStreak >= MIN_STREAK_WEEKS;
  return (
    <Section
      heading={HISTORY_TEXT.streakHeading}
      subtitle={HISTORY_TEXT.streakSubtitle}
      testID="stats-streak"
    >
      <View style={[styles.divided, { borderTopColor: colors.divider }]}>
        {active ? (
          <View
            style={styles.streakRow}
            accessible
            accessibilityLabel={`${streak.weeklyStreak} ${HISTORY_TEXT.streakWeeksLabel}`}
            testID="stats-streak-active"
          >
            <Text style={styles.fire}>🔥</Text>
            <Text style={[styles.streakNumber, { color: colors.accentText }]}>
              {streak.weeklyStreak}
            </Text>
            <Text style={[styles.body, { color: colors.muted }]}>{HISTORY_TEXT.streakWeeksLabel}</Text>
          </View>
        ) : (
          <Text style={[styles.body, { color: colors.muted }]} testID="stats-streak-dormant">
            {HISTORY_TEXT.streakDormant}
          </Text>
        )}
        <Text style={[styles.body, styles.note, { color: colors.text }]}>
          {streakSeason(streak.roundsThisSeason, year)}
        </Text>
      </View>
    </Section>
  );
}

const BRAG_EMOJI = { holeInOne: '🎯', eagle: '🦅', birdie: '🐦', turkey: '🦃' } as const;

/** «Bragd-veggen»: de fire bragdene gjennom årene; de du ikke har, er dempet. */
export function AchievementSection({ achievements }: { achievements: Achievements }) {
  const { colors } = useTheme();
  return (
    <Section
      heading={HISTORY_TEXT.achievementsHeading}
      subtitle={HISTORY_TEXT.achievementsSubtitle}
      testID="stats-achievements"
    >
      <View style={[styles.wall, styles.divided, { borderTopColor: colors.divider }]}>
        {BRAG_KEYS.map((key) => {
          const count = achievements[key];
          const earned = count > 0;
          return (
            <View
              key={key}
              style={[
                styles.badge,
                earned
                  ? {
                      borderColor: withAlpha(colors.accent, 0.4),
                      backgroundColor: withAlpha(colors.accent, 0.05),
                    }
                  : { borderColor: colors.border, backgroundColor: colors.bg, opacity: 0.5 },
              ]}
              accessible
              accessibilityLabel={`${HISTORY_TEXT.brag[key]}: ${count}`}
              testID={`stats-badge-${key}`}
            >
              <Text style={styles.badgeEmoji}>{BRAG_EMOJI[key]}</Text>
              <Text style={[styles.microLabel, styles.center, { color: colors.muted }]}>
                {HISTORY_TEXT.brag[key]}
              </Text>
              <Text style={[styles.badgeCount, { color: earned ? colors.accentText : colors.muted }]}>
                {count}
              </Text>
            </View>
          );
        })}
      </View>
    </Section>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.statCell} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={[styles.microLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

/**
 * «Putte-snitt»: putter per hull fra første førte hull, og snitt, beste og
 * runder når en hel runde er ført. Skjult for den som aldri har ført en putt.
 */
export function PuttsSection({ putts }: { putts: PuttsStats }) {
  const { colors } = useTheme();
  if (putts.holesCounted === 0) return null;
  const qualifying = putts.roundsCounted > 0;
  return (
    <Section heading={HISTORY_TEXT.puttsHeading} subtitle={HISTORY_TEXT.puttsSubtitle} testID="stats-putts">
      <View style={[styles.statRow, styles.divided, { borderTopColor: colors.divider }]}>
        <StatCell
          label={HISTORY_TEXT.puttsColPph}
          value={putts.pph != null ? formatOneDecimal(putts.pph) : ''}
        />
        {qualifying ? (
          <>
            <StatCell
              label={HISTORY_TEXT.puttsColAvg}
              value={putts.avgPuttsPerRound != null ? formatOneDecimal(putts.avgPuttsPerRound) : ''}
            />
            <StatCell label={HISTORY_TEXT.puttsColBest} value={String(putts.bestRoundPutts ?? 0)} />
            <StatCell label={HISTORY_TEXT.puttsColRounds} value={String(putts.roundsCounted)} />
          </>
        ) : null}
      </View>
      {qualifying ? null : (
        <Text style={[styles.body, styles.note, { color: colors.muted }]}>
          {putts.nearMiss.partialRounds > 0
            ? puttsNearMiss(putts.nearMiss.missingHoles, putts.nearMiss.partialRounds)
            : HISTORY_TEXT.puttsEmpty}
        </Text>
      )}
    </Section>
  );
}

/** «Baner»: én rad per bane med en hel runde, flest runder først. */
export function CoursesSection({ courses }: { courses: readonly CourseStat[] }) {
  const { colors } = useTheme();
  return (
    <Section heading={HISTORY_TEXT.coursesHeading} subtitle={HISTORY_TEXT.coursesSubtitle} testID="stats-courses">
      {courses.length === 0 ? (
        <Text style={[styles.body, styles.divided, { color: colors.muted, borderTopColor: colors.divider }]}>
          {HISTORY_TEXT.coursesEmpty}
        </Text>
      ) : (
        courses.map((course) => (
          <View
            key={course.courseId}
            style={[styles.courseRow, { borderTopColor: colors.divider }]}
            testID={`stats-course-${course.courseId}`}
          >
            <Text style={[styles.courseName, { color: colors.text }]} numberOfLines={2}>
              {course.courseName}
            </Text>
            <View style={styles.statRow}>
              <StatCell label={HISTORY_TEXT.coursesColRounds} value={String(course.rounds)} />
              <StatCell label={HISTORY_TEXT.coursesColAvg} value={String(course.average)} />
              <StatCell label={HISTORY_TEXT.coursesColBest} value={String(course.best)} />
            </View>
          </View>
        ))
      )}
    </Section>
  );
}

const styles = StyleSheet.create({
  // Formkortets ramme (designlerretet).
  card: {
    marginTop: 14,
    marginHorizontal: 16,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
  },
  heading: { fontSize: 18, fontFamily: FONTS.serifDisplay },
  subtitle: { fontSize: 13, fontFamily: FONTS.sans, marginTop: 2, lineHeight: 18 },
  body: { fontSize: 14, fontFamily: FONTS.sans, lineHeight: 20 },
  note: { marginTop: 8 },
  center: { textAlign: 'center' },
  numbers: { flexDirection: 'row', borderTopWidth: 1, marginTop: 10, paddingTop: 10 },
  cell: { flex: 1, alignItems: 'center' },
  middle: { borderLeftWidth: 1, borderRightWidth: 1 },
  value: { fontSize: 22, fontFamily: FONTS.serifScore, fontVariant: ['tabular-nums'] },
  cellLabel: { fontSize: 11, fontFamily: FONTS.sans },
  delta: { fontSize: 11, fontFamily: FONTS.sans, fontVariant: ['tabular-nums'], marginTop: 2 },
  years: { gap: 8, paddingTop: 10 },
  yearPill: {
    minHeight: TAP,
    minWidth: TAP,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  yearText: { fontSize: 14, fontFamily: FONTS.sansMedium, fontVariant: ['tabular-nums'] },
  brags: { marginTop: 14 },
  microLabel: {
    fontSize: 10,
    fontFamily: FONTS.sansSemiBold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  chipText: { fontSize: 13, fontFamily: FONTS.sans },
  chipCount: { fontSize: 13, fontFamily: FONTS.sansSemiBold, fontVariant: ['tabular-nums'] },
  divided: { borderTopWidth: 1, marginTop: 10, paddingTop: 12 },
  streakRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  fire: { fontSize: 24 },
  streakNumber: { fontSize: 30, fontFamily: FONTS.serifDisplay, fontVariant: ['tabular-nums'] },
  wall: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  badge: {
    flexBasis: '47%',
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 4,
  },
  badgeEmoji: { fontSize: 24 },
  badgeCount: { fontSize: 20, fontFamily: FONTS.serifDisplay, fontVariant: ['tabular-nums'] },
  statRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 16, flexWrap: 'wrap' },
  statCell: { alignItems: 'flex-end', gap: 4 },
  statValue: { fontSize: 16, fontFamily: FONTS.sansSemiBold, fontVariant: ['tabular-nums'] },
  courseRow: {
    borderTopWidth: 1,
    marginTop: 10,
    paddingTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  courseName: { flex: 1, minWidth: 120, fontSize: 16, fontFamily: FONTS.serifDisplay },
});
