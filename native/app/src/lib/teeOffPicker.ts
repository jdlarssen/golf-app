// native/app/src/lib/teeOffPicker.ts
// #2560 steg 3a: tee-off på Android.
//
// `@react-native-community/datetimepicker` har ikke `mode="datetime"` på
// Android. Komponenten viste bare en datodialog, og etter OK kastet den
// «Cannot read property 'dismiss' of undefined» (`pickers['datetime']` finnes
// ikke), så hele appen ble hvit. Android får derfor to rader, «Dato» og
// «Klokkeslett» (eierens valg 14.10: «To rader»), hver med sin dialog. Den
// andre delen av verdien står. iOS beholder den inline pickeren.
//
// Klokkeslett i fortiden: Androids klokkeslett-dialog ser bort fra
// `minimumDate`, så på dagens dato kan et klokkeslett som alt har vært, velges.
// Verdien klemmes ikke her. `isTeeOffInPast` i `createGame` stopper den før
// noe skrives, med samme tekst som på iOS.
import type { AndroidNativeProps } from '@react-native-community/datetimepicker';

/**
 * Dato (år, måned, dag) fra `datePart`, time og minutt fra `timePart`, i
 * enhetens lokaltid (den samme tiden dialogene viser). Sekunder og
 * millisekunder blir 0.
 */
export function combineDateAndTime(datePart: Date, timePart: Date): Date {
  return new Date(
    datePart.getFullYear(),
    datePart.getMonth(),
    datePart.getDate(),
    timePart.getHours(),
    timePart.getMinutes(),
    0,
    0,
  );
}

/**
 * Åpner datodialogen. Ved OK får `onPick` valgt dato med klokkeslettet som
 * sto. Avbryt lar verdien stå. `open` er `DateTimePickerAndroid.open`, sendt
 * inn så testen kan gi en falsk.
 */
export function openAndroidTeeOffDate({
  value,
  minimumDate,
  onPick,
  open,
}: {
  value: Date;
  minimumDate: Date;
  onPick: (date: Date) => void;
  open: (args: AndroidNativeProps) => void;
}): void {
  open({
    mode: 'date',
    value,
    minimumDate,
    onValueChange: (_event, pickedDate) => onPick(combineDateAndTime(pickedDate, value)),
  });
}

/**
 * Åpner klokkeslett-dialogen i 24-timers visning. Ved OK får `onPick` valgt
 * klokkeslett på datoen som sto. Avbryt lar verdien stå.
 */
export function openAndroidTeeOffTime({
  value,
  onPick,
  open,
}: {
  value: Date;
  onPick: (date: Date) => void;
  open: (args: AndroidNativeProps) => void;
}): void {
  open({
    mode: 'time',
    value,
    is24Hour: true,
    onValueChange: (_event, pickedTime) => onPick(combineDateAndTime(value, pickedTime)),
  });
}
