// #2201 PR 2: det du åpner i appen, er lest, som på webben.
//
// **Besøk.** `markVisitRead(flate, id)` merker de uleste varslene skjermen
// svarer på: flatens typer fra `READ_ON_VISIT` (webbens kart, ett hjem for
// hva som ryddes hvor), for skjermens spill. Samme UPDATE som webbens
// `markReadOnVisit`, men med appens egen klient: RLS-policyen
// `notifications_update_own` legger på `user_id = auth.uid()`, så bare egne
// rader kan treffes.
//
// **Trykk.** `markNotificationRead(id)` merker akkurat varselet et push-trykk
// gjaldt (`?varsel=<id>` på lenka, `pushTaps.ts`). Trykket åpner ofte en annen
// skjerm enn webben ville (godkjenning og resultat åpner spillets side), så
// id-en er det som sikrer at akkurat det varselet blir lest.
//
// Begge er best-effort: 0 rader er vanlig (ingenting ulest), en feil logges, og
// ingen av dem kaster. Uten nett skjer ingenting; neste besøk prøver igjen.
import {
  READ_ON_VISIT,
  type VisitSurface,
} from '../../../../lib/notifications/readOnVisit';
import { supabase } from '../supabase';

export async function markVisitRead(surface: VisitSurface, entityId?: string): Promise<void> {
  const { kinds, key } = READ_ON_VISIT[surface];
  if (key && !entityId) {
    console.error('[markRead] flaten trenger en id', surface);
    return;
  }
  try {
    let query = supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .is('read_at', null)
      .in('kind', [...kinds]);
    if (key && entityId) query = query.eq(`payload->>${key}`, entityId);
    const { error } = await query;
    if (error) console.error('[markRead] besøket ble ikke merket', surface, error.message);
  } catch (err: unknown) {
    console.error('[markRead] besøket ble ikke merket', surface, err);
  }
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notificationId)
      .is('read_at', null);
    if (error) console.error('[markRead] trykket ble ikke merket', error.message);
  } catch (err: unknown) {
    console.error('[markRead] trykket ble ikke merket', err);
  }
}
