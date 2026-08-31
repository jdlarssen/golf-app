// native/app/src/lib/wizardFormData.ts
// Native N6a (#1854): den lille `FormData`-en appen mater webbens delte
// payload-bygger med.
//
// **Hvorfor en shim i det hele tatt.** `buildGameInsertPayload`
// (`lib/games/gamePayload.ts`) er regelens ene hjem: den bygger `mode_config`
// per modus, håndhever 12 CHECK-constraints og eier alle feilkodene. Den skal
// DELES, ikke speiles — en håndbygget config i appen ville drevet fra webbens
// fasong ved første regelendring (#1850 viste akkurat den fella). Men
// signaturen tar `FormData`, og React Natives globale `FormData` er laget for
// nettverks-upload: den har `append`, men hverken `get`, `getAll` eller `has`.
// Å sende den inn ville kastet på første `formData.get('name')`.
//
// **Hvorfor en Map og ikke et polyfill.** Byggeren leser `formData.get()` og
// ingenting annet — 53 kall, null `getAll`/`has`/`entries` (verifisert mot
// HEAD). En Map med `get` dekker altså hele kontaktflaten. `getAll` og `has` er
// likevel implementert: de koster to linjer, og de gjør castet under ærlig i
// stedet for et løfte som holder helt til noen legger til et `has`-kall på
// web-siden.
//
// Verdier lagres som STRENGER, akkurat som en ekte `<form>` sender dem —
// `set('side_ld_count', 1)` blir `'1'`, og `get()` gir `'1'` tilbake. Det er
// hele poenget: byggeren gjør sin egen `Number(...)`-parsing og skal se nøyaktig
// det en nettleser ville sendt.

/** Verdityper veiviseren setter. Alt normaliseres til streng ved `set`. */
export type WizardFieldValue = string | number | boolean | null | undefined;

/**
 * Map-basert stand-in for `FormData`, med kun de lesemetodene den delte
 * byggeren bruker.
 *
 * `null`/`undefined` SLETTER feltet i stedet for å lagre strengen `'null'`.
 * Det speiler et `<input>` som ikke er rendret: byggeren skiller på `null`
 * (feltet finnes ikke → default) og `''` (feltet finnes, men er tomt), og en
 * `'null'`-streng ville vært en tredje, meningsløs tilstand.
 */
export class WizardFormData {
  private readonly fields = new Map<string, string>();

  set(name: string, value: WizardFieldValue): this {
    if (value === null || value === undefined) {
      this.fields.delete(name);
      return this;
    }
    this.fields.set(name, String(value));
    return this;
  }

  get(name: string): string | null {
    return this.fields.get(name) ?? null;
  }

  getAll(name: string): string[] {
    const value = this.fields.get(name);
    return value === undefined ? [] : [value];
  }

  has(name: string): boolean {
    return this.fields.has(name);
  }

  /** Feltene som ble satt. Kun for tester og feilsøking. */
  toObject(): Record<string, string> {
    return Object.fromEntries(this.fields);
  }
}

/**
 * Gir shimmen til en funksjon som er typet for `FormData`.
 *
 * Castet er trygt fordi kontaktflaten er verifisert: den delte byggeren rører
 * bare `get()`. Det står som ÉN navngitt funksjon og ikke som spredte
 * `as unknown as FormData` på hvert kallsted, slik at antakelsen har én adresse
 * — og slik at et framtidig `getAll`/`entries`-kall på web-siden har ett sted å
 * bli fanget opp i stedet for fem.
 */
export function asSharedFormData(formData: WizardFormData): FormData {
  return formData as unknown as FormData;
}
