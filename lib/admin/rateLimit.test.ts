import { describe, it, expect, vi } from 'vitest';
import { consumeAdminInviteRateLimit } from './rateLimit';

type RpcArgs = {
  p_bucket: string;
  p_max: number;
  p_window_seconds: number;
};

function makeSupabase(behaviour: {
  admin?: { data?: boolean; error?: { message: string } };
  ip?: { data?: boolean; error?: { message: string } };
}) {
  const calls: Array<{ fn: string; args: RpcArgs }> = [];
  const rpc = vi.fn(async (fn: string, args: RpcArgs) => {
    calls.push({ fn, args });
    if (args.p_bucket.startsWith('invite-admin:')) {
      return behaviour.admin ?? { data: true };
    }
    if (args.p_bucket.startsWith('invite-ip:')) {
      return behaviour.ip ?? { data: true };
    }
    return { data: true };
  });
  return { supabase: { rpc } as never, calls, rpc };
}

describe('consumeAdminInviteRateLimit', () => {
  it('checks both buckets in parallel and allows when both pass', async () => {
    const { supabase, calls } = makeSupabase({});

    const allowed = await consumeAdminInviteRateLimit({
      supabase,
      adminId: 'a1',
      ip: '1.2.3.4',
    });

    expect(allowed).toBe(true);
    expect(calls).toHaveLength(2);
    const buckets = calls.map((c) => c.args.p_bucket).sort();
    expect(buckets).toEqual(['invite-admin:a1', 'invite-ip:1.2.3.4']);
  });

  it('blocks when admin bucket is exhausted', async () => {
    const { supabase } = makeSupabase({ admin: { data: false } });

    const allowed = await consumeAdminInviteRateLimit({
      supabase,
      adminId: 'a1',
      ip: '1.2.3.4',
    });

    expect(allowed).toBe(false);
  });

  it('blocks when IP bucket is exhausted', async () => {
    const { supabase } = makeSupabase({ ip: { data: false } });

    const allowed = await consumeAdminInviteRateLimit({
      supabase,
      adminId: 'a1',
      ip: '1.2.3.4',
    });

    expect(allowed).toBe(false);
  });

  it('fails open when the RPC returns an error', async () => {
    const { supabase } = makeSupabase({
      admin: { error: { message: 'db down' } },
    });

    const allowed = await consumeAdminInviteRateLimit({
      supabase,
      adminId: 'a1',
      ip: '1.2.3.4',
    });

    expect(allowed).toBe(true);
  });

  it('honours custom limits and window', async () => {
    const { supabase, calls } = makeSupabase({});

    await consumeAdminInviteRateLimit({
      supabase,
      adminId: 'a1',
      ip: '1.2.3.4',
      adminMax: 5,
      ipMax: 10,
      windowSeconds: 300,
    });

    const admin = calls.find((c) => c.args.p_bucket.startsWith('invite-admin:'));
    const ip = calls.find((c) => c.args.p_bucket.startsWith('invite-ip:'));
    expect(admin?.args.p_max).toBe(5);
    expect(admin?.args.p_window_seconds).toBe(300);
    expect(ip?.args.p_max).toBe(10);
    expect(ip?.args.p_window_seconds).toBe(300);
  });
});
