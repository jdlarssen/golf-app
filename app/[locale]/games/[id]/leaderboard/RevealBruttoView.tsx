import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Card } from '@/components/ui/Card';
import { Kicker } from '@/components/ui/Kicker';
import { PullQuote } from '@/components/ui/PullQuote';
import { firstName } from '@/lib/firstName';
import { PreRoundLeaderboardRealtime } from './PreRoundLeaderboard';
import type { TeamLine } from '@/lib/leaderboard';
import { formatTeamVsPar, teamHeadline } from '@/lib/leaderboard/vsPar';

type Props = {
  gameId: string;
  /** Game's tournament name — surfaced as the kicker subtitle. */
  gameName: string;
  /** All teams pre-sorted by rank ascending. Always brutto. */
  teams: TeamLine[];
  /** Distinct hole-numbers that already have at least one score recorded. */
  holesPlayed: number;
  /** Back-link href — typically points back to the originating hole. */
  backHref: string;
  footerSlot?: ReactNode;
  /**
   * #2625: a net-to-par team game (Texas family) leads each row with the
   * team's brutto to par, the number `teams` is ranked on.
   */
  ranking?: 'net_to_par';
};

/**
 * Reveal-active leaderboard view — shows brutto best-ball totals while
 * the underlying ranking (which is netto) stays hidden until the admin
 * avslutter spillet. No medals, no champagne styling, no handicap info
 * anywhere; the climax is reserved for the State4View reveal.
 */
export function RevealBruttoView({
  gameId,
  gameName,
  teams,
  holesPlayed,
  backHref,
  footerSlot,
  ranking,
}: Props) {
  const t = useTranslations('leaderboard');
  return (
    <AppShell>
      <PreRoundLeaderboardRealtime gameId={gameId} />

      <TopBar
        backHref={backHref}
        backLabel={t('common.back')}
        kicker={gameName}
      />

      <section data-testid="reveal-brutto-view" className="px-6 pt-2 pb-3 text-center">
        <Kicker tone="accent">{t('revealBrutto.kicker')}</Kicker>
        <h1 className="mt-2 font-serif text-[24px] font-medium tracking-[-0.015em] leading-tight text-text">
          {t('revealBrutto.heading', { count: holesPlayed })}
        </h1>
        <p className="mt-2 font-sans text-[12px] text-muted">
          {t('revealBrutto.description')}
        </p>
      </section>

      <ul className="flex flex-col gap-2 px-4 pt-2 pb-4 list-none">
        {teams.length === 0 && (
          <li>
            <Card>
              <p className="text-sm text-muted">{t('common.noTeams')}</p>
            </Card>
          </li>
        )}
        {teams.map((line) => (
          <RevealTeamRow key={line.teamNumber} line={line} ranking={ranking} />
        ))}
      </ul>

      <PullQuote className="px-6 pt-2 pb-4">
        {t('revealBrutto.pullquote')}
      </PullQuote>
      {footerSlot}
    </AppShell>
  );
}

/** E / +N / −N relative to par played. Empty when no holes have been played. */
function deltaText(total: number, parPlayed: number, ranking?: 'net_to_par'): string {
  if (parPlayed === 0) return '';
  // #2625: U+2212 in a net-to-par game, the tables' hyphen otherwise.
  return formatTeamVsPar(ranking, total - parPlayed);
}

function RevealTeamRow({ line, ranking }: { line: TeamLine; ranking?: 'net_to_par' }) {
  const t = useTranslations('leaderboard');
  // Per-player brutto sum + par-played across played holes.
  const perPlayerBrutto = new Map<string, number>();
  const perPlayerParPlayed = new Map<string, number>();
  // Team par-played: holes where at least one team-member has a score.
  let teamParPlayed = 0;

  for (const h of line.holes) {
    let teamHasScore = false;
    for (const pc of h.players) {
      if (pc.gross != null) {
        teamHasScore = true;
        perPlayerBrutto.set(
          pc.userId,
          (perPlayerBrutto.get(pc.userId) ?? 0) + pc.gross,
        );
        perPlayerParPlayed.set(
          pc.userId,
          (perPlayerParPlayed.get(pc.userId) ?? 0) + h.par,
        );
      }
    }
    if (teamHasScore) teamParPlayed += h.par;
  }

  // #2625: a net-to-par game leads with the team's to par; «mot par · N brutto» goes under.
  const headline = teamHeadline(ranking, line);
  const toPar = headline.unit === 'toPar';
  const teamDelta = deltaText(line.total, teamParPlayed, ranking);

  return (
    <li className="list-none">
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="font-serif text-[19px] font-medium tracking-tight text-text">
              {t('common.teamLabel', { number: line.teamNumber })}
            </p>
            <ul className="mt-1.5 flex flex-col gap-0.5 list-none">
              {line.players.map((p) => {
                const display = p.nickname?.trim()
                  ? p.nickname
                  : firstName(p.name) ?? p.name;
                const sum = perPlayerBrutto.get(p.userId);
                const parPlayed = perPlayerParPlayed.get(p.userId) ?? 0;
                const delta =
                  sum != null ? deltaText(sum, parPlayed, ranking) : '';
                return (
                  <li
                    key={p.userId}
                    className="flex items-baseline justify-between gap-3 font-sans text-[12.5px] text-muted"
                  >
                    <span className="truncate">{display}</span>
                    <span className="flex items-baseline gap-2 tabular-nums text-[12px] text-muted">
                      <span>{sum != null ? sum : '—'}</span>
                      {delta && (
                        <span className="w-7 text-right">{delta}</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="text-right shrink-0">
            <p className="score-num text-text leading-none text-3xl">
              {headline.text}
            </p>
            {toPar ? (
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] tabular-nums text-muted">
                {/* Two lines, so the column stays as narrow as «−7 brutto» and
                    the players' names keep their room. */}
                <span className="block">{t('common.vsParLabel')}</span>
                <span className="block">{t('common.grossBrutto', { count: line.total })}</span>
              </p>
            ) : (
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                {teamDelta && (
                  <span className="tabular-nums mr-1.5 normal-case">
                    {teamDelta}
                  </span>
                )}
                {t('common.brutto')}
              </p>
            )}
          </div>
        </div>
      </Card>
    </li>
  );
}
