import { LinkButton } from '@/components/ui/Button';
import { SmartLink } from '@/components/ui/SmartLink';
import { formatTeeOffDate, formatTeeOffTime } from '@/lib/format/teeOff';
import type {
  DiscoverableClubGame,
  DiscoverableFriendGame,
  DiscoverableOpenGame,
  PendingRequest,
} from '@/lib/games/getDiscoverableGames';

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
  const { clubGames, openGames, friendGames, pendingRequests } = data;

  return (
    <section className="mt-10 w-full">
      {clubGames.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
            I dine klubber
          </h2>
          <ul className="flex list-none flex-col gap-3 p-0">
            {clubGames.map((game) => (
              <li key={game.id}>
                <ClubGameCard game={game} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {friendGames.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
            Fra vennene dine
          </h2>
          <ul className="flex list-none flex-col gap-3 p-0">
            {friendGames.map((game) => (
              <li key={game.id}>
                <FriendGameCard game={game} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {openGames.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
            Åpne turneringer
          </h2>
          <ul className="flex list-none flex-col gap-3 p-0">
            {openGames.map((game) => (
              <li key={game.id}>
                <OpenGameCard game={game} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {pendingRequests.length > 0 && (
        <div>
          <h2 className="mb-3 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
            Mine forespørsler
          </h2>
          <ul className="flex list-none flex-col gap-3 p-0">
            {pendingRequests.map((request) => (
              <li key={request.id}>
                <PendingRequestCard request={request} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function ClubGameCard({ game }: { game: DiscoverableClubGame }) {
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
            {game.course_name ?? 'Bane ikke valgt'}
            {teeOff && (
              <>
                {' · '}
                <span className="tabular-nums">
                  {formatTeeOffDate(teeOff)} kl. {formatTeeOffTime(teeOff)}
                </span>
              </>
            )}
          </p>
        </div>
      </div>
      <div className="mt-3.5">
        <LinkButton href={`/signup/${game.short_id}`} full>
          Meld meg på
        </LinkButton>
      </div>
    </div>
  );
}

function FriendGameCard({ game }: { game: DiscoverableFriendGame }) {
  const teeOff = game.scheduled_tee_off_at
    ? new Date(game.scheduled_tee_off_at)
    : null;
  const cta =
    game.joinMode === 'direct' ? 'Meld meg på' : 'Be om å bli med';

  return (
    <div className="rounded-2xl border border-border bg-surface px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-serif text-[17px] leading-tight text-text">
            {game.name}
          </p>
          <p className="mt-1 font-sans text-[12px] text-muted">
            {game.course_name ?? 'Bane ikke valgt'}
            {teeOff && (
              <>
                {' · '}
                <span className="tabular-nums">
                  {formatTeeOffDate(teeOff)} kl. {formatTeeOffTime(teeOff)}
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

function OpenGameCard({ game }: { game: DiscoverableOpenGame }) {
  const teeOff = game.scheduled_tee_off_at
    ? new Date(game.scheduled_tee_off_at)
    : null;
  // Påmeldingsmåten ER synligheten (#357): open lar deg melde deg på direkte,
  // manual_approval krever at arrangøren godkjenner forespørselen din.
  const cta =
    game.registration_mode === 'manual_approval'
      ? 'Be om å bli med'
      : 'Meld meg på';

  return (
    <div className="rounded-2xl border border-border bg-surface px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-serif text-[17px] leading-tight text-text">
            {game.name}
          </p>
          <p className="mt-1 font-sans text-[12px] text-muted">
            {game.course_name ?? 'Bane ikke valgt'}
            {teeOff && (
              <>
                {' · '}
                <span className="tabular-nums">
                  {formatTeeOffDate(teeOff)} kl. {formatTeeOffTime(teeOff)}
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
}: {
  request: {
    short_id: string;
    game_name: string;
    team_name: string | null;
    is_team_captain: boolean;
  };
}) {
  const target = request.team_name
    ? `/signup/${request.short_id}/team`
    : `/signup/${request.short_id}`;

  const subtitle = request.team_name
    ? request.is_team_captain
      ? `Lag «${request.team_name}» (kaptein) — venter på godkjenning`
      : `Lag «${request.team_name}» — venter på godkjenning`
    : 'Venter på godkjenning';

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
