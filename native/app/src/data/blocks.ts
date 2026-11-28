// native/app/src/data/blocks.ts
// #3019: blokkere og oppheve er appens egne skrivinger i `user_blocks`
// (migrasjon 0259): RLS lar bare blokkereren skrive og slette sine egne
// rader, og en trigger fjerner vennskapet. Lista med navn kommer fra
// `GET /api/blocks`, fordi en blokkering fjerner vennskapet som gjorde den
// andres navn lesbart.
import { getNetworkStateAsync } from 'expo-network';
import { currentDeviceUserId, supabase } from '../supabase';
import { callWebRoute } from './webApi';
import type { BlockFailure } from '../lib/moderationCopy';

export type BlockResult = { ok: true } | { ok: false; reason: BlockFailure };

async function offline(): Promise<boolean> {
  try {
    return (await getNetworkStateAsync()).isConnected === false;
  } catch {
    return false;
  }
}

/**
 * Blokker en spiller. Raden leses tilbake (felle 2); en blokkering som alt
 * står (23505) er også en blokkering. Kaster aldri.
 */
export async function blockUser(userId: string): Promise<BlockResult> {
  if (await offline()) return { ok: false, reason: 'offline' };
  const me = await currentDeviceUserId();
  if (!me) return { ok: false, reason: 'failed' };
  try {
    const { data, error } = await supabase
      .from('user_blocks')
      .insert({ blocker_id: me, blocked_id: userId })
      .select('blocked_id');
    if (error?.code === '23505') return { ok: true };
    if (error || !data || data.length === 0) {
      console.error('[blocks] blokkeringen ble ikke lagret', error ?? 'null rader');
      return { ok: false, reason: 'failed' };
    }
    return { ok: true };
  } catch (err) {
    console.error('[blocks] blokkeringen ble ikke lagret', err);
    return { ok: false, reason: 'failed' };
  }
}

/**
 * Opphev en blokkering. En rad som alt er borte (0 rader) regnes som opphevet:
 * målet er at den ikke står. Kaster aldri.
 */
export async function unblockUser(userId: string): Promise<BlockResult> {
  if (await offline()) return { ok: false, reason: 'offline' };
  const me = await currentDeviceUserId();
  if (!me) return { ok: false, reason: 'failed' };
  try {
    const { error } = await supabase
      .from('user_blocks')
      .delete()
      .eq('blocker_id', me)
      .eq('blocked_id', userId)
      .select('blocked_id');
    if (error) {
      console.error('[blocks] opphevingen feilet', error);
      return { ok: false, reason: 'failed' };
    }
    return { ok: true };
  } catch (err) {
    console.error('[blocks] opphevingen feilet', err);
    return { ok: false, reason: 'failed' };
  }
}

export type BlockedPerson = { userId: string; name: string | null; blockedAt: string };

export type ListBlocksResult = { ok: true; blocks: BlockedPerson[] } | { ok: false; reason: BlockFailure };

/** Lista bak «Blokkerte», nyeste først. Kaster aldri. */
export async function listBlocks(): Promise<ListBlocksResult> {
  const call = await callWebRoute('/api/blocks', 'GET');
  if (!call.ok) return { ok: false, reason: call.reason === 'offline' ? 'offline' : 'failed' };
  if (call.status !== 200 || !Array.isArray(call.body.blocks)) return { ok: false, reason: 'failed' };
  const blocks = (call.body.blocks as unknown[]).flatMap((row): BlockedPerson[] => {
    const r = row as Record<string, unknown>;
    if (typeof r.userId !== 'string' || typeof r.blockedAt !== 'string') return [];
    return [{ userId: r.userId, name: typeof r.name === 'string' ? r.name : null, blockedAt: r.blockedAt }];
  });
  return { ok: true, blocks };
}
