// native/app/src/screens/TeamConfirm.tsx
// #2840 del 3: bekreftelsene på lagsiden, etter tegningen v3.1 («Bekreftelsene»).
// Destruktive flyter får egen skjerm (CLAUDE.md), aldri en dialog i lagsiden:
//  - `TeamRemoveConfirm`: «Fjerne Kari Nord fra laget?» med den røde knappen.
//  - `TeamTransferConfirm`: «Gi kapteinsrollen til Ola Kompis?». Serveren sier nei til
//    en gjest (0228) og til en som ikke har sagt ja, og da står feilen her.
//
// Etterpå går skjermen tilbake til lagsiden (`backTo`), som spør på nytt når den får
// fokus. Er medspilleren alt borte (`not_found`), er laget endret: tilbake dit også.
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { nameInitials } from '../../../../lib/names/initials';
import { useBottomInsetUnlessKeyboard } from '../components/KeyboardInset';
import { Dock, DockButton, TeamDisc, teamStyles } from '../components/signup/TeamParts';
import {
  removeTeammate,
  transferCaptaincy,
  type TeamPageActionFailure,
  type TeamPageActionResult,
} from '../data/teamPage';
import { backTo } from '../lib/backTo';
import { ROUND_INVITE_TEXT } from '../lib/roundInviteCopy';
import {
  TEAM_PAGE_TEXT,
  describeTeamPageFailure,
  isRetryableTeamPageFailure,
  removeBody,
  removeButton,
  removeTitle,
  transferBody,
  transferTitle,
} from '../lib/teamPageCopy';
import type { ScreenProps } from '../navigation';
import { FONTS, fraunces, interLine, useTheme } from '../theme';

type Navigation = ScreenProps<'TeamRemoveConfirm'>['navigation'] | ScreenProps<'TeamTransferConfirm'>['navigation'];

function Confirm({
  navigation,
  shortId,
  name,
  captain,
  title,
  body,
  confirmLabel,
  busyLabel,
  variant,
  send,
  testID,
}: {
  navigation: Navigation;
  shortId: string;
  name: string | null;
  captain: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  busyLabel: string;
  variant: 'primary' | 'danger';
  send: () => Promise<TeamPageActionResult>;
  testID: string;
}) {
  const { colors } = useTheme();
  const bottomInset = useBottomInsetUnlessKeyboard();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TeamPageActionFailure | null>(null);
  const sending = useRef(false);

  const confirm = async () => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    const result = await send();
    sending.current = false;
    setBusy(false);
    if (result.ok || result.reason === 'not_found') {
      // Har du gått tilbake mens svaret var på vei, står du alt på lagsiden.
      if (navigation.isFocused()) backTo(navigation, 'TeamPage', { shortId });
      return;
    }
    setError(result.reason);
  };

  const retry = error !== null && isRetryableTeamPageFailure(error);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]} testID={testID}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.disc}>
          <TeamDisc kind="other" label={nameInitials(name)} size="lg" captain={captain} ground={colors.bg} />
        </View>
        <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header" testID={`${testID}-title`}>
          {title}
        </Text>
        <View style={[teamStyles.block, { backgroundColor: colors.surface }]}>
          <Text style={[teamStyles.body, { color: colors.text }]} testID={`${testID}-body`}>
            {body}
          </Text>
        </View>
      </ScrollView>
      <Dock bottomInset={bottomInset}>
        {error ? (
          <Text style={[styles.error, { color: colors.danger }]} testID={`${testID}-error`}>
            {describeTeamPageFailure(error)}
          </Text>
        ) : null}
        <DockButton
          label={busy ? busyLabel : retry ? ROUND_INVITE_TEXT.retry : confirmLabel}
          variant={variant}
          busy={busy}
          onPress={() => void confirm()}
          testID={`${testID}-confirm`}
        />
        <DockButton
          label={TEAM_PAGE_TEXT.cancel}
          variant="line"
          busy={busy}
          onPress={() => navigation.goBack()}
          testID={`${testID}-cancel`}
        />
      </Dock>
    </View>
  );
}

export function TeamRemoveConfirm({ navigation, route }: ScreenProps<'TeamRemoveConfirm'>) {
  const { shortId, requestId, name, teamName, pending } = route.params;
  return (
    <Confirm
      navigation={navigation}
      shortId={shortId}
      name={name}
      captain={false}
      title={removeTitle(name)}
      body={removeBody(name, teamName, pending)}
      confirmLabel={removeButton(name)}
      busyLabel={TEAM_PAGE_TEXT.removing}
      variant="danger"
      send={() => removeTeammate(shortId, requestId)}
      testID="team-remove"
    />
  );
}

export function TeamTransferConfirm({ navigation, route }: ScreenProps<'TeamTransferConfirm'>) {
  const { shortId, requestId, name, teamName } = route.params;
  return (
    <Confirm
      navigation={navigation}
      shortId={shortId}
      name={name}
      captain
      title={transferTitle(name)}
      body={transferBody(name, teamName)}
      confirmLabel={TEAM_PAGE_TEXT.transfer}
      busyLabel={TEAM_PAGE_TEXT.transferring}
      variant="primary"
      send={() => transferCaptaincy(shortId, requestId)}
      testID="team-transfer"
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingBottom: 20 },
  // `.head` med skiva: 18 over, 20 fra kanten.
  disc: { paddingTop: 18, paddingHorizontal: 20, alignItems: 'flex-start' },
  // `.stitle`: 12 over, 20 fra kanten, Fraunces 26.
  title: { ...fraunces(500, 26, 31.2, { multiline: true }), paddingTop: 12, paddingHorizontal: 20 },
  error: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans, textAlign: 'center' },
});
