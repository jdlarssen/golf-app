// #2265 PR 2: ett kort i Kavalkaden, som webbens `KavalkadeCardView`
// (`components/kavalkade/KavalkadeCardView.tsx`). Rent presentasjonelt: hvert
// tall kommer ferdig regnet fra `buildKavalkadeDeck`, og denne fila legger
// ikke til eller trekker fra noe.
//
// Alle kort har samme form: en kicker som sier hva kortet handler om, ett
// stort tall eller navn, og en linje eller to som setter det i sammenheng.
// Tekstene og tallformene er webbens (`kavalkadeCopy.ts`), og datoene står i
// telefonens tid (Hermes har ikke Oslo-sonen, se `homeDates.ts`).
//
// For skjermleseren er kortets innhold én gruppe som leses i rekkefølge
// (plassen i skinna, kickeren, det store tallet og linjene); deleknappen står
// for seg under.
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { formatShortDateNb } from '../../../../../lib/format/date';
import type { KavalkadePlayerRef } from '../../../../../lib/kavalkade/buildKavalkadeFacts';
import type { KavalkadeCard as Card } from '../../../../../lib/kavalkade/kavalkadeCards';
import { formatNumberNb, kavalkadeT as t } from '../../lib/kavalkadeCopy';
import { FONTS, fraunces, interLine, useTheme, type Scheme } from '../../theme';

/** Tegnet som står der et tall mangler, samme som i «Sesongen din». */
const MISSING = '–';

/** Webbens `Card`-skygge (`components/ui/Card.tsx`). */
export function webCardShadow(scheme: Scheme): string {
  return scheme === 'dark'
    ? '0 1px 2px rgba(0, 0, 0, 0.3)'
    : '0 1px 2px rgba(26, 46, 31, 0.04), 0 2px 8px rgba(26, 46, 31, 0.04)';
}

function playerName(player: KavalkadePlayerRef): string {
  return player.name ?? t('unknownPlayer');
}

function day(iso: string | null): string | null {
  return iso ? formatShortDateNb(iso) : null;
}

/** «Lørdagscup · Losby · 14. jun»: de leddene som finnes, i den rekkefølgen. */
function where(gameName: string, courseName: string | null, playedAt: string | null): string {
  return [gameName, courseName, day(playedAt)].filter(Boolean).join(' · ');
}

type Body = {
  kicker: string;
  headline: string;
  headlineUnit?: string;
  headlineSize?: 'large' | 'small';
  lines: (string | null)[];
  /** Innledningen på åpningskortet. */
  narrative?: string | null;
  /** Start / nå / beste under formtoppen. */
  trend?: { start: number | null; now: number | null; best: number | null } | null;
};

/** Innholdet per kort, som `cardBody` på webben. */
export function kavalkadeCardBody(card: Card): Body {
  switch (card.id) {
    case 'year':
      return {
        kicker: t('openingKicker'),
        headline: String(card.year),
        lines: [
          t('openingRounds', { count: card.rounds }),
          card.soloRounds > 0 ? t('openingSolo', { count: card.soloRounds }) : null,
          card.teamRounds > 0 ? t('openingTeam', { count: card.teamRounds }) : null,
        ],
        narrative: card.narrative,
      };
    case 'best-round':
      return {
        kicker: t('bestRoundKicker'),
        headline: formatNumberNb(card.fact.brutto),
        headlineUnit: t('strokes'),
        lines: [where(card.fact.gameName, card.fact.courseName, card.fact.playedAt)],
      };
    case 'nemesis-hole':
      return {
        kicker: t('nemesisKicker'),
        headline: t('nemesisHeading', { hole: card.fact.holeNumber }),
        lines: [
          t('nemesisAverage', { value: formatNumberNb(card.fact.averageToPar, 2) }),
          t('nemesisPlayed', { count: card.fact.played }),
          t('nemesisWorst', { strokes: card.fact.worstStrokes }),
        ],
      };
    case 'rival':
      return {
        kicker: t('rivalKicker'),
        headline: card.fact.name ?? t('unknownPlayer'),
        lines: [
          t('rivalMet', { count: card.fact.met }),
          card.fact.decided > 0
            ? t('rivalRecord', { wins: card.fact.wins, losses: card.fact.losses, ties: card.fact.ties })
            : t('rivalUndecided'),
        ],
      };
    case 'below-threshold':
      return {
        kicker: t('belowKicker'),
        headline: t('belowHeading'),
        headlineSize: 'small',
        lines: [
          t('belowBody', { needed: card.roundsNeeded, count: card.soloRounds }),
          card.teamRounds > 0 ? t('belowTeamHint') : null,
        ],
      };
    case 'form-peak': {
      // Formtoppen finnes i to former (#2127): strekket, eller sesong-raden når
      // året har færre enn tre komplette runder.
      const { stretch, season } = card.fact;
      return {
        kicker: t('formKicker'),
        headline: stretch
          ? formatNumberNb(stretch.averageBrutto)
          : season
            ? formatNumberNb(season.brutto.now)
            : MISSING,
        headlineUnit: stretch ? t('strokesAverage') : t('strokesLatest'),
        lines: stretch
          ? [
              t('formStretchRounds', { count: stretch.rounds }),
              [day(stretch.fromDate), day(stretch.toDate)].filter(Boolean).join(' – '),
            ]
          : [t('formSeasonOnly')],
        trend: season ? season.brutto : null,
      };
    }
    case 'team': {
      const { bestRound, highlight } = card;
      const names = (players: KavalkadePlayerRef[]) => players.map(playerName).join(', ');
      return {
        kicker: t('teamKicker'),
        headline: formatNumberNb(card.rounds),
        headlineUnit: t('teamRoundsUnit', { count: card.rounds }),
        lines: [
          bestRound ? t('teamBest', { brutto: bestRound.brutto }) : t('teamNoCompleteRound'),
          bestRound && bestRound.teammates.length > 0
            ? t('teamBestWith', { names: names(bestRound.teammates) })
            : null,
          highlight.kind === 'best'
            ? t('teamBestTeammate', { count: highlight.teammates.length, names: names(highlight.teammates) })
            : highlight.kind === 'mostRounds'
              ? t('teamMostRoundsWith', { names: names(highlight.teammates) })
              : null,
        ],
      };
    }
    case 'gang-summary':
      return {
        kicker: t('gangSummaryKicker'),
        headline: formatNumberNb(card.members),
        headlineUnit: t('gangMembersUnit', { count: card.members }),
        lines: [t('gangGames', { count: card.games }), t('gangSummaryBody')],
      };
    case 'gang-tightest':
      return {
        kicker: t('gangTightestKicker'),
        headline:
          card.fact.strokeMargin === 0
            ? t('gangTightestShared')
            : t('gangTightestMargin', { margin: card.fact.strokeMargin }),
        headlineSize: 'small',
        lines: [
          t('gangTightestLine', {
            leader: playerName(card.fact.leader),
            leaderBrutto: card.fact.leader.brutto,
            runnerUp: playerName(card.fact.runnerUp),
            runnerUpBrutto: card.fact.runnerUp.brutto,
          }),
          where(card.fact.gameName, card.fact.courseName, card.fact.playedAt),
        ],
      };
    case 'gang-winner':
      return {
        kicker: t('gangTopWinnerKicker'),
        headline: playerName(card.fact),
        lines: [t('gangWins', { count: card.fact.count })],
      };
    case 'gang-birdies':
      return {
        kicker: t('gangMostBirdiesKicker'),
        headline: playerName(card.fact),
        lines: [t('gangBirdies', { count: card.fact.count })],
      };
    case 'gang-snowmen':
      return {
        kicker: t('gangMostSnowmenKicker'),
        headline: playerName(card.fact),
        lines: [t('gangSnowmen', { count: card.fact.count })],
      };
  }
}

/** Det skjermleseren leser for kortet, i samme rekkefølge som det står. */
export function kavalkadeCardLabel(body: Body, position: string): string {
  const headline = body.headlineUnit ? `${body.headline} ${body.headlineUnit}` : body.headline;
  const trend = body.trend
    ? [
        `${t('formSeasonStart')} ${valueText(body.trend.start)}`,
        `${t('formSeasonNow')} ${valueText(body.trend.now)}`,
        `${t('formSeasonBest')} ${valueText(body.trend.best)}`,
      ]
    : [];
  return [position, body.kicker, headline, ...lines(body), body.narrative ?? null, ...trend]
    .filter((part): part is string => Boolean(part))
    .join('. ');
}

function lines(body: Body): string[] {
  return body.lines.filter((line): line is string => Boolean(line));
}

function valueText(value: number | null): string {
  return value != null ? formatNumberNb(value) : MISSING;
}

export function KavalkadeCard({
  card,
  position,
  action,
}: {
  card: Card;
  /** «Kort 2 av 6», som `aria-label` på webbens kort. */
  position: string;
  /** Deleknappen nederst på kortet, når kortet kan deles. */
  action?: ReactNode;
}) {
  const { colors, scheme } = useTheme();
  const body = kavalkadeCardBody(card);
  const large = (body.headlineSize ?? 'large') === 'large';

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border, boxShadow: webCardShadow(scheme) },
      ]}
      testID={`kavalkade-card-${card.id}`}
    >
      <View accessible accessibilityLabel={kavalkadeCardLabel(body, position)}>
        <Text style={[styles.kicker, { color: colors.muted }]}>{body.kicker.toUpperCase()}</Text>
        <View style={styles.headlineRow}>
          <Text style={[large ? styles.headlineLarge : styles.headlineSmall, { color: colors.text }]}>
            {body.headline}
          </Text>
          {body.headlineUnit ? (
            <Text style={[styles.unit, { color: colors.muted }]}>{body.headlineUnit}</Text>
          ) : null}
        </View>
        {lines(body).length > 0 ? (
          <View style={styles.lines}>
            {lines(body).map((line) => (
              <Text key={line} style={[styles.line, { color: colors.muted }]}>
                {line}
              </Text>
            ))}
          </View>
        ) : null}
        {body.narrative ? (
          <Text style={[styles.narrative, { color: colors.text }]} testID="kavalkade-narrative">
            {body.narrative}
          </Text>
        ) : null}
        {body.trend ? (
          <View style={[styles.trend, { borderTopColor: colors.border }]}>
            {(
              [
                [t('formSeasonStart'), body.trend.start],
                [t('formSeasonNow'), body.trend.now],
                [t('formSeasonBest'), body.trend.best],
              ] as const
            ).map(([label, value]) => (
              <View key={label} style={styles.trendCell}>
                <Text style={[styles.trendLabel, { color: colors.muted }]}>{label.toUpperCase()}</Text>
                <Text style={[styles.trendValue, { color: colors.text }]}>{valueText(value)}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

// Webbens mål: `p-6`, `rounded-2xl`, kicker 10/600 med 0,2 em sperring,
// overskrift `text-4xl` (36) eller `text-2xl` (24) i Fraunces 500 med
// `leading-tight`, enheten 14 med `ml-2`, linjene 14 med `leading-relaxed` og
// `space-y-1`, og start/nå/beste 10/600 over Fraunces 18.
const KICKER = interLine(10, 15);
const HEADLINE_LARGE = fraunces(500, 36, 45);
const HEADLINE_SMALL = fraunces(500, 24, 30);
const UNIT = interLine(14, 20);
const LINE = interLine(14, 22.75, { multiline: true });
const TREND_LABEL = interLine(10, 15);
const TREND_VALUE = fraunces(400, 18, 28);

const styles = StyleSheet.create({
  card: { flex: 1, borderWidth: 1, borderRadius: 16, padding: 24 },
  kicker: { ...KICKER, fontFamily: FONTS.sansSemiBold, letterSpacing: 2 },
  headlineRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', marginTop: 8 },
  headlineLarge: { ...HEADLINE_LARGE, fontVariant: ['tabular-nums'], flexShrink: 1 },
  headlineSmall: { ...HEADLINE_SMALL, fontVariant: ['tabular-nums'], flexShrink: 1 },
  unit: { ...UNIT, fontFamily: FONTS.sans, marginLeft: 8 },
  lines: { marginTop: 12, gap: 4 },
  line: { ...LINE, fontFamily: FONTS.sans, fontVariant: ['tabular-nums'] },
  narrative: { ...LINE, fontFamily: FONTS.sans, marginTop: LINE.marginTop + 16 },
  trend: { flexDirection: 'row', gap: 8, marginTop: 16, borderTopWidth: 1, paddingTop: 12 },
  trendCell: { flex: 1 },
  trendLabel: { ...TREND_LABEL, fontFamily: FONTS.sansSemiBold, letterSpacing: 1.5 },
  trendValue: { ...TREND_VALUE, marginTop: TREND_VALUE.marginTop + 2, fontVariant: ['tabular-nums'] },
  action: { marginTop: 'auto', paddingTop: 20 },
});
