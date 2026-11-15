'use client';

/**
 * AdvancedSettingsSection — siste innstillinger før submit-knappene.
 *
 * Ansvar: peer-approval-checkbox, og — når wizard-en ber om det via
 * `includeVisibility` — også «Synlighet under runden»-radios +
 * sideturnering-fieldset (som ellers lever i BasicsSection). All
 * allowance-UI (HCP-allowance, Texas-lag-handicap, fourball-allowance)
 * bor i Section 3 (Format) som `AllowanceField`-toggles — flyttet i #266.
 *
 * #1011: LD-/CTP-count og disabled-categories er controlled state eid av
 * `useGameFormState` (ikke uncontrolled defaultChecked/lokal state). Denne
 * seksjonen monteres kun mens ReadyStep sin advanced-disclosure er åpen —
 * GameWizard sin FormDataInputs (montert på alle steg) speiler samme state
 * som hidden inputs, så et lukket panel ikke lenger dropper sideturnering-
 * config ved publish.
 *
 * #2282: kortstilen fra Nyttspill-5-avansert-b. Peer-godkjenning og
 * sideturnering er bryterrader (native `role="switch"`-checkbokser som
 * beholder `name`), synligheten to valgkort og vinner-antallene piller.
 */

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import type { GameFormState } from '../useGameFormState';
import { PrizesSection } from './PrizesSection';
import { FormSection, LIST_CARD_CLASS } from '@/components/ui/FormSection';
import { ChoiceCardGrid, RadioChoiceCard } from '@/components/ui/ChoiceCard';
import { PillRadio } from '@/components/ui/PillRadio';
import { SwitchRow } from '@/components/ui/Switch';
import {
  SIDE_CONTEST_HOLE_MAX,
  SIDE_CONTEST_HOLE_MIN,
  holeForSlot,
  parseSideContestHole,
} from '@/lib/games/sideContest';

type Props = {
  state: GameFormState;
  /**
   * Når true (wizard-pathen), løftes score-visibility-radios og sideturnering-
   * fieldset inn i denne seksjonen i tillegg. Default false — i GameForm-pathen
   * lever de inne i BasicsSection.
   */
  includeVisibility?: boolean;
  /**
   * Skjul «6. Innstillinger»-headingen. Wizard-en monter denne seksjonen inne
   * i ReadyStep sin avanserte disclosure som allerede har sin egen label, så
   * dobbel-merking unngås ved å droppe headingen.
   */
  hideHeading?: boolean;
  /**
   * Når true eier forelderen serialiseringen av side_*-feltene (wizard-pathen:
   * FormDataInputs speiler dem uansett disclosure-tilstand, #1011) — denne
   * seksjonen dropper da name-attributter/hidden inputs så FormData ikke får
   * duplikat-entries. Default false: GameForm-pathen (edit-flytene + full-form-
   * escape-hatch) har INGEN speiling og trenger inline-serialiseringen.
   */
  serializedExternally?: boolean;
  /**
   * #2457: which part of the section to draw. Step 5 gives «Under runden»
   * (peer approval and visibility) and «Sideturnering og premier» their own
   * sheet. Default `'all'` draws everything, as before — the GameForm path.
   * The side and prize parts need `includeVisibility`.
   */
  part?: 'all' | 'duringRound' | 'sideAndPrizes';
};

const WINNER_COUNTS = [0, 1, 2] as const;
const HOLE_NUMBERS = Array.from(
  { length: SIDE_CONTEST_HOLE_MAX - SIDE_CONTEST_HOLE_MIN + 1 },
  (_, i) => SIDE_CONTEST_HOLE_MIN + i,
);

export function AdvancedSettingsSection({
  state,
  includeVisibility = false,
  hideHeading = false,
  serializedExternally = false,
  part = 'all',
}: Props) {
  const tAdv = useTranslations('wizard.sections.advanced');
  const tBasics = useTranslations('wizard.sections.basics');
  const ldLabelId = useId();
  const ctpLabelId = useId();
  const {
    requirePeerApproval,
    setRequirePeerApproval,
    // Visibility-blokk (kun når includeVisibility=true)
    scoreVisibility,
    setScoreVisibility,
    lockScoreVisibility,
    sideEnabled,
    setSideEnabled,
    sideLdCount,
    setSideLdCount,
    sideCtpCount,
    setSideCtpCount,
    sideLdHoles,
    setSideLdHole,
    sideCtpHoles,
    setSideCtpHole,
    sideTournamentSupported,
    lockSideTournament,
  } = state;

  // I wizard-pathen (serializedExternally) eier FormDataInputs serialiseringen
  // av score_visibility og side_*-feltene (#1011) — name droppes da så FormData
  // ikke får duplikater. I GameForm-pathen finnes ingen speiling, så navnene MÅ
  // stå: siden #909 er disse feltene eneste kilde til verdiene der.
  const ownName = (name: string) => (serializedExternally ? undefined : name);

  const showDuringRound = part !== 'sideAndPrizes';
  const showSideAndPrizes = part !== 'duringRound';

  return (
    <section>
      {!hideHeading && (
        <h2 className="text-sm font-medium text-text">{tAdv('heading')}</h2>
      )}

      {/* Peer-godkjenning: ett kort med én bryterrad, uten kicker. Bryteren er
          en native checkbox med `name`, så verdien går rett i FormData i begge
          pathene. */}
      {showDuringRound && (
        <div data-focus-inset className={`mt-4 ${LIST_CARD_CLASS}`}>
          <SwitchRow
            name="require_peer_approval"
            checked={requirePeerApproval}
            onChange={(e) => setRequirePeerApproval(e.target.checked)}
            title={tAdv('peerApprovalTitle')}
            description={tAdv('peerApprovalDesc')}
          />
        </div>
      )}

      {includeVisibility && (
        <>
          {/* Score visibility. #1400: radioene er controlled (useGameFormState)
              i stedet for defaultChecked, så valget overlever
              `requestFormReset` når en publisering feiler. */}
          {showDuringRound && (
            <FormSection variant="bare" legend={tBasics('visibilityLegend')}>
              <ChoiceCardGrid columns={1} label={tBasics('visibilityLegend')}>
                <RadioChoiceCard
                  name={ownName('score_visibility')}
                  value="live"
                  checked={scoreVisibility === 'live'}
                  onChange={() => setScoreVisibility('live')}
                  disabled={lockScoreVisibility}
                  title={tBasics('visibilityLiveTitle')}
                  hint={tBasics('visibilityLiveDesc')}
                />
                <RadioChoiceCard
                  name={ownName('score_visibility')}
                  value="reveal"
                  checked={scoreVisibility === 'reveal'}
                  onChange={() => setScoreVisibility('reveal')}
                  disabled={lockScoreVisibility}
                  title={tBasics('visibilityRevealTitle')}
                  hint={tBasics('visibilityRevealDesc')}
                />
              </ChoiceCardGrid>
              {lockScoreVisibility && (
                <p className="px-1 pt-2 font-sans text-xs leading-[1.4] text-muted">
                  <strong>{tBasics('visibilityLockedNote')}</strong>
                </p>
              )}
            </FormSection>
          )}

          {/* Sideturnering — tilbys for alle formater. Matchplay viser LD/CTP
              kompakt under duell-kortet (#585). */}
          {showSideAndPrizes && sideTournamentSupported && (
            <FormSection
              variant="list"
              legend={tBasics('sideTournamentLegend')}
              legendHidden={part === 'sideAndPrizes'}
              data-testid="side-tournament-section"
            >
              <SwitchRow
                name={ownName('side_tournament_enabled')}
                value={serializedExternally ? undefined : 'true'}
                checked={sideEnabled}
                onChange={(e) => setSideEnabled(e.target.checked)}
                disabled={lockSideTournament}
                title={tBasics('sideTournamentTitle')}
                description={tBasics('sideTournamentDesc')}
              />

              {sideEnabled && (
                <div className="flex flex-col gap-2.5 px-3.5 py-2.5">
                  <WinnerCountRow
                    labelId={ldLabelId}
                    label={tBasics('sideLdLegend')}
                    name={ownName('side_ld_count')}
                    value={sideLdCount}
                    onChange={setSideLdCount}
                    disabled={lockSideTournament}
                  />
                  <SlotHoleSelects
                    category="ld"
                    name={ownName}
                    count={sideLdCount}
                    holes={sideLdHoles}
                    onChange={setSideLdHole}
                    disabled={lockSideTournament}
                  />
                  <WinnerCountRow
                    labelId={ctpLabelId}
                    label={tBasics('sideCtpLegend')}
                    name={ownName('side_ctp_count')}
                    value={sideCtpCount}
                    onChange={setSideCtpCount}
                    disabled={lockSideTournament}
                  />
                  <SlotHoleSelects
                    category="ctp"
                    name={ownName}
                    count={sideCtpCount}
                    holes={sideCtpHoles}
                    onChange={setSideCtpHole}
                    disabled={lockSideTournament}
                  />
                  {sideLdCount + sideCtpCount > 0 && (
                    <p className="font-sans text-xs leading-4 text-muted">
                      {tBasics('sideHoleNote')}
                    </p>
                  )}
                  {lockSideTournament && (
                    <p className="font-sans text-xs leading-[1.4] text-muted">
                      <strong>{tBasics('sideLockedNote')}</strong>
                    </p>
                  )}
                </div>
              )}
            </FormSection>
          )}

          {/* #1051: premiebord — rett etter sideturnering-konfig. Egen visnings-
              gating (podium + side-counts); serialiseres av den alltid-monterte
              forelderen (FormDataInputs / GameForm-cluster), ikke her. */}
          {showSideAndPrizes && <PrizesSection state={state} />}
        </>
      )}
    </section>
  );
}

/** «Lengste drive: antall hull» with the 0 / 1 / 2 pills on the right. */
function WinnerCountRow({
  labelId,
  label,
  name,
  value,
  onChange,
  disabled,
}: {
  labelId: string;
  label: string;
  name: string | undefined;
  value: number;
  onChange: (next: 0 | 1 | 2) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span id={labelId} className="font-sans text-[13px] leading-[normal] font-semibold text-text">
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={labelId} className="flex shrink-0 gap-2">
        {WINNER_COUNTS.map((n) => (
          <PillRadio
            key={n}
            name={name}
            value={String(n)}
            checked={value === n}
            onChange={() => onChange(n)}
            disabled={disabled}
          >
            {n}
          </PillRadio>
        ))}
      </div>
    </div>
  );
}

/**
 * #2283 (drawing O2): one «Hull for …» select per slot up to the count, under
 * that category's count row. Nothing when the count is 0. The first option,
 * «Velg hull senere», is the empty value: a slot without a hole, which the
 * organiser settles at the finish. The parser refuses two slots of one
 * category on the same hole, so the state moves a hole instead of keeping both
 * (`withSlotHole`); the select of the slot that lost it goes back to the empty
 * option.
 *
 * Own select classes, not `CardSelect`: the drawing's field is 44 px with
 * radius 12 and 16 px text on the card surface, and none of CardSelect's sizes
 * (50, 44 with radius 10 and 14 px text, 46) is that.
 */
function SlotHoleSelects({
  category,
  name,
  count,
  holes,
  onChange,
  disabled,
}: {
  category: 'ld' | 'ctp';
  /** `ownName`: undefined when the parent mirrors the field (the wizard). */
  name: (field: string) => string | undefined;
  count: number;
  holes: readonly (number | null)[];
  onChange: (position: number, hole: number | null) => void;
  disabled: boolean;
}) {
  const t = useTranslations('wizard.sections.basics');
  if (count < 1) return null;
  const field = `side_${category}_hole_`;
  return (
    <>
      {Array.from({ length: count }, (_, i) => i + 1).map((position) => {
        const label =
          category === 'ld'
            ? count === 1
              ? t('sideLdHoleLabel')
              : t('sideLdHoleLabelNumbered', { position })
            : count === 1
              ? t('sideCtpHoleLabel')
              : t('sideCtpHoleLabelNumbered', { position });
        const id = `side-${category}-hole-${position}`;
        return (
          <div key={position}>
            {/* The drawing's label is a block at the body's 16 px / 1.5 line
                with the 13 px span inside it, so the label row is 24 px tall. */}
            <label htmlFor={id} className="block text-base leading-6">
              <span className="font-sans text-[13px] leading-[normal] font-semibold text-text">
                {label}
              </span>
            </label>
            <select
              id={id}
              name={name(`${field}${position}`)}
              value={String(holeForSlot(holes, count, position) ?? '')}
              onChange={(e) => onChange(position, parseSideContestHole(e.target.value))}
              disabled={disabled}
              className="mt-1 block min-h-[44px] w-full rounded-xl border border-border bg-surface px-3 py-2 font-sans text-base leading-6 text-text disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">{t('sideHoleLater')}</option>
              {HOLE_NUMBERS.map((hole) => (
                <option key={hole} value={hole}>
                  {t('sideHoleOption', { hole })}
                </option>
              ))}
            </select>
          </div>
        );
      })}
    </>
  );
}
