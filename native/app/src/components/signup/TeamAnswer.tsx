// native/app/src/components/signup/TeamAnswer.tsx
// #2840: de andre lagflatene på påmeldingsskjermen, etter tegningen v3.1:
//  - `TeamInviteAnswer`: svaret på invitasjonen (flate 2). En kaptein har satt deg på
//    laget sitt. Du ser hvem som er med, og svarer «Bli med på laget» eller «Nei takk».
//  - `TeamSent`: «Laget er sendt til arrangøren», med svaret per venn (flate 1, «Sendt»).
//  - `TeamRoundFull`: «Runden er full» i stedet for skjemaet (flate 1, «Runden er full»).
import { useCallback, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { AppRoundInviteView, AppTeamSignupInvited } from '../../../../../lib/games/appRoundInviteView';
import { nameInitials } from '../../../../../lib/names/initials';
import { acceptTeamInvite, declineTeamInvite } from '../../data/roundInvite';
import { ROUND_INVITE_TEXT } from '../../lib/roundInviteCopy';
import { selfMemberIndex } from '../../lib/teamLineup';
import {
  TEAM_SIGNUP_TEXT,
  type TeamSignupFailureWithText,
  describeTeamSignupFailure,
  firstName,
  fullRoundPlace,
  inviteBody,
  inviteTitle,
  isRetryableTeamFailure,
  slotResultLabel,
  teamRoundLine,
} from '../../lib/teamSignupCopy';
import { FONTS, interLine, useTheme } from '../../theme';
import { useBottomInsetUnlessKeyboard } from '../KeyboardInset';
import { Dock, DockButton, Lineup, LineupCell, TeamDisc, teamStyles } from './TeamParts';
import type { SentTeam } from './TeamSignupForm';

/** Overskriften og linja under: `.head` i tegningen. */
function Head({ title, place, testID }: { title: string; place: string; testID: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.head}>
      <Text style={[teamStyles.heading, { color: colors.text }]} accessibilityRole="header" testID={`${testID}-title`}>
        {title}
      </Text>
      <Text style={[teamStyles.meta, { color: colors.muted }]} testID={`${testID}-place`}>
        {place}
      </Text>
    </View>
  );
}

export function TeamInviteAnswer({
  shortId,
  round,
  invited,
  onDone,
}: {
  shortId: string;
  round: AppRoundInviteView['round'];
  invited: AppTeamSignupInvited;
  /** Svaret er sendt, eller runden har endret seg: spør på nytt og vis det som gjelder. */
  onDone: () => void;
}) {
  const { colors } = useTheme();
  const bottomInset = useBottomInsetUnlessKeyboard();
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const [error, setError] = useState<{ action: 'accept' | 'decline'; reason: TeamSignupFailureWithText } | null>(null);
  const sending = useRef(false);

  // Et nei eller en som er tatt ut, er ikke lenger på laget.
  const members = invited.members.filter((m) => m.status === 'pending' || m.status === 'approved');
  const selfIndex = selfMemberIndex(members);

  const answer = useCallback(
    async (action: 'accept' | 'decline') => {
      if (sending.current) return;
      sending.current = true;
      setBusy(action);
      setError(null);
      const send = action === 'accept' ? acceptTeamInvite : declineTeamInvite;
      const result = await send(shortId, invited.requestId);
      sending.current = false;
      setBusy(null);
      if (result.ok) {
        onDone();
        return;
      }
      switch (result.reason) {
        case 'not_found':
        case 'game_full':
        case 'game_locked':
        case 'signup_closed':
          onDone();
          return;
        default:
          setError({ action, reason: result.reason });
      }
    },
    [invited.requestId, onDone, shortId],
  );

  const retryOn = error && isRetryableTeamFailure(error.reason) ? error.action : null;

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]} testID="team-invite">
      <ScrollView contentContainerStyle={styles.scroll}>
        <Head title={invited.teamName ?? round.name} place={teamRoundLine(round)} testID="team-invite" />
        <Lineup testID="team-invite-lineup">
          {members.map((member, index) =>
            index === selfIndex ? (
              <LineupCell key={`m-${index}`} name={TEAM_SIGNUP_TEXT.you} accessibilityLabel={TEAM_SIGNUP_TEXT.you} testID="team-invite-self">
                <TeamDisc kind="unknown" label="?" size="lg" ground={colors.bg} />
              </LineupCell>
            ) : (
              <LineupCell
                key={`m-${index}`}
                name={firstName(member.name)}
                accessibilityLabel={member.name ?? undefined}
                testID={`team-invite-member-${index}`}
              >
                <TeamDisc kind="other" label={nameInitials(member.name)} size="lg" captain={member.isCaptain} ground={colors.bg} />
              </LineupCell>
            ),
          )}
        </Lineup>
        <View style={[teamStyles.block, { backgroundColor: colors.surface }]}>
          <Text style={[teamStyles.big, { color: colors.text }]} testID="team-invite-ask">
            {inviteTitle(invited.captainName)}
          </Text>
          <Text style={[teamStyles.body, { color: colors.text }]} testID="team-invite-effect">
            {inviteBody(invited.joinEffect)}
          </Text>
        </View>
      </ScrollView>
      <Dock bottomInset={bottomInset}>
        {error ? (
          <Text style={[styles.dockError, { color: colors.danger }]} testID="team-invite-error">
            {describeTeamSignupFailure(error.reason)}
          </Text>
        ) : null}
        <DockButton
          label={
            busy === 'accept'
              ? TEAM_SIGNUP_TEXT.joining
              : retryOn === 'accept'
                ? ROUND_INVITE_TEXT.retry
                : TEAM_SIGNUP_TEXT.joinTeam
          }
          variant="primary"
          busy={busy !== null}
          onPress={() => void answer('accept')}
          testID="team-invite-accept"
        />
        <DockButton
          label={
            busy === 'decline'
              ? TEAM_SIGNUP_TEXT.declining
              : retryOn === 'decline'
                ? ROUND_INVITE_TEXT.retry
                : TEAM_SIGNUP_TEXT.noThanks
          }
          variant="line"
          busy={busy !== null}
          onPress={() => void answer('decline')}
          testID="team-invite-decline"
        />
      </Dock>
    </View>
  );
}

/** «Laget er sendt til arrangøren»: svaret per venn, og «Se laget», som åpner lagsiden. */
export function TeamSent({
  round,
  sent,
  onSeeTeam,
}: {
  round: AppRoundInviteView['round'];
  sent: SentTeam;
  /** «Se laget»: lagsiden i appen (#2840 del 3). */
  onSeeTeam: () => void;
}) {
  const { colors } = useTheme();
  const bottomInset = useBottomInsetUnlessKeyboard();

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]} testID="team-sent">
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.sentName}>
          <Text style={[teamStyles.heading, { color: colors.text }]} accessibilityRole="header" testID="team-sent-name">
            {sent.teamName}
          </Text>
        </View>
        <Text style={[teamStyles.meta, styles.sentMeta, { color: colors.muted }]} testID="team-sent-place">
          {teamRoundLine(round)}
        </Text>
        <View style={[teamStyles.block, { backgroundColor: colors.surface }]}>
          <Text style={[teamStyles.big, { color: colors.text }]} testID="team-sent-title">
            {TEAM_SIGNUP_TEXT.sentTitle}
          </Text>
          <Text style={[teamStyles.body, { color: colors.text }]}>{TEAM_SIGNUP_TEXT.sentBody}</Text>
          <View style={styles.results}>
            {sent.rows.map((row) => {
              const label = slotResultLabel(row.result);
              return (
                <View key={row.userId} style={styles.result} testID={`team-sent-row-${row.userId}`}>
                  <TeamDisc kind="other" label={nameInitials(row.name)} size="md" ground={colors.surface} />
                  <Text
                    style={[styles.resultName, { color: row.result.ok ? colors.text : colors.danger }]}
                    numberOfLines={1}
                  >
                    {row.name}
                  </Text>
                  {row.result.ok ? (
                    <Text style={[styles.tag, { backgroundColor: colors.primarySoft, color: colors.primary }]}>{label}</Text>
                  ) : (
                    <Text style={[styles.resultFail, { color: colors.danger }]} testID={`team-sent-row-${row.userId}-failed`}>
                      {label}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>
      <Dock bottomInset={bottomInset}>
        <DockButton label={TEAM_SIGNUP_TEXT.seeTeam} variant="primary" onPress={onSeeTeam} testID="team-sent-see-team" />
      </Dock>
    </View>
  );
}

/** «Runden er full. Det er ikke plass til et lag til.» Ingen knapp. */
export function TeamRoundFull({ view }: { view: Pick<AppRoundInviteView, 'round' | 'seats'> }) {
  const { colors } = useTheme();
  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.scroll} testID="team-full">
      <Head title={view.round.name} place={fullRoundPlace(view)} testID="team-full" />
      <View style={[teamStyles.block, { backgroundColor: colors.surface }]}>
        <Text style={[teamStyles.body, { color: colors.text }]} testID="team-full-body">
          {TEAM_SIGNUP_TEXT.full}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingBottom: 20 },
  // `.head`: 6 over, 20 fra kanten, 4 mellom tittelen og linja.
  head: { paddingTop: 6, paddingHorizontal: 20, gap: 4 },
  sentName: { paddingTop: 6, paddingHorizontal: 20, minHeight: 44, justifyContent: 'center' },
  sentMeta: { paddingTop: 2, paddingHorizontal: 20 },
  // `.res`: 10 mellom radene, 10 mellom skiva, navnet og svaret.
  results: { gap: 10 },
  result: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  resultName: { flex: 1, fontSize: 15, fontFamily: FONTS.sans },
  resultFail: { fontSize: 15, fontFamily: FONTS.sans },
  // `.tag`: 12/600, 9 pt luft på sidene, helt runde ender.
  tag: {
    fontSize: 12,
    fontFamily: FONTS.sansSemiBold,
    paddingHorizontal: 9,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: 'hidden',
  },
  dockError: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans, textAlign: 'center' },
});
