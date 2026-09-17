'use client';

import { useEffect, useState } from 'react';
import { getBrowserClient } from '@/lib/supabase/client';
import {
  onPostgresChange,
  subscribeRealtimeChannel,
} from '@/lib/sync/realtimeChannel';

type NotificationRowShape = { read_at: string | null };

/**
 * Samles en byge hendelser (flere varsler i samme sekund, eller en dobbel
 * levering mens kanalen bygges på nytt) til én telling.
 */
const COUNT_DEBOUNCE_MS = 300;

/**
 * Holder antallet uleste varsler for current user.
 *
 * Antallet hentes med en `count: 'exact', head: true`-query (RLS begrenser til
 * egne rader, og partial-indexen `notifications_user_unread_created` gjør
 * kallet billig). Realtime-hendelser på `notifications` (INSERT og UPDATE) er
 * et signal om å telle på nytt, ikke en +1/-1 (#2093): Realtime kan levere
 * samme hendelse to ganger mens kanalen bygges på nytt, og det som skjedde
 * mens kanalen lå nede, kommer aldri. Derfor telles det også på nytt når
 * kanalen er tilbake etter et brudd (`onResubscribed`). Hver telling får et
 * løpenummer når den går ut, og et svar brukes bare hvis ingen senere telling
 * alt har landet.
 *
 * Edge-cases håndtert:
 *  - `userId === null` (ikke innlogget) → returnerer count=0, loading=false
 *    uten å starte noen subscription.
 *  - Cleanup av realtime-kanalen og en ventende telling ved unmount eller
 *    userId-bytte.
 *
 * Token-livssyklus og gjenoppkobling ved kanalfeil eies av
 * `subscribeRealtimeChannel` (#1366) — hooken trenger ikke å bekymre seg.
 */
export function useUnreadNotificationsCount(userId: string | null): {
  count: number;
  loading: boolean;
} {
  // Initial state matcher userId — om vi ikke har bruker, går vi rett til
  // «ingen uleste, ferdig lastet». Når userId endres til ny verdi nuller vi
  // disse via useEffect-bodyen (først setLoading(true), så tellingen
  // overskriver count). React skygger denne reset-en ved å re-mounte
  // hook-en via dependency-arrayet, men hvis en parent endrer userId
  // in-place trenger vi den eksplisitte reset-en under.
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState<boolean>(userId != null);

  useEffect(() => {
    if (!userId) {
      // Ikke kall setState her — initial useState-verdiene over er allerede
      // riktige (count=0, loading=false) for userId=null-tilfellet. Eslint-
      // regelen `react-hooks/set-state-in-effect` flagger setState inni effect
      // som unødvendig render-cascade, og den har rett: dette er en idle no-op.
      return;
    }

    // Reset loading-flagg når userId endres mid-life (sjelden, men håndtert).
    // setState i effect-body er normalt en kode-smell, men her er det riktig
    // mønster: vi vil vise loading-state for B etter at A er ferdig.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const supabase = getBrowserClient();
    let mounted = true;
    let seq = 0;
    let appliedSeq = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    // RLS gir oss kun egne rader, så vi trenger strengt tatt ikke user_id-
    // filteret, men det setter vi eksplisitt for å bruke partial-indexen.
    const fetchCount = () => {
      timer = null;
      const mySeq = ++seq;
      void supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .is('read_at', null)
        .then(({ count: next, error }: { count: number | null; error: unknown }) => {
          if (!mounted || mySeq <= appliedSeq) return;
          if (error) {
            // An error is not zero unread: keep the dot as it stands. The next
            // event or rejoin counts again. With no answer yet for this user
            // there is nothing to keep, so show none, as before.
            if (appliedSeq === 0) setCount(0);
            setLoading(false);
            return;
          }
          appliedSeq = mySeq;
          setCount(next ?? 0);
          setLoading(false);
        });
    };

    const scheduleFetch = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(fetchCount, COUNT_DEBOUNCE_MS);
    };

    fetchCount();

    // Realtime sub for INSERT + UPDATE. DELETE-events ignoreres bevisst —
    // varsler slettes kun via cascade når en user slettes, og brukeren ser
    // uansett ikke sin egen bjelle etter sletting.
    const cleanup = subscribeRealtimeChannel(
      `notifications:${userId}`,
      (channel) =>
        onPostgresChange<NotificationRowShape>(
          onPostgresChange<NotificationRowShape>(
            channel,
            {
              event: 'INSERT',
              schema: 'public',
              table: 'notifications',
              filter: `user_id=eq.${userId}`,
            },
            scheduleFetch,
          ),
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`,
          },
          scheduleFetch,
        ),
      { onResubscribed: scheduleFetch },
    );

    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
      cleanup();
    };
  }, [userId]);

  return { count, loading };
}
