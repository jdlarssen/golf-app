// native/app/src/components/signup/TeamLink.tsx
// #2840 del 3: raden til lagsiden på påmeldingsskjermen og på runden før start.
// Tegningen v3.1, «Veien inn fra runden»: de små skivene til dem som er med på laget,
// lagnavnet, «Laget ditt · 2 av 3 har svart ja» og en pil.
//
// Raden henter laget selv (`GET /api/pamelding/[shortId]/lag`) og står bare når du er
// kaptein eller medspiller. Uten nett, uten lag eller med en feil står ingenting: raden
// er en snarvei, ikke et sted å vise feil.
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import type { AppTeamPageTeam } from '../../../../../lib/games/appRoundInviteView';
import { nameInitials } from '../../../../../lib/names/initials';
import { fetchTeamPage } from '../../data/teamPage';
import { teamLinkLine, teamTitle } from '../../lib/teamPageCopy';
import { teamLineup } from '../../lib/teamPageModel';
import { FONTS, interLine, useTheme } from '../../theme';
import { TeamDisc } from './TeamParts';

export function TeamLink({
  shortId,
  onOpen,
  style,
}: {
  shortId: string;
  onOpen: () => void;
  /** På runden står raden i skjermens egen kant og luft. */
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const [team, setTeam] = useState<AppTeamPageTeam | null>(null);
  const latest = useRef(0);

  // Ved fokus: kommer du tilbake fra lagsiden, kan laget ha endret seg.
  useFocusEffect(
    useCallback(() => {
      const thisLoad = ++latest.current;
      void fetchTeamPage(shortId).then((result) => {
        if (thisLoad !== latest.current) return;
        if (result.ok && (result.view.kind === 'captain' || result.view.kind === 'member')) setTeam(result.view);
        else if (result.ok) setTeam(null);
        // En feil lar raden stå som den sto.
      });
    }, [shortId]),
  );

  if (!team) return null;
  const title = teamTitle(team);
  // De som er med på laget nå: ikke de som har takket nei, og ingen ledige plasser.
  const people = teamLineup(team).flatMap((entry) => (entry.kind === 'person' && !entry.declined ? [entry] : []));
  const line = teamLinkLine(team);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${line}`}
      onPress={onOpen}
      style={({ pressed }) => [styles.link, { backgroundColor: colors.surface }, style, pressed ? styles.pressed : null]}
      testID="team-link"
    >
      <View style={styles.mini}>
        {people.map((entry) => (
          <TeamDisc
            key={entry.key}
            kind={entry.isYou ? 'me' : 'other'}
            label={nameInitials(entry.name)}
            size="sm"
            ground={colors.surface}
          />
        ))}
      </View>
      <View style={styles.text}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1} testID="team-link-title">
          {title}
        </Text>
        <Text style={[styles.line, { color: colors.muted }]} numberOfLines={1} testID="team-link-line">
          {line}
        </Text>
      </View>
      <Text style={[styles.chev, { color: colors.primary }]}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // `.link`: 12 over, 16 fra kanten, minst 60 høy, 18 i hjørnene, 8/14 inni, 12 mellom delene.
  link: {
    marginTop: 12,
    marginHorizontal: 16,
    minHeight: 60,
    borderRadius: 18,
    paddingVertical: 8,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  // `.mini`: 6 mellom skivene.
  mini: { flexDirection: 'row', gap: 6 },
  text: { flex: 1, minWidth: 0 },
  title: { ...interLine(15, 19), fontFamily: FONTS.sansSemiBold },
  line: { ...interLine(13, 16), fontFamily: FONTS.sans, fontVariant: ['tabular-nums'] },
  chev: { fontSize: 20 },
  pressed: { opacity: 0.6 },
});
