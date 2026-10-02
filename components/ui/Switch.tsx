'use client';

import { useId, type ChangeEvent, type ReactNode } from 'react';

/**
 * Delt on/off-bryter (`role="switch"`). Trukket ut fra PushToggle +
 * MonthlyDigestToggle (#967) så knapp-animasjon (`translate-x`) og
 * aria-mønster ikke drifter mellom kopier. Fokusringen eies av den globale
 * `:focus-visible`-regelen i globals.css (#1386). Ren presentasjon — konsumenten eier
 * state og gir en `label` (aria-label) siden bryteren ikke har synlig tekst.
 *
 * The putts pill in HoleClient (#939) deliberately keeps its own look and does
 * not use this. LiveFollowControl's larger hand-rolled switch was replaced by
 * this one (#2240).
 *
 * The track draws 44×24 and hits 44×44: `.tap-extend` hangs an invisible
 * 10px strip above and below it (#2240), so rows keep their height.
 */
const SWITCH_TAP_STYLE = { ['--tap-extend' as string]: '-10px 0' };

export function Switch({
  checked,
  onToggle,
  label,
  disabled,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      disabled={disabled}
      style={SWITCH_TAP_STYLE}
      className={`tap-extend flex h-6 w-11 shrink-0 items-center rounded-full px-0.5 transition-colors duration-150 disabled:opacity-50 ${
        checked ? 'bg-primary' : 'bg-text/20'
      }`}
    >
      <span
        className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-150 ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

/**
 * A switch row that posts with the form (#2282): the peer-approval and
 * side-tournament rows on step 5 and in «Rediger spill». Unlike `Switch` above,
 * the control is a native `<input type="checkbox" role="switch">`, so it keeps
 * its `name` and FormData reads it straight from the form.
 *
 * The whole row is the input's `<label>` (at least 68 px), so the tap target is
 * the row, not the 26 px track. The input is visually hidden; the track and
 * knob beside it are drawn from its state with `peer-checked:`, and the row
 * draws the focus ring (app/globals.css). The row's title names the switch and
 * the description describes it.
 *
 * 44 × 26 px track: --border off, --primary on; a 20 px --surface knob 3 px
 * from the edge.
 */
export function SwitchRow({
  title,
  description,
  checked,
  onChange,
  disabled,
  name,
  value,
}: {
  title: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  /** Left out when a hidden mirror carries the value instead. */
  name?: string;
  value?: string;
}) {
  const titleId = useId();
  const descriptionId = useId();
  return (
    <label className="flex min-h-[68px] cursor-pointer items-center gap-3 px-3.5 py-2.5 has-[:disabled]:cursor-not-allowed">
      <span className="min-w-0 flex-1">
        <span id={titleId} className="block font-sans text-[15px] font-semibold leading-[normal] text-text">
          {title}
        </span>
        {description && (
          <span id={descriptionId} className="mt-0.5 block font-sans text-xs leading-[normal] text-muted">
            {description}
          </span>
        )}
      </span>
      <input
        type="checkbox"
        role="switch"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className="peer sr-only"
      />
      {/* Track and knob (the ::after) both read the input's own state, so they
          stay in step with it even when a form reset changes `checked` behind
          React's back. */}
      <span
        aria-hidden="true"
        className="relative h-[26px] w-11 shrink-0 rounded-full bg-border transition-colors duration-150 peer-checked:bg-primary peer-disabled:opacity-50 after:absolute after:top-[3px] after:left-[3px] after:h-5 after:w-5 after:rounded-full after:bg-surface after:transition-transform after:duration-150 motion-reduce:after:transition-none peer-checked:after:translate-x-[18px]"
      />
    </label>
  );
}
