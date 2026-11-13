import type { JSX, ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Kicker } from '@/components/ui/Kicker';
import { PullQuote } from '@/components/ui/PullQuote';
import { LeaderboardShell, LeaderboardHeader } from './LeaderboardChrome';
import { LeaderboardFooter } from './LeaderboardFooter';
import { formatRevealName } from '@/lib/names/formatRevealName';
import { skinsPotNow } from '@/lib/leaderboard/skinsPot';
import { SettlementTable } from './SettlementTable';
import { SkinsPotHero } from './SkinsPotHero';
import { SkinsCoinGrid } from './SkinsCoinGrid';
import type { Settlement } from '@/lib/scoring/settlement';
import type { SkinsResult } from '@/lib/scoring/modes/types';

/**
 * Spillerinfo for SkinsView. En map fra userId → navn + kallenavn.
 * Caller (leaderboard-page) bygger map-en fra game_players-joinen og
 * sender den inn slik at view-en kan rendre menneske-lesbare navn der
 * scoring-laget kun har userId-er.
 */
export interface SkinsPlayerInfo {
  name: string;
  nickname: string | null;
}

export interface SkinsViewProps {
  /** Spill-id — brukes til (fremtidig) drilldown og analytics. */
  gameId: string;
  /** Turneringsnavn — vises som kicker i header. */
  gameName: string;
  /**
   * Resultat fra `lib/scoring/modes/skins.compute()`.
   * Caller må narrowe på `kind === 'skins'` før propen sendes inn.
   */
  result: SkinsResult;
  /** Spillerinfo per userId for å rendre navn + kallenavn. */
  playersById: Map<string, SkinsPlayerInfo>;
  /**
   * Score-visibility-flagget fra `games.score_visibility`. Når `'reveal'`
   * og spillet ikke er ferdig, skjuler vi totaler og per-hull-skinsoversikt —
   * kun en venterom-melding vises. Når spillet er ferdig konvergerer begge
   * modus på full visning.
   */
  scoreVisibility: 'live' | 'reveal';
  /** `games.status` — styrer reveal-flow sammen med `scoreVisibility`. */
  gameStatus: 'draft' | 'scheduled' | 'active' | 'finished';
  /** Antall hull fullført av den ledende spilleren (#638). Brukes i sub-tittel. */
  holesPlayed: number;
  /** Hvor pilen tilbake skal peke. Defaults til spillets hjem. */
  backHref?: string;
  /**
   * Når true, dropper outer Shell + Header — caller eier ytre page-chrome.
   * Brukes inne i LeaderboardTabs eller når en parent (podium) wrapper.
   */
  chromeless?: boolean;
  /** Pengeoppgjør (#937) — null hvis kr_per_unit ikke er satt eller ≤ 0. */
  settlement?: Settlement | null;
  /**
   * Valgfri hale-seksjon rendret ETTER hovedinnholdet, men INNI shell-en
   * (#386/#1008-mønster). Kun rendret i hoved-visningen (finished + fylte
   * data) — tomme/reveal-hidden-grenene har ingen leaderboard å knytte
   * referatet til.
   */
  footerSlot?: ReactNode;
  /**
   * Seeren (#2317): egen rad i stillingen heter «Deg», som på tegningen og
   * lagtavla (`leaderboard.teamBoard.you`). Tom på spectate og embed.
   */
  viewerUserId?: string;
}

/**
 * Live/post-finished leaderboard for Skins med carryover (skinspotten, #2317):
 *
 *   - Toppkortet (`SkinsPotHero`) mens runden pågår: hvor mange skins som står
 *     på spill og på hvilket hull, hvorfor potten har vokst, og om hullet
 *     venter på resten av slagene. Ferdig spill beholder tittelen og har
 *     pallen over seg i stedet.
 *   - «Hull for hull» (`SkinsCoinGrid`): én mynt per hull med vinnerens
 *     initialer, delte hull, potten som ble vunnet og hullet potten står på.
 *   - «Stillingen»: navn, hull vunnet og skins, sortert på rank.
 *   - Henger-skins-linje: når spillet er ferdig og `carriedPot > 0`, vises
 *     en eksplisitt linje om at disse skinsene er uvunne (standard Skins-regel).
 *     Dekker også tidlig-avsluttede spill med gap etter et delt hull (#303).
 *   - Oppgjøret (#937/#2296) under, med «Se oppgjøret ↓» som hopp dit.
 *
 * Reveal-modus (scoreVisibility='reveal' && status='active'): vi rendrer
 * en venterom-melding i stedet for tall — Skins er et penge-orientert spill
 * (potten gjøres opp eksternt), og det er hyggeligere å holde resultatene
 * under lokk til admin avslutter. Når spillet er ferdig (status='finished')
 * faller vi tilbake til full visning.
 */
export function SkinsView({
  gameId: _gameId,
  gameName,
  result,
  playersById,
  scoreVisibility,
  gameStatus,
  holesPlayed,
  backHref = '/',
  chromeless = false,
  settlement,
  footerSlot,
  viewerUserId = '',
}: SkinsViewProps): JSX.Element {
  const t = useTranslations('leaderboard');
  const tc = useTranslations('leaderboard.common');

  const isRevealHidden =
    scoreVisibility === 'reveal' && gameStatus !== 'finished';

  if (result.players.length === 0) {
    return (
      <LeaderboardShell chromeless={chromeless}>
        {!chromeless && (
          <LeaderboardHeader gameName={gameName} backHref={backHref} />
        )}
        <p className="mt-12 text-center text-sm text-muted">
          {tc('noPlayersToShow')}
        </p>
      </LeaderboardShell>
    );
  }

  if (isRevealHidden) {
    return (
      <LeaderboardShell chromeless={chromeless}>
        {!chromeless && (
          <LeaderboardHeader gameName={gameName} backHref={backHref} />
        )}
        <div
          data-testid="skins-reveal-hidden"
          className="mx-4 mt-12 rounded-2xl border border-dashed border-border bg-surface px-5 py-8 text-center"
        >
          <p className="font-serif text-[18px] font-medium text-text">
            {tc('revealHiddenTitle')}
          </p>
          <p className="mt-2 font-sans text-xs text-muted">
            {t('skins.revealHiddenSub')}
          </p>
        </div>
        <PullQuote className="px-6 pt-4 pb-4">{tc('goodLuck')}</PullQuote>
      </LeaderboardShell>
    );
  }

  const isFinished = gameStatus === 'finished';
  const pot = skinsPotNow(result.holes, result.carriedPot);

  const subtitleParts = [
    tc('afterNHoles', { holes: holesPlayed }),
    'Skins',
    result.scoring === 'net' ? tc('netto') : tc('brutto'),
  ];

  // Henger-skins: scoring-modulen eksponerer den rå hengende potten (carriedPot)
  // uten å kjenne gameStatus. Når spillet er ferdig er en hengende pott uvunnet —
  // også når spillet ble avsluttet tidlig med et gap rett etter et delt hull
  // (issue #303). Under aktivt spill står potten i toppkortet, så vi holder
  // banneret skjult til spillet er ferdig.
  const showUnwonSkins = isFinished && result.carriedPot > 0;

  return (
    <LeaderboardShell chromeless={chromeless} footerSlot={footerSlot}>
      {!chromeless && (
        <LeaderboardHeader gameName={gameName} backHref={backHref} />
      )}

      {/* Uten AppShell rundt (chromeless, under pallen) står kortene 16 px fra
          kanten som på tegningen; inni shellen gir AppShell kanten. */}
      <div className={`pb-3.5 ${chromeless ? 'px-4' : ''}`}>
        {isFinished ? (
          <div className="px-6 pt-1.5 pb-3.5 text-center">
            <h1 className="font-serif text-[28px] font-medium leading-[1.1] tracking-[-0.02em] text-text">
              Leaderboard
            </h1>
            <p className="mt-1 text-[11.5px] tabular-nums text-muted">
              {subtitleParts.join(' · ')}
            </p>
          </div>
        ) : (
          <SkinsPotHero gameName={gameName} scoring={result.scoring} pot={pot} />
        )}

        {/* A game finished before every hole was played has no pot on any
            hole: its unplayed holes are empty discs, not «på spill nå». */}
        <SkinsCoinGrid
          holes={result.holes}
          currentHoleNumber={!isFinished && pot.kind === 'pending' ? pot.holeNumber : null}
          playersById={playersById}
        />

        <section aria-labelledby="skins-standing-title">
          <Kicker as="h2" id="skins-standing-title" className="px-1 pt-4 pb-2 leading-[normal]">
            {t('skins.standing.title')}
          </Kicker>
          <ul
            data-testid="skins-leaderboard"
            className="overflow-hidden rounded-2xl border border-border bg-surface"
          >
            {result.players.map((player) => {
              const info = playersById.get(player.userId);
              const displayName =
                viewerUserId !== '' && player.userId === viewerUserId
                  ? t('teamBoard.you')
                  : info
                    ? formatRevealName(info.name, info.nickname)
                    : tc('unknownPlayerFull');
              return (
                <li
                  key={player.userId}
                  className="flex items-center gap-3 border-b border-row-divider-warm px-3.5 py-2.5 last:border-b-0"
                >
                  <span className="min-w-0 flex-1 truncate text-[15px] font-semibold leading-[normal] text-text">
                    {displayName}
                  </span>
                  <span className="shrink-0 text-xs leading-[normal] text-muted">
                    <span aria-hidden>
                      {t('skins.standing.holes', { count: player.holesWon })}
                    </span>
                    <span className="sr-only">
                      {t('skins.holesWonCount', { count: player.holesWon })}
                    </span>
                  </span>
                  <span className="score-num min-w-16 shrink-0 text-right text-[20px] leading-[normal] text-text">
                    {t('skins.skinCount', { count: player.totalSkins })}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        {settlement && (
          <a
            href="#oppgjoret"
            data-testid="skins-settlement-link"
            className="tap-extend mt-2.5 flex min-h-11 items-center justify-center text-[14px] font-semibold leading-[normal] text-primary underline"
          >
            {/* One flex item, so the space before the arrow survives. Inter has
                no «↓»; the artboard's stack falls back to system-ui. */}
            <span>
              {t('skins.pot.settlementLink')}{' '}
              <span aria-hidden className="font-[system-ui]">↓</span>
            </span>
          </a>
        )}

        {/* Uvunne skins — transparent om potten henger ved rundeslutt. */}
        {showUnwonSkins && (
          <div
            data-testid="skins-unwon"
            className="mt-3 rounded-2xl border border-border bg-surface px-4 py-3 text-center"
          >
            <p className="font-sans text-[13px] text-muted">
              <span className="font-semibold tabular-nums text-text">
                {t('skins.skinCount', { count: result.carriedPot })}
              </span>{' '}
              {t('skins.unwonNote')}
            </p>
          </div>
        )}

        {/* Pengeoppgjør (#937) — vises kun når kr_per_unit er satt (settlement != null). */}
        {settlement && (
          <div id="oppgjoret" className="mt-3.5 scroll-mt-4">
            <SettlementTable
              settlement={settlement}
              playersById={playersById}
              gameName={gameName}
              mode="skins"
              isFinal={isFinished}
            />
          </div>
        )}
      </div>

      <LeaderboardFooter gameStatus={gameStatus} className="px-6 pt-1 pb-4" />
    </LeaderboardShell>
  );
}
