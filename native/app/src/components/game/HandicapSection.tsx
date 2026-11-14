// #2297: handicapet på spillsiden før runden. Kortet «Sjekk handicapet ditt» står
// når handicapet er fire uker gammelt eller mer (`isHandicapStale`, webbens regel),
// og arket «Oppdater handicap» åpnes fra det.
//
//  - «Ja, stemmer» lagrer samme tall: ruta stempler `handicap_updated_at`, og
//    kortet går bort uten kvittering.
//  - «Oppdater» åpner arket. Lagres et nytt tall, lukkes arket og
//    «Handicapet ditt er oppdatert.» står der kortet sto, med fokus.
//
// Lagringen går gjennom `PUT /api/profile` (`saveHandicap`), som også regner om
// frosne banehandicap. Etter hver lagring henter skjermen profilen på nytt
// (`onChanged`), så billetten viser de nye slagene.
//
// Seksjonen står bare her mens kortet eller kvitteringen står: en tom `View` ville
// lagt 8 pt luft til i skjermens `gap`.
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { isHandicapStale } from '../../../../../lib/handicap/staleness';
import { saveHandicap, type OwnProfile } from '../../data/profile';
import { describeHandicapSaveFailure } from '../../lib/handicapCopy';
import { HandicapCard, HandicapReceipt } from './HandicapCard';
import { HandicapSheet } from './HandicapSheet';

export function HandicapSection({
  profile,
  onChanged,
}: {
  profile: OwnProfile | null;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  // Arket monteres på nytt for hver åpning, så et gammelt utkast ikke henger igjen.
  const [opening, setOpening] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [receipt, setReceipt] = useState(false);
  const updateRef = useRef<View>(null);
  const receiptRef = useRef<View>(null);

  useEffect(() => {
    if (receipt && receiptRef.current) {
      AccessibilityInfo.sendAccessibilityEvent(receiptRef.current, 'focus');
    }
  }, [receipt]);

  const hcpIndex = profile?.hcpIndex ?? null;
  const stale = profile != null && hcpIndex !== null && isHandicapStale(profile.handicapUpdatedAt);
  if (!profile || hcpIndex === null) return null;
  if (!receipt && (!stale || confirmed)) return null;

  const confirm = async () => {
    setConfirming(true);
    setConfirmError(null);
    const result = await saveHandicap(profile, hcpIndex);
    setConfirming(false);
    if (result.ok) {
      setConfirmed(true);
      onChanged();
    } else {
      setConfirmError(describeHandicapSaveFailure(result.reason));
    }
  };

  const closeSheet = () => {
    setOpen(false);
    if (updateRef.current) AccessibilityInfo.sendAccessibilityEvent(updateRef.current, 'focus');
  };

  return (
    <View>
      {receipt ? (
        <HandicapReceipt receiptRef={receiptRef} />
      ) : (
        <HandicapCard
          hcpIndex={hcpIndex}
          updatedAt={profile.handicapUpdatedAt}
          pending={confirming}
          error={confirmError}
          updateRef={updateRef}
          onConfirm={() => void confirm()}
          onUpdate={() => {
            setOpening((count) => count + 1);
            setOpen(true);
          }}
        />
      )}
      <HandicapSheet
        key={opening}
        open={open}
        stored={hcpIndex}
        updatedAt={profile.handicapUpdatedAt}
        onSave={(signed) => saveHandicap(profile, signed)}
        onSaved={() => {
          setOpen(false);
          setReceipt(true);
          onChanged();
        }}
        onClose={closeSheet}
      />
    </View>
  );
}
