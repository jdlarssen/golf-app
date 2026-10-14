// #2560 steg 3a: Android har ingen `datetime`-modus. Tee-off er to rader
// (eierens valg 14.10: «To rader»), hver med sin dialog, og den andre delen av
// verdien står.
import type { AndroidNativeProps } from '@react-native-community/datetimepicker';
import { combineDateAndTime, openAndroidTeeOffDate, openAndroidTeeOffTime } from './teeOffPicker';

// jest.config.js pinner TZ=UTC, så lokaltid og UTC gir samme tall her. At
// verdien er i enhetens lokaltid, vises på emulatoren med Europe/Oslo.
describe('combineDateAndTime', () => {
  it.each([
    {
      name: 'vanlig dag',
      datePart: new Date(2026, 4, 20, 7, 13, 45, 678),
      timePart: new Date(2026, 4, 3, 14, 30, 12, 345),
      expected: new Date(2026, 4, 20, 14, 30, 0, 0),
    },
    {
      name: 'månedsskifte',
      datePart: new Date(2026, 5, 1, 7, 13, 45, 678),
      timePart: new Date(2026, 4, 31, 14, 30, 12, 345),
      expected: new Date(2026, 5, 1, 14, 30, 0, 0),
    },
  ])('tar datoen fra datodelen og klokkeslettet fra tidsdelen ($name)', ({
    datePart,
    timePart,
    expected,
  }) => {
    expect(combineDateAndTime(datePart, timePart).getTime()).toBe(expected.getTime());
  });
});

const event = (date: Date) => ({ nativeEvent: { timestamp: date.getTime(), utcOffset: 0 } });

describe('openAndroidTeeOffDate', () => {
  // Opprinnelig verdi: annen dato OG annet klokkeslett enn det som velges.
  const value = new Date(2026, 4, 10, 9, 45, 0, 0);
  const minimumDate = new Date(2026, 4, 1, 12, 0, 0, 0);
  const pickedDate = new Date(2026, 4, 22, 0, 0, 0, 0);

  function setup() {
    const calls: AndroidNativeProps[] = [];
    const open = jest.fn((args: AndroidNativeProps) => {
      calls.push(args);
    });
    const onPick = jest.fn();
    openAndroidTeeOffDate({ value, minimumDate, onPick, open });
    return { calls, onPick };
  }

  it('åpner bare datodialogen, med verdien og minimumDate', () => {
    const { calls } = setup();
    expect(calls).toHaveLength(1);
    expect(calls[0].mode).toBe('date');
    expect(calls[0].value).toBe(value);
    expect(calls[0].minimumDate).toBe(minimumDate);
  });

  it('gir valgt dato med klokkeslettet som sto', () => {
    const { calls, onPick } = setup();
    calls[0].onValueChange?.(event(pickedDate), pickedDate);

    expect(calls).toHaveLength(1);
    expect(onPick).toHaveBeenCalledTimes(1);
    expect((onPick.mock.calls[0][0] as Date).getTime()).toBe(
      new Date(2026, 4, 22, 9, 45, 0, 0).getTime(),
    );
  });

  it('kaller ikke onPick når dialogen avbrytes', () => {
    const { calls, onPick } = setup();
    calls[0].onDismiss?.();
    expect(onPick).not.toHaveBeenCalled();
  });
});

describe('openAndroidTeeOffTime', () => {
  const value = new Date(2026, 4, 10, 9, 45, 0, 0);
  const pickedTime = new Date(2026, 4, 22, 16, 20, 33, 999);

  function setup() {
    const calls: AndroidNativeProps[] = [];
    const open = jest.fn((args: AndroidNativeProps) => {
      calls.push(args);
    });
    const onPick = jest.fn();
    openAndroidTeeOffTime({ value, onPick, open });
    return { calls, onPick };
  }

  it('åpner bare klokkeslett-dialogen, i 24-timers visning med verdien', () => {
    const { calls } = setup();
    expect(calls).toHaveLength(1);
    expect(calls[0].mode).toBe('time');
    expect(calls[0].is24Hour).toBe(true);
    expect(calls[0].value).toBe(value);
  });

  it('gir valgt klokkeslett på datoen som sto', () => {
    const { calls, onPick } = setup();
    calls[0].onValueChange?.(event(pickedTime), pickedTime);

    expect(onPick).toHaveBeenCalledTimes(1);
    expect((onPick.mock.calls[0][0] as Date).getTime()).toBe(
      new Date(2026, 4, 10, 16, 20, 0, 0).getTime(),
    );
  });

  it('kaller ikke onPick når dialogen avbrytes', () => {
    const { calls, onPick } = setup();
    calls[0].onDismiss?.();
    expect(onPick).not.toHaveBeenCalled();
  });
});
