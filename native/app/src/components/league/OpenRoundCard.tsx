// #2638 Del 2: den åpne runden på ligasiden (tegning 2, 2b og 6).
//
// Skogbåndet øverst («RUNDE 3», «Åpen», «Stenger tor. 23.59»), så «hvem har
// spilt» for alle deltakerne (`delivered`/`inProgress` fra ruta, samme
// `roundPlayerLocks` som startporten), og under dem enten «Spill runden»,
// «Du har levert» eller ingenting. Når knappen vises, avgjør skjermen
// (`League.tsx`); kortet tegner bare det det får.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { AppLeagueRound, AppLeagueView } from '../../../../../lib/league/appLeagueView';
import {
  LEAGUE_TEXT,
  WINDOW_CHIP,
  playedByNames,
  roundClosesTitle,
  roundWindowSub,
} from '../../lib/leagueCopy';
import { FONTS, cardShadow, fraunces, interLine, useTheme, withAlpha } from '../../theme';
import { LigaHakeIcon } from '../icons/Icons';

/** Det under «hvem har spilt»: knappen, kvitteringen, eller en merknad. */
export type RoundAction =
  | { kind: 'play'; onPress: () => void }
  /** Uten nett (tegning 6): knappen dempet, og hvorfor. */
  | { kind: 'play-offline' }
  | { kind: 'delivered'; nextOpens: string | null }
  | { kind: 'note'; text: string }
  | { kind: 'none' };

export function OpenRoundCard({
  view,
  round,
  action,
}: {
  view: Pick<AppLeagueView, 'participants' | 'me'>;
  round: AppLeagueRound;
  action: RoundAction;
}) {
  const { colors, scheme } = useTheme();
  const meId = view.me.userId;
  const locked = new Set([...round.delivered, ...round.inProgress]);
  const missing = view.participants.map((p) => p.userId).filter((id) => !locked.has(id));
  const groups = [
    { key: 'delivered', label: LEAGUE_TEXT.delivered, ids: round.delivered },
    { key: 'inProgress', label: LEAGUE_TEXT.inProgress, ids: round.inProgress },
    { key: 'missing', label: LEAGUE_TEXT.missing, ids: missing },
  ].filter((g) => g.ids.length > 0);

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border, boxShadow: cardShadow(scheme) },
      ]}
      testID="league-open-round"
    >
      <View style={[styles.band, { backgroundColor: colors.surfaceStrong }]}>
        <View style={styles.bandTop}>
          <Text style={[styles.kicker, { color: colors.accent }]}>{round.label}</Text>
          <View style={[styles.bandChip, { backgroundColor: withAlpha(colors.live, 0.22) }]}>
            <Text style={[styles.bandChipText, { color: colors.onStrongWarm }]}>{WINDOW_CHIP.open}</Text>
          </View>
        </View>
        <Text style={[styles.title, { color: colors.onStrong }]} testID="league-open-round-title">
          {roundClosesTitle(round.closesAt)}
        </Text>
        <Text style={[styles.sub, { color: BAND_SUB }]}>{roundWindowSub(round.opensAt, round.closesAt)}</Text>
      </View>
      <View style={styles.body}>
        {groups.map((group, index) => (
          <View
            key={group.key}
            style={[styles.who, index > 0 ? { borderTopWidth: 1, borderTopColor: colors.divider } : null]}
            testID={`league-who-${group.key}`}
          >
            <WhoIcon kind={group.key} />
            <View style={styles.whoText}>
              <Text style={[styles.whoKey, { color: colors.muted }]}>{group.label}</Text>
              <Text style={[styles.whoNames, { color: colors.text }]} testID={`league-who-${group.key}-names`}>
                {playedByNames(group.ids, meId, view.participants)}
              </Text>
            </View>
          </View>
        ))}
        <Action action={action} />
      </View>
    </View>
  );
}

/** Tegningenes `.who-ic`: hake (har spilt), prikk i ring (i gang), stiplet ring (mangler). */
function WhoIcon({ kind }: { kind: string }) {
  const { colors } = useTheme();
  if (kind === 'delivered') {
    return (
      <View style={[styles.whoIcon, { backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.youBorder }]}>
        <LigaHakeIcon color={colors.primary} size={13} />
      </View>
    );
  }
  if (kind === 'inProgress') {
    return (
      <View style={[styles.whoIcon, { borderWidth: 1.5, borderColor: colors.live }]}>
        <View style={[styles.whoDot, { backgroundColor: colors.live }]} />
      </View>
    );
  }
  return <View style={[styles.whoIcon, { borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.scoreUnsetFg }]} />;
}

function Action({ action }: { action: RoundAction }) {
  const { colors } = useTheme();
  switch (action.kind) {
    case 'play':
      return (
        <Pressable
          onPress={action.onPress}
          accessibilityRole="button"
          style={[styles.cta, { backgroundColor: colors.primary }]}
          testID="league-play-round"
        >
          <Text style={[styles.ctaText, { color: colors.onPrimary }]}>{LEAGUE_TEXT.playRound}</Text>
        </Pressable>
      );
    case 'play-offline':
      return (
        <View testID="league-play-offline">
          <View
            style={[styles.cta, styles.ctaOff, { backgroundColor: colors.primary }]}
            accessible
            accessibilityRole="button"
            accessibilityLabel={LEAGUE_TEXT.playRound}
            accessibilityHint={LEAGUE_TEXT.needNetToStart}
            accessibilityState={{ disabled: true }}
          >
            <Text style={[styles.ctaText, { color: colors.onPrimary }]}>{LEAGUE_TEXT.playRound}</Text>
          </View>
          <Text style={[styles.hint, { color: colors.muted }]}>{LEAGUE_TEXT.needNetToStart}</Text>
        </View>
      );
    case 'delivered':
      return (
        <View
          style={[styles.okBox, { backgroundColor: colors.primarySoft, borderColor: colors.youBorder }]}
          testID="league-delivered"
        >
          <View style={[styles.okIcon, { backgroundColor: colors.primary }]}>
            <LigaHakeIcon color={colors.onPrimary} size={15} />
          </View>
          <View style={styles.okText}>
            <Text style={[styles.okTitle, { color: colors.text }]}>{LEAGUE_TEXT.youDelivered}</Text>
            {action.nextOpens ? (
              <Text style={[styles.okSub, { color: colors.muted }]}>{action.nextOpens}</Text>
            ) : null}
          </View>
        </View>
      );
    case 'note':
      return (
        <Text style={[styles.hint, { color: colors.muted }]} testID="league-round-note">
          {action.text}
        </Text>
      );
    case 'none':
      return null;
  }
}

/** `.rsub`: kremen med 90 %, lik i begge draktene på tegningene. */
const BAND_SUB = 'rgba(240, 237, 229, 0.9)';

const styles = StyleSheet.create({
  // `.round`: 14 over, 16 fra kanten, 20 i hjørnene.
  card: { marginTop: 14, marginHorizontal: 16, borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  band: { paddingTop: 12, paddingBottom: 14, paddingHorizontal: 20 },
  bandTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kicker: {
    ...interLine(10, 12),
    fontFamily: FONTS.sansSemiBold,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  bandChip: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999 },
  bandChipText: { ...interLine(11, 14), fontFamily: FONTS.sansSemiBold },
  title: { ...fraunces(500, 26, 30), marginTop: 4 + fraunces(500, 26, 30).marginTop },
  sub: { ...interLine(13, 16), fontFamily: FONTS.sans, marginTop: 2 + interLine(13, 16).marginTop },
  body: { paddingTop: 2, paddingBottom: 16, paddingHorizontal: 20 },
  // `.who`: 9 over og under, ikonet 12 fra teksten.
  who: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 9 },
  whoIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    marginTop: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  whoDot: { width: 8, height: 8, borderRadius: 4 },
  whoText: { flex: 1 },
  whoKey: {
    ...interLine(10, 12),
    fontFamily: FONTS.sansSemiBold,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  whoNames: { ...interLine(15, 20), fontFamily: FONTS.sans, marginTop: 2 + interLine(15, 20).marginTop },
  // `.cta`: 52 høy, 12 over.
  cta: { height: 52, marginTop: 12, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  ctaOff: { opacity: 0.45 },
  ctaText: { ...interLine(16, 19), fontFamily: FONTS.sansSemiBold },
  hint: { ...interLine(12, 16), fontFamily: FONTS.sans, textAlign: 'center', marginTop: 8 },
  // `.okbox`: 12 over, 12 og 14 inn, 14 i hjørnene.
  okBox: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  okIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  okText: { flex: 1 },
  okTitle: { ...interLine(15, 20), fontFamily: FONTS.sansSemiBold },
  okSub: { ...interLine(12, 16), fontFamily: FONTS.sans },
});
