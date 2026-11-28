import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId, callerScopedClient } from '@/lib/api/appAuth';
import { listBlocksCore } from '@/lib/moderation/listBlocks';

// #3019: «Blokkerte» in the native app. Blocking and lifting a block are the
// app's own writes to `user_blocks` (RLS, 0259); this route only lists the
// caller's blocks with the names, which the caller can no longer read.
//
// AUTH: `authenticatedUserId` in `lib/api/appAuth.ts`; the rows are read with
// the caller's own client, so only their own blocks come back.
//
// WIRE (frozen — the app mirrors it):
//   GET 200 { blocks: { userId: uuid, name: string | null, blockedAt: string }[] }
//       401 { error: 'unauthorized' }
//       500 { error: 'load_failed' }

const LOG_PREFIX = 'api/blocks';

export async function GET(request: NextRequest) {
  try {
    const userId = await authenticatedUserId(request);
    const caller = userId ? callerScopedClient(request) : null;
    if (!userId || !caller) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const result = await listBlocksCore(caller, userId);
    if (!result.ok) return NextResponse.json({ error: 'load_failed' }, { status: 500 });
    return NextResponse.json({ blocks: result.blocks });
  } catch (err) {
    console.error(`[${LOG_PREFIX}] threw`, err);
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }
}
