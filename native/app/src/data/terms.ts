// native/app/src/data/terms.ts
// #3019: spillerens ja til vilkårene, i `terms_acceptances` (migrasjon 0259).
// Én rad per bruker og versjon; bare eieren leser og skriver sine egne rader
// (RLS), og tabellen har ingen oppdatering, så et nytt ja er en ny rad.
// `accepted_at` settes av databasen.
import { supabase } from '../supabase';
import { TERMS_VERSION } from '../../../../lib/legal/terms';

/** Har brukeren godtatt denne versjonen? Kaster ved lesefeil. */
export async function fetchTermsAccepted(userId: string, version = TERMS_VERSION): Promise<boolean> {
  const { data, error } = await supabase
    .from('terms_acceptances')
    .select('version')
    .eq('user_id', userId)
    .eq('version', version)
    .maybeSingle();
  if (error) throw new Error(`[terms] lesingen feilet: ${error.message}`);
  return data !== null;
}

export type SaveTermsResult = { ok: true } | { ok: false };

/**
 * Lagrer ja-et. Insert med raden lest tilbake (felle 2). Et ja som alt står
 * (23505, to trykk eller to enheter) er også et ja. Kaster aldri.
 */
export async function saveTermsAccepted(userId: string, version = TERMS_VERSION): Promise<SaveTermsResult> {
  try {
    const { data, error } = await supabase
      .from('terms_acceptances')
      .insert({ user_id: userId, version })
      .select('version');
    if (error?.code === '23505') return { ok: true };
    if (error || !data || data.length === 0) {
      console.error('[terms] svaret ble ikke lagret', error ?? 'null rader');
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.error('[terms] svaret ble ikke lagret', err);
    return { ok: false };
  }
}
