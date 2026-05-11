import type { SupabaseClient } from '@supabase/supabase-js';

export function formatTimeUntil(target: Date): string {
  const diffMs = target.getTime() - Date.now();
  if (diffMs <= 0) return 'snart';
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  if (hours >= 1) return `${hours} t`;
  const minutes = Math.ceil(diffMs / (60 * 1000));
  return `${minutes} min`;
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
  supabase: SupabaseClient,
  userId: string,
): Promise<QuotaState> {
  const windowStart = new Date(Date.now() - QUOTA_WINDOW_MS).toISOString();

  const { data, error } = await supabase
    .from('invitations')
    .select('created_at')
    .eq('invited_by', userId)
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
