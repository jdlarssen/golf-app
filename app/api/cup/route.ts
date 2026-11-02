import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId, callerScopedClient } from '@/lib/api/appAuth';
import { cupActionFailure, jsonObject } from '@/lib/cup/cupRouteGate';
import { parseCupDraftForm } from '@/lib/cup/parseCupDraftForm';
import { createTournamentDraftCore, revalidateCupSetup } from '@/lib/cup/setupCore';
import type { AppCupListResponse, AppCupSummary } from '@/lib/cup/appCupView';
import { APP_CUP_UNKNOWN_PLAYER } from '@/lib/cup/buildAppCupView';
import { getMyCupIds } from '@/lib/cup/myCups';
import { getRoomCups } from '@/lib/cup/getRoomCups';

// «Cupene dine» på Hjem i appen (#2752): de samme cupene Klubbhus-rommet viser,
// med fremdriften fra cup-siden. Bare cuper som ikke er avsluttet: en ferdig cup
// nås fra runden du spilte, og fra varselet om at den er avsluttet.
//
// AUTH: `authenticatedUserId`, id-en kommer bare fra det validerte tokenet.
// Cup-id-ene leses som kalleren (`callerScopedClient`), som nettsiden. Raden sier
// ingenting om stillingen, bare fremdriften (#1468).
//
// WIRE (appen speiler den, `lib/cup/appCupView.ts`):
//   GET 200 AppCupListResponse · 401 unauthorized · 500 load_failed
//   POST { name, team1Name, team2Name, winPoints, tiePoints } (`CupSetupCreateBody`)
//        200 { id } · 400 invalid_request · 401 unauthorized
//        409 cup_name | cup_team_1 | cup_team_2 | cup_team_dup | cup_win_points | cup_tie_points
//        500 cup_insert_failed
//
// POST lager en personlig cup: klubb-cuper lages på nettet (eierens svar). Skapt av
// kalleren, skrevet med kallerens egen klient, så RLS er backstop (0090). Taket på
// kamper og spillere håndheves når de legges til.

export async function GET(request: NextRequest) {
  try {
    const userId = await authenticatedUserId(request);
    if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const caller = callerScopedClient(request);
    if (!caller) throw new Error('caller-scoped client unavailable');

    const room = await getRoomCups(await getMyCupIds(caller, userId), APP_CUP_UNKNOWN_PLAYER);
    if (!room.ok) throw new Error('room cups failed');

    const body: AppCupListResponse = {
      cups: [
        ...room.live.map(
          (cup): AppCupSummary => ({
            id: cup.id,
            name: cup.name,
            status: cup.status,
            progress: cup.progress,
          }),
        ),
        // Eierens svar 02.11: de tre siste ferdige står under de aktive.
        ...room.recentFinished.map(
          (cup): AppCupSummary => ({ id: cup.id, name: cup.name, status: 'finished', progress: null }),
        ),
      ],
    };
    return NextResponse.json(body);
  } catch (err) {
    console.error('[api/cup] load threw', err);
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }
}

const text = (value: unknown) => (typeof value === 'string' ? value : '');

export async function POST(request: NextRequest) {
  try {
    const userId = await authenticatedUserId(request);
    if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const caller = callerScopedClient(request);
    if (!caller) throw new Error('caller-scoped client unavailable');

    const body = await jsonObject(request);
    if (typeof body.name !== 'string') return NextResponse.json({ error: 'invalid_request' }, { status: 400 });

    const parsed = parseCupDraftForm({
      name: body.name,
      team1: text(body.team1Name),
      team2: text(body.team2Name),
      // Tomt betyr nettets standard for handicap-andelene. Appen spør ikke om dem.
      fourballAllowanceRaw: '',
      foursomesAllowanceRaw: '',
      greensomeAllowanceRaw: '',
      chapmanAllowanceRaw: '',
      gruesomeAllowanceRaw: '',
      winPointsRaw: text(body.winPoints),
      tiePointsRaw: text(body.tiePoints),
    });
    if (!parsed.ok) return cupActionFailure(parsed.error, 'cup_insert_failed');

    const created = await createTournamentDraftCore(caller, { userId, groupId: null, values: parsed.values });
    if (!created.ok) return cupActionFailure(created.error, 'cup_insert_failed');

    revalidateCupSetup(created.id, null);
    return NextResponse.json({ id: created.id });
  } catch (err) {
    console.error('[api/cup] create threw', err);
    return NextResponse.json({ error: 'cup_insert_failed' }, { status: 500 });
  }
}
