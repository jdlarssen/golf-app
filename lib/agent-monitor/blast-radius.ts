const NEVER_AUTO_PUSH_PATHS = [
  'lib/scoring/',
  'supabase/migrations/',
  'lib/sync/',
  'proxy.ts',
  'app/api/auth/',
  'app/login/',
  'middleware.ts',
];

const MAX_FILES = 1;
const MAX_LINES = 10;

export type BlastRadiusInput = {
  files: string[];
  linesChanged: number;
};

export type BlastRadiusResult = { ok: true } | { ok: false; reason: string };

export function isSafeToAutoPush(input: BlastRadiusInput): BlastRadiusResult {
  if (input.files.length > MAX_FILES) {
    return {
      ok: false,
      reason: `touches ${input.files.length} files (max ${MAX_FILES} file per auto-push)`,
    };
  }
  if (input.linesChanged > MAX_LINES) {
    return {
      ok: false,
      reason: `${input.linesChanged} lines changed (max ${MAX_LINES} lines per auto-push)`,
    };
  }
  for (const file of input.files) {
    for (const banned of NEVER_AUTO_PUSH_PATHS) {
      if (file === banned || file.startsWith(banned)) {
        return { ok: false, reason: `touches ${banned} (always PR)` };
      }
    }
  }
  return { ok: true };
}
