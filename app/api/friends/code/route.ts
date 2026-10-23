import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId } from '@/lib/api/appAuth';
import { getPrivateUserFields } from '@/lib/users/privateUserFields';

// Venne-koden din, til QR-koden på bag-taggen i appen (#2627).
//
// **Hvorfor en egen rute.** Koden er privat (#2207): `users.friend_code` kan
// ikke leses med brukerens egen sesjon, så appen spør serveren. `GET
// /api/friends` har den også, men regner ut hele vennesiden (venner,
// forespørsler, forslag og tall). Profil åpnes ofte og trenger bare koden.
//
// AUTH: `authenticatedUserId` — id-en fra det validerte tokenet, aldri fra
// query eller kropp. Koden leses bare via `getPrivateUserFields` for kallerens
// egen rad.
//
// WIRE:
//   GET 200 { friendCode: string | null }   (`null` når raden mangler)
//       401 { error: 'unauthorized' }
//       500 { error: 'load_failed' }

export async function GET(request: NextRequest) {
  try {
    const userId = await authenticatedUserId(request);
    if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const fields = await getPrivateUserFields([userId]);
    return NextResponse.json({ friendCode: fields.get(userId)?.friendCode ?? null });
  } catch (err) {
    console.error('[api/friends/code] load failed', err);
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }
}
