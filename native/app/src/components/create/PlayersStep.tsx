// native/app/src/components/create/PlayersStep.tsx
// Native N6a (#1854): steg 4 — hvem spiller, og på hvilket lag.
//
// **Du står alltid øverst og kan ikke tas bort.** Arrangøren er med i sin egen
// runde; en avhukbar rad ville bare vært en felle.
//
// **Lista er medspillere, ikke venner.** `users`-RLS-en gir egen rad, admin og
// delte spill — en venn du aldri har spilt med er ikke navnlesbar herfra, og
// gjester kan ikke opprettes fra appen i det hele tatt. Begge begrensningene
// er bokført i kontrakten; hint-teksten peker til nettsiden for nye folk i
// stedet for å late som lista er komplett.
//
// **Taket sperrer, formatet gjør det ikke.** Er rosteret over `maxPlayersForMode`,
// låses de uvalgte radene — ellers ville en niende spiller blitt stille
// droppet av payload-byggeren. Passer ikke ANTALLET formatet (wolf med to),
// står det bare en rolig linje: å låse noe der ville hindret arrangøren i å
// bygge rosteret ferdig.
import { useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import type { RosterCandidate } from '../../data/createGame';
import { APP_MODE_LABELS, type AppGameMode } from '../../lib/appFormats';
import { displayName } from '../../lib/display';
import {
  describePlayerCounts,
  maxPlayersForMode,
  rosterFitsMode,
  type TeamLayout,
} from '../../lib/rosterLimits';
import type { DraftPlayer } from '../../lib/wizardPayload';
import { useTheme } from '../../theme';
import { Chips, Field, Note, SelectRow } from './primitives';

function teamOptions(layout: TeamLayout, userId: string) {
  const noun = layout.noun === 'lag' ? 'Lag' : 'Side';
  return Array.from({ length: layout.slots }, (_, i) => ({
    value: i + 1,
    label: `${noun} ${i + 1}`,
    testID: `create-team-${userId}-${i + 1}`,
  }));
}

export function PlayersStep({
  candidates,
  failed,
  meId,
  mode,
  players,
  teamLayout,
  onToggle,
  onTeam,
  onRetry,
}: {
  /** `null` mens hentingen pågår. */
  candidates: RosterCandidate[] | null;
  failed: boolean;
  meId: string;
  mode: AppGameMode;
  players: DraftPlayer[];
  teamLayout: TeamLayout | null;
  onToggle: (candidate: RosterCandidate) => void;
  onTeam: (userId: string, teamNumber: number) => void;
  onRetry: () => void;
}) {
  const { colors, ui } = useTheme();
  const [search, setSearch] = useState('');

  const chosen = new Map(players.map((p) => [p.userId, p]));
  const cap = maxPlayersForMode(mode);
  const atCap = players.length >= cap;
  const fits = rosterFitsMode(mode, players.length);

  const me = (candidates ?? []).find((c) => c.id === meId) ?? null;
  const needle = search.trim().toLowerCase();
  const others = (candidates ?? [])
    .filter((c) => c.id !== meId)
    .filter(
      (c) => needle === '' || displayName(c).toLowerCase().includes(needle),
    );

  return (
    <View testID="create-step-players">
      <Text style={ui.title}>Hvem spiller?</Text>

      {failed ? (
        <View style={ui.banner}>
          <Text style={ui.error} testID="create-players-error">
            Fikk ikke hentet spillerne. Sjekk nettet og prøv igjen.
          </Text>
          <Text style={ui.linkText} onPress={onRetry} testID="create-players-retry">
            Prøv igjen
          </Text>
        </View>
      ) : null}

      {candidates === null && !failed ? (
        <View style={ui.banner}>
          <ActivityIndicator color={colors.primary} testID="create-players-loading" />
          <Text style={ui.muted}>Henter spillerne …</Text>
        </View>
      ) : null}

      <Text style={ui.muted} testID="create-roster-count">
        {`${players.length} av ${cap} spillere valgt`}
      </Text>

      {!fits ? (
        <Note testID="create-roster-fit">
          {`${APP_MODE_LABELS[mode]} spilles med ${describePlayerCounts(mode)}. Du har ${players.length}.`}
        </Note>
      ) : null}

      <SelectRow
        testID={`create-player-${meId}`}
        title={me ? displayName(me) : 'Deg'}
        subtitle="Du er alltid med"
        selected
      />
      {teamLayout ? (
        <Chips
          testID={`create-team-row-${meId}`}
          value={chosen.get(meId)?.teamNumber ?? null}
          onChange={(team) => onTeam(meId, team)}
          options={teamOptions(teamLayout, meId)}
        />
      ) : null}

      {candidates !== null && others.length === 0 && needle === '' ? (
        <Note testID="create-players-empty">
          Du har ingen medspillere å velge fra ennå. Du kan opprette runden med
          bare deg selv. Nye folk inviterer du på nettsiden.
        </Note>
      ) : null}

      {candidates !== null && others.length > 0 ? (
        <Field label="Medspillere">
          <TextInput
            testID="create-player-search"
            style={ui.input}
            value={search}
            onChangeText={setSearch}
            placeholder="Søk etter navn"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </Field>
      ) : null}

      {others.map((candidate) => {
        const picked = chosen.get(candidate.id);
        return (
          <View key={candidate.id}>
            <SelectRow
              testID={`create-player-${candidate.id}`}
              title={displayName(candidate)}
              subtitle={
                candidate.pending
                  ? 'Har ikke fullført profilen sin ennå'
                  : `HCP ${candidate.hcpIndex}`
              }
              selected={picked !== undefined}
              disabled={picked === undefined && atCap}
              onPress={() => onToggle(candidate)}
            />
            {picked && teamLayout ? (
              <Chips
                testID={`create-team-row-${candidate.id}`}
                value={picked.teamNumber}
                onChange={(team) => onTeam(candidate.id, team)}
                options={teamOptions(teamLayout, candidate.id)}
              />
            ) : null}
          </View>
        );
      })}

      {atCap ? (
        <Note testID="create-roster-cap">
          {`Formatet tar ${cap} spillere. Vil du bytte noen, må du ta bort en først.`}
        </Note>
      ) : null}
    </View>
  );
}
