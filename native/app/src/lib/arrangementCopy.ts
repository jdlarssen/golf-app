// native/app/src/lib/arrangementCopy.ts
// #2753: første steg i «Opprett spill», «Hva slags arrangement?».
//
// Ordlyden er nettets (`wizard.intent` og `wizard.stepTitle.1` i
// `messages/no.json`), låst av paritetstesten ved siden av. «Solo / test» er
// ikke med: den finnes ikke i appen (eierens valg 01.11).
import { TEAM_FORMAT_PLAYER_CAP } from '../../../../lib/games/teamFormatLimits';

/** Typene appen tilbyr. Nettets `Intent` uten `solo`. */
export type AppIntent = 'kompis' | 'klubb' | 'cup';

export const ARRANGEMENT_TEXT = {
  /** `wizard.stepTitle.1`. */
  title: 'Hva slags arrangement?',
  /** `wizard.disabledHint.step1NoIntent`. */
  noIntent: 'Velg hva slags arrangement først',
} as const;

/** Flisene, i nettets rekkefølge. */
export const ARRANGEMENT_TILES: Record<AppIntent, { label: string; description: string }> = {
  kompis: {
    label: 'Kompis-runde',
    description: `Gjør runden mer spennende, opp til ${TEAM_FORMAT_PLAYER_CAP} spillere`,
  },
  klubb: {
    label: 'Klubb-turnering',
    description: 'For klubben din, alle medlemmer kan være med',
  },
  cup: {
    label: 'Cup',
    description: 'To lag, flere matcher, lag-totalen vinner',
  },
};
