import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId, callerScopedClient } from '@/lib/api/appAuth';
import { isAdmin } from '@/lib/kavalkade/getOrCreateKavalkade';
import { hasFinishedRoundInKavalkadeYear } from '@/lib/kavalkade/hasKavalkadeRound';
import {
  KAVALKADE_YEAR,
  isKavalkadeOpen,
  kavalkadeHomeSlot,
  type KavalkadeHomeSlot,
} from '@/lib/kavalkade/release';

// Kavalkadens status for native-appen (#2265).
//
// Appen trenger to svar før den viser noe: skal Hjem vise teaseren eller
// lenken (`slot` + `hasRound`), og får spilleren åpne kortstokken (`canOpen`).
// Webben svarer på det samme i `app/[locale]/HomeNudges.tsx` og i
// `getOrCreateKavalkade`; ruta setter sammen de samme byggesteinene og
// gjentar ingen regel selv.
//
// **Serveren eier datoen.** `now` og miljøet leses her, aldri fra appen. Da
// virker `KAVALKADE_OPEN_AT` på staging for appen også, og en telefon med feil
// klokke kan ikke åpne Kavalkaden før 24. desember.
//
// **Ruta skriver ingenting og kaller aldri modellen.** Den bygger ingen
// kavalkade-rad; det gjør bare `GET /api/kavalkade/{year}`.
//
// AUTH: `authenticatedUserId` i `lib/api/appAuth.ts`. Bruker-id-en kommer KUN
// fra det validerte tokenet. `hasRound` leses med `callerScopedClient` — RLS som
// kalleren, samme som webbens sesjons-klient — og `canOpen`s admin-regel er
// `isAdmin` fra `getOrCreateKavalkade`, ikke en kopi.
//
// WIRE (frosset — appen speiler den):
//   GET 200 { year: number, slot: 'teaser' | 'link' | null,
//             canOpen: boolean, hasRound: boolean }
//       401 { error: 'unauthorized' }
//       500 { error: 'status_failed' }
//
// Feil-bodyene er faste, ugjennomsiktige koder. Endepunktet er offentlig
// eksponert, så `err.message` skal aldri ut.
//
// `maxDuration` settes IKKE: to små oppslag, ingen modell.

const LOG_PREFIX = 'api/kavalkade/status';

type StatusBody = {
  year: number;
  slot: KavalkadeHomeSlot | null;
  canOpen: boolean;
  hasRound: boolean;
};

type ErrorBody = { error: 'unauthorized' | 'status_failed' };

export async function GET(request: NextRequest) {
  try {
    const userId = await authenticatedUserId(request);
    if (!userId) {
      const body: ErrorBody = { error: 'unauthorized' };
      return NextResponse.json(body, { status: 401 });
    }

    const now = new Date();
    // Uten anon-nøkkel i miljøet finnes ingen klient som leser som kalleren.
    // Da svarer vi «ingen runde» heller enn å lese med service-rollen — samme
    // utfall som `hasFinishedRoundInKavalkadeYear` gir når lesingen feiler.
    const client = callerScopedClient(request);
    const [canOpen, hasRound] = await Promise.all([
      // Er den åpen for alle, trengs ikke admin-oppslaget.
      isKavalkadeOpen(now) ? true : isAdmin(userId),
      client ? hasFinishedRoundInKavalkadeYear(client, userId) : false,
    ]);

    const body: StatusBody = {
      year: KAVALKADE_YEAR,
      slot: kavalkadeHomeSlot(now),
      canOpen,
      hasRound,
    };
    return NextResponse.json(body);
  } catch (err) {
    console.error(`[${LOG_PREFIX}] status failed`, err);
    const body: ErrorBody = { error: 'status_failed' };
    return NextResponse.json(body, { status: 500 });
  }
}
