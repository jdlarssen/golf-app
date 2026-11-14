// #2259 PR 2: Topplista i appen (designlerretet «Toppliste B»): sesongens topp 10
// i seire, birdies og runder for hele Tørny, med din egen plass øverst.
//
// Serveren eier tallene (`GET /api/aeresbrett`, `data/aeresbrett.ts`): klienten ser
// bare spillene du selv var med i (RLS), og brettet teller alle. Skjermen henter
// én gang når den åpnes, og «Prøv igjen» henter på nytt. Hva hver tilstand viser
// er `buildTopplisteModel` (`lib/toppliste.ts`); her står bare tilstanden og
// tegningen.
//
//  - Hentes: overskriften og fanene står, resten er flater.
//  - Uten nett og feil: kort med «Prøv igjen», uten faner og uten sesong.
//  - Ingen runder ennå: skogkort, uten faner.
//  - Bare birdie-lesingen feilet: fanene står, og «Birdies» viser sitt eget kort.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  SubtitleBone,
  TopplisteEmpty,
  TopplisteLeader,
  TopplisteList,
  TopplisteMessage,
  TopplisteSkeleton,
  TopplisteTabs,
  TopplisteYou,
} from '../components/toppliste/TopplisteParts';
import { fetchAeresbrett } from '../data/aeresbrett';
import { buildTopplisteModel, type TopplisteTab } from '../lib/toppliste';
import { TOPPLISTE_TEXT } from '../lib/topplisteCopy';
import type { ScreenProps } from '../navigation';
import { fraunces, interLine, useTheme } from '../theme';
import type { AeresbrettView } from '../../../../lib/stats/appAeresbrettView';

type Load =
  | { state: 'loading' }
  | { state: 'failed'; reason: 'offline' | 'failed' }
  | { state: 'ready'; view: AeresbrettView };

function useToppliste(): { load: Load; retry: () => void } {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void fetchAeresbrett().then((result) => {
      if (cancelled) return;
      setLoad(result.ok ? { state: 'ready', view: result.view } : { state: 'failed', reason: result.reason });
    });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setLoad({ state: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  return { load, retry };
}

export function Toppliste({ route }: ScreenProps<'Toppliste'>) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { load, retry } = useToppliste();
  const [tab, setTab] = useState<TopplisteTab>('wins');
  const selfInitials = route.params?.selfInitials;

  const model = useMemo(
    () => (load.state === 'ready' ? buildTopplisteModel(load.view, tab, { selfInitials }) : null),
    [load, tab, selfInitials],
  );

  return (
    <ScrollView
      // #1954 D3: luften under innholdet står over systemlinja (navigasjonslinja på Android, hjemindikatoren på iPhone).
      contentContainerStyle={[styles.scroll, { paddingBottom: 32 + insets.bottom, backgroundColor: colors.bg }]}
      testID="toppliste-screen"
    >
      <View style={styles.head}>
        <Text numberOfLines={1} accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          {TOPPLISTE_TEXT.heading}
        </Text>
        {load.state === 'loading' ? (
          <SubtitleBone />
        ) : (
          <Text numberOfLines={1} style={[styles.subtitle, { color: colors.muted }]} testID="toppliste-subtitle">
            {model ? model.subtitle : TOPPLISTE_TEXT.subtitle}
          </Text>
        )}
      </View>

      {load.state === 'loading' ? (
        <>
          <TopplisteTabs tab={tab} onChange={setTab} disabled />
          <TopplisteSkeleton />
        </>
      ) : load.state === 'failed' ? (
        load.reason === 'offline' ? (
          <TopplisteMessage
            heading={TOPPLISTE_TEXT.offlineHeading}
            body={TOPPLISTE_TEXT.offlineBody}
            onRetry={retry}
            testID="toppliste-offline"
          />
        ) : (
          <TopplisteMessage
            heading={TOPPLISTE_TEXT.failedHeading}
            body={TOPPLISTE_TEXT.failedBody}
            onRetry={retry}
            testID="toppliste-failed"
          />
        )
      ) : model?.kind === 'empty' ? (
        <TopplisteEmpty heading={model.heading} body={model.body} />
      ) : (
        <>
          <TopplisteTabs tab={tab} onChange={setTab} />
          {model?.kind === 'birdiesFailed' ? (
            <TopplisteMessage
              heading={model.heading}
              body={model.body}
              onRetry={retry}
              testID="toppliste-birdies-failed"
            />
          ) : model?.kind === 'board' ? (
            <>
              {model.you ? <TopplisteYou you={model.you} /> : null}
              {model.leader ? <TopplisteLeader leader={model.leader} /> : null}
              <TopplisteList rows={model.rows} />
            </>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingTop: 4, paddingBottom: 32 },
  head: { paddingHorizontal: 20 },
  // Fraunces 28/500 på 34, og undertittelen 13/16 to under (tegningen).
  title: fraunces(500, 28, 34),
  subtitle: { ...interLine(13, 16), marginTop: 2 },
});
