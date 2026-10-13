// native/app/src/lib/teeOffPicker.ts
// #2560 steg 3a: tee-off på Android.
//
// `@react-native-community/datetimepicker` har ikke `mode="datetime"` på
// Android. Komponenten viste bare en datodialog, og etter OK kastet den
// «Cannot read property 'dismiss' of undefined» (`pickers['datetime']` finnes
// ikke), så hele appen ble hvit. Android får derfor to dialoger etter
// hverandre: dato, så klokkeslett. iOS beholder den inline pickeren.
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
 * Åpner datodialogen og, etter OK, klokkeslett-dialogen. `onPick` kalles bare
 * når begge er OK. Avbryt i en av dem lar verdien stå. `open` er
 * `DateTimePickerAndroid.open`, sendt inn så testen kan gi en falsk.
 */
export function openAndroidTeeOff({
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
    onValueChange: (_event, pickedDate) => {
      open({
        mode: 'time',
        value: combineDateAndTime(pickedDate, value),
        is24Hour: true,
        onValueChange: (_timeEvent, pickedTime) => {
          onPick(combineDateAndTime(pickedDate, pickedTime));
        },
      });
    },
  });
}
