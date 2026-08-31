// Native (#1832): mottakerne av bingo, bango og bongo — på hullet.
//
// Formatet deler ut tre poeng per hull, og ingen av dem kan leses ut av
// scorekortet: hvem som var først på green er noe flighten SER og blir enige
// om. Derfor er dette registrering, ikke utregning, og derfor er den åpen for
// alle deltakere (`bbb_holes_write` slipper enhver spiller i spillet til —
// samme som webbens `BingoBangoBongoEntry`).
//
// To ting styrer kortet:
//
//  1. **Raden skrives hel.** Upserten setter alle tre kolonnene hver gang, så
//     et tapp på «Bango» sender også dagens bingo og bongo med. Har hentingen
//     IKKE lyktes, vet vi ikke hva de to andre er — og et tapp ville nullet
//     dem. Da er knappene låst, med en ærlig forklaring i stedet.
//  2. **Finished-låsen ligger i datalaget.** RLS håndhever den ikke; webben
//     gjør det i sin server action, og `setBingoBangoBongoHole` speiler den.
//     Knappene er dessuten låst når runden ikke er aktiv — men et spill som
//     ble avsluttet mens telefonen sto i lomma treffer fortsatt låsen, og da
//     er det den norske meldingen spilleren får.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { BingoBangoBongoHoleInput } from '../../../../../lib/scoring/modes/types';
import { setBingoBangoBongoHole } from '../../data/choices';
import { describeChoiceFailure } from '../../lib/actionFeedback';
import { COLORS, TAP, ui } from '../../theme';

/** Nøkkel, overskrift og forklaring — webbens copy, ord for ord. */
const CATEGORIES = [
  { key: 'bingoUserId', label: 'Bingo', description: 'Første ball på green' },
  {
    key: 'bangoUserId',
    label: 'Bango',
    description: 'Nærmest hullet når alle er på green',
  },
  { key: 'bongoUserId', label: 'Bongo', description: 'Første ball i hull' },
] as const;

type CategoryKey = (typeof CATEGORIES)[number]['key'];

export interface BingoBangoBongoPlayer {
  userId: string;
  name: string;
}

export function BingoBangoBongoCard({
  gameId,
  holeNumber,
  gameStatus,
  players,
  saved,
  loaded,
  onSaved,
}: {
  gameId: string;
  holeNumber: number;
  gameStatus: string;
  players: readonly BingoBangoBongoPlayer[];
  /** Lagret rad for hullet, eller `null` når ingen har registrert noe ennå. */
  saved: BingoBangoBongoHoleInput | null;
  /** Falsk når hentingen ikke har lyktes — da er kortet skrivebeskyttet. */
  loaded: boolean;
  onSaved: () => Promise<void>;
}) {
  // Optimistisk overlag som lever nøyaktig så lenge skrivingen gjør: valget
  // vises med en gang, og når refetchen har landet er `saved` fasiten igjen.
  // Ingen langlivet kopi av server-tilstanden — den fella er #1219 i miniatyr.
  const [pending, setPending] = useState<BingoBangoBongoHoleInput | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current: BingoBangoBongoHoleInput = pending ??
    saved ?? {
      holeNumber,
      bingoUserId: null,
      bangoUserId: null,
      bongoUserId: null,
    };
  const locked = !loaded || gameStatus !== 'active' || saving;

  async function select(key: CategoryKey, userId: string | null) {
    if (locked) return;
    const next: BingoBangoBongoHoleInput = { ...current, holeNumber, [key]: userId };
    setPending(next);
    setSaving(true);
    setError(null);
    try {
      const result = await setBingoBangoBongoHole(
        {
          gameId,
          holeNumber,
          bingoUserId: next.bingoUserId,
          bangoUserId: next.bangoUserId,
          bongoUserId: next.bongoUserId,
        },
        gameStatus,
      );
      if (result.ok) {
        await onSaved();
      } else {
        setError(describeChoiceFailure(result.error));
      }
    } catch {
      setError('Fikk ikke lagret. Sjekk nettet og prøv igjen.');
    } finally {
      // Uansett utfall: slipp overlaget. Gikk det bra, har refetchen landet
      // det samme; gikk det galt, skal kortet vise det som faktisk står.
      setPending(null);
      setSaving(false);
    }
  }

  return (
    <View style={ui.card} testID="bbb-card">
      <Text style={ui.body}>Bingo Bango Bongo</Text>
      <Text style={ui.muted}>
        Tre poeng per hull — ett for hver prestasjon. Alle i flighten kan
        registrere.
      </Text>

      {loaded ? null : (
        <Text style={ui.muted} testID="bbb-notice">
          Fikk ikke tak i registreringene for dette hullet. De dukker opp når
          nettet er tilbake.
        </Text>
      )}

      {CATEGORIES.map((category) => {
        const selected = current[category.key];
        return (
          <View key={category.key} style={styles.row} testID={`bbb-row-${category.key}`}>
            <Text style={ui.muted}>
              {category.label} · {category.description}
            </Text>
            <View style={styles.chips}>
              {players.map((player) => (
                <Chip
                  key={player.userId}
                  testID={`bbb-${category.key}-${player.userId}`}
                  label={player.name}
                  // Et nytt tapp på den som alt står valgt tømmer kategorien,
                  // samme snarvei som på web.
                  selected={selected === player.userId}
                  disabled={locked}
                  onPress={() =>
                    void select(
                      category.key,
                      selected === player.userId ? null : player.userId,
                    )
                  }
                />
              ))}
              <Chip
                testID={`bbb-${category.key}-ingen`}
                label="Ingen"
                selected={selected === null}
                disabled={locked}
                onPress={() => void select(category.key, null)}
              />
            </View>
          </View>
        );
      })}

      {error ? (
        <Text style={ui.error} testID="bbb-error">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function Chip({
  testID,
  label,
  selected,
  disabled,
  onPress,
}: {
  testID: string;
  label: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.chip, selected && styles.chipSelected, disabled && styles.chipDisabled]}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
    >
      <Text style={selected ? ui.body : ui.muted}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    minHeight: TAP,
    minWidth: TAP,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.linen,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: { borderColor: COLORS.gold, borderWidth: 2 },
  chipDisabled: { opacity: 0.4 },
});
