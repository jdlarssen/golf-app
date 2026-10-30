import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrCreator } from '@/lib/admin/auth';
import { getGameWithPlayers } from '@/lib/games/getGameWithPlayers';
import { localizeGameName } from '@/lib/games/autoGameName';
import { formatDisplayLabelKey } from '@/lib/games/formatLabel';
import { invitationWhen } from '@/lib/games/invitationCard';
import { isPubliclyViewable, signupShareUrl } from '@/lib/games/publicSignupVisibility';
import {
  receiptInvitees,
  receiptLineKind,
  receiptNameParts,
} from '@/lib/games/publishReceipt';
import type { GameStatus } from '@/lib/games/status';
import { formatListLocale } from '@/lib/i18n/format';
import { AppShell } from '@/components/ui/AppShell';
import { InvitationPreviewCard } from '@/app/[locale]/admin/games/new/sections/InvitationPreviewCard';
import { ReceiptActions } from './ReceiptActions';

/**
 * The receipt after «Publiser» (#2458), drawn as the artboard
 * `Nyttspill-forslag-spillet-klart`: «✓ {name} er klar», who got the
 * invitation, the small card from «Klar?» read-only, and «Del i
 * gruppechatten», «Kopier lenke», «Legg i kalenderen» and «Gå til spillet».
 *
 * Its own address, not a banner on the game page: publishing is a server
 * action that redirects here (replacing the wizard in the history), and a GET
 * page can be reloaded without publishing anything again. It only reads.
 *
 * Gated on `requireAdminOrCreator`, like the wizard that sends you here.
 * A game that is not scheduled (a draft, a round under way, a finished one)
 * or a cup match has no receipt, and the page sends you to the game. The
 * draft gate is the fresh RLS read below, not the cached payload.
 *
 * The page draws no bottom nav, as the artboard (`data-hides-bottom-nav`).
 */

type Params = Promise<{ id: string }>;

type ReceiptRow = {
  status: GameStatus;
  short_id: string;
  registration_mode: 'invite_only' | 'manual_approval' | 'open';
  signups_closed_at: string | null;
  courses: { name: string } | null;
};

export default async function PublishReceiptPage({ params }: { params: Params }) {
  const { id } = await params;
  const locale = await getLocale();
  const t = await getTranslations('game.publishReceipt');
  const tModes = await getTranslations('modes');

  const supabase = await getServerClient();
  const ctx = await requireAdminOrCreator(supabase, id);
  const gameHref = ctx.isAdmin ? `/admin/games/${id}` : `/games/${id}`;

  // The share link's fields are read fresh with the user's client, as on
  // «Styr spillere» (#2570), so a closed signup never shows a link. The e-mail
  // invitations are those without an account yet; RLS shows the organiser the
  // ones they sent («invitations creator game-invite select») and an admin all.
  // A failed count leaves the e-mail part out rather than claiming 0.
  const [gwp, rowRes, emailRes] = await Promise.all([
    getGameWithPlayers(id),
    supabase
      .from('games')
      .select('status, short_id, registration_mode, signups_closed_at, courses(name)')
      .eq('id', id)
      .maybeSingle<ReceiptRow>(),
    supabase
      .from('invitations')
      .select('id', { count: 'exact', head: true })
      .eq('game_id', id)
      .is('accepted_at', null),
  ]);
  if (rowRes.error) throw rowRes.error;
  if (!gwp || !rowRes.data) notFound();
  const row = rowRes.data;
  const { game } = gwp;

  if (row.status !== 'scheduled' || game.tournament_id != null) {
    redirect({ href: gameHref, locale });
  }

  if (emailRes.error) {
    console.error('[klar] invitations count failed', { gameId: id, error: emailRes.error });
  }
  const emailInvites = emailRes.error ? 0 : (emailRes.count ?? 0);
  const shareUrl = isPubliclyViewable(row) ? signupShareUrl(row.short_id) : null;

  const invitees = receiptInvitees({
    players: gwp.players,
    createdBy: game.created_by,
    publisherId: ctx.userId,
  });
  const kind = receiptLineKind({
    invitees: invitees.length,
    emailInvites,
    hasShareLink: shareUrl != null,
  });

  // «Marte, Jonas, Anders og 2 til», with «3 på e-post» last when there are
  // any. Nobody with a name: «3 spillere».
  function namesList(): string {
    const { names, more } = receiptNameParts(invitees);
    const parts =
      names.length > 0
        ? [...names, ...(more > 0 ? [t('moreNames', { count: more })] : [])]
        : [t('playersCount', { count: more })];
    if (kind === 'names_and_email') parts.push(t('emailCount', { count: emailInvites }));
    return formatListLocale(parts, locale);
  }
  const line =
    kind === 'names' || kind === 'names_and_email'
      ? t('invited', { names: namesList() })
      : kind === 'email_only'
        ? t('emailOnly', { count: emailInvites })
        : kind === 'none_with_link'
          ? t('noneWithLink')
          : t('none');

  const courseName = row.courses?.name ?? null;
  const name = localizeGameName(game.name, courseName, locale);
  const when = invitationWhen(game.scheduled_tee_off_at, locale);
  const formatName = tModes(
    formatDisplayLabelKey(game.game_mode, game.mode_config) as Parameters<typeof tModes>[0],
  );
  const shareText = when
    ? t('shareText', { name, weekday: when.weekday, date: when.date, time: when.time })
    : t('shareTextNoTime', { name });

  return (
    <div data-hides-bottom-nav>
      <AppShell flush showVersion={false}>
        <div className="flex flex-col items-center gap-2 px-5 pt-10 text-center">
          <span
            role="img"
            aria-label={t('checkLabel')}
            className="flex size-14 items-center justify-center rounded-full bg-primary text-[26px] text-white dark:text-bg"
          >
            ✓
          </span>
          <h1 className="font-serif text-[28px] leading-[normal] font-medium text-text">
            {t('title', { name })}
          </h1>
          <p className="font-sans text-[14px] leading-[normal] text-muted" data-testid="receipt-line">
            {line}
          </p>
        </div>
        <div className="px-4">
          <InvitationPreviewCard
            name={name}
            when={when}
            courseName={courseName}
            teeName={game.tee_box?.name ?? null}
            formatName={formatName}
          />
        </div>
        <ReceiptActions
          shareUrl={shareUrl}
          shareText={shareText}
          calendarHref={game.scheduled_tee_off_at ? `/${locale}/games/${id}/calendar` : null}
          gameHref={gameHref}
        />
      </AppShell>
    </div>
  );
}
