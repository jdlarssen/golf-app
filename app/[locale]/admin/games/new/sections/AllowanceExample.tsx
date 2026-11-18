'use client';

/**
 * AllowanceExample — «Slik blir det på Gul tee» under the share pills in the
 * Handicap sheet (#2455, Nyttspill-forslag-hcp-eksempel): the selected players
 * with the highest and the lowest handicap, and their strokes at the chosen
 * share against 100 %. The numbers come from `allowanceExample`, the same
 * pipeline the game freezes at start.
 *
 * The artboard's kicker is in capitals; the wizard writes its kickers in
 * sentence case (owner, 31.10), so this one is too.
 */

import { useLocale, useTranslations } from 'next-intl';
import type { AppLocale } from '@/i18n/routing';
import type { GameFormState } from '../useGameFormState';
import { allowanceExample, type AllowanceExample as Example } from '@/lib/games/allowanceExample';
import { teeChoiceToDb } from '@/lib/games/teeChoice';
import { formatHcpDisplay } from '@/lib/handicap/signFormat';
import { playerOptionShortName } from './playerLabels';

/** The example for the wizard's current tee, players and share; null = none to show. */
export function useAllowanceExample(state: GameFormState): Example | null {
  const tPlayers = useTranslations('wizard.sections.players');
  const pendingLabel = tPlayers('pendingLabel');
  const tee = state.availableTees.find((t) => t.id === state.teeBoxId) ?? null;
  return allowanceExample({
    players: state.selectedPlayerIds.flatMap((pid) => {
      const p = state.allPlayers.find((x) => x.id === pid);
      if (!p) return [];
      return [
        {
          id: p.id,
          name: playerOptionShortName(p, pendingLabel),
          hcpIndex: p.hcp_index,
          // What the hidden field sends, so the set is the one the start uses.
          gender: teeChoiceToDb(state.teeChoiceFor(p.id)),
        },
      ];
    }),
    tee,
    pct: state.hcpAllowance,
  });
}

export function AllowanceExample({ example }: { example: Example }) {
  const t = useTranslations('wizard.allowanceExample');
  const locale = useLocale() as AppLocale;
  return (
    <div
      data-testid="allowance-example"
      className="flex flex-col gap-1.5 rounded-xl bg-surface-2 px-3 py-2.5 font-sans text-[13px] leading-[normal] text-text"
    >
      <p className="text-xs font-semibold text-muted">{t('heading', { tee: example.teeName })}</p>
      {example.rows.map((r) => (
        <p key={r.playerId} className="flex justify-between gap-3">
          <span className="min-w-0">
            {t('player', { name: r.name, hcp: formatHcpDisplay(r.hcpIndex, locale) })}
          </span>{' '}
          <span className="shrink-0 whitespace-nowrap tabular-nums">
            <b className="font-semibold">{t('strokes', { count: r.strokes })}</b>
            {/* «19 slag i stedet for 19» says nothing, so the part after the
                strokes shows only when the share moves them (never at 100 %). */}
            {r.strokes !== r.strokesAtFull && (
              <>
                {' '}
                <span className="text-muted">{t('insteadOf', { count: r.strokesAtFull })}</span>
              </>
            )}
          </span>
        </p>
      ))}
    </div>
  );
}
