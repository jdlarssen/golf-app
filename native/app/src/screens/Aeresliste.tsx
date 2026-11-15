// #2894 PR 2: Æreslista (designlerretet, `Deling-med-alle-2`, gruppe 12): hver hole-in-one
// og albatross i Tørny, alle år. Øverst det nyeste slaget i et skogkort, så ett kort per år
// med de nyeste først. Åpnes fra lenka nederst i «Sjeldne slag» på Topplista, fra banneret
// på Hjem og (PR 3) fra varselet; toppen sier hvor den ble åpnet fra (`navigation.tsx`).
//
// Serveren eier lista (`GET /api/aeresliste`, `data/aeresliste.ts`), med samme
// personvernregel som Topplista: den som har slått av «Del sjeldne slag med alle», står
// ikke her. Skjermen henter én gang når den åpnes, og «Prøv igjen» henter på nytt. Hva hver
// tilstand viser, er `buildAereslisteModel` (`lib/aeresliste.ts`).
//
//  - Hentes: tittelen står, resten er flater.
//  - Uten nett og feil: samme kort som Topplista, med «Prøv igjen».
//  - Ingen slag ennå: skogkortet «Ingen ennå».
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AereslisteHero, AereslisteSkeleton, AereslisteYear } from '../components/toppliste/AereslisteParts';
import { SubtitleBone, TopplisteEmpty, TopplisteMessage } from '../components/toppliste/TopplisteParts';
import { fetchAeresliste } from '../data/aeresliste';
import { buildAereslisteModel } from '../lib/aeresliste';
import { TOPPLISTE_TEXT } from '../lib/topplisteCopy';
import type { ScreenProps } from '../navigation';
import { fraunces, interLine, useTheme } from '../theme';
import type { AereslisteView } from '../../../../lib/stats/aeresliste';

type Load =
  | { state: 'loading' }
  | { state: 'failed'; reason: 'offline' | 'failed' }
  | { state: 'ready'; view: AereslisteView };

function useAeresliste(): { load: Load; retry: () => void } {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void fetchAeresliste().then((result) => {
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

export function Aeresliste(_props: ScreenProps<'Aeresliste'>) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { load, retry } = useAeresliste();
  const model = useMemo(() => (load.state === 'ready' ? buildAereslisteModel(load.view) : null), [load]);

  return (
    <ScrollView
      contentContainerStyle={[styles.scroll, { paddingBottom: 32 + insets.bottom, backgroundColor: colors.bg }]}
      testID="aeresliste-screen"
    >
      <View style={styles.head}>
        <Text numberOfLines={1} accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          {TOPPLISTE_TEXT.aeresHeading}
        </Text>
        {load.state === 'loading' ? (
          <SubtitleBone />
        ) : (
          <Text numberOfLines={1} style={[styles.subtitle, { color: colors.muted }]}>
            {TOPPLISTE_TEXT.aeresSubtitle}
          </Text>
        )}
      </View>

      {load.state === 'loading' ? (
        <AereslisteSkeleton />
      ) : load.state === 'failed' ? (
        load.reason === 'offline' ? (
          <TopplisteMessage
            heading={TOPPLISTE_TEXT.offlineHeading}
            body={TOPPLISTE_TEXT.offlineBody}
            onRetry={retry}
            testID="aeresliste-offline"
          />
        ) : (
          <TopplisteMessage
            heading={TOPPLISTE_TEXT.aeresFailedHeading}
            body={TOPPLISTE_TEXT.failedBody}
            onRetry={retry}
            testID="aeresliste-failed"
          />
        )
      ) : model?.kind === 'list' ? (
        <>
          <AereslisteHero hero={model.hero} />
          {model.years.map((year) => (
            <AereslisteYear key={year.year} year={year} />
          ))}
        </>
      ) : (
        <TopplisteEmpty
          heading={TOPPLISTE_TEXT.aeresEmptyHeading}
          body={TOPPLISTE_TEXT.aeresEmptyBody}
          testID="aeresliste-empty"
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingTop: 4, paddingBottom: 32 },
  head: { paddingHorizontal: 20 },
  // Fraunces 28/500 og undertittelen 13 to under, som Topplista (tegningen).
  title: fraunces(500, 28, 34),
  subtitle: { ...interLine(13, 16), marginTop: 2 },
});
