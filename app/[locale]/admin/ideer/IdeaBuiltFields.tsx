'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/Input';
import { IDEA_BUILT_LINK_MAX, IDEA_BUILT_SUMMARY_MAX } from '@/lib/notifications/ideaBuiltInput';

// #2568: the line and link for «Marker som bygd». A picker with the latest
// launches fills both (owner's choice 13.10, «Velg fra siste lanseringer»); the
// admin can still write in either field. One native <select> per idea, not a
// row of buttons: the page lists up to 100 ideas, and iOS gives the wheel.

export type LaunchOption = { id: string; label: string; summary: string; link: string };

export function IdeaBuiltFields({
  rowId,
  options,
  labels,
}: {
  rowId: string;
  options: LaunchOption[];
  labels: {
    launchPickerLabel: string;
    launchPickerEmpty: string;
    summaryLabel: string;
    summaryHint: string;
    summaryPlaceholder: string;
    linkLabel: string;
    linkHint: string;
  };
}) {
  const [summary, setSummary] = useState('');
  const [link, setLink] = useState('');

  return (
    <>
      {options.length > 0 && (
        <div>
          <label htmlFor={`launch-${rowId}`} className="block text-sm font-medium text-text mb-1.5">
            {labels.launchPickerLabel}
          </label>
          <select
            id={`launch-${rowId}`}
            defaultValue=""
            onChange={(e) => {
              const picked = options.find((o) => o.id === e.target.value);
              if (!picked) return;
              // Both fields follow the pick, so a link from an earlier pick
              // never lingers under a launch without one.
              setSummary(picked.summary);
              setLink(picked.link);
            }}
            className="w-full min-h-11 rounded-xl border border-border px-3.5 py-3 bg-surface text-text focus:border-accent transition-[border-color,box-shadow] duration-150"
          >
            <option value="">{labels.launchPickerEmpty}</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}
      <Input
        id={`summary-${rowId}`}
        name="summary"
        type="text"
        label={labels.summaryLabel}
        hint={labels.summaryHint}
        placeholder={labels.summaryPlaceholder}
        required
        maxLength={IDEA_BUILT_SUMMARY_MAX}
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
      />
      <Input
        id={`link-${rowId}`}
        name="link"
        type="text"
        label={labels.linkLabel}
        hint={labels.linkHint}
        pattern="^/\S*$"
        maxLength={IDEA_BUILT_LINK_MAX}
        value={link}
        onChange={(e) => setLink(e.target.value)}
      />
    </>
  );
}
