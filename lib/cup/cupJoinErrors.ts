/**
 * Typet feil for lesefeil i cup-påmeldingens fakta-innsamling (#1863).
 *
 * Egen modul, ikke i `getCupJoinContext.ts`: `actions.test.ts` mocker hele
 * `@/lib/cup/getCupJoinContext`-modulen med en factory som bare eksporterer
 * `getCupJoinContext`. En klasse eksportert derfra ville vært `undefined` i
 * testen, og `instanceof` ville kastet TypeError i stedet for å fange feilen.
 *
 * Samme mønster som `NoRowsAffectedError` (`lib/supabase/affectedRows.ts`): en
 * typet feil lar call-siten skille «DB-en svarte ikke» fra alt annet, i stedet
 * for å tolke en tom liste som et gyldig svar (I3 / AGENTS.md-felle 4).
 */

/** Hvilken av de fem lesingene i `getCupJoinContext` som feilet. */
export type CupJoinReadName =
  | 'cup'
  | 'creator'
  | 'me'
  | 'participants'
  | 'membership';

/**
 * Kastes når en av lesingene i `getCupJoinContext` svarer med `error`.
 *
 * Feiler lesingen, vet vi ingenting — hverken hvor mange som står på lista
 * eller om spilleren alt er påmeldt. Da må vakten si nei (fail closed), ikke
 * gjette på tomme lister.
 */
export class CupJoinReadError extends Error {
  override name = 'CupJoinReadError';

  constructor(public readonly which: CupJoinReadName) {
    super(`getCupJoinContext: ${which} read failed`);
    // Gjenoppretter prototype-kjeden så `instanceof` holder i transpilert kode.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
