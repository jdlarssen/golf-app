// Native N3 (#1825): hjem — spillerens tre seksjoner.
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
import { STATUS_LABELS, type GameStatus } from '../../../../lib/games/status';
import {
  loadHomeCards,
  refreshHomeCards,
  splitHomeCards,
  type HomeCard,
} from '../data/homeList';
import { startSyncTriggers } from '../data/syncTriggers';
import {
  FlaggIcon,
  KalenderIcon,
  PinFlagHero,
  PokalIcon,
  type IconProps,
} from '../components/icons/Icons';
import { ACTIVE_CARD_LABELS, formatTeeOff } from '../lib/display';
import type { ScreenProps } from '../navigation';
import { useSession } from '../session';
import { useTheme } from '../theme';

export function Home({ navigation }: ScreenProps<'Home'>) {
  const { colors, ui } = useTheme();
  const { userId } = useSession();
  const [cards, setCards] = useState<HomeCard[] | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Drain-triggerne (nett tilbake, app i forgrunnen, intervall) skal gå så
  // lenge appen er innlogget, ikke bare mens en hull-side står åpen. Hjem er
  // rota i stacken, så her lever de like lenge som sesjonen.
  useEffect(() => startSyncTriggers(), []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const list = await refreshHomeCards(userId);
      setCards(list.cards);
      setErrorText(null);
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
      .then((list) => {
        if (!cancelled && list) setCards(list.cards);
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

  if (cards === null && errorText === null) {
    return (
      <View style={ui.centered} testID="home-loading">
        <ActivityIndicator color={colors.primary} />
        <Text style={ui.muted}>Henter spillene dine …</Text>
      </View>
    );
  }

  if (cards === null) {
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

  const { active, scheduled, finished } = splitHomeCards(cards);
  const empty = cards.length === 0;

  return (
    <ScrollView contentContainerStyle={ui.scroll} testID="home-screen">
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

      <Pressable
        style={ui.button}
        onPress={() => navigation.navigate('CreateGame')}
        testID="home-create-game"
      >
        <Text style={ui.buttonText}>Opprett spill</Text>
      </Pressable>

      <Section
        title="Pågår nå"
        Icon={FlaggIcon}
        cards={active}
        navigation={navigation}
        testID="home-active"
      />
      <Section
        title="Mine spill"
        Icon={KalenderIcon}
        cards={scheduled}
        navigation={navigation}
        testID="home-scheduled"
      />
      <Section
        title="Siste avsluttede"
        Icon={PokalIcon}
        cards={finished}
        navigation={navigation}
        testID="home-finished"
      />

      {errorText ? (
        <Text style={ui.muted} testID="home-stale">
          Viser lagrede spill — fikk ikke kontakt med serveren.
        </Text>
      ) : null}
    </ScrollView>
  );
}

function Section({
  title,
  Icon,
  cards,
  navigation,
  testID,
}: {
  title: string;
  /** Seksjonsankeret — samme ikon som webben bruker for samme ting. */
  Icon: ComponentType<IconProps>;
  cards: HomeCard[];
  navigation: ScreenProps<'Home'>['navigation'];
  testID: string;
}) {
  const { colors, ui } = useTheme();
  if (cards.length === 0) return null;
  return (
    <View testID={testID}>
      <View style={styles.sectionHead}>
        <Icon color={colors.muted} size={16} testID={`${testID}-icon`} />
        <Text style={[ui.sectionTitle, styles.sectionTitle]}>{title}</Text>
      </View>
      {cards.map((card) => (
        <Pressable
          key={card.gameId}
          style={[
            styles.gameCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
          onPress={() => navigation.navigate('GameHome', { gameId: card.gameId })}
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
});
