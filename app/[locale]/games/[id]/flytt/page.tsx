import { first } from '@/lib/url/searchParams';
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrCreator } from '@/lib/admin/auth';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Banner } from '@/components/ui/Banner';
import { localizeGameName } from '@/lib/games/autoGameName';
import { loadGameMovedRecipients, type GameMovedRecipient } from '@/lib/notifications/notifyGameMoved';
import { intlLocaleTag } from '@/lib/i18n/format';
import type { AppLocale } from '@/i18n/routing';
import type { GameStatus } from '@/lib/games/status';
import { moveGameAction } from './actions';
import { MoveGameForm } from './MoveGameForm';

/**
 * «Flytt runden» (#2480): a scheduled round gets a new day and time, and the
 * group can be told in the same tap. Gated on `requireAdminOrCreator`, so the
 * organiser and an admin use the same page (one door per room); the
 * Sekretariat links here too. A round that is not scheduled has nothing to
 * move, and the page sends you back to it.
 *
 * The names under «Si fra til gjengen» come from the same rule the send uses
 * (`loadGameMovedRecipients`), so the page never promises anyone else. The
 * page draws its own chrome with the button pinned to the bottom, as the
 * artboard does, so the bottom nav hides here (`data-hides-bottom-nav`).
 */

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ error?: string | string[] }>;

const ERROR_CODES = new Set(['invalid', 'in_past']);

type GameRow = {
  id: string;
  name: string;
  status: GameStatus;
  scheduled_tee_off_at: string | null;
  courses: { name: string } | null;
};

/** «Marte, Jonas og Anders», or «Marte, Jonas og 4 til» past three. */
function namesLine(
  recipients: GameMovedRecipient[],
  locale: AppLocale,
  more: (count: number) => string,
): string {
  const names = recipients.map((r) => r.shortName).filter((n): n is string => n != null);
  const parts =
    names.length === recipients.length && names.length <= 3
      ? names
      : [...names.slice(0, 2), more(recipients.length - Math.min(names.length, 2))];
  return new Intl.ListFormat(intlLocaleTag(locale), { type: 'conjunction' }).format(parts);
}

export default async function MoveGamePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const locale = await getLocale();
  const t = await getTranslations('game.move');
  const tStatus = await getTranslations('gameStatus');

  const supabase = await getServerClient();
  const ctx = await requireAdminOrCreator(supabase, id);

  const { data: game, error } = await supabase
    .from('games')
    .select('id, name, status, scheduled_tee_off_at, courses(name)')
    .eq('id', id)
    .maybeSingle<GameRow>();
  if (error) throw error;
  if (!game) notFound();
  if (game.status !== 'scheduled' || !game.scheduled_tee_off_at) {
    redirect({ href: `/games/${id}`, locale });
  }
  const teeOffIso = game.scheduled_tee_off_at!;

  const loaded = await loadGameMovedRecipients({ gameId: id, actorUserId: ctx.userId });
  const recipients = loaded?.recipients ?? [];
  const title = localizeGameName(game.name, game.courses?.name ?? null, locale);

  const errorCode = first(sp.error);
  const errorMessage =
    errorCode && ERROR_CODES.has(errorCode)
      ? t(`errors.${errorCode}` as Parameters<typeof t>[0])
      : undefined;

  return (
    <div data-hides-bottom-nav>
      <AppShell showVersion={false}>
        <TopBar
          backHref={ctx.isAdmin ? `/admin/games/${id}` : `/games/${id}`}
          kicker={t('kicker', { name: title, status: tStatus('scheduled') })}
        />
        <h1 className="-mt-2.5 font-serif text-[26px] font-medium leading-[1.15] text-text">
          {t('heading')}
        </h1>
        {errorMessage && (
          <div className="mt-4">
            <Banner tone="error" testId="move-error">
              {errorMessage}
            </Banner>
          </div>
        )}
        <MoveGameForm
          action={moveGameAction.bind(null, id)}
          gameName={title}
          teeOffIso={teeOffIso}
          namesLine={
            recipients.length > 0
              ? t('notifyNames', {
                  names: namesLine(recipients, locale, (count) => t('moreNames', { count })),
                })
              : null
          }
        />
      </AppShell>
    </div>
  );
}
