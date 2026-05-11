const dayNames = ['søn.', 'man.', 'tir.', 'ons.', 'tor.', 'fre.', 'lør.'];
const monthNames = [
  'jan', 'feb', 'mar', 'apr', 'mai', 'jun',
  'jul', 'aug', 'sep', 'okt', 'nov', 'des',
];

export function formatTeeOffTime(date: Date): string {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function formatTeeOffDate(date: Date): string {
  const day = dayNames[date.getDay()];
  const dom = date.getDate();
  const mon = monthNames[date.getMonth()];
  return `${day} ${dom}. ${mon}`;
}

export function expectedFirstScoreTime(teeOff: Date): string {
  const plus30 = new Date(teeOff.getTime() + 30 * 60 * 1000);
  const minutes = plus30.getMinutes();
  const rounded = Math.ceil(minutes / 5) * 5;
  // Use the Date itself to roll over hour/day boundaries safely.
  const result = new Date(plus30);
  result.setMinutes(rounded, 0, 0);
  return formatTeeOffTime(result);
}
