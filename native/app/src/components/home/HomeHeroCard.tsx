// #2254: heltekortet på Hjem — det store skoggrønne kortet for runden du er
// midt i.
//
// Kortet tegner bare det `buildHeroModel` svarer (`lib/homeHero.ts`); det
// regner ingenting selv. Uten modell (bundelen er aldri hentet, og nettet er
// borte) står navn, bane og «Åpne runden →», og ringen og plassen kommer når
// bundelen er på plass.
//
// **Skjermleseren.** Kortet er ikke ett stort trykkfelt: da ville VoiceOver
// lest det som én knapp, og ringen og knappene inni ville forsvunnet. Toppen
// (navn og bane) er knappen som åpner runden. Ringen er et bilde med egen
// etikett, og knappene er egne knapper. Midtpartiet kan fortsatt trykkes på
// (seende brukere treffer kortet hvor som helst), men er ikke et eget element
// for skjermleseren.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { HomeCard } from '../../data/homeList';
import { ACTIVE_CARD_LABELS } from '../../lib/display';
import {
  HOME_TEXT,
  approvalsLine,
  continueOnHole,
  holesPlayedLine,
  placeLine,
  ringNextLabel,
  standingDetail,
} from '../../lib/homeCopy';
import type { HeroModel } from '../../lib/homeHero';
import { FONTS, TAP, useTheme } from '../../theme';
import { HoleRing } from '../icons/Icons';

export interface HomeHeroCardProps {
  card: HomeCard;
  /** `null` når bundelen ikke finnes på enheten ennå. */
  model: HeroModel | null;
  onOpenGame: () => void;
  onHole: (holeNumber: number) => void;
  onSubmit: () => void;
  onBoard: () => void;
  onApprove: () => void;
}

export function HomeHeroCard({
  card,
  model,
  onOpenGame,
  onHole,
  onSubmit,
  onBoard,
  onApprove,
}: HomeHeroCardProps) {
  const { colors, ui } = useTheme();
  const ink = { color: colors.onStrong };
  const playable = model !== null && model.gate === null;

  return (
    <View testID="home-hero">
      <View
        style={[styles.card, { backgroundColor: colors.surfaceStrong }]}
        testID={`home-hero-card-${card.gameId}`}
      >
        <Pressable
          onPress={onOpenGame}
          accessibilityRole="button"
          accessibilityLabel={[HOME_TEXT.inProgress, card.name, card.courseName]
            .filter(Boolean)
            .join(', ')}
          style={styles.head}
          testID="home-hero-open"
        >
          <Text style={[styles.kicker, ink]}>{HOME_TEXT.inProgress}</Text>
          <Text style={[styles.name, ink]}>{card.name}</Text>
          {card.courseName ? (
            <Text style={[styles.course, ink]}>{card.courseName}</Text>
          ) : null}
        </Pressable>

        {playable ? (
          <Pressable
            onPress={onOpenGame}
            accessible={false}
            style={styles.middle}
            testID="home-hero-middle"
          >
            <Ring model={model} color={colors.onStrong} />
            <View style={styles.standing}>
              <Standing model={model} />
            </View>
          </Pressable>
        ) : null}

        <PrimaryAction
          model={model}
          onOpenGame={onOpenGame}
          onHole={onHole}
          onSubmit={onSubmit}
        />

        {playable ? (
          <Pressable
            onPress={onBoard}
            accessibilityRole="link"
            style={styles.link}
            testID="home-hero-board"
          >
            <Text style={[styles.linkText, ink]}>{HOME_TEXT.board}</Text>
          </Pressable>
        ) : null}
      </View>

      {model && model.approvals > 0 ? (
        <Pressable
          onPress={onApprove}
          accessibilityRole="button"
          style={[ui.banner, styles.approvals]}
          testID="home-hero-approvals"
        >
          <Text style={[ui.body, { color: colors.primary, fontFamily: FONTS.sansSemiBold }]}>
            {approvalsLine(model.approvals)}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Ringen med hullet du skal til, eller hvor mange du har spilt når alt er tastet. */
function Ring({ model, color }: { model: HeroModel; color: string }) {
  const next = model.action?.kind === 'hole' ? model.action.holeNumber : null;
  const label =
    next !== null
      ? ringNextLabel(next, model.holeCount, model.played)
      : holesPlayedLine(model.played, model.holeCount);
  return (
    <View
      style={styles.ring}
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      testID="home-hero-ring"
    >
      <HoleRing color={color} fraction={model.played / model.holeCount} testID="home-hero-ring-svg" />
      <View style={styles.ringCenter}>
        <Text style={[styles.ringKicker, { color }]}>
          {next !== null ? HOME_TEXT.holeKicker : HOME_TEXT.playedKicker}
        </Text>
        <Text style={[styles.ringNumber, { color }]} testID="home-hero-ring-number">
          {next ?? model.played}
        </Text>
      </View>
    </View>
  );
}

/** Plassen og linja under, eller hvor mange hull som er spilt uten plass. */
function Standing({ model }: { model: HeroModel }) {
  const { colors } = useTheme();
  const ink = { color: colors.onStrong };
  if (!model.standing || !model.unit) {
    return (
      <Text style={[styles.detail, ink]} testID="home-hero-played">
        {holesPlayedLine(model.played, model.holeCount)}
      </Text>
    );
  }
  const leads = model.standing.rank === 1;
  return (
    <>
      <View style={styles.placeRow}>
        {leads ? (
          <View
            style={[styles.gold, { backgroundColor: colors.accent }]}
            testID="home-hero-gold"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        ) : null}
        <Text style={[styles.place, ink]} testID="home-hero-place">
          {placeLine(model.standing)}
        </Text>
      </View>
      <Text style={[styles.detail, ink]} testID="home-hero-detail">
        {standingDetail(model.standing, model.unit)}
      </Text>
    </>
  );
}

function PrimaryAction({
  model,
  onOpenGame,
  onHole,
  onSubmit,
}: {
  model: HeroModel | null;
  onOpenGame: () => void;
  onHole: (holeNumber: number) => void;
  onSubmit: () => void;
}) {
  const { colors } = useTheme();

  if (model && model.action === null) {
    // Levert, til godkjenning eller trukket: etiketten, ingen knapp.
    return (
      <View style={[styles.stateBadge, { borderColor: colors.onStrong }]} testID="home-hero-state">
        <Text style={[styles.stateText, { color: colors.onStrong }]}>
          {ACTIVE_CARD_LABELS[model.state]}
        </Text>
      </View>
    );
  }
  const action = model?.action ?? ({ kind: 'open' } as const);

  const [label, onPress] =
    action.kind === 'hole'
      ? [continueOnHole(action.holeNumber), () => onHole(action.holeNumber)]
      : action.kind === 'submit'
        ? [HOME_TEXT.submit, onSubmit]
        : [HOME_TEXT.openRound, onOpenGame];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.button, { backgroundColor: colors.onStrong }]}
      testID="home-hero-cta"
    >
      <Text style={[styles.buttonText, { color: colors.surfaceStrong }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 22, padding: 20, gap: 14, marginTop: 8 },
  head: { gap: 2, minHeight: TAP },
  kicker: {
    fontSize: 12,
    fontFamily: FONTS.sansSemiBold,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    opacity: 0.85,
  },
  name: { fontSize: 22, fontFamily: FONTS.serifScore },
  course: { fontSize: 14, fontFamily: FONTS.sans, opacity: 0.85 },
  middle: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  ring: { width: 112, height: 112, alignItems: 'center', justifyContent: 'center' },
  ringCenter: { position: 'absolute', alignItems: 'center' },
  ringKicker: {
    fontSize: 11,
    fontFamily: FONTS.sansSemiBold,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  ringNumber: { fontSize: 36, fontFamily: FONTS.serifScore, fontVariant: ['tabular-nums'] },
  standing: { flex: 1, gap: 4 },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gold: { width: 14, height: 14, borderRadius: 7 },
  place: { fontSize: 22, fontFamily: FONTS.serifScore, fontVariant: ['tabular-nums'] },
  detail: {
    fontSize: 14,
    fontFamily: FONTS.sans,
    opacity: 0.9,
    fontVariant: ['tabular-nums'],
  },
  button: {
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontSize: 16, fontFamily: FONTS.sansSemiBold },
  stateBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  stateText: { fontSize: 14, fontFamily: FONTS.sansSemiBold },
  link: { minHeight: TAP, justifyContent: 'center', alignSelf: 'flex-start' },
  linkText: { fontSize: 15, fontFamily: FONTS.sansMedium, textDecorationLine: 'underline' },
  approvals: { minHeight: TAP, justifyContent: 'center' },
});
