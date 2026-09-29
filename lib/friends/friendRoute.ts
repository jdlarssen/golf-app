import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { authenticatedUserId, callerScopedClient } from '@/lib/api/appAuth';

/**
 * Porten for appens venne-ruter (#2256), felles for alle fem POST-rutene under
 * `app/api/friends/`, så ingen av dem kan gjøre det litt annerledes.
 *
 * - Bruker-id-en kommer KUN fra det validerte tokenet (`authenticatedUserId`).
 *   Kroppen bærer bare feltverdier; en `userId` i den leses aldri.
 * - RPC-ene kjøres med en klient bygd fra kallerens eget token
 *   (`callerScopedClient`), fordi de leser `auth.uid()`.
 * - Svaret er `{ status }`: den samme koden webben legger i `?status=`.
 *
 * WIRE (frosset — appen speiler den):
 *   POST 200 { status: <FriendStatus | InviteStatus> }
 *        401 { error: 'unauthorized' }
 *        500 { status: 'error' }
 */

type Client = SupabaseClient<Database>;
export type FriendRouteBody = Record<string, unknown>;

/** Kroppen som objekt; en uleselig kropp gir tomme felter, ikke en 500. */
async function readBody(request: NextRequest): Promise<FriendRouteBody> {
  try {
    const parsed: unknown = await request.json();
    return parsed !== null && typeof parsed === 'object' ? (parsed as FriendRouteBody) : {};
  } catch {
    return {};
  }
}

/** Et tekstfelt fra kroppen, trimmet; alt annet enn en streng blir tomt. */
export function textField(body: FriendRouteBody, key: string): string {
  const value = body[key];
  return typeof value === 'string' ? value.trim() : '';
}

export async function friendActionRoute(
  request: NextRequest,
  logPrefix: string,
  run: (client: Client, userId: string, body: FriendRouteBody) => Promise<string>,
): Promise<NextResponse> {
  try {
    const userId = await authenticatedUserId(request);
    if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const client = callerScopedClient(request);
    if (!client) throw new Error('caller-scoped client unavailable');

    const status = await run(client, userId, await readBody(request));
    return NextResponse.json({ status });
  } catch (err) {
    // Feil-bodyen er en fast kode: endepunktet er offentlig eksponert, så
    // `err.message` skal aldri ut.
    console.error(`[${logPrefix}] failed`, err);
    return NextResponse.json({ status: 'error' }, { status: 500 });
  }
}
