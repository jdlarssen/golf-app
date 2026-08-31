// native/app/src/components/create/SetupStep.tsx
// Native N6a (#1854): steg 2 — reglene for runden.
//
// Feltene her er nøyaktig de `modeValidators` faktisk leser, og ikke ett til:
// et felt uten mottaker i den delte byggeren ville sett ut som en innstilling
// og vært pynt. Derfor er de modus-spesifikke feltene en switch på slug og
// ikke ett langt skjema.
//
// De to talltekstene (HCP-andel, kroner per enhet) bæres som RÅTEKST fra
// skjermen. Et halvskrevet «1» i et felt som skal bli «100» er en gyldig
// mellomtilstand for arrangøren, men ville vært et gyldig TALL for
// validatoren — så teksten eier feltet, og tallet utledes først ved
// publisering.
import { isStablefordFamily } from '../../../../../lib/scoring/modes/types';
import { Text, TextInput, View } from 'react-native';
import type { AppGameMode } from '../../lib/appFormats';
import type { ModeSetup } from '../../lib/wizardPayload';
import { useTheme } from '../../theme';
import { Chips, Field, ToggleRow } from './primitives';

/** Fellesfeltene, samlet så skjermen kan sende dem videre som én bit. */
export interface CommonSetup {
  name: string;
  requirePeerApproval: boolean;
  scoreVisibility: 'live' | 'reveal';
  sideTournamentEnabled: boolean;
  sideLdCount: 0 | 1 | 2;
  sideCtpCount: 0 | 1 | 2;
}

/** Talltekstene som ikke kan bo i `ModeSetup` uten å miste mellomtilstanden. */
export interface SetupText {
  allowance: string;
  krPerUnit: string;
}

const COUNT_OPTIONS = (kind: 'ld' | 'ctp') =>
  ([0, 1, 2] as const).map((n) => ({
    value: n,
    label: String(n),
    testID: `create-side-${kind}-${n}`,
  }));

export function SetupStep({
  mode,
  common,
  onCommon,
  setup,
  onSetup,
  text,
  onText,
}: {
  mode: AppGameMode;
  common: CommonSetup;
  onCommon: (patch: Partial<CommonSetup>) => void;
  setup: ModeSetup;
  onSetup: (patch: Partial<ModeSetup>) => void;
  text: SetupText;
  onText: (patch: Partial<SetupText>) => void;
}) {
  const { colors, ui } = useTheme();
  const stablefordFamily = isStablefordFamily(mode);
  const hasScoringToggle = mode === 'wolf' || mode === 'skins';
  const hasKrPerUnit =
    mode === 'wolf' || mode === 'skins' || mode === 'bingo_bango_bongo';

  return (
    <View testID="create-step-setup">
      <Text style={ui.title}>Sett opp runden</Text>

      <Field label="Navn på spillet">
        <TextInput
          testID="create-name"
          style={ui.input}
          value={common.name}
          onChangeText={(name) => onCommon({ name })}
          placeholder="Torsdagsrunden"
          placeholderTextColor={colors.muted}
          autoCapitalize="sentences"
        />
      </Field>

      {stablefordFamily ? (
        <Field
          label="Spilles alene eller i par?"
          hint="Par er 4BBB: to og to på lag, og beste score på hvert hull teller."
        >
          <Chips
            value={setup.stablefordTeamSize ?? 1}
            onChange={(stablefordTeamSize) => onSetup({ stablefordTeamSize })}
            options={[
              { value: 1 as const, label: 'Alene', testID: 'create-team-size-1' },
              { value: 2 as const, label: 'Par', testID: 'create-team-size-2' },
            ]}
          />
        </Field>
      ) : null}

      {mode === 'greensome_matchplay' ? (
        <Field
          label="HCP-andel (%)"
          hint="100 følger WHS. Laget får uansett handicap etter 60/40-regelen."
        >
          <TextInput
            testID="create-allowance"
            style={ui.input}
            value={text.allowance}
            onChangeText={(allowance) =>
              onText({ allowance: allowance.replace(/[^0-9]/g, '') })
            }
            keyboardType="number-pad"
            placeholder="100"
            placeholderTextColor={colors.muted}
          />
        </Field>
      ) : null}

      {hasScoringToggle ? (
        <Field label="Teller brutto eller netto?">
          <Chips
            value={
              (mode === 'wolf' ? setup.wolfScoring : setup.skinsScoring) ?? 'net'
            }
            onChange={(value) =>
              onSetup(
                mode === 'wolf' ? { wolfScoring: value } : { skinsScoring: value },
              )
            }
            options={[
              { value: 'net' as const, label: 'Netto', testID: 'create-scoring-net' },
              {
                value: 'gross' as const,
                label: 'Brutto',
                testID: 'create-scoring-gross',
              },
            ]}
          />
        </Field>
      ) : null}

      {hasKrPerUnit ? (
        <Field
          label="Kroner per poeng"
          hint="La stå tomt hvis dere ikke spiller om penger."
        >
          <TextInput
            testID="create-kr-per-unit"
            style={ui.input}
            value={text.krPerUnit}
            onChangeText={(krPerUnit) =>
              onText({ krPerUnit: krPerUnit.replace(/[^0-9]/g, '') })
            }
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor={colors.muted}
          />
        </Field>
      ) : null}

      <Text style={ui.sectionTitle}>Under runden</Text>

      <ToggleRow
        testID="create-peer-approval"
        label="Makker må godkjenne kortet"
        hint="Som på papir: en medspiller signerer før kortet er levert."
        value={common.requirePeerApproval}
        onChange={(requirePeerApproval) => onCommon({ requirePeerApproval })}
      />

      <Field
        label="Når ser dere resultatene?"
        hint="Med «til slutt» ser ingen stillingen før runden er ferdig."
      >
        <Chips
          value={common.scoreVisibility}
          onChange={(scoreVisibility) => onCommon({ scoreVisibility })}
          options={[
            { value: 'live' as const, label: 'Underveis', testID: 'create-visibility-live' },
            {
              value: 'reveal' as const,
              label: 'Til slutt',
              testID: 'create-visibility-reveal',
            },
          ]}
        />
      </Field>

      <Text style={ui.sectionTitle}>Sideturnering</Text>

      <ToggleRow
        testID="create-side-toggle"
        label="Kjør sideturnering"
        hint="Poeng for birdier, bragder og hull-konkurranser ved siden av hovedspillet."
        value={common.sideTournamentEnabled}
        onChange={(sideTournamentEnabled) => onCommon({ sideTournamentEnabled })}
      />

      {common.sideTournamentEnabled ? (
        <>
          <Field label="Longest drive: antall hull">
            <Chips
              value={common.sideLdCount}
              onChange={(sideLdCount) => onCommon({ sideLdCount })}
              options={COUNT_OPTIONS('ld')}
            />
          </Field>
          <Field label="Closest to pin: antall hull">
            <Chips
              value={common.sideCtpCount}
              onChange={(sideCtpCount) => onCommon({ sideCtpCount })}
              options={COUNT_OPTIONS('ctp')}
            />
          </Field>
        </>
      ) : null}
    </View>
  );
}
