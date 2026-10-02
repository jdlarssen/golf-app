'use client';

/**
 * GameWizard — 5-stegs hurtig-oppsett av nye spill (F2 #272).
 *
 * Orchestrert som:
 *   Steg 1 (Arrangement) → IntentSelector (Kompis/Klubb/Cup/Solo). #1794:
 *                          flis-klikket går rett videre til steg 2 — se
 *                          `handleIntentSelect`.
 *   Steg 2 (Format)      → teller (kun kompis) + FormatGrid (Kompis/Klubb/
 *                          Solo) eller CupSetup (Cup, kort-circuit til
 *                          2-step cup-creation-flyt) + mode-spesifikk setup
 *                          (Wolf/Nassau/Skins/.../TeamSizeSelector)
 *   Steg 3 (Bane)        → BasicsSection minus spillnavn + advanced
 *   Steg 4 (Spillere)    → PlayerPickerGrid + PlayerTray (#2321: vennene
 *                          dine som kort, sist spilt først). Lagformater og
 *                          singles matchplay fordeler lag/sider/flights på en
 *                          egen skjerm (`?step=4&skjerm=lag`) med
 *                          TeamsAssignmentSection; solo-formatene har tee per
 *                          spiller rett på velgeren.
 *   Steg 5 (Klar)        → ReadyStep (summary + påmelding/allowance/
 *                          kontingent + avanserte + publish/draft)
 *
 * #1065: allowance-feltene og hele RegistrationSection (påmelding +
 * startkontingent) flyttet fra steg 2 til steg 5 — steg 2 er nå kun teller +
 * format-grid + mode-spesifikk setup (~1 skjermhøyde). Steg 4 sin
 * «Neste»-gate slipper samtidig på tomt roster (se `canAdvance()` under)
 * siden registreringsvalget (som tidligere gjorde spillerlisten valgfri) nå
 * tas EFTER steg 4, ikke før.
 *
 * URL-state: `?step=2..5`, og `skjerm=lag` for steg 4s andre skjerm (#2321).
 * #1380: steg-overganger som arrangøren utløser
 * (Neste/Forrige/hopp-til-steg) skriver URL-en med `router.push`, så hvert
 * steg får sin egen history-entry og browser-back fra steg N lander på N-1.
 * Back fra steg 1 går ut av wizard-en (dokumentert intensjon). URL-skriving
 * UTEN bruker-intensjon — normalisering av en ugyldig `?step=99` ned til
 * steg 1 — bruker `router.replace`, ellers ville back-en gå tilbake til den
 * ugyldige URL-en og normalisere på nytt i en løkke.
 *
 * #1380: utfyllingen speiles også til sessionStorage (wizardStatePersistence)
 * så reload, tilbake-gest og PWA-eviction ikke tar med seg alt arrangøren har
 * fylt ut. Payloaden slettes ved publisering/utkast-lagring.
 *
 * #1061: escape-hatchen til full-form (GameForm) er fjernet — wizard-en
 * dekker alt GameForm dekket ved opprettelse.
 *
 * #1385: og et lagret utkast gjenopptas nå i veiviseren, ikke i GameForm.
 * Admin sin rediger-rute (`app/[locale]/admin/games/[id]/edit`) mounter denne
 * komponenten med `mode.kind === 'edit-draft'`. GameForm står igjen som
 * flate for planlagte spill — og for de utkastene veiviseren ikke kan
 * representere (cup-/liga-koblede, eller et format utenfor katalogene; se
 * `lib/wizard/draftResumePlan.ts`).
 */

import {
  Fragment,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { useSearchParams } from 'next/navigation';
import { rosterLoadedIdsValue } from '@/lib/games/rosterEdit';
import { useRouter, usePathname, Link } from '@/i18n/navigation';
import { useLocale } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { FormSection } from '@/components/ui/FormSection';
import { CardSelect } from '@/components/ui/CardField';
import { SmartLink } from '@/components/ui/SmartLink';
import type { Intent } from '@/lib/wizard/intent';
import { pickerSource, selectablePlayers } from '@/lib/wizard/selectablePlayers';
import { inviteEmailRoom, pickerCap, playerTarget } from '@/lib/wizard/playerTarget';
import { pickerSubtitle } from '@/lib/wizard/pickerSubtitle';
import type { FormatForIntent } from '@/lib/formats/getFormatsForIntent';
import { isStablefordFamily, type GameMode } from '@/lib/scoring/modes/types';
import { usesGameHcpAllowance } from '@/lib/games/hcpAllowance';
import { PRIZE_SLOTS, prizeFieldName } from '@/lib/games/prizes';
import { IntentSelector } from './IntentSelector';
import { FormatGrid } from './FormatGrid';
import { FormatGuideSheet } from '@/components/FormatGuideSheet';
import type { FormatGuideEntry } from '@/components/FormatGuideList';
import { CupSetup } from './CupSetup';
import { TeamSizeSelector } from './TeamSizeSelector';
import { useGameFormState, PLAYER_COUNT_DEFAULT } from './useGameFormState';
import { BasicsSection } from './sections/BasicsSection';
import { PlayerPickerGrid } from './sections/PlayerPickerGrid';
import { PlayerTray, PlayerTraySpacer } from './sections/PlayerTray';
import {
  TeamsAssignmentSection,
  teamsAssignmentHasContent,
} from './sections/TeamsAssignmentSection';
import { PlayerTeeChoiceInputs } from './sections/PlayerTeeChoiceInputs';
import { ReadyStep } from './sections/ReadyStep';
import { WolfSetup } from './sections/WolfSetup';
import { NassauSetup } from './sections/NassauSetup';
import { SkinsSetup } from './sections/SkinsSetup';
import { NinesSetup } from './sections/NinesSetup';
import { AceyDeuceySetup } from './sections/AceyDeuceySetup';
import { WagerStakeSetup } from './sections/WagerStakeSetup';
import { ShambleSetup } from './sections/ShambleSetup';
import { PatsomeSetup } from './sections/PatsomeSetup';
import { useTranslations } from 'next-intl';
import type {
  CourseOption,
  PlayerOption,
  GameFormMode,
  InitialValues,
} from './GameForm';
import type { ClubOption } from '@/lib/games/newGameFormData';
import { suggestGameName } from '@/lib/games/autoGameName';
import {
  clearWizardDraft,
  loadWizardDraft,
  reconcileWizardDraft,
  saveWizardDraft,
  wizardDraftContext,
  wizardDraftFromState,
  wizardDraftStorageKey,
  type WizardDraft,
} from './wizardStatePersistence';
import { TEAM_FORMAT_PLAYER_CAP } from '@/lib/games/teamFormatLimits';

type Step = 1 | 2 | 3 | 4 | 5;

type Props = {
  courses: CourseOption[];
  players: PlayerOption[];
  mode: GameFormMode;
  initialValues?: InitialValues;
  // F2 (#272): cup-link og direkte URL kan pre-velge intent. Driver
  // step-1-IntentSelector og påfølgende step-2-render-grening (FormatGrid vs
  // CupSetup).
  initialIntent?: Intent;
  // Format-katalog forhåndshentet i page.tsx (server-component) for hver av
  // de tre ikke-cup-intents. Step 2 leser denne basert på state.intent.
  formatsByIntent: Record<'kompis' | 'klubb' | 'solo', FormatForIntent[]>;
  // #442: klubber brukeren er medlem av — for «Hvem er dette for?»-velgeren.
  // Tom liste = velgeren vises ikke. Alltid trygt å sende tom liste.
  clubs?: ClubOption[];
  // #442: forhåndsvalgt klubb-id (fra ?klubb= search-param). Sendes videre
  // til useGameFormState som defaultGroupId.
  defaultGroupId?: string;
  /**
   * #464: ids til spillere som er venner av arrangøren. Picker-kilden for
   * kompis/cup-intent (og klubb uten valgt klubb) filtreres ned til disse +
   * deg selv. Tom liste = bare deg selv kan legges til (tom-tilstand viser
   * «Legg til venner»-lenke).
   */
  friendPlayerIds?: string[];
  /**
   * #464: clubId → medlemmenes user-ids. Picker-kilden for klubb-intent m/ valgt
   * klubb filtreres ned til den klubbens medlemmer. Tom = ingen klubbdata.
   */
  clubMemberIdsByClub?: Record<string, string[]>;
  /**
   * #464: innlogget brukers id. Alltid valgbar i ikke-solo-kontekster slik at
   * arrangøren kan legge til seg selv (du er ikke din egen venn/klubbmedlem).
   */
  currentUserId?: string;
  /**
   * #477: styrer om «Solo / Test»-arrangementet vises i IntentSelector. Kun
   * admin. Admin-flyten (`/admin/games/new`) sender true; den åpne `/opprett-
   * spill`-flyten sender brukerens faktiske admin-status.
   */
  isAdmin?: boolean;
  /**
   * #525: styrer om «Klubb-turnering» vises i IntentSelector for en ikke-admin.
   * True når brukeren er owner/admin i ≥1 klubb. `/opprett-spill` beregner det
   * via `isClubAdminAnywhere`; admin-flyten trenger det ikke (isAdmin dekker).
   */
  isClubAdmin?: boolean;
  /**
   * #498: format-oppslagsverket (server-bygget i page.tsx) som mater «?»-arket
   * på steg 2, så det kan rendre klient-side uten ekstra fetch. Tom = «?»-arket
   * viser ingenting (defensivt; arket åpnes likevel uten å feile).
   */
  formatGuide?: FormatGuideEntry[];
  /**
   * #1385: startverdi for #373-telleren på steg 2. Utelatt → default-4 (fersk
   * opprettelse). `null` → uten antall, altså alle formatene som rader uten
   * anbefaling (#2260).
   *
   * Et gjenopptatt utkast MÅ sette denne: default-4 filtrerer bort utkastets
   * eget format fra grid-et for alt som ikke passer 4 spillere (singles
   * matchplay, nines, shamble …), og da står steg 2 uten valgt kort.
   * `resumeExpectedPlayerCount` (lib/wizard/draftResumePlan.ts) eier regelen.
   * Et gjenopprettet sessionStorage-utkast bærer sin egen verdi og vinner over
   * denne.
   */
  initialExpectedPlayerCount?: number | null;
  /**
   * #2260: where the back arrow leads on step 1 — out of the wizard, to the
   * route's old back link (`/`, `/admin/games`, or the game's own page).
   */
  backHref: string;
  /**
   * #2260: the door in the top kicker («Nytt spill · Steg 2 av 5»). Left out
   * → «Nytt spill»; the edit route passes «Rediger spill».
   */
  entryLabel?: string;
  /**
   * #2260: the route's banners (player shortage, cup, revansje, edit). They
   * render between the stripe and the title; each banner carries its own top
   * margin, so one that is not shown leaves no gap.
   */
  notice?: ReactNode;
};

const TOTAL_STEPS = 5;

/** Hvor lenge vi venter etter siste tastetrykk før utkastet skrives. */
const DRAFT_WRITE_DEBOUNCE_MS = 400;

function parseStepFromSearch(sp: URLSearchParams): Step {
  const raw = sp.get('step');
  if (raw === '2') return 2;
  if (raw === '3') return 3;
  if (raw === '4') return 4;
  if (raw === '5') return 5;
  return 1;
}

/**
 * #2321: steg 4s andre skjerm (lag, sider og flights) er `?step=4&skjerm=lag`.
 * På alle andre steg betyr parameteren ingenting.
 */
const TEAMS_SCREEN_PARAM = 'skjerm';
const TEAMS_SCREEN_VALUE = 'lag';

function parseTeamsScreenFromSearch(sp: URLSearchParams): boolean {
  return parseStepFromSearch(sp) === 4 && sp.get(TEAMS_SCREEN_PARAM) === TEAMS_SCREEN_VALUE;
}

/**
 * #1383/#1653: hvor langt inn i veiviseren rutas forvalg rettferdiggjør at en
 * `?step=N`-lenke får lande? Alt OVER taket er en foreldet lenke og sendes
 * tilbake til steg 1.
 *
 * `scheduled_tee_off_at` teller IKKE som forvalg: admin-ruta sender den alltid
 * (#1171 smart default), så selve tilstedeværelsen av `initialValues` er ikke
 * et signal. Verdien avgjør, ikke nøkkelen: en nøkkel som står der med
 * `undefined` er ingen arrangør-beslutning. Ingen konsument gjør det i dag, men
 * den dagen et alltid-tilstedeværende valgfritt felt legges inn her, ville en
 * ren nøkkel-telling slått av hele fiksen uten at noe feilet.
 *
 * Tre klasser, ikke en per-felt-matrise:
 *
 *   ingenting seedet → **1**. Blank start; enhver `?step=2..5` er foreldet.
 *   kun `course_id`  → **2**. `?bane=`-dyplenka (#1023) fra de offentlige
 *                      banesidene. Banen er reell, så Format-steget (den neste
 *                      ekte beslutningen) er greit å lande på — men ikke forbi:
 *                      steg 3+ forutsetter et formatvalg ingen har tatt, og
 *                      seeden dekker bare én av steg 3s tre gates (bane/tee/
 *                      tidspunkt). Det var #1653: `?bane=…&step=5` landet
 *                      arrangøren i «Klar?» med default-format og tom
 *                      spillerliste — plagen #1383 skulle fjerne.
 *   alt annet        → **Infinity**. Cup-lenka (`tournament_id`/`game_mode`/
 *                      `lock_game_mode`) og revansje (`?fra=`: roster + format
 *                      + baneoppsett) er bevisst sendt inn med forvalg og skal
 *                      aldri resettes.
 *
 * ⚠️ Nye ett-felts-seeds må velge sitt eget tak her — faller de i «alt annet»
 * får de Infinity, altså ingen reset, og #1653 gjentar seg for den lenka.
 *
 * `initialIntent`/`defaultGroupId` (`?intent=`, `?klubb=`) er bevisst utenfor:
 * de er egne props, ikke `initialValues`, og hever aldri taket.
 */
function seededStepCeiling(initialValues: InitialValues | undefined): number {
  const seededKeys = Object.entries(initialValues ?? {})
    .filter(
      ([key, value]) =>
        key !== 'scheduled_tee_off_at' && value !== undefined && value !== '',
    )
    .map(([key]) => key);

  if (seededKeys.length === 0) return 1;
  if (seededKeys.length === 1 && seededKeys[0] === 'course_id') return 2;
  return Infinity;
}

/**
 * Ytre skall: leser et eventuelt lagret utkast (#1380) og monterer
 * veiviser-kroppen på nytt med det som seed.
 *
 * Hvorfor remount og ikke settere: `useGameFormState` seeder ALL sin state i
 * useState-initializere fra `initialValues`. De kjører én gang, ved mount — og
 * sessionStorage kan ikke leses under render (finnes ikke på serveren, ville
 * gitt hydrerings-mismatch). Vi leser derfor i en effekt etter mount og bytter
 * `key` på kroppen, slik at initializerne kjører på nytt med utkastet. Finnes
 * det ikke noe utkast — det vanlige tilfellet — skjer ingen remount i det hele
 * tatt.
 *
 * #1383: samme effekt avgjør også om en `?step=N`-URL er foreldet. Steget
 * leses fra URL-en ved mount, men skjema-staten starter blank — en delt eller
 * bokmerket `?step=5`-lenke (ny fane, annen enhet, tømt sessionStorage) ville
 * ellers vist «Klar?»-oppsummeringen full av defaults arrangøren aldri har
 * valgt. Finnes det verken utkast eller forvalg, sender vi flyten tilbake til
 * steg 1.
 */
export function GameWizard(props: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const storageKey = wizardDraftStorageKey(pathname);
  const draftContext = wizardDraftContext({
    initialIntent: props.initialIntent,
    initialValues: props.initialValues,
    defaultGroupId: props.defaultGroupId,
  });
  const [draft, setDraft] = useState<WizardDraft | null>(null);
  // #1383: reset skjer maks én gang per mount. `?step` er borte etter
  // replace-en, så steg-guarden under stopper uansett en ny runde — men
  // replace-navigasjonen er en RSC-rundtur, og ref-en holder vinduet før
  // `searchParams` rekker å oppdatere seg lukket.
  const didResetStep = useRef(false);

  const { courses, players } = props;
  const stepCeiling = seededStepCeiling(props.initialValues);
  // #1385: et utkast som gjenopptas fra databasen seedes ALDRI fra
  // sessionStorage. Kontekst-fingeravtrykket (wizardDraftContext) består av
  // intent/tournament_id/game_mode/lock_game_mode/group_id — alt sammen
  // stabilt på tvers av besøk på samme utkast — så et lokalt utkast fra i
  // sted ville passert vakten og lagt seg OVER radens verdier
  // (`seedValues = { ...initialValues, ...draft.values }`). For et gjenopptatt
  // utkast er serveren fasit. Reset-grenen under er samtidig uaktuell her:
  // effekten returnerer tidlig for edit-draft — og en draft-rad seeder uansett
  // hele flyten, så steg-taket (#1653) står på 5.
  const resumingServerDraft = props.mode.kind === 'edit-draft';
  // #2321: «utkastet er hentet» — signalet `WizardBody` venter på før den
  // retter en `?step=4&skjerm=lag` som ikke gjelder. Kroppen monteres først
  // som 'fresh', og barnas effekter kjører før denne effekten henter utkastet;
  // uten signalet ville en reload av lag-skjermen mistet `skjerm` før de valgte
  // spillerne kom tilbake. Et serverutkast er hentet fra start. Ved en foreldet
  // lenke blir det stående false: replace-en under sletter alt `step` og
  // `skjerm`, og en ny replace ville overskrevet den.
  const [draftSettled, setDraftSettled] = useState(resumingServerDraft);
  useEffect(() => {
    if (resumingServerDraft) return;
    const found = loadWizardDraft(storageKey, draftContext);
    if (found) {
      // setState i en effekt er poenget her: vi henter EKSTERN tilstand
      // (sessionStorage) som ikke kan leses under render. React-linteren
      // advarer mot mønsteret generelt; for dette tilfellet er det korrekt.
      /* eslint-disable react-hooks/set-state-in-effect */
      setDraft(reconcileWizardDraft(found, { courses, players }));
      setDraftSettled(true);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }

    // #1383: ingenting å gjenoppta. Står det likevel et steg i URL-en som er
    // høyere enn rutas forvalg rettferdiggjør, er lenken foreldet → tilbake til
    // steg 1 (#1653: taket, ikke et av/på-flagg). Reset-målet er alltid steg 1,
    // ikke taket: én semantikk — «lenken var foreldet, start fra begynnelsen
    // med forvalgene intakte». Minste tak er 1 og parseren gir ≥1, så en useedet
    // flyt oppfører seg akkurat som før.
    // `replace` (ikke push): dette er ikke en navigasjon arrangøren gjorde.
    if (didResetStep.current) return;
    const params = new URLSearchParams(searchParamsString);
    if (parseStepFromSearch(params) <= stepCeiling) {
      setDraftSettled(true);
      return;
    }
    didResetStep.current = true;
    // Øvrige params (?intent=, ?klubb=, ?bane=, ?fra=) er seedene RSC-re-
    // renderen leser — kun `step` (og #2321s `skjerm`) skal bort.
    params.delete('step');
    params.delete(TEAMS_SCREEN_PARAM);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    // ⚠️ `searchParamsString` skal IKKE inn i dep-arrayet, selv om effekten
    // leser den. «Er denne ?step-lenken foreldet?» er per definisjon et
    // mount-spørsmål: URL-en kom utenfra. Med URL-en som dependency kjører
    // avgjørelsen på nytt ved HVER steg-navigasjon — og da er utkastet det
    // eneste «finnes noe å gjenoppta»-signalet. Cup-grenen skriver aldri
    // utkast (se `isNewCupFlow` under), så arrangørens første «Neste» ble
    // lest som en foreldet lenke og kastet tilbake til steg 1. Effekten
    // fanger `searchParamsString` fra sin egen render, så mount-verdien er
    // den riktige — ingen stale closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, draftContext, resumingServerDraft]);

  return (
    <WizardBody
      key={draft ? 'restored' : 'fresh'}
      {...props}
      draft={draft}
      draftSettled={draftSettled}
      storageKey={storageKey}
      draftContext={draftContext}
    />
  );
}

type BodyProps = Props & {
  /** Gjenopprettet utkast, eller null når veiviseren starter blankt. */
  draft: WizardDraft | null;
  /** #2321: utkastet er hentet (eller finnes ikke) — se `GameWizard`. */
  draftSettled: boolean;
  storageKey: string;
  draftContext: string;
};

function WizardBody({
  courses,
  players,
  mode,
  initialValues,
  initialIntent,
  formatsByIntent,
  clubs = [],
  defaultGroupId,
  friendPlayerIds = [],
  clubMemberIdsByClub = {},
  currentUserId = '',
  initialExpectedPlayerCount,
  isAdmin = false,
  isClubAdmin = false,
  formatGuide = [],
  backHref,
  entryLabel,
  notice,
  draft,
  draftSettled,
  storageKey,
  draftContext,
}: BodyProps) {
  const t = useTranslations('wizard');
  const tModes = useTranslations('modes');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // #498: format-arket. #2260: «Reglene» på kortet og på den valgte raden
  // åpner det på sitt format (focusKey = slug); «?»-knappen i toppen er borte.
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideFocusKey, setGuideFocusKey] = useState<string | undefined>(
    undefined,
  );
  const openGuide = (slug: string) => {
    setGuideFocusKey(slug);
    setGuideOpen(true);
  };

  // Initial step leses fra URL ved mount. Senere browser-nav (back/forward)
  // reconcileres via useEffect under.
  const [step, setStep] = useState<Step>(() =>
    parseStepFromSearch(new URLSearchParams(searchParams.toString())),
  );
  // #2321: steg 4s andre skjerm (lag/sider/flights), fra `skjerm=lag`.
  const [teamsScreen, setTeamsScreen] = useState<boolean>(() =>
    parseTeamsScreenFromSearch(new URLSearchParams(searchParams.toString())),
  );

  // #1380: et gjenopprettet utkast legger seg OVER rutas egne pre-fyll (smart
  // tee-off-default, cup-/revansje-prefyll). Utkastet er arrangørens egne
  // valg, så det vinner — men bare når mount-konteksten er den samme (se
  // wizardDraftContext), så et låst cup-format aldri kan overskrives.
  const seedValues = draft ? { ...initialValues, ...draft.values } : initialValues;
  // #2210: the SERVER roster (never a restored local draft's selection),
  // captured at mount like the selection itself (see rosterEdit.ts).
  const [rosterLoadedIds] = useState(() =>
    rosterLoadedIdsValue(initialValues?.players),
  );

  const state = useGameFormState({
    initialValues: seedValues,
    // #1999: auto-navnet slutter å overstyre navnet så snart et menneske har
    // skrevet noe. Flagget bor i hooken sammen med verdien, så hvert navnefelt
    // slipper å huske regelen. Her seedes bare utkast-tilfellet: et
    // gjenopprettet utkast bærer sitt eget flagg, og uten det ville auto-navnet
    // overskrevet et håndskrevet spillnavn ved neste mount. Uten utkast lar vi
    // hooken seede fra `initialValues.name` (edit-flyt pre-touches).
    initialNameTouched: draft ? draft.nameTouched : undefined,
    players,
    courses,
    initialIntent: draft?.intent ?? initialIntent,
    defaultGroupId,
    // #1066: seeder arrangøren som spiller ved kompis-intent (se setIntent i
    // useGameFormState). Samme prop #464 allerede bruker for selectablePlayers.
    currentUserId,
    // Ternær, ikke `??`: et gjenopprettet utkast kan bære `null` (uten antall),
    // og det er et ekte valg arrangøren tok — ikke et fravær som skal falle
    // gjennom til rutas seed.
    initialExpectedPlayerCount: draft
      ? draft.expectedPlayerCount
      : initialExpectedPlayerCount,
    // #2321: «Inviter på e-post»-adressene overlever reload som resten.
    initialInviteEmails: draft?.inviteEmails,
  });

  // #464: picker-kilden følger konteksten (kompis/cup → venner, klubb m/ valgt
  // klubb → klubbmedlemmer, ellers venner, solo → uendret). Filtrerer innenfor
  // `players`-supersettet så intent kan byttes klient-side uten re-fetch.
  // TeamsAssignmentSection beholder full `players` (må slå opp allerede-valgte).
  const pickList = useMemo(
    () =>
      selectablePlayers({
        intent: state.intent,
        groupId: state.groupId,
        selfId: currentUserId,
        players,
        friendIds: new Set(friendPlayerIds),
        clubMemberIdsByClub: Object.fromEntries(
          Object.entries(clubMemberIdsByClub).map(([id, ids]) => [id, new Set(ids)]),
        ),
      }),
    [state.intent, state.groupId, currentUserId, players, friendPlayerIds, clubMemberIdsByClub],
  );
  // Id-settet brukes til å skjære ned PlayersSection sin valgbare liste; full
  // `players` beholdes der (chips/lag-oppslag på allerede-valgte).
  // #1009: økt-gjester er alltid valgbare — de er utenfor venne-/klubb-kilden,
  // men arrangøren opprettet dem selv, og uten dette ville en av-valgt gjest
  // forsvinne fra lista (eneste vei tilbake ville vært å opprette en ny
  // skygge-bruker).
  const pickIds = useMemo(() => {
    const ids = new Set(pickList.map((p) => p.id));
    for (const g of state.extraPlayers) ids.add(g.id);
    return ids;
  }, [pickList, state.extraPlayers]);
  const pickListOthers = pickList.filter((p) => p.id !== currentUserId).length;

  // #2321: velgerens regler, hver fra sitt hjem (lib/wizard/*): kilden bak
  // kickeren, taket der resten av kortene blir grå, målet brettet teller mot
  // og plassene e-postadressene har igjen.
  const source = pickerSource({
    intent: state.intent,
    groupId: state.groupId,
    clubMemberIdsByClub,
  });
  const cap = pickerCap({
    gameMode: state.gameMode,
    requiresTeams: state.requiresTeams,
    isSolo: state.isSolo,
    teamSize: state.teamSize,
  });
  const target = playerTarget({
    gameMode: state.gameMode,
    intent: state.intent,
    expectedPlayerCount: state.expectedPlayerCount,
  });
  // Lagformatene og singles matchplay fordeler lag/sider på en egen skjerm.
  // Den vises bare når den har innhold (samme vakt som GameForms Inndeling-
  // panel), så lag-skjermen står aldri tom — heller ikke i én frame.
  const hasTeamsScreen = state.requiresTeams || state.isMatchplay;
  const teamsScreenHasContent = teamsAssignmentHasContent(state);
  const showTeamsScreen =
    step === 4 && teamsScreen && hasTeamsScreen && teamsScreenHasContent;

  // Når bruker går fram/tilbake via browser, oppdateres `searchParams`. Vi
  // reconciler lokal state til URL — men kun når URL-strengen faktisk er
  // endret. Dependency på `searchParams.toString()` (ikke selve objektet)
  // unngår at en ny URLSearchParams-instans per render trigger reconciliation
  // (relevant både i prod hvor useSearchParams kan returnere nytt objekt
  // per render, og i test der vitest-mocken gir frisk instans hver gang).
  const searchParamsString = searchParams.toString();
  useEffect(() => {
    const sp = new URLSearchParams(searchParamsString);
    const urlStep = parseStepFromSearch(sp);
    const urlTeams = parseTeamsScreenFromSearch(sp);
    // setState inne i en effect ER nødvendig her: vi synker EKSTERN tilstand
    // (URL fra browser-back/forward-nav) inn til React-state. React 19 sin
    // strenge linter advarer mot pattern-en generelt — for vårt URL-sync-
    // tilfelle er den korrekt, så vi disabler regelen lokalt.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (urlStep !== step) setStep(urlStep);
    if (urlTeams !== teamsScreen) setTeamsScreen(urlTeams);
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParamsString]);

  // URL-en for et gitt steg, bygget på dagens søke-parametre (?klubb=, ?fra=
  // osv. skal overleve steg-navigasjonen). #2321: `skjerm=lag` står bare på
  // steg 4s andre skjerm.
  function urlForStep(next: Step, teams = false): string {
    const params = new URLSearchParams(searchParamsString);
    if (next === 1) params.delete('step');
    else params.set('step', String(next));
    if (next === 4 && teams) params.set(TEAMS_SCREEN_PARAM, TEAMS_SCREEN_VALUE);
    else params.delete(TEAMS_SCREEN_PARAM);
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  // #1380: effekten under kan IKKE selv se forskjell på «arrangøren gikk til
  // neste steg» og «vi normaliserte en ugyldig ?step=99 ned til 1» — den
  // avhenger bare av `step`. Signalet er derfor eksplisitt: steg-handlerne
  // (goNext/goPrev/hopp-til-steg) skriver URL-en selv med `push` og setter
  // dette flagget, som effekten leser og nullstiller. Uten skillet ville
  // normaliseringen pushet en history-entry, og back havnet på `?step=99`
  // igjen → normaliser → push → back … i ring.
  const appInitiatedStepNav = useRef(false);

  /** #1837: satt av `handleIntentSelect`, lest av fokus-effekten under. */
  const autoAdvancedRef = useRef(false);
  const stepTitleRef = useRef<HTMLHeadingElement>(null);
  /** #2321: satt av `goToStep` ved bytte til/fra lag-skjermen. */
  const screenSwitchRef = useRef(false);

  function goToStep(next: Step, teams = false) {
    if (next === step && teams === teamsScreen) return;
    // #1999: et stegbytte skal aldri kunne ligge i debounce-vinduet. Skriver
    // arrangøren navnet og går videre med én gang, er de siste 0,4 sekundene
    // ellers borte hvis siden lastes på nytt før timeren rekker å fyre.
    flushDraftWrite();
    appInitiatedStepNav.current = true;
    // #2321: velgeren er lang og knappen står nederst i brettet. Et bytte til
    // eller fra lag-skjermen starter derfor øverst, med fokus på tittelen.
    if (teams || showTeamsScreen) screenSwitchRef.current = true;
    setStep(next);
    setTeamsScreen(teams);
    router.push(urlForStep(next, teams), { scroll: false });
  }

  // Normaliser URL-en når den ikke speiler steget OG endringen ikke kom fra en
  // steg-handler. I praksis: ugyldig/ukjent `?step=`-verdi ved mount. `replace`
  // (ikke push) — en normalisering er ikke en navigasjon arrangøren gjorde, og
  // skal ikke kunne nås med back.
  useEffect(() => {
    if (appInitiatedStepNav.current) {
      appInitiatedStepNav.current = false;
      return;
    }
    const nextUrl = urlForStep(step, teamsScreen);
    const currentQs = searchParamsString;
    const currentUrl = currentQs ? `${pathname}?${currentQs}` : pathname;
    if (nextUrl !== currentUrl) {
      router.replace(nextUrl, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, teamsScreen]);

  // #2321: `skjerm=lag` som ikke gjelder — formatet har ingen lag eller sider,
  // eller skjermen har ikke innhold (ingen valgte, best ball med én). Under
  // render vises velgeren (`showTeamsScreen`); her rettes URL-en med replace,
  // men først når utkastet er hentet (se `draftSettled` i GameWizard).
  useEffect(() => {
    if (!draftSettled || step !== 4 || !teamsScreen) return;
    if (hasTeamsScreen && teamsScreenHasContent) return;
    // Normaliseringen over skal ikke skrive en gang til for samme bytte.
    appInitiatedStepNav.current = true;
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setTeamsScreen(false);
    router.replace(urlForStep(4, false), { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftSettled, step, teamsScreen, hasTeamsScreen, teamsScreenHasContent]);

  // #2321: et bytte til eller fra lag-skjermen flytter fokus til tittelen og
  // ruller til toppen, uten animasjon.
  useEffect(() => {
    if (!screenSwitchRef.current) return;
    screenSwitchRef.current = false;
    stepTitleRef.current?.focus({ preventScroll: true });
    // scrollTop, not scrollTo(): instant in every browser (no global
    // scroll-behavior), and jsdom has no scrollTo.
    const scroller = document.scrollingElement ?? document.documentElement;
    scroller.scrollTop = 0;
  }, [step, teamsScreen]);

  // #1837: auto-videre unmounter flisen arrangøren nettopp klikket, og fokus
  // faller til <body> — tastaturbrukere må tabbe fra toppen igjen, og ingen
  // skjermleser sier at steget byttet. Under den gamle flyten overlevde fokus
  // fordi «Neste» i footeren besto på tvers av steg.
  //
  // Fokus flyttes derfor til steg-overskriften: den annonserer det nye steget
  // (rolle + tittel + «Steg 2 av 5» via aria-describedby), og neste Tab lander
  // i steg 2 sitt innhold i stedet for i toppen av siden.
  //
  // Kun ved auto-videre. «Neste»/«Forrige» og URL-normalisering lar fokus stå
  // der det er — flagget settes bare i `handleIntentSelect`, og nullstilles her
  // så et senere stegbytte ikke arver det.
  useEffect(() => {
    if (!autoAdvancedRef.current) return;
    autoAdvancedRef.current = false;
    stepTitleRef.current?.focus();
  }, [step]);

  // Auto-name: når bane/tee-off endres OG admin ikke har redigert navnet
  // manuelt, oppdaterer vi forslaget. `state.selectedCourse.name` kan være
  // undefined før admin har valgt bane — `suggestGameName` returnerer da
  // tom streng, og vi unngår å overstyre eksisterende navn med tom.
  useEffect(() => {
    if (state.nameTouched) return;
    const suggested = suggestGameName({
      courseName: state.selectedCourse?.name ?? null,
      scheduledTeeOffAt: state.scheduledTeeOffAt,
      locale: locale as import('@/i18n/routing').AppLocale,
    });
    if (suggested && suggested !== state.name) {
      // #1999: maskin-inngangen — setter forslaget UTEN å markere navnet som
      // rørt, så forslaget fortsetter å følge bane og tee-off. `state.setName`
      // her ville frosset forslaget ved første bane-valg.
      state.applySuggestedName(suggested);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.selectedCourse?.name, state.scheduledTeeOffAt, state.nameTouched]);

  // Instruksen under tittelen på steg 4s lag-skjerm (#2321). Mode-aware siden
  // lag/sider/flighter varierer per modus. #2260: de andre stegene har bare
  // tittelen (steg 2 har telleren på samme plass).
  const teamsSubText = useMemo<string | null>(() => {
    if (step === 4) {
      if (state.isSolo) return null;
      if (state.isBestBall) return t('stepSubText.step4BestBall');
      if (state.isMatchplay) return t('stepSubText.step4Matchplay');
      if (state.isParStableford) return t('stepSubText.step4ParStableford');
      if (state.isTexas)
        return t('stepSubText.step4TeamSize', { teamSize: state.teamSize });
      if (state.isAmbrose)
        return t('stepSubText.step4TeamSize', { teamSize: state.teamSize });
      if (state.isShamble)
        return t('stepSubText.step4TeamSize', { teamSize: state.teamSize });
      if (state.isPatsome) return t('stepSubText.step4Patsome');
      return null;
    }
    return null;
  }, [
    t,
    step,
    state.isSolo,
    state.isBestBall,
    state.isMatchplay,
    state.isParStableford,
    state.isTexas,
    state.isAmbrose,
    state.isShamble,
    state.isPatsome,
    state.teamSize,
  ]);

  // #2321: undertittelen på velgeren — «Best ball · 4 spillere, 2 lag à 2»,
  // som på `Spillere-forslag` (orkestratorens avgjørelse 02.10). Uten mål står
  // bare formatnavnet.
  function pickerSubText(): string {
    const format = tModes(state.gameMode as Parameters<typeof tModes>[0]);
    const sub = pickerSubtitle({ gameMode: state.gameMode, target, teamSize: state.teamSize });
    if (sub.kind === 'formatOnly') return format;
    const players = t('formatGrid.lineup.players', { count: sub.players });
    if (sub.kind === 'players') return t('step4.pickerSubtitle', { format, players });
    const { lineup } = sub;
    const lineupText =
      lineup.kind === 'versus'
        ? t('formatGrid.lineup.sides', { count: lineup.perSide })
        : lineup.kind === 'teams'
          ? t('formatGrid.lineup.teams', { teams: lineup.teams, size: lineup.size })
          : t('formatGrid.lineup.wolf', { opponents: lineup.opponents });
    return t('step4.pickerSubtitleLineup', { format, players, lineup: lineupText });
  }
  const subText =
    step !== 4 ? null : showTeamsScreen ? teamsSubText : pickerSubText();

  // Cup-creation-flyt diverger fra standard wizard: bare step 1 (intent) og
  // step 2 (CupSetup-form). CupSetup eier sin egen `<form action=...>`
  // submission, så vi rendrer ingen ytter-`<form>` rundt wizard-en når
  // intent='cup' uten knyttet tournament. Når admin lander via cup-link
  // (tournament_id satt), kjører de regulær wizard-flyt med locked format.
  const tournamentIdFromInitial = initialValues?.tournament_id;
  const isNewCupFlow =
    state.intent === 'cup' && !tournamentIdFromInitial;

  // ────────────────────────────────────────────────────────────────────
  // #1380: speil utfyllingen til sessionStorage. Skrivingen er debouncet så
  // et navn som tastes inn ikke gir én skriving per tastetrykk, og deduppet
  // på serialisert innhold så rene re-rendere ikke skriver.
  // ────────────────────────────────────────────────────────────────────
  const draftSnapshot = wizardDraftFromState({ state, nameTouched: state.nameTouched });
  const draftJson = JSON.stringify(draftSnapshot);
  // Initialisert til snapshot-en ved mount: å bare ÅPNE veiviseren skal ikke
  // legge igjen et utkast — først når arrangøren faktisk endrer noe.
  const lastWrittenRef = useRef<string | null>(draftJson);
  const writeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // #1999: satt av `handleSubmitStart`. Uten det ville flushen under kunne
  // skrive utkastet TILBAKE etter at en publisering nettopp ryddet det bort —
  // `lastWrittenRef` er da null, så innholdet ser ut som en usendt endring.
  const submittedRef = useRef(false);

  useEffect(() => {
    if (isNewCupFlow) {
      // Cup-grenen har sin egen form (CupSetup) med egen state, og deler
      // ingenting med veiviser-skjemaet. Vi hverken skriver et utkast her
      // eller lar et gammelt bli liggende og lekke inn i cup-opprettelsen.
      clearWizardDraft(storageKey);
      lastWrittenRef.current = null;
      return;
    }
    if (draftJson === lastWrittenRef.current) return;
    // Arrangøren har endret noe igjen. Etter en MISLYKKET publisering (#1379)
    // står veiviseren fortsatt montert, og utkastet er relevant på nytt — så
    // flushen skal få lov til å skrive det igjen.
    submittedRef.current = false;
    const id = setTimeout(() => {
      lastWrittenRef.current = draftJson;
      saveWizardDraft(storageKey, draftSnapshot, draftContext);
    }, DRAFT_WRITE_DEBOUNCE_MS);
    writeTimerRef.current = id;
    return () => clearTimeout(id);
    // `draftSnapshot` er objektet bak `draftJson` — samme render, så
    // closuren er aldri stale. Vi depender på strengen for å slippe å
    // sammenligne objekt-identitet som endres hver render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftJson, storageKey, draftContext, isNewCupFlow]);

  /**
   * #1999: skriv utkastet NÅ i stedet for å vente ut debouncen.
   *
   * Debouncen på 400 ms ble aldri flushet. Skjedde en reload — eller la iOS
   * PWA-en fra seg siden — innenfor det vinduet etter siste tastetrykk, ble
   * utkastet gjenopprettet fra FØR endringen. For spillnavnet var det dobbelt
   * ille: både navnet og `nameTouched`-flagget som skulle beskyttet det var
   * borte, så auto-navnet overtok igjen ved neste mount.
   *
   * Samme dedupe mot `lastWrittenRef` som den debouncede skrivingen, og de
   * samme to sperrene: cup-grenen skriver ingenting, og en innsendt form skal
   * ikke få utkastet skrevet tilbake.
   */
  function flushDraftWrite() {
    if (writeTimerRef.current) {
      clearTimeout(writeTimerRef.current);
      writeTimerRef.current = null;
    }
    if (isNewCupFlow || submittedRef.current) return;
    if (draftJson === lastWrittenRef.current) return;
    lastWrittenRef.current = draftJson;
    saveWizardDraft(storageKey, draftSnapshot, draftContext);
  }

  // #1999: `pagehide` og `visibilitychange` er de to som faktisk kommer når
  // iOS Safari/PWA legger fra seg siden. `beforeunload` fyrer ikke pålitelig
  // der, så den er bevisst ikke med. Lytterne kobles på nytt når snapshot-en
  // endres — det holder closuren fersk uten en ref-til-siste-funksjon.
  useEffect(() => {
    const onPageHide = () => flushDraftWrite();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushDraftWrite();
    };
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftJson, storageKey, draftContext, isNewCupFlow]);

  /**
   * Publiser/Lagre utkast → utkastet i sessionStorage skal bort. Suksess
   * redirecter (actionen kaster NEXT_REDIRECT), så det finnes ingen
   * «det gikk bra»-tilstand å henge slettingen på — vi rydder derfor når
   * skjemaet sendes.
   *
   * Feiler server-actionen (#1379) står veiviseren fortsatt montert med alt
   * arrangøren fylte ut; `lastWrittenRef` nullstilles slik at neste endring
   * skriver utkastet på nytt.
   */
  function handleSubmitStart() {
    if (writeTimerRef.current) clearTimeout(writeTimerRef.current);
    // #1999: sperr flushen. En `pagehide` rett etter publisering (redirecten
    // ER en pagehide) ville ellers skrevet utkastet tilbake på vei ut.
    submittedRef.current = true;
    clearWizardDraft(storageKey);
    lastWrittenRef.current = null;
  }

  // Neste-knappen gates per steg. Mangel-tekst under knappen henter første
  // element fra missingForPublish (mode-aware).
  function canAdvance(): boolean {
    if (step === 1) return state.intent !== undefined;
    if (step === 2) {
      // Cup-creation-flyt har ingen «Neste» — CupSetup self-submitter.
      if (isNewCupFlow) return false;
      // For øvrige intents må format være valgt (klikket et kort i
      // FormatGrid eller låst inn via cup-link/edit) før vi kan gå videre.
      return state.formatChosen;
    }
    if (step === 3) return state.courseId !== '' && state.teeBoxId !== '' && !state.teeOffInPast;
    // Steg 4: vanligvis krever vi en gyldig spiller-fordeling per modus.
    // #1065: registreringsvalget (hvem kan melde seg på) er flyttet til
    // steg 5 — vi kan derfor IKKE lenger gate på `playersStepOptional`
    // (valget er ikke tatt ennå når admin står på steg 4 på en fremover-
    // passering; den flagget ville nesten alltid vært 'invite_only'-default
    // og dermed false, altså ingen reell bypass). I stedet slipper vi gaten
    // når rosteret er tomt/urørt — det dekker admin som har tenkt å bruke
    // selv-påmelding (velges på steg 5) uten å late som steg 4 er ferdig
    // utfylt, samtidig som en PÅBEGYNT men ugyldig seleksjon (feil antall,
    // manglende lag-fordeling) fortsatt blokkerer — samme guardrail som før
    // for admin som faktisk plukker spillere her.
    if (step === 4) return state.selectedPlayerIds.length === 0 || state.playersValidForMode;
    return false; // steg 5 har ikke neste-knapp
  }

  function nextDisabledHint(): string | null {
    if (step === 1 && state.intent === undefined) {
      return t('disabledHint.step1NoIntent');
    }
    if (step === 2 && !isNewCupFlow && !state.formatChosen) {
      return t('disabledHint.step2NoFormat');
    }
    if (step === 3) {
      if (state.courseId === '') return t('disabledHint.step3NoCourse');
      if (state.teeBoxId === '') return t('disabledHint.step3NoTee');
      if (state.teeOffInPast) return t('disabledHint.step3TeeOffPast');
    }
    if (step === 4) {
      // playersValidForMode false OG rosteret ikke tomt → påbegynt men ugyldig
      // seleksjon. Ta første spiller-relaterte mangel fra liste-en, klassifisert
      // via den locale-uavhengige kode-listen (parallell til missingForPublish)
      // — aldri via oversatt display-tekst. Bane/tee/tee-off ('course'/
      // 'tee_box'/'tee_off') håndteres i steg 3, allowance på steg 5.
      const relevant = state.missingForPublish.filter(
        (_, i) => state.missingForPublishCodes[i] === 'players',
      );
      if (relevant.length > 0) return t('disabledHint.step4Prefix', { item: relevant[0] });
    }
    return null;
  }

  function goNext() {
    goToStep(Math.min(TOTAL_STEPS, step + 1) as Step);
  }

  function goPrev() {
    // Tilbakepila (#2260, var «Forrige») pusher som «Neste» — ikke
    // router.back(). Arrangøren kan ha landet rett på `?step=3` fra en lenke,
    // og da ville back tatt dem ut av veiviseren i stedet for ett steg tilbake.
    // #2321: lag-skjermen → velgeren, og steg 5 → lag-skjermen når den gjelder.
    if (step === 4 && showTeamsScreen) {
      goToStep(4);
      return;
    }
    if (step === 5) {
      goToStep(4, hasTeamsScreen && teamsScreenHasContent);
      return;
    }
    goToStep(Math.max(1, step - 1) as Step);
  }

  /**
   * #1794: arrangements-flisen er hele innholdet på steg 1, så klikket ER
   * beslutningen — vi går videre med én gang i stedet for å kreve et «Neste»
   * som ikke kan bety noe annet. Derfor er flisene knapper og ikke radioer
   * (se IntentSelector): WCAG 3.2.2 forbyr at et radiovalg bytter kontekst av
   * seg selv, mens en knapp per definisjon utfører en handling.
   *
   * «Neste» står igjen på steget for dyplenker som lander her med intent
   * forhåndsvalgt (`?intent=cup`, revansje-prefill, gjenopprettet utkast) —
   * da er det ingen flis å trykke for å komme videre.
   *
   * Angring: `goToStep` pusher (#1380), så både «Forrige» og browser-back
   * tar arrangøren tilbake hit med valget intakt.
   */
  function handleIntentSelect(next: Intent) {
    state.setIntent(next);
    autoAdvancedRef.current = true;
    goToStep(2);
  }

  // ────────────────────────────────────────────────────────────────────
  // Cup-creation-flyt: bare step 1 (intent) → step 2 (CupSetup). CupSetup
  // eier sin egen `<form action={formAction}>` (useActionState rundt
  // createTournamentDraft, #1397) så vi rendrer ingen ytter-form rundt
  // wizard-en — nestede form-elementer er ugyldig HTML.
  // Når intent='cup' med tournament_id satt (cup-link for å legge til
  // match i eksisterende cup) går vi i stedet videre til standard wizard
  // for game-creation, med format låst via lockGameMode.
  // ────────────────────────────────────────────────────────────────────
  // #2260: én topp for alle steg i begge flytene — pil, kicker, stripe og
  // tittel (se WizardTop). Rutas bannere står mellom stripen og tittelen.
  const top = (
    <WizardTop
      step={step}
      totalSteps={isNewCupFlow ? 2 : TOTAL_STEPS}
      entryLabel={entryLabel ?? t('createDoor.kicker')}
      title={
        isNewCupFlow && step === 2
          ? t('stepTitle.cupSetup')
          : t(`stepTitle.${step}` as Parameters<typeof t>[0])
      }
      backHref={backHref}
      onBack={goPrev}
      notice={notice}
      titleRef={stepTitleRef}
    />
  );

  if (isNewCupFlow) {
    return (
      <div>
        {top}

        {step === 1 && (
          <div className="pt-4">
            <IntentSelector
              value={state.intent}
              onChange={handleIntentSelect}
              disabled={state.lockGameMode}
              isAdmin={isAdmin}
              isClubAdmin={isClubAdmin}
            />
          </div>
        )}

        {step === 2 && (
          <section>
            <CupSetup />
          </section>
        )}

        {step < 2 && (
          <WizardFooter
            canAdvance={canAdvance()}
            disabledHint={nextDisabledHint()}
            onNext={goNext}
          />
        )}
      </div>
    );
  }

  // #2260: «Neste» står alene. På steg 2 kommer den først når et format er
  // valgt — før det står ingenting under lista. Steg 5 har publiser-knappene
  // i ReadyStep.
  // #2321: velgeren på steg 4 har knappen i brettet; lag-skjermen har footeren.
  const showNext =
    step === 2 ? state.formatChosen : step === 4 ? showTeamsScreen : step < TOTAL_STEPS;

  // ────────────────────────────────────────────────────────────────────
  // Standard 5-step wizard. Wrappet i <form> så ReadyStep sine publish/
  // draft-knapper (som er `type="submit"` med `formAction`) finner en
  // form å sende til.
  // ────────────────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmitStart}>
      {top}
      {/* #2321: 13 px muted, 4 px under tittelen, som på `Nyttspill-*`. */}
      {subText && (
        <p className="pt-1 font-sans text-[13px] leading-[normal] text-muted">{subText}</p>
      )}

      {step === 1 && (
        <div className="pt-4">
          <IntentSelector
            value={state.intent}
            onChange={handleIntentSelect}
            disabled={state.lockGameMode}
            isAdmin={isAdmin}
            isClubAdmin={isClubAdmin}
          />
        </div>
      )}

      {step === 2 && (
        <section>
          {/* Format-velger. Locked-flow (cup-link + lockGameMode) hopper
              over selve grid-en og viser en banner med valgt format. */}
          {state.lockGameMode ? (
            <div className="mt-6 rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-muted">
              <p>
                <strong>{t('formatLock.prefix')}</strong>{' '}
                {tModes(state.gameMode as Parameters<typeof tModes>[0])}.{' '}
                {t('formatLock.lockedNote')}
              </p>
            </div>
          ) : state.intent === 'cup' ? null : (
            <>
              {/* #373: teller for antall spillere — kun for Kompis-intent */}
              {state.intent === 'kompis' && (
                <PlayerCountPicker
                  value={state.expectedPlayerCount}
                  onChange={state.setExpectedPlayerCount}
                />
              )}
              {/* #2260: hele katalogen inn; FormatGrid filtrerer på antallet
                  og plukker anbefalingen (lib/wizard/formatRecommendation). */}
              <FormatGrid
                formats={state.intent ? (formatsByIntent[state.intent] ?? []) : []}
                playerCount={
                  state.intent === 'kompis' ? state.expectedPlayerCount : undefined
                }
                value={state.formatChosen ? state.gameMode : undefined}
                onChange={(slug) => state.handleModeChange(slug as GameMode)}
                onShowGuide={(slug) => openGuide(slug)}
                disabled={state.lockGameMode}
              />
            </>
          )}

          {/* #2426: every section under the list is a kicker over a card
              (FormSection). The column is pulled out 4 px so the cards sit
              16 px from the screen edge like the format rows; each section's
              kicker takes the 4 px back. */}
          {state.formatChosen && (
            <div className="-mx-1">
              {!state.isMatchplay && !state.isTeamMatchplay && !state.isWolf && !state.isNassau && !state.isSkins && !state.isBingoBangoBongo && !state.isNines && !state.isRoundRobin && !state.isAceyDeucey && !state.isShamble && !state.isPatsome && (
                <TeamSizeSelector
                  mode={state.gameMode}
                  value={state.teamSize}
                  onChange={state.handleTeamSizeChange}
                  disabled={state.lockGameMode}
                  tileHeight={state.intent === 'kompis' ? 72 : 64}
                />
              )}
              {state.isWolf && (
                <WolfSetup
                  scoring={state.wolfScoring}
                  onScoringChange={state.setWolfScoring}
                  disabled={state.lockGameMode}
                />
              )}
              {state.isNassau && (
                <NassauSetup
                  scoring={state.nassauScoring}
                  onScoringChange={state.setNassauScoring}
                  disabled={state.lockGameMode}
                />
              )}
              {state.isSkins && (
                <SkinsSetup
                  scoring={state.skinsScoring}
                  onScoringChange={state.setSkinsScoring}
                  disabled={state.lockGameMode}
                />
              )}
              {state.isNines && (
                <NinesSetup
                  variant={state.ninesVariant}
                  onVariantChange={state.setNinesVariant}
                  scoring={state.ninesScoring}
                  onScoringChange={state.setNinesScoring}
                  disabled={state.lockGameMode}
                />
              )}
              {state.isRoundRobin && (
                <FormSection legend={tModes('round_robin')}>
                  <p className="font-sans text-[13px] leading-[normal] text-muted">
                    {t('sections.roundRobin.startNote')}
                  </p>
                </FormSection>
              )}
              {state.isAceyDeucey && (
                <AceyDeuceySetup
                  scoring={state.aceyDeuceyScoring}
                  onScoringChange={state.setAceyDeuceyScoring}
                  disabled={state.lockGameMode}
                />
              )}
              {state.isWagerFormat && (
                <WagerStakeSetup
                  value={state.krPerUnit}
                  onChange={state.setKrPerUnit}
                  unitKey={state.wagerUnitKey}
                  disabled={state.lockGameMode}
                />
              )}
              {state.isShamble && (
                <ShambleSetup
                  variant={state.shambleVariant}
                  onVariantChange={state.setShambleVariant}
                  count={state.shambleCount}
                  onCountChange={state.setShambleCount}
                  scoring={state.shambleScoring}
                  onScoringChange={state.setShambleScoring}
                  teamSize={state.teamSize as 3 | 4}
                  onTeamSizeChange={state.handleTeamSizeChange as (next: 3 | 4) => void}
                  disabled={state.lockGameMode}
                />
              )}
              {state.isPatsome && (
                <PatsomeSetup
                  scoring={state.patsomeScoring}
                  onScoringChange={state.setPatsomeScoring}
                  disabled={state.lockGameMode}
                />
              )}
              {/* #1065: allowance-feltene (HCP-allowance, lag-handicap for
                  scramble-familien, matchplay-allowance) og hele Påmelding-
                  seksjonen (inkl. kontingent) er flyttet til steg 5/ReadyStep
                  — steg 2 er nå kun teller + format-grid + mode-spesifikk
                  setup. Se ReadyStep.tsx for hvor de nå mountes. */}
              {/* «For hvilken klubb?» hører kun til klubb-arrangement (#50-fix):
                  en kompis-/solo-runde scopes ikke til en klubb. */}
              {state.intent === 'klubb' && clubs.length > 0 && (
                <ClubPicker
                  clubs={clubs}
                  value={state.groupId}
                  onChange={state.setGroupId}
                />
              )}
            </div>
          )}
        </section>
      )}

      {step === 3 && (
        <div className="-mx-1">
          <BasicsSection
            state={state}
            courses={courses}
            showName={false}
          />
        </div>
      )}

      {step === 4 && showTeamsScreen && (
        // #2321: den andre skjermen — lag, sider og flights (`Nyttspill-4-lag`,
        // `-4-sider`). Spillerne er valgt på velgeren; antallet står i den
        // første kicker-raden.
        <div className="-mx-1">
          <TeamsAssignmentSection
            state={state}
            players={state.allPlayers}
            hideNumbering
            showSelectedCount
          />
        </div>
      )}

      {step === 4 && !showTeamsScreen && (
        // #2321: velgeren (`Spillere-forslag`). Kolonnen trekkes 4 px ut som
        // på steg 2 og 3, så kortene står 16 px fra skjermkanten.
        <div className="-mx-1">
          {/* #1065: registreringsvalget (hvem kan melde seg på) står på steg
              5, så et tomt utvalg er en gyldig vei videre — hintet sier det. */}
          {state.selectedPlayerIds.length === 0 && (
            <p className={HINT_BOX_CLASS}>{t('step4.emptyRosterHint')}</p>
          )}
          {/* #464: tom-tilstand når picker-kilden ikke har andre enn deg selv
              (ingen venner, eller en klubb uten andre medlemmer). Solo viser
              hele rosteren, så hintet gjelder ikke der. */}
          {state.intent !== 'solo' && pickListOthers === 0 && (
            <PickerSourceEmptyHint intent={state.intent} groupId={state.groupId} />
          )}
          <PlayerPickerGrid
            state={state}
            selectableIds={pickIds}
            source={source}
            cap={cap}
            allowEmail={!initialValues?.tournament_id}
          />
          {/* Solo-formatene har ingen andre skjerm: tee per spiller står her. */}
          {!hasTeamsScreen && (
            <TeamsAssignmentSection
              state={state}
              players={state.allPlayers}
              hideNumbering
            />
          )}
          <PlayerTraySpacer />
          <PlayerTray
            selected={state.selectedPlayerIds
              .map((pid) => state.allPlayers.find((p) => p.id === pid))
              .filter((p): p is PlayerOption => p !== undefined)}
            target={target}
            {...(hasTeamsScreen && state.selectedPlayerIds.length > 0
              ? {
                  buttonLabel: state.requiresTeams
                    ? t('footer.nextTeams')
                    : t('footer.nextSides'),
                  canAdvance: teamsScreenHasContent,
                  disabledHint: nextDisabledHint(),
                  onNext: () => goToStep(4, true),
                }
              : {
                  buttonLabel: t('footer.next'),
                  canAdvance: canAdvance(),
                  disabledHint: nextDisabledHint(),
                  onNext: goNext,
                })}
          />
        </div>
      )}

      {step === 5 && (
        <div className="pt-6">
          <ReadyStep
            state={state}
            mode={mode}
            onGoToPlayersStep={() => goToStep(4)}
            onSubmitStart={handleSubmitStart}
          />
        </div>
      )}

      {/* Hidden inputs for FormData — speiler ALL state slik at server-
          actions mottar samme payload uavhengig av hvilket steg admin
          publiserer fra. Form-en wrappes rundt stegene + skjult-input-
          blokken; submit-knappene lever inne i ReadyStep og treffer
          denne form-en via formAction-prop. */}
      <FormDataInputs
        state={state}
        tournamentId={initialValues?.tournament_id}
        tournamentMatchLabel={initialValues?.tournament_match_label}
        rosterLoadedIds={mode.kind === 'create' ? undefined : rosterLoadedIds}
        inviteEmailCount={inviteEmailRoom({ cap, selected: state.selectedPlayerIds.length })}
      />

      {showNext && (
        <WizardFooter
          canAdvance={canAdvance()}
          disabledHint={nextDisabledHint()}
          onNext={goNext}
        />
      )}

      {/* #498: format-oppslagsverket som bunn-ark — over veiviseren, lukk
          legger deg tilbake nøyaktig der du var. */}
      <FormatGuideSheet
        open={guideOpen}
        entries={formatGuide}
        focusKey={guideFocusKey}
        onClose={() => setGuideOpen(false)}
      />
    </form>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Hidden inputs som bærer FormData-payloaden. Wizard-en er én form (alle
// stegene + ReadyStep ligger inne i samme <form>), så hidden inputs lever
// på alle steg — admin kan publisere fra steg 4 uten å miste tidligere
// valg. Skjemaet speiler GameForm.tsx (linje 197–241).
// ──────────────────────────────────────────────────────────────────────

function FormDataInputs({
  state,
  tournamentId,
  tournamentMatchLabel,
  rosterLoadedIds,
  inviteEmailCount,
}: {
  state: ReturnType<typeof useGameFormState>;
  tournamentId?: string;
  tournamentMatchLabel?: string;
  /** #2210: `roster_loaded_ids`, captured at mount. Undefined when creating. */
  rosterLoadedIds?: string;
  /**
   * #2321: how many of the «Inviter på e-post» addresses go along
   * (`inviteEmailRoom`). The rest are marked «Ikke plass» and stay behind.
   */
  inviteEmailCount: number;
}) {
  const {
    name,
    gameMode,
    teamSize,
    isTexas,
    isAmbrose,
    isFlorida,
    isShamble,
    isWolf,
    isNassau,
    isSkins,
    isNines,
    isRoundRobin,
    isAceyDeucey,
    isPatsome,
    texasHandicapPct,
    ambroseHandicapPct,
    floridaHandicapPct,
    fourballAllowancePct,
    foursomesAllowancePct,
    greensomeAllowancePct,
    chapmanAllowancePct,
    gruesomeAllowancePct,
    roundRobinAllowancePct,
    wolfScoring,
    krPerUnit,
    isWagerFormat,
    entryFeeKr,
    paymentLink,
    prizeDraft,
    nassauScoring,
    skinsScoring,
    ninesVariant,
    ninesScoring,
    aceyDeuceyScoring,
    shambleVariant,
    shambleCount,
    shambleScoring,
    patsomeScoring,
    orderedPayload,
    unassignedPlayerIds,
    courseId,
    teeBoxId,
    scheduledTeeOffAt,
    startType,
    hcpAllowance,
    requirePeerApproval,
    registrationMode,
    registrationType,
    letFriendsSkipGate,
    groupId,
    sideEnabled,
    sideLdCount,
    sideCtpCount,
    scoreVisibility,
    lockScoreVisibility,
  } = state;

  // Alle controlled state-verdier serialiseres som hidden inputs UANSETT
  // hvilket steg som er montert. Når en seksjons-komponent (f.eks.
  // BasicsSection) også rendrer et felt med samme `name`, gir det to
  // inputs i form-en — men siden begge speiler samme controlled state,
  // er verdiene identiske og FormData.get returnerer riktig svar uansett
  // rekkefølge. Dette gir et enkelt mental-modell: server-action mottar
  // FULL state uavhengig av hvilket steg admin publiserer fra.
  //
  // #1011: side_tournament_enabled, side_ld_count og side_ctp_count er nå
  // controlled state (useGameFormState) og speiles her akkurat som resten —
  // dermed overlever de selv om ReadyStep sin advanced-disclosure er lukket
  // ved publish/draft. AdvancedSettingsSection rendrer de samme feltene UTEN
  // `name`-attributt (kun controlled UI) mens disclosure er åpen, så FormData
  // ikke får duplikat-navn med avvikende verdier.
  //
  // #1400: score_visibility er nå controlled state på samme vis, og speiles
  // her. Sammen med den manuelle dispatchen i ReadyStep (`dispatchManually`,
  // som hopper over React-doms `requestFormReset`) er det dette som gjør at
  // «Skjul til slutt» overlever en mislykket publisering — både i state, i
  // radioene inne i disclosure-en og i det som faktisk sendes.
  // Er valget låst (edit av et aktivt spill) monteres ingen input, akkurat som
  // disabled radioer aldri ble serialisert: parseBase faller da til 'live'.
  return (
    <>
      <input
        type="hidden"
        name="side_tournament_enabled"
        value={sideEnabled ? 'true' : ''}
      />
      {!lockScoreVisibility && (
        <input type="hidden" name="score_visibility" value={scoreVisibility} />
      )}
      {sideEnabled && (
        <>
          <input type="hidden" name="side_ld_count" value={String(sideLdCount)} />
          <input type="hidden" name="side_ctp_count" value={String(sideCtpCount)} />
        </>
      )}
      <input type="hidden" name="game_mode" value={gameMode} />
      <input type="hidden" name="team_size" value={teamSize} />
      <input type="hidden" name="registration_mode" value={registrationMode} />
      <input type="hidden" name="registration_type" value={registrationType} />
      <input type="hidden" name="let_friends_skip_gate" value={letFriendsSkipGate ? '1' : ''} />
      <input type="hidden" name="group_id" value={groupId} />
      {isStablefordFamily(gameMode) && (
        <input type="hidden" name="stableford_team_size" value={teamSize} />
      )}
      {isTexas && (
        <>
          <input type="hidden" name="texas_team_size" value={teamSize} />
          <input
            type="hidden"
            name="texas_team_handicap_pct"
            value={String(texasHandicapPct)}
          />
        </>
      )}
      {isAmbrose && (
        <>
          <input type="hidden" name="ambrose_team_size" value={teamSize} />
          <input
            type="hidden"
            name="ambrose_team_handicap_pct"
            value={String(ambroseHandicapPct)}
          />
        </>
      )}
      {isFlorida && (
        <>
          <input type="hidden" name="florida_team_size" value={teamSize} />
          <input
            type="hidden"
            name="florida_team_handicap_pct"
            value={String(floridaHandicapPct)}
          />
        </>
      )}
      {gameMode === 'fourball_matchplay' && (
        <input
          type="hidden"
          name="fourball_allowance_pct"
          value={String(fourballAllowancePct)}
        />
      )}
      {gameMode === 'foursomes_matchplay' && (
        <input
          type="hidden"
          name="foursomes_allowance_pct"
          value={String(foursomesAllowancePct)}
        />
      )}
      {gameMode === 'greensome_matchplay' && (
        <input
          type="hidden"
          name="greensome_allowance_pct"
          value={String(greensomeAllowancePct)}
        />
      )}
      {gameMode === 'chapman_matchplay' && (
        <input
          type="hidden"
          name="chapman_allowance_pct"
          value={String(chapmanAllowancePct)}
        />
      )}
      {gameMode === 'gruesome_matchplay' && (
        <input
          type="hidden"
          name="gruesome_allowance_pct"
          value={String(gruesomeAllowancePct)}
        />
      )}
      {isWolf && (
        <input type="hidden" name="wolf_scoring" value={wolfScoring} />
      )}
      {isNassau && (
        <input type="hidden" name="nassau_scoring" value={nassauScoring} />
      )}
      {isSkins && (
        <input type="hidden" name="skins_scoring" value={skinsScoring} />
      )}
      {isWagerFormat && (
        <input type="hidden" name="kr_per_unit" value={krPerUnit} />
      )}
      {/* #1049: startkontingent + betalingsmåte — gjelder alle formater, så
          alltid serialisert (tom = ingen kontingent). */}
      <input type="hidden" name="entry_fee_kr" value={entryFeeKr} />
      <input type="hidden" name="payment_link" value={paymentLink} />
      {/* #1051: premiebord — alle faste slott alltid serialisert (tomt = av).
          Serveren beskjærer til gyldige slott for modus + side-counts
          (parsePrizesFromFormData), så en stale placement-verdi etter et
          format-bytte lekker aldri inn. */}
      {PRIZE_SLOTS.map((slot) => (
        <Fragment key={slot.key}>
          <input
            type="hidden"
            name={prizeFieldName(slot.key, 'desc')}
            value={prizeDraft[slot.key].description}
          />
          <input
            type="hidden"
            name={prizeFieldName(slot.key, 'sponsor')}
            value={prizeDraft[slot.key].sponsor}
          />
          <input
            type="hidden"
            name={prizeFieldName(slot.key, 'logo')}
            value={prizeDraft[slot.key].sponsorLogoPath}
          />
        </Fragment>
      ))}
      {isNines && (
        <>
          <input type="hidden" name="nines_variant" value={ninesVariant} />
          <input type="hidden" name="nines_scoring" value={ninesScoring} />
        </>
      )}
      {isRoundRobin && (
        <input
          type="hidden"
          name="round_robin_allowance_pct"
          value={String(roundRobinAllowancePct)}
        />
      )}
      {isAceyDeucey && (
        <input type="hidden" name="acey_deucey_scoring" value={aceyDeuceyScoring} />
      )}
      {isShamble && (
        <>
          <input type="hidden" name="shamble_variant" value={shambleVariant} />
          <input type="hidden" name="shamble_count" value={String(shambleCount)} />
          <input type="hidden" name="shamble_scoring" value={shambleScoring} />
          <input type="hidden" name="shamble_team_size" value={String(teamSize)} />
        </>
      )}
      {isPatsome && (
        <input type="hidden" name="patsome_scoring" value={patsomeScoring} />
      )}

      <input type="hidden" name="course_id" value={courseId} />
      <input type="hidden" name="tee_box_id" value={teeBoxId} />
      <input
        type="hidden"
        name="scheduled_tee_off_at"
        value={scheduledTeeOffAt}
      />
      {/* #2258: «Shotgun-start» lives in BasicsSection (step 3, no name); the
          mirror here carries it to a publish from any step. */}
      <input type="hidden" name="start_type" value={startType} />

      <input type="hidden" name="name" value={name} />
      {/* #2210: formats with their own percentage in mode_config get 100 —
          a value left over from an earlier format must never be applied on
          top of theirs. The server normalises too (gamePayload.ts). */}
      <input
        type="hidden"
        name="hcp_allowance_pct"
        value={usesGameHcpAllowance(gameMode) ? String(hcpAllowance) : '100'}
      />
      {requirePeerApproval && (
        <input type="hidden" name="require_peer_approval" value="on" />
      )}

      <PlayerTeeChoiceInputs state={state} />

      {tournamentId && (
        <>
          <input type="hidden" name="tournament_id" value={tournamentId} />
          {tournamentMatchLabel && (
            <input
              type="hidden"
              name="tournament_match_label"
              value={tournamentMatchLabel}
            />
          )}
        </>
      )}

      {orderedPayload.map((row, i) => (
        <div key={row.user_id} className="hidden">
          <input type="hidden" name={`player_${i}_id`} value={row.user_id} />
          <input
            type="hidden"
            name={`player_${i}_team`}
            value={row.team_number ?? ''}
          />
          <input
            type="hidden"
            name={`player_${i}_flight`}
            value={row.flight_number ?? ''}
          />
        </div>
      ))}
      {/* #2210: selected players without a team (or matchplay side) ride
          along so the server keeps them on the roster instead of dropping
          them. */}
      {unassignedPlayerIds.map((pid) => (
        <input
          key={pid}
          type="hidden"
          name="unassigned_player_id"
          value={pid}
        />
      ))}
      {/* #2210: lets the save tell a player the organiser removed from one
          who signed up while the form was open (see lib/games/rosterEdit.ts). */}
      {rosterLoadedIds !== undefined && (
        <input type="hidden" name="roster_loaded_ids" value={rosterLoadedIds} />
      )}
      {/* #2321: the wizard's e-mail invitations, sent once the game is
          published (never in a cup match, where the wizard has no e-mail
          card). Read from state on every render, so the room rule holds
          whichever way the organiser reaches the publish. */}
      {!tournamentId &&
        state.inviteEmails.slice(0, inviteEmailCount).map((email) => (
          <input key={email} type="hidden" name="invite_email" value={email} />
        ))}
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────
// #464: tom-tilstand for picker-kilden i steg 4. Vises når det ikke finnes
// andre kandidater enn deg selv — enten fordi du ikke har venner ennå
// (kompis/cup, eller klubb uten valgt klubb), eller fordi en valgt klubb
// ikke har andre medlemmer. Speiler «Legg til venner»-lenken fra liga-opprett
// (CreateLigaForm) så det er én vei til vennegrafen.
// ──────────────────────────────────────────────────────────────────────

/**
 * #2321: the hint box on step 4 as `Nyttspill-4-spillere` draws it: radius 12
 * on the inset surface, no border, 13 px muted, 14 px above.
 */
const HINT_BOX_CLASS =
  'mt-3.5 rounded-xl bg-surface-2 px-3 py-2.5 font-sans text-[13px] leading-[1.45] text-muted';

function PickerSourceEmptyHint({
  intent,
  groupId,
}: {
  intent: Intent | undefined;
  groupId: string;
}) {
  const t = useTranslations('wizard');
  const noClubMembers = intent === 'klubb' && groupId !== '';
  return (
    <p className={HINT_BOX_CLASS}>
      {noClubMembers ? (
        t('pickerSource.noClubMembers')
      ) : (
        <>
          {t('pickerSource.noFriendsPrefix')}{' '}
          <Link href="/profile/venner" className="text-primary underline">
            {t('pickerSource.addFriendsLink')}
          </Link>{' '}
          {t('pickerSource.noFriendsSuffix')}
        </>
      )}
    </p>
  );
}

// ──────────────────────────────────────────────────────────────────────
// #373: Antall-spiller-velger for Kompis-intent i steg 2, over FormatGrid så
// arrangøren velger antall FØR format. Min 1, maks spillertaket for lag-
// formatene (#525 hevet fra 16 til 24; #2148 gjør taket til 40).
// #2260: én setning som på artboardet — «Dere er − 4 + spillere».
// ──────────────────────────────────────────────────────────────────────

const PLAYER_COUNT_MIN = 1;
const PLAYER_COUNT_MAX = TEAM_FORMAT_PLAYER_CAP;
// PLAYER_COUNT_DEFAULT importeres fra useGameFormState (state-eieren) så initial
// state og picker-fallback aldri kommer ut av sync.

const COUNT_BUTTON_CLASS =
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-xl text-text transition-colors hover:bg-primary-soft/60 disabled:cursor-not-allowed disabled:opacity-40';

function PlayerCountPicker({
  value,
  onChange,
}: {
  value: number | undefined;
  onChange: (next: number | undefined) => void;
}) {
  const t = useTranslations('wizard');
  // Uten antall (gamle utkast, Rediger spill) står «?», og første trykk tar
  // utgangspunkt i 4 som før.
  const count = value ?? PLAYER_COUNT_DEFAULT;

  return (
    <div
      role="group"
      aria-label={t('playerCount.legend')}
      className="flex items-center gap-2.5 pt-2.5"
    >
      <span className="font-sans text-sm leading-[normal] text-muted">
        {t('playerCount.prefix')}
      </span>
      <button
        type="button"
        aria-label={t('playerCount.lessAriaLabel')}
        onClick={() => onChange(Math.max(PLAYER_COUNT_MIN, count - 1))}
        disabled={count <= PLAYER_COUNT_MIN}
        className={COUNT_BUTTON_CLASS}
      >
        <span aria-hidden="true" className="select-none leading-[normal]">−</span>
      </button>
      <span
        aria-live="polite"
        className="min-w-5 text-center font-serif text-2xl font-semibold leading-[normal] tabular-nums text-text"
      >
        {/* aria-label on a plain span is ignored (and never announced by the
            live region); the spoken text goes in as sr-only text instead. */}
        <span aria-hidden="true">{value !== undefined ? count : '?'}</span>
        <span className="sr-only">
          {value !== undefined
            ? t('playerCount.countAriaLabel', { count })
            : t('playerCount.unsetAriaLabel')}
        </span>
      </span>
      <button
        type="button"
        aria-label={t('playerCount.moreAriaLabel')}
        onClick={() => onChange(Math.min(PLAYER_COUNT_MAX, count + 1))}
        disabled={count >= PLAYER_COUNT_MAX}
        className={COUNT_BUTTON_CLASS}
      >
        <span aria-hidden="true" className="select-none leading-[normal]">+</span>
      </button>
      {/* The live region already says «4 spillere»; the word is for the eye. */}
      <span aria-hidden="true" className="font-sans text-sm leading-[normal] text-muted">
        {t('playerCount.suffix', { count })}
      </span>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// #2260: toppen fra artboardet «Forslag: formatkortene», på alle steg og i
// cup-flyten: tilbakepil, kicker, stripe og stor tittel. Erstatter
// StepperHeader og sidekrommen (TopBar, h1, undertittel) rundt veiviseren.
// ──────────────────────────────────────────────────────────────────────

/**
 * Id-ene som binder kickeren til steg-overskriften (#1837). Bare én topp er
 * montert av gangen (cup-grenen returnerer før den vanlige), så de kolliderer
 * ikke med seg selv.
 */
const STEP_COUNTER_ID = 'wizard-step-counter';
const STEP_TITLE_ID = 'wizard-step-title';

const BACK_CLASS = 'flex h-11 w-11 items-center justify-center text-text';

function ChevronLeft() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

/**
 * The sticky bar at the top of the wizard: the back arrow, the kicker and the
 * progress stripe. Sticky like TopBar; `-mx-5 -mt-8` cancels the shell's
 * padding so the blur reaches the edges and the bar starts at the top.
 *
 * The arrow is a button (`onBack`) or a link out (`backHref`). Exported for
 * WizardFallback, which shows the same bar while the route loads.
 */
export function WizardTopBar({
  backHref,
  onBack,
  backLabel,
  kicker,
  kickerId,
  progress,
}: {
  backHref?: string;
  onBack?: () => void;
  backLabel: string;
  kicker: ReactNode;
  kickerId?: string;
  /** 0–1. Left out → an empty track. */
  progress?: number;
}) {
  return (
    <div className="sticky top-0 z-30 -mx-5 -mt-8 bg-bg/90 px-5 backdrop-blur-sm">
      <div className="-mx-3 flex items-center justify-between pt-2">
        {onBack ? (
          <button type="button" onClick={onBack} aria-label={backLabel} className={BACK_CLASS}>
            <ChevronLeft />
          </button>
        ) : (
          <SmartLink href={backHref ?? '/'} aria-label={backLabel} className={BACK_CLASS}>
            <ChevronLeft />
          </SmartLink>
        )}
        <p
          id={kickerId}
          className="font-sans text-[10px] font-semibold uppercase leading-[normal] tracking-[0.2em] text-muted"
        >
          {kicker}
        </p>
        <span aria-hidden="true" className="h-11 w-11" />
      </div>
      <div className="mt-1 h-1 rounded-full bg-hole-completed-bg">
        {progress !== undefined && (
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-200 motion-reduce:transition-none"
            style={{ width: `${progress * 100}%` }}
          />
        )}
      </div>
    </div>
  );
}

function WizardTop({
  step,
  totalSteps,
  entryLabel,
  title,
  backHref,
  onBack,
  notice,
  titleRef,
}: {
  step: Step;
  totalSteps: number;
  entryLabel: string;
  title: string;
  /** Steg 1: pila er en lenke ut av veiviseren. */
  backHref: string;
  /** Steg 2–5: pila går ett steg tilbake (goPrev, med historikken). */
  onBack: () => void;
  notice?: ReactNode;
  /** #1837: fokusmål ved auto-videre — se `handleIntentSelect`. */
  titleRef: RefObject<HTMLHeadingElement | null>;
}) {
  const t = useTranslations('wizard');
  return (
    <>
      <WizardTopBar
        backHref={backHref}
        onBack={step === 1 ? undefined : onBack}
        backLabel={t('back')}
        kickerId={STEP_COUNTER_ID}
        // Telleren står i sitt eget span, uten inngangen.
        kicker={
          <>
            {entryLabel} · <span>{t('stepCounter', { step, total: totalSteps })}</span>
          </>
        }
        progress={step / totalSteps}
      />
      {notice}
      {/* #1837: sidens overskrift. `aria-describedby` henter «Steg 2 av 5»
          fra kickeren, og `tabIndex={-1}` gjør den til et fokusmål uten å
          legge den inn i tab-rekkefølgen. Fokusregelen i globals.css utelater
          bevisst `[tabindex='-1']`, så den får ingen ring ved muse-klikk. */}
      <h1
        ref={titleRef}
        id={STEP_TITLE_ID}
        tabIndex={-1}
        aria-describedby={STEP_COUNTER_ID}
        // #2426: the Nyttspill artboards set the title 14 px under the stripe
        // at line-height 1.15.
        className="pt-3.5 font-serif text-[26px] font-medium leading-[1.15] text-text"
      >
        {title}
      </h1>
    </>
  );
}

/**
 * ClubPicker — «Hvem er dette for?»-velger i steg 2 (#442).
 *
 * Vises kun når brukeren er med i ≥1 klubb. Lar admin knytte spillet til
 * en klubb — noe som gjør turneringen synlig for alle klubbens medlemmer
 * (også invite_only-turneringer). Default er «Ingen klubb» (tom streng).
 */
function ClubPicker({
  clubs,
  value,
  onChange,
}: {
  clubs: ClubOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const t = useTranslations('wizard');
  const selectId = useId();
  return (
    <FormSection legend={t('club.legend')}>
      <CardSelect
        id={selectId}
        label={t('club.label')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        hint={t('club.hint')}
      >
        <option value="">{t('club.noClub')}</option>
        {clubs.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </CardSelect>
    </FormSection>
  );
}

function WizardFooter({
  canAdvance,
  disabledHint,
  onNext,
}: {
  canAdvance: boolean;
  disabledHint: string | null;
  onNext: () => void;
}) {
  const t = useTranslations('wizard');
  // #2260: «Forrige» er borte — tilbakepila i toppen gjør jobben.
  // #2426: the artboards' 52 px button, 16 px from the screen edge.
  return (
    <div className="-mx-1 space-y-2 pt-[18px]">
      <Button
        type="button"
        size="large"
        data-testid="wizard-next"
        onClick={onNext}
        disabled={!canAdvance}
        className="w-full"
      >
        {t('footer.next')}
      </Button>
      {!canAdvance && disabledHint && (
        <p className="text-center font-sans text-xs leading-[normal] text-muted">{disabledHint}</p>
      )}
    </div>
  );
}
