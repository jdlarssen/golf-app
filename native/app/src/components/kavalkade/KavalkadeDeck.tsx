// #2265 PR 2: Kavalkaden som bla-bar kortstokk, som webbens `KavalkadeDeck`.
//
// To faner («Ditt år» og «Gjengen») og én vannrett skinne per fane. Skjermen
// åpner på `deck.defaultTab`, altså «Gjengen» under terskelen, som på webben.
//
// Skinna går helt ut til skjermkanten, og kortet er 88 % av innholdsbredden med
// 16 pt mellomrom, så nabokortet titter fram i kanten. Sveipen lander alltid
// midt på ett kort, som webbens `snap-center` i en `snap-mandatory`-skinne:
// første og siste kort stopper ved kanten av skinna, og kortene mellom står
// midt på skjermen (`kavalkadeSnapOffsets`). Ett sveip flytter ett kort.
//
// Alle kortene i en fane er like høye (det høyeste), som på webben, der lista
// strekker kortene i høyden.
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type {
  KavalkadeCardId,
  KavalkadeDeck as Deck,
  KavalkadeTab,
} from '../../../../../lib/kavalkade/kavalkadeCards';
import { kavalkadeT as t } from '../../lib/kavalkadeCopy';
import { TAP, fraunces, interLine, useTheme } from '../../theme';
import { KavalkadeCard } from './KavalkadeCard';
import { CARD_SHARE_OF_WIDTH, PAGE_GUTTER } from './KavalkadeSkeleton';

/** Mellomrommet mellom kortene (`gap-4`). */
export const CARD_GAP = 16;

/**
 * Hvor skinna stopper for hvert kort: kortet midt på skjermen, men aldri forbi
 * kantene av skinna. Det er nettleserens `snap-center`, regnet ut på forhånd.
 */
export function kavalkadeSnapOffsets(count: number, screenWidth: number, cardWidth: number): number[] {
  const contentWidth = PAGE_GUTTER * 2 + count * cardWidth + Math.max(0, count - 1) * CARD_GAP;
  const max = Math.max(0, contentWidth - screenWidth);
  return Array.from({ length: count }, (_, index) => {
    const center = PAGE_GUTTER + index * (cardWidth + CARD_GAP) + cardWidth / 2;
    return Math.min(max, Math.max(0, center - screenWidth / 2));
  });
}

export function KavalkadeDeck({
  deck,
  action,
}: {
  deck: Deck;
  /** Handlingen på et kort (deleknappen), slått opp på kort-ID. */
  action?: (id: KavalkadeCardId) => ReactNode;
}) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const [active, setActive] = useState<KavalkadeTab>(deck.defaultTab);
  const cards = active === 'personal' ? deck.personal : deck.gang;
  const cardWidth = (width - PAGE_GUTTER * 2) * CARD_SHARE_OF_WIDTH;

  return (
    <View>
      <View
        accessibilityRole="tablist"
        accessibilityLabel={t('tabsAriaLabel')}
        style={[styles.tabs, { borderBottomColor: colors.border }]}
      >
        {(['personal', 'gang'] as const).map((tab) => {
          const selected = active === tab;
          return (
            <Pressable
              key={tab}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => setActive(tab)}
              style={[styles.tab, selected ? { borderBottomColor: colors.primary, borderBottomWidth: 2 } : null]}
              testID={`kavalkade-tab-${tab}`}
            >
              <Text style={[styles.tabText, { color: selected ? colors.text : colors.muted }]}>
                {tab === 'personal' ? t('tabPersonal') : t('tabGang')}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {cards.length === 0 ? (
        <Text style={[styles.empty, { color: colors.muted }]} testID="kavalkade-tab-empty">
          {t('tabEmpty')}
        </Text>
      ) : (
        <ScrollView
          // Ny skinne per fane, så den starter på første kort.
          key={active}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToOffsets={kavalkadeSnapOffsets(cards.length, width, cardWidth)}
          decelerationRate="fast"
          disableIntervalMomentum
          style={styles.rail}
          contentContainerStyle={styles.railContent}
          testID="kavalkade-rail"
        >
          {cards.map((card, index) => (
            <View key={card.id} style={{ width: cardWidth }}>
              <KavalkadeCard
                card={card}
                position={t('cardPosition', { index: index + 1, total: cards.length })}
                action={action?.(card.id)}
              />
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// Webben: fane-raden har 1 px kant under og `mb-4`; hver fane er minst 44 høy
// med `py-3` og Fraunces 16 uten vekt (400), og den valgte har 2 px skog under.
const TAB_TEXT = fraunces(400, 16, 24);
const EMPTY = interLine(14, 22.75, { multiline: true });

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', borderBottomWidth: 1, marginBottom: 16 },
  tab: { flex: 1, minHeight: TAP, paddingVertical: 12, alignItems: 'center' },
  tabText: { ...TAB_TEXT },
  empty: { ...EMPTY },
  rail: { marginHorizontal: -PAGE_GUTTER },
  railContent: { paddingHorizontal: PAGE_GUTTER, paddingBottom: 8, gap: CARD_GAP },
});
