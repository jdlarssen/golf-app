// #2259 PR 4: kortet «Sjeldne slag i 2026» under lista på Topplista (designlerretet,
// «Toppliste B», gruppe 9): hver hole-in-one, albatross og eagle i sesongen, likt under
// alle tre fanene. Fem rader og «Vis alle N»; åpnet står alle, med «Vis færre». All tekst
// står på én linje (`numberOfLines={1}`), og hver rad har én etikett til skjermleseren
// (merket og datoen er skjult).
//
// #2894 PR 2: nederst står lenka til Æreslista (hole-in-one og albatross for alle år),
// under «Vis alle N», og også når kortet er tomt eller ikke fikk hentet slagene.
import { StyleSheet, Text, View } from 'react-native';
import { Tap } from '../Tap';
import type { MomentRowModel, MomentsModel } from '../../lib/toppliste';
import { TOPPLISTE_TEXT } from '../../lib/topplisteCopy';
import { FONTS, fraunces, interLine, TAP, useTheme } from '../../theme';
import { AchievementBadge } from '../history/AchievementBadge';
import { ChevronIcon } from '../icons/Icons';

/** Én rad: merket, navnet («Du» på din egen), datoen og slaget. Æreslista bruker den samme. */
export function MomentRow({ row, last, testID }: { row: MomentRowModel; last: boolean; testID: string }) {
  const { colors } = useTheme();
  const muted = row.isViewer ? colors.text : colors.muted;
  return (
    <View
      accessible
      accessibilityLabel={row.spoken}
      style={[
        styles.row,
        row.isViewer ? { backgroundColor: colors.youFill } : null,
        last ? null : { borderBottomWidth: 1, borderBottomColor: colors.divider },
      ]}
      testID={testID}
    >
      <AchievementBadge mark={row.mark} earned />
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
          <Text style={[styles.date, { color: muted }]}>{row.date}</Text>
        </View>
        <Text numberOfLines={1} style={styles.detail}>
          <Text style={[styles.shot, { color: colors.text }]}>{row.shot}</Text>
          <Text style={[styles.where, { color: muted }]}>{row.where}</Text>
        </Text>
      </View>
    </View>
  );
}

export function TopplisteMoments({
  model,
  expanded,
  onToggle,
  onRetry,
  onOpenAeresliste,
}: {
  model: MomentsModel;
  expanded: boolean;
  onToggle: () => void;
  onRetry: () => void;
  onOpenAeresliste: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      testID="toppliste-moments"
    >
      {/* Med rader har toppen en skillelinje under seg; i «Ingen ennå» og feilen (tegningen) står meldingen rett under. */}
      <View style={model.state === 'list' ? [styles.head, styles.headRule, { borderBottomColor: colors.divider }] : styles.head}>
        <Text numberOfLines={1} accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          {model.title}
        </Text>
        <Text numberOfLines={1} style={[styles.subtitle, { color: colors.muted }]}>
          {model.subtitle}
        </Text>
      </View>

      {model.state === 'failed' ? (
        <View accessibilityRole="alert" style={styles.failed} testID="toppliste-moments-failed">
          <Text numberOfLines={1} style={[styles.message, { color: colors.muted }]}>
            {TOPPLISTE_TEXT.momentsFailed}
          </Text>
          <Tap
            accessibilityRole="button"
            onPress={onRetry}
            style={[styles.retry, { borderColor: colors.primary }]}
            testID="toppliste-moments-failed-retry"
          >
            <Text style={[styles.retryText, { color: colors.primary }]}>{TOPPLISTE_TEXT.retry}</Text>
          </Tap>
        </View>
      ) : model.state === 'empty' ? (
        <Text numberOfLines={1} style={[styles.empty, { color: colors.muted }]} testID="toppliste-moments-empty">
          {model.emptyText}
        </Text>
      ) : (
        <>
          {model.rows.map((row, index) => (
            <MomentRow
              key={`${row.shot}-${row.name}-${row.date}-${index}`}
              row={row}
              testID={`toppliste-moment-${index}`}
              last={index === model.rows.length - 1 && model.toggleLabel === null}
            />
          ))}
          {model.toggleLabel ? (
            <Tap
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              onPress={onToggle}
              style={[
                styles.toggle,
                { borderTopColor: colors.divider },
              ]}
              testID="toppliste-moments-toggle"
            >
              <Text style={[styles.toggleText, { color: colors.primary }]}>{model.toggleLabel}</Text>
            </Tap>
          ) : null}
        </>
      )}

      <Tap
        accessibilityRole="link"
        accessibilityLabel={`${TOPPLISTE_TEXT.aeresHeading}. ${TOPPLISTE_TEXT.aeresLinkSubtitle}`}
        onPress={onOpenAeresliste}
        style={[styles.link, { borderTopColor: colors.divider }]}
        testID="toppliste-aeresliste-link"
      >
        <View style={styles.linkText}>
          <Text numberOfLines={1} style={[styles.linkTitle, { color: colors.text }]}>
            {TOPPLISTE_TEXT.aeresHeading}
          </Text>
          <Text numberOfLines={1} style={[styles.linkSubtitle, { color: colors.muted }]}>
            {TOPPLISTE_TEXT.aeresLinkSubtitle}
          </Text>
        </View>
        <ChevronIcon direction="right" color={colors.primary} size={16} strokeWidth={2} />
      </Tap>
    </View>
  );
}

const styles = StyleSheet.create({
  // 20 pt luft under lista; kortet er likt under alle tre fanene.
  card: { marginHorizontal: 16, marginTop: 20, borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  head: { paddingTop: 14, paddingHorizontal: 14 },
  headRule: { paddingBottom: 12, borderBottomWidth: 1 },
  title: fraunces(600, 18, 23),
  subtitle: { ...interLine(13, 16), marginTop: 2 },

  row: {
    minHeight: 60,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowMiddle: { flexGrow: 1, flexShrink: 1, minWidth: 0, gap: 4 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  name: { ...interLine(15, 18), flexShrink: 1, minWidth: 0 },
  youPill: { flexShrink: 0, height: 20, paddingHorizontal: 8, borderRadius: 999, justifyContent: 'center' },
  youPillText: { ...interLine(12, 20), fontFamily: FONTS.sansSemiBold },
  date: { ...interLine(13, 16), marginLeft: 'auto', flexShrink: 0, fontVariant: ['tabular-nums'] },
  detail: interLine(13, 16),
  shot: { ...interLine(13, 16), fontFamily: FONTS.sansSemiBold },
  where: { ...interLine(13, 16), fontVariant: ['tabular-nums'] },

  empty: { ...interLine(14, 18), paddingTop: 10, paddingHorizontal: 14, paddingBottom: 16 },
  failed: { paddingTop: 10, paddingHorizontal: 14, paddingBottom: 14 },
  message: interLine(14, 18),
  retry: {
    marginTop: 12,
    minHeight: TAP,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: { ...interLine(16, 20), fontFamily: FONTS.sansSemiBold },

  toggle: { minHeight: 48, paddingHorizontal: 16, borderTopWidth: 1, alignItems: 'center', justifyContent: 'center' },
  toggleText: { ...interLine(15, 18), fontFamily: FONTS.sansSemiBold, fontVariant: ['tabular-nums'] },

  // Lenka til Æreslista (gruppe 13): minst 56 høy, skillelinje over, pila i `primary`.
  link: {
    minHeight: 56,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  linkText: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
  linkTitle: { ...interLine(15, 18), fontFamily: FONTS.sansSemiBold },
  linkSubtitle: { ...interLine(12, 15), marginTop: 2 },
});
