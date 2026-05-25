'use client';

// SideCategoriesPicker — admin-flytens kategori-velger for sideturneringen
// (v1.2.0). Tre presets («Klassisk», «Full pakke», «Custom») + grupperte
// per-kategori-togglere. Submittes som flere `side_disabled_categories`-hidden
// inputs (én per slått-av-kategori); FormData.getAll() på server-siden henter
// hele lista. Tomt array = alt på.
//
// Kobling for dual-versjon-kategorier: «Flest birdier» har både lag- og
// individ-versjon i scoring-config. UI-en eksponerer dem som ÉN bryter for å
// holde admin-flyten enkel — å skru lag-versjonen av men beholde individ-
// versjonen er et bevisst design-kutt. Behov for separat kontroll vil føre til
// to togglere senere, men dagens admin (Jørgen) trenger ikke det.

import { useMemo, useState } from 'react';
import {
  CLASSIC_DISABLED_CATEGORIES,
  type SideCategoryId,
} from '@/lib/scoring/sideTournamentConfig';

type Props = {
  /**
   * Initial-set fra DB. Tomt array = Full pakke. `CLASSIC_DISABLED_CATEGORIES`
   * = Klassisk. Custom = noe annet. Settes én gang ved mount.
   */
  defaultDisabledCategories?: readonly SideCategoryId[];
  /**
   * Når true, alle togglere + preset-knapper er disabled. Brukt i edit-flyten
   * når spillet er active/finished (lock-mønsteret matcher lock_score_visibility
   * og lock_side_tournament i GameForm).
   */
  locked?: boolean;
};

/**
 * Én rad i UI-en. `ids` kan inneholde 1–2 kategori-IDer; ved 2 styres begge
 * av samme bryter (dual-versjon-kobling — lag + individ skrus av/på sammen).
 */
type CategoryRow = {
  /** Stabil React-key (matcher norsk visningsnavn lower-snake-case). */
  key: string;
  /** Visningsnavn på norsk. */
  label: string;
  /** Kategori-IDer denne raden styrer. */
  ids: readonly SideCategoryId[];
  /**
   * Vises som liten muted-tekst til høyre. Eksempel: «10p», «4p lag / 2p indiv».
   */
  pointsLabel: string;
};

type Group = {
  /** Header-tekst. */
  title: string;
  /** Valgfri kort beskrivelse under header — én linje. */
  hint?: string;
  rows: CategoryRow[];
};

const GROUPS: readonly Group[] = [
  {
    title: 'Hovedkonkurranser',
    hint: 'Bjelkene i sideturneringen — flest poeng å hente.',
    rows: [
      {
        key: 'best_netto_18',
        label: 'Beste nettototalt 18',
        ids: ['best_netto_18'],
        pointsLabel: '10p',
      },
      {
        key: 'best_netto_f9',
        label: 'Beste nettofront 9',
        ids: ['best_netto_f9'],
        pointsLabel: '5p',
      },
      {
        key: 'best_netto_b9',
        label: 'Beste nettoback 9',
        ids: ['best_netto_b9'],
        pointsLabel: '5p',
      },
    ],
  },
  {
    title: 'Ferdighet og sjeldenhet',
    hint: 'Belønner ferdighet og sjeldne prestasjoner. Flest eagles teller også albatrosser (eagles+).',
    rows: [
      {
        key: 'best_brutto_18',
        label: 'Beste bruttototalt 18',
        ids: ['best_brutto_18_team', 'best_brutto_18_individual'],
        pointsLabel: '4p lag / 2p indiv',
      },
      {
        key: 'king_par3',
        label: 'Konge på par-3',
        ids: ['king_par3_team', 'king_par3_individual'],
        pointsLabel: '4p lag / 2p indiv',
      },
      {
        key: 'king_par4',
        label: 'Konge på par-4',
        ids: ['king_par4_team', 'king_par4_individual'],
        pointsLabel: '4p lag / 2p indiv',
      },
      {
        key: 'king_par5',
        label: 'Konge på par-5',
        ids: ['king_par5_team', 'king_par5_individual'],
        pointsLabel: '4p lag / 2p indiv',
      },
      {
        key: 'most_eagles',
        label: 'Flest eagles',
        ids: ['most_eagles_team', 'most_eagles_individual'],
        pointsLabel: '4p lag / 2p indiv',
      },
      {
        key: 'most_albatrosses',
        label: 'Flest albatrosser',
        ids: ['most_albatrosses_team', 'most_albatrosses_individual'],
        pointsLabel: '4p lag / 2p indiv',
      },
      {
        key: 'most_hole_in_ones',
        label: 'Flest hole-in-one',
        ids: ['most_hole_in_ones_team', 'most_hole_in_ones_individual'],
        pointsLabel: '4p lag / 2p indiv',
      },
      {
        key: 'clean_front_9',
        label: 'Rein front-9',
        ids: ['clean_front_9'],
        pointsLabel: '4p',
      },
      {
        key: 'clean_back_9',
        label: 'Rein back-9',
        ids: ['clean_back_9'],
        pointsLabel: '4p',
      },
      {
        key: 'no_double_plus_round',
        label: 'Ren runde — ingen double-bogey',
        ids: ['no_double_plus_round'],
        pointsLabel: '4p',
      },
      {
        key: 'longest_bogey_free_streak',
        label: 'Lengste bogey-fri rekke',
        ids: ['longest_bogey_free_streak'],
        pointsLabel: '4p',
      },
    ],
  },
  {
    title: 'Moderat',
    hint: 'Volum og litt-mindre-sjeldne ferdigheter.',
    rows: [
      {
        key: 'best_brutto_f9',
        label: 'Beste bruttofront 9',
        ids: ['best_brutto_f9_team', 'best_brutto_f9_individual'],
        pointsLabel: '2p lag / 1p indiv',
      },
      {
        key: 'best_brutto_b9',
        label: 'Beste bruttoback 9',
        ids: ['best_brutto_b9_team', 'best_brutto_b9_individual'],
        pointsLabel: '2p lag / 1p indiv',
      },
      {
        key: 'most_birdies',
        label: 'Flest birdier',
        ids: ['most_birdies_team', 'most_birdies_individual'],
        pointsLabel: '2p lag / 1p indiv',
      },
      {
        key: 'most_pars',
        label: 'Flest par',
        ids: ['most_pars_team', 'most_pars_individual'],
        pointsLabel: '2p lag / 1p indiv',
      },
      {
        key: 'lowest_single_hole_brutto',
        label: 'Lavest enkelthull brutto',
        ids: ['lowest_single_hole_brutto'],
        pointsLabel: '2p',
      },
      {
        key: 'hardest_hole_winner',
        label: 'Best på hardeste hull',
        ids: ['hardest_hole_winner'],
        pointsLabel: '2p',
      },
      {
        key: 'comeback_kid',
        label: 'Comeback kid (back-9-forbedring)',
        ids: ['comeback_kid'],
        pointsLabel: '2p',
      },
      {
        key: 'all_par_groups_birdie',
        label: 'Allsidig birdie-spiller (par-3, 4 og 5)',
        ids: ['all_par_groups_birdie'],
        pointsLabel: '2p',
      },
      {
        key: 'even_par_round',
        label: 'Even-par-runden',
        ids: ['even_par_round'],
        pointsLabel: '2p',
      },
      {
        key: 'back_to_back_birdies',
        label: 'To birdier på rad',
        ids: ['back_to_back_birdies'],
        pointsLabel: '2p × hver streak',
      },
    ],
  },
  {
    title: 'Hull-konkurranser',
    hint: 'Hull-seire per hull; LD og CTP styres med tellerne over.',
    rows: [
      {
        key: 'hole_win',
        label: 'Hull-seire (alene-vinner)',
        ids: ['hole_win'],
        pointsLabel: '2p × inntil 18',
      },
    ],
  },
  {
    title: 'Bragder',
    hint: 'Bonuser som stables — kan utløses flere ganger samme runde.',
    rows: [
      {
        key: 'turkey',
        label: 'Turkey (3 birdier på rad)',
        ids: ['turkey'],
        pointsLabel: '4p / spiller + lag-bonus',
      },
      {
        key: 'solid',
        label: 'Solid (5 par eller bedre på rad)',
        ids: ['solid'],
        pointsLabel: '2p / spiller + lag-bonus',
      },
      {
        key: 'team_all_birdied_bonus',
        label: 'Alle birdied (lag-bonus)',
        ids: ['team_all_birdied_bonus'],
        pointsLabel: '4p × medlem',
      },
      {
        key: 'team_no_bogey_hole_coord',
        label: 'Lag-par-hull (lag-bonus)',
        ids: ['team_no_bogey_hole_coord'],
        pointsLabel: '2p × medlem × hull',
      },
    ],
  },
  {
    title: 'Minuspoeng',
    hint: 'Humor og uflaks — gir trekk fra totalen.',
    rows: [
      {
        key: 'snowman',
        label: 'Snowman (lagets felles sprell på ett hull)',
        ids: ['snowman'],
        pointsLabel: '−2p',
      },
      {
        key: 'worst_single_hole_brutto',
        label: 'Verste enkelthull',
        ids: ['worst_single_hole_brutto'],
        pointsLabel: '−1p',
      },
      {
        key: 'most_double_bogeys_individual',
        label: 'Flest double-bogeys',
        ids: ['most_double_bogeys_individual'],
        pointsLabel: '−1p',
      },
    ],
  },
] as const;

type ActivePreset = 'klassisk' | 'full' | 'custom';

function detectPreset(disabled: Set<SideCategoryId>): ActivePreset {
  if (disabled.size === 0) return 'full';
  if (disabled.size !== CLASSIC_DISABLED_CATEGORIES.length) return 'custom';
  for (const id of CLASSIC_DISABLED_CATEGORIES) {
    if (!disabled.has(id)) return 'custom';
  }
  return 'klassisk';
}

export function SideCategoriesPicker({
  defaultDisabledCategories,
  locked = false,
}: Props) {
  // Set initialized once from props — parent kontrollerer ikke videre, så vi
  // unngår onChange-ekko og holder dette som ren intern state. Edit-flyten
  // remounter via key hvis nødvendig (ikke nødvendig i dagens flyt — siden
  // edit-page laster initial fra DB ved hver request).
  const [disabledSet, setDisabledSet] = useState<Set<SideCategoryId>>(
    () => new Set(defaultDisabledCategories ?? []),
  );

  const activePreset = useMemo(() => detectPreset(disabledSet), [disabledSet]);

  function applyKlassisk() {
    setDisabledSet(new Set(CLASSIC_DISABLED_CATEGORIES));
  }

  function applyFullPakke() {
    setDisabledSet(new Set());
  }

  /**
   * Custom-knappen tar deg ikke ut av valgt sett — den er kun en visuell
   * indikasjon på at brukeren har plukket manuelt. Den auto-tennes når
   * disabledSet avviker fra Klassisk og Full pakke. Klikk gjør ingenting,
   * men knappen finnes så «Custom»-aktiv-staten ikke føles uplassert.
   */
  function noopCustom() {
    /* visuell anker — ingen state-endring */
  }

  function toggleRow(ids: readonly SideCategoryId[]) {
    setDisabledSet((prev) => {
      // En rad regnes som «på» (enabled) hvis ingen av dens IDer er i
      // disabledSet. Vi flipper alle IDer atomisk: hvis hele raden er på, slå
      // alle av; ellers slå alle på. Dette holder dual-versjon-radene
      // konsistente — du kan aldri ende i en state der lag er på men individ
      // er av for samme metrikk.
      const allEnabled = ids.every((id) => !prev.has(id));
      const next = new Set(prev);
      if (allEnabled) {
        // Slå alle av
        for (const id of ids) next.add(id);
      } else {
        // Slå alle på (fjern fra disabled-set)
        for (const id of ids) next.delete(id);
      }
      return next;
    });
  }

  // Stable array for hidden-input-rendering. `Array.from` på Set er insertion-
  // order; vi sorterer leksikografisk for å holde DOM-output deterministisk
  // mellom rerenders (lettere å spotte i dev-tools, bedre for snapshot).
  const disabledSorted = useMemo(
    () => Array.from(disabledSet).sort(),
    [disabledSet],
  );

  return (
    <div className="space-y-4">
      {/* Hidden inputs — én per slått-av kategori. FormData.getAll() henter
          alle på server-siden. Tomt sett = ingen inputs rendrer = parser
          tolker som «Full pakke». */}
      {disabledSorted.map((id) => (
        <input
          key={id}
          type="hidden"
          name="side_disabled_categories"
          value={id}
        />
      ))}

      {/* Presets — fungerer som radio-style chips. Klikk setter hele sette på
          en gang. Custom auto-tennes når valg avviker fra de andre to. */}
      <div className="space-y-2">
        <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
          Forhåndsvalg
        </p>
        <div className="flex flex-wrap gap-2">
          <PresetChip
            label="Klassisk"
            description="Som før: netto + hole-win + LD/CTP"
            active={activePreset === 'klassisk'}
            disabled={locked}
            onClick={applyKlassisk}
          />
          <PresetChip
            label="Full pakke"
            description="Alle kategorier på — full innsats"
            active={activePreset === 'full'}
            disabled={locked}
            onClick={applyFullPakke}
          />
          <PresetChip
            label="Egendefinert"
            description="Plukk og miks selv"
            active={activePreset === 'custom'}
            disabled={locked}
            onClick={noopCustom}
          />
        </div>
        <p className="text-xs text-muted">
          Velg hvilke kategorier som gjelder for runden. Bytt forhåndsvalg for
          å komme raskt i gang — bryterne under følger med.
        </p>
      </div>

      {/* Grupperte togglere */}
      <div className="space-y-4">
        {GROUPS.map((group) => (
          <fieldset
            key={group.title}
            className="space-y-2 rounded-lg border border-border bg-surface p-3"
          >
            <legend className="px-1 font-serif text-sm font-medium text-text">
              {group.title}
            </legend>
            {group.hint && (
              <p className="text-xs text-muted">{group.hint}</p>
            )}
            <ul className="space-y-1.5">
              {group.rows.map((row) => {
                const isEnabled = row.ids.every((id) => !disabledSet.has(id));
                return (
                  <li key={row.key}>
                    <label
                      className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 transition-colors ${
                        isEnabled ? 'bg-primary-soft/40' : 'bg-transparent'
                      } ${locked ? 'cursor-not-allowed opacity-60' : 'hover:bg-primary-soft/60'}`}
                    >
                      <input
                        type="checkbox"
                        checked={isEnabled}
                        disabled={locked}
                        onChange={() => toggleRow(row.ids)}
                        className="h-5 w-5 shrink-0 rounded border-border text-primary focus:ring-accent/40 disabled:cursor-not-allowed"
                      />
                      <span className="flex-1 text-sm text-text">
                        {row.label}
                      </span>
                      <span className="shrink-0 font-sans text-xs tabular-nums text-muted">
                        {row.pointsLabel}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        ))}
      </div>

      {locked && (
        <p className="text-xs text-muted">
          <strong>Spillet er aktivt — kategorier kan ikke endres.</strong>
        </p>
      )}
    </div>
  );
}

function PresetChip({
  label,
  description,
  active,
  disabled,
  onClick,
}: {
  label: string;
  description: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  // Pill-knapper i samme høyde som Button-primitiven (min-h-[44px]) for å
  // matche tap-target-kravet. Aktiv state = forest-green fill; inaktiv =
  // hairline-border. Velger ikke Button.tsx direkte fordi vi trenger en mer
  // kompakt label+description-struktur enn primary/secondary-variantene
  // dekker.
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`flex min-h-[44px] flex-col items-start rounded-full border px-4 py-1.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        active
          ? 'border-primary bg-primary text-white shadow-sm dark:text-bg'
          : 'border-border bg-surface text-text hover:bg-primary-soft'
      }`}
    >
      <span className="font-serif text-sm font-medium leading-tight">
        {label}
      </span>
      <span
        className={`text-[10px] leading-tight ${active ? 'text-white/85 dark:text-bg/85' : 'text-muted'}`}
      >
        {description}
      </span>
    </button>
  );
}
