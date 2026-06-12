import { useLocale, useTranslations } from 'next-intl';
import { LinkButton } from '@/components/ui/Button';
import { SmartLink } from '@/components/ui/SmartLink';
import {
  formatTeeOffDateLocale,
  formatTeeOffTimeLocale,
} from '@/lib/i18n/format';
import type {
  DiscoverableClubGame,
  DiscoverableFriendGame,
  DiscoverableOpenGame,
  PendingRequest,
} from '@/lib/games/getDiscoverableGames';
import type { AppLocale } from '@/i18n/routing';

/**
 * «Funn turneringer»-seksjon på hjem-siden (#257). Vises kun for non-admin/
 * non-trusted-creator-brukere når det faktisk finnes innhold å vise.
 *
 * Caller (app/page.tsx) henter data via `getDiscoverableGames()` slik at
 * samme query kan styre BÅDE velkomst-teksten over og denne seksjonen —
 * uten å fyre lookup-en to ganger.
 */
export function HomeDiscoverySection({
  data,
}: {
  data: {
    clubGames: DiscoverableClubGame[];
    openGames: DiscoverableOpenGame[];
    friendGames: DiscoverableFriendGame[];
    pendingRequests: PendingRequest[];
  };
}) {
  const t = useTranslations('discover');
  const locale = useLocale() as AppLocale;
  const { clubGames, openGames, friendGames, pendingRequests } = data;

  return (
    <section className="mt-10 w-full">
      {clubGames.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
            {t('inYourClubs')}
          </h2>
          <ul className="flex list-none flex-col gap-3 p-0">
            {clubGames.map((game) => (
              <li key={game.id}>
                <ClubGameCard game={game} t={t} locale={locale} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {friendGames.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
            {t('fromYourFriends')}
          </h2>
          <ul className="flex list-none flex-col gap-3 p-0">
            {friendGames.map((game) => (
              <li key={game.id}>
                <FriendGameCard game={game} t={t} locale={locale} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {openGames.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
            {t('openTournaments')}
          </h2>
          <ul className="flex list-none flex-col gap-3 p-0">
            {openGames.map((game) => (
              <li key={game.id}>
                <OpenGameCard game={game} t={t} locale={locale} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {pendingRequests.length > 0 && (
        <div>
          <h2 className="mb-3 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
            {t('myRequests')}
          </h2>
          <ul className="flex list-none flex-col gap-3 p-0">
            {pendingRequests.map((request) => (
              <li key={request.id}>
                <PendingRequestCard request={request} t={t} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

type T = ReturnType<typeof useTranslations<'discover'>>;

function formatTeeOffLine(
  teeOff: Date,
  locale: AppLocale,
  t: T,
): string {
  const date = formatTeeOffDateLocale(teeOff, locale);
  const time = formatTeeOffTimeLocale(teeOff, locale);
  return t('teeOffLine', { date, time });
}

function ClubGameCard({
  game,
  t,
  locale,
}: {
  game: DiscoverableClubGame;
  t: T;
  locale: AppLocale;
}) {
  const teeOff = game.scheduled_tee_off_at
    ? new Date(game.scheduled_tee_off_at)
    : null;
  // Klubb-medlem kan melde seg på direkte uansett påmeldingsmåte (#442) —
  // medlemskap ER invitasjonen. Signup-siden kjenner igjen medlemskapet og
  // viser direkte-påmelding.
  return (
    <div className="rounded-2xl border border-border bg-surface px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-serif text-[17px] leading-tight text-text">
            {game.name}
          </p>
          <p className="mt-1 font-sans text-[12px] text-muted">
            <span className="text-primary">{game.group_name}</span>
            {' · '}
            {game.course_name ?? t('courseNotSet')}
            {teeOff && (
              <>
                {' · '}
                <span className="tabular-nums">
                  {formatTeeOffLine(teeOff, locale, t)}
                </span>
              </>
            )}
          </p>
        </div>
      </div>
      <div className="mt-3.5">
        <LinkButton href={`/signup/${game.short_id}`} full>
          {t('signMeUp')}
        </LinkButton>
      </div>
    </div>
  );
}

function FriendGameCard({
  game,
  t,
  locale,
}: {
  game: DiscoverableFriendGame;
  t: T;
  locale: AppLocale;
}) {
  const teeOff = game.scheduled_tee_off_at
    ? new Date(game.scheduled_tee_off_at)
    : null;
  const cta =
    game.joinMode === 'direct' ? t('signMeUp') : t('requestToJoin');

  return (
    <div className="rounded-2xl border border-border bg-surface px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-serif text-[17px] leading-tight text-text">
            {game.name}
          </p>
          <p className="mt-1 font-sans text-[12px] text-muted">
            {game.course_name ?? t('courseNotSet')}
            {teeOff && (
              <>
                {' · '}
                <span className="tabular-nums">
                  {formatTeeOffLine(teeOff, locale, t)}
                </span>
              </>
            )}
          </p>
        </div>
      </div>
      <div className="mt-3.5">
        <LinkButton href={`/signup/${game.short_id}`} full>
          {cta}
        </LinkButton>
      </div>
    </div>
  );
}

function OpenGameCard({
  game,
  t,
  locale,
}: {
  game: DiscoverableOpenGame;
  t: T;
  locale: AppLocale;
}) {
  const teeOff = game.scheduled_tee_off_at
    ? new Date(game.scheduled_tee_off_at)
    : null;
  // Påmeldingsmåten ER synligheten (#357): open lar deg melde seg på direkte,
  // manual_approval krever at arrangøren godkjenner forespørselen din.
  const cta =
    game.registration_mode === 'manual_approval'
      ? t('requestToJoin')
      : t('signMeUp');

  return (
    <div className="rounded-2xl border border-border bg-surface px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-serif text-[17px] leading-tight text-text">
            {game.name}
          </p>
          <p className="mt-1 font-sans text-[12px] text-muted">
            {game.course_name ?? t('courseNotSet')}
            {teeOff && (
              <>
                {' · '}
                <span className="tabular-nums">
                  {formatTeeOffLine(teeOff, locale, t)}
                </span>
              </>
            )}
          </p>
        </div>
      </div>
      <div className="mt-3.5">
        <LinkButton href={`/signup/${game.short_id}`} full>
          {cta}
        </LinkButton>
      </div>
    </div>
  );
}

function PendingRequestCard({
  request,
  t,
}: {
  request: {
    short_id: string;
    game_name: string;
    team_name: string | null;
    is_team_captain: boolean;
  };
  t: T;
}) {
  const target = request.team_name
    ? `/signup/${request.short_id}/team`
    : `/signup/${request.short_id}`;

  const subtitle = request.team_name
    ? request.is_team_captain
      ? t('pendingApprovalCaptain', { teamName: request.team_name })
      : t('pendingApprovalMember', { teamName: request.team_name })
    : t('pendingApproval');

  return (
    <SmartLink
      href={target}
      className="block rounded-2xl border border-border bg-surface-2/40 px-4 py-3.5 transition-colors hover:bg-surface-2"
    >
      <p className="truncate font-serif text-[17px] leading-tight text-text">
        {request.game_name}
      </p>
      <p className="mt-1 font-sans text-[12px] text-muted">{subtitle}</p>
    </SmartLink>
  );
}
