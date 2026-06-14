import { useTranslations } from 'next-intl';
import {
  SideTournamentView,
  type SideTournamentTeam,
} from './SideTournamentView';
import type { SideTournamentResult } from '@/lib/scoring/sideTournament';
import type { SideCategoryId } from '@/lib/scoring/sideTournamentConfig';

/**
 * Props = nøyaktig det `computeSideTournament` returnerer. Seksjonen viser de
 * samme dataene som sideturnering-fanen gjør for poeng-/podium-formater, men
 * pakket kompakt under matchplay-duellkortet (#585): de admin-kårede
 * LD/CTP-vinnerne er synlige med en gang, og hele poenggrunnlaget
 * (`SideTournamentView` med per-side-standings + alle kategorier) ligger bak en
 * `<details>`-disclosure. Server-komponent — `<details>` er native HTML, så
 * ingen klient-JS trengs.
 */
export interface MatchplaySideTournamentSectionProps {
  teams: SideTournamentTeam[];
  result: SideTournamentResult;
  ldCount: number;
  ctpCount: number;
  sideWinners: Array<{
    category: 'longest_drive' | 'closest_to_pin';
    position: number;
    winnerUserId: string | null;
  }>;
  coursePars: number[];
  disabledCategories: SideCategoryId[];
}

export function MatchplaySideTournamentSection(
  props: MatchplaySideTournamentSectionProps,
) {
  const { teams, ldCount, ctpCount, sideWinners } = props;
  const t = useTranslations('leaderboard.matchplaySide');

  // Fornavn-oppslag fra lag-medlemmene (de to sidene). Brukes til de minimale
  // LD/CTP-linjene; `SideTournamentView` gjør sitt eget oppslag på expand.
  const firstNameById = new Map<string, string>();
  for (const team of teams) {
    for (const m of team.members) firstNameById.set(m.userId, m.firstName);
  }

  // Minimal headline: én linje per admin-kåret LD/CTP-slot, slot-nummer for
  // konsistens med poenggrunnlaget (som også viser «#1»). Slots uten en kåret
  // vinner hoppes stille over.
  const headlineLines: Array<{ key: string; text: string }> = [];
  for (let pos = 1; pos <= ldCount; pos++) {
    const w = sideWinners.find(
      (sw) => sw.category === 'longest_drive' && sw.position === pos,
    );
    if (!w?.winnerUserId) continue;
    headlineLines.push({
      key: `ld-${pos}`,
      text: t('longestDrive', {
        pos,
        name: firstNameById.get(w.winnerUserId) ?? '?',
      }),
    });
  }
  for (let pos = 1; pos <= ctpCount; pos++) {
    const w = sideWinners.find(
      (sw) => sw.category === 'closest_to_pin' && sw.position === pos,
    );
    if (!w?.winnerUserId) continue;
    headlineLines.push({
      key: `ctp-${pos}`,
      text: t('closestToPin', {
        pos,
        name: firstNameById.get(w.winnerUserId) ?? '?',
      }),
    });
  }

  return (
    <section className="px-3.5 pt-3 pb-1" data-testid="matchplay-side-tournament">
      <div className="rounded-2xl border border-border bg-surface px-4 py-3">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
          {t('heading')}
        </h2>

        {headlineLines.length > 0 && (
          <ul className="mt-1.5 space-y-0.5 font-serif text-[15px] text-text">
            {headlineLines.map((line) => (
              <li key={line.key}>{line.text}</li>
            ))}
          </ul>
        )}

        <details className="group mt-2.5 border-t border-border pt-2.5">
          <summary className="flex min-h-[44px] cursor-pointer items-center gap-2 font-sans text-sm text-text [&::-webkit-details-marker]:hidden">
            <span aria-hidden className="text-muted">
              ⓘ
            </span>
            <span className="flex-1">{t('showBasis')}</span>
            <span
              aria-hidden
              className="text-muted transition-transform group-open:rotate-180"
            >
              ▾
            </span>
          </summary>
          <div className="pt-3">
            <SideTournamentView {...props} />
          </div>
        </details>
      </div>
    </section>
  );
}
