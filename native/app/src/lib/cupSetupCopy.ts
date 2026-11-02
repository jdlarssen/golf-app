// native/app/src/lib/cupSetupCopy.ts
// #2752: teksten i oppsettet, spillerlista og cup-lenka. Der nettet sier det samme, er
// ordlyden nettets (`wizard.cupSetup`, `cup.plan`, `cup.presets`, `cup.participants`,
// `cup.sideAwards`, `cup.join` og `cup.create.errors` i messages/no.json), låst i
// `cupSetupCopy.test.ts`. Det som er nytt i appen, står i `SETUP_APP_TEXT`.
import type { CupJoinDecision } from '../../../../lib/cup/joinValidation';
import { formatMessage } from './kavalkadeCopy';
import { formatHcpNb } from './profileCopy';

/** `cup.join`. */
export const JOIN_TEXT = {
  kicker: 'Bli med i cup',
  teams: '{team1} mot {team2}',
  teeOffLine: '{date} kl. {time}',
  invite: 'Meld deg på, så setter arrangøren deg på et lag før start.',
  alreadyJoined: 'Du er påmeldt. Arrangøren fordeler lagene før start.',
  goToCup: 'Gå til cupen',
  closed: 'Påmeldingen er stengt. Du kan fortsatt følge cupen.',
  full: 'Cupen er full. Det er plass til {cap} spillere, og de er tatt.',
  notMember: 'Denne cupen er for medlemmer av {club}.',
  theClub: 'klubben',
  joinClub: 'Bli med i klubben',
  profileIncomplete: 'Du mangler handicap på profilen. Fyll det inn, så er du klar til å melde deg på.',
  completeProfile: 'Fyll ut profilen',
  join: 'Meld meg på',
  leave: 'Meld meg av',
} as const;

const JOIN_STATUS: Record<string, string> = {
  joined: 'Du er påmeldt. Vi sa fra til arrangøren.',
  left: 'Du er meldt av. Vi sa fra til arrangøren.',
  joined_self: 'Du er påmeldt din egen cup.',
  left_self: 'Du er meldt av.',
};

const JOIN_ERRORS: Record<string, string> = {
  not_found: 'Fant ikke cupen. Sjekk at lenken er hel.',
  closed: 'Påmeldingen er stengt.',
  profile_incomplete: 'Fyll ut handicap på profilen først.',
  not_member: 'Cupen er for medlemmene i klubben.',
  full: 'Cupen er full. Den tar {cap} spillere.',
  not_joined: 'Du står ikke på lista i denne cupen.',
  read_failed: 'Fikk ikke sjekket påmeldingen. Prøv igjen.',
  save_failed: 'Klarte ikke å lagre. Prøv igjen.',
};

/** `wizard.cupSetup`. */
export const DETAILS_TEXT = {
  name: 'Cup-navn',
  namePlaceholder: 'Tørny Cup 2026 — Sommer-runde',
  teamsHeading: 'Lag-navn',
  team1: 'Lag 1',
  team1Placeholder: 'Team Skog',
  team2: 'Lag 2',
  team2Placeholder: 'Team Sjø',
  pointsHeading: 'Poeng-vekting',
  pointsHint:
    'Valgfritt. Endrer du fra standard 1 poeng for seier / 0,5 for delt, skjules «først til X»-varslet. Vinneren avgjøres i stedet når cupen avsluttes.',
  win: 'Poeng for seier',
  tie: 'Poeng ved delt',
} as const;

const DETAILS_ERRORS: Record<string, string> = {
  cup_name: 'Cup-navnet må være mellom 1 og 80 tegn.',
  cup_team_1: 'Navn på lag 1 må være mellom 1 og 40 tegn.',
  cup_team_2: 'Navn på lag 2 må være mellom 1 og 40 tegn.',
  cup_team_dup: 'Lagene må ha forskjellige navn.',
  cup_win_points: 'Poeng for seier må være et tall over 0.',
  cup_tie_points: 'Poeng ved delt kan ikke være negativt.',
  cup_insert_failed: 'Klarte ikke å opprette cupen. Prøv igjen.',
};

/** `cup.plan`. */
export const PLAN_TEXT = {
  teeOffLabel: 'Cup-start (valgfritt)',
  teeOffHint:
    'Første flight starter på valgt tidspunkt, de neste forskyves ti minutter hver. La stå tom for å starte rundene manuelt selv.',
  formatHeading: 'Format',
  customName: 'Tilpasset',
  customDescription: 'Sett sammen øktene selv.',
  strategyHeading: 'Paringsstrategi',
  strategyHandicap: 'Handicap-balansert',
  strategyHandicapDescription: 'Sterk møter sterk, svak møter svak — jevnere kamper.',
  strategyRandom: 'Tilfeldig',
  strategyRandomDescription: 'Trekning av lag og motstandere.',
  bestBallLabel: 'Handicap-andel best ball (%)',
  bestBallHint: 'Andelen av spillehandicapet som gjelder på best ball-hullene (10–18). Standard er 85 %.',
} as const;

const PLAN_ERRORS: Record<string, string> = {
  plan_course: 'Velg en bane.',
  plan_tee: 'Velg en tee som hører til banen.',
  plan_preset: 'Velg et format.',
  plan_strategy: 'Velg en paring-strategi.',
  plan_sessions: 'Legg til minst én økt i det tilpassede formatet.',
  plan_best_ball: 'Handicap-andelen må være et helt tall mellom 0 og 100.',
  plan_tee_off_invalid: 'Tee-off-tidspunktet er ugyldig.',
  plan_tee_off_past: 'Tee-off kan ikke være i fortiden. Velg et tidspunkt fra nå av.',
  not_found: 'Fant ikke cupen.',
  not_draft: 'Cupen er allerede startet, så oppsettet er låst.',
};

/** `cup.presets`, de fire appen tilbyr. Sammensatte økter lager du på nettet. */
export const PRESETS = [
  {
    id: 'klassisk',
    name: 'Klassisk cup',
    description: 'Foursomes, four-ball og singler — som en ekte Ryder Cup. Alle spiller flere matcher.',
  },
  {
    id: 'fourball-singler',
    name: 'Four-ball + singler',
    description: 'En four-ball-økt og en single-økt. Trenger ikke foursomes.',
  },
  {
    id: 'singler',
    name: 'Bare singler',
    description: 'Alle møter én motspiller. Funker uansett hvor mange dere er.',
  },
  {
    id: 'splittet-cup-dag',
    name: 'Splittet cup-dag (9 + 9)',
    description: 'Én runde, fire konkurranser: greensome ute, best ball og to singler inne. Samme fire spillere i hver flight hele runden.',
  },
] as const;

/** `cup.sideAwards`: oppsettet. */
export const AWARD_SETUP_TEXT = {
  heading: 'Sidepoeng',
  hint: 'Sidepoeng for nærmest pinnen, lengste drive og GIR. Poengene legges på laget i cup-totalen når du registrerer resultatet etter runden.',
  empty: 'Ingen sidepoeng lagt til ennå.',
  kind: 'Type',
  hole: 'Hull',
  points: 'Poeng',
  winners: 'Vinnere',
  winnersHelp:
    '«Vinnere» er antall vinnerplasser for nærmest pinnen og lengste drive. For GIR er tallet maks antall per lag på hullet.',
  addRow: '+ Legg til sidepoeng',
} as const;

const AWARD_ERRORS: Record<string, string> = {
  invalid_side_award: 'Sjekk type, hull (1–18), poeng (over 0) og vinnere (1–10) på alle rader.',
  duplicate_side_award: 'Én rad per type og hull. Vil du ha flere vinnere på samme hull, øker du tallet i «Vinnere»-feltet.',
  not_found: 'Fant ikke cupen.',
  cup_finished: 'Cupen er avsluttet — sidepoeng kan ikke endres lenger.',
  cup_started: 'Cupen er i gang — sidepoeng kan bare settes opp før start.',
  winners_already_registered: 'Du har allerede registrert en vinner. Sidepoengene kan ikke redigeres etter det.',
  save_failed: 'Klarte ikke å lagre. Prøv igjen om litt.',
};

/** `cup.participants`. */
export const PLAYERS_TEXT = {
  pageTitle: 'Spillere',
  enrolledHeading: 'Påmeldte',
  countCapped: '{count} av {cap} påmeldte',
  empty: 'Ingen er påmeldt ennå. Legg til spillere fra lista under.',
  remove: 'Fjern',
  addHeading: 'Legg til spillere',
  add: 'Legg til',
  allAdded: 'Alle tilgjengelige spillere er påmeldt.',
  emptyCandidates: 'Ingen spillere å legge til ennå. Inviter spillere, så dukker de opp her.',
  pendingBadge: 'Venter på profil',
  shareHeading: 'Påmeldingslenke',
  shareHelper: 'Send lenken til spillerne, så melder de seg på selv.',
  added: 'Spilleren er lagt til.',
  removed: 'Spilleren er fjernet.',
} as const;

/** `cup.participants.remove`. */
export const REMOVE_TEXT = {
  kicker: 'Bekreft fjerning',
  heading: 'Fjerne {name} fra {cup}?',
  body: '{firstName} forsvinner fra deltakerlista i cupen.',
  captain: 'Laget står da uten kaptein.',
  canReAdd: 'Du kan legge til {firstName} igjen så lenge cupen ikke har startet.',
  confirm: 'Ja, fjern {firstName}',
  pending: 'Fjerner …',
  cancel: 'Avbryt',
  lockedHeading: 'Påmeldingen er låst',
  lockedBody: 'Cupen har startet, så du kan ikke fjerne spillere fra deltakerlista lenger.',
  fallbackFirstName: 'Spilleren',
} as const;

const PARTICIPANT_ERRORS: Record<string, string> = {
  not_found: 'Fant ikke cupen.',
  not_draft: 'Cupen har startet, så spillerlista er låst.',
  not_candidate: 'Den spilleren kan du ikke legge til i denne cupen.',
  not_participant: 'Spilleren står ikke på deltakerlista.',
  captain_needs_team: 'En kaptein må stå på et lag.',
  team_taken: 'Laget har allerede en kaptein.',
  invalid_team: 'Ugyldig lag.',
  not_allowed: 'Bare arrangøren kan sette lag og kapteiner.',
  too_many_players: 'Cupen er full. Den tar {cap} spillere.',
  plan_save_failed: 'Klarte ikke å lagre. Prøv igjen.',
};

/** Det som er nytt i appen. */
export const SETUP_APP_TEXT = {
  newCup: 'Ny cup',
  setup: 'Oppsett',
  continueDoor: 'Fortsett oppsettet',
  playersDoor: 'Spillere',
  playersCount: '{count} påmeldte',
  playersCountOne: '1 påmeldt',
  playersCountNone: 'Ingen påmeldte',
  step: 'Steg {n} av {total} · {title}',
  stepDetails: 'Navn og lag',
  stepPlan: 'Bane og oppsett',
  stepAwards: 'Sidepoeng',
  stepPlayers: 'Spillere',
  next: 'Neste',
  saving: 'Lagrer …',
  done: 'Ferdig',
  retry: 'Prøv igjen',
  share: 'Del lenka',
  needsNet: 'Du trenger nett for å gjøre dette. Sjekk nettet og prøv igjen.',
  loading: 'Henter cupen …',
  loadFailed: 'Fikk ikke tak i cupen. Prøv igjen.',
  notFound: 'Fant ikke cupen. Den finnes ikke, eller du har ikke tilgang.',
  notManager: 'Det er arrangøren som setter opp cupen.',
  locked: 'Cupen er i gang, så oppsettet er låst.',
  listLocked: 'Cupen er startet, så spillerlista er låst.',
  removeRow: 'Fjern',
  hcp: 'HCP {hcp}',
  joinLoginTitle: 'Logg inn for å bli med i cupen',
  joinLoginBody: 'Etterpå ser du cupen og kan melde deg på.',
  joinFailed: 'Fikk ikke tak i cupen. Prøv igjen.',
} as const;

export const AWARD_KINDS = ['ctp', 'ld', 'gir'] as const;

const APP_FAILURES: Record<string, string> = {
  offline: SETUP_APP_TEXT.needsNet,
  network: SETUP_APP_TEXT.needsNet,
  unauthorized: 'Logg inn på nytt og prøv igjen.',
  not_manager: SETUP_APP_TEXT.notManager,
};

/** Hvorfor et steg i veiviseren ikke gikk. */
export function detailsFailureText(reason: string): string {
  return APP_FAILURES[reason] ?? DETAILS_ERRORS[reason] ?? DETAILS_ERRORS.cup_insert_failed;
}

export function planFailureText(reason: string): string {
  if (reason === 'plan_matches_not_updated') {
    return 'Oppsettet er lagret, men kampene fikk det ikke. Prøv igjen.';
  }
  return APP_FAILURES[reason] ?? PLAN_ERRORS[reason] ?? 'Klarte ikke å lagre oppsettet. Prøv igjen.';
}

export function awardFailureText(reason: string): string {
  return APP_FAILURES[reason] ?? AWARD_ERRORS[reason] ?? AWARD_ERRORS.save_failed;
}

export function participantFailureText(reason: string, cap: number): string {
  const known = APP_FAILURES[reason] ?? PARTICIPANT_ERRORS[reason] ?? PARTICIPANT_ERRORS.plan_save_failed;
  return formatMessage(known, { cap });
}

export function setupLoadFailureText(reason: string): string {
  if (reason === 'not_found') return SETUP_APP_TEXT.notFound;
  return APP_FAILURES[reason] ?? SETUP_APP_TEXT.loadFailed;
}

/** Hvorfor påmeldingen ikke gikk. */
export function joinFailureText(reason: string, cap: number): string {
  const known = APP_FAILURES[reason] ?? JOIN_ERRORS[reason] ?? JOIN_ERRORS.save_failed;
  return formatMessage(known, { cap });
}

export function joinStatusText(status: string): string | null {
  return JOIN_STATUS[status] ?? null;
}

export function joinLoadFailureText(reason: string): string {
  if (reason === 'not_found') return JOIN_ERRORS.not_found;
  return APP_FAILURES[reason] ?? SETUP_APP_TEXT.joinFailed;
}

/** Setningen for en tilstand uten knapp å melde seg på med. */
export function joinDecisionText(decision: CupJoinDecision, facts: { cap: number; clubName: string | null }): string {
  switch (decision) {
    case 'closed':
      return JOIN_TEXT.closed;
    case 'full':
      return formatMessage(JOIN_TEXT.full, { cap: facts.cap });
    case 'not_member':
      return formatMessage(JOIN_TEXT.notMember, { club: facts.clubName ?? JOIN_TEXT.theClub });
    case 'profile_incomplete':
      return JOIN_TEXT.profileIncomplete;
    case 'already_joined':
      return JOIN_TEXT.alreadyJoined;
    case 'can_join':
      return JOIN_TEXT.invite;
    case 'not_found':
      return JOIN_ERRORS.not_found;
  }
}

/** «1 påmeldt», «6 påmeldte» eller «6 av 40 påmeldte». */
export function playerCountLine(count: number, cap: number | null): string {
  if (cap !== null) return formatMessage(PLAYERS_TEXT.countCapped, { count, cap });
  if (count === 0) return SETUP_APP_TEXT.playersCountNone;
  return count === 1 ? SETUP_APP_TEXT.playersCountOne : formatMessage(SETUP_APP_TEXT.playersCount, { count });
}

/** Handicap med norsk komma: «12,4», og plusshandicap som «+3,0», som på nettet. */
export function hcpLine(hcpIndex: number): string {
  return formatMessage(SETUP_APP_TEXT.hcp, { hcp: formatHcpNb(hcpIndex) });
}

/** Fornavnet i bekreftelsen, som på nettet. Et kallenavn står som det er. */
export function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] || REMOVE_TEXT.fallbackFirstName;
}
