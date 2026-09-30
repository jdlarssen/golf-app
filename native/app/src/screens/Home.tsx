// Native N3 (#1825): hjem — spillerens spill.
//
// Cachen tegnes med én gang og refetchen skjer i bakgrunnen (samme mønster som
// spill-bundelen). Derfor ser skjermen aldri tom ut mens nettet henter, og en
// feilet refetch lar den forrige lista stå: feilteksten dukker bare opp når vi
// ikke har noe å vise i det hele tatt.
//
// #1906 tok footeren bort. E-posten, «Konto», «Sync-lab» og «Logg ut» lå der
// som fire lenker under spillene dine — alt sammen ting som handler om deg og
// ikke om runden. De bor i profil-rommet nå. Hjem handler igjen bare om spill.
//
// #2385: Hjem har ingen navigasjonslinje (designlerretet). Veien til
// profil-rommet er lenka «Profil» til høyre på datolinja, til bunnmenyen kommer
// (eierens svar 29.09: «Profil står oppe til høyre til da»).
//
// #2254 gjorde Hjem til startboden. Fra toppen: datoen, hilsenen med
// HCP-pillen, heltekortet for runden du er midt i (med godkjenningsraden
// under), «Flere runder i gang», billetten for neste start, «Mine spill» og
// «Forrige runde». «Opprett spill» står nederst når en runde pågår, og øverst
// ellers, som før (eierens svar på #2254).
//
// #2385 la toppen og margene på designlerretet (`Hjem-forslag`): datoen står
// 16 pt under statuslinja og tett over hilsenen, HCP-pillen står til høyre for
// hilsenen, seksjonsoverskriftene er små sperrede versaler uten ikon, kortene
// står 16 pt fra kanten og tekstene 20 pt inn.
//
// Heltekortet og billetten leser spill-bundelen og slagene som ligger på
// enheten (`data/homeHero.ts`). Hvert fokus leser dem på nytt med én gang, så
// et hull tastet i flymodus flytter ringen også uten nett, og henter dem så fra
// serveren når lista har svart.
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { PinFlagHero } from '../components/icons/Icons';
import { ACTIVE_CARD_LABELS, formatTeeOff } from '../lib/display';
import { HOME_TEXT, greeting, hcpA11yLabel } from '../lib/homeCopy';
import { formatWeekdayDayMonth } from '../lib/homeDates';
import { buildHeroModel, pickHeroCard } from '../lib/homeHero';
import { PROFILE_TEXT, formatHcpNb } from '../lib/profileCopy';
import type { ScreenProps } from '../navigation';
import { useSession } from '../session';
import { FONTS, useTheme } from '../theme';

export function Home({ navigation }: ScreenProps<'Home'>) {
  const { colors, ui } = useTheme();
  const { userId } = useSession();
  // Uten navigasjonslinje står innholdet rett under statuslinja.
  const insets = useSafeAreaInsets();
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
      <ScrollView
        contentContainerStyle={[ui.scroll, { paddingTop: insets.top + 20 }]}
        testID="home-screen"
      >
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
    <ScrollView
      contentContainerStyle={[ui.scroll, styles.scroll, { paddingTop: insets.top + 16 }]}
      testID="home-screen"
    >
      <Top
        profile={profile}
        onProfile={() => navigation.navigate('Profile')}
        onHcp={() => navigation.navigate('Profile')}
      />

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
          onApprove={() => navigation.navigate('Approve', { gameId: hero.gameId })}
        />
      ) : null}

      <Section
        title={HOME_TEXT.moreInProgress}
        cards={rest}
        onOpen={openGame}
        testID="home-active"
      />

      {ticket ? (
        <View testID="home-next-start">
          <SectionHead title={HOME_TEXT.nextStart} />
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
        cards={scheduled.slice(1)}
        onOpen={openGame}
        testID="home-scheduled"
      />

      {lastRound ? (
        <View testID="home-last-round">
          <SectionHead title={HOME_TEXT.lastRound} />
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
 * Datoen med «Profil» til høyre, og under den «Hei, Sigrid.» med HCP-pillen,
 * som på webbens Hjem. Fornavnet er webbens `firstName`; pillen vises bare når
 * både handicap og dato finnes (webbens regel), og kanten blir gull når
 * handicapet er gammelt (`isHandicapStale`). Både lenka og pillen åpner
 * profil-rommet, der handicapet oppdateres. Uten profil står datoen og lenka.
 */
function Top({
  profile,
  onProfile,
  onHcp,
}: {
  profile: OwnProfile | null;
  onProfile: () => void;
  onHcp: () => void;
}) {
  const { colors } = useTheme();
  const name = profile ? (firstName(profile.name) ?? HOME_TEXT.playerFallback) : null;
  const hcp =
    profile?.hcpIndex != null && profile.handicapUpdatedAt
      ? formatHcpNb(profile.hcpIndex)
      : null;
  const stale = hcp !== null && isHandicapStale(profile?.handicapUpdatedAt ?? null);
  return (
    <View style={styles.top}>
      <View style={styles.topRow}>
        <Text style={[styles.dateLine, { color: colors.muted }]} testID="home-date">
          {formatWeekdayDayMonth(new Date())}
        </Text>
        <Pressable
          onPress={onProfile}
          accessibilityRole="link"
          // Lenka er én liten tekstlinje; slakken gir den 44 pt å treffe på
          // uten å skyve hilsenen ned.
          hitSlop={PROFILE_SLOP}
          testID="open-profile"
        >
          <Text style={[styles.profileLink, { color: colors.primary }]}>
            {PROFILE_TEXT.heading}
          </Text>
        </Pressable>
      </View>
      <View style={styles.topRow}>
        {name !== null ? (
          <Text style={[styles.greeting, { color: colors.text }]} testID="home-greeting">
            {greeting(name)}
          </Text>
        ) : null}
        {hcp !== null ? (
          <Pressable
            onPress={onHcp}
            hitSlop={HCP_SLOP}
            accessibilityRole="button"
            accessibilityLabel={hcpA11yLabel(hcp)}
            style={[
              styles.hcpPill,
              { backgroundColor: colors.surface, borderColor: stale ? colors.accent : colors.border },
            ]}
            testID="home-hcp"
          >
            <View style={styles.hcpInner}>
              <Text style={[styles.hcpLabel, { color: colors.muted }]}>{HOME_TEXT.hcp}</Text>
              <Text style={[styles.hcpValue, { color: colors.text }]}>{hcp}</Text>
            </View>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** Seksjonsoverskriften: små sperrede versaler, uten ikon, som i designet. */
function SectionHead({ title }: { title: string }) {
  const { ui } = useTheme();
  return (
    <Text accessibilityRole="header" style={[ui.kicker, styles.sectionHead]}>
      {title}
    </Text>
  );
}

function Section({
  title,
  cards,
  onOpen,
  testID,
}: {
  title: string;
  cards: HomeCard[];
  onOpen: (gameId: string) => void;
  testID: string;
}) {
  const { colors, ui } = useTheme();
  if (cards.length === 0) return null;
  return (
    <View testID={testID}>
      <SectionHead title={title} />
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

/** Tekstene står 20 pt inn, kortene 16 (designet): 4 pt ekstra på tekstene. */
const TEXT_INSET = 4;

/** «Profil» er rundt 15 pt høy og 35 bred; slakken gir minst 44 pt å treffe på. */
const PROFILE_SLOP = { top: 15, bottom: 15, left: 12, right: 12 };

/** HCP-pillen er rundt 34 pt høy; slakken gir 44 pt å treffe på. */
const HCP_SLOP = { top: 5, bottom: 5, left: 5, right: 5 };

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 16, paddingTop: 16 },
  top: { marginHorizontal: TEXT_INSET },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  dateLine: { flexShrink: 1, fontSize: 12, fontFamily: FONTS.sans },
  // Samme høyde som datoen, så lenka ikke gjør datolinja høyere.
  profileLink: { fontSize: 12, fontFamily: FONTS.sansSemiBold },
  greeting: { flexShrink: 1, fontSize: 28, fontFamily: FONTS.serifDisplay, marginTop: 2 },
  // Ikke høyere enn hilsenlinja (rundt 34 pt), så raden ikke skyver hilsenen
  // ned og datoen står tett over den som i designet; `hitSlop` gir 44 pt å
  // treffe på.
  hcpPill: {
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  hcpInner: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  hcpLabel: {
    fontSize: 10,
    fontFamily: FONTS.sansSemiBold,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  hcpValue: { fontSize: 18, fontFamily: FONTS.serifScore, fontVariant: ['tabular-nums'] },
  empty: { alignItems: 'center', gap: 16, marginVertical: 8 },
  emptyText: { textAlign: 'center' },
  // 22 pt luft over (14 + mellomrommet i lista) og 8 under, som i designet.
  sectionHead: { marginTop: 14, marginHorizontal: TEXT_INSET },
  gameCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginTop: 8,
    gap: 6,
  },
  allRounds: { alignSelf: 'flex-start' },
});
