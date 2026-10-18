'use client';

import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Kicker } from '@/components/ui/Kicker';
import { formatKr, formatKrAmount } from '@/lib/format/formatKr';
import { buildSettlementText } from '@/lib/format/settlementText';
import type { Settlement } from '@/lib/scoring/settlement';

export interface SettlementPlayerInfo {
  name: string;
  nickname: string | null;
}

/** The six formats that settle in kroner (`SETTLEMENT_FORMATS`, #2221). */
export type SettlementMode =
  | 'skins'
  | 'nassau'
  | 'wolf'
  | 'bingo_bango_bongo'
  | 'acey_deucey'
  | 'nines';

interface SettlementTableProps {
  settlement: Settlement;
  playersById: Map<string, SettlementPlayerInfo>;
  gameName: string;
  mode: SettlementMode;
  /** `games.status === 'finished'`: the final title and the copy button. */
  isFinal: boolean;
}

// Inside an iframe (a club's /embed snippet has no allow="clipboard-write"),
// the browser refuses the clipboard, so the button would only ever fail there.
const noSubscribe = () => () => {};
const isFramed = () => window.self !== window.top;
const notFramedOnServer = () => false;

/** The totals carry no «kr» on the artboard: «+100», «−60», «0». */
function signedAmount(netKr: number): string {
  return `${netKr > 0 ? '+' : ''}${formatKrAmount(netKr)}`;
}

/**
 * Pengeoppgjøret (#937) som kvittering (#2296, artboard «Forslag: oppgjøret
 * som kvittering»): hvem som betaler hvem og sluttsummen per spiller på et
 * papir med sagtannkant. Når spillet er ferdig og noen skal betale, kopierer
 * «Kopier til gruppechatten» oppgjøret som ren tekst (`buildSettlementText`).
 * Rendres av hver format-View og hvert duellkort når `settlement != null`
 * (kr_per_unit > 0), både live og når spillet er ferdig.
 */
export function SettlementTable({
  settlement,
  playersById,
  gameName,
  mode,
  isFinal,
}: SettlementTableProps) {
  const t = useTranslations('leaderboard.common.settlement');
  const tCommon = useTranslations('leaderboard.common');
  const tModes = useTranslations('modes');
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const resetTimer = useRef<number | undefined>(undefined);
  // useId gives «:r1:»-style ids; url(#…) in the sawtooth wants a plain one.
  const baseId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const headingId = `${baseId}-heading`;
  const totalsId = `${baseId}-totals`;
  const toothId = `${baseId}-tooth`;

  useEffect(() => () => window.clearTimeout(resetTimer.current), []);

  const name = (userId: string) => {
    const info = playersById.get(userId);
    return info?.nickname || info?.name || tCommon('unknownPlayerFull');
  };
  const modeName = tModes(mode);
  const stakeLine = t('stakeLine', {
    kr: formatKrAmount(settlement.krPerUnit),
    unit: settlement.unitLabel,
    count: settlement.perPlayer.length,
  });
  const paymentSentence = (from: string, to: string, amount: string) =>
    t('paymentSentence', { from, to, amount });
  const framed = useSyncExternalStore(noSubscribe, isFramed, notFramedOnServer);
  const showCopy = isFinal && settlement.payments.length > 0 && !framed;
  // Fill the grid column by column, so the engine's order (winner first)
  // reads down the left column and on into the right one, as drawn.
  const totalsRows = Math.ceil(settlement.perPlayer.length / 2);

  async function copy() {
    const text = buildSettlementText(settlement, name, {
      heading: t('copyHeading', { game: gameName, mode: modeName }),
      stake: stakeLine,
      payment: paymentSentence,
      totalsHeading: `${t('totalHeading')}:`,
    });
    window.clearTimeout(resetTimer.current);
    // Clear the status first, so a second try (or a second failure) is
    // announced again instead of leaving the same text in place.
    setCopyState('idle');
    try {
      await navigator.clipboard.writeText(text);
      setCopyState('copied');
      resetTimer.current = window.setTimeout(() => setCopyState('idle'), 2000);
    } catch (err) {
      console.error('[SettlementTable] copy failed', err);
      setCopyState('error');
    }
  }

  return (
    <section
      aria-labelledby={headingId}
      className="pt-2 leading-[normal] text-text"
      data-testid="settlement"
    >
      <div className="flex h-11 items-center justify-center px-2">
        <Kicker className="min-w-0 truncate">
          {t('formatKicker', { game: gameName, mode: modeName })}
        </Kicker>
      </div>
      <div className="px-1.5 pt-1">
        <h3 id={headingId} className="font-serif text-[30px] font-medium">
          {isFinal ? t('titleFinal') : t('titleSoFar')}
        </h3>
        <p className="mt-0.5 text-[13px] text-muted">{stakeLine}</p>
      </div>

      {/* The paper. drop-shadow, not box-shadow, so the shadow follows the
          teeth along the bottom edge. */}
      <div className="mx-1.5 mt-4 drop-shadow-[0_10px_24px_rgba(26,46,31,0.12)]">
        <div className="bg-[var(--receipt-paper)] px-[18px] pt-5">
          <p className="text-center text-[10px] font-semibold uppercase tracking-[0.3em] text-muted">
            {t('receiptKicker')}
          </p>
          <p className="mt-1 text-center font-serif text-[18px] font-medium">
            {t('receiptTitle')}
          </p>
          <div className="mt-3.5 mb-1.5 border-t border-dashed border-[var(--receipt-rule)]" />

          {settlement.payments.length === 0 ? (
            <p className="py-2 text-[15px] text-muted">{t('empty')}</p>
          ) : (
            <ul className="list-none">
              {settlement.payments.map((pay, i) => {
                const from = name(pay.fromUserId);
                const to = name(pay.toUserId);
                const amount = formatKr(pay.kr);
                return (
                  <li
                    key={`${pay.fromUserId}-${pay.toUserId}-${i}`}
                    className="relative flex items-baseline justify-between gap-3 py-2 text-[15px]"
                    data-testid={`settlement-payment-${i}`}
                  >
                    <span aria-hidden="true" className="min-w-0">
                      {/* Inter has no «→»: the artboard draws it in system-ui. */}
                      {from} <span className="font-[system-ui] text-[var(--receipt-rule)]">→</span> {to}
                    </span>
                    <span aria-hidden="true" className="shrink-0 font-serif text-[18px] font-semibold">
                      {amount}
                    </span>
                    <span className="sr-only">{paymentSentence(from, to, amount)}</span>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-2 mb-1.5 border-t border-dashed border-[var(--receipt-rule)]" />
          <Kicker id={totalsId} className="pt-1">
            {t('totalHeading')}
          </Kicker>
          <dl
            aria-labelledby={totalsId}
            className="grid grid-flow-col grid-cols-2 gap-x-4 gap-y-1 pt-2 pb-3.5 text-[14px]"
            style={{ gridTemplateRows: `repeat(${totalsRows}, auto)` }}
          >
            {settlement.perPlayer.map((p) => (
              <div
                key={p.userId}
                className="flex justify-between gap-2"
                data-testid={`settlement-player-${p.userId}`}
              >
                <dt className="min-w-0 truncate">{name(p.userId)}</dt>
                <dd
                  className={`font-semibold ${
                    p.netKr > 0
                      ? 'text-[var(--receipt-plus)]'
                      : p.netKr < 0
                        ? 'text-[var(--receipt-minus)]'
                        : 'text-muted'
                  }`}
                >
                  {signedAmount(p.netKr)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        {/* Sagtannkanten: tenner i papirfargen som henger under papiret. */}
        <svg aria-hidden="true" className="block h-2.5 w-full text-[var(--receipt-paper)]">
          <defs>
            <pattern id={toothId} width="16" height="10" patternUnits="userSpaceOnUse">
              <path d="M0 0 H16 V4 L8 10 L0 4 Z" fill="currentColor" />
            </pattern>
          </defs>
          <rect width="100%" height="10" fill={`url(#${toothId})`} />
        </svg>
      </div>

      {showCopy && (
        <div className="flex flex-col gap-2 px-0.5 pt-[22px]">
          {/* `!`: the Button base writes font-medium, tracking-tight and a
              shadow; the artboard's pill is 600, normal tracking, flat. */}
          <Button
            type="button"
            onClick={copy}
            className="h-[52px] w-full text-[15px] leading-[normal] font-semibold! tracking-normal! [box-shadow:none]!"
            data-testid="settlement-copy"
          >
            {copyState === 'copied' ? t('copied') : t('copyButton')}
          </Button>
          {/* The label swap and the error line are silent to screen readers on
              their own; this always-mounted region announces both. */}
          <span role="status" className="sr-only">
            {copyState === 'copied' ? t('copied') : copyState === 'error' ? t('copyFailed') : ''}
          </span>
          {copyState === 'error' && (
            <p aria-hidden="true" className="text-center text-xs leading-[normal] text-danger">
              {t('copyFailed')}
            </p>
          )}
          <p className="text-center text-xs leading-[normal] text-muted">{t('disclaimer')}</p>
        </div>
      )}
    </section>
  );
}
