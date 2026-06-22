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
import { localizeGameName } from '@/lib/games/autoGameName';

/**
 * «Funn turneringer»-seksjon på hjem-siden (#257). Vises kun for non-admin/
 * non-trusted-creator-brukere når det faktisk finnes innhold å vise.
 *
 * Caller (app/page.tsx) henter data via `getDiscoverableGames()` slik at
 * samme query kan styre BÅDE velkomst-teksten over og denne seksjonen —
 * uten å fyre lookup-en to ganger.
 */
/** #879: how many passive funn-kort each list shows in Home-preview mode. */
const PREVIEW_CAP = 3;

export function HomeDiscoverySection({
  data,
  preview = false,
}: {
  data: {
    clubGames: DiscoverableClubGame[];
    openGames: DiscoverableOpenGame[];
    friendGames: DiscoverableFriendGame[];
    pendingRequests: PendingRequest[];
  };
  /**
   * Hjems fylt-tilstand-forhåndsvisning (#879): kapp de passive listene
   * (klubb/venner/åpne) til `PREVIEW_CAP` og legg på en «Se alle»-hale til
   * /finn-turneringer. Egne ventende forespørsler er spillerens egen handling
   * og kappes aldri. Default (false) = fulle lister — brukes av Hjems tom-
   * tilstand og /finn-turneringer-siden.
   */
  preview?: boolean;
}) {
  const t = useTranslations('discover');
  const locale = useLocale() as AppLocale;
  const { pendingRequests } = data;
  const clubGames = preview
    ? data.clubGames.slice(0, PREVIEW_CAP)
    : data.clubGames;
  const friendGames = preview
    ? data.friendGames.slice(0, PREVIEW_CAP)
    : data.friendGames;
  const openGames = preview
    ? data.openGames.slice(0, PREVIEW_CAP)
    : data.openGames;
  // «Se alle»-halen og siste-blokk-spacing kobler på om det fantes NOEN passive
  // funn (før kapping), ikke på om noe ble kuttet.
  const hasPassiveDiscovery =
    data.clubGames.length > 0 ||
    data.friendGames.length > 0 ||
    data.openGames.length > 0;

  return (
    <section className={preview ? 'w-full' : 'mt-10 w-full'}>
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
        <div className={preview && hasPassiveDiscovery ? 'mb-8' : undefined}>
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

      {/* #879: «Se alle»-hale til den fulle funn-siden når Hjem viser en kappet
          forhåndsvisning. Kun når det finnes passive funn å se mer av. */}
      {preview && hasPassiveDiscovery && (
        <SmartLink
          href="/finn-turneringer"
          className="flex min-h-[44px] items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3 transition-colors hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <span className="font-sans text-sm font-medium text-text">
            {t('seeAllTournaments')}
          </span>
          <span aria-hidden className="text-muted">
            →
          </span>
        </SmartLink>
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
            {localizeGameName(game.name, game.course_name, locale)}
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
            {localizeGameName(game.name, game.course_name, locale)}
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
            {localizeGameName(game.name, game.course_name, locale)}
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
