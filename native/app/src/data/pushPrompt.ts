// native/app/src/data/pushPrompt.ts
// #2758: spørsmålet om varsler på Hjem. Eierens valg: et kort, og appen spør bare
// én gang på hver telefon. Reglene hos Apple og Google sier at telefonens eget
// spørsmål skal utløses av en handling, så det kommer først etter trykk på kortet.
//
// **Svaret hører til telefonen**, som tillatelsen gjør, og står i AsyncStorage. Det
// settes ved «Ikke nå», ved trykk på «Slå på varsler» og når bryteren under Profil
// brukes. En konto nummer to på samme telefon finner bryteren.
//
// **«Tillatt» betyr ikke det samme på de to telefonene.** På iPhone har spilleren
// svart når telefonen sier noe annet enn `undetermined`. På Android kan eldre
// versjoner og oppgraderte apper ha tillatelsen uten at noen har valgt, og Android
// svarer `denied` også før noen har spurt (målt på emulatoren), så der teller bare
// «nei for godt» som et svar.
//
// **En feil er ikke et svar.** Feilen kommer ofte etter at spilleren har sagt ja, og
// da svarer iPhone det samme som for en som har valgt. Derfor huskes forsøket: et
// kort uten svar står til det er besvart, også når tillatelsen alt er gitt.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { canUsePush, isPushRememberedForThisAccount, notificationsModule } from './pushDevice';

export const PUSH_PROMPT_ANSWERED_KEY = 'torny-push-prompt-answered';

/** Verdien i nøkkelen etter en feil: ikke noe svar, men kortet skal stå. */
const RETRY_AFTER_FAILURE = 'retry';

export type PushPromptFacts = {
  /** Et bygg med varselmodulen (`canUsePush`). */
  supported: boolean;
  /** Svaret er lagret på denne telefonen. */
  answered: boolean;
  /** Telefonen husker et token for kontoen som er logget inn. */
  pushRemembered: boolean;
  /** Forrige forsøk fra kortet feilet, og spilleren har ikke svart siden. */
  retryAfterFailure: boolean;
  os: string;
  /** `null` når tillatelsen ikke kunne leses: da spør vi ikke. */
  permission: { granted: boolean; canAskAgain: boolean; status: string } | null;
};

export function shouldShowPushPrompt(facts: PushPromptFacts): boolean {
  if (!facts.supported || facts.answered || facts.pushRemembered || !facts.permission) return false;
  if (facts.os === 'android') return facts.permission.granted || facts.permission.canAskAgain;
  return (
    facts.permission.status === 'undetermined' ||
    (facts.retryAfterFailure && facts.permission.granted)
  );
}

/** Skal kortet vises nå? Kaster aldri: er noe uklart, spør vi ikke. */
export async function readShouldShowPushPrompt(): Promise<boolean> {
  if (!canUsePush()) return false;
  try {
    const stored = await AsyncStorage.getItem(PUSH_PROMPT_ANSWERED_KEY);
    return shouldShowPushPrompt({
      supported: true,
      answered: stored !== null && stored !== RETRY_AFTER_FAILURE,
      retryAfterFailure: stored === RETRY_AFTER_FAILURE,
      pushRemembered: await isPushRememberedForThisAccount(),
      os: Platform.OS,
      permission: await notificationsModule().getPermissionsAsync(),
    });
  } catch (err) {
    console.error('[pushPrompt] fikk ikke lest om kortet skal vises', err);
    return false;
  }
}

/** Lagrer at telefonen har svart. Kaster aldri. */
export async function markPushPromptAnswered(): Promise<void> {
  try {
    await AsyncStorage.setItem(PUSH_PROMPT_ANSWERED_KEY, new Date().toISOString());
  } catch (err) {
    console.error('[pushPrompt] fikk ikke lagret svaret', err);
  }
}

/** Husker at forsøket feilet, så kortet står til det er besvart. Kaster aldri. */
export async function markPushPromptFailed(): Promise<void> {
  try {
    await AsyncStorage.setItem(PUSH_PROMPT_ANSWERED_KEY, RETRY_AFTER_FAILURE);
  } catch (err) {
    console.error('[pushPrompt] fikk ikke lagret feilen', err);
  }
}
