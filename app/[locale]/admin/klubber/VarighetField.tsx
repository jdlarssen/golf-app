'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

/**
 * VarighetField — avtale-varighet for opprett/rediger-klubb (#50).
 *
 * To radioknapper (Uendelig / Sett sluttdato) + et dato-felt som KUN vises når
 * «Sett sluttdato» er valgt. Klient-komponent fordi:
 *   - dato-feltet skal skjules når «Uendelig» er valgt (unngår et irrelevant,
 *     tomt dato-felt — det var dette som så «feil farge» ut),
 *   - tekst-fargen skal være dempet når feltet er tomt og full når en dato er
 *     valgt (en tom `<input type="date">` viser ellers «dd.mm.åååå» i full
 *     tekstfarge, som ser ut som ekte innhold).
 *
 * Feltene heter `varighet_mode` + `sluttdato` og leses av server-actionene
 * (createClubForAdmin / updateClubTerms) via FormData — uendret kontrakt.
 */
export function VarighetField({
  defaultMode,
  defaultDate,
}: {
  defaultMode: 'uendelig' | 'dato';
  defaultDate: string;
}) {
  const t = useTranslations('klubb.varighet');
  const [mode, setMode] = useState<'uendelig' | 'dato'>(defaultMode);
  const [date, setDate] = useState<string>(defaultDate);

  return (
    <div>
      <p className="mb-2 block text-sm font-medium text-text">{t('fieldLabel')}</p>
      <div className="space-y-2">
        <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-3">
          <input
            type="radio"
            name="varighet_mode"
            value="uendelig"
            checked={mode === 'uendelig'}
            onChange={() => setMode('uendelig')}
            className="h-4 w-4 accent-primary"
          />
          <span className="font-sans text-sm text-text">{t('infinite')}</span>
        </label>
        <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-3">
          <input
            type="radio"
            name="varighet_mode"
            value="dato"
            checked={mode === 'dato'}
            onChange={() => setMode('dato')}
            className="h-4 w-4 accent-primary"
          />
          <span className="font-sans text-sm text-text">{t('setEndDate')}</span>
        </label>
      </div>

      {mode === 'dato' && (
        <div className="mt-3">
          <input
            type="date"
            name="sluttdato"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={`block w-full max-w-full appearance-none rounded-xl border border-border bg-surface px-3.5 py-3 [box-sizing:border-box] ${
              date ? 'text-text' : 'text-muted'
            } focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40 transition-[border-color,box-shadow] duration-150`}
          />
          <p className="mt-1.5 text-xs text-muted">
            {t('endDateHint')}
          </p>
        </div>
      )}
    </div>
  );
}
