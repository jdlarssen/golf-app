// native/app/src/components/SettingRow.tsx
// Native #1906: raden og rammen profil-rommet er bygget av.
//
// Portert fra webbens `components/ui/SettingRow.tsx` med samme semantikk, så
// en spiller som har brukt `/profile` kjenner igjen listen: én linje per ting,
// etiketten i serif, en dempet underlinje når raden trenger å forklare seg, og
// en chevron BARE når det finnes et rom bak raden.
//
// **Chevronen er et løfte, ikke pynt.** «Slett konto» fører videre til en egen
// skjerm og får den; «Logg ut» skjer der og da og får den ikke. Blander man
// dem, slutter chevronen å bety noe. Den tegnes som tekst-glyfen «›» med vilje:
// ikonspråket (#1879) er ikke bygget ennå, og et løst SVG eller et helt
// ikonbibliotek for én pil ville forskuttert det valget.
//
// **Separatorene tegnes av lista, ikke av radene.** Utvikler-seksjonens
// Sync-lab-rad finnes bare i staging-bygg, og en rad som selv gjetter «er jeg
// først?» ville etterlatt en strek som svever over ingenting den dagen raden
// over forsvant. `Children.toArray` kaster dessuten bort `null` og `false`, så
// en `{vilkår && <SettingRow …/>}` teller ikke som en rad når vilkåret er
// usant — nøyaktig det `first:border-t-0` gjør på web.
//
// **Ingen egen testfil.** Primitiven har ingen logikk å teste isolert; den
// dekkes av Profil-skjermens ene render-test (Type C — maks én render-test per
// komponent, `docs/test-discipline.md`). Det er et valg, ikke en glipp.
import { Children, Fragment, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FONTS, TAP, useTheme } from '../theme';

type Tone = 'default' | 'danger';

interface SettingRowProps {
  label: string;
  /** Dempet andrelinje. Utelat den for en rad på én linje. */
  sublabel?: string;
  /** `danger` farger etiketten rød — for rader som fjerner noe for godt. */
  tone?: Tone;
  onPress: () => void;
  /** Tekst-chevron «›» — kun på rader som navigerer videre. */
  chevron?: boolean;
  disabled?: boolean;
  testID?: string;
}

/**
 * Én tappbar rad i en innstillings-liste. Pakk en gruppe i {@link SettingList}.
 */
export function SettingRow({
  label,
  sublabel,
  tone = 'default',
  onPress,
  chevron = false,
  disabled = false,
  testID,
}: SettingRowProps): React.JSX.Element {
  const { colors } = useTheme();
  // Dempingen er hele det synlige signalet om at raden ikke svarer akkurat nå
  // — en rad som ser trykkbar ut og ikke er det, leses som at appen henger.
  const labelColor = disabled
    ? colors.muted
    : tone === 'danger'
      ? colors.danger
      : colors.text;
  // Chevronen følger tonen, men dempet: på en rød rad skal pila ikke rope
  // like høyt som etiketten (webbens `text-danger-deep/70`).
  const chevronStyle =
    tone === 'danger'
      ? { color: colors.danger, opacity: 0.7 }
      : { color: colors.muted };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={styles.row}
    >
      <View style={styles.texts}>
        <Text style={[styles.label, { color: labelColor }]}>{label}</Text>
        {sublabel ? (
          <Text style={[styles.sublabel, { color: colors.muted }]}>{sublabel}</Text>
        ) : null}
      </View>
      {chevron ? <Text style={[styles.chevron, chevronStyle]}>›</Text> : null}
    </Pressable>
  );
}

/**
 * Den avrundede rammen rundt en gruppe {@link SettingRow}-er, med streker
 * mellom radene — ingen over den første, ingen under den siste.
 */
export function SettingList({
  children,
  testID,
}: {
  children: ReactNode;
  testID?: string;
}): React.JSX.Element {
  const { colors } = useTheme();
  const rows = Children.toArray(children);

  return (
    <View
      testID={testID}
      style={[
        styles.list,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      {rows.map((row, index) => (
        // Rekkefølgen er statisk innenfor én render, så indeksen er en stabil
        // nøkkel her. `Children.toArray` har alt gitt selve raden sin egen.
        <Fragment key={index}>
          {index > 0 ? (
            <View style={[styles.separator, { backgroundColor: colors.border }]} />
          ) : null}
          {row}
        </Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    borderRadius: 16,
    borderWidth: 1,
    // Klipper trykk-markeringen på første og siste rad til de runde hjørnene.
    overflow: 'hidden',
    marginTop: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    // Gulvet, ikke målet: en rad med underlinje blir høyere enn dette.
    minHeight: TAP,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  texts: { flexShrink: 1, gap: 2 },
  label: { fontSize: 16, fontFamily: FONTS.serifDisplay },
  // Ett hakk under etiketten, så raden leses som én ting og ikke som to.
  sublabel: { fontSize: 13, fontFamily: FONTS.sans },
  chevron: { fontSize: 20, fontFamily: FONTS.sans },
  separator: { height: StyleSheet.hairlineWidth },
});
