// #2265 PR 2: Kavalkaden i appen, som webbens side
// (`app/[locale]/kavalkade/[year]/page.tsx`): golfåret ditt som bla-bar
// kortstokk.
//
// Serveren avgjør alt (`GET /api/kavalkade/{år}`, `data/kavalkade.ts`), og
// skjermen viser de samme tre svarene som webben:
//
//  - `closed`: før 24. desember, «Kavalkaden kommer». Ingen rad skrives, og
//    modellen kalles ikke.
//  - `preview`: admin før datoen, med et banner over kortene. Ingen
//    innledning og ingen deling, for ingenting er lagret.
//  - `ready`: den lagrede kavalkaden, med «Del kortet» på kortene som kan
//    deles.
//
// Har spilleren ingen ferdige runder i året, står webbens tomtilstand. Mens
// den laster, står webbens skjelett uten ventetekst (første åpning etter
// slippet kan ta opptil et minutt). Uten nett, eller når kallet ryker, står en
// feillinje med «Prøv igjen», og neste forsøk leser raden serveren har skrevet.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { buildKavalkadeCardModel, isKavalkadeCardKind } from '../../../../lib/kavalkade/cardModel';
import { buildKavalkadeDeck, isKavalkadeEmpty } from '../../../../lib/kavalkade/kavalkadeCards';
import { KAVALKADE_YEAR } from '../../../../lib/kavalkade/release';
import { ShareKavalkadeCardButton } from '../components/kavalkade/ShareKavalkadeCardButton';
import { webCardShadow } from '../components/kavalkade/KavalkadeCard';
import { KavalkadeDeck } from '../components/kavalkade/KavalkadeDeck';
import { KavalkadeSkeleton, PAGE_GUTTER } from '../components/kavalkade/KavalkadeSkeleton';
import { fetchKavalkade, type KavalkadeView } from '../data/kavalkade';
import { formatDayMonthLong } from '../lib/homeDates';
import {
  KAVALKADE_APP_TEXT,
  KAVALKADE_SHARE_TEXT,
  kavalkadeShareT,
  kavalkadeT as t,
} from '../lib/kavalkadeCopy';
import type { ScreenProps } from '../navigation';
import { FONTS, fraunces, interLine, useTheme, withAlpha } from '../theme';

type Load = { state: 'loading' } | { state: 'failed' } | { state: 'ready'; view: KavalkadeView };

function useKavalkade(): { load: Load; retry: () => void } {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void fetchKavalkade(KAVALKADE_YEAR).then((result) => {
      if (cancelled) return;
      setLoad(result.ok ? { state: 'ready', view: result.view } : { state: 'failed' });
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

/** Kort med kicker, overskrift og brødtekst: «kommer» og tomtilstanden. */
function MessageCard({ heading, body, testID }: { heading: string; body: string; testID: string }) {
  const { colors, scheme } = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border, boxShadow: webCardShadow(scheme) },
      ]}
      testID={testID}
    >
      <Text style={[styles.kicker, { color: colors.muted }]}>{t('kicker').toUpperCase()}</Text>
      <Text accessibilityRole="header" style={[styles.messageHeading, { color: colors.text }]}>
        {heading}
      </Text>
      <Text style={[styles.messageBody, { color: colors.muted }]}>{body}</Text>
    </View>
  );
}

/** Admin-forhåndsvisningen sier tydelig at ingen andre ser dette ennå. */
function PreviewBanner() {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.banner,
        { backgroundColor: withAlpha(colors.accent, 0.1), borderColor: withAlpha(colors.accent, 0.4) },
      ]}
      testID="kavalkade-preview"
    >
      <Text style={[styles.bannerText, { color: colors.text }]}>{t('previewBadge')}</Text>
    </View>
  );
}

function content(view: KavalkadeView): ReactNode {
  if (view.status === 'closed') {
    return <MessageCard heading={t('closedHeading')} body={t('closedBody')} testID="kavalkade-closed" />;
  }

  const { facts } = view;
  const preview = view.status === 'preview' ? <PreviewBanner /> : null;

  if (isKavalkadeEmpty(facts)) {
    return (
      <>
        {preview}
        <MessageCard
          heading={t('emptyHeading', { year: facts.year })}
          body={t('emptyBody')}
          testID="kavalkade-empty"
        />
      </>
    );
  }

  const narrative = view.status === 'ready' ? view.narrative : null;
  // Deleknappene bare på den lagrede kavalkaden, som på webben: i
  // forhåndsvisningen finnes ingen rad å dele fra.
  const action =
    view.status === 'ready'
      ? (id: string) => {
          if (!isKavalkadeCardKind(id)) return null;
          const model = buildKavalkadeCardModel(facts, id, {
            t: kavalkadeShareT,
            formatDate: formatDayMonthLong,
            playerFallback: KAVALKADE_SHARE_TEXT.playerFallback,
          });
          return model ? <ShareKavalkadeCardButton year={facts.year} model={model} /> : null;
        }
      : undefined;

  return (
    <>
      {preview}
      <View>
        <HeadingText>{t('heading', { year: facts.year })}</HeadingText>
        <KavalkadeDeck deck={buildKavalkadeDeck(facts, narrative)} action={action} />
      </View>
    </>
  );
}

function HeadingText({ children }: { children: string }) {
  const { colors } = useTheme();
  return (
    <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]} testID="kavalkade-heading">
      {children}
    </Text>
  );
}

export function Kavalkade(_props: ScreenProps<'Kavalkade'>) {
  const { colors, ui } = useTheme();
  const { load, retry } = useKavalkade();

  return (
    <ScrollView
      contentContainerStyle={[styles.scroll, { backgroundColor: colors.bg }]}
      testID="kavalkade-screen"
    >
      {load.state === 'loading' ? (
        <KavalkadeSkeleton />
      ) : load.state === 'failed' ? (
        <View style={styles.failed}>
          <Text style={ui.error} testID="kavalkade-error">
            {KAVALKADE_APP_TEXT.loadFailed}
          </Text>
          <Pressable accessibilityRole="button" style={ui.buttonSecondary} onPress={retry} testID="kavalkade-retry">
            <Text style={ui.buttonSecondaryText}>{KAVALKADE_APP_TEXT.retry}</Text>
          </Pressable>
        </View>
      ) : (
        content(load.view)
      )}
    </ScrollView>
  );
}

// Webben: innholdet står 16 under toppstripa (`mb-4`), med `px-5` og `space-y-4`.
// Overskriften er Fraunces 24/500 med `leading-tight` og `mb-4`. Kortene er
// webbens `Card` (`p-6`, `rounded-2xl`), banneret `rounded-xl px-4 py-3` med
// tekst 14/500.
const HEADING = fraunces(500, 24, 30);
const KICKER = interLine(10, 15);
const BODY = interLine(14, 22.75, { multiline: true });
const BANNER = interLine(14, 20, { multiline: true });

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: PAGE_GUTTER, paddingTop: 16, paddingBottom: 32, gap: 16 },
  failed: { gap: 8 },
  heading: { ...HEADING, marginBottom: HEADING.marginBottom + 16, fontVariant: ['tabular-nums'] },
  card: { borderWidth: 1, borderRadius: 16, padding: 24 },
  kicker: { ...KICKER, fontFamily: FONTS.sansSemiBold, letterSpacing: 2 },
  messageHeading: { ...HEADING, marginTop: HEADING.marginTop + 8 },
  messageBody: { ...BODY, fontFamily: FONTS.sans, marginTop: BODY.marginTop + 12 },
  banner: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 },
  bannerText: { ...BANNER, fontFamily: FONTS.sansMedium, letterSpacing: -0.35 },
});
