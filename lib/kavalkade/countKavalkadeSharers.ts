import 'server-only';

/**
 * «Kavalkaden delt av N spillere» (#2131, K5) — desember-leddet i epic #1040.
 *
 * N er antall **distinkte** `user_id` i `kavalkade_shares`, ikke antall
 * delinger: deler én spiller ti kort, er det fortsatt én spiller. Jørgen selv
 * telles ikke, for målet er «delt av minst tre spillere som ikke er Jørgen» —
 * og «admin» leses av `users.is_admin`, aldri av en hardkodet uuid (samme
 * regel som livstegnet i migrasjon 0180).
 *
 * ## Hvorfor service-rollen
 *
 * RLS på `kavalkade_shares` gir en innlogget spiller bare hens EGNE rader
 * (migrasjon 0183) — det er hele poenget med tabellen. Tallet er derfor
 * uleselig med admin-ens egen JWT, og må leses med service-rollen. Det krever
 * ingen endring i databasen, og dermed ingen ny migrasjon mot prod.
 *
 * Kallstedet (`KeyMetricsCard`) leser først `admin_key_metrics`, som kaster
 * `not_authorized` for alle andre enn admin. Denne funksjonen kalles bare
 * etter at den gaten har svart, så service-rollen brukes aldri på vegne av en
 * spiller som ikke er eier.
 *
 * Året filtreres ikke bort: bare 2026 finnes (`KAVALKADE_YEAR`), og tallet
 * eieren følger med på er «hvor mange har delt Kavalkaden».
 */

import { getAdminClient } from '@/lib/supabase/admin';
import { selectAllRows } from '@/lib/supabase/selectAllRows';

type SharerRow = { user_id: string };

export async function countKavalkadeSharers(): Promise<number> {
  const supabase = getAdminClient();
  const rows = await selectAllRows<SharerRow>(
    (from, to) =>
      supabase
        .from('kavalkade_shares')
        // `users!inner` + filteret under gjør ekskluderingen i SQL. `!inner`
        // betyr også at en deling uten bruker-rad faller ut — den kan ikke
        // oppstå (fremmednøkkel med cascade), men den skal ikke telles heller.
        .select('user_id, users!inner(is_admin)')
        .eq('users.is_admin', false)
        .order('user_id')
        .range(from, to)
        .returns<SharerRow[]>(),
    'kavalkade delinger',
  );
  return new Set(rows.map((row) => row.user_id)).size;
}
