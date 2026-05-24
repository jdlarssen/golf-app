'use client';

import { useEffect, useState } from 'react';
import { getBrowserClient } from '@/lib/supabase/client';
import {
  onPostgresChange,
  subscribeRealtimeChannel,
} from '@/lib/sync/realtimeChannel';

type NotificationRowShape = { read_at: string | null };

/**
 * Holder en lokal teller for uleste varsler for current user.
 *
 * Initial verdi hentes via `count: 'exact', head: true`-Supabase-query (RLS
 * begrenser til egne rader, så kallet er trivielt billig). Tellerne deretter
 * mutéres lokalt fra realtime-events på `notifications`-tabellen — INSERT
 * av ulest rad inkrementerer, UPDATE som flipper `read_at` justerer i begge
 * retninger. Vi unngår dermed å re-fetche hver gang badgen skal oppdateres.
 *
 * Edge-cases håndtert:
 *  - `userId === null` (ikke innlogget) → returnerer count=0, loading=false
 *    uten å starte noen subscription.
 *  - INSERT av allerede-lest rad (sjelden, men kan skje hvis backfill inserter
 *    historiske rader med read_at satt) → inkrementerer ikke.
 *  - UPDATE der read_at endrer seg fra null → ikke-null dekrementerer; motsatt
 *    inkrementerer (defensiv mot framtidig «marker som ulest»-flyt).
 *  - Math.max(0, ...) på dekrement så count aldri går negativ hvis en
 *    UPDATE-event ankommer før initial fetch har fullført.
 *  - Cleanup av realtime-kanalen ved unmount eller userId-bytte.
 *
 * Realtime krever eksplisitt `setAuth(jwt)` — `subscribeRealtimeChannel`
 * gjør det automatisk fra session, så hooken trenger ikke å bekymre seg.
 */
export function useUnreadNotificationsCount(userId: string | null): {
  count: number;
  loading: boolean;
} {
  // Initial state matcher userId — om vi ikke har bruker, går vi rett til
  // «ingen uleste, ferdig lastet». Når userId endres til ny verdi nuller vi
  // disse via useEffect-bodyen (først setLoading(true), så initial fetch
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

    // Initial fetch — RLS gir oss kun egne rader, så vi trenger ingen
    // ytterligere user_id-filter strengt tatt, men setter den eksplisitt
    // for å bruke partial-indexen `notifications_user_unread_created`.
    void supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('read_at', null)
      .then(({ count: initial }: { count: number | null }) => {
        if (!mounted) return;
        setCount(initial ?? 0);
        setLoading(false);
      });

    // Realtime sub for INSERT + UPDATE. DELETE-events ignoreres bevisst —
    // varsler slettes kun via cascade når en user slettes, og brukeren ser
    // uansett ikke sin egen bjelle etter sletting.
    const cleanup = subscribeRealtimeChannel(
      `notifications:${userId}`,
      (channel) => {
        const withInsert = onPostgresChange<NotificationRowShape>(
          channel,
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            if (payload.new.read_at == null) {
              setCount((c) => c + 1);
            }
          },
        );
        return onPostgresChange<NotificationRowShape>(
          withInsert,
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            const wasUnread = payload.old.read_at == null;
            const isUnread = payload.new.read_at == null;
            if (wasUnread && !isUnread) {
              setCount((c) => Math.max(0, c - 1));
            } else if (!wasUnread && isUnread) {
              setCount((c) => c + 1);
            }
          },
        );
      },
    );

    return () => {
      mounted = false;
      cleanup();
    };
  }, [userId]);

  return { count, loading };
}
