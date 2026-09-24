// Native #1960: felles påstand for copy-testene.
//
// Hver copy-suite (`accountCopy`, `endGameCopy`, `profileCopy`, `rosterCopy`,
// `actionFeedback`, `loginCopy`) sjekker at setningene den gir skjermen er
// ferdige. Regelen sto definert fem ganger og skrevet inline én gang til #1960.

/**
 * En ferdig setning: det står noe, og ingen halvferdig interpolering skal nå
 * fram til skjermen. En `{` eller `}` i teksten er en plassholder ingen fylte
 * inn.
 */
export function isFinishedSentence(text: string): boolean {
  return text.trim().length > 0 && !/[{}]/.test(text);
}
