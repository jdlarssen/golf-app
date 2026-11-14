// native/app/src/components/create/SetupStep.tsx
// Native N6a (#1854, #2753): steg 3 — reglene for runden.
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
import { settlementUnitKeyFor } from '../../../../../lib/scoring/settlement';
import { SHOW_SETTLEMENT_IN_APP } from '../../../../../lib/launchRules';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import {
  ALLOWANCE_TEXT,
  BRUTTO_HELPER,
  hasHcpAllowanceField,
} from '../../lib/allowanceCopy';
import type { AppGameMode } from '../../lib/appFormats';
import {
  NASSAU_SETUP_TEXT,
  PATSOME_TEXT,
  SHAMBLE_TEXT,
  SKINS_SETUP_TEXT,
  TEAM_HANDICAP_TEXT,
  TEAM_SIZE_TEXT,
  WOLF_SETUP_TEXT,
  sumEquivalentText,
} from '../../lib/formatSetupCopy';
import { defaultTeamHandicapPct } from '../../../../../lib/games/formatSetupDefaults';
import { TEAM_FORMAT_TEAM_SIZES } from '../../../../../lib/games/teamFormatLimits';
import { averagePctToSumPct, sumPctToAveragePct } from '../../../../../lib/games/teamHandicapUnit';
import { SETTLEMENT_TEXT } from '../../lib/settlementCopy';
import { effectiveTeamSize, isScrambleFamily, type ModeSetup } from '../../lib/wizardPayload';
import { FONTS, fraunces, interLine, useTheme } from '../../theme';
import { FeeAndPrizes, type FeeDraft } from './FeeAndPrizes';
import { ChoiceCards, Chips, Field, ToggleRow } from './primitives';

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
  fee,
  onFee,
}: {
  mode: AppGameMode;
  common: CommonSetup;
  onCommon: (patch: Partial<CommonSetup>) => void;
  setup: ModeSetup;
  onSetup: (patch: Partial<ModeSetup>) => void;
  text: SetupText;
  onText: (patch: Partial<SetupText>) => void;
  /** #2749: kontingent og premiebord nederst i steget. */
  fee: FeeDraft;
  onFee: (patch: Partial<FeeDraft>) => void;
}) {
  const { colors, ui } = useTheme();
  const stablefordFamily = isStablefordFamily(mode);
  const scoringSetup = mode === 'wolf' ? WOLF_SETUP_TEXT : mode === 'skins' ? SKINS_SETUP_TEXT : null;
  // Om formatet spiller om penger, og i hvilken enhet, er den delte regelen
  // resultattavla også leser (#2221): skins sier «per skin», ikke «per poeng».
  // #2561: appen spør ikke om kroner per enhet ved lansering (rot-
  // `lib/launchRules.ts`), for noe format; oppgjøret settes på nettet.
  const wagerUnit = SHOW_SETTLEMENT_IN_APP ? settlementUnitKeyFor(mode) : null;
  // #2753 D3b: lagstørrelse og lag-handicap (scramble) som nettets
  // TeamSizeSelector og TeamHandicapField. Arrangøren skriver prosent av lagets
  // snitt; lagret verdi er prosent av summen (`teamHandicapUnit`).
  const teamSize = effectiveTeamSize(mode, setup);
  const sizes = (TEAM_FORMAT_TEAM_SIZES[mode] ?? []) as readonly (2 | 3 | 4)[];
  const defaultSumPct = isScrambleFamily(mode) ? (defaultTeamHandicapPct(mode, teamSize) ?? 0) : 0;
  const teamHandicapSumPct =
    text.allowance === '' ? defaultSumPct : averagePctToSumPct(Number(text.allowance), teamSize);
  const shambleNet = (setup.shambleScoring ?? 'net') === 'net';
  const champagne = setup.shambleVariant === 'champagne';

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

      {/* #1980: webbens AllowanceField for de fire formatene. «0» er brutto,
          som i webbens datamodell; tomt felt er 100 (fullt banehandicap). */}
      {hasHcpAllowanceField(mode) ? (
        <Field label={ALLOWANCE_TEXT.legend} hint={ALLOWANCE_TEXT.description}>
          <Chips
            value={text.allowance === '0' ? 'brutto' : 'netto'}
            onChange={(choice) => onText({ allowance: choice === 'brutto' ? '0' : '' })}
            options={[
              {
                value: 'netto' as const,
                label: ALLOWANCE_TEXT.nettoLabel,
                testID: 'create-allowance-netto',
              },
              {
                value: 'brutto' as const,
                label: ALLOWANCE_TEXT.bruttoLabel,
                testID: 'create-allowance-brutto',
              },
            ]}
          />
          {text.allowance === '0' ? (
            <Text style={ui.muted} testID="create-allowance-brutto-helper">
              {BRUTTO_HELPER[mode]}
            </Text>
          ) : (
            <Field label={ALLOWANCE_TEXT.inputLabel} hint={ALLOWANCE_TEXT.nettoHelper}>
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
          )}
        </Field>
      ) : null}

      {isScrambleFamily(mode) ? (
        <>
          <Field label={TEAM_SIZE_TEXT.legend}>
            {/* Kortene fra `Nyttspill-2-texas`: tre i bredden, 72 høye. */}
            <ChoiceCards
              columns={3}
              minHeight={72}
              titleSize={15}
              bleed={4}
              paddingX={10}
              value={teamSize}
              onChange={(next) => {
                onSetup({ teamSize: next });
                // Ny størrelse, ny standard: nettet setter andelen på nytt.
                onText({ allowance: '' });
              }}
              options={sizes.map((n) => ({
                value: n,
                title: TEAM_SIZE_TEXT.sizes[n],
                hint: TEAM_SIZE_TEXT.hints[n],
                testID: `create-team-size-${n}`,
              }))}
            />
          </Field>
          <Field label={TEAM_HANDICAP_TEXT.legend}>
            {/* Forklaringen står under overskriften, før valget, som på nettet. */}
            <Text style={ui.muted}>{TEAM_HANDICAP_TEXT.description}</Text>
            <Chips
              value={text.allowance === '0' ? 'brutto' : 'netto'}
              onChange={(choice) => onText({ allowance: choice === 'brutto' ? '0' : '' })}
              options={[
                { value: 'netto' as const, label: ALLOWANCE_TEXT.nettoLabel, testID: 'create-team-hcp-netto' },
                { value: 'brutto' as const, label: ALLOWANCE_TEXT.bruttoLabel, testID: 'create-team-hcp-brutto' },
              ]}
            />
            {text.allowance === '0' ? (
              <Text style={ui.muted} testID="create-team-hcp-brutto-helper">
                {TEAM_HANDICAP_TEXT.bruttoHelper}
              </Text>
            ) : (
              <Field
                label={TEAM_HANDICAP_TEXT.inputLabel}
                hint={TEAM_HANDICAP_TEXT.nettoHelper[mode][teamSize]}
              >
                <TextInput
                  testID="create-team-hcp"
                  style={ui.input}
                  value={text.allowance}
                  onChangeText={(allowance) => onText({ allowance: allowance.replace(/[^0-9]/g, '') })}
                  keyboardType="number-pad"
                  placeholder={String(sumPctToAveragePct(defaultSumPct, teamSize))}
                  placeholderTextColor={colors.muted}
                />
                <Text style={ui.muted} testID="create-team-hcp-sum">
                  {sumEquivalentText(teamHandicapSumPct)}
                </Text>
              </Field>
            )}
          </Field>
        </>
      ) : null}

      {/* #2753 D3b: shamble og Champagne Scramble, som nettets ShambleSetup. */}
      {mode === 'shamble' ? (
        <Field label={SHAMBLE_TEXT.legend}>
          {/* Valgene står i et kort, som på artboardet. */}
          <View style={[styles.setupCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cardLabel, { color: colors.text }]}>{SHAMBLE_TEXT.teamSizeLabel}</Text>
            {/* Kortene fra `Nyttspill-2-shamble`. */}
            <ChoiceCards
              columns={2}
              minHeight={64}
              value={teamSize}
              onChange={(next) => onSetup({ teamSize: next })}
              options={([3, 4] as const).map((n) => ({
                value: n,
                title: SHAMBLE_TEXT.teamSize[n],
                hint: SHAMBLE_TEXT.teamSizeDesc[n],
                testID: `create-shamble-size-${n}`,
              }))}
            />
            <Text style={[styles.cardLabel, { color: colors.text }]}>{SHAMBLE_TEXT.variantLabel}</Text>
            <ChoiceCards
              columns={2}
              minHeight={64}
              value={setup.shambleVariant ?? 'shamble'}
              onChange={(shambleVariant) => onSetup({ shambleVariant })}
              options={[
                {
                  value: 'shamble' as const,
                  title: SHAMBLE_TEXT.variantShamble,
                  hint: SHAMBLE_TEXT.variantShambleDesc,
                  testID: 'create-shamble-variant-shamble',
                },
                {
                  value: 'champagne' as const,
                  title: SHAMBLE_TEXT.variantChampagne,
                  hint: SHAMBLE_TEXT.variantChampagneDesc,
                  testID: 'create-shamble-variant-champagne',
                },
              ]}
            />
            {champagne ? (
              <>
                <Text style={[styles.cardLabel, { color: colors.text }]}>{SHAMBLE_TEXT.countLabel}</Text>
                <ChoiceCards
                  columns={3}
                  minHeight={60}
                  centered
                  value={setup.shambleCount ?? 2}
                  onChange={(shambleCount) => onSetup({ shambleCount })}
                  options={([1, 2, 3] as const).map((n) => ({
                    value: n,
                    title: String(n),
                    hint: n === 1 ? SHAMBLE_TEXT.countSingle : SHAMBLE_TEXT.countPlural,
                    testID: `create-shamble-count-${n}`,
                  }))}
                />
              </>
            ) : null}
            <Text style={[styles.cardLabel, { color: colors.text }]}>{SHAMBLE_TEXT.scoringLabel}</Text>
            <ChoiceCards
              columns={2}
              minHeight={60}
              value={setup.shambleScoring ?? 'net'}
              onChange={(shambleScoring) => onSetup({ shambleScoring })}
              options={[
                { value: 'net' as const, title: SHAMBLE_TEXT.net, hint: SHAMBLE_TEXT.netDesc, testID: 'create-shamble-net' },
                { value: 'gross' as const, title: SHAMBLE_TEXT.gross, hint: SHAMBLE_TEXT.grossDesc, testID: 'create-shamble-gross' },
              ]}
            />
            {/* #2570: andelen står rett under tellemåten, bare med Netto. */}
            {shambleNet ? (
              <Field label={SHAMBLE_TEXT.allowanceLabel} hint={SHAMBLE_TEXT.allowanceHint}>
                <TextInput
                  testID="create-shamble-allowance"
                  style={ui.input}
                  value={text.allowance}
                  onChangeText={(allowance) => onText({ allowance: allowance.replace(/[^0-9]/g, '') })}
                  keyboardType="number-pad"
                  placeholder="100"
                  placeholderTextColor={colors.muted}
                />
              </Field>
            ) : null}
          </View>
        </Field>
      ) : null}

      {/* #2753 D3: Patsome, som nettets PatsomeSetup. Lagstørrelsen er alltid 2. */}
      {mode === 'patsome' ? (
        <Field label={PATSOME_TEXT.legend}>
          <View style={[styles.setupCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {/* Segmentene i en egen boks, som `Nyttspill-2-patsome`. */}
            <View style={[styles.segments, { backgroundColor: colors.surface2 }]}>
              {PATSOME_TEXT.segments.map((segment) => (
                <View key={segment.holes} style={styles.segment} testID={`create-patsome-${segment.holes}`}>
                  <Text style={[styles.segmentHoles, { color: colors.text }]}>{segment.holes}</Text>
                  <Text style={[styles.segmentBody, { color: colors.text }]}>
                    <Text style={styles.segmentFormat}>{segment.format}</Text>
                    {` ${segment.body}`}
                  </Text>
                </View>
              ))}
          </View>
          <Text style={ui.muted}>{PATSOME_TEXT.handicapNote}</Text>
          <Text style={[styles.cardLabel, { color: colors.text }]}>{PATSOME_TEXT.scoringFrom}</Text>
          <ChoiceCards
            columns={2}
            minHeight={60}
            value={setup.patsomeScoring ?? 'net'}
            onChange={(patsomeScoring) => onSetup({ patsomeScoring })}
            options={[
              { value: 'net' as const, title: PATSOME_TEXT.net, hint: PATSOME_TEXT.netDesc, testID: 'create-patsome-net' },
              { value: 'gross' as const, title: PATSOME_TEXT.gross, hint: PATSOME_TEXT.grossDesc, testID: 'create-patsome-gross' },
            ]}
          />
          </View>
        </Field>
      ) : null}

      {/* #2755: Nassau, som `Nyttspill-2-nassau`: ett kort med scoring. Kroner settes på nettet (#2561). */}
      {mode === 'nassau' ? (
        <Field label={NASSAU_SETUP_TEXT.legend}>
          <View style={[styles.setupCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cardLabel, { color: colors.text }]}>{NASSAU_SETUP_TEXT.scoringLabel}</Text>
            <Text style={ui.muted}>{NASSAU_SETUP_TEXT.scoringDescription}</Text>
            <ChoiceCards
              columns={2}
              minHeight={60}
              wrapTitle
              accessibilityLabel={NASSAU_SETUP_TEXT.scoringAriaLabel}
              value={setup.nassauScoring ?? 'net'}
              onChange={(nassauScoring) => onSetup({ nassauScoring })}
              options={[
                { value: 'net' as const, title: NASSAU_SETUP_TEXT.scoringNet, testID: 'create-nassau-net' },
                { value: 'gross' as const, title: NASSAU_SETUP_TEXT.scoringGross, testID: 'create-nassau-gross' },
              ]}
            />
          </View>
        </Field>
      ) : null}

      {/* #2880: Wolf og Skins, som `Nyttspill-2-wolf` og `-skins`: samme kort som Nassau. */}
      {scoringSetup ? (
        <Field label={scoringSetup.legend}>
          <View style={[styles.setupCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cardLabel, { color: colors.text }]}>{scoringSetup.scoringLabel}</Text>
            <Text style={ui.muted}>{scoringSetup.scoringDescription}</Text>
            <ChoiceCards
              columns={2}
              minHeight={60}
              wrapTitle
              accessibilityLabel={scoringSetup.scoringAriaLabel}
              value={(mode === 'wolf' ? setup.wolfScoring : setup.skinsScoring) ?? 'net'}
              onChange={(value) =>
                onSetup(mode === 'wolf' ? { wolfScoring: value } : { skinsScoring: value })
              }
              options={[
                { value: 'net' as const, title: scoringSetup.scoringNet, testID: `create-${mode}-net` },
                { value: 'gross' as const, title: scoringSetup.scoringGross, testID: `create-${mode}-gross` },
              ]}
            />
            {'startNote' in scoringSetup ? <Text style={ui.muted}>{scoringSetup.startNote}</Text> : null}
          </View>
        </Field>
      ) : null}

      {wagerUnit !== null ? (
        <Field
          label={`Kroner per ${SETTLEMENT_TEXT.units[wagerUnit]}`}
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
          <Field label="Lengste drive: antall hull">
            <Chips
              value={common.sideLdCount}
              onChange={(sideLdCount) => onCommon({ sideLdCount })}
              options={COUNT_OPTIONS('ld')}
            />
          </Field>
          <Field label="Nærmest pinnen: antall hull">
            <Chips
              value={common.sideCtpCount}
              onChange={(sideCtpCount) => onCommon({ sideCtpCount })}
              options={COUNT_OPTIONS('ctp')}
            />
          </Field>
        </>
      ) : null}

      <FeeAndPrizes
        mode={mode}
        side={{
          enabled: common.sideTournamentEnabled,
          ldCount: common.sideLdCount,
          ctpCount: common.sideCtpCount,
        }}
        fee={fee}
        onFee={onFee}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Kortet rundt shamble- og Patsome-oppsettet: 16 fra kanten (skjermen har
  // 20), 14 luft og 12 mellom radene, som artboardene.
  setupCard: { marginHorizontal: -4, borderWidth: 1, borderRadius: 16, padding: 14, gap: 12 },
  // Underoverskriftene i kortet: 14 pt halvfet, som artboardene.
  cardLabel: { ...interLine(14, 17), fontFamily: FONTS.sansSemiBold },
  // `Nyttspill-2-patsome`: boksen med de tre delene av runden.
  segments: { borderRadius: 12, padding: 12, gap: 10 },
  segment: { flexDirection: 'row', gap: 10 },
  segmentHoles: { ...fraunces(600, 13), minWidth: 74 },
  segmentBody: { ...interLine(13, 18.85, { multiline: true }), fontFamily: FONTS.sans, flexShrink: 1 },
  segmentFormat: { fontFamily: FONTS.sansSemiBold },
});
