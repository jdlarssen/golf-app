// native/app/src/lib/profileCopy.ts
// Native #1906: tekstene i profil-rommet, og de to formateringene rommet
// trenger for å vise handicapet ditt.
//
// Samme arbeidsdeling som `accountCopy.ts`: skjermen viser tekst, teksten bor
// her, og alt som også finnes på webbens `/profile` er `messages/no.json →
// profile` tegn for tegn. `profileCopy.test.ts` leser den fila og
// sammenligner — rettes en setning på web uten at appen følger etter, blir
// testen rød. Uten den porten ville en spiller fått to ulike ordlyder for
// samme rad, avhengig av flate.
//
// Det som IKKE har en web-fasit er merket som app-egent under: utvikler-
// seksjonen (webben har ingen Sync-lab), advarselen om uleverte slag ved
// utlogging (webben har ingen lokal base å rydde), raden og headeren for
// redigering (webben har ett skjema på samme side, appen har et rom og en
// skjerm), raden til personvernerklæringen (webben har lenken i bunnteksten,
// appen har ingen bunntekst) og nett-kodene i
// {@link describeProfileSaveFailure} (webbens skjema kan ikke være offline).
//
// **PROFILE_TEXT er FLAT med vilje.** Skjema-tekstene ligger under sitt eget
// avsnitt i stedet for i et `form`-objekt: testen går gjennom
// `Object.entries(PROFILE_TEXT)` og krever at hver verdi er en ferdig setning,
// og et nøstet objekt ville sluppet unna den porten uten at noen la merke til
// det.
//
// **Hvorfor tallformateringen bor her og ikke i `lib/i18n/format.ts`.**
// Webbens `formatHcpDisplay` går veien om `Intl.NumberFormat` med nb-NO.
// Hermes har ikke ICU-dataene, så den veien er stengt for appen (samme grunn
// som `display.ts` gir for klokkeslett). {@link formatHcpNb} bygger derfor
// strengen selv. Drift mellom de to er den åpenbare faren, og den er lukket i
// TESTEN: den kjører i node, importerer webbens `formatHcpDisplay` og krever
// at hver eneste verdi i tabellen gir samme streng. Importer aldri
// `lib/i18n/format` eller `formatHcpDisplay` i app-kildekode — bare i tester.
import type { DataExportFailure } from '../data/dataExport';
import type { ProfileSaveFailure } from '../data/profile';
import { formatShortDateNb } from '../../../../lib/format/date';
import { isHandicapStale } from '../../../../lib/handicap/staleness';
import { toSignedHcp } from '../../../../lib/handicap/sign';
import { HCP_MAX, HCP_MIN, parseHcpMagnitude } from '../../../../lib/users/profileInput';
import { MODE_LABELS } from '../../../../lib/scoring/modes/types';
import type { PushGroupId } from '../../../../lib/notifications/pushGroups';
import { formatStubClock } from './homeDates';

/** Tekstene profil-rommet viser. */
export const PROFILE_TEXT = {
  // --- Webbens ordlyd (messages/no.json → profile) ------------------------
  /** Header-tittelen, og ordet oppe til høyre på Hjem som fører hit. */
  heading: 'Profil',
  /**
   * Tilbake-pila i rommene under profilen (Venner, «Varsler og tema»), som
   * designet og webbens egne profil-rom (#2385).
   */
  backToProfile: 'Tilbake til profil',
  /** Overskriften når spilleren verken har navn eller kallenavn. */
  displayNameFallback: 'Profil',
  sectionAccount: 'Konto',
  setHandicap: 'Sett handicap',
  hcpStaleShort: 'Ikke oppdatert på over en måned',
  // Webbens `hcpUpdatedShort` er ICU-strengen «Oppdatert {dato}». Appen har
  // ingen ICU-motor, så plassholderen er klippet av og datoen settes inn av
  // {@link hcpUpdatedLine}. Mellomrommet på slutten er en del av setningen —
  // testen setter delene sammen igjen og sammenligner med webbens streng.
  hcpUpdatedPrefix: 'Oppdatert ',
  logout: 'Logg ut',
  logoutPending: 'Logger ut …',
  deleteRow: 'Slett konto',
  /** Banneret profil-rommet viser når du kommer tilbake fra en lagring. */
  updatedBanner: 'Profilen din er oppdatert.',

  // --- Webbens ordlyd: skjemaet (messages/no.json → profile.form) ---------
  // Webben har feltene på samme side som resten av profilen; appen har dem på
  // en egen skjerm. Ordlyden er den samme, og testen låser den — en spiller
  // som fyller ut det samme skjemaet på to flater skal lese det samme.
  nameLabel: 'Navn',
  nicknameLabel: 'Kallenavn',
  nicknamePlaceholder: 'Valgfritt',
  /** Skjermleser-etikett for «+»-chipen (= webbens `aria-label`). */
  plusHandicapLabel: 'Plusshandicap',
  handicapLabel: 'Handicap',
  // Ekkoet under handicap-feltet: «Lagres som +1,5 · plusshandicap». Delene
  // settes sammen av skjermen fordi tallet står mellom dem, og suffikset
  // henger bare på når plusshandicap er huket av — derfor to nøkler, ikke én
  // ICU-streng vi ikke har en motor til.
  savedAsPrefix: 'Lagres som',
  savedAsSuffix: '· plusshandicap',
  // Halen på e-postlinja: «kari@eksempel.no · kan ikke endres». Adressen byttes
  // ikke herfra på noen av flatene.
  emailLine: 'kan ikke endres',
  golfProfileLabel: 'Golfprofil',
  genderLegend: 'Kjønn',
  genderHint: 'Brukes til å foreslå riktig tee og beregne banehandicap.',
  genderMale: 'Herre',
  genderFemale: 'Dame',
  levelLegend: 'Spillerklasse',
  levelHint:
    'Junior gir juniortee. Senior er foreløpig bare et merke og endrer ikke spillet.',
  levelJunior: 'Junior',
  levelAdult: 'Voksen',
  levelSenior: 'Senior',
  saveButton: 'Lagre',
  savePending: 'Lagrer …',
  saveHint: 'Lagre blir aktiv når du endrer noe.',

  // --- Webbens ordlyd: sesongen og temaet (#2256) --------------------------
  // Temavalget er webbens `profile.theme`: overskriften og de to faste
  // draktene.
  // Raden til vennesiden (#2256 PR 2): webbens `profile.friendsRow`. Én linje,
  // som i designet (Profil v2); forespørslene står på vennesiden.
  friendsRow: 'Venner',
  themeHeading: 'Tema',
  themeLight: 'Lys',
  themeDark: 'Mørk',

  // --- App-egent: bag-taggen og menyen (#2256) ----------------------------
  // Webbens profil er ennå ikke en bag-tag (#2250), så her finnes ingen fasit.
  // «Rediger» står oppe til høyre i profilen og fører til skjemaet. Profilen
  // har ikke lenger raden `editRow`; den lever videre som knappen i
  // veiviseren (`createGameCopy`).
  editAction: 'Rediger',
  /** Kickeren på kortet når spilleren ikke er med i noen klubb. */
  bagTagFallbackKicker: 'Tørny',
  // «med siden 2026»: året settes inn av {@link memberSinceLine}, som med
  // `hcpUpdatedPrefix`.
  memberSincePrefix: 'med siden ',
  // Flisene under kortet, med designlerretets små etiketter under tallet.
  // Skjermleseren får hele ord i stedet ({@link seasonTileSpoken}).
  tileRounds: 'runder i år',
  tileRoundsOne: 'runde i år',
  tileBestRound: 'beste runde',
  tileWins: 'seire',
  tileWinsOne: 'seier',
  tileRoundsSpoken: 'Runder',
  tileBestRoundSpoken: 'Beste runde',
  tileWinsSpoken: 'Seire',
  /** Beste runde uten en eneste hel runde i året. */
  tileEmpty: '–',
  /** Det skjermleseren sier i stedet for streken. */
  tileEmptySpoken: 'ingen hel runde ennå',
  /** «Handicap ikke satt» for skjermleseren, der kortet viser «–». */
  hcpNotSetSpoken: 'ikke satt',
  /** Raden til Rundedagboka (#2265), øverst i menyen. */
  menuHistory: 'Historikk og statistikk',
  /** Raden rett under «Historikk og statistikk» (#2259, eierens svar: «I profilmenyen»). */
  menuToppliste: 'Toppliste',
  menuNotificationsTheme: 'Varsler og tema',
  /**
   * Tittelen på siden menyraden «Varsler og tema» åpner: «Varsler», som i
   * designet (Profil v2). Temaet står nederst på samme side.
   */
  notificationsHeading: 'Varsler',
  menuAccount: 'Personvern og konto',
  // Temaet hører til telefonen, ikke kontoen: det står igjen etter utlogging.
  themeSystem: 'Følg telefonen',
  themeSaveFailedNote: 'Fikk ikke lagret valget, så temaet gjelder bare til du lukker appen.',
  // --- Varsler på denne telefonen (#2256 PR 4; #2315: Varsler-D2) ----------
  // D2 har all tekst på én linje på både 320 og 390 (eierens ønske 14.11),
  // så noen tekster er kortere enn før, og to av dem er delt på to linjer.
  /** Undertittelen under «Varsler». */
  pushSubtitle: 'Du bestemmer hva som plinger.',
  /** Telefonkortet. Bryteren sier hele navnet til skjermleseren (`pushSwitchLabel`). */
  pushTitle: 'Denne telefonen',
  pushSwitchLabel: 'Varsler på denne telefonen',
  pushOff: 'Av',
  /** Avslått i Innstillinger: to linjer, med «Åpne Innstillinger» rett under. */
  pushDenied: 'Varsler fra Tørny er slått av',
  pushDeniedWhere: 'i Innstillinger på telefonen.',
  pushOpenSettings: 'Åpne Innstillinger',
  // --- Hva som varsles og stille tid (#2315, Varsler-D2) -------------------
  pushGroupsHeading: 'Hva som varsles',
  /** Merkelappen på «Rundene dine», som ikke kan slås av. */
  pushAlwaysOn: 'Alltid på',
  /** Under lista: valgene gjelder kontoen, ikke bare denne telefonen. */
  pushAllDevices: 'Gjelder alle enhetene dine.',
  /** Under navnet på raden som ikke ble lagret. */
  pushSaveFailed: 'Fikk ikke lagret. Prøv igjen.',
  /** Når valgene ikke kunne hentes: to linjer og en knapp. */
  pushReadFailed: 'Fikk ikke hentet valgene dine.',
  pushReadHint: 'Sjekk nettet og prøv igjen.',
  pushRetry: 'Prøv igjen',
  quietHeading: 'Stille tid',
  quietTitle: 'Ikke varsle om natta',
  /** Tidene er de faste i regelen (`QUIET_HOURS`); `profileCopy.test.ts` holder dem like. */
  quietTimes: '22:00–07:00',
  quietRounds: 'Rundene dine plinger likevel.',
  quietInbox: 'Resten ser du i innboksen når du våkner.',
  pushOnFailed: 'Fikk ikke slått på varsler. Prøv igjen.',
  pushOffFailed: 'Fikk ikke slått av varsler. Prøv igjen.',
  // Kortet på Hjem (#2758). Samme tekst som webbens `pushSettings.nudge*`.
  pushPromptTitle: 'Få beskjed med en gang',
  pushPromptBody:
    'Slå på varsler, så sier vi ifra når du blir invitert, et kort skal godkjennes, eller resultatet er klart.',
  pushPromptEnable: 'Slå på varsler',
  pushPromptLater: 'Ikke nå',
  pushPromptDoneTitle: 'Varsler er på',
  pushPromptDoneBody: 'Vi sier ifra med en gang noe skjer.',
  /** Designets fotnote, på to linjer. */
  pushFooter: 'Innboksen i appen får alt uansett.',
  pushFooterScope: 'Dette styrer bare pling på telefonen.',
  /** Knappen under menyen (#2256 PR 3), som i designet. */
  shareBagTag: 'Del bag-taggen',
  /** Når bildet eller delearket feilet. Et avbrutt ark er ingen feil. */
  shareBagTagFailed: 'Fikk ikke delt bag-taggen. Prøv igjen.',
  /** Ordmerket nederst på bildet som deles. */
  shareWordmark: 'Tørny',

  // --- App-egent: QR-koden på bag-taggen (#2627) ---------------------------
  // Koden står der initialringen sto, og et trykk viser den stort på et ark.
  // Webben har ingen QR-kode, så det finnes ingen fasit å speile.
  /** Skjermleserens navn på koden på taggen, som er én knapp. */
  friendQrLabel: 'QR-kode for å bli venn med deg. Trykk for å vise den større.',
  /** Linja på arket, under navnet ditt. */
  friendQrSheetBody: 'La kompisen skanne koden med kameraet. Da kan dere bli venner med ett trykk.',
  friendQrClose: 'Lukk',

  // --- App-egent: veien inn i skjemaet ------------------------------------
  // To nøkler for det som i dag er samme ord, av samme grunn som `deleteRow`
  // og `ACCOUNT_TEXT.heading` er to: den ene er raden som fører dit, den andre
  // er tittelen på skjermen du havner på. De kan endres hver for seg.
  editRow: 'Rediger profil',
  editHeading: 'Rediger profil',

  // --- App-egent: utvikler-seksjonen -------------------------------------
  // Finnes bare i staging-bygg (`stagingGate.ts`). Webben har ingen Sync-lab,
  // så det finnes ingen fasit å speile — dette er husets stemme.
  sectionDeveloper: 'Utvikler',
  syncLabRow: 'Sync-lab',
  syncLabSublabel: 'Kø, konflikter og testverktøy. Vises bare i staging.',

  // --- App-egent: personvernerklæringen (#2229, #2216) --------------------
  // Apple krever en lenke til personvernerklæringen inne i appen (5.1.1(i)).
  // Webben har den i bunnteksten på forsiden; appen har ingen bunntekst, så
  // den står i «Personvern og konto». #2216: under «Du bestemmer», med ordene
  // fra designet for «Dine data» (Data-forslag, #2332). Nettsiden får de samme
  // ordene når #2332 bygges. Butikkbyggets adresse er låst til tornygolf.no
  // (`app.config.ts`).
  sectionYouDecide: 'Du bestemmer',
  privacyRow: 'Personvernerklæringen',
  privacySublabel: 'Hele teksten, på vanlig norsk',

  // --- App-egent: «Del sjeldne slag med alle» (#2894) ----------------------
  // Raden under «AI-tekster om meg», med tegningens ord (gruppe 10, rad 99).
  // Underteksten er lik når bryteren står på og av. Nettet har ingen bryter:
  // Topplista finnes bare i appen. Feillinja er AI-bryterens.
  shareRareShotsTitle: 'Del sjeldne slag med alle',
  shareRareShotsSublabel: 'Av: bare venner og ligaen får vite',
  shareRareShotsFailed: 'Fikk ikke lagret. Prøv igjen.',

  // --- App-egent: nedlastingen av dataene (#2332 PR C) ---------------------
  // Raden og underteksten er webbens (`DATA_TEXT.exportRow`/`exportSublabel`).
  // Nettsiden laster ned med et klikk og har ingen ventetekst; appen henter
  // fila før delingsarket åpnes, og raden sier det mens den venter. Feillinjene
  // står i {@link describeDataExportFailure}.
  exportPending: 'Henter dataene …',

  // --- App-egent: advarselen ved utlogging --------------------------------
  // Utlogging tømmer den lokale basen (#1877), og det er nettopp derfor denne
  // finnes: webben logger deg stille ut fordi den ikke har noe lokalt lager å
  // rydde. Appen har det, og slag som ikke har rukket å bli sendt ville
  // forsvunnet uten et ord. Se {@link unsentStrokesWarning}.
  unsentStrokesTitle: 'Slag som ikke er sendt',
  unsentStrokesCancel: 'Avbryt',
  unsentStrokesConfirm: 'Logg ut likevel',

  // --- App-egent: de tre linjene rommet kan måtte vise ---------------------
  // Kortet er den eneste delen som er avhengig av profilraden. Utlogging og
  // sletting spør serveren selv, så feilen holdes inne i kortet i stedet for å
  // bytte ut hele skjermen. Ordlyden er hjems, for det er samme slags svar på
  // samme slags problem.
  loadFailedNote:
    'Fikk ikke tak i profilen din. Sjekk nettet — vi henter den på nytt neste gang du åpner Profil.',
  // Knappen under feilen på «Rediger profil»: henter profilen på nytt.
  retry: 'Prøv igjen',
  // Utloggingen kastet. En rad som blir trykkbar igjen uten et ord ville lest
  // som at appen hang.
  logoutFailedNote: 'Fikk ikke logget deg ut. Prøv igjen.',
  // Sesjonen ble stående (`signout-failed`): tokenet var utløpt og appen kom
  // ikke til serveren for å fornye det. Setningen MÅ si at nett er kravet —
  // «prøv igjen» alene forteller ikke hva som skal være annerledes neste gang.
  // Samme lærdom som `accountCopy`s nett-tekster fikk i eier-tapptesten.
  logoutOfflineNote:
    'Du er fortsatt logget inn. Utlogging krever nett når det er en stund siden sist — koble til og prøv igjen.',
} as const;

/**
 * #2332: radene under «Dette lagrer vi» i «Dine data», i den rekkefølgen
 * skjermen viser dem.
 *
 * **Hver setning beskriver en regel, og her står regelen.** Lest mot den siste
 * definisjonen i `supabase/migrations/` og mot staging 14.11.2026. Endres hvem
 * som ser en av tabellene under, endres teksten i `messages/*.json →
 * profile.data`, {@link DATA_TEXT} og denne lista i samme PR
 * (`docs/schema-ground-truth.md`, RLS-avsnittet).
 *
 * **Teksten er kort, lista under er hele bildet.** Eieren valgte 14.11 én til
 * to linjer per rad, som i tegningen. Radene sier det viktigste for spilleren
 * og ingenting som er usant; unntakene og detaljene står bare her (og i PR-en
 * for #2332 som innspill til personvernerklæringen). En setning må aldri bli
 * usann ved at noe er tatt bort: «bare» brukes bare der ingen andre ser det.
 *
 * - `profile`: navnet via `users select own or shared games` (alle du deler et
 *   spill med) og venne- og klubbsidene, som bare viser navn og kallenavn
 *   (`lib/friends/getFriendData.ts`, `lib/clubs/getClubDetail.ts`). Uten
 *   innlogging viser en åpen påmeldingsside spillerlista med «Ola N.»
 *   (`getPublicSignupRoster` → `formatPublicName`,
 *   `app/[locale]/signup/[shortId]/page.tsx:152`). Handicap,
 *   kjønn og spillerklasse via `roster_candidates` (0181) bak
 *   `is_invite_eligible` (0202): vennskap i hvilken som helst status, også en
 *   ventende forespørsel begge veier, medspillere i et spill som ikke er en
 *   kladd, og klubbmedlemmer når en arrangør setter opp et spill i klubben.
 *   Historikken: `handicap_history read own` (0195).
 * - `email`: 0186 tar SELECT på `users.email` fra `anon` og `authenticated`.
 *   Invitasjonen bærer adressen til den som skrev den inn
 *   (`invitations select own incoming`, `invitations creator game-invite
 *   select`), og de som styrer en klubb, leser de åpne klubbinvitasjonene med
 *   service-rollen (`lib/clubs/getClubDetail.ts:117`). Lagoppsettet viser
 *   `maskEmail` (`lib/users/getTeamCandidates.ts`), og uten navn er
 *   visningsnavnet den skjulte adressen (`displayNameForOthers`). Månedsbrevet:
 *   `lib/productUpdates/digest.ts`.
 * - `rounds`: `scores select gating per mode` og `reactions select if
 *   participant`; en arrangør som ikke spiller, ser tavla med service-rollen
 *   (`lib/games/nonPlayerGameDoor.ts`, #2202). Et ferdig spill: RLS slipper
 *   bare inn deltakerne, men tavla leser med `getResultReadClient` for alle
 *   som er logget inn (`app/[locale]/games/[id]/leaderboard/page.tsx:113-127`).
 *   Live-lenka (`getGameBySpectateToken`, `app/[locale]/spectate/[token]`) er
 *   åpen uten innlogging, også etter slutt, med fullt navn; ligatabellen på en
 *   nettside også (`lib/league/getLigaSnapshot.ts`), spilltavla på en nettside
 *   med `formatPublicName` (`lib/embed/embedBoard.ts`). `paid_at` (0133) har
 *   SELECT for `authenticated` og leses gjennom `game_players select shared
 *   game` (`is_in_game`) og `game_players creator select`. Vipps-nummeret er
 *   `games.payment_link`, vist på spillsiden og på den åpne påmeldingssiden
 *   (`app/[locale]/signup/[shortId]/PublicLandingView.tsx`).
 * - `rareShots` (#2894): `/api/aeresbrett` leser alle ferdige runder med service-rollen og sender
 *   navn, hull, bane og dato for alle i Tørny (`lib/stats/getSeasonStrokes.ts`). Bryteren er
 *   `notification_preferences.share_rare_shots` (0238), filteret `lib/stats/rareShotOptOuts.ts`.
 *   Æreslista (#2894 PR 2) og banneret på Hjem: `/api/aeresliste` leser hole-in-one og albatross
 *   for alle år på samme måte (`lib/stats/getRareShotsAllTime.ts`), med samme filter.
 * - `social`: `friendships view own` (ingen admin-gren), `group_members select
 *   member or admin`; vennelenka krever innlogging
 *   (`app/[locale]/venner/legg-til/[code]/page.tsx:48`).
 * - `ai`: `ai_consents select own` (0210). Bare et ja slipper navnet inn i
 *   rundereferatet og i andres Kavalkade (`lib/ai/consent.ts`). Referatet
 *   (`games.round_report`) rendres av tavla, også bak live-lenka
 *   (`RoundReportCard` i `leaderboardContent.tsx` og formatvisningene).
 *   `kavalkades own select`, `kavalkade_shares own select`.
 * - `notifications`: `notifications_select_own`, `push_subscriptions own
 *   select`, `apns_tokens own select`, `fcm_tokens own select` (0232),
 *   `notification_preferences select own` (0236, varselvalgene).
 * - `adminLine`: `is_admin()` i SELECT-policyene på `users`, `games`,
 *   `game_players`, `scores`, `reactions`, `group_members`, `invitations` og
 *   `idea_submissions`, og e-posten med service-rollen bak `requireAdmin`.
 *   Ikke vennskap, varsler, enheter, AI-svaret, Kavalkaden eller
 *   handicaphistorikken.
 */
export const DATA_ROWS = ['profile', 'email', 'rounds', 'rareShots', 'social', 'ai', 'notifications'] as const;

export type DataRowId = (typeof DATA_ROWS)[number];

/**
 * #2332: tekstene i «Dine data». Webbens `messages/no.json → profile.data`
 * tegn for tegn (`profileCopy.test.ts` sammenligner hele objektet), så
 * nettsiden og appen sier det samme om hvem som ser hva.
 */
export const DATA_TEXT = {
  title: 'Dine data',
  lede: 'Hva Tørny vet om deg, og hvem som ser det.',
  sectionStored: 'Dette lagrer vi',
  rows: {
    profile: {
      title: 'Navn, handicap og golfprofil',
      body: 'Medspillere og venner ser navn og handicap. Uten innlogging viser påmeldingen fornavn og forbokstav.',
    },
    email: {
      title: 'E-postadressen',
      body: 'Vi bruker den til innlogging og varsler. Andre spillere ser ikke hele adressen, bortsett fra når du blir invitert.',
    },
    rounds: {
      title: 'Rundene og slagene dine',
      body: 'De andre i spillet og arrangøren ser slagene dine. Med en live-lenke kan hvem som helst følge spillet.',
    },
    rareShots: {
      title: 'Sjeldne slag',
      body: 'Slår du hole-in-one, albatross eller eagle, står det på Topplista. Hole-in-one og albatross står også på Æreslista. Alle i Tørny ser det. Skrur du av «Del sjeldne slag med alle» i appen, under «Du bestemmer», står du ikke på listene. Vennene dine får likevel beskjed, og i en ligarunde de andre i ligaen.',
    },
    social: {
      title: 'Venner og klubber',
      body: 'Hvem du er venn med, ser bare du og vennen. Klubben ser at du er med.',
    },
    ai: {
      title: 'Rundereferater og Kavalkaden',
      body: 'Har du sagt ja, kan navnet ditt stå i rundereferater og Kavalkaden. Kavalkaden din ser bare du.',
    },
    notifications: {
      title: 'Varsler',
      body: 'Varslene og hvilke telefoner som får dem, ser bare du.',
    },
  } satisfies Record<DataRowId, { title: string; body: string }>,
  adminLine:
    'Administratoren som driver Tørny, ser profilen, e-postadressen, spillene og klubbene dine.',
  processorsLine:
    'Tjenestene som behandler dataene for oss, står i personvernerklæringen.',
  // PR C: raden i «Du bestemmer». Underteksten lister nøyaktig det fila har
  // (`lib/profile/exportCore.ts`; `exportCore.test.ts` holder dem i takt).
  exportRow: 'Last ned dataene dine',
  exportSublabel:
    'Profilen, handicaphistorikken, spillene, slagene, påmeldingene, ligaene, cupene, reaksjonene, invitasjonene, vennene, klubbene, varslene, AI-svaret, Kavalkaden og ideene dine i én fil.',
} as const;

/**
 * Navnene på gruppene i «Hva som varsles» (#2315, Varsler-D2). Gruppene og
 * rekkefølgen bor i `lib/notifications/pushGroups.ts`.
 */
export const PUSH_GROUP_LABEL = {
  rounds: 'Rundene dine',
  scorecards: 'Scorekort',
  friends: 'Venner',
  signups: 'Påmeldinger',
} as const satisfies Record<PushGroupId, string>;

/** Statuslinja når varslene står på: designet sier «iPhone», og Android sier sitt (#2758). */
export function pushOnLabel(os: string): string {
  return os === 'android' ? 'På · Android' : 'På · iPhone';
}

/**
 * Tekstene i «Fullfør profilen» (#2216), steget en ny spiller møter etter
 * koden. Ordlyden er designets (Profilstart-forslag, #2350). Nettsiden har ennå
 * de gamle tekstene, så bare `kicker`, `plusHandicapLabel`, `submitButton` og
 * `submitPending` er webbens i dag; resten får nettsiden i #2350, og da er
 * pariteten tilbake (`profileCopy.test.ts`). Flat av samme grunn som
 * {@link PROFILE_TEXT}.
 */
export const ONBOARDING_TEXT = {
  kicker: 'Velkommen til Tørny',
  heading: 'To ting, så er du med',
  nameLabel: 'Hva heter du?',
  nameHint: 'Fornavn og etternavn, slik gjengen kjenner deg.',
  hcpLabel: 'Handicapet ditt',
  /** Skjermleser-etiketten på «+»-knappen, som webbens `hcpPlusLabel`. */
  plusHandicapLabel: 'Plusshandicap',
  hcpHint: 'Tallet du har i Golfbox nå. Har du ikke handicap ennå, skriv 54.',
  previewKicker: 'Slik ser de andre deg',
  /** Navnet i forhåndsvisningen før du har skrevet noe. */
  previewNamePlaceholder: 'Navnet ditt',
  submitButton: 'Sett i gang',
  submitPending: 'Lagrer …',
  footnote: 'Du kan endre begge deler senere i profilen.',
} as const;

/** Tittelen på spillkortet: «Lørdagsrunden venter på deg». */
export function onboardingGameTitle(gameName: string): string {
  return `${gameName} venter på deg`;
}

/**
 * Dato-ruta på spillkortet: «4» over «Okt». `null`
 * uten tee-off, og da står ingen rute. Enhetens lokaltid, som resten av appen
 * (`homeDates.ts`): Hermes har ikke Oslo-sonen.
 */
export function onboardingGameDate(teeOffAt: string | null): { day: string; month: string } | null {
  if (!teeOffAt) return null;
  const date = new Date(teeOffAt);
  if (Number.isNaN(date.getTime())) return null;
  // `formatShortDateNb` gir «4. okt»; månedsforkortelsen har ett hjem der.
  const raw = formatShortDateNb(date).split(' ')[1] ?? '';
  const month = raw.charAt(0).toUpperCase() + raw.slice(1);
  return { day: String(date.getDate()), month };
}

/**
 * Linja under tittelen: «Byneset · kl. 09:20 · Stableford». Det som mangler,
 * hoppes over: banen, klokkeslettet uten tee-off og et format appen ikke har
 * navn på.
 */
export function onboardingGameLine(game: {
  courseName: string | null;
  teeOffAt: string | null;
  gameMode: string;
}): string {
  const format = Object.hasOwn(MODE_LABELS, game.gameMode)
    ? MODE_LABELS[game.gameMode as keyof typeof MODE_LABELS]
    : null;
  return [game.courseName, formatStubClock(game.teeOffAt), format]
    .filter((part): part is string => !!part)
    .join(' · ');
}

/**
 * Handicapet i «Slik ser de andre deg»: «HCP 18,4», «HCP +2,5», eller
 * «HCP –» mens tallet ikke er gyldig.
 *
 * Gyldig er det serveren godtar (`parseHcpMagnitude` og `HCP_MIN`/`HCP_MAX` i
 * `lib/users/profileInput.ts`), så forhåndsvisningen aldri viser et tall
 * lagringen vil avvise. Formen er {@link formatHcpNb}, den samme som ellers i
 * appen.
 */
export function onboardingPreviewHcp(typed: string, isPlus: boolean): string {
  const magnitude = parseHcpMagnitude(typed.trim());
  if (magnitude === null) return 'HCP –';
  const signed = toSignedHcp(magnitude, isPlus);
  if (signed < HCP_MIN || signed > HCP_MAX) return 'HCP –';
  return `HCP ${formatHcpNb(signed)}`;
}

/**
 * «Oppdatert 12. mai» — webbens `hcpUpdatedShort` med datoen satt inn.
 *
 * @param dateText ferdig formatert dato, f.eks. fra {@link describeHandicapAge}.
 */
export function hcpUpdatedLine(dateText: string): string {
  return `${PROFILE_TEXT.hcpUpdatedPrefix}${dateText}`;
}

/** «med siden 2026» — sublinja på bag-taggen. */
export function memberSinceLine(year: number): string {
  return `${PROFILE_TEXT.memberSincePrefix}${year}`;
}

/**
 * Det skjermleseren sier om én flis: «Seire i 2026: 2». Hver flis er én node,
 * så tallet og hva det teller leses som én setning.
 */
export function seasonTileSpoken(label: string, year: number, value: string): string {
  return `${label} i ${year}: ${value}`;
}

/**
 * Etiketten under runde-flisa følger tallet: «1 runde i år», «14 runder i år»
 * (#2700). `null` (sesongen lastes) gir flertall, som før.
 */
export function seasonTileRoundsLabel(count: number | null): string {
  return count === 1 ? PROFILE_TEXT.tileRoundsOne : PROFILE_TEXT.tileRounds;
}

/** Som {@link seasonTileRoundsLabel}: «1 seier», «3 seire». */
export function seasonTileWinsLabel(count: number | null): string {
  return count === 1 ? PROFILE_TEXT.tileWinsOne : PROFILE_TEXT.tileWins;
}

/**
 * Advarselen spilleren møter når hen logger ut med slag i køen.
 *
 * Fire ting MÅ stå der, og de står der i denne rekkefølgen: hvor mange slag det
 * gjelder, at de blir liggende på telefonen, at de blir der til hen logger inn
 * igjen — og forbeholdet: med mindre noen andre logger inn før deg.
 * Uten «til du logger inn igjen» leser den første setningen som «du mister
 * dem»; uten forbeholdet lover den mer enn appen holder (#1942).
 *
 * **Setningen lover ikke levering, og det er med vilje.** Et første utkast sa
 * «… og sendes neste gang du logger inn». Det holder ikke alltid: en
 * karantene-rad (#668, gitt opp etter fem permanente feil) hoppes over av hver
 * eneste senere drain og går aldri opp — og `logOut` teller den med i tallet,
 * fordi den for spilleren er et slag som ikke kom fram. Og logger en annen
 * bruker inn på telefonen, tømmer eier-vakten (#1942, `data/localOwner.ts`)
 * radene før første drain — derfor forbeholdet i setningen. «Blir liggende til
 * du logger inn igjen» er sant i de to første tilfellene; «sendes» var det
 * ikke i noen av dem.
 *
 * Entall og flertall skilles på pronomenet («blir det liggende» / «blir de
 * liggende») — selve ordet «slag» er likt i begge tall på norsk, så tallet
 * alene gjør ikke setningen riktig.
 *
 * @param count antall køede slag. Kalleren viser aldri dialogen på 0.
 */
export function unsentStrokesWarning(count: number): string {
  const tail =
    count === 1
      ? 'Logger du ut nå, blir det liggende på telefonen til du logger inn igjen, med mindre noen andre logger inn før deg.'
      : 'Logger du ut nå, blir de liggende på telefonen til du logger inn igjen, med mindre noen andre logger inn før deg.';
  return `${count} slag er ikke sendt ennå. ${tail}`;
}

/**
 * Handicap fra lagret signert verdi til norsk visning: «+1,5» for
 * plusshandicap (lagret negativt), «12,4» ellers, «0,0» for scratch.
 *
 * Alltid én desimal og norsk desimalkomma — samme kontrakt som webbens
 * `formatHcpDisplay(signed, 'no')`, men bygget lokalt fordi Hermes mangler
 * ICU (se fil-kommentaren). Testen låser de to sammen verdi for verdi.
 */
export function formatHcpNb(signed: number): string {
  const magnitude = Math.abs(signed);
  const nb = magnitude.toFixed(1).replace('.', ',');
  // Scratch er bare «0,0» — et plusstegn foran null er ikke et handicap.
  return signed < 0 && magnitude !== 0 ? `+${nb}` : nb;
}

/**
 * Linja under handicap-kurven på bag-taggen (#2256): «−2,6 denne sesongen».
 * Ned er bedre, og tegnet er et ekte minus (−), som i designet. En sesong som
 * ender der den begynte, er «Uendret denne sesongen».
 */
export function handicapSeasonChange(change: number): string {
  if (change === 0) return 'Uendret denne sesongen';
  const size = Math.abs(change).toFixed(1).replace('.', ',');
  return `${change < 0 ? '−' : '+'}${size} denne sesongen`;
}

/** Det samme i ord for skjermleseren: «ned 2,6 denne sesongen». */
export function handicapSeasonChangeSpoken(change: number): string {
  if (change === 0) return 'uendret denne sesongen';
  const size = Math.abs(change).toFixed(1).replace('.', ',');
  return `${change < 0 ? 'ned' : 'opp'} ${size} denne sesongen`;
}

/**
 * Undertittelen på handicap-raden: enten påminnelsen om at det er gammelt,
 * eller når det sist ble satt.
 *
 * Grensa for «gammelt» hentes fra `lib/handicap/staleness.ts` og gjentas
 * ALDRI her — det er webbens regel, og en regel har ett hjem (AGENTS trap 4).
 * Det samme gjelder datoformatet: `formatShortDateNb` er håndskrevet og
 * Intl-fri, så den bundler rett inn i appen.
 *
 * @param updatedAt tidsstempelet fra `users.handicap_updated_at`, eller `null`.
 * @param now injiserbar for tester; produksjonskall lar den stå.
 */
export function describeHandicapAge(
  updatedAt: string | null | undefined,
  now?: Date,
): string {
  if (isHandicapAgeStale(updatedAt, now)) return PROFILE_TEXT.hcpStaleShort;
  // `isHandicapAgeStale` har sagt at stempelet finnes og kan leses.
  return hcpUpdatedLine(formatShortDateNb(new Date(updatedAt as string)));
}

/**
 * Om handicapet skal regnes som gammelt — grenen {@link describeHandicapAge}
 * velger påminnelsen på. Bag-taggen (#2256) trenger svaret for seg, fordi
 * påminnelsen der er en lenke til skjemaet og ikke bare en linje.
 */
export function isHandicapAgeStale(
  updatedAt: string | null | undefined,
  now?: Date,
): boolean {
  if (!updatedAt) return true;
  const updated = new Date(updatedAt);
  // Et ulesbart tidsstempel gir en NaN-differanse, og `isHandicapStale` leser
  // den som «ikke gammelt» — da ville raden stått med «Oppdatert Invalid
  // Date». Vi vet ikke NÅR det ble satt, så vi ber om det på nytt: samme svar
  // som når tidsstempelet mangler helt.
  if (Number.isNaN(updated.getTime())) return true;
  return isHandicapStale(updated, now);
}

/**
 * #2332 PR C: hvorfor «Last ned dataene dine» ikke ga noen fil, som en setning
 * spilleren kan gjøre noe med. Uttømmende switch uten `default`, som
 * {@link describeProfileSaveFailure}: en ny grunn i `DataExportFailure` gir rød
 * `tsc` til den har fått en setning.
 *
 * `failed` er webbens egen tekst når en lesing feiler (#2333,
 * `app/[locale]/profile/export/route.ts`); i appen dekker den også en fil som
 * ikke kunne skrives eller deles.
 */
export function describeDataExportFailure(reason: DataExportFailure): string {
  switch (reason) {
    case 'offline':
      return 'Du er uten nett. Koble til, så kan du laste ned dataene dine.';
    // Wi-Fi av og mobildata på: telefonen er «på nett», men når ikke serveren.
    // Setningen må si at nett er kravet, som de andre nett-tekstene i appen.
    case 'network':
      return 'Du må være på nett for å laste ned dataene. Sjekk tilkoblingen og prøv igjen.';
    case 'no-web-base-url':
      return 'Appen mangler adressen til serveren, så du får ikke lastet ned dataene herfra. Ta kontakt med administrator.';
    case 'unauthorized':
      return 'Du er ikke logget inn lenger. Logg inn på nytt og prøv igjen.';
    case 'failed':
      return 'Klarte ikke å hente dataene dine. Prøv igjen om litt.';
  }
}

/**
 * Hvorfor lagringen ikke gikk gjennom — koden fra `data/profile.ts` som en
 * setning spilleren kan gjøre noe med.
 *
 * Uttømmende switch uten `default`: legger noen til en kode i
 * {@link ProfileSaveFailure}, faller `tsc` på den manglende returverdien. Det
 * er hele grunnen til at funksjonen finnes i stedet for et oppslagsobjekt.
 *
 * De fire valideringskodene er webbens `profile.errors.*` tegn for tegn, og
 * `update_failed` er webbens `errors.unknown` — samme feil, samme setning,
 * uansett flate. Nett-kodene har ingen fasit: webbens skjema kan ikke være
 * offline.
 */
export function describeProfileSaveFailure(reason: ProfileSaveFailure): string {
  switch (reason) {
    // Profil-lagring legges ALDRI i sync-køen: regelen (recompute av frosne
    // banehandicap) kjøres på serveren. Egen setning som sier hva som venter
    // (lagringen), ikke den delte offline-linja fra `rosterCopy`.
    case 'offline':
      return 'Du er uten nett. Koble til, så kan du lagre profilen din.';
    // Env-varen bakes inn ved bundling. Mangler den, er det en feil i bygget,
    // ikke noe spilleren kan rette — men den skal si det høyt i stedet for å
    // la Lagre gjøre ingenting (ærlig-feil-guardrailen).
    case 'no-web-base-url':
      return 'Appen mangler adressen til serveren, så du får ikke lagret profilen herfra. Ta kontakt med administrator.';
    // Begge nett-grenene MÅ si at lagring krever tilkobling. Eier-tapptesten
    // på slette-flyten traff nettopp denne grenen (Wi-Fi av, mobildata på:
    // enheten er «online», men når ikke serveren) og savnet kravet — «prøv
    // igjen» alene forteller ikke hva som skal være annerledes neste gang.
    case 'network':
      return 'Du må være på nett for å lagre profilen. Sjekk tilkoblingen og prøv igjen.';
    // Tokenet kan bare ha gått ut mens skjemaet sto åpent. Ingenting er lagret,
    // og feltene står som de står — derfor «prøv igjen».
    case 'unauthorized':
      return 'Du er ikke logget inn lenger. Logg inn på nytt og prøv igjen.';
    // = profile.errors.name_required
    case 'name_required':
      return 'Du må fylle inn navn.';
    // = profile.errors.hcp_invalid. Setningen peker på plusshandicap-knappen
    // fordi feltet tar en magnitude uten fortegn — uten den siste setningen
    // ville en spiller med +1,5 prøvd å taste minus.
    case 'hcp_invalid':
      return 'Handicapindeks må være et tall mellom 0 og 54. Bruk +-knappen for plusshandicap.';
    // = profile.errors.gender_required
    case 'gender_required':
      return 'Velg kjønn.';
    // = profile.errors.level_invalid
    case 'level_invalid':
      return 'Ugyldig spillerklasse.';
    // = profile.errors.unknown. Catch-all for alt ruta ikke navnga, inkludert
    // en 0-rads skriving (AGENTS trap 2) som ruta melder som 500.
    case 'update_failed':
      return 'Noe gikk galt. Prøv igjen.';
  }
}
