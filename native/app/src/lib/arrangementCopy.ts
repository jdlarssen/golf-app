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

/** «Klubb-turnering» (#2753): `wizard.club`, `wizard.disabledHint.step2NoClub`, `wizard.step4`. */
export const CLUB_TEXT = {
  legend: 'Hvilken klubb?',
  hint: 'Medlemmene kan se og melde seg på alle spill du setter opp for klubben.',
  noClub: 'Velg klubben først',
  emptyRoster: 'Du kan også la lista stå tom. Medlemmene i klubben kan melde seg på selv.',
} as const;

/** `klubb.roles`, for eier og admin. Et vanlig medlem får ingen rolle på kortet. */
const ROLE_LABELS = { owner: 'Eier', admin: 'Admin' } as const;

/** «12 medlemmer», «1 medlem». `wizard.club.memberCount`. */
export function memberCountText(count: number): string {
  return `${count} ${count === 1 ? 'medlem' : 'medlemmer'}`;
}

/** Linja under klubbnavnet: «Eier · 12 medlemmer» eller «84 medlemmer». `wizard.club.roleAndCount`. */
export function clubCardLine(role: 'owner' | 'admin' | 'member', count: number): string {
  return role === 'member' ? memberCountText(count) : `${ROLE_LABELS[role]} · ${memberCountText(count)}`;
}
