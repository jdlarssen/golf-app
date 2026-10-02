'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import type { Intent } from '@/lib/wizard/intent';
import { choiceStateClass } from '@/components/ui/ChoiceCard';

type Props = {
  value: Intent | undefined;
  onChange: (intent: Intent) => void;
  /**
   * Edit-flyten: når et publisert spill redigeres, holdes intent-en synlig
   * men ikke endrebar. Backend mode-lock-en har siste ord, men UI-en speiler
   * det for å unngå utilsiktet validation-error.
   */
  disabled?: boolean;
  /**
   * #477: «Solo / Test»-arrangementet er en intern test-/øve-snarvei og vises
   * kun for admin. Vanlige brukere ser bare Kompis / Klubb / Cup. Et eksisterende
   * solo-spill som redigeres viser fortsatt kortet (value === 'solo') så intent-en
   * er synlig.
   */
  isAdmin?: boolean;
  /**
   * #525: «Klubb-turnering» er bygd rundt en ekte klubb (roster fra
   * klubbmedlemmer, klubb-synlig). En vanlig spiller uten klubb skal ikke se
   * den — flisen ville bare vært en blindvei. Vises for global admin (isAdmin)
   * ELLER for en klubb-admin (owner/admin i ≥1 klubb). Et eksisterende
   * klubb-spill som redigeres viser fortsatt kortet (value === 'klubb').
   */
  isClubAdmin?: boolean;
};

type IntentTile = {
  intent: Intent;
  icon: ReactNode;
};

// #2426: the artboard's icons — 26 px on a 24-unit grid, 1.6 stroke, always
// forest green.
const ICON_PROPS = {
  width: 26,
  height: 26,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  'aria-hidden': true,
} as const;

// Kompis: two figures shoulder to shoulder — «the gang».
const KompisIcon = (
  <svg {...ICON_PROPS}>
    <circle cx="8" cy="8" r="3" />
    <circle cx="16" cy="8" r="3" />
    <path d="M2.5 19c.6-3 2.8-5 5.5-5s4.9 2 5.5 5M10.5 19c.6-3 2.8-5 5.5-5s4.9 2 5.5 5" />
  </svg>
);

// Klubb: a trophy — an organised tournament.
const KlubbIcon = (
  <svg {...ICON_PROPS} strokeLinejoin="round">
    <path d="M7 4h10v5a5 5 0 0 1-10 0V4zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M12 14v4M8 21h8" />
  </svg>
);

// Cup: two sides facing each other across the middle.
const CupIcon = (
  <svg {...ICON_PROPS} strokeLinejoin="round">
    <path d="M4 4v16M20 4v16M4 8h5v8H4M20 8h-5v8h5M9 12h6" />
  </svg>
);

// Solo: a single flag and its hole — one player, practice.
const SoloIcon = (
  <svg {...ICON_PROPS} strokeLinejoin="round">
    <path d="M8 21V3l9 4-9 4" />
    <ellipse cx="8" cy="21" rx="4" ry="1" />
  </svg>
);

const TILES: IntentTile[] = [
  { intent: 'kompis', icon: KompisIcon },
  { intent: 'klubb', icon: KlubbIcon },
  { intent: 'cup', icon: CupIcon },
  { intent: 'solo', icon: SoloIcon },
];

/**
 * IntentSelector — wizard step 1, intent-først pickeren. Erstatter dagens
 * flate ModeSelector. 4 store kort i 2x2 mobil-grid med ikon over tekst.
 *
 * ARIA (#1794): flisene er knapper, ikke radioer. Et klikk velger arrangement
 * OG sender arrangøren videre til steg 2 (GameWizard eier den navigasjonen),
 * og WCAG 3.2.2 «On Input» sier at det å endre en innstilling ikke skal bytte
 * kontekst av seg selv. En knapp utfører per definisjon en handling, så
 * kontekst-byttet er forventet der. Grupperingen kommer fra `<fieldset>` +
 * `<legend>` (implisitt role="group"); den valgte flisen bæres av
 * `aria-current` — «gjeldende element i settet» — som er synlig når arrangøren
 * kommer tilbake hit via «Forrige» eller en dyplenke med forhåndsvalgt intent.
 *
 * Mobile-først: 2-col grid, ≥44px tap-targets. #2426: flisene er 150 px høye
 * og står 16 px fra skjermkanten, som på artboardet.
 */
export function IntentSelector({
  value,
  onChange,
  disabled = false,
  isAdmin = false,
  isClubAdmin = false,
}: Props) {
  const t = useTranslations('wizard.intent');
  // #477: skjul «Solo / Test» for ikke-admin. #525: skjul «Klubb-turnering» for
  // den som verken er global admin eller klubb-admin. Begge kortene beholdes hvis
  // et eksisterende spill med den intent-en redigeres (value-sjekken) så det
  // valgte arrangementet ikke forsvinner fra UI-en.
  const canCreateClubGame = isAdmin || isClubAdmin;
  const tiles = TILES.filter(
    (tile) =>
      (tile.intent !== 'solo' || isAdmin || value === 'solo') &&
      (tile.intent !== 'klubb' || canCreateClubGame || value === 'klubb'),
  );

  return (
    <fieldset disabled={disabled}>
      {/* #2260: the step's title above says the same («Hva slags
          arrangement?»), so the legend only names the group for screen
          readers. */}
      <legend className="sr-only">{t('legend')}</legend>
      <div className="-mx-1 grid grid-cols-2 gap-2.5">
        {tiles.map((tile) => {
          const selected = value === tile.intent;
          return (
            <button
              key={tile.intent}
              type="button"
              aria-current={selected ? 'true' : undefined}
              aria-label={t(`${tile.intent}.label`)}
              disabled={disabled}
              onClick={() => {
                if (!disabled) onChange(tile.intent);
              }}
              className={`flex min-h-[150px] flex-col items-start gap-2 rounded-2xl px-3.5 py-4 text-left text-text transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${choiceStateClass(selected)}`}
            >
              <span className="flex text-primary">{tile.icon}</span>
              <span className="font-serif text-[17px] font-semibold leading-[normal]">
                {t(`${tile.intent}.label`)}
              </span>
              <span className="font-sans text-xs leading-[1.4] text-muted">
                {t(`${tile.intent}.description`)}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
