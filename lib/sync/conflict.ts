export interface ConflictInput {
  localClientUpdatedAt: string; // ISO timestamp
  serverClientUpdatedAt: string;
}

export type ConflictResolution = 'local-wins' | 'server-wins' | 'equal';

export function resolveConflict(input: ConflictInput): ConflictResolution {
  if (input.localClientUpdatedAt > input.serverClientUpdatedAt)
    return 'local-wins';
  if (input.localClientUpdatedAt < input.serverClientUpdatedAt)
    return 'server-wins';
  return 'equal';
}
