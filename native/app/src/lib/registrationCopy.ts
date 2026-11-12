// native/app/src/lib/registrationCopy.ts
// #2840 del 4: påmeldingsvalget i «Opprett spill» og kortet «Meld på laget ditt».
//
// Ordene for valgene er nettets (`wizard.stepTitle.4source`,
// `wizard.sections.registration` og `wizard.ready.checklist.source` i
// `messages/no.json`), låst av paritetstesten ved siden av. Resten er ordene fra
// tegningen v3.1, «4. Påmeldingsvalget i «Opprett spill»», som eieren godkjente.
import type { RegistrationMode } from '../../../../lib/games/registration';

/** Typene appen lar arrangøren velge. `both` kan ikke velges (#1792). */
export type AppRegistrationType = 'solo' | 'team';

/** Valgene i den rekkefølgen nettet viser dem. */
export const REGISTRATION_MODES: readonly RegistrationMode[] = ['invite_only', 'manual_approval', 'open'];
export const REGISTRATION_TYPES: readonly AppRegistrationType[] = ['solo', 'team'];

export const REGISTRATION_TEXT = {
  /** `wizard.stepTitle.4source`. */
  sourceTitle: 'Hvordan får dere spillere?',
  /** `wizard.sections.registration.whatLegend`. */
  whatLegend: 'Hva melder man på?',
  /** `wizard.sections.registration.friendsSkipTitle`. */
  friendsSkipTitle: 'Slipp venner direkte inn',
  /** `wizard.sections.registration.friendsSkipHint`. */
  friendsSkipHint: 'Venner av deg slipper rett inn uten å be om plass. Andre må fortsatt be om å bli med.',
  /** Overskriften over lista når arrangøren velger spillerne selv. */
  listInvite: 'Hvem spiller?',
  /** Tegningen: overskriften over lista når spillerne kan melde seg på selv. */
  listOptional: 'Vil du legge inn noen nå? Lista kan stå tom.',
  /** Tegningen: med lagpåmelding står ikke arrangøren på lista (`organiserStartsOnRoster`). */
  organiserOffRoster: 'Du står ikke på lista nå. Når runden er publisert, melder du på laget ditt fra runden.',
  /** Oppsummeringen. `wizard.sections.registration.heading`. */
  summaryLabel: 'Påmelding',
  /** Tegningen: «Åpen påmelding · lag». */
  summaryTeamSuffix: ' · lag',
  /** Tegningen: spillerraden når lista er tom og lagene melder seg på. */
  teamsSignUpThemselves: 'Lagene melder seg på selv',
} as const;

/** Kortene under «Hvordan får dere spillere?». `modeInvite*`, `modeApproval*`, `modeOpen*`. */
export const REGISTRATION_MODE_CARDS: Record<RegistrationMode, { title: string; hint: string }> = {
  invite_only: { title: 'Jeg velger dem nå', hint: 'Bare de du velger, er med. Privat.' },
  manual_approval: { title: 'De ber om plass, jeg godkjenner', hint: 'Spillet vises i Finn turneringer.' },
  open: {
    title: 'Åpen påmelding',
    hint: 'Alle med lenken kan melde seg på. Spillet vises i Finn turneringer.',
  },
};

/** Kortene under «Hva melder man på?». `typeSoloTitle`, `typeTeamTitle`. */
export const REGISTRATION_TYPE_LABELS: Record<AppRegistrationType, string> = {
  solo: 'Individuelt',
  team: 'Lag',
};

/** Hvordan spillerne kommer, i klar-stegets ord. `wizard.ready.checklist.source`. */
export const REGISTRATION_SOURCE_LABELS: Record<RegistrationMode, string> = {
  invite_only: 'Privat',
  manual_approval: 'Du godkjenner påmeldinger',
  open: 'Åpen påmelding',
};

/** Oppsummeringens «Påmelding»-rad: «Åpen påmelding · lag». */
export function registrationSummary(mode: RegistrationMode, type: AppRegistrationType): string {
  return `${REGISTRATION_SOURCE_LABELS[mode]}${type === 'team' ? REGISTRATION_TEXT.summaryTeamSuffix : ''}`;
}

/** Kortet på runden etter publisering (tegningen, «ownTeam»). */
export const OWN_TEAM_TEXT = {
  title: 'Meld på laget ditt',
  body: 'Du står ikke på lista ennå. Meld på laget ditt, så blir du kaptein.',
  button: 'Meld på laget ditt',
} as const;
