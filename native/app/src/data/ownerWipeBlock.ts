// native/app/src/data/ownerWipeBlock.ts
// Native #1959: sperren på drainen når eier-vaktens wipe kaster ved eierbytte.
//
// Porten i `App.tsx` holder stacken, og dermed `startSyncTriggers`, unna så
// lenge wipen ikke har lyktes. Sperren her er det andre beltet: `drainQueue`
// sier nei selv, uansett hvem som kaller den. Da er garantien ikke avhengig av
// at hver fremtidige kaller huske porten.
//
// Egen fil uten avhengigheter, så `syncWorker` kan lese den uten å dra inn
// AsyncStorage og eier-vakten. Tilstanden lever like lenge som JS-prosessen;
// en kaldstart kjører vakten på nytt før stacken monteres.
let blocked = false;

export function setOwnerWipeBlocked(value: boolean): void {
  blocked = value;
}

export function isOwnerWipeBlocked(): boolean {
  return blocked;
}
