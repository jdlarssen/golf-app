// #2632: sitatet i tavlas hode («Retning B», `Retning-B-sitat-lys` / `-natt`).
//
// Historiens første setning står som sitat under formatlinja, og lenka under
// ruller ned til hele historien. Båndet er navigatorens header og står fast;
// sitatet ligger øverst i rulleflaten, i samme skogfarge, så det ser ut som en
// forlengelse av båndet og ruller bort med resten. Ellers ville 90 pt av
// skjermen vært opptatt hele runden.
//
// Tre varianter: solo-tavla (de siste 8 pt går bak tavleflaten, som
// `bandTail` før), lagtavla (egen kremfarge, ingen overlapp) og formater uten
// egen tavle (ingen skogflate, mørk tekst på den lyse bakgrunnen).
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ROUND_REPORT_APP_TEXT } from '../../lib/boardCopy';
import { FONTS, fraunces, interLine, TAP, useTheme } from '../../theme';
import { ChevronIcon } from '../icons/Icons';

export type RoundReportQuoteVariant = 'solo' | 'team' | 'plain';

/** `#rrggbb` som `rgba(...)`, til hårstreken i blekkets farge. */
function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Tavleflaten går 8 pt opp i båndet i tegningen; lagtavla gjør ikke det. */
const SOLO_OVERLAP = 8;

export function RoundReportQuote({
  quote,
  variant,
  onReadMore,
}: {
  /** Første setning, uten anførselstegn (`reportQuote`). */
  quote: string;
  variant: RoundReportQuoteVariant;
  /** Ruller ned til kortet med hele historien. */
  onReadMore: () => void;
}) {
  const { colors } = useTheme();
  const banded = variant !== 'plain';
  const ink = variant === 'team' ? colors.onStrongWarm : variant === 'solo' ? colors.onStrong : colors.text;
  // Gull mot skog i båndet; på den lyse bakgrunnen er gull for svakt, så der
  // står lenka i primærfargen.
  const linkColor = banded ? colors.accent : colors.primary;
  const rule = banded ? withAlpha(ink, 0.35) : colors.border;
  return (
    <View
      style={[
        styles.wrap,
        banded
          ? { backgroundColor: colors.surfaceStrong, paddingBottom: 24 }
          : { paddingBottom: 8 },
        // Skjermer uten tavle har sin egen sidemarg (`ui.scroll`).
        { paddingHorizontal: banded ? 20 : 0 },
        variant === 'solo' ? { marginBottom: -SOLO_OVERLAP } : null,
      ]}
      testID="round-report-quote"
    >
      <View style={[styles.figure, { borderTopColor: rule }]}>
        <Text style={[styles.quote, { color: ink }]} testID="round-report-quote-text">
          {`«${quote}»`}
        </Text>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={ROUND_REPORT_APP_TEXT.quoteLink}
          onPress={onReadMore}
          style={styles.link}
          testID="round-report-quote-link"
        >
          <Text style={[styles.linkText, { color: linkColor }]}>{ROUND_REPORT_APP_TEXT.quoteLink}</Text>
          <ChevronIcon size={14} color={linkColor} strokeWidth={2} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: 14 },
  figure: { borderTopWidth: 1, paddingTop: 12, gap: 6 },
  // 18/500 med linjehøyde 1,35, som tegningen.
  quote: { ...fraunces(500, 18, 24.3, { multiline: true }) },
  link: {
    alignSelf: 'flex-start',
    minHeight: TAP,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  linkText: { ...interLine(13, 16), fontFamily: FONTS.sansSemiBold },
});
