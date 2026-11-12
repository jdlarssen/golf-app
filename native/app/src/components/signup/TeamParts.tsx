// native/app/src/components/signup/TeamParts.tsx
// #2840: delene lagskjemaet og svaret på en laginvitasjon har felles: skivene,
// oppstillingen, knappen nederst og ditt eget navn.
//
// Tegningen v3.1 er fasiten. Skivene er Hjems (`FlightAvatars.tsx`), større: du i
// `primary`, de andre i blek grønn, og i natt dyp skoggrønn (`surfaceStrong`), som på
// Hjem. En valgt venn får grønn ring og hake. Kapteinen har et lite gull-merke, «K».
// Ringene i tegningen er `box-shadow` og tar ingen plass; her er de en kant utenpå
// skiva med negativ avstand, så skiva står på samme sted med og uten ring.
import { forwardRef, useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fetchOwnProfile } from '../../data/profile';
import { useSession } from '../../session';
import { TEAM_SIGNUP_TEXT } from '../../lib/teamSignupCopy';
import { FONTS, fraunces, interLine, useTheme } from '../../theme';
import { UtslagHakeIcon } from '../icons/Icons';

export type DiscKind = 'me' | 'other' | 'empty' | 'unknown';

/**
 * Én skive. `lg` er oppstillingens 60 pt, `md` listas 40 pt. `empty` er den stiplede
 * ledige plassen med «+». `unknown` er deg i svaret på invitasjonen: stiplet i
 * `primary` med «?», fordi du ikke har svart ennå.
 */
export const TeamDisc = forwardRef<
  View,
  {
    kind: DiscKind;
    label: string;
    size: 'lg' | 'md';
    captain?: boolean;
    selected?: boolean;
    /** Fargen rundt merket og ringen: flaten skiva står på. */
    ground: string;
    faded?: boolean;
    testID?: string;
  }
>(function TeamDisc({ kind, label, size, captain = false, selected = false, ground, faded = false, testID }, ref) {
  const { colors, scheme } = useTheme();
  const side = size === 'lg' ? 60 : 40;
  const dashed = kind === 'empty' || kind === 'unknown';
  const fill =
    kind === 'me' ? colors.primary : dashed ? 'transparent' : scheme === 'dark' ? colors.surfaceStrong : colors.primarySoft;
  // Dine initialer: krem på skog i lys, mørkt blekk på salvie i natt (som Hjem).
  const ink =
    kind === 'me'
      ? scheme === 'dark'
        ? colors.onPrimary
        : colors.onStrong
      : kind === 'empty'
        ? colors.muted
        : colors.primary;
  return (
    <View
      ref={ref}
      style={[
        styles.disc,
        { width: side, height: side, borderRadius: side / 2, backgroundColor: fill },
        dashed ? [styles.dashed, { borderColor: kind === 'unknown' ? colors.primary : colors.muted }] : null,
        faded ? styles.faded : null,
      ]}
      testID={testID}
    >
      <Text
        style={[
          dashed ? styles.markText : size === 'lg' ? styles.lgText : styles.mdText,
          { color: ink },
        ]}
      >
        {label}
      </Text>
      {selected ? (
        <>
          <View style={[styles.ring, { borderColor: colors.primary, borderRadius: side / 2 + 4 }]} />
          <View style={[styles.check, { backgroundColor: colors.primary, borderColor: ground }]} testID={testID ? `${testID}-check` : undefined}>
            <UtslagHakeIcon color={colors.onPrimary} size={11} />
          </View>
        </>
      ) : null}
      {captain ? (
        <View style={[styles.band, { backgroundColor: colors.accent, borderColor: ground }]} testID={testID ? `${testID}-captain` : undefined}>
          <Text style={[styles.bandText, { color: colors.onAccent }]}>{TEAM_SIGNUP_TEXT.captainBadge}</Text>
        </View>
      ) : null}
    </View>
  );
});

/** Én plass i oppstillingen: skiva og navnet under. */
export function LineupCell({
  name,
  muted = false,
  children,
  onPress,
  accessibilityLabel,
  testID,
}: {
  name: string;
  muted?: boolean;
  children: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const { colors } = useTheme();
  const body = (
    <>
      {children}
      <Text style={[styles.cellName, { color: muted ? colors.muted : colors.text }]} numberOfLines={1}>
        {name}
      </Text>
    </>
  );
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={styles.cell}
      testID={testID}
    >
      {body}
    </Pressable>
  ) : (
    <View style={styles.cell} testID={testID} accessible={accessibilityLabel != null} accessibilityLabel={accessibilityLabel}>
      {body}
    </View>
  );
}

/**
 * Oppstillingen: fire kolonner som i tegningen. Et lag på to eller tre fyller bare de
 * første, så skivene står like store og på samme sted uansett lagstørrelse.
 */
export function Lineup({ children, testID }: { children: ReactNode[]; testID?: string }) {
  const spare = Math.max(0, 4 - children.length);
  return (
    <View style={styles.lineup} testID={testID}>
      {children}
      {Array.from({ length: spare }, (_, i) => (
        <View key={`spare-${i}`} style={styles.cell} />
      ))}
    </View>
  );
}

/** Knappen fast nederst, over en strek. */
export function Dock({ children, bottomInset }: { children: ReactNode; bottomInset: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.dock,
        { backgroundColor: colors.bg, borderTopColor: colors.border, paddingBottom: 18 + bottomInset },
      ]}
    >
      {children}
    </View>
  );
}

/**
 * En hel knapp i docken: `primary`, `line` (kant i `primary`), `danger` (rød, til en
 * bekreftelse som tar noe bort) eller `wait` (kan ikke trykkes).
 */
export function DockButton({
  label,
  variant,
  onPress,
  busy = false,
  testID,
}: {
  label: string;
  variant: 'primary' | 'line' | 'danger' | 'wait';
  onPress?: () => void;
  busy?: boolean;
  testID: string;
}) {
  const { colors } = useTheme();
  if (variant === 'wait') {
    return (
      <View
        accessible
        accessibilityRole="button"
        accessibilityState={{ disabled: true }}
        style={[styles.button, { backgroundColor: colors.surface2 }]}
        testID={testID}
      >
        <Text style={[styles.buttonText, { color: colors.muted }]}>{label}</Text>
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: busy, busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary'
          ? { backgroundColor: colors.primary }
          : variant === 'danger'
            ? { backgroundColor: colors.danger }
            : { borderWidth: 1, borderColor: colors.primary },
        pressed || busy ? styles.pressed : null,
      ]}
      testID={testID}
    >
      <Text
        style={[
          styles.buttonText,
          // `.btn.danger`: hvit tekst på rødt, i begge drakter.
          { color: variant === 'primary' ? colors.onPrimary : variant === 'danger' ? '#FFFFFF' : colors.primary },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Ditt eget navn, til initialene på skiva di og til å finne deg på laget. Leses fra
 * profilen, best effort: uten navn står «?» på skiva, og ingenting annet stopper.
 */
export function useOwnName(): { name: string | null; email: string | null } {
  const { userId, email } = useSession();
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetchOwnProfile(userId)
      .then((profile) => {
        if (alive) setName(profile.name);
      })
      .catch((err: unknown) => {
        console.error('[TeamSignup] profilen kunne ikke leses', err);
      });
    return () => {
      alive = false;
    };
  }, [userId]);
  return { name, email };
}

const HEADING = fraunces(500, 28, 33.6, { multiline: true });

export const teamStyles = StyleSheet.create({
  // `.tname`/`.head`: 6 over, 20 fra kanten.
  heading: { ...HEADING },
  // `.meta`/`.place`: 13 pt i `muted`, tall i like bredder.
  meta: { ...interLine(13, 16), fontFamily: FONTS.sans, fontVariant: ['tabular-nums'] },
  // `.block`: 14 over, 16 fra kanten og inni, 18 i hjørnene, 12 mellom delene.
  block: { marginTop: 14, marginHorizontal: 16, borderRadius: 18, padding: 16, gap: 12 },
  big: { ...fraunces(500, 22, 27.5, { multiline: true }) },
  body: { ...interLine(15, 21.75, { multiline: true }), fontFamily: FONTS.sans },
});

const styles = StyleSheet.create({
  disc: { alignItems: 'center', justifyContent: 'center' },
  dashed: { borderWidth: 1.5, borderStyle: 'dashed' },
  faded: { opacity: 0.55 },
  lgText: { fontSize: 18, fontFamily: FONTS.sansSemiBold, fontVariant: ['tabular-nums'] },
  mdText: { fontSize: 14, fontFamily: FONTS.sansSemiBold, fontVariant: ['tabular-nums'] },
  markText: { fontSize: 22, fontFamily: FONTS.sans },
  // `0 0 0 2px <flaten>, 0 0 0 4px primary`: 2 pt luft, så 2 pt ring.
  ring: { position: 'absolute', top: -4, left: -4, right: -4, bottom: -4, borderWidth: 2 },
  // Haken: 18 pt, 3 pt ut over kanten, med 2 pt av flaten rundt.
  check: {
    position: 'absolute',
    right: -5,
    bottom: -5,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Kapteinsmerket: 16 pt høyt, 5 pt luft på sidene, 4 i hjørnene, 2 pt av flaten rundt.
  band: {
    position: 'absolute',
    right: -6,
    bottom: -4,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bandText: { fontSize: 10, lineHeight: 12, fontFamily: FONTS.sansSemiBold },
  // `.lineup`: fire kolonner, 8 mellom, 18 over, 16 fra kanten, 4 under.
  lineup: { flexDirection: 'row', gap: 8, paddingTop: 18, paddingHorizontal: 16, paddingBottom: 4 },
  cell: { flex: 1, alignItems: 'center', gap: 6, minHeight: 84 },
  cellName: { ...interLine(13, 16), fontFamily: FONTS.sans },
  // `.dock`: 12 over, 16 fra kanten, 18 under, og en strek over.
  dock: { paddingTop: 12, paddingHorizontal: 16, borderTopWidth: 1, gap: 8 },
  // `.btn`: minst 52 pt, helt runde ender, 16/600.
  button: { minHeight: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  buttonText: { fontSize: 16, fontFamily: FONTS.sansSemiBold, textAlign: 'center' },
  pressed: { opacity: 0.6 },
});
