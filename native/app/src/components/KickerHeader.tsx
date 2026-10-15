// Toppen fra designlerretet (#2255, #2256): tilbake-pila, et lite sperret ord
// i midten og ingen skillelinje. Ordet sier hvor du er («STARTBILLETT»,
// «PROFIL», «MITT SCOREKORT»); sidens egen tittel står stort i innholdet
// (`PageTitle`). Én stil for alle: den delte `ui.kicker`.
//
// #2385 flyttet den hit fra `navigation.tsx`, så en skjerm kan sette ordet
// selv når det først er kjent etter lasting (scorekortet sier «Lagets
// scorekort · Lag 2» i lagformatene).
//
// #2385 («Felles topp»): toppen er designets egen rad (`KickerTopBar`) i
// stedet for iOS sin navigasjonslinje, gjennom native-stack sin
// `header`-opsjon. iOS 26 la linja 9 pt høyere enn designet og tegnet
// glassbobler rundt knappene. Designets rad: 8 pt luft over og på sidene,
// tilbake-pila og høyre-knappen i hver sin boks på 44 × 44, og ordet midt
// mellom dem; 52 pt i alt under sikker-sonen. Sveip tilbake er fortsatt
// systemets, fordi skjermen fortsatt ligger i den native stakken.
//
// Uten ord (`kickerHeader('', …)`) er raden bare pila: Profil har den til
// bunnmenyen kommer (eierens svar, #2385). Pila heter «Tilbake», eller det
// designet kaller den der det sier noe (`backLabel`: «Tilbake til profil» i
// rommene under profilen).
//
// Tavla (#2579) har sitt eget bånd på skogflaten (`boardHeader`): pila,
// pillen, spillnavnet, «Tavla» og formatlinja. Det er også navigatorens
// header, så pila står når skjermen kaster eller ikke har tegnet tavla.
// Lagtavla (PR 2) har sitt eget snitt av båndet: pillen midt på med fyll,
// dempet kicker og «Lagtavla» i Fraunces 28/500.
import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  FONTS,
  SUNLIGHT_THEME,
  TAP,
  ThemeScope,
  fraunces,
  interLine,
  useTheme,
  withAlpha,
} from '../theme';
import { TilbakeIcon } from './icons/Icons';

/** Luften over raden (under sikker-sonen) og ut til kantene, som i designet. */
const BAR_INSET = 8;
/** Pila sin etikett når designet ikke sier noe annet. */
const BACK_LABEL = 'Tilbake';
/**
 * Sollys (`Hull-sollys`): raden er 56 pt, med 12 pt ut til høyre kant, og
 * pila er 22 pt med 2,4 pt strek.
 */
const SUNLIGHT_ROW = 48;
const SUNLIGHT_RIGHT = 12;

type TopOptions = {
  backLabel?: string;
  /** En linje under ordet (hullsiden: «format · bane»). */
  subtitle?: string;
  /** Gull er spillnavnet på hullsiden; ellers det dempede ordet. */
  tone?: 'muted' | 'gold';
  /** Hullsiden i sollys: svart og hvitt, større pil, ingen tittel. */
  sunlight?: boolean;
};

/**
 * Header-valgene for toppen. `title` er skjermens navn for systemet: iOS
 * bruker det på tilbake-knappen og i tilbake-menyen på neste skjerm med
 * native topp (tavla), og det kan være et annet enn ordet i toppen.
 * Høyre-knappene er skjermens egen `headerRight` (del-knappen på billetten,
 * sollys og pokalen på hullsiden), som skjermen setter med `setOptions`.
 */
export function kickerHeader(
  kicker: string,
  title: string,
  { backLabel = BACK_LABEL, subtitle, tone = 'muted', sunlight = false }: TopOptions = {},
): NativeStackNavigationOptions {
  return {
    title,
    header: ({ back, navigation, options }) => (
      <ThemeScope theme={sunlight ? SUNLIGHT_THEME : null}>
        <KickerTopBar
          kicker={kicker}
          subtitle={subtitle}
          tone={tone}
          sunlight={sunlight}
          backLabel={backLabel}
          onBack={back ? () => navigation.goBack() : undefined}
          right={options.headerRight?.({ canGoBack: back != null })}
        />
      </ThemeScope>
    ),
  };
}

/** Pillen i tavlas bånd: «Live · etter 7 hull» med prikk, eller sluttresultatet uten. */
export type BoardPill = { text: string; live: boolean };

/**
 * Hvilken tegning båndet følger: solotavla, eller lagtavla. Lagtavla live
 * (`Lagtavle-forslag`) tegner linja med 85 % krem og pillens tall uten faste
 * sifre; ferdig og best ball (`team`) har 80 % og faste sifre.
 */
export type BoardBandVariant = 'solo' | 'team' | 'team-live';

/**
 * Tavlas bånd (#2579, `Tavle-forslag`): skogflaten med pila og pillen øverst,
 * så spillnavnet, «Tavla» og formatlinja. Pillen står bare når tavla har tall;
 * uten den er båndet det samme, så pila er der i alle tilstander.
 */
export function boardHeader({
  pill,
  kicker,
  title,
  subtitle,
  variant = 'solo',
}: {
  pill?: BoardPill;
  kicker: string;
  title: string;
  subtitle: string;
  variant?: BoardBandVariant;
}): NativeStackNavigationOptions {
  return {
    header: ({ back, navigation }) =>
      variant === 'solo' ? (
        <BoardTopBar
          pill={pill}
          kicker={kicker}
          title={title}
          subtitle={subtitle}
          onBack={back ? () => navigation.goBack() : undefined}
        />
      ) : (
        <TeamBoardTopBar
          pill={pill}
          kicker={kicker}
          title={title}
          subtitle={subtitle}
          live={variant === 'team-live'}
          onBack={back ? () => navigation.goBack() : undefined}
        />
      ),
  };
}

/**
 * Lagtavlas bånd (`Lagtavle-forslag`, `Lagtavle-ferdig-forslag-*`,
 * `Lagtavle-bestball-forslag-*`): 8 pt luft rundt raden og 16 pt under
 * linja (ingen tavleflate går opp i båndet her), pillen midt mellom pila og
 * like mye luft til høyre, og alt i den varme kremen.
 */
function TeamBoardTopBar({
  pill,
  kicker,
  title,
  subtitle,
  live,
  onBack,
}: {
  pill?: BoardPill;
  kicker: string;
  title: string;
  subtitle: string;
  live: boolean;
  onBack?: () => void;
}) {
  const { colors, ui } = useTheme();
  const insets = useSafeAreaInsets();
  const ink = colors.onStrongWarm;
  return (
    <View
      style={[styles.teamBoard, { paddingTop: insets.top + BAR_INSET, backgroundColor: colors.surfaceStrong }]}
      testID="board-top-bar"
    >
      <View style={styles.boardRow}>
        <View style={styles.side}>
          {onBack ? <BareBack label={BACK_LABEL} large={false} color={ink} onPress={onBack} /> : null}
        </View>
        {pill ? (
          <View style={[styles.teamPill, { backgroundColor: withAlpha(ink, 0.14) }]} testID="board-pill">
            {pill.live ? (
              <View style={[styles.teamPillDot, { backgroundColor: colors.live }]} testID="board-pill-dot" />
            ) : null}
            <Text style={[styles.teamPillText, { color: ink }, !live && ui.num]}>{pill.text}</Text>
          </View>
        ) : null}
        <View style={styles.side} />
      </View>
      <View
        style={styles.teamTitle}
        accessible
        accessibilityRole="header"
        accessibilityLabel={[kicker, title, subtitle].filter(Boolean).join(', ')}
      >
        <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.teamKicker, { color: withAlpha(ink, 0.8) }]}>
          {kicker}
        </Text>
        <Text style={[styles.teamHeading, { color: ink }]}>{title}</Text>
        <Text style={[styles.teamSubtitle, { color: withAlpha(ink, live ? 0.85 : 0.8) }]}>{subtitle}</Text>
      </View>
    </View>
  );
}

/**
 * Båndet. Bunnluften er 12 og ikke tegningens 20: tavleflaten går 8 pt opp i
 * båndet, og skjermen tegner de 8 siste i båndfargen bak flatens øvre kant.
 */
function BoardTopBar({
  pill,
  kicker,
  title,
  subtitle,
  onBack,
}: {
  pill?: BoardPill;
  kicker: string;
  title: string;
  subtitle: string;
  onBack?: () => void;
}) {
  const { colors, ui } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[styles.board, { paddingTop: insets.top + BAR_INSET, backgroundColor: colors.surfaceStrong }]}
      testID="board-top-bar"
    >
      <View style={styles.boardRow}>
        <View style={styles.side}>
          {onBack ? (
            <BareBack label={BACK_LABEL} large={false} color={colors.onStrong} onPress={onBack} />
          ) : null}
        </View>
        {pill ? (
          <View
            style={[styles.pill, { borderColor: withAlpha(colors.onStrong, 0.35) }]}
            testID="board-pill"
          >
            {pill.live ? (
              <View style={[styles.pillDot, { backgroundColor: colors.live }]} testID="board-pill-dot" />
            ) : null}
            <Text style={[styles.pillText, { color: colors.onStrong }, !pill.live && ui.num]}>
              {pill.text}
            </Text>
          </View>
        ) : null}
      </View>
      <View
        style={styles.boardTitle}
        accessible
        accessibilityRole="header"
        accessibilityLabel={[kicker, title, subtitle].filter(Boolean).join(', ')}
      >
        <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.boardKicker, { color: colors.accent }]}>
          {kicker}
        </Text>
        <Text style={[styles.boardHeading, { color: colors.onStrong }]}>{title}</Text>
        <Text style={[styles.boardSubtitle, { color: withAlpha(colors.onStrong, 0.85) }]}>{subtitle}</Text>
      </View>
    </View>
  );
}

/**
 * Raden: tilbake-pila til venstre, ordet i midten og høyre-knappene. Venstre
 * side er alltid like bred som høyre (minst 44 pt), så ordet står midt på
 * skjermen også når høyre side har to knapper.
 */
function KickerTopBar({
  kicker,
  subtitle,
  tone,
  sunlight,
  backLabel,
  onBack,
  right,
}: {
  kicker: string;
  subtitle?: string;
  tone: 'muted' | 'gold';
  sunlight: boolean;
  backLabel: string;
  onBack?: () => void;
  right?: ReactNode;
}) {
  const { colors, ui } = useTheme();
  const insets = useSafeAreaInsets();
  const [rightWidth, setRightWidth] = useState<number>(TAP);
  const side = Math.max(TAP, rightWidth);
  const ink = tone === 'gold' ? colors.accentText : colors.muted;
  return (
    <View
      style={[
        styles.bar,
        { paddingTop: insets.top + BAR_INSET, backgroundColor: colors.bg },
        sunlight && [styles.barSunlight, { minHeight: insets.top + BAR_INSET + SUNLIGHT_ROW }],
      ]}
      testID="kicker-top-bar"
    >
      <View style={[styles.side, { width: side }]}>
        {onBack ? <BareBack label={backLabel} large={sunlight} onPress={onBack} /> : null}
      </View>
      {/* Et langt ord (et spillnavn, #2392) kuttes med «…» på én linje i
          stedet for å bryte toppen over to; skjermleseren får hele. */}
      {kicker ? (
        <View
          style={styles.title}
          accessible
          accessibilityRole="header"
          accessibilityLabel={[kicker, subtitle].filter(Boolean).join(', ')}
        >
          <Text numberOfLines={1} ellipsizeMode="tail" style={[ui.kicker, styles.center, { color: ink }]}>
            {kicker}
          </Text>
          {subtitle ? (
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={[styles.subtitle, styles.center, { color: colors.muted }]}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.title} />
      )}
      <View
        style={[styles.side, styles.right]}
        onLayout={(e) => setRightWidth(e.nativeEvent.layout.width)}
        testID="kicker-top-bar-right"
      >
        {right}
      </View>
    </View>
  );
}

/** Tilbake-pila uten bakgrunn, midt i 44 pt å treffe på. På skogflaten er den lys. */
function BareBack({
  label,
  large,
  color,
  onPress,
}: {
  label: string;
  large: boolean;
  color?: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.back}
      testID="header-back"
    >
      <TilbakeIcon color={color ?? colors.text} size={large ? 22 : 20} strokeWidth={large ? 2.4 : 2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: BAR_INSET },
  barSunlight: { paddingRight: SUNLIGHT_RIGHT },
  side: { minWidth: TAP, height: TAP, justifyContent: 'center' },
  right: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  back: { width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, alignItems: 'center' },
  center: { textAlign: 'center' },
  subtitle: { fontSize: 12, fontFamily: FONTS.sans, marginTop: 2 },
  // Tavlas bånd (`Tavle-forslag`): 8 pt luft rundt raden, 4 pt ned til
  // tittelblokka, og tekstene med nettleserens `normal` linjehøyde.
  board: { paddingHorizontal: BAR_INSET, paddingBottom: 12, gap: 4 },
  boardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    marginRight: 8,
  },
  pillDot: { width: 8, height: 8, borderRadius: 4 },
  pillText: {
    ...interLine(11, 14),
    fontFamily: FONTS.sansSemiBold,
    letterSpacing: 1.32,
    textTransform: 'uppercase',
  },
  boardTitle: { paddingHorizontal: 12 },
  boardKicker: {
    ...interLine(10, 12),
    fontFamily: FONTS.sansSemiBold,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  boardHeading: { ...fraunces(600, 40, 42), marginTop: 4 + fraunces(600, 40, 42).marginTop },
  boardSubtitle: { ...interLine(13, 16), fontFamily: FONTS.sans, marginTop: 2 + interLine(13, 16).marginTop },
  // Lagtavla: pillen 24 pt høy med 10 pt luft, prikken 6 pt; kicker og linje
  // uten luft mellom seg, som i tegningene.
  teamBoard: { paddingHorizontal: BAR_INSET, paddingBottom: 16, gap: 4 },
  teamPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 24,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  teamPillDot: { width: 6, height: 6, borderRadius: 3 },
  teamPillText: {
    ...interLine(10, 12),
    fontFamily: FONTS.sansSemiBold,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  teamTitle: { paddingHorizontal: 12 },
  teamKicker: {
    ...interLine(10, 12),
    fontFamily: FONTS.sansSemiBold,
    letterSpacing: 2.2,
    textTransform: 'uppercase',
  },
  teamHeading: { ...fraunces(500, 28) },
  teamSubtitle: { ...interLine(13, 16), fontFamily: FONTS.sans },
});
