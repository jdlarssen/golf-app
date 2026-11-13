'use client';

import type { KeyboardEvent } from 'react';

/**
 * The player search on step 4 of the new-game wizard and in GameForm (#2321):
 * a field with the search icon inside, 12 px from the edge, and the text 8 px
 * after it, as `Spillere-forslag` and `Nyttspill-4-spillere` draw it.
 *
 * Both sit inside one big `<form>`, so the browser would submit it on Enter:
 * on step 4 of the wizard (no submit button on screen) the page reloaded on
 * step 1 with every field in the URL and the draft gone, and in GameForm Enter
 * pressed the first submit button. Enter does nothing here. The field has no
 * `name`, so it never posts.
 *
 * `default` is 50 px and `large` 52 px: the artboards' 48 / 50 px boxes draw
 * their 1 px border outside the number. `filled` is the team friend picker's
 * field (#2840): 48 px, no frame, filled with `surface-2`.
 */
export function SearchField({
  id,
  label,
  value,
  onChange,
  placeholder,
  size = 'default',
  tone = 'outlined',
  className = '',
}: {
  id: string;
  /** Screen readers only. */
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  size?: 'default' | 'large';
  tone?: 'outlined' | 'filled';
  className?: string;
}) {
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') e.preventDefault();
  }
  return (
    <div className={`relative ${className}`}>
      <span className="pointer-events-none absolute left-[13px] top-1/2 flex -translate-y-1/2 text-muted">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
      </span>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        className={`${
          tone === 'filled'
            ? // #2840: no browser clear button. Chromium keeps ~25 px for it even when it is
              // hidden, which cut «Søk i vennene» beside «+ Legg til venn» on a phone.
              'h-12 rounded-[14px] border border-transparent bg-surface-2 pl-[40px] [&::-webkit-search-cancel-button]:appearance-none'
            : `${size === 'large' ? 'h-[52px] pl-[38px]' : 'h-[50px] pl-[40px]'} rounded-xl border border-field-border bg-surface`
        } w-full ${tone === 'filled' ? 'pr-2' : 'pr-3'} font-sans text-base text-text placeholder:text-muted`}
      />
    </div>
  );
}
