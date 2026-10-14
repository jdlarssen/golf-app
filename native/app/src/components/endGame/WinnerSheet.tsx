// #2578: arket der arrangøren kårer vinneren av én sidepremie
// (`Avslutt-forslag-kaar` på designlerretet). Eierens valg 2026-10-14:
// «Liste som glir opp».
//
// Arket regner ingenting: kandidatene (`winnerCandidates`) og valget kommer fra
// skjermen, og et trykk sender verdien tilbake og lukker. «Ingen kvalifiserte»
// står i et eget kort under lista. Det ER et valg, ikke en tom verdi.
//
// Hinnen og arket er søsken, ikke forelder og barn, som i
// `components/hole/SpecificValueSheet.tsx`: en Pressable rundt arket ville gjort
// alt inni til ett element for VoiceOver.
//
// Lista ruller inne i kortet, så «Ingen kvalifiserte» står fast under den også
// i en klubbrunde med 150 spillere.
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BundlePlayer } from '../../data/gameBundle';
import { displayName } from '../../lib/display';
import { END_GAME_TEXT, slotLabel } from '../../lib/endGameCopy';
import { NO_WINNER, type FinishSlot } from '../../lib/endGamePlan';
import { FONTS, fraunces, interLine, TAP, useTheme, withAlpha } from '../../theme';
import { HakeIcon, LukkIcon } from '../icons/Icons';

/** Arket starter 92 pt under toppen av skjermen, som i tegningen. */
const SHEET_TOP = 92;

export function WinnerSheet({
  slot,
  candidates,
  choices,
  withdrawalSupported,
  onPick,
  onClose,
}: {
  /** Sloten som kåres; `null` er lukket. */
  slot: FinishSlot | null;
  candidates: readonly BundlePlayer[];
  /** Valgene som gjelder nå (`activeChoices`), per slot-nøkkel. */
  choices: Readonly<Record<string, string>>;
  /** Fotnoten om trukne er bare sann i formatene med frafall (beslutning 8). */
  withdrawalSupported: boolean;
  onPick: (value: string) => void;
  onClose: () => void;
}) {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  // Arket står montert mens det glir ned igjen: innholdet er den siste sloten,
  // og `visible` slår av.
  const [lastSlot, setLastSlot] = useState<FinishSlot | null>(slot);
  if (slot && slot.key !== lastSlot?.key) setLastSlot(slot);
  const shown = slot ?? lastSlot;
  if (!shown) return null;
  const value = choices[shown.key] ?? null;

  // Samme hinne som godkjenningsarket (#2577): skog med 45 % i lys, svart med
  // 55 % i natt. Står inline i begge til den som merges sist, samler dem.
  const scrim =
    scheme === 'dark' ? withAlpha('#000000', 0.55) : withAlpha(colors.text, 0.45);
  const pick = (next: string) => {
    onPick(next);
    onClose();
  };

  return (
    <Modal transparent visible={slot !== null} animationType="slide" onRequestClose={onClose}>
      <View
        style={styles.fill}
        testID="end-game-sheet"
        // VoiceOver holdes inne i arket, og «tilbake»-bevegelsen lukker det.
        accessibilityViewIsModal
        onAccessibilityEscape={onClose}
      >
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: scrim }]}
          onPress={onClose}
          onAccessibilityTap={onClose}
          accessibilityRole="button"
          accessibilityLabel={END_GAME_TEXT.close}
          testID="end-game-sheet-scrim"
        />
        <View
          style={[
            styles.sheet,
            {
              top: insets.top + SHEET_TOP,
              paddingBottom: 24 + insets.bottom,
              backgroundColor: colors.bg,
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <View style={styles.head}>
            <View style={styles.headText}>
              <Text style={[styles.kicker, { color: colors.accentText }]}>
                {END_GAME_TEXT.sheetKicker}
              </Text>
              <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
                {slotLabel(shown)}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              style={[styles.close, { backgroundColor: colors.surface2 }]}
              accessibilityRole="button"
              accessibilityLabel={END_GAME_TEXT.close}
              testID="end-game-sheet-close"
            >
              <LukkIcon color={colors.text} size={18} strokeWidth={2} />
            </Pressable>
          </View>
          <View style={styles.introBox}>
            <Text style={[styles.intro, { color: colors.muted }]}>{END_GAME_TEXT.sheetIntro}</Text>
          </View>

          <View
            style={[styles.list, { borderColor: colors.border, backgroundColor: colors.surface }]}
          >
            <ScrollView bounces={false}>
              {candidates.map((player, index) => {
                const checked = value === player.userId;
                return (
                  <Pressable
                    key={player.userId}
                    onPress={() => pick(player.userId)}
                    style={[
                      styles.row,
                      // Tegningens rad er 48 pluss streken under (content-box).
                      index < candidates.length - 1 && {
                        minHeight: 49,
                        borderBottomWidth: 1,
                        borderBottomColor: colors.divider,
                      },
                      checked && { backgroundColor: colors.primarySoft },
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{ checked }}
                    testID={`end-game-slot-${shown.key}-${player.userId}`}
                  >
                    <Radio checked={checked} />
                    <Text
                      style={[
                        styles.name,
                        checked && styles.nameChecked,
                        { color: colors.text },
                      ]}
                    >
                      {displayName(player)}
                    </Text>
                    {checked ? (
                      <HakeIcon color={colors.primary} size={18} strokeWidth={2.5} />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <Pressable
            onPress={() => pick(NO_WINNER)}
            style={[
              styles.none,
              {
                borderColor: colors.border,
                backgroundColor: value === NO_WINNER ? colors.primarySoft : colors.surface,
              },
            ]}
            accessibilityRole="radio"
            accessibilityState={{ checked: value === NO_WINNER }}
            testID={`end-game-slot-${shown.key}-${NO_WINNER}`}
          >
            <Radio checked={value === NO_WINNER} />
            <View style={styles.noneText}>
              <Text
                style={[
                  styles.noneName,
                  value === NO_WINNER && styles.nameChecked,
                  { color: colors.text },
                ]}
              >
                {END_GAME_TEXT.noQualified}
              </Text>
              <Text style={[styles.noneNote, { color: colors.muted }]}>
                {END_GAME_TEXT.noQualifiedNote}
              </Text>
            </View>
          </Pressable>

          {withdrawalSupported ? (
            <View style={styles.footBox}>
              <Text style={[styles.foot, { color: colors.muted }]}>
                {END_GAME_TEXT.sheetWithdrawnNote}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

/** Radioknappen: tom ring, eller grønn ring med prikk når den er valgt. */
function Radio({ checked }: { checked: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.radio,
        checked
          ? { borderWidth: 2, borderColor: colors.primary }
          : { borderWidth: 1.5, borderColor: colors.muted },
      ]}
    >
      {checked ? <View style={[styles.dot, { backgroundColor: colors.primary }]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 10,
    paddingHorizontal: 16,
  },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 999 },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 12,
    paddingHorizontal: 4,
  },
  headText: { flexShrink: 1 },
  kicker: {
    ...interLine(10, 12),
    fontFamily: FONTS.sansSemiBold,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  // `line-height: 1.2` og 2 pt over i tegningen.
  title: { ...fraunces(500, 24, 28.8, { multiline: true }) },
  close: {
    width: TAP,
    height: TAP,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  introBox: { marginTop: 6, marginBottom: 12, marginHorizontal: 4 },
  intro: { ...interLine(14, 19.6, { multiline: true }), fontFamily: FONTS.sans },
  list: { borderWidth: 1, borderRadius: 16, overflow: 'hidden', flexShrink: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  name: { ...interLine(16, 20), fontFamily: FONTS.sans, flexGrow: 1, flexShrink: 1 },
  nameChecked: { fontFamily: FONTS.sansSemiBold },
  // Uten `flexGrow`: i kolonnen under ville den strukket linja i høyden.
  noneName: { ...interLine(16, 20), fontFamily: FONTS.sans },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  dot: { width: 10, height: 10, borderRadius: 999 },
  none: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 16,
  },
  noneText: { flexShrink: 1 },
  noneNote: {
    ...interLine(12, 15),
    fontFamily: FONTS.sans,
    marginTop: 2 + interLine(12, 15).marginTop,
  },
  footBox: { marginTop: 10, marginHorizontal: 4 },
  foot: { ...interLine(12, 16.8, { multiline: true }), fontFamily: FONTS.sans },
});
