// Oppslag i en teksttabell med en kode fra nettverket. En vanlig `table[code]`
// gir en funksjon for koder som «constructor» eller «toString»; dette gir bare
// det tabellen selv har.
export function ownEntry<T>(table: Readonly<Record<string, T>>, code: string): T | undefined {
  return Object.hasOwn(table, code) ? table[code] : undefined;
}
