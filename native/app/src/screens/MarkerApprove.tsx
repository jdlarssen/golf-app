// #2661: markørens skjerm i en simulatorliga — webbens /liga/[id]/godkjenn/….
//
// Markøren står som regel ikke i flighten, så kortet kan ikke leses fra
// Supabase som på godkjenningsskjermen (`Approve.tsx`, RLS viser spillet bare
// til spillerne). Det kommer fra serveren (`data/marker.ts`), bak den samme
// porten som svaret går gjennom (`markerReviewAccess`). Svaret (godkjenn, send
// tilbake) går gjennom scorekort-ruta, slik godkjenningen alltid har gjort.
//
// Kortet er det klassiske scorekortet, UT og INN med PAR og SLAG og BRUTTO
// under, som på godkjenningsskjermen. «Send tilbake» åpner det samme arket med
// valgfri grunn. Markøren endrer aldri et slag; spilleren retter selv.
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { buildScorecardGrid } from '../../../../lib/scorecard/scorecardGrid';
import type { MarkerCardResponse } from '../../../../lib/league/appLeagueView';
import { RejectSheet } from '../components/approve/RejectSheet';
import { kickerHeader } from '../components/KickerHeader';
import { ScorecardGrid } from '../components/scorecard/ScorecardGrid';
import { ScorecardTotals } from '../components/scorecard/ScorecardTotals';
import { fetchMarkerCard } from '../data/marker';
import { approveScorecard, rejectScorecard } from '../data/playerActions';
import { describeFailure } from '../lib/actionFeedback';
import { APPROVE_TEXT } from '../lib/approveCopy';
import {
  MARKER_TEXT,
  markerCardHeading,
  markerCardSubtitle,
  organizerNote,
} from '../lib/markerCopy';
import { useMarkVisitRead } from '../lib/useMarkVisitRead';
import type { ScreenProps } from '../navigation';
import { FONTS, fraunces, interLine, useTheme } from '../theme';

type Load = { status: 'loading' } | { status: 'failed' } | { status: 'ready'; card: MarkerCardResponse };

/** Hva som står under kortet når det ikke venter på svar. */
const STATE_TEXT: Record<Exclude<MarkerCardResponse['state'], 'pending'>, string> = {
  approved: MARKER_TEXT.approved,
  not_delivered: MARKER_TEXT.notDelivered,
  withdrawn: MARKER_TEXT.withdrawn,
  closed: MARKER_TEXT.closed,
};

export function MarkerApprove({ route, navigation }: ScreenProps<'MarkerApprove'>) {
  const { colors, ui } = useTheme();
  const insets = useSafeAreaInsets();
  const { leagueId, gameId, userId: playerUserId } = route.params;
  // #2201: markørens varsel for spillet er lest når skjermen er åpnet.
  useMarkVisitRead('leagueMarker', gameId);

  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<'approved' | 'rejected' | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reasonDraft, setReasonDraft] = useState('');

  const reload = useCallback(async () => {
    const result = await fetchMarkerCard(leagueId, gameId, playerUserId);
    setLoad(result.ok ? { status: 'ready', card: result.card } : { status: 'failed' });
  }, [leagueId, gameId, playerUserId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await fetchMarkerCard(leagueId, gameId, playerUserId);
      if (!cancelled) setLoad(result.ok ? { status: 'ready', card: result.card } : { status: 'failed' });
    })();
    return () => {
      cancelled = true;
    };
  }, [leagueId, gameId, playerUserId]);

  const card = load.status === 'ready' ? load.card : null;
  useLayoutEffect(() => {
    if (card) navigation.setOptions(kickerHeader(card.leagueName, MARKER_TEXT.screenTitle));
  }, [navigation, card]);

  const answer = async (decision: 'approve' | 'reject', reason?: string) => {
    setBusy(decision);
    setError(null);
    const result =
      decision === 'approve'
        ? await approveScorecard(gameId, playerUserId)
        : await rejectScorecard(gameId, playerUserId, reason);
    if (decision === 'reject') setRejecting(false);
    if (!result.ok) {
      setBusy(null);
      setError(describeFailure(result));
      return;
    }
    setSent(decision === 'approve' ? 'approved' : 'rejected');
    if (decision === 'reject') setReasonDraft('');
    // Hent kortet på nytt: det er serveren som sier hvor kortet står nå.
    try {
      await reload();
    } finally {
      setBusy(null);
    }
  };

  if (!card) {
    return (
      <View style={ui.centered} testID={load.status === 'loading' ? 'marker-loading' : 'marker-error'}>
        {load.status === 'loading' ? (
          <Text style={ui.muted}>{MARKER_TEXT.loading}</Text>
        ) : (
          <>
            <Text style={ui.body}>{MARKER_TEXT.loadFailed}</Text>
            <Pressable style={ui.buttonSecondary} onPress={() => void reload()} accessibilityRole="button">
              <Text style={ui.buttonSecondaryText}>{MARKER_TEXT.retry}</Text>
            </Pressable>
          </>
        )}
      </View>
    );
  }

  const grid = buildScorecardGrid({
    rows: card.holes.map((hole) => ({
      holeNumber: hole.number,
      par: hole.par,
      strokes: hole.strokes,
      extra: null,
    })),
    pointsFn: null,
  });
  const name = card.player.name ?? MARKER_TEXT.unknownPlayer;
  const pending = card.state === 'pending';
  const locked = busy != null;

  return (
    <>
      <ScrollView
        style={{ backgroundColor: colors.bg }}
        contentContainerStyle={[styles.scroll, { paddingBottom: 32 + insets.bottom }]}
        testID="marker-screen"
      >
        <View style={styles.headingBlock}>
          <Text style={[styles.heading, { color: colors.text }]} accessibilityRole="header">
            {markerCardHeading(card.player.name)}
          </Text>
          <Text style={[styles.intro, { color: colors.muted }]}>
            {markerCardSubtitle(card.roundLabel, card.leagueName)}
          </Text>
          {pending ? (
            <Text style={[styles.intro, { color: colors.muted }]}>{MARKER_TEXT.intro}</Text>
          ) : null}
          {pending && card.role === 'organizer' ? (
            <Text style={[styles.intro, { color: colors.text }]} testID="marker-organizer-note">
              {organizerNote(card.markerName)}
            </Text>
          ) : null}
        </View>

        <View style={styles.cardWrap} testID="marker-card">
          {grid.totals.played === 0 ? (
            <Text style={ui.muted}>{APPROVE_TEXT.noScores}</Text>
          ) : (
            <ScorecardGrid
              grid={grid}
              rows={['strokes']}
              footer={<ScorecardTotals totals={grid.totals} showNet={false} showPoints={false} />}
            />
          )}
        </View>

        {pending ? (
          <View style={styles.actions}>
            <Pressable
              style={[ui.button, styles.action]}
              onPress={() => void answer('approve')}
              disabled={locked}
              accessibilityRole="button"
              testID="marker-approve"
            >
              <Text style={ui.buttonText}>{busy === 'approve' ? APPROVE_TEXT.working : APPROVE_TEXT.approve}</Text>
            </Pressable>
            <Pressable
              style={[ui.buttonSecondary, styles.action]}
              onPress={() => setRejecting(true)}
              disabled={locked}
              accessibilityRole="button"
              testID="marker-reject"
            >
              <Text style={ui.buttonSecondaryText}>{APPROVE_TEXT.sendBack}</Text>
            </Pressable>
          </View>
        ) : (
          <Text style={[ui.body, styles.state]} testID={`marker-state-${card.state}`}>
            {sent === 'rejected' && card.state === 'not_delivered'
              ? MARKER_TEXT.rejected
              : STATE_TEXT[card.state as Exclude<MarkerCardResponse['state'], 'pending'>]}
          </Text>
        )}

        {error ? (
          <Text style={[ui.error, styles.state]} testID="marker-action-error">
            {error}
          </Text>
        ) : null}
      </ScrollView>

      {rejecting ? (
        <RejectSheet
          name={name}
          teamCard={false}
          guest={false}
          busy={busy === 'reject'}
          initialReason={reasonDraft}
          onReasonChange={setReasonDraft}
          onSubmit={(reason) => void answer('reject', reason)}
          onCancel={() => setRejecting(false)}
        />
      ) : null}
    </>
  );
}

const INTRO_LINE = interLine(14, 20.3, { multiline: true });

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingBottom: 32 },
  headingBlock: { paddingTop: 4, paddingHorizontal: 20, paddingBottom: 14, gap: 4 },
  heading: { ...fraunces(500, 26, 31.2, { multiline: true }) },
  intro: { ...INTRO_LINE, fontFamily: FONTS.sans, marginTop: INTRO_LINE.marginTop + 4 },
  cardWrap: { paddingHorizontal: 20 },
  actions: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, marginTop: 16 },
  action: { flex: 1, height: 48, marginTop: 0 },
  state: { paddingHorizontal: 20, marginTop: 16 },
});
