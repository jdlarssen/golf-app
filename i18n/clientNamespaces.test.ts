import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT_CLIENT_NAMESPACES, pickMessages } from './clientNamespaces';

/**
 * #2227: the root layout sends only `ROOT_CLIENT_NAMESPACES` to the browser,
 * and `<IntlScope namespaces={[…]}>` in a layout adds heavy namespaces for the
 * routes below it. A client component that reaches for a namespace its route
 * does not provide renders raw keys, so this guard walks the import graph from
 * every route entry and checks each client module's `useTranslations('<ns>')`
 * against what that route provides.
 *
 * Structural, `fs` + regex only (same style as lib/supabase/scoresReadSites.test.ts).
 * A module is client code when it starts with 'use client' or is imported,
 * directly or not, from one; a server module's `useTranslations` reads the
 * server catalog and is not checked. A 'use server' module is a boundary: the
 * client gets action references, never its code or its imports.
 */

const ROOT = join(__dirname, '..');
const DIRS = ['app', 'components', 'hooks', 'lib', 'i18n'];
const LOCALE_ROOT = 'app/[locale]';
const ENTRY = /^(page|layout|error|loading|not-found|template|default)\.tsx?$/;
/** The one client module allowed to read the parent provider's messages. */
const MESSAGES_READER = 'components/i18n/IntlScopeClient.tsx';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'node_modules' || entry.name === '__tests__' ? [] : sourceFiles(path);
    }
    return /\.(ts|tsx)$/.test(entry.name) &&
      !/\.(test|spec)\.tsx?$/.test(entry.name) &&
      !entry.name.endsWith('.d.ts')
      ? [path]
      : [];
  });
}

type Graph = {
  sources: Map<string, string>;
  imports: Map<string, string[]>;
};

// `import type` / `export type` carry no runtime code and are skipped.
const IMPORT_FROM = /^\s*import\s+(type\s+)?[^'";]*?\sfrom\s*['"]([^'"]+)['"]/gm;
const IMPORT_BARE = /^\s*import\s*['"]([^'"]+)['"]/gm;
const EXPORT_FROM =
  /^\s*export\s+(type\s+)?(?:\*(?:\s+as\s+\w+)?|\{[^}]*\})\s*from\s*['"]([^'"]+)['"]/gm;
const DYNAMIC_IMPORT = /import\(\s*['"]([^'"]+)['"]\s*\)/g;

function buildGraph(): Graph {
  const files = DIRS.flatMap((dir) => sourceFiles(join(ROOT, dir))).map((p) => relative(ROOT, p));
  const known = new Set(files);
  const sources = new Map(files.map((f) => [f, readFileSync(join(ROOT, f), 'utf8')]));

  const resolveSpec = (from: string, spec: string): string | null => {
    let base: string;
    if (spec.startsWith('@/')) base = spec.slice(2);
    else if (spec.startsWith('.')) base = relative(ROOT, resolve(ROOT, dirname(from), spec));
    else return null; // a package
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
      if (known.has(candidate)) return candidate;
    }
    return null; // json, css, …
  };

  const imports = new Map<string, string[]>();
  for (const [file, text] of sources) {
    const specs = [
      ...[...text.matchAll(IMPORT_FROM)].filter((m) => !m[1]).map((m) => m[2]!),
      ...[...text.matchAll(IMPORT_BARE)].map((m) => m[1]!),
      ...[...text.matchAll(EXPORT_FROM)].filter((m) => !m[1]).map((m) => m[2]!),
      ...[...text.matchAll(DYNAMIC_IMPORT)].map((m) => m[1]!),
    ];
    const resolved = specs.map((s) => resolveSpec(file, s)).filter((f): f is string => f !== null);
    imports.set(file, [...new Set(resolved)]);
  }
  return { sources, imports };
}

function directive(text: string): 'client' | 'server' | null {
  const body = text.replace(/^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*/, '');
  if (/^['"]use client['"]/.test(body)) return 'client';
  if (/^['"]use server['"]/.test(body)) return 'server';
  return null;
}

const LITERAL_T = /useTranslations\(\s*(['"])([^'"]*)\1/g;
const ANY_T = /useTranslations\(/g;

function namespacesUsed(text: string): string[] {
  return [...text.matchAll(LITERAL_T)].map((m) => m[2]!.split('.')[0]!);
}

/** Client modules reachable from `entry`, walking through server modules too. */
function clientModulesFrom(graph: Graph, entry: string): Set<string> {
  const context = new Map<string, boolean>(); // file → reached as client code?
  const client = new Set<string>();
  const stack: Array<[string, boolean]> = [[entry, false]];
  while (stack.length > 0) {
    const [file, fromClient] = stack.pop()!;
    const kind = directive(graph.sources.get(file)!);
    const isClient = kind !== 'server' && (fromClient || kind === 'client');
    const seen = context.get(file);
    if (seen === true || (seen === false && !isClient)) continue;
    context.set(file, isClient);
    if (isClient) client.add(file);
    for (const next of graph.imports.get(file) ?? []) stack.push([next, isClient]);
  }
  return client;
}

const SCOPE = /<IntlScope\s+namespaces=\{\[([^\]]*)\]\}/g;

/** Namespaces added by `<IntlScope>` in the entry itself or a parent layout. */
function scopedFor(graph: Graph, entry: string): Set<string> {
  const files = [entry];
  for (let dir = dirname(entry); dir.startsWith(LOCALE_ROOT); dir = dirname(dir)) {
    files.push(`${dir}/layout.tsx`);
  }
  const scoped = new Set<string>();
  for (const file of files) {
    for (const m of (graph.sources.get(file) ?? '').matchAll(SCOPE)) {
      for (const ns of m[1]!.matchAll(/['"]([^'"]+)['"]/g)) scoped.add(ns[1]!);
    }
  }
  return scoped;
}

function analyse() {
  const graph = buildGraph();
  const entries = [...graph.sources.keys()].filter(
    (f) => f.startsWith(`${LOCALE_ROOT}/`) && ENTRY.test(basename(f)),
  );
  const perEntry = new Map(entries.map((e) => [e, clientModulesFrom(graph, e)]));
  const allClient = new Set([...perEntry.values()].flatMap((s) => [...s]));
  return { graph, entries, perEntry, allClient };
}

describe('client message namespaces (#2227)', () => {
  const { graph, entries, perEntry, allClient } = analyse();
  const root = new Set<string>(ROOT_CLIENT_NAMESPACES);

  it('every route provides each namespace its client components use', () => {
    expect(entries.length).toBeGreaterThan(100);
    const missing: string[] = [];
    for (const entry of entries) {
      const available = new Set([...root, ...scopedFor(graph, entry)]);
      const lacking = new Set<string>();
      for (const file of perEntry.get(entry)!) {
        for (const ns of namespacesUsed(graph.sources.get(file)!)) {
          if (!available.has(ns)) lacking.add(ns);
        }
      }
      if (lacking.size > 0) missing.push(`${entry} → ${[...lacking].sort().join(', ')}`);
    }
    expect(missing).toEqual([]);
  });

  it('the root list holds only namespaces client code uses, all in the catalog', () => {
    const catalog = JSON.parse(readFileSync(join(ROOT, 'messages/no.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    const used = new Set([...allClient].flatMap((f) => namespacesUsed(graph.sources.get(f)!)));
    expect({
      rootButUnused: [...root].filter((ns) => !used.has(ns)),
      usedButNotInCatalog: [...used].filter((ns) => !(ns in catalog)),
    }).toEqual({ rootButUnused: [], usedButNotInCatalog: [] });
  });

  it('client modules name a literal namespace and never read the whole catalog', () => {
    const offenders: string[] = [];
    for (const file of allClient) {
      const text = graph.sources.get(file)!;
      const calls = [...text.matchAll(ANY_T)].length;
      if (calls > namespacesUsed(text).length) offenders.push(`${file}: useTranslations without a literal namespace`);
      if (file !== MESSAGES_READER && /useMessages\(/.test(text)) offenders.push(`${file}: useMessages`);
    }
    expect(offenders).toEqual([]);
  });

  it('pickMessages keeps only the named top-level namespaces', () => {
    const catalog = { a: { x: '1' }, b: { y: '2' }, c: 'z' };
    expect(pickMessages(catalog, ['a', 'c'])).toEqual({ a: { x: '1' }, c: 'z' });
  });
});
