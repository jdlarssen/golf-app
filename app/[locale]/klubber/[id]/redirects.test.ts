import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * #2326: the club page lost its result banners. Requests, invitations and
 * «Legg til medlem» moved to /klubber/[id]/administrer; the member list with
 * «Endre rolle» and «Fjern» to /klubber/[id]/medlemmer. A redirect that still
 * sends ?decided= / ?added= / ?error= / ?role_changed= (or the invitation
 * banners) to the bare club page would land on a page that never shows it.
 * This guard reads the source under app/ and lib/.
 */
const ROOT = join(__dirname, '..', '..', '..', '..');
const CLUB = join(__dirname);
const SKIP_DIRS = new Set(['node_modules', '.next', '__snapshots__']);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

const read = (path: string) => readFileSync(join(CLUB, path), 'utf8');

describe('club redirects land where their banner stands (#2326)', () => {
  it('no result banner goes to the bare club page', () => {
    const bare =
      /[`'"]\/klubber\/\$\{[\w.]+\}\?(decided|added|invited|cancelled|error|email|role_changed)=/;
    const hits = ['app', 'lib']
      .flatMap((dir) => sourceFiles(join(ROOT, dir)))
      .flatMap((file) =>
        readFileSync(file, 'utf8')
          .split('\n')
          .map((line, i) => ({ line, i }))
          .filter(({ line }) => bare.test(line))
          .map(({ i }) => `${relative(ROOT, file)}:${i + 1}`),
      );
    expect(hits).toEqual([]);
  });

  it('the member actions on the back room land on /administrer', () => {
    const src = read('actions.ts');
    const targets = [...src.matchAll(/href: `\/klubber\/\$\{groupId\}([^`?]*)/g)].map((m) => m[1]);
    expect(targets.length).toBeGreaterThan(0);
    expect(new Set(targets)).toEqual(new Set(['/administrer']));
    expect(src).toContain('revalidatePath(`/klubber/${groupId}/administrer`)');
  });

  it('a role change and a removal land on /medlemmer', () => {
    for (const path of ['rolle/[userId]/actions.ts', 'fjern/[userId]/actions.ts']) {
      const src = read(path);
      const done = [...src.matchAll(/href: `\/klubber\/\$\{groupId\}([^`?]*)/g)].map((m) => m[1]);
      expect(done, path).toContain('/medlemmer');
      expect(done.filter((t) => t === ''), path).toEqual([]);
      expect(src, path).toContain('revalidatePath(`/klubber/${groupId}/medlemmer`)');
    }
    expect(read('rolle/[userId]/actions.ts')).toContain(
      '/klubber/${groupId}/medlemmer?role_changed=',
    );
  });
});
