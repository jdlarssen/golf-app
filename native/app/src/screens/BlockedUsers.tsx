// #3019: «Blokkerte» under «Personvern og konto» (tegning 12 og 13). Hver rad
// har «Opphev», så spilleren slipper å finne personen først. Spørsmålet før
// opphevingen er telefonens egen dialog, som «Fjern venn».
//
// Lista leses fra `GET /api/blocks` hver gang skjermen får fokus; opphevingen
// er appens egen sletting i `user_blocks` (`data/blocks.ts`).
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tap } from '../components/Tap';
import { PageTitle } from '../components/PageTitle';
import { Avatar } from '../components/friends/FriendParts';
import { listBlocks, unblockUser, type BlockedPerson } from '../data/blocks';
import {
  MODERATION_TEXT,
  blockedOnLabel,
  describeBlockFailure,
  unblockMessage,
} from '../lib/moderationCopy';
import type { ScreenProps } from '../navigation';
import { FONTS, interLine, useTheme } from '../theme';

type Load =
  | { state: 'loading' }
  | { state: 'failed' }
  | { state: 'ready'; blocks: BlockedPerson[] };

export function BlockedUsers(_props: ScreenProps<'BlockedUsers'>) {
  const { colors, ui } = useTheme();
  const insets = useSafeAreaInsets();
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [line, setLine] = useState<string | null>(null);
  const inFlight = useRef(false);

  const reload = useCallback(async () => {
    const result = await listBlocks();
    setLoad(result.ok ? { state: 'ready', blocks: result.blocks } : { state: 'failed' });
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const unblock = useCallback(
    async (person: BlockedPerson) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setBusyId(person.userId);
      setLine(null);
      const result = await unblockUser(person.userId);
      inFlight.current = false;
      setBusyId(null);
      if (!result.ok) setLine(describeBlockFailure(result.reason));
      // Uten nett ville en ny lesing også feilet og byttet lista mot feilboksen.
      if (result.ok || result.reason !== 'offline') await reload();
    },
    [reload],
  );

  const onUnblock = useCallback(
    (person: BlockedPerson, name: string) => {
      Alert.alert(
        MODERATION_TEXT.unblockTitle,
        unblockMessage(name),
        [
          { text: MODERATION_TEXT.cancel, style: 'cancel' },
          { text: MODERATION_TEXT.unblock, style: 'destructive', onPress: () => void unblock(person) },
        ],
        { cancelable: false },
      );
    },
    [unblock],
  );

  return (
    <ScrollView
      contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24, backgroundColor: colors.bg }]}
      testID="blocked-users-screen"
    >
      <View style={styles.head}>
        <PageTitle size="settings" title={MODERATION_TEXT.blockedTitle} subtitle={MODERATION_TEXT.blockedLede} />
      </View>

      {load.state === 'loading' ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : load.state === 'failed' ? (
        <View style={styles.failed}>
          <Text style={ui.error} testID="blocked-users-failed">
            {MODERATION_TEXT.blockedLoadFailed}
          </Text>
          <Tap
            style={[styles.retry, { borderColor: colors.primary }]}
            onPress={() => {
              setLoad({ state: 'loading' });
              void reload();
            }}
            accessibilityRole="button"
            testID="blocked-users-retry"
          >
            <Text style={[styles.retryText, { color: colors.primary }]}>{MODERATION_TEXT.retry}</Text>
          </Tap>
        </View>
      ) : load.blocks.length === 0 ? (
        <Text style={[styles.empty, { color: colors.muted }]} testID="blocked-users-empty">
          {MODERATION_TEXT.blockedEmpty}
        </Text>
      ) : (
        <>
          <View
            style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
            testID="blocked-users-list"
          >
            {load.blocks.map((person, i) => {
              const name = person.name ?? '—';
              const busy = busyId === person.userId;
              return (
                <View
                  key={person.userId}
                  style={[
                    styles.row,
                    i < load.blocks.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.divider },
                  ]}
                  testID={`blocked-user-${person.userId}`}
                >
                  <Avatar name={name} tone="strong" size={40} />
                  <View style={styles.rowText}>
                    <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                      {name}
                    </Text>
                    <Text style={[styles.date, { color: colors.muted }]}>{blockedOnLabel(person.blockedAt)}</Text>
                  </View>
                  <Tap
                    style={[styles.unblock, { borderColor: colors.primary }, busy && styles.off]}
                    hitSlop={{ top: 4, bottom: 4 }}
                    onPress={() => onUnblock(person, name)}
                    disabled={busyId !== null}
                    accessibilityRole="button"
                    accessibilityLabel={`${MODERATION_TEXT.unblock} ${name}`}
                    testID={`blocked-user-unblock-${person.userId}`}
                  >
                    <Text style={[styles.unblockText, { color: colors.primary }]}>
                      {busy ? MODERATION_TEXT.unblocking : MODERATION_TEXT.unblock}
                    </Text>
                  </Tap>
                </View>
              );
            })}
          </View>
          <Text style={[styles.note, { color: colors.muted }]}>{MODERATION_TEXT.blockedNote}</Text>
        </>
      )}
      {line ? (
        <Text style={[ui.error, styles.line]} testID="blocked-users-error">
          {line}
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1 },
  // «Personvern og konto» får kanten fra rullefeltet (16 + PageTitles 4); her
  // står kortet med egen kant, så tittelen får sin egen.
  head: { marginHorizontal: 16 },
  centered: { paddingVertical: 32, alignItems: 'center' },
  failed: { marginTop: 18, marginHorizontal: 20, gap: 12 },
  retry: { minHeight: 44, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  retryText: { fontSize: 15, fontFamily: FONTS.sansSemiBold },
  empty: { ...interLine(15, 21), fontFamily: FONTS.sans, marginTop: 18, marginHorizontal: 20 },
  // Tegning 12: kortet 18 under ingressen, radene 64 høye med 14 inn.
  card: { marginTop: 18, marginHorizontal: 16, borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 10, paddingHorizontal: 14 },
  rowText: { flex: 1, minWidth: 0 },
  name: { ...interLine(15, 20), fontFamily: FONTS.sansSemiBold },
  date: { ...interLine(12, 16), fontFamily: FONTS.sans, marginTop: 2 },
  unblock: { minHeight: 36, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, justifyContent: 'center' },
  unblockText: { fontSize: 14, fontFamily: FONTS.sansSemiBold },
  off: { opacity: 0.45 },
  note: { ...interLine(12, 16, { multiline: true }), fontFamily: FONTS.sans, marginTop: 12, marginHorizontal: 20 },
  line: { marginTop: 12, marginHorizontal: 20 },
});
