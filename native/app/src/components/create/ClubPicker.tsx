// native/app/src/components/create/ClubPicker.tsx
// #2753: «Hvilken klubb?» øverst på formatsteget for «Klubb-turnering».
//
// Kortene er nettets `ClubPicker` (artboardet `Nyttspill-forslag-klubb-forst`):
// to i bredden, 72 høye, klubbnavnet og antall medlemmer, med rollen din der du
// styrer klubben. Det finnes ikke noe «Ingen klubb»: med én klubb er den valgt
// fra start, ellers venter «Neste» på et valg (`lib/wizard/clubChoice.ts`).
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { AppClubOption } from '../../../../../lib/clubs/appClubOptionsView';
import { CLUB_TEXT, clubCardLine } from '../../lib/arrangementCopy';
import { FONTS, fraunces, interLine, useTheme } from '../../theme';

export function ClubPicker({
  clubs,
  selected,
  onSelect,
}: {
  clubs: readonly AppClubOption[];
  selected: string;
  onSelect: (clubId: string) => void;
}) {
  const { colors, ui } = useTheme();

  return (
    <View testID="create-club-picker">
      <Text style={ui.sectionTitle}>{CLUB_TEXT.legend}</Text>
      <View style={styles.grid}>
        {clubs.map((club) => {
          const active = club.id === selected;
          return (
            <View key={club.id} style={styles.cell}>
              <Pressable
                testID={`create-club-${club.id}`}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => onSelect(club.id)}
                style={[
                  styles.card,
                  active
                    ? { backgroundColor: colors.primarySoft, borderColor: colors.primary, borderWidth: 2 }
                    : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
                ]}
              >
                <Text style={[styles.name, { color: colors.text }]}>{club.name}</Text>
                <Text style={[styles.line, { color: colors.muted }]}>
                  {clubCardLine(club.role, club.memberCount)}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
      <Text style={[styles.hint, { color: colors.muted }]}>{CLUB_TEXT.hint}</Text>
    </View>
  );
}

const GAP = 8;

const styles = StyleSheet.create({
  // Artboardet har kortene 16 fra kanten (skjermen har 20) og 8 mellom dem. Hver
  // celle er halve rutenettet, så et kort alene er like bredt som to i en rad.
  grid: { marginTop: 8, marginHorizontal: -4 - GAP / 2, flexDirection: 'row', flexWrap: 'wrap', rowGap: GAP },
  cell: { width: '50%', paddingHorizontal: GAP / 2 },
  card: {
    minHeight: 72,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  name: fraunces(600, 16, undefined, { multiline: true }),
  line: { ...interLine(12, 15), fontFamily: FONTS.sans, marginTop: 2 + interLine(12, 15).marginTop },
  hint: {
    ...interLine(12, 17.4, { multiline: true }),
    fontFamily: FONTS.sans,
    marginTop: 8 + interLine(12, 17.4, { multiline: true }).marginTop,
  },
});
