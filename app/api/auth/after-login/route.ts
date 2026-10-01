import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUser, callerScopedClient } from '@/lib/api/appAuth';
import { afterLogin } from '@/lib/auth/afterLogin';

// Stegene etter innloggingen, for native-appen (#2216).
//
// Appen verifiserer koden selv (`verifyOtp`) og kaller så denne. Da får en ny
// eller invitert spiller det samme som på nettsiden: gjest-flagget ryddes,
// ventende invitasjoner gir plass i spillet, varsel og vennskap, og klubb-
// invitasjoner tas i bruk. Alt det bor i `afterLogin`, som nettsidens
// `verifyCode` også kaller.
//
// AUTH: `authenticatedUser` i `lib/api/appAuth.ts`. Id og e-post kommer KUN fra
// det validerte tokenet; kroppen leses ikke. Uten e-post på tokenet finnes det
// ingen invitasjoner å slå opp, og ruta svarer 401. Kjernen får
// `callerScopedClient`, så konsumet av invitasjonen, `befriend_inviter` og
// `accept_club_invitations` kjører som kalleren under RLS, slik cookie-klienten
// gjør på nettsiden.
//
// `landing` fra kjernen brukes ikke: appen lander på Hjem, der spillet står i
// lista (#356 er nettsidens).
//
// WIRE (frosset — appen speiler den):
//   POST (Bearer)
//     200 { ok: true }
//     401 { error: 'unauthorized' }
//     500 { error: 'after_login_failed' }
//
// Feil-bodyene er faste, ugjennomsiktige koder. `err.message` skal aldri ut.

// Invitasjonene kan gi flere rundturer per spill (oppslag, innsetting, varsel,
// vennskap). Eneste segment-eksporten repoet bruker.
export const maxDuration = 30;

const LOG_PREFIX = 'api/auth/after-login';

type ErrorBody = { error: 'unauthorized' | 'after_login_failed' };

export async function POST(request: NextRequest) {
  try {
    const user = await authenticatedUser(request);
    if (!user?.email) {
      const body: ErrorBody = { error: 'unauthorized' };
      return NextResponse.json(body, { status: 401 });
    }

    // `null` betyr at anon-nøkkelen mangler i miljøet. Det er vår feil, ikke
    // kallerens, så den går til 500 under.
    const client = callerScopedClient(request);
    if (!client) throw new Error('caller-scoped client unavailable');

    await afterLogin(client, { userId: user.id, email: user.email });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`[${LOG_PREFIX}] failed`, err);
    const body: ErrorBody = { error: 'after_login_failed' };
    return NextResponse.json(body, { status: 500 });
  }
}
