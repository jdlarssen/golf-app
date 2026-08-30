// Native N3 (#1825): fra typet handlings-utfall til noe spilleren kan lese.
//
// Poenget er at INGEN feil forsvinner. `{ ok: false }` — inkludert 0-rads-
// tilfellet der PostgREST svarte `error == null` — må havne på skjermen, ellers
// er vi tilbake i #667/#704: en skriving som aldri skjedde, meldt som suksess.
import type { ActionResult } from '../data/playerActions';

export function describeFailure(result: ActionResult): string | null {
  if (result.ok) return null;
  switch (result.reason) {
    case 'no-session':
      return 'Du er ikke logget inn lenger. Logg inn på nytt.';
    case 'not-active':
      return 'Spillet er ikke aktivt lenger.';
    case 'withdrawn':
      return 'Du er trukket fra dette spillet.';
    case 'no-rows':
      return 'Ingenting ble endret. Du har kanskje ikke tilgang, eller noen andre rakk det først.';
    case 'db':
      return result.message ?? 'Noe gikk galt mot serveren.';
  }
}
