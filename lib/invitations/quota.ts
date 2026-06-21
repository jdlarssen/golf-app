import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

/**
 * Structured time-until result — locale-agnostic.
 * Translated at call-site using catalog keys or inline strings.
 */
export type TimeUntilResult =
  | { kind: 'soon' }
  | { kind: 'hours'; n: number }
  | { kind: 'minutes'; n: number };

/**
 * Returns a structured representation of time remaining until `target`.
 * Translate the result at the call-site using catalog keys.
 *
 * - `{ kind: 'soon' }`        → target is now or past
 * - `{ kind: 'hours', n }`    → n hours away (floored, n ≥ 1)
 * - `{ kind: 'minutes', n }`  → n minutes away (ceiled, n ≥ 1)
 */
export function timeUntilStructured(target: Date): TimeUntilResult {
  const diffMs = target.getTime() - Date.now();
  if (diffMs <= 0) return { kind: 'soon' };
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  if (hours >= 1) return { kind: 'hours', n: hours };
  const minutes = Math.ceil(diffMs / (60 * 1000));
  return { kind: 'minutes', n: minutes };
}

export const DAILY_INVITE_LIMIT = 10;
export const QUOTA_WINDOW_MS = 24 * 60 * 60 * 1000;

export type QuotaState = {
  count: number;
  limit: number;
  isExhausted: boolean;
  nextSlotAt: Date | null;
};

export async function getQuotaState(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<QuotaState> {
  const windowStart = new Date(Date.now() - QUOTA_WINDOW_MS).toISOString();

  const { data, error } = await supabase
    .from('invitations')
    .select('created_at')
    .eq('invited_by', userId)
    .is('game_id', null)
    .gte('created_at', windowStart)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to load invite quota: ${error.message}`);

  const count = data?.length ?? 0;
  const isExhausted = count >= DAILY_INVITE_LIMIT;
  const nextSlotAt =
    isExhausted && data && data.length > 0
      ? new Date(new Date(data[0].created_at).getTime() + QUOTA_WINDOW_MS)
      : null;

  return { count, limit: DAILY_INVITE_LIMIT, isExhausted, nextSlotAt };
}
