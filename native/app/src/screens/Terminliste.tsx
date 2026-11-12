// native/app/src/screens/Terminliste.tsx
// #2838: «Finn turneringer», terminlista i appen. Samme liste som nettets
// /finn-turneringer (#2258): én liste sortert på starttid og delt i dager, under
// brikkene «Alle», «Denne helga» og «Klubben min», med dine egne forespørsler
// først og «Lag din egen runde» sist.
//
// Utvalget, knappen på hver rad og setene kommer ferdig fra
// `GET /api/terminliste` (nettsidens regel, `buildTerminEntries`). Dagene og
// filtrene regner skjermen selv, med nettsidens `groupTerminByDate` og
// `filterTermin` på telefonens klokke (Hermes mangler Oslo-sonen, se
// `homeDates.ts`). Brikkene er lokal tilstand: et bytte henter ikke på nytt.
//
// Et trykk på en rad åpner `RoundInvite` med rundens `short_id`, uten `src`,
// som nettets rad. Påmeldingen er den skjermens, ikke denne. Lista hentes ved
// fokus, så den er fersk etter en påmelding. Uten nett står feilen med
// «Prøv igjen», og ingenting legges i kø.
//
// Tilbake: lista er åpnet fra Hjem (eller fra klubbturneringene, #2753), og
// tilbake går dit den kom fra. `RoundInvite` går tilbake hit.
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { AppTerminEntry, AppTerminView } from '../../../../lib/games/appTerminView';
import {
  filterTermin,
  groupTerminByDate,
  type TerminFilter,
  type TerminGroup,
} from '../../../../lib/games/terminliste';
import { PageTitle } from '../components/PageTitle';
import { TerminDayCard, TerminDayHeading, TerminRow } from '../components/terminliste/TerminRow';
import { openOrReturn } from '../lib/backTo';
import { PlussIcon, PinFlagHero } from '../components/icons/Icons';
import { fetchTerminliste, type TerminlisteLoadFailure } from '../data/terminliste';
import { localDateParts } from '../lib/homeDates';
import {
  TERMIN_TEXT,
  dayHeading,
  dayLabelText,
  describeTerminlisteFailure,
  pendingTeamLine,
} from '../lib/terminlisteCopy';
import type { ScreenProps } from '../navigation';
import { FONTS, TAP, interLine, useTheme } from '../theme';

const CHIPS: { filter: TerminFilter; label: string }[] = [
  { filter: 'alle', label: TERMIN_TEXT.filterAll },
  { filter: 'helg', label: TERMIN_TEXT.filterWeekend },
  { filter: 'klubb', label: TERMIN_TEXT.filterClub },
];

export function Terminliste({ navigation, route }: ScreenProps<'Terminliste'>) {
  const { colors, ui } = useTheme();
  const [view, setView] = useState<AppTerminView | null>(null);
  const [failure, setFailure] = useState<TerminlisteLoadFailure | null>(null);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [filter, setFilter] = useState<TerminFilter>(route.params?.filter ?? 'alle');
  // Et svar på en eldre henting skal ikke tegne over et nyere.
  const latestLoad = useRef(0);

  const load = useCallback(async () => {
    const thisLoad = ++latestLoad.current;
    setLoading(true);
    const result = await fetchTerminliste();
    if (thisLoad !== latestLoad.current) return;
    setLoading(false);
    if (!result.ok) {
      setFailure(result.reason);
      return;
    }
    setFailure(null);
    setNow(new Date());
    setView(result.view);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const groups = useMemo(
    () => (view === null ? [] : groupTerminByDate(filterTermin(view.entries, filter, now, localDateParts), now, localDateParts)),
    [view, filter, now],
  );
  const byId = useMemo(() => new Map((view?.entries ?? []).map((entry) => [entry.id, entry])), [view]);

  const openRound = (shortId: string) => openOrReturn(navigation, 'RoundInvite', { shortId, src: null });
  const scroll = [ui.scroll, styles.scroll];

  if (view === null) {
    return failure === null ? (
      <View style={ui.centered} testID="terminliste-loading">
        <ActivityIndicator color={colors.primary} />
        <Text style={ui.muted}>{TERMIN_TEXT.loading}</Text>
      </View>
    ) : (
      <View style={[styles.state, { backgroundColor: colors.bg }]} testID="terminliste-load-failed">
        <Text style={[styles.stateText, { color: colors.danger }]} testID="terminliste-load-error">
          {describeTerminlisteFailure(failure)}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => void load()}
          style={[styles.retry, { borderColor: colors.primary }]}
          testID="terminliste-retry"
        >
          <Text style={[styles.retryText, { color: colors.primary }]}>
            {loading ? TERMIN_TEXT.retrying : TERMIN_TEXT.retry}
          </Text>
        </Pressable>
      </View>
    );
  }

  const { pendingRequests } = view;
  const isEmpty = view.entries.length === 0 && pendingRequests.length === 0;

  return (
    <ScrollView contentContainerStyle={scroll} testID="terminliste-screen">
      <PageTitle title={TERMIN_TEXT.pageTitle} subtitle={TERMIN_TEXT.subtitle} subtitleTestID="terminliste-subtitle" />

      {isEmpty ? (
        <View style={styles.empty} testID="terminliste-empty">
          <PinFlagHero color={colors.text} accent={colors.accent} size={72} />
          <Text style={[styles.emptyBody, { color: colors.muted }]}>{TERMIN_TEXT.emptyBody}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.navigate('CreateGame')}
            style={[ui.button, styles.emptyButton]}
            testID="terminliste-empty-create"
          >
            <Text style={ui.buttonText}>{TERMIN_TEXT.emptyAction}</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View accessibilityLabel={TERMIN_TEXT.filterLabel} style={styles.chips} testID="terminliste-chips">
            {CHIPS.map((chip) => {
              const active = chip.filter === filter;
              return (
                <Pressable
                  key={chip.filter}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setFilter(chip.filter)}
                  style={[
                    styles.chip,
                    active
                      ? { backgroundColor: colors.primary }
                      : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
                  ]}
                  testID={`terminliste-chip-${chip.filter}`}
                >
                  <Text style={[styles.chipText, { color: active ? colors.onPrimary : colors.text }]}>{chip.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {pendingRequests.length > 0 ? (
            <View style={styles.section} testID="terminliste-requests">
              <TerminDayHeading title={TERMIN_TEXT.myRequests} />
              <TerminDayCard>
                {pendingRequests.map((request, index) => (
                  <Pressable
                    key={request.id}
                    accessibilityRole="button"
                    onPress={() => openRound(request.short_id)}
                    style={[styles.requestRow, index > 0 && { borderTopWidth: 1, borderTopColor: colors.divider }]}
                    testID={`terminliste-request-${request.id}`}
                  >
                    <Text style={[styles.name, { color: colors.text }]}>{request.game_name}</Text>
                    <Text style={[styles.line, { color: colors.muted }]}>
                      {request.team_name
                        ? pendingTeamLine(request.team_name, request.is_team_captain)
                        : TERMIN_TEXT.pendingApproval}
                    </Text>
                  </Pressable>
                ))}
              </TerminDayCard>
            </View>
          ) : null}

          {groups.length > 0 ? (
            groups.map((group) => (
              <View key={group.key} style={styles.section} testID={`terminliste-day-${group.key}`}>
                <TerminDayHeading
                  title={group.kind === 'day' ? dayHeading(group.teeOff, now) : TERMIN_TEXT.undated}
                  label={group.kind === 'day' ? dayLabelText(group.label) : null}
                />
                <TerminDayCard>
                  <GroupRows group={group} byId={byId} onOpen={openRound} />
                </TerminDayCard>
              </View>
            ))
          ) : filter !== 'alle' ? (
            <View style={styles.section} testID="terminliste-filter-empty">
              <Text style={[styles.line, { color: colors.muted, fontSize: 13 }]}>
                {filter === 'helg' ? TERMIN_TEXT.emptyWeekend : TERMIN_TEXT.emptyClub}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setFilter('alle')}
                style={styles.showAll}
                testID="terminliste-show-all"
              >
                <Text style={[styles.showAllText, { color: colors.primary }]}>{TERMIN_TEXT.showAll}</Text>
              </Pressable>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.navigate('CreateGame')}
            style={[styles.createOwn, { borderColor: colors.fieldBorder }]}
            testID="terminliste-create-own"
          >
            <PlussIcon color={colors.primary} size={18} strokeWidth={2} />
            <Text style={[styles.createOwnText, { color: colors.primary }]}>{TERMIN_TEXT.createOwn}</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

function GroupRows({
  group,
  byId,
  onOpen,
}: {
  group: TerminGroup;
  byId: ReadonlyMap<string, AppTerminEntry>;
  onOpen: (shortId: string) => void;
}) {
  const { colors } = useTheme();
  return (
    <>
      {group.entries.map((entry, index) => {
        const full = byId.get(entry.id);
        // Gruppene bygges av de samme radene, så oppslaget treffer alltid; uten treff er det en rad vi ikke kan tegne.
        if (!full) return null;
        return (
          <View key={entry.id} style={index > 0 ? { borderTopWidth: 1, borderTopColor: colors.divider } : undefined}>
            <TerminRow entry={full} onPress={() => onOpen(entry.short_id)} />
          </View>
        );
      })}
    </>
  );
}

// Målene er nettets artboard «Forslag: terminlista» (#2258): tekst 20 fra
// kanten, brikker og kort 16, kortene hvite med 16 i hjørnene og varm
// skillelinje, rader med 14 inn og 12 over og under, klokkeblokken 56 bred.
const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 32, gap: 0 },
  chips: { flexDirection: 'row', gap: 8, marginTop: 16 },
  chip: { height: TAP, borderRadius: 999, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  chipText: { ...interLine(13, 16), fontFamily: FONTS.sansSemiBold },
  section: { marginTop: 22 },
  name: { ...interLine(15, 20, { multiline: true }), fontFamily: FONTS.sansSemiBold },
  line: { ...interLine(12, 16, { multiline: true }), fontFamily: FONTS.sans, marginTop: 2 },
  requestRow: { paddingHorizontal: 14, paddingVertical: 12, minHeight: TAP, justifyContent: 'center' },
  showAll: { minHeight: TAP, justifyContent: 'center' },
  showAllText: { ...interLine(13, 16), fontFamily: FONTS.sansSemiBold },
  createOwn: {
    marginTop: 20,
    minHeight: 58,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  createOwnText: { ...interLine(14, 18), fontFamily: FONTS.sansSemiBold },
  empty: { alignItems: 'center', marginTop: 32, gap: 20 },
  emptyBody: { ...interLine(14, 22, { multiline: true }), fontFamily: FONTS.sans, textAlign: 'center', maxWidth: 280 },
  emptyButton: { alignSelf: 'stretch', marginHorizontal: 40 },
  state: { flex: 1, alignItems: 'center', gap: 12, paddingTop: 26, paddingHorizontal: 24 },
  stateText: { ...interLine(15, 21, { multiline: true }), fontFamily: FONTS.sans, textAlign: 'center' },
  retry: { minHeight: TAP, borderWidth: 1, borderRadius: 999, paddingHorizontal: 20, justifyContent: 'center' },
  retryText: { ...interLine(16, 19), fontFamily: FONTS.sansSemiBold },
});
