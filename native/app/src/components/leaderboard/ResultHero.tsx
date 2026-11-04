// #2756: toppen på et avsluttet spill, etter tegningene `Resultat-B-*`, som
// eieren valgte 04.11. Spillnavnet, setningen fra bildet som deles («Marte vant
// med 38 poeng»), formatlinja og «Del resultat», på skogflaten under pila og
// pillen i navigatorens topp. Toppen ruller bort med resten.
//
// Tre varianter, som `RoundReportQuote`: solo-tavla (de siste 8 pt går bak
// tavleflaten), lagtavla og formatene uten egen tavle.
import { StyleSheet, Text, View } from 'react-native';
import { ACCENT_ON_STRONG } from '../../../../../lib/og/palette';
import type { ResultHeroModel } from '../../lib/resultHero';
import { FONTS, fraunces, interLine, useTheme, withAlpha } from '../../theme';
import { ResultConfetti } from './ResultConfetti';
import { ShareResultButton } from './ShareResultButton';

export type ResultHeroVariant = 'solo' | 'team' | 'plain';

/** Tavleflaten går 8 pt opp i båndet i tegningen; sitatet gjør det selv når det står under. */
const SOLO_OVERLAP = 8;
/** Luften mot sitatets hårstrek er delt med `RoundReportQuote` (14 pt i alt). */
const BOTTOM_TO_QUOTE = { solo: 12, team: 16, plain: 16 } as const;
const BOTTOM_ALONE = { solo: 20, team: 16, plain: 20 } as const;

export function ResultHero({
  hero,
  kicker,
  subtitle,
  variant,
  hasQuote,
  note,
}: {
  hero: ResultHeroModel;
  kicker: string;
  subtitle: string;
  variant: ResultHeroVariant;
  hasQuote: boolean;
  /** «Sluttresultatet er fra telefonen» når innhentingen feilet. */
  note: string | null;
}) {
  const { colors } = useTheme();
  const team = variant === 'team';
  const ink = team ? colors.onStrongWarm : colors.onStrong;
  const soft = withAlpha(ink, team ? 0.8 : 0.85);
  return (
    <View
      style={[
        styles.band,
        { backgroundColor: colors.surfaceStrong },
        { paddingTop: team ? 4 : 0, paddingBottom: (hasQuote ? BOTTOM_TO_QUOTE : BOTTOM_ALONE)[variant] },
        variant === 'solo' && !hasQuote ? { marginBottom: -SOLO_OVERLAP } : null,
      ]}
      testID="result-hero"
    >
      <View accessible accessibilityRole="header" accessibilityLabel={[kicker, hero.a11y, hero.members, subtitle].filter(Boolean).join(', ')}>
        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          style={[styles.kicker, { color: team ? soft : colors.accent }]}
          testID="result-hero-kicker"
        >
          {kicker}
        </Text>
        <Text style={[styles.sentence, { color: ink }]} testID="result-hero-sentence">
          {hero.lines.map((words, lineIndex) => (
            <Text key={lineIndex}>
              {lineIndex > 0 ? '\n' : ''}
              {words.map((word, index) => (
                <Text key={index} style={word.gold ? (hero.goldItalic ? styles.goldItalic : styles.gold) : null}>
                  {index > 0 ? ' ' : ''}
                  {word.text}
                </Text>
              ))}
            </Text>
          ))}
        </Text>
        {hero.members ? (
          <Text style={[styles.members, { color: ink }]} testID="result-hero-members">
            {hero.members}
          </Text>
        ) : null}
        <Text style={[styles.subtitle, { color: soft }]}>{subtitle}</Text>
        {note ? (
          <Text style={[styles.subtitle, { color: soft }]} testID="leaderboard-seed-failed">
            {note}
          </Text>
        ) : null}
      </View>
      <ShareResultButton card={hero.card} />
      {hero.celebrates ? <ResultConfetti gameId={hero.gameId} endedAt={hero.endedAt} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  band: { paddingHorizontal: 20 },
  kicker: { ...interLine(12, 15), fontFamily: FONTS.sansSemiBold },
  // 36/40 og 500, som tegningen; 6 pt under spillnavnet.
  sentence: {
    ...fraunces(500, 36, 40, { multiline: true }),
    marginTop: 6 + fraunces(500, 36, 40, { multiline: true }).marginTop,
  },
  gold: { color: ACCENT_ON_STRONG },
  goldItalic: { color: ACCENT_ON_STRONG, fontFamily: 'FrauncesItalic500O36' },
  members: { ...interLine(14, 17), fontFamily: FONTS.sansMedium, marginTop: 4 },
  subtitle: { ...interLine(13, 16), fontFamily: FONTS.sans, marginTop: 4 },
});
