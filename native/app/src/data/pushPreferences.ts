// native/app/src/data/pushPreferences.ts
// #2315 PR B: spillerens varselvalg i `notification_preferences` (migrasjon
// 0236): gruppene som ikke skal plinge, og stille tid om natta. Bare eieren
// leser og skriver raden (RLS); serveren leser den med service-rollen i
// `notify()` og lar være å sende pling (`lib/notifications/pushPreferences.ts`,
// der regelen bor). Valgene gjelder alle telefonene og nettleserne spilleren
// har slått på varsler i.
//
// Appen bruker sin egen Supabase-klient her, som `aiConsent.ts`. `updated_at`
// settes av databasen.
import {
  MUTABLE_PUSH_GROUPS,
  type MutablePushGroupId,
} from '../../../../lib/notifications/pushGroups';
import { supabase } from '../supabase';

export type OwnPushPreferences = {
  mutedGroups: MutablePushGroupId[];
  quietHours: boolean;
};

/**
 * Bare gruppene som kan slås av, én gang hver og i visningsrekkefølge.
 * «Rundene dine» og ukjente verdier faller bort (CHECK-en i 0236 avviser dem).
 */
function mutableOnly(groups: readonly string[]): MutablePushGroupId[] {
  return MUTABLE_PUSH_GROUPS.filter((group) => groups.includes(group));
}

/**
 * Spillerens valg. Ingen rad betyr alt på og stille tid av. Kaster ved
 * lesefeil, så bryterne aldri viser et gjettet valg.
 */
export async function fetchOwnPushPreferences(userId: string): Promise<OwnPushPreferences> {
  const { data, error } = await supabase
    .from('notification_preferences')
    .select('muted_groups, quiet_hours')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`[pushPreferences] lesingen feilet: ${error.message}`);
  if (!data) return { mutedGroups: [], quietHours: false };
  return { mutedGroups: mutableOnly(data.muted_groups), quietHours: data.quiet_hours };
}

export type SavePushPreferencesResult = { ok: true } | { ok: false };

/**
 * Lagrer hele tilstanden. Upsert på `user_id`, med raden lest tilbake:
 * PostgREST svarer uten feil på en skriving som traff null rader (felle 2), så
 * bare en rad tilbake regnes som lagret. Kaster aldri.
 */
export async function savePushPreferences(
  userId: string,
  prefs: { mutedGroups: readonly string[]; quietHours: boolean },
): Promise<SavePushPreferencesResult> {
  try {
    const { data, error } = await supabase
      .from('notification_preferences')
      .upsert(
        { user_id: userId, muted_groups: mutableOnly(prefs.mutedGroups), quiet_hours: prefs.quietHours },
        { onConflict: 'user_id' },
      )
      .select('user_id');
    if (error || !data || data.length === 0) {
      console.error('[pushPreferences] valgene ble ikke lagret', error ?? 'null rader');
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.error('[pushPreferences] valgene ble ikke lagret', err);
    return { ok: false };
  }
}

/**
 * #2894: «Del sjeldne slag med alle» (`share_rare_shots`, migrasjon 0238), i samme rad.
 * Ingen rad betyr ja. Kaster ved lesefeil, så bryteren aldri viser et gjettet valg.
 */
export async function fetchOwnRareShotSharing(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('notification_preferences')
    .select('share_rare_shots')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`[pushPreferences] lesingen av delingen feilet: ${error.message}`);
  return data ? data.share_rare_shots : true;
}

/**
 * Lagrer delingsvalget alene. Upserten sender bare `share_rare_shots`, så PostgREST
 * oppdaterer bare den kolonnen, og varselvalgene står. Finnes ingen rad, får de andre
 * kolonnene standardverdiene. Raden leses tilbake (felle 2). Kaster aldri.
 */
export async function saveRareShotSharing(
  userId: string,
  share: boolean,
): Promise<SavePushPreferencesResult> {
  try {
    const { data, error } = await supabase
      .from('notification_preferences')
      .upsert({ user_id: userId, share_rare_shots: share }, { onConflict: 'user_id' })
      .select('user_id');
    if (error || !data || data.length === 0) {
      console.error('[pushPreferences] delingen ble ikke lagret', error ?? 'null rader');
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.error('[pushPreferences] delingen ble ikke lagret', err);
    return { ok: false };
  }
}
