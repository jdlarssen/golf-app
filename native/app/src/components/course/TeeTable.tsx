// native/app/src/components/course/TeeTable.tsx
// #2757: tee-ene på «Ny bane». Brikker for hvilke tee-er banen har, og slope, CR
// og lengde per tee. Hva et trykk gjør, sier `teeChips` (samme som nettet, med
// maks 7 og hver farge én gang).
//
// **Telefonen er smalere enn nettets tabell.** Navnet står på egen linje over
// feltene, så tre kolonner (herre, dame, junior) får plass med felt som er brede
// nok å treffe. Komma er det telefonen gir på norsk, og det får stå i feltet;
// `courseDraftToFormData` bytter det før parseren.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { MAX_TEE_BOXES } from '../../../../../lib/courses/constants';
import {
  TEE_CHIP_ORDER,
  addCustomTee,
  customNameProblem,
  removeCustomTee,
} from '../../../../../lib/courses/teeChips';
import { TEE_COLOR_NAMES, type TeeColor } from '../../../../../lib/courses/teeColors';
import {
  COURSE_TEXT,
  teeCellLabel,
  teeLengthLabel,
  teeMaxReached,
  teeNameDuplicate,
} from '../../lib/courseCopy';
import { addTeeChip, type TeeDraft } from '../../lib/courseDraft';
import { FONTS, TAP, TEE_DOT_COLORS, useTheme } from '../../theme';
import { Chips, Field } from '../create/primitives';

type Gender = 'mens' | 'ladies' | 'juniors';

const COLUMN: Record<Gender, string> = {
  mens: COURSE_TEXT.teeColMens,
  ladies: COURSE_TEXT.teeColLadies,
  juniors: COURSE_TEXT.teeColJuniors,
};
const GENDER_WORD: Record<Gender, string> = {
  mens: COURSE_TEXT.teeGenderMens,
  ladies: COURSE_TEXT.teeGenderLadies,
  juniors: COURSE_TEXT.teeGenderJuniors,
};

/** En hvit prikk skal også synes på hvit bunn, derav ringen, som på nettet. */
function TeeDot({ color }: { color: TeeColor }) {
  return <View style={[styles.dot, { backgroundColor: TEE_DOT_COLORS[color] }]} />;
}

const OTHER = 'other';
const customChip = (name: string) => `custom:${name}`;

export function TeeTable({
  tees,
  nine,
  onTees,
}: {
  tees: TeeDraft[];
  /** 9 hull: tallene gjelder fortsatt 18 hull, og det må stå (#2484). */
  nine: boolean;
  onTees: (next: TeeDraft[]) => void;
}) {
  const { colors, ui } = useTheme();
  const [juniorsOpen, setJuniorsOpen] = useState(false);
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherName, setOtherName] = useState('');

  const full = tees.length >= MAX_TEE_BOXES;
  const genders: Gender[] = juniorsOpen ? ['mens', 'ladies', 'juniors'] : ['mens', 'ladies'];
  const duplicate = customNameProblem(otherName, tees) === 'duplicate';
  const customTees = tees.filter((tee) => tee.color === null);

  function update(index: number, patch: Partial<TeeDraft>) {
    onTees(tees.map((tee, i) => (i === index ? { ...tee, ...patch } : tee)));
  }

  function tapChip(chip: string) {
    if (chip === OTHER) {
      setOtherOpen((open) => !open);
    } else if (chip.startsWith('custom:')) {
      onTees(removeCustomTee({ rows: tees, removed: [] }, chip.slice('custom:'.length)).rows);
    } else {
      onTees(addTeeChip(tees, chip as TeeColor));
    }
  }

  function addOther() {
    const next = addCustomTee({ rows: tees, removed: [] }, otherName);
    if ('problem' in next) return;
    onTees(next.rows);
    setOtherName('');
    setOtherOpen(false);
  }

  // Lukkes kolonnen, tømmes tallene, så skjemaet aldri sender tall du ikke ser.
  function toggleJuniors() {
    if (juniorsOpen) {
      onTees(tees.map((tee) => ({ ...tee, slope_juniors: '', course_rating_juniors: '' })));
    }
    setJuniorsOpen(!juniorsOpen);
  }

  return (
    <View>
      <Field label={COURSE_TEXT.teeChipsKicker}>
        <Chips<string>
          testID="tee-chips"
          value={[
            ...tees.flatMap((tee) => (tee.color ? [tee.color as string] : [])),
            ...customTees.map((tee) => customChip(tee.name)),
            ...(otherOpen && !full ? [OTHER] : []),
          ]}
          onChange={tapChip}
          options={[
            ...TEE_CHIP_ORDER.map((color) => ({
              value: color as string,
              label: TEE_COLOR_NAMES[color],
              testID: `tee-chip-${color}`,
              leading: <TeeDot color={color} />,
              disabled: full && !tees.some((tee) => tee.color === color),
            })),
            ...customTees.map((tee) => ({
              value: customChip(tee.name),
              label: tee.name,
              testID: `tee-chip-custom-${tee.name}`,
            })),
            { value: OTHER, label: COURSE_TEXT.teeChipOther, testID: 'tee-chip-other', disabled: full },
          ]}
        />
      </Field>

      {otherOpen && !full ? (
        <View style={styles.other}>
          <View style={styles.otherRow}>
            <TextInput
              testID="tee-custom-name"
              style={[ui.input, styles.otherField]}
              accessibilityLabel={COURSE_TEXT.teeCustomNameLabel}
              value={otherName}
              onChangeText={setOtherName}
              onSubmitEditing={addOther}
              placeholder={COURSE_TEXT.teeCustomNamePlaceholder}
              placeholderTextColor={colors.muted}
              returnKeyType="done"
              autoCorrect={false}
              autoFocus
            />
            <Pressable
              testID="tee-custom-add"
              accessibilityRole="button"
              style={[ui.buttonSecondary, styles.otherAdd]}
              onPress={addOther}
            >
              <Text style={ui.buttonSecondaryText}>{COURSE_TEXT.teeCustomNameAdd}</Text>
            </Pressable>
          </View>
          {duplicate ? (
            <Text style={[ui.muted, styles.line, { color: colors.warningText }]} testID="tee-custom-duplicate">
              {teeNameDuplicate(otherName.trim())}
            </Text>
          ) : null}
        </View>
      ) : null}

      {full ? (
        <Text style={[ui.muted, styles.line]} testID="tee-max">
          {teeMaxReached(MAX_TEE_BOXES)}
        </Text>
      ) : null}

      {tees.length > 0 ? (
        <>
          <Text style={[ui.label, styles.tableHead]}>{COURSE_TEXT.teeTableKicker}</Text>
          {nine ? <Text style={[ui.muted, styles.line]}>{COURSE_TEXT.teeNineHint}</Text> : null}
          <View style={[ui.card, styles.table]} testID="tee-table">
            {tees.map((tee, i) => (
              <View
                key={tee.color ?? `custom-${tee.name}`}
                style={[styles.tee, i > 0 && styles.teeDivider, i > 0 && { borderTopColor: colors.border }]}
                testID={`tee-row-${i}`}
              >
                <View style={styles.teeHead}>
                  <View style={styles.teeName}>
                    {tee.color ? <TeeDot color={tee.color} /> : null}
                    <Text style={[ui.body, styles.teeNameText]} numberOfLines={1}>
                      {tee.name}
                    </Text>
                  </View>
                  <Text style={[ui.muted, styles.small]}>{COURSE_TEXT.teeLength}</Text>
                  <TextInput
                    testID={`tee-${i}-length`}
                    accessibilityLabel={teeLengthLabel(tee.name)}
                    style={[ui.input, styles.number, styles.lengthField]}
                    value={tee.length_meters}
                    onChangeText={(text) => update(i, { length_meters: text })}
                    keyboardType="number-pad"
                    maxLength={5}
                    selectTextOnFocus
                  />
                </View>
                <View style={styles.columns}>
                  {genders.map((gender) => (
                    <View key={gender} style={styles.column}>
                      <Text style={[ui.muted, styles.small]}>{COLUMN[gender]}</Text>
                      <View style={styles.pair}>
                        <TextInput
                          testID={`tee-${i}-slope-${gender}`}
                          accessibilityLabel={teeCellLabel(tee.name, GENDER_WORD[gender], COURSE_TEXT.teeFieldSlope)}
                          style={[ui.input, styles.number, styles.slope]}
                          value={tee[`slope_${gender}`]}
                          onChangeText={(text) => update(i, { [`slope_${gender}`]: text })}
                          keyboardType="number-pad"
                          maxLength={3}
                          selectTextOnFocus
                        />
                        <TextInput
                          testID={`tee-${i}-cr-${gender}`}
                          accessibilityLabel={teeCellLabel(tee.name, GENDER_WORD[gender], COURSE_TEXT.teeFieldCr)}
                          style={[ui.input, styles.number, styles.cr]}
                          value={tee[`course_rating_${gender}`]}
                          onChangeText={(text) => update(i, { [`course_rating_${gender}`]: text })}
                          keyboardType="decimal-pad"
                          maxLength={5}
                          selectTextOnFocus
                        />
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
          <Text style={[ui.muted, styles.line]}>{COURSE_TEXT.teeEmptyHint}</Text>
          <Pressable
            testID="tee-juniors-toggle"
            accessibilityRole="button"
            style={[styles.dashed, { borderColor: colors.border }]}
            onPress={toggleJuniors}
          >
            <Text style={ui.muted}>{juniorsOpen ? COURSE_TEXT.removeJuniors : COURSE_TEXT.addJuniors}</Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.25)',
  },
  other: { marginTop: 8 },
  otherRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  otherField: { flex: 1 },
  otherAdd: { marginTop: 0 },
  line: { marginTop: 8 },
  tableHead: { marginTop: 16 },
  // 12 som på nettet, ikke kortets 16: tre kolonner skal få plass på 390 pt.
  table: { marginTop: 8, paddingHorizontal: 12, paddingVertical: 4, gap: 0 },
  tee: { paddingVertical: 12, gap: 8 },
  teeDivider: { borderTopWidth: StyleSheet.hairlineWidth },
  teeHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  teeName: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  teeNameText: { flexShrink: 1, fontFamily: FONTS.sansSemiBold },
  lengthField: { width: 72 },
  small: { fontSize: 11 },
  columns: { flexDirection: 'row', gap: 8 },
  column: { flex: 1, minWidth: 0, gap: 4 },
  pair: { flexDirection: 'row', gap: 4 },
  number: {
    minHeight: TAP,
    paddingHorizontal: 0,
    paddingVertical: 0,
    textAlign: 'center',
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  slope: { flex: 1, minWidth: 0 },
  cr: { flex: 1.2, minWidth: 0 },
  dashed: {
    minHeight: TAP,
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
