// native/app/src/components/create/FeeAndPrizes.tsx
// #2749 PR B: «Startkontingent» og «Premiebord» nederst i «Sett opp runden»
// (`Venterom-forslag-veiviser`). Lenkefeltet kommer først når beløpet er over 0,
// og sponsorfeltet først når premien har tekst. Lukket viser premiebordet
// «Legg til», eller hvor mange premier som er skrevet inn.
//
// Hvilke slott som vises, er nettets regel (`PrizeGameShape`): ingen pallplasser i
// matchplay-familien, og LD/CTP bare opp til antallet hull i sideturneringen.
// Lagringen beskjærer med samme regel (`parsePrizesFromFormData`), så et slott
// som er skjult her, lagres aldri. Logo lastes ikke opp i appen.
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { PRIZE_SLOTS, type PrizeDraft, type PrizeSlot } from '../../../../../lib/games/prizes';
import { sideLabel } from '../../../../../lib/games/sideLabel';
import { isMatchplayFamily } from '../../../../../lib/scoring/modes/types';
import type { AppGameMode } from '../../lib/appFormats';
import { PRIZE_TEXT, WIZARD_FEE_TEXT } from '../../lib/paymentCopy';
import { FONTS, fraunces, interLine, TAP, useTheme } from '../../theme';
import { Field } from './primitives';

/** Det arrangøren har skrevet, som råtekst til publisering (som `SetupText`). */
export interface FeeDraft {
  entryFee: string;
  paymentLink: string;
  prizes: PrizeDraft;
  prizesOpen: boolean;
}

/** Slottene veiviseren viser for formatet og sideturneringen. */
export function visiblePrizeSlots(
  mode: AppGameMode,
  side: { enabled: boolean; ldCount: number; ctpCount: number },
): PrizeSlot[] {
  const ld = side.enabled ? side.ldCount : 0;
  const ctp = side.enabled ? side.ctpCount : 0;
  return PRIZE_SLOTS.filter((slot) =>
    slot.category === 'placement'
      ? !isMatchplayFamily(mode)
      : slot.position <= (slot.category === 'longest_drive' ? ld : ctp),
  );
}

function slotLabel(slot: PrizeSlot, ld: number, ctp: number): string {
  if (slot.category === 'placement') return PRIZE_TEXT.placementLabel(slot.position);
  return slot.category === 'longest_drive'
    ? sideLabel(PRIZE_TEXT.ldLabel, slot.position, ld)
    : sideLabel(PRIZE_TEXT.ctpLabel, slot.position, ctp);
}

/** Medaljene i tegningen, som premiebordet i venterommet. */
const SILVER = '#CFC9BD';
const BRONZE = '#B07C52';
const MEDAL = 22;

export function FeeAndPrizes({
  mode,
  side,
  fee,
  onFee,
}: {
  mode: AppGameMode;
  side: { enabled: boolean; ldCount: number; ctpCount: number };
  fee: FeeDraft;
  onFee: (patch: Partial<FeeDraft>) => void;
}) {
  const { colors, ui, scheme } = useTheme();
  const slots = visiblePrizeSlots(mode, side);
  const filled = slots.filter((slot) => fee.prizes[slot.key].description.trim() !== '').length;
  const ld = side.enabled ? side.ldCount : 0;
  const ctp = side.enabled ? side.ctpCount : 0;
  const medalFill = { 1: colors.accent, 2: SILVER, 3: BRONZE } as Record<number, string>;
  const medalInk = scheme === 'dark' ? colors.bg : colors.text;

  const setPrize = (key: PrizeSlot['key'], patch: Partial<PrizeDraft[PrizeSlot['key']]>) =>
    onFee({ prizes: { ...fee.prizes, [key]: { ...fee.prizes[key], ...patch } } });

  return (
    <View testID="create-fee-and-prizes">
      <Text style={[ui.sectionTitle, styles.section]}>{WIZARD_FEE_TEXT.paymentLegend}</Text>
      <Text style={ui.muted}>{WIZARD_FEE_TEXT.paymentHint}</Text>
      <Field label={WIZARD_FEE_TEXT.entryFeeLabel}>
        <TextInput
          testID="create-entry-fee"
          style={[ui.input, styles.numbers]}
          value={fee.entryFee}
          onChangeText={(entryFee) => onFee({ entryFee: entryFee.replace(/[^0-9]/g, '') })}
          keyboardType="number-pad"
          placeholder={WIZARD_FEE_TEXT.entryFeePlaceholder}
          placeholderTextColor={colors.muted}
        />
      </Field>
      {Number(fee.entryFee) > 0 ? (
        <Field label={WIZARD_FEE_TEXT.paymentLinkLabel} hint={WIZARD_FEE_TEXT.paymentLinkHint}>
          <TextInput
            testID="create-payment-link"
            style={ui.input}
            value={fee.paymentLink}
            onChangeText={(paymentLink) => onFee({ paymentLink })}
            placeholder={WIZARD_FEE_TEXT.paymentLinkPlaceholder}
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </Field>
      ) : null}

      {slots.length > 0 ? (
        <>
          <View style={styles.prizesHead}>
            <Text style={[ui.sectionTitle, styles.inRow]}>{WIZARD_FEE_TEXT.prizesLegend}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: fee.prizesOpen }}
              onPress={() => onFee({ prizesOpen: !fee.prizesOpen })}
              style={styles.toggle}
              testID="create-prizes-toggle"
            >
              <Text style={[styles.toggleText, { color: colors.primary }]}>
                {fee.prizesOpen
                  ? WIZARD_FEE_TEXT.toggleHide
                  : filled > 0
                    ? PRIZE_TEXT.count(filled)
                    : WIZARD_FEE_TEXT.toggleAdd}
              </Text>
            </Pressable>
          </View>
          {fee.prizesOpen ? (
            <View
              style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
              testID="create-prizes"
            >
              {slots.map((slot, index) => {
                const label = slotLabel(slot, ld, ctp);
                const prize = fee.prizes[slot.key];
                const last = index === slots.length - 1;
                return (
                  <View
                    key={slot.key}
                    style={[styles.slot, last ? null : { borderBottomWidth: 1, borderBottomColor: colors.divider }]}
                    testID={`create-prize-${slot.key}`}
                  >
                    <View style={styles.slotHead}>
                      {slot.category === 'placement' ? (
                        <View style={[styles.medal, { backgroundColor: medalFill[slot.position] }]}>
                          <Text style={[styles.medalText, { color: medalInk }]}>{slot.position}</Text>
                        </View>
                      ) : null}
                      <Text style={[styles.slotLabel, { color: colors.text }]}>{label}</Text>
                    </View>
                    <TextInput
                      testID={`create-prize-${slot.key}-desc`}
                      accessibilityLabel={WIZARD_FEE_TEXT.prizeAriaLabel(label)}
                      style={ui.input}
                      value={prize.description}
                      onChangeText={(description) => setPrize(slot.key, { description })}
                      placeholder={WIZARD_FEE_TEXT.prizePlaceholder}
                      placeholderTextColor={colors.muted}
                      maxLength={120}
                    />
                    {prize.description.trim() !== '' ? (
                      <TextInput
                        testID={`create-prize-${slot.key}-sponsor`}
                        accessibilityLabel={WIZARD_FEE_TEXT.sponsorAriaLabel(label)}
                        style={[ui.input, styles.sponsor]}
                        value={prize.sponsor}
                        onChangeText={(sponsor) => setPrize(slot.key, { sponsor })}
                        placeholder={WIZARD_FEE_TEXT.sponsorLabel}
                        placeholderTextColor={colors.muted}
                        maxLength={60}
                      />
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // 24 pt over «Startkontingent» i tegningen: `sectionTitle` har 16, og 8 til.
  section: { marginTop: 24 },
  numbers: { fontVariant: ['tabular-nums'] },
  // 24 pt over raden i tegningen, som over «Startkontingent».
  prizesHead: {
    marginTop: 24,
    minHeight: TAP,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inRow: { marginTop: 0 },
  toggle: { minHeight: TAP, paddingHorizontal: 4, justifyContent: 'center' },
  toggleText: { ...interLine(15, 18), fontFamily: FONTS.sansSemiBold },
  card: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 4 },
  slot: { paddingVertical: 12, gap: 8 },
  slotHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  medal: {
    width: MEDAL,
    height: MEDAL,
    borderRadius: MEDAL / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medalText: fraunces(600, 12),
  slotLabel: { ...interLine(14, 17), fontFamily: FONTS.sansSemiBold },
  sponsor: { fontSize: 15 },
});
