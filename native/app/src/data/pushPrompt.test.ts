// #2758: hvem som får spørsmålet om varsler på Hjem (Type A). Én rad per
// situasjon i kontrakten. Svaret hører til telefonen: appen spør én gang.
import { shouldShowPushPrompt, type PushPromptFacts } from './pushPrompt';

// Funksjonen er ren. Mockene holder modulene den ikke bruker, ute av testen.
jest.mock('./pushDevice', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () => ({}));

const NEVER_ASKED_IOS = { granted: false, canAskAgain: true, status: 'undetermined' };
const GRANTED_IOS = { granted: true, canAskAgain: true, status: 'granted' };
const DENIED_IOS = { granted: false, canAskAgain: false, status: 'denied' };
// Målt på emulatoren (#2758): Android svarer `denied` også før noen har spurt.
const NEVER_ASKED_ANDROID = { granted: false, canAskAgain: true, status: 'denied' };
const DENIED_FOR_GOOD_ANDROID = { granted: false, canAskAgain: false, status: 'denied' };
const GRANTED_ANDROID = { granted: true, canAskAgain: true, status: 'granted' };

const facts = (over: Partial<PushPromptFacts>): PushPromptFacts => ({
  supported: true,
  answered: false,
  pushRemembered: false,
  retryAfterFailure: false,
  os: 'ios',
  permission: NEVER_ASKED_IOS,
  ...over,
});

describe('shouldShowPushPrompt', () => {
  it.each<[string, Partial<PushPromptFacts>, boolean]>([
    ['bygg uten varselmodulen', { supported: false }, false],
    ['svaret er lagret', { answered: true }, false],
    ['telefonen husker et token for kontoen, iPhone', { pushRemembered: true, permission: GRANTED_IOS }, false],
    ['telefonen husker et token for kontoen, Android', { os: 'android', pushRemembered: true, permission: GRANTED_ANDROID }, false],
    ['iPhone, aldri besvart, også en spiller som aldri har rørt bryteren', {}, true],
    ['iPhone, gitt, men ikke på: har svart', { permission: GRANTED_IOS }, false],
    ['iPhone, nektet: Varsler-siden forklarer', { permission: DENIED_IOS }, false],
    ['Android 13+, ikke spurt', { os: 'android', permission: NEVER_ASKED_ANDROID }, true],
    ['Android 13+, nektet én gang', { os: 'android', permission: NEVER_ASKED_ANDROID }, true],
    ['Android 13+, nektet for godt', { os: 'android', permission: DENIED_FOR_GOOD_ANDROID }, false],
    ['Android 12 og eldre, eller oppgradert: gitt uten valg', { os: 'android', permission: GRANTED_ANDROID }, true],
    ['iPhone, gitt, og forsøket på kortet feilet: kortet står til det er besvart', { permission: GRANTED_IOS, retryAfterFailure: true }, true],
    ['iPhone, nektet i Innstillinger etter en feil: telefonen har svart', { permission: DENIED_IOS, retryAfterFailure: true }, false],
    ['iPhone, svaret er lagret etter en feil', { permission: GRANTED_IOS, retryAfterFailure: true, answered: true }, false],
    ['tillatelsen kunne ikke leses', { permission: null }, false],
    ['svaret slår alt annet, også Android som aldri er spurt', { os: 'android', permission: NEVER_ASKED_ANDROID, answered: true }, false],
  ])('%s', (_case, over, expected) => {
    expect(shouldShowPushPrompt(facts(over))).toBe(expected);
  });
});
