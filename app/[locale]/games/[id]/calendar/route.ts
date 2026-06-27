import { NextResponse } from 'next/server';
import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { getGameWithPlayers } from '@/lib/games/getGameWithPlayers';
import { buildTeeOffIcs } from '@/lib/calendar/teeOffIcs';

// Kalender-hendelsens form (#945, avklart med eier):
//   - 4,5 t blokk (realistisk 18-hulls runde, hindrer dobbeltbooking)
//   - påminnelse 1 t før (hele poenget er å ikke glippe tee-tiden)
const DURATION_MINUTES = 270;
const REMINDER_MINUTES = 60;

/**
 * `.ics`-nedlasting for et spills planlagte tee-off (#945).
 *
 * Server-rute framfor klient-blob: iOS standalone-PWA håndterer
 * blob-nedlasting upålitelig, mens en respons med `Content-Type:
 * text/calendar` + `Content-Disposition: attachment` trigger «Legg til i
 * kalender»-arket robust. Primær-plattformen er iOS PWA.
 *
 * Auth-gated med samme mønster som leaderboard-eksporten:
 *   - innlogget bruker (proxy-verifisert)
 *   - admin ELLER deltaker i spillet
 *
 * Krever at spillet har en planlagt tee-off OG ikke er ferdigspilt — en
 * kalender-hendelse for en runde uten tidspunkt, eller en allerede avsluttet
 * runde, gir ikke mening. Begge avvises med 404 (UI-lenken vises uansett kun
 * i venterommet med satt tee-off).
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ locale: string; id: string }> },
) {
  const { locale: rawLocale, id } = await ctx.params;
  const locale = hasLocale(routing.locales, rawLocale)
    ? rawLocale
    : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: 'game.teeOffCalendar' });

  const userId = await getProxyVerifiedUserId();
  if (!userId) {
    return NextResponse.json(
      { error: t('errors.notLoggedIn') },
      { status: 401 },
    );
  }

  const supabase = await getServerClient();

  const [gwp, profileRes] = await Promise.all([
    getGameWithPlayers(id),
    supabase
      .from('users')
      .select('is_admin')
      .eq('id', userId)
      .single<{ is_admin: boolean }>(),
  ]);

  if (!gwp) {
    return NextResponse.json({ error: t('errors.unavailable') }, { status: 404 });
  }
  const game = gwp.game;

  const isAdmin = profileRes.data?.is_admin === true;
  if (!isAdmin && !gwp.players.some((p) => p.user_id === userId)) {
    return NextResponse.json({ error: t('errors.unavailable') }, { status: 404 });
  }

  if (game.status === 'finished' || !game.scheduled_tee_off_at) {
    return NextResponse.json({ error: t('errors.unavailable') }, { status: 404 });
  }

  // Banenavn er ikke i den cachede game-payloaden (joins holdes utenfor
  // cachen, jf. CLAUDE.md → "Server-actions og caching"). Hent det som en
  // slim direkte-call.
  const courseRes = await supabase
    .from('courses')
    .select('name')
    .eq('id', game.course_id)
    .single<{ name: string }>();
  const courseName = courseRes.data?.name ?? null;

  const origin = new URL(req.url).origin;
  const gameUrl = `${origin}/${locale}/games/${id}`;

  const ics = buildTeeOffIcs({
    uid: `teeoff-${id}@tornygolf.no`,
    gameName: game.name,
    courseName,
    teeOffAt: new Date(game.scheduled_tee_off_at),
    durationMinutes: DURATION_MINUTES,
    reminderMinutes: REMINDER_MINUTES,
    summary: t('summary', { game: game.name }),
    description: t('description', { game: game.name, url: gameUrl }),
    dtstamp: new Date(),
  });

  return new Response(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="torny-teeoff-${id}.ics"`,
      'Cache-Control': 'no-store',
    },
  });
}
