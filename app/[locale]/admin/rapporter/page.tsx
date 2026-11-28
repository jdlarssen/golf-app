import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { getRoleContext } from '@/lib/admin/auth';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { LinkButton } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import { Input } from '@/components/ui/Input';
import { Link } from '@/i18n/navigation';
import { first } from '@/lib/url/searchParams';
import { formatHHMMOslo, formatShortOsloDayMonthLocale } from '@/lib/i18n/format';
import { playerName } from '@/lib/names/playerName';
import { GAME_NAME_MAX } from '@/lib/moderation/textLimits';
import type { ReportReason } from '@/lib/moderation/reportInput';
import type { Json } from '@/lib/database.types';
import type { AppLocale } from '@/i18n/routing';
import { clearReportedPrizes, markReportHandled, renameReportedGame } from './actions';

// #3019: what the players have reported (Apple guideline 1.2). The owner
// promised to look at every report within 24 hours; open reports also show
// under «Trenger deg» on the admin front page until they are handled.
// Layout: the fase-1 drawing «Admin-16-rapporter» (row 159400 on the canvas).

type SearchParams = Promise<{ error?: string | string[]; notice?: string | string[] }>;

type Person = { id?: string; name: string | null; nickname: string | null } | null;

type ReportRow = {
  id: string;
  reason: ReportReason;
  note: string | null;
  created_at: string;
  handled_at: string | null;
  target_user_id: string | null;
  target_game_id: string | null;
  reporter: Person;
  target_user: Person;
  game: { id: string; name: string; prizes: Json } | null;
};

const ERROR_CODES = new Set(['invalid', 'not_found', 'blocked_word', 'text_too_long', 'db']);
const NOTICE_CODES = new Set(['renamed', 'prizes_cleared', 'handled']);

/** The prize words a report can be about: each description and sponsor. */
function prizeTexts(prizes: Json): string[] {
  if (!Array.isArray(prizes)) return [];
  return prizes.flatMap((p) => {
    const prize = (p ?? {}) as { description?: unknown; sponsor?: unknown };
    return [prize.description, prize.sponsor].filter(
      (v): v is string => typeof v === 'string' && v.trim().length > 0,
    );
  });
}

export default async function AdminReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = await getServerClient();
  const { isAdmin } = await getRoleContext(supabase);
  if (!isAdmin) notFound();

  const locale = (await getLocale()) as AppLocale;
  const t = await getTranslations('adminRapporter');
  const params = await searchParams;
  const rawError = first(params.error);
  const rawNotice = first(params.notice);
  const errorMessage =
    rawError && ERROR_CODES.has(rawError) ? t(`errors.${rawError}` as Parameters<typeof t>[0]) : null;
  const noticeMessage =
    rawNotice && NOTICE_CODES.has(rawNotice) ? t(`notices.${rawNotice}` as Parameters<typeof t>[0]) : null;

  // Admins read every report (RLS «content_reports admin select», 0259).
  const select =
    'id, reason, note, created_at, handled_at, target_user_id, target_game_id, ' +
    'reporter:users!content_reports_reporter_id_fkey(name, nickname), ' +
    'target_user:users!content_reports_target_user_id_fkey(id, name, nickname), ' +
    'game:games!content_reports_target_game_id_fkey(id, name, prizes)';
  const [openRes, handledRes] = await Promise.all([
    supabase
      .from('content_reports')
      .select(select)
      .is('handled_at', null)
      .order('created_at', { ascending: true })
      .returns<ReportRow[]>(),
    supabase
      .from('content_reports')
      .select(select)
      .not('handled_at', 'is', null)
      .order('handled_at', { ascending: false })
      .limit(20)
      .returns<ReportRow[]>(),
  ]);
  // A failed read must not look like «no reports»: the boundary shows it.
  if (openRes.error) throw new Error(`admin/rapporter open: ${openRes.error.message}`);
  if (handledRes.error) throw new Error(`admin/rapporter handled: ${handledRes.error.message}`);
  const open = openRes.data ?? [];
  const handled = handledRes.data ?? [];

  const when = (iso: string) =>
    `${formatShortOsloDayMonthLocale(iso, locale)} ${locale === 'no' ? 'kl.' : 'at'} ${formatHHMMOslo(iso)}`;

  const targetTitle = (row: ReportRow) =>
    row.target_game_id ? row.game?.name ?? t('goneTarget') : playerName(row.target_user) ?? t('goneTarget');

  const targetHref = (row: ReportRow) =>
    row.target_game_id
      ? row.game
        ? `/admin/games/${row.game.id}`
        : null
      : row.target_user_id
        ? `/admin/spillere/${row.target_user_id}`
        : null;

  return (
    <AdminShell>
      <TopBar backHref="/admin" backLabel={t('backLabel')} />
      <PageHeader title={t('pageTitle')} subtitle={t('pageSubtitle')} />

      {errorMessage && (
        <div className="mb-4">
          <Banner tone="error">{errorMessage}</Banner>
        </div>
      )}
      {noticeMessage && (
        <div className="mb-4">
          <Banner tone="success">{noticeMessage}</Banner>
        </div>
      )}

      <h2 className="mb-2 font-sans text-xs font-semibold text-muted">
        {t('openHeading', { count: open.length })}
      </h2>
      {open.length === 0 ? (
        <Card>
          <p className="text-sm text-muted" data-testid="reports-empty">
            {t('empty')}
          </p>
        </Card>
      ) : (
        <ul className="space-y-3" data-testid="reports-open">
          {open.map((row) => {
            const href = targetHref(row);
            const title = targetTitle(row);
            const prizes = row.game ? prizeTexts(row.game.prizes) : [];
            return (
              <li key={row.id}>
                <Card>
                  <div className="space-y-2.5" data-testid="report-card">
                    <div className="flex flex-wrap gap-1.5">
                      <span className="inline-flex h-6 items-center rounded-full border border-border px-2.5 font-sans text-xs font-semibold text-muted">
                        {row.target_game_id ? t('kindGame') : t('kindUser')}
                      </span>
                      <span className="inline-flex h-6 items-center rounded-full bg-danger/[0.08] px-2.5 font-sans text-xs font-semibold text-danger">
                        {t(`reason.${row.reason}`)}
                      </span>
                    </div>
                    {href ? (
                      <Link href={href} className="block font-sans text-[17px] font-semibold text-primary underline">
                        {title}
                      </Link>
                    ) : (
                      <p className="font-sans text-[17px] font-semibold text-muted">{title}</p>
                    )}
                    <div className="space-y-0.5 font-sans text-[13px] text-muted">
                      {row.game && row.target_game_id && prizes.length === 0 && (
                        <p>{t('shownGameName', { text: row.game.name })}</p>
                      )}
                      {prizes.map((text, i) => (
                        <p key={i}>{t('shownPrize', { text })}</p>
                      ))}
                      {row.target_user && (
                        <>
                          {!row.target_user.nickname && row.target_user.name && (
                            <p>{t('shownName', { text: row.target_user.name })}</p>
                          )}
                          {row.target_user.nickname && (
                            <p>{t('shownNickname', { text: row.target_user.nickname })}</p>
                          )}
                        </>
                      )}
                    </div>
                    {row.note && (
                      <p className="whitespace-pre-wrap font-sans text-sm text-text">«{row.note}»</p>
                    )}
                    <p className="font-sans text-xs text-muted">
                      {t('from', {
                        name: playerName(row.reporter) ?? t('unknownReporter'),
                        when: when(row.created_at),
                      })}
                    </p>

                    <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                      {row.game && (
                        <details className="w-full">
                          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-full border border-primary px-4 font-sans text-sm font-semibold text-primary">
                            {t('renameGame')}
                          </summary>
                          <form action={renameReportedGame} className="mt-3 space-y-3">
                            <input type="hidden" name="reportId" value={row.id} />
                            <input type="hidden" name="gameId" value={row.game.id} />
                            <Input
                              id={`name-${row.id}`}
                              name="name"
                              label={t('newNameLabel')}
                              defaultValue={row.game.name}
                              maxLength={GAME_NAME_MAX}
                              required
                            />
                            <SubmitButton variant="secondary" className="text-sm" pendingLabel={t('saving')}>
                              {t('saveName')}
                            </SubmitButton>
                          </form>
                        </details>
                      )}
                      {row.game && prizes.length > 0 && (
                        <form action={clearReportedPrizes}>
                          <input type="hidden" name="reportId" value={row.id} />
                          <input type="hidden" name="gameId" value={row.game.id} />
                          <SubmitButton variant="secondary" className="text-sm" pendingLabel={t('saving')}>
                            {t('clearPrizes')}
                          </SubmitButton>
                        </form>
                      )}
                      {row.target_user_id && (
                        <LinkButton variant="secondary" className="text-sm" href={`/admin/spillere/${row.target_user_id}`}>
                          {t('openPlayer')}
                        </LinkButton>
                      )}
                      <form action={markReportHandled}>
                        <input type="hidden" name="reportId" value={row.id} />
                        <SubmitButton className="text-sm" pendingLabel={t('saving')}>
                          {t('markHandled')}
                        </SubmitButton>
                      </form>
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <h2 className="mb-2 mt-8 font-sans text-xs font-semibold text-muted">
        {t('handledHeading', { count: handled.length })}
      </h2>
      {handled.length > 0 && (
        <Card>
          <ul className="divide-y divide-border" data-testid="reports-handled">
            {handled.map((row) => (
              <li key={row.id} className="py-2.5 first:pt-0 last:pb-0">
                <p className="font-sans text-sm font-semibold text-text">{targetTitle(row)}</p>
                <p className="font-sans text-xs text-muted">
                  {t(`reason.${row.reason}`)} · {t('handledAt', { when: when(row.handled_at!) })}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </AdminShell>
  );
}
