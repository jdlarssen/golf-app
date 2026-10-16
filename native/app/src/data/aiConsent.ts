// native/app/src/data/aiConsent.ts
// #2561 PR B: spillerens svar på spørsmålet om AI-tekster, i `ai_consents`
// (migrasjon 0210). Bare eieren leser og skriver raden (RLS); serveren leser
// alle svar med service-rollen (`lib/ai/consent.ts`, der regelen bor: navnet
// går bare til språkmodellen med «ja»).
//
// Appen bruker sin egen Supabase-klient her, ikke serverens modul, som er
// server-only. `answered_at` settes av databasen.
import { supabase } from '../supabase';

/**
 * Spillerens svar: `true` (ja), `false` (nei) eller `null` (ikke svart).
 * Kaster ved lesefeil, så porten og bryteren aldri viser et gjettet svar.
 */
export async function fetchOwnAiConsent(userId: string): Promise<boolean | null> {
  const { data, error } = await supabase
    .from('ai_consents')
    .select('granted')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`[aiConsent] lesingen feilet: ${error.message}`);
  return data ? data.granted : null;
}

export type SaveAiConsentResult = { ok: true } | { ok: false };

/**
 * Lagrer svaret. Upsert på `user_id`, med raden lest tilbake: PostgREST
 * svarer uten feil på en skriving som traff null rader (felle 2), så bare en
 * rad tilbake regnes som lagret. Kaster aldri.
 */
export async function saveAiConsent(userId: string, granted: boolean): Promise<SaveAiConsentResult> {
  try {
    const { data, error } = await supabase
      .from('ai_consents')
      .upsert({ user_id: userId, granted }, { onConflict: 'user_id' })
      .select('user_id');
    if (error || !data || data.length === 0) {
      console.error('[aiConsent] svaret ble ikke lagret', error ?? 'null rader');
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.error('[aiConsent] svaret ble ikke lagret', err);
    return { ok: false };
  }
}
