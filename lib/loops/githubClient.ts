// GitHub-klienten for loop-flatene i appen (#1305): Discord-endepunktet
// (app/api/discord/interactions/route.ts) og ✅-markøren fra /admin/lanseringer
// (lib/loops/launchMarker.ts). Global fetch + Bearer-PAT; tokenet logges aldri.
//
// `timeoutMs` er valgfri: endepunktets merge-kjede har ingen grense per kall
// (maxDuration på ruta tar det), mens server-actionen ikke skal holde igjen
// redirecten lenger enn nødvendig.

import type { GitHubClient } from './discordActions';

export function githubClient(pat: string, opts: { timeoutMs?: number } = {}): GitHubClient {
  const headers = {
    Authorization: `Bearer ${pat}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  };
  const signal = () =>
    opts.timeoutMs === undefined ? undefined : AbortSignal.timeout(opts.timeoutMs);
  return {
    async rest(method, path, body) {
      const res = await fetch(`https://api.github.com${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: signal(),
      });
      return { status: res.status, json: await res.json().catch(() => null) };
    },
    async graphql(query, variables) {
      const res = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers,
        body: JSON.stringify({ query, variables }),
        signal: signal(),
      });
      return { status: res.status, json: await res.json().catch(() => null) };
    },
  };
}
