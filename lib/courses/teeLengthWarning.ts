// Sanity-warning for tee-lengde utenfor typisk norsk range. Soft-warning
// fanger åpenbare typos (f.eks. 4500 m på en herretee, eller 7500 m på en
// hvilken som helst tee) før de havner i DB. Issue #236.
//
// `tee_boxes`-tabellen har ingen gender-kolonne — én rad bærer rating for
// opptil tre kjønn samtidig (mens/ladies/juniors). Range-en bestemmes
// derfor av hvilke gender-blokker som er fylt ut for tee-en.

export type TeeLengthWarningInput = {
  length_meters: string;
  slope_mens: string;
  course_rating_mens: string;
  slope_ladies: string;
  course_rating_ladies: string;
  slope_juniors: string;
  course_rating_juniors: string;
};

type Gender = 'mens' | 'ladies' | 'juniors';

// Romslige (±100m) rundt typiske norske ranges fra issue #236. Bevisst
// videre enn de eksakte tallene så grenseverdier som 6550 m på en lang
// herretee ikke utløser falsk warning.
const GENDER_RANGES: Record<Gender, { min: number; max: number }> = {
  mens: { min: 5300, max: 6600 },
  ladies: { min: 4700, max: 5900 },
  juniors: { min: 4400, max: 5600 },
};

const ALL_GENDERS: readonly Gender[] = ['mens', 'ladies', 'juniors'] as const;

function isActiveGender(
  tee: TeeLengthWarningInput,
  gender: Gender,
): boolean {
  return (
    tee[`slope_${gender}`].trim() !== '' ||
    tee[`course_rating_${gender}`].trim() !== ''
  );
}

function genderText(active: readonly Gender[]): string {
  const has = (g: Gender) => active.includes(g);
  const mens = has('mens');
  const ladies = has('ladies');
  const juniors = has('juniors');

  if (mens && ladies && juniors) return 'tee for alle kjønn';
  if (mens && ladies) return 'dame-/herretee';
  if (mens && juniors) return 'herre-/juniortee';
  if (ladies && juniors) return 'dame-/juniortee';
  if (mens) return 'herretee';
  if (ladies) return 'dametee';
  return 'juniortee';
}

export function getTeeLengthWarning(
  tee: TeeLengthWarningInput,
): string | null {
  const lengthStr = tee.length_meters.trim();
  if (lengthStr === '') return null;
  const length = Number(lengthStr);
  if (!Number.isFinite(length)) return null;

  const active = ALL_GENDERS.filter((g) => isActiveGender(tee, g));
  if (active.length === 0) return null;

  const min = Math.min(...active.map((g) => GENDER_RANGES[g].min));
  const max = Math.max(...active.map((g) => GENDER_RANGES[g].max));

  if (length >= min && length <= max) return null;

  const direction = length < min ? 'kort' : 'lang';
  return `Uvanlig ${direction} for norsk ${genderText(active)} (${min}–${max} m).`;
}
