'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { Kicker } from '@/components/ui/Kicker';
import { formatNumber, formatShortOsloDayMonthLocale } from '@/lib/i18n/format';
import type { KavalkadePlayerRef } from '@/lib/kavalkade/buildKavalkadeFacts';
import type { KavalkadeCard } from '@/lib/kavalkade/kavalkadeCards';
import type { AppLocale } from '@/i18n/routing';

type Props = {
  card: KavalkadeCard;
  locale: AppLocale;
  /**
   * Plass nederst på kortet. K4 (#2130) sender deleknappen inn her, ett kort om
   * gangen, uten at kortet må skrives om.
   */
  action?: ReactNode;
};

/** Kortene i «Ditt år», uten lag-kortet. */
type PersonalCard = Extract<
  KavalkadeCard,
  { id: 'opening' | 'bestRound' | 'nemesisHole' | 'rival' | 'formPeak' | 'belowThreshold' }
>;
/** Kortene i «Gjengen». */
type GangCard = Extract<KavalkadeCard, { id: `gang${string}` }>;

/**
 * Ett kort i Kavalkaden (#2129). Rent presentasjonelt: hvert tall kommer ferdig
 * regnet fra `buildKavalkadeFacts` via `buildKavalkadeDeck`, og denne fila
 * legger ikke til eller trekker fra noe. Derfor holder én render-test (Type C,
 * `docs/test-discipline.md`) — tallene er dekket av Type A på byggeren.
 *
 * Alle kort har samme form: en kicker som sier hva kortet handler om, ett stort
 * tall eller navn, og en linje eller to som setter det i sammenheng. Tallene
 * står i `tabular-nums` så de ikke hopper når man blar.
 */
export function KavalkadeCardView({ card, locale, action }: Props) {
  return (
    <Card className="flex h-full flex-col" data-testid={`kavalkade-card-${card.id}`}>
      {cardBody(card, locale)}
      {action && <div className="mt-auto pt-5">{action}</div>}
    </Card>
  );
}

/**
 * Hvilken kropp kortet får. Skrevet som en switch med gjennomfall fordi det er
 * den ene formen TypeScript smalner unionen på uten en cast: hver gren gir
 * kroppen sin allerede innsnevret korttype.
 */
function cardBody(card: KavalkadeCard, locale: AppLocale) {
  switch (card.id) {
    case 'team':
      return <TeamCardBody card={card} locale={locale} />;
    case 'gangSummary':
    case 'gangTopWinner':
    case 'gangMostBirdies':
    case 'gangMostSnowmen':
    case 'gangTightestFinish':
      return <GangCardBody card={card} locale={locale} />;
    default:
      return <PersonalCardBody card={card} locale={locale} />;
  }
}

/** «Ditt år»: åpningen, de fire personlige kortene og meldingen under terskelen. */
function PersonalCardBody({
  card,
  locale,
}: {
  card: PersonalCard;
  locale: AppLocale;
}) {
  const { t, day, where } = useCardCopy(locale);

  if (card.id === 'opening') {
    return (
      <CardBody
        kicker={t('openingKicker')}
        headline={String(card.year)}
        lines={[
          t('openingRounds', { count: card.rounds }),
          card.soloRounds > 0 ? t('openingSolo', { count: card.soloRounds }) : null,
          card.teamRounds > 0 ? t('openingTeam', { count: card.teamRounds }) : null,
        ]}
      >
        {card.narrative && (
          <p className="mt-4 font-sans text-sm leading-relaxed text-text">
            {card.narrative}
          </p>
        )}
      </CardBody>
    );
  }

  if (card.id === 'bestRound') {
    return (
      <CardBody
        kicker={t('bestRoundKicker')}
        headline={formatNumber(card.fact.brutto, locale)}
        headlineUnit={t('strokes')}
        lines={[where(card.fact.gameName, card.fact.courseName, card.fact.playedAt)]}
      />
    );
  }

  if (card.id === 'nemesisHole') {
    return (
      <CardBody
        kicker={t('nemesisKicker')}
        headline={t('nemesisHeading', { hole: card.fact.holeNumber })}
        lines={[
          t('nemesisAverage', {
            value: formatNumber(card.fact.averageToPar, locale, {
              maximumFractionDigits: 2,
            }),
          }),
          t('nemesisPlayed', { count: card.fact.played }),
          t('nemesisWorst', { strokes: card.fact.worstStrokes }),
        ]}
      />
    );
  }

  if (card.id === 'rival') {
    return (
      <CardBody
        kicker={t('rivalKicker')}
        headline={card.fact.name ?? t('unknownPlayer')}
        lines={[
          t('rivalMet', { count: card.fact.met }),
          card.fact.decided > 0
            ? t('rivalRecord', {
                wins: card.fact.wins,
                losses: card.fact.losses,
                ties: card.fact.ties,
              })
            : t('rivalUndecided'),
        ]}
      />
    );
  }

  if (card.id === 'belowThreshold') {
    return (
      <CardBody
        kicker={t('belowKicker')}
        headline={t('belowHeading')}
        headlineSize="small"
        lines={[
          t('belowBody', { needed: card.roundsNeeded, count: card.soloRounds }),
          card.teamRounds > 0 ? t('belowTeamHint') : null,
        ]}
      />
    );
  }

  // Formtoppen finnes i to former (#2127). Strekket er det kortet egentlig
  // handler om; har året færre enn tre komplette runder, er det ikke noe strekk
  // å vise, og da forteller sesong-raden historien.
  const { stretch, season } = card.fact;
  return (
    <CardBody
      kicker={t('formKicker')}
      headline={
        stretch
          ? formatNumber(stretch.averageBrutto, locale)
          : season
            ? formatNumber(season.brutto.now, locale)
            : MISSING
      }
      headlineUnit={stretch ? t('strokesAverage') : t('strokesLatest')}
      lines={
        stretch
          ? [
              t('formStretchRounds', { count: stretch.rounds }),
              [day(stretch.fromDate), day(stretch.toDate)].filter(Boolean).join(' – '),
            ]
          : [t('formSeasonOnly')]
      }
    >
      {season && (
        <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3">
          <TrendCell label={t('formSeasonStart')} value={season.brutto.start} locale={locale} />
          <TrendCell label={t('formSeasonNow')} value={season.brutto.now} locale={locale} />
          <TrendCell label={t('formSeasonBest')} value={season.brutto.best} locale={locale} />
        </dl>
      )}
    </CardBody>
  );
}

/** «Som lag»: året i formatene der hele laget delte én ball (#1040 Tillegg 2). */
function TeamCardBody({
  card,
  locale,
}: {
  card: Extract<KavalkadeCard, { id: 'team' }>;
  locale: AppLocale;
}) {
  const { t, names } = useCardCopy(locale);
  const { bestRound, highlight } = card;

  return (
    <CardBody
      kicker={t('teamKicker')}
      headline={formatNumber(card.rounds, locale)}
      headlineUnit={t('teamRoundsUnit', { count: card.rounds })}
      lines={[
        bestRound
          ? t('teamBest', { brutto: bestRound.brutto })
          : t('teamNoCompleteRound'),
        bestRound && bestRound.teammates.length > 0
          ? t('teamBestWith', { names: names(bestRound.teammates) })
          : null,
        highlight.kind === 'best'
          ? t('teamBestTeammate', {
              count: highlight.teammates.length,
              names: names(highlight.teammates),
            })
          : highlight.kind === 'mostRounds'
            ? t('teamMostRoundsWith', { names: names(highlight.teammates) })
            : null,
      ]}
    />
  );
}

/** «Gjengen»: kretsen du fullførte minst én runde med i år. */
function GangCardBody({ card, locale }: { card: GangCard; locale: AppLocale }) {
  const { t, playerName, where } = useCardCopy(locale);

  if (card.id === 'gangSummary') {
    return (
      <CardBody
        kicker={t('gangSummaryKicker')}
        headline={formatNumber(card.members, locale)}
        headlineUnit={t('gangMembersUnit', { count: card.members })}
        lines={[t('gangGames', { count: card.games }), t('gangSummaryBody')]}
      />
    );
  }

  if (card.id === 'gangTightestFinish') {
    return (
      <CardBody
        kicker={t('gangTightestKicker')}
        headline={
          card.fact.strokeMargin === 0
            ? t('gangTightestShared')
            : t('gangTightestMargin', { margin: card.fact.strokeMargin })
        }
        headlineSize="small"
        lines={[
          t('gangTightestLine', {
            leader: playerName(card.fact.leader),
            leaderBrutto: card.fact.leader.brutto,
            runnerUp: playerName(card.fact.runnerUp),
            runnerUpBrutto: card.fact.runnerUp.brutto,
          }),
          where(card.fact.gameName, card.fact.courseName, card.fact.playedAt),
        ]}
      />
    );
  }

  // De tre «mest av noe»-kortene har samme form: ett navn, én telling.
  const leader = {
    gangTopWinner: { kicker: t('gangTopWinnerKicker'), line: t('gangWins', { count: card.fact.count }) },
    gangMostBirdies: { kicker: t('gangMostBirdiesKicker'), line: t('gangBirdies', { count: card.fact.count }) },
    gangMostSnowmen: { kicker: t('gangMostSnowmenKicker'), line: t('gangSnowmen', { count: card.fact.count }) },
  }[card.id];

  return (
    <CardBody
      kicker={leader.kicker}
      headline={playerName(card.fact)}
      lines={[leader.line]}
    />
  );
}

/** Tegnet som står der et tall mangler, samme som i «Sesongen din». */
const MISSING = '–';

/** Kopi-hjelperne kortene deler: navn med fallback, dato og «hvor»-linja. */
function useCardCopy(locale: AppLocale) {
  const t = useTranslations('kavalkade');
  const playerName = (player: KavalkadePlayerRef) =>
    player.name ?? t('unknownPlayer');
  const day = (iso: string | null) =>
    iso ? formatShortOsloDayMonthLocale(iso, locale) : null;

  return {
    t,
    playerName,
    names: (players: KavalkadePlayerRef[]) => players.map(playerName).join(', '),
    day,
    /** «Lørdagscup · Losby · 14. jun» — de leddene som finnes, i den rekkefølgen. */
    where: (gameName: string, courseName: string | null, playedAt: string | null) =>
      [gameName, courseName, day(playedAt)].filter(Boolean).join(' · '),
  };
}

/**
 * Felles form for alle kortene: kicker, én overskrift, og de linjene som finnes.
 * `lines` filtreres her så kallstedene kan sende `null` for et ledd som mangler
 * uten å bygge lister selv.
 */
function CardBody({
  kicker,
  headline,
  headlineUnit,
  headlineSize = 'large',
  lines,
  children,
}: {
  kicker: string;
  headline: string;
  headlineUnit?: string;
  headlineSize?: 'large' | 'small';
  lines: (string | null)[];
  children?: ReactNode;
}) {
  const visible = lines.filter((line): line is string => Boolean(line));

  return (
    <div>
      <Kicker>{kicker}</Kicker>
      <p
        className={`mt-2 font-serif font-medium tabular-nums leading-tight text-text ${
          headlineSize === 'large' ? 'text-4xl' : 'text-2xl'
        }`}
      >
        {headline}
        {headlineUnit && (
          <span className="ml-2 font-sans text-sm font-normal text-muted">
            {headlineUnit}
          </span>
        )}
      </p>
      {visible.length > 0 && (
        <ul className="mt-3 space-y-1">
          {visible.map((line) => (
            <li
              key={line}
              className="font-sans text-sm leading-relaxed tabular-nums text-muted"
            >
              {line}
            </li>
          ))}
        </ul>
      )}
      {children}
    </div>
  );
}

/** Start / nå / beste for brutto, under formtopp-kortet. */
function TrendCell({
  label,
  value,
  locale,
}: {
  label: string;
  value: number | null;
  locale: AppLocale;
}) {
  return (
    <div>
      <dt className="font-sans text-[10px] font-semibold uppercase tracking-[0.15em] text-muted">
        {label}
      </dt>
      <dd className="mt-0.5 font-serif text-lg tabular-nums text-text">
        {value != null ? formatNumber(value, locale) : MISSING}
      </dd>
    </div>
  );
}
