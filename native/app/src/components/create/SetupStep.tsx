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
import { useState, type ReactNode } from 'react';
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
import {
  defaultHcpAllowancePct,
  defaultPatsomeFourballAllowancePct,
  defaultTeamHandicapPct,
  defaultTeamHandicapRule,
  offersNgfWeighting,
} from '../../../../../lib/games/formatSetupDefaults';
import { TEAM_FORMAT_TEAM_SIZES } from '../../../../../lib/games/teamFormatLimits';
import { averagePctToSumPct, sumPctToAveragePct } from '../../../../../lib/games/teamHandicapUnit';
import { SETTLEMENT_TEXT } from '../../lib/settlementCopy';
import { effectiveTeamSize, isScrambleFamily, withSlotHole, type ModeSetup } from '../../lib/wizardPayload';
import { FONTS, fraunces, interLine, useTheme } from '../../theme';
import { FeeAndPrizes, type FeeDraft } from './FeeAndPrizes';
import { ChoiceCards, Chips, Field, ToggleRow } from './primitives';
import { SideHoleRow, SideHoleSheet, type SideHoleSlot } from './SideHolePicker';
import { SIDE_HOLE_TEXT, type SideHoleCategory } from '../../lib/createGameCopy';

/** Fellesfeltene, samlet så skjermen kan sende dem videre som én bit. */
export interface CommonSetup {
  name: string;
  requirePeerApproval: boolean;
  scoreVisibility: 'live' | 'reveal';
  sideTournamentEnabled: boolean;
  sideLdCount: 0 | 1 | 2;
  sideCtpCount: 0 | 1 | 2;
  /**
   * #2283: hullet for hver plass, `null` = ikke valgt. Plassene over antallet
   * leses aldri, så et senket antall trenger ikke å rydde lista.
   */
  sideLdHoles: (number | null)[];
  sideCtpHoles: (number | null)[];
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

/**
 * Feltet under valgkortene i andel og lag-handicap (`Nyttspill-5-avansert-a`):
 * 12 pt fra kortene (6 fra gruppa pluss 6 her) og 6 mellom etikett og felt.
 * `Field` ville lagt 26 pt, siden etiketten har egen toppluft.
 */
function NestedField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  const { ui } = useTheme();
  return (
    <View style={styles.nestedField}>
      <Text style={[ui.label, styles.nestedLabel]}>{label}</Text>
      {children}
      {hint ? <Text style={ui.muted}>{hint}</Text> : null}
    </View>
  );
}

/**
 * Kortet med scoring for Nassau, Wolf og Skins (`Nyttspill-2-nassau|wolf|skins`):
 * «Scoring» og forklaringen står tett (2 pt), så to valgkort, og for Wolf en
 * merknad nederst.
 */
function ScoringCard({
  text,
  value,
  onChange,
  testIdPrefix,
}: {
  text: {
    scoringLabel: string;
    scoringDescription: string;
    scoringNet: string;
    scoringGross: string;
    scoringAriaLabel: string;
    startNote?: string;
  };
  value: 'net' | 'gross';
  onChange: (value: 'net' | 'gross') => void;
  testIdPrefix: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.setupCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.cardIntro}>
        <Text style={[styles.cardLabel, { color: colors.text }]}>{text.scoringLabel}</Text>
        <Text style={[styles.cardDescription, { color: colors.muted }]}>{text.scoringDescription}</Text>
      </View>
      <ChoiceCards
        columns={2}
        minHeight={60}
        wrapTitle
        stretch
        accessibilityLabel={text.scoringAriaLabel}
        value={value}
        onChange={onChange}
        options={[
          { value: 'net' as const, title: text.scoringNet, testID: `${testIdPrefix}-net` },
          { value: 'gross' as const, title: text.scoringGross, testID: `${testIdPrefix}-gross` },
        ]}
      />
      {text.startNote ? <Text style={[styles.cardNote, { color: colors.muted }]}>{text.startNote}</Text> : null}
    </View>
  );
}

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
  // #2283: plassen hullarket er åpent for, eller `null`.
  const [holeSlot, setHoleSlot] = useState<SideHoleSlot | null>(null);
  const holesOf = (category: SideHoleCategory) =>
    category === 'longest_drive' ? common.sideLdHoles : common.sideCtpHoles;
  // Tegningen sperrer ikke hullet den andre plassen har; det flyttes hit
  // (`withSlotHole`).
  const pickHole = (slot: SideHoleSlot, hole: number | null) => {
    const next = withSlotHole(holesOf(slot.category), slot.position, hole);
    onCommon(slot.category === 'longest_drive' ? { sideLdHoles: next } : { sideCtpHoles: next });
  };
  const holeRows = (category: SideHoleCategory, count: number, holes: readonly (number | null)[]) =>
    count > 0 ? (
      <View style={styles.holeRows}>
        {Array.from({ length: count }, (_, i) => i + 1).map((position) => (
          <SideHoleRow
            key={position}
            category={category}
            position={position}
            count={count}
            hole={holes[position - 1] ?? null}
            onPress={() => setHoleSlot({ category, position, count })}
          />
        ))}
      </View>
    ) : null;
  const sideHoleNote = (
    <Text style={[styles.sideHoleNote, { color: colors.muted }]} testID="create-side-hole-note">
      {SIDE_HOLE_TEXT.note}
    </Text>
  );
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
  // #3002 (F23): «Netto» og «Brutto» som på nettet, og under Netto
  // «Standard» (NGFs vekting) eller «Egen prosent» (eieren 27.11.2026). Brutto
  // er prosenten 0 med regelen `pct`, så validatoren lagrer prosenten av summen.
  const teamHandicapRule = setup.teamHandicapRule ?? defaultTeamHandicapRule(mode);
  const teamHandicapGross = teamHandicapRule !== 'ngf' && text.allowance === '0';
  // What Netto had before Brutto, so «Netto» brings back the rule and the
  // share, as the web field does (`lastNetRule`/`lastSumPct` in
  // TeamHandicapField). Without it (a fresh mount on Brutto), Netto starts on
  // the format's start.
  // «B: formelen» (eieren 27.11): in Ambrose «Standard» is the formula (the
  // start share, an empty field), not a rule, so the choice is kept here.
  const weighting = offersNgfWeighting(mode);
  const [ambroseOwn, setAmbroseOwn] = useState(text.allowance !== '' && text.allowance !== '0');
  const standardChosen = weighting ? teamHandicapRule === 'ngf' : !ambroseOwn;
  const [lastNet, setLastNet] = useState<{ rule: ModeSetup['teamHandicapRule']; allowance: string } | null>(null);
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
          som i webbens datamodell; tomt felt er formatets standard (#2942):
          85 for best ball og stableford i par, ellers 100. */}
      {hasHcpAllowanceField(mode) ? (
        <Field label={ALLOWANCE_TEXT.legend}>
          {/* #2880: forklaringen over kortene og kortene 52 høye, som `Nyttspill-5-avansert-a`. */}
          <Text style={[styles.cardDescription, styles.descriptionAboveCards, { color: colors.muted }]}>
            {ALLOWANCE_TEXT.description}
          </Text>
          <ChoiceCards
            columns={2}
            minHeight={52}
            value={text.allowance === '0' ? 'brutto' : 'netto'}
            onChange={(choice) => onText({ allowance: choice === 'brutto' ? '0' : '' })}
            options={[
              { value: 'netto' as const, title: ALLOWANCE_TEXT.nettoLabel, testID: 'create-allowance-netto' },
              { value: 'brutto' as const, title: ALLOWANCE_TEXT.bruttoLabel, testID: 'create-allowance-brutto' },
            ]}
          />
          {text.allowance === '0' ? (
            <Text style={ui.muted} testID="create-allowance-brutto-helper">
              {BRUTTO_HELPER[mode]}
            </Text>
          ) : (
            <NestedField label={ALLOWANCE_TEXT.inputLabel} hint={ALLOWANCE_TEXT.nettoHelper}>
              <TextInput
                testID="create-allowance"
                style={[ui.input, styles.input50]}
                value={text.allowance}
                onChangeText={(allowance) =>
                  onText({ allowance: allowance.replace(/[^0-9]/g, '') })
                }
                keyboardType="number-pad"
                placeholder={String(defaultHcpAllowancePct(mode, setup.stablefordTeamSize ?? 1))}
                placeholderTextColor={colors.muted}
              />
            </NestedField>
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
            <Text style={[styles.cardDescription, styles.descriptionAboveCards, { color: colors.muted }]}>
              {TEAM_HANDICAP_TEXT.description}
            </Text>
            <ChoiceCards
              columns={2}
              minHeight={52}
              accessibilityLabel={TEAM_HANDICAP_TEXT.legend}
              value={teamHandicapGross ? 'brutto' : 'netto'}
              onChange={(choice) => {
                if (choice === 'brutto') {
                  setLastNet({ rule: setup.teamHandicapRule, allowance: text.allowance });
                  onSetup({ teamHandicapRule: 'pct' });
                  onText({ allowance: '0' });
                } else {
                  onSetup({ teamHandicapRule: lastNet?.rule });
                  onText({ allowance: lastNet?.allowance ?? '' });
                }
              }}
              options={[
                { value: 'netto' as const, title: ALLOWANCE_TEXT.nettoLabel, testID: 'create-team-hcp-netto' },
                { value: 'brutto' as const, title: ALLOWANCE_TEXT.bruttoLabel, testID: 'create-team-hcp-brutto' },
              ]}
            />
            {teamHandicapGross ? (
              <Text style={ui.muted} testID="create-team-hcp-brutto-helper">
                {TEAM_HANDICAP_TEXT.bruttoHelper}
              </Text>
            ) : (
              <Chips
                testID="create-team-hcp-rule"
                style={styles.ruleChips}
                value={standardChosen ? 'ngf' : 'pct'}
                onChange={(rule) => {
                  if (weighting) {
                    onSetup({ teamHandicapRule: rule });
                    return;
                  }
                  setAmbroseOwn(rule === 'pct');
                  if (rule === 'ngf') onText({ allowance: '' });
                }}
                options={[
                  { value: 'ngf' as const, label: TEAM_HANDICAP_TEXT.ruleNgfTitle, testID: 'create-team-hcp-ngf' },
                  { value: 'pct' as const, label: TEAM_HANDICAP_TEXT.rulePctTitle, testID: 'create-team-hcp-pct' },
                ]}
              />
            )}
            {teamHandicapGross ? null : standardChosen ? (
              <Text style={ui.muted} testID="create-team-hcp-ngf-helper">
                {weighting
                  ? TEAM_HANDICAP_TEXT.ngfHelper[teamSize as 2 | 3 | 4]
                  : TEAM_HANDICAP_TEXT.ambroseStandardHelper}
              </Text>
            ) : (
              <NestedField
                label={TEAM_HANDICAP_TEXT.inputLabel}
                hint={TEAM_HANDICAP_TEXT.nettoHelper[mode][teamSize]}
              >
                <TextInput
                  testID="create-team-hcp"
                  style={[ui.input, styles.input50]}
                  value={text.allowance}
                  onChangeText={(allowance) => {
                    // A typed 0 is not Brutto (Brutto is its own card): keep
                    // the last share, as the web field does.
                    const digits = allowance.replace(/[^0-9]/g, '');
                    if (digits !== '' && Number(digits) === 0) return;
                    onText({ allowance: digits });
                  }}
                  keyboardType="number-pad"
                  placeholder={String(sumPctToAveragePct(defaultSumPct, teamSize))}
                  placeholderTextColor={colors.muted}
                />
                <Text style={ui.muted} testID="create-team-hcp-sum">
                  {sumEquivalentText(teamHandicapSumPct)}
                </Text>
              </NestedField>
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
          {/* #3002 (F24): andelen på hull 1–6 under Netto, som shambles andel. */}
          {(setup.patsomeScoring ?? 'net') === 'net' ? (
            <NestedField label={PATSOME_TEXT.fourballAllowanceLabel} hint={PATSOME_TEXT.fourballAllowanceHint}>
              <TextInput
                testID="create-patsome-fourball-allowance"
                style={[ui.input, styles.input50]}
                value={text.allowance}
                onChangeText={(allowance) => onText({ allowance: allowance.replace(/[^0-9]/g, '') })}
                keyboardType="number-pad"
                placeholder={String(defaultPatsomeFourballAllowancePct())}
                placeholderTextColor={colors.muted}
              />
            </NestedField>
          ) : null}
          </View>
        </Field>
      ) : null}

      {/* #2755: Nassau, som `Nyttspill-2-nassau`: ett kort med scoring. Kroner settes på nettet (#2561). */}
      {mode === 'nassau' ? (
        <Field label={NASSAU_SETUP_TEXT.legend}>
          <ScoringCard
            text={NASSAU_SETUP_TEXT}
            value={setup.nassauScoring ?? 'net'}
            onChange={(nassauScoring) => onSetup({ nassauScoring })}
            testIdPrefix="create-nassau"
          />
        </Field>
      ) : null}

      {/* #2880: Wolf og Skins, som `Nyttspill-2-wolf` og `-skins`: samme kort som Nassau. */}
      {scoringSetup ? (
        <Field label={scoringSetup.legend}>
          <ScoringCard
            text={scoringSetup}
            value={(mode === 'wolf' ? setup.wolfScoring : setup.skinsScoring) ?? 'net'}
            onChange={(value) => onSetup(mode === 'wolf' ? { wolfScoring: value } : { skinsScoring: value })}
            testIdPrefix={`create-${mode}`}
          />
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
            {holeRows('longest_drive', common.sideLdCount, common.sideLdHoles)}
            {common.sideLdCount > 0 && common.sideCtpCount === 0 ? sideHoleNote : null}
          </Field>
          <Field label="Nærmest pinnen: antall hull">
            <Chips
              value={common.sideCtpCount}
              onChange={(sideCtpCount) => onCommon({ sideCtpCount })}
              options={COUNT_OPTIONS('ctp')}
            />
            {holeRows('closest_to_pin', common.sideCtpCount, common.sideCtpHoles)}
            {common.sideCtpCount > 0 ? sideHoleNote : null}
          </Field>
          <SideHoleSheet
            slot={holeSlot}
            value={holeSlot ? (holesOf(holeSlot.category)[holeSlot.position - 1] ?? null) : null}
            onPick={(hole) => holeSlot && pickHole(holeSlot, hole)}
            onClose={() => setHoleSlot(null)}
          />
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
  // #2283 (`Sidekonk-oppsett` O1): radene står 4 under brikkene og 8 fra hverandre.
  holeRows: { gap: 8, marginTop: 4 },
  sideHoleNote: { ...interLine(14, 17, { multiline: true }), fontFamily: FONTS.sans },
  // Kortet rundt shamble- og Patsome-oppsettet: 16 fra kanten (skjermen har
  // 20), 14 luft og 12 mellom radene, som artboardene.
  setupCard: { marginHorizontal: -4, borderWidth: 1, borderRadius: 16, padding: 14, gap: 12 },
  // Underoverskriftene i kortet: 14 pt halvfet, som artboardene.
  cardLabel: { ...interLine(14, 17), fontFamily: FONTS.sansSemiBold },
  // Scoring-kortet: overskrift og forklaring i én gruppe, 13 pt med 18,85 i linjen, som artboardene.
  cardIntro: { gap: 2 },
  // Forklaringen over kortene: 12 pt ned til dem (6 fra gruppa pluss 6 her), som `Nyttspill-5-avansert-a`.
  descriptionAboveCards: { marginBottom: 6 },
  nestedField: { gap: 6, marginTop: 6 },
  // #3002: «Standard» og «Egen prosent» under Netto, 12 pt fra kortene som feltet under.
  ruleChips: { marginTop: 6 },
  nestedLabel: { marginTop: 0 },
  // Tallfeltet under valgkortene er 50 høyt på tegningen (`ui.input` er 44).
  input50: { minHeight: 50 },
  cardDescription: { ...interLine(13, 18.85, { multiline: true }), fontFamily: FONTS.sans },
  cardNote: { ...interLine(12, 15), fontFamily: FONTS.sans },
  // `Nyttspill-2-patsome`: boksen med de tre delene av runden.
  segments: { borderRadius: 12, padding: 12, gap: 10 },
  segment: { flexDirection: 'row', gap: 10 },
  segmentHoles: { ...fraunces(600, 13), minWidth: 74 },
  segmentBody: { ...interLine(13, 18.85, { multiline: true }), fontFamily: FONTS.sans, flexShrink: 1 },
  segmentFormat: { fontFamily: FONTS.sansSemiBold },
});
