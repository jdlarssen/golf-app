// Native N3 (#1825): hjem — spillerens spill.
//
// Cachen tegnes med én gang og refetchen skjer i bakgrunnen (samme mønster som
// spill-bundelen). Derfor ser skjermen aldri tom ut mens nettet henter, og en
// feilet refetch lar den forrige lista stå: feilteksten dukker bare opp når vi
// ikke har noe å vise i det hele tatt.
//
// #1906 tok footeren bort. E-posten, «Konto», «Sync-lab» og «Logg ut» lå der
// som fire lenker under spillene dine — alt sammen ting som handler om deg og
// ikke om runden. De bor i profil-rommet nå, og veien dit er ordet «Profil»
// oppe til høyre i headeren (satt i `navigation.tsx`). Hjem handler igjen bare
// om spill.
//
// #2254 gjorde Hjem til startboden. Fra toppen: datoen, hilsenen med
// HCP-pillen, heltekortet for runden du er midt i (med godkjenningsraden
// under), «Flere runder i gang», billetten for neste start, «Mine spill» og
// «Forrige runde». «Opprett spill» står nederst når en runde pågår, og øverst
// ellers, som før (eierens svar på #2254).
//
// Heltekortet og billetten leser spill-bundelen og slagene som ligger på
// enheten (`data/homeHero.ts`). Hvert fokus leser dem på nytt med én gang, så
// et hull tastet i flymodus flytter ringen også uten nett, og henter dem så fra
// serveren når lista har svart.
import { useCallback, useEffect, useState, type ComponentType } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { firstName } from '../../../../lib/firstName';
import { isHandicapStale } from '../../../../lib/handicap/staleness';
import { STATUS_LABELS, type GameStatus } from '../../../../lib/games/status';
import { HomeHeroCard } from '../components/home/HomeHeroCard';
import { LastRoundCard } from '../components/home/LastRoundCard';
import { NextStartTicket } from '../components/home/NextStartTicket';
import type { GameBundle } from '../data/gameBundle';
import { loadCardBundle, refreshCardBundle, type CardBundle } from '../data/homeHero';
import {
  loadHomeCards,
  refreshHomeCards,
  splitHomeCards,
  type HomeCard,
  type HomeList,
} from '../data/homeList';
import { fetchOwnProfile, type OwnProfile } from '../data/profile';
import { startSyncTriggers } from '../data/syncTriggers';
import {
  FlaggIcon,
  KalenderIcon,
  PinFlagHero,
  PokalIcon,
  type IconProps,
} from '../components/icons/Icons';
import { ACTIVE_CARD_LABELS, formatTeeOff } from '../lib/display';
import { HOME_TEXT, greeting, hcpA11yLabel } from '../lib/homeCopy';
import { formatWeekdayDayMonth } from '../lib/homeDates';
import { buildHeroModel, pickHeroCard } from '../lib/homeHero';
import { formatHcpNb } from '../lib/profileCopy';
import type { ScreenProps } from '../navigation';
import { useSession } from '../session';
import { FONTS, TAP, useTheme } from '../theme';

export function Home({ navigation }: ScreenProps<'Home'>) {
  const { colors, ui } = useTheme();
  const { userId } = useSession();
  const [list, setList] = useState<HomeList | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [heroData, setHeroData] = useState<CardBundle | null>(null);
  const [ticketBundle, setTicketBundle] = useState<GameBundle | null>(null);
  // Økes når enheten skal leses på nytt: ved hvert fokus og etter en henting.
  const [deviceTick, setDeviceTick] = useState(0);
  const [showAllRounds, setShowAllRounds] = useState(false);

  // Drain-triggerne (nett tilbake, app i forgrunnen, intervall) skal gå så
  // lenge appen er innlogget, ikke bare mens en hull-side står åpen. Hjem er
  // rota i stacken, så her lever de like lenge som sesjonen.
  useEffect(() => startSyncTriggers(), []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setDeviceTick((n) => n + 1);
    // Hilsenen og HCP-pillen. Best-effort: uten profil står bare datoen.
    void fetchOwnProfile(userId).then(setProfile, () => undefined);
    try {
      const fresh = await refreshHomeCards(userId);
      setList(fresh);
      setErrorText(null);
      const { active, scheduled } = splitHomeCards(fresh.cards);
      const hero = pickHeroCard(active).hero;
      const ticket = scheduled[0];
      await Promise.allSettled([
        hero ? refreshCardBundle(hero.gameId, { withScores: true }) : null,
        ticket ? refreshCardBundle(ticket.gameId) : null,
      ]);
      setDeviceTick((n) => n + 1);
    } catch (err: unknown) {
      // Har vi noe fra før, blir det stående — en dårlig forbindelse skal ikke
      // tømme skjermen.
      setErrorText(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
    }
  }, [userId]);

  // Cachen først, så nettet. To effekter fordi cachen bare skal leses én gang.
  useEffect(() => {
    let cancelled = false;
    void loadHomeCards()
      .then((cached) => {
        if (!cancelled && cached) setList((current) => current ?? cached);
      })
      .catch(() => {
        // Ingen brukbar cache er ikke en feil — refetchen svarer uansett.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const split = list ? splitHomeCards(list.cards) : null;
  const { hero, rest } = pickHeroCard(split?.active ?? []);
  const ticket = split?.scheduled[0] ?? null;
  const heroId = hero?.gameId ?? null;
  const ticketId = ticket?.gameId ?? null;

  // Bundelen og slagene fra enheten for helten og billetten.
  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      heroId ? loadCardBundle(heroId) : Promise.resolve(null),
      ticketId ? loadCardBundle(ticketId) : Promise.resolve(null),
    ]).then(([heroCard, ticketCard]) => {
      if (cancelled) return;
      setHeroData(heroCard);
      setTicketBundle(ticketCard?.bundle ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [heroId, ticketId, deviceTick]);

  if (list === null && errorText === null) {
    return (
      <View style={ui.centered} testID="home-loading">
        <ActivityIndicator color={colors.primary} />
        <Text style={ui.muted}>Henter spillene dine …</Text>
      </View>
    );
  }

  if (list === null || split === null) {
    return (
      <ScrollView contentContainerStyle={ui.scroll} testID="home-screen">
        <Text style={ui.error} testID="home-error">
          Fikk ikke tak i spillene dine. Sjekk nettet og prøv igjen.
        </Text>
        <Pressable style={ui.button} onPress={() => void refresh()} testID="home-retry">
          <Text style={ui.buttonText}>{refreshing ? 'Prøver …' : 'Prøv igjen'}</Text>
        </Pressable>
      </ScrollView>
    );
  }

  const { scheduled, finished } = split;
  const empty = list.cards.length === 0;
  const model =
    hero && heroData && heroData.bundle.game.id === hero.gameId
      ? buildHeroModel({ bundle: heroData.bundle, scores: heroData.scores, userId })
      : null;
  const lastRound = finished[0] ?? null;
  const olderRounds = finished.slice(1);
  const openGame = (gameId: string) => navigation.navigate('GameHome', { gameId });

  const createGame = (
    <Pressable
      style={ui.button}
      onPress={() => navigation.navigate('CreateGame')}
      testID="home-create-game"
    >
      <Text style={ui.buttonText}>{HOME_TEXT.createGame}</Text>
    </Pressable>
  );

  return (
    <ScrollView contentContainerStyle={ui.scroll} testID="home-screen">
      <Text style={[ui.muted, styles.dateLine]} testID="home-date">
        {formatWeekdayDayMonth(new Date())}
      </Text>
      {profile ? (
        <Greeting profile={profile} onHcp={() => navigation.navigate('Profile')} />
      ) : null}

      {empty ? (
        // Samme hero-flagg som webbens tomme hjem (#1879). Stanga i `text`:
        // webben skriver `text-primary dark:text-text`, og i lys drakt er de
        // to samme farge.
        <View style={styles.empty}>
          <PinFlagHero
            color={colors.text}
            accent={colors.accent}
            size={72}
            testID="home-empty-flag"
          />
          <Text style={[ui.body, styles.emptyText]} testID="home-empty">
            Ingen spill på deg ennå. Fyr opp et selv, eller vent til noen tar deg
            med.
          </Text>
        </View>
      ) : null}

      {hero ? null : createGame}

      {hero ? (
        <HomeHeroCard
          card={hero}
          model={model}
          onOpenGame={() => openGame(hero.gameId)}
          onHole={(holeNumber) =>
            navigation.navigate('Hole', { gameId: hero.gameId, holeNumber })
          }
          onSubmit={() => navigation.navigate('Scorecard', { gameId: hero.gameId })}
          onBoard={() => navigation.navigate('Leaderboard', { gameId: hero.gameId })}
          onApprove={() => navigation.navigate('Approve', { gameId: hero.gameId })}
        />
      ) : null}

      <Section
        title={HOME_TEXT.moreInProgress}
        Icon={FlaggIcon}
        cards={rest}
        onOpen={openGame}
        testID="home-active"
      />

      {ticket ? (
        <View testID="home-next-start">
          <SectionHead title={HOME_TEXT.nextStart} Icon={KalenderIcon} testID="home-next-start" />
          <NextStartTicket
            card={ticket}
            bundle={ticketBundle && ticketBundle.game.id === ticket.gameId ? ticketBundle : null}
            userId={userId}
            now={new Date()}
            onPress={() => openGame(ticket.gameId)}
          />
        </View>
      ) : null}

      <Section
        title={HOME_TEXT.myGames}
        Icon={KalenderIcon}
        cards={scheduled.slice(1)}
        onOpen={openGame}
        testID="home-scheduled"
      />

      {lastRound ? (
        <View testID="home-last-round">
          <SectionHead title={HOME_TEXT.lastRound} Icon={PokalIcon} testID="home-last-round" />
          <LastRoundCard
            card={lastRound}
            score={list.lastRound}
            onPress={() => openGame(lastRound.gameId)}
          />
          {showAllRounds
            ? olderRounds.map((card) => (
                <LastRoundCard
                  key={card.gameId}
                  card={card}
                  score={null}
                  onPress={() => openGame(card.gameId)}
                />
              ))
            : null}
          {olderRounds.length > 0 ? (
            <Pressable
              style={[ui.link, styles.allRounds]}
              accessibilityRole="button"
              accessibilityState={{ expanded: showAllRounds }}
              onPress={() => setShowAllRounds((open) => !open)}
              testID="home-all-rounds"
            >
              <Text style={ui.linkText}>
                {showAllRounds ? HOME_TEXT.showFewer : HOME_TEXT.allRounds}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {hero ? createGame : null}

      {errorText ? (
        <Text style={ui.muted} testID="home-stale">
          Viser lagrede spill — fikk ikke kontakt med serveren.
        </Text>
      ) : null}
    </ScrollView>
  );
}

/**
 * «Hei, Sigrid.» og HCP-pillen, som på webbens Hjem. Fornavnet er webbens
 * `firstName`; pillen vises bare når både handicap og dato finnes (webbens
 * regel), og kanten blir gull når handicapet er gammelt (`isHandicapStale`).
 * Trykk på pillen åpner profil-rommet, der handicapet oppdateres.
 */
function Greeting({ profile, onHcp }: { profile: OwnProfile; onHcp: () => void }) {
  const { colors, ui } = useTheme();
  const name = firstName(profile.name) ?? HOME_TEXT.playerFallback;
  const hcp =
    profile.hcpIndex != null && profile.handicapUpdatedAt
      ? formatHcpNb(profile.hcpIndex)
      : null;
  const stale = hcp !== null && isHandicapStale(profile.handicapUpdatedAt);
  return (
    <View style={styles.greetingRow}>
      <Text style={[ui.title, styles.greeting]} testID="home-greeting">
        {greeting(name)}
      </Text>
      {hcp !== null ? (
        <Pressable
          onPress={onHcp}
          accessibilityRole="button"
          accessibilityLabel={hcpA11yLabel(hcp)}
          style={[
            styles.hcpPill,
            { backgroundColor: colors.surface, borderColor: stale ? colors.accent : colors.border },
          ]}
          testID="home-hcp"
        >
          <Text style={[styles.hcpLabel, { color: colors.muted }]}>{HOME_TEXT.hcp}</Text>
          <Text style={[styles.hcpValue, { color: colors.text }]}>{hcp}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function SectionHead({
  title,
  Icon,
  testID,
}: {
  title: string;
  /** Seksjonsankeret — samme ikon som webben bruker for samme ting. */
  Icon: ComponentType<IconProps>;
  testID: string;
}) {
  const { colors, ui } = useTheme();
  return (
    <View style={styles.sectionHead}>
      <Icon color={colors.muted} size={16} testID={`${testID}-icon`} />
      <Text style={[ui.sectionTitle, styles.sectionTitle]}>{title}</Text>
    </View>
  );
}

function Section({
  title,
  Icon,
  cards,
  onOpen,
  testID,
}: {
  title: string;
  Icon: ComponentType<IconProps>;
  cards: HomeCard[];
  onOpen: (gameId: string) => void;
  testID: string;
}) {
  const { colors, ui } = useTheme();
  if (cards.length === 0) return null;
  return (
    <View testID={testID}>
      <SectionHead title={title} Icon={Icon} testID={testID} />
      {cards.map((card) => (
        <Pressable
          key={card.gameId}
          style={[
            styles.gameCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
          onPress={() => onOpen(card.gameId)}
          testID={`game-card-${card.gameId}`}
        >
          <Text style={ui.value}>{card.name}</Text>
          <Text style={ui.muted}>
            {[card.courseName, formatTeeOff(card.scheduledTeeOffAt)]
              .filter((part): part is string => part != null)
              .join(' · ')}
          </Text>
          <View style={ui.badge}>
            <Text style={ui.badgeText} testID={`game-badge-${card.gameId}`}>
              {card.state
                ? ACTIVE_CARD_LABELS[card.state]
                : (STATUS_LABELS[card.status as GameStatus] ?? card.status)}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  dateLine: { fontFamily: FONTS.sansMedium },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
  },
  greeting: { flexShrink: 1 },
  hcpPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: TAP,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  hcpLabel: {
    fontSize: 10,
    fontFamily: FONTS.sansSemiBold,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  hcpValue: { fontSize: 15, fontFamily: FONTS.serifScore, fontVariant: ['tabular-nums'] },
  empty: { alignItems: 'center', gap: 16, marginVertical: 8 },
  emptyText: { textAlign: 'center' },
  // Ikon og overskrift på samme linje. `sectionTitle` bærer luften over seg
  // selv; her flyttes den til raden så ikonet følger med ned.
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16 },
  sectionTitle: { marginTop: 0 },
  gameCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginTop: 8,
    gap: 6,
  },
  allRounds: { alignSelf: 'flex-start' },
});
