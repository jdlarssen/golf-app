import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { sendDeliveryReminder } from '@/lib/notifications/deliveryReminder';
import { selectDeliveryReminderTargets } from '@/lib/games/deliveryStatus';
import { holeCountForSegment } from '@/lib/games/holeScope';
import { candidatesOnSameSplitDay } from '@/lib/games/splitDayPairing';
import type { HoleSegment } from '@/lib/scoring';

// Purre-kjernen (#376 → #1891): ett hjem for «hvem er ferdig uten å ha levert,
// og send påminnelse til dem». Logikken bodde inni server-action-en
// `remindUnsubmittedPlayers` på admin-status-siden. Da appen skulle få samme
// knapp via `app/api/games/[id]/remind`, ville en kopi gitt regelen to hjem
// (AGENTS trap 4) — så den flyttet hit, og action-en ble en tynn wrapper.
//
// **Authz ligger hos kalleren.** Modulen leser og skriver med service-role-
// klienten og spør ALDRI hvem som ringer: den har ingen sesjon å spørre om.
// Hver kaller må ha gatet FØR den kaller hit —
//   - server-action: `requireAdmin` / `requireAdminOrCreator`
//   - HTTP-rute: `authenticatedUserId` + `gameOrganiserAccess` (lib/api/appAuth)
// Ny kaller uten en slik port = et endepunkt der hvem som helst kan utløse
// mail til andres spillere. Det er den ene feilen denne fila kan gjøre mulig.
//
// Hvorfor service-role og ikke RLS-klienten: ruter under `api/` ligger utenfor
// proxy-matcheren og har hverken cookie-sesjon eller RLS-klient. Skulle
// action-en beholdt RLS-klienten og ruta brukt admin, ville de to veiene kunnet
// se ulike spillere for samme spill — altså to regler igjen.

// Logg-prefikset følger med fra server-action-en (#376) med vilje: det er
// søkestrengen for purre-mail i Vercel-loggen (CLAUDE.md «Mail-debug»), og et
// navnebytte hadde gjort eksisterende feilsøkings-oppskrifter ugyldige.
const LOG_PREFIX = 'remindUnsubmittedPlayers';

type GameRow = {
  id: string;
  name: string;
  status: string;
  hole_segment: HoleSegment;
  tournament_id: string | null;
  scheduled_tee_off_at: string | null;
  created_at: string | null;
};

type PlayerRow = {
  user_id: string;
  submitted_at: string | null;
  withdrawn_at: string | null;
  deliver_reminder_sent_at: string | null;
  users: {
    email: string | null;
    name: string | null;
    locale: string | null;
    is_guest: boolean;
  } | null;
};

/**
 * Hvorfor purringen ikke lot seg kjøre. To verdier og ikke én, fordi ruta må
 * kunne svare 404 og 409 forskjellig; server-action-en kollapser dem igjen til
 * sin ene redirect (den har alltid gjort det).
 */
export type ReminderBlocked = { ok: false; reason: 'not_found' | 'not_active' };

export type ReminderPreview =
  | { ok: true; targets: number; lastRemindedAt: string | null }
  | ReminderBlocked;

export type ReminderResult = { ok: true; reminded: number } | ReminderBlocked;

type ReminderContext = {
  ok: true;
  game: GameRow;
  targets: PlayerRow[];
  lastRemindedAt: string | null;
};

/**
 * «Sist noen fikk purring» for spillet: største `deliver_reminder_sent_at` over
 * ALLE spillerne, ikke bare dagens mål. Auto-nudgen
 * (`maybeSendDeliveryReminder`) stempler den samme kolonnen, og en spiller som
 * ble purret og siden leverte er fortsatt et vitne om at det ble purret.
 *
 * Sammenlignet som instant, ikke som streng: Postgres klipper etterfølgende
 * nuller i sekundbrøken, så to stempler kan ha ulik lengde. Returnerer den
 * ORIGINALE strengen — formateringen eies av flaten (appen må bruke sin egen
 * Oslo-formatering, aldri webbens parser, jf. Hermes-fella).
 */
function latestReminder(players: readonly PlayerRow[]): string | null {
  let latest: string | null = null;
  let latestMs = -Infinity;
  for (const p of players) {
    const raw = p.deliver_reminder_sent_at;
    if (!raw) continue;
    const ms = Date.parse(raw);
    if (Number.isNaN(ms) || ms <= latestMs) continue;
    latest = raw;
    latestMs = ms;
  }
  return latest;
}

/**
 * Stegene `previewReminder` og `sendReminders` deler: hent spillet, sjekk at
 * det er aktivt, og regn ut hvem som skal purres. Én kropp, ikke to kopier —
 * ellers kunne knappens tall (preview) og hvem som faktisk fikk mail (send)
 * drevet fra hverandre.
 */
async function loadReminderContext(
  admin: ReturnType<typeof getAdminClient>,
  gameId: string,
): Promise<ReminderContext | ReminderBlocked> {
  const { data: game } = await admin
    .from('games')
    .select(
      'id, name, status, hole_segment, tournament_id, scheduled_tee_off_at, created_at',
    )
    .eq('id', gameId)
    .maybeSingle<GameRow>();

  if (!game) return { ok: false, reason: 'not_found' };
  if (game.status !== 'active') return { ok: false, reason: 'not_active' };

  // #1441: front9/back9-spill er «ferdig» ved 9 hull, ikke 18.
  const expectedHoles = holeCountForSegment(game.hole_segment);

  const [playersRes, scoresRes] = await Promise.all([
    admin
      .from('game_players')
      .select(
        'user_id, submitted_at, withdrawn_at, deliver_reminder_sent_at, users!game_players_user_id_fkey(email, name, locale, is_guest)',
      )
      .eq('game_id', gameId)
      .returns<PlayerRow[]>(),
    admin
      .from('scores')
      .select('user_id')
      .eq('game_id', gameId)
      .not('strokes', 'is', null)
      .returns<{ user_id: string }[]>(),
  ]);

  const players = playersRes.data ?? [];

  const filledByUser = new Map<string, number>();
  for (const r of scoresRes.data ?? []) {
    filledByUser.set(r.user_id, (filledByUser.get(r.user_id) ?? 0) + 1);
  }

  // #1466: on a split-cup front9 host, a player whose back9 sibling is still
  // undelivered is nagged via the back9 game (one delivery covers the whole
  // round). Exclude them here. Batch: find the tournament's back9 host(s), then
  // ONE query for which finished front9 players are still undelivered there — no
  // per-player loop. Non-split games (hole_segment='full') skip this entirely.
  //
  // #1449 finding 1: a two-day cup shares one `tournament_id`, so scope the back9
  // hosts to THIS front9's Oslo split-day — otherwise day-2's front9 could read
  // day-1's back9 undelivered set. Same day-rule as findSegmentSibling
  // (`candidatesOnSameSplitDay`), one home for it (AGENTS.md trap 4).
  let undeliveredSiblingUserIds: Set<string> | undefined;
  if (game.hole_segment === 'front9' && game.tournament_id != null) {
    const { data: back9Hosts } = await admin
      .from('games')
      .select('id, scheduled_tee_off_at, created_at')
      .eq('tournament_id', game.tournament_id)
      .eq('hole_segment', 'back9')
      .is('source_game_id', null)
      .returns<
        { id: string; scheduled_tee_off_at: string | null; created_at: string | null }[]
      >();
    const back9Ids = candidatesOnSameSplitDay(game, back9Hosts ?? []).map(
      (g) => g.id,
    );
    if (back9Ids.length > 0) {
      const { data: undelivered } = await admin
        .from('game_players')
        .select('user_id')
        .in('game_id', back9Ids)
        .is('submitted_at', null)
        .is('withdrawn_at', null)
        .returns<{ user_id: string }[]>();
      undeliveredSiblingUserIds = new Set(
        (undelivered ?? []).map((r) => r.user_id),
      );
    }
  }

  // #1009: gjester purres ikke — plassholder-adressen kan ikke motta mail, og
  // gjesten leverer via markøren uansett. #1466: front9-spillere med ulevert
  // back9-søsken ekskluderes (purres via back9).
  const targets = selectDeliveryReminderTargets({
    players,
    filledByUser,
    expectedHoles,
    undeliveredSiblingUserIds,
  });

  return { ok: true, game, targets, lastRemindedAt: latestReminder(players) };
}

/**
 * Hva en purring VILLE truffet nå, uten å sende noe: antall mål og når noen
 * sist ble purret. Flatene bruker tallet i selve knappeteksten («Purr på dem
 * som mangler (N)»), så det må komme fra nøyaktig samme utvalg som sendingen.
 */
export async function previewReminder(gameId: string): Promise<ReminderPreview> {
  const loaded = await loadReminderContext(getAdminClient(), gameId);
  if (!loaded.ok) return loaded;

  return {
    ok: true,
    targets: loaded.targets.length,
    lastRemindedAt: loaded.lastRemindedAt,
  };
}

/**
 * Send påminnelse til alle som er ferdige uten å ha levert, og stempel dem.
 *
 * Bevisst uten idempotens-sperre (eiervalg #1891): arrangøren skal kunne purre
 * på nytt. Auto-nudgens `maybeSendDeliveryReminder` har sin egen guard og bryr
 * seg ikke om denne.
 */
export async function sendReminders(gameId: string): Promise<ReminderResult> {
  const admin = getAdminClient();
  const loaded = await loadReminderContext(admin, gameId);
  if (!loaded.ok) return loaded;

  const { game, targets } = loaded;

  // Best-effort: én død adresse skal ikke stoppe resten, og aldri velte
  // kallerens flyt. `sendDeliveryReminder` svelger allerede sine egne feil —
  // allSettled er beltet i tillegg til selen.
  await Promise.allSettled(
    targets.map((p) =>
      sendDeliveryReminder({
        player: {
          userId: p.user_id,
          email: p.users?.email ?? null,
          name: p.users?.name ?? null,
          locale: p.users?.locale ?? null,
        },
        game: { id: game.id, name: game.name },
        logPrefix: LOG_PREFIX,
      }),
    ),
  );

  if (targets.length > 0) {
    // Stemplet er auto-nudgens idempotens-guard: uten det ville
    // `maybeSendDeliveryReminder` purre de samme spillerne en gang til ved
    // neste sidevisning.
    //
    // `.select()` fordi PostgREST svarer `error == null` på en update som traff
    // 0 rader (AGENTS trap 2). Men vi kaster IKKE på avvik: mailene er allerede
    // ute, og en 500 her ville fått arrangøren til å trykke igjen — altså
    // dobbel purring som straff for en bokføringsfeil. Logg i stedet, så
    // avviket er synlig i Vercel-loggen uten at svaret lyver.
    const { data: stamped, error } = await admin
      .from('game_players')
      .update({ deliver_reminder_sent_at: new Date().toISOString() })
      .eq('game_id', gameId)
      .in(
        'user_id',
        targets.map((t) => t.user_id),
      )
      .select('user_id');

    if (error || (stamped?.length ?? 0) < targets.length) {
      console.error(
        `[${LOG_PREFIX}] stamped ${stamped?.length ?? 0}/${targets.length} deliver_reminder_sent_at rows`,
        error,
      );
    }
  }

  return { ok: true, reminded: targets.length };
}
