// #2751: et trykk i utslagsvelgeren. Valget lagres på telefonen og sendes av
// `drainQueue` med `set_tee_starter_if_unset`, så trykket lykkes uansett nett.
//
// Heller ikke her overskriver et valg et annet: finnes raden, står den, og det
// er den kalleren får tilbake. Første valg som når serveren, gjelder.
import { getTeeStarter, insertTeeStarterIfAbsent, withTxn, type LocalTeeStarter } from './db';

interface WriteTeeStarterArgs {
  gameId: string;
  teamNumber: number;
  teeStarterId: string;
}

export async function writeTeeStarter(args: WriteTeeStarterArgs): Promise<LocalTeeStarter> {
  return withTxn(async (txn) => {
    await insertTeeStarterIfAbsent(txn, args.gameId, args.teamNumber, args.teeStarterId);
    const row = await getTeeStarter(txn, args.gameId, args.teamNumber);
    if (!row) throw new Error(`Utslagsvalget for lag ${args.teamNumber} ble ikke lagret`);
    return row;
  });
}
