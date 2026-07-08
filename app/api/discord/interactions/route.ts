import { NextResponse, type NextRequest } from 'next/server';
import { after } from 'next/server';
import {
  executeAction,
  isTimestampFresh,
  parseCustomId,
  verifyDiscordSignature,
  type GitHubClient,
} from '@/lib/loops/discordActions';

// Discord-knappene (#1124): interactions-endepunktet for toveis loop-styring.
//
// Offentlig rute med vilje (app/api/* er unntatt auth-porten i proxy.ts) —
// porten her er Discords ed25519-signatur over `timestamp + rå body`, pluss
// eier-allowlist på Discord-bruker-ID. Uverifiserbare kall får 401 og når
// ALDRI GitHub-klienten.
//
// Discord krever svar innen 3 sekunder. GitHub-kjeden for merge (PR-info →
// check-runs → evt. ready-for-review → merge) kan bruke lenger tid på kald
// start, så vi svarer umiddelbart med deferred (type 5) og leverer resultatet
// som follow-up via interaction-webhooken i after() — samme mønster som
// game-home bruker for revalidering etter render.
//
// Miljø (Vercel env): DISCORD_PUBLIC_KEY (hex fra Developer Portal),
// DISCORD_OWNER_ID (eierens bruker-ID), GITHUB_LOOP_PAT (fine-grained,
// kun dette repoet, Issues RW + Pull requests RW + Actions RO). Actions RO
// trengs for å lese CI-status (merge-knappen sjekker ci.yml-workflow-runen) —
// Checks finnes IKKE som fine-grained-permission, så check-runs kan ikke leses.
// Tokens logges aldri.

export const maxDuration = 60;

const LOG_PREFIX = 'api/discord/interactions';

// Discord interaction-typer og svar-typer (numeriske per API-kontrakten).
const PING = 1;
const MESSAGE_COMPONENT = 3;
const PONG = 1;
const CHANNEL_MESSAGE = 4;
const DEFERRED_CHANNEL_MESSAGE = 5;
const EPHEMERAL = 64;

type Interaction = {
  type: number;
  application_id?: string;
  token?: string;
  data?: { custom_id?: string };
  member?: { user?: { id?: string } };
  user?: { id?: string };
};

function githubClient(pat: string): GitHubClient {
  const headers = {
    Authorization: `Bearer ${pat}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  };
  return {
    async rest(method, path, body) {
      const res = await fetch(`https://api.github.com${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: res.status, json: await res.json().catch(() => null) };
    },
    async graphql(query, variables) {
      const res = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers,
        body: JSON.stringify({ query, variables }),
      });
      return { status: res.status, json: await res.json().catch(() => null) };
    },
  };
}

export async function POST(request: NextRequest) {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  const ownerId = process.env.DISCORD_OWNER_ID;
  const pat = process.env.GITHUB_LOOP_PAT;
  if (!publicKey || !ownerId || !pat) {
    console.error(`[${LOG_PREFIX}] mangler env (DISCORD_PUBLIC_KEY/DISCORD_OWNER_ID/GITHUB_LOOP_PAT)`);
    return new NextResponse('Not configured', { status: 500 });
  }

  // Signaturen er over RÅ bytes — les teksten før noen parsing.
  const rawBody = await request.text();
  const signature = request.headers.get('x-signature-ed25519');
  const timestamp = request.headers.get('x-signature-timestamp');
  if (
    !signature ||
    !timestamp ||
    !isTimestampFresh(timestamp) ||
    !verifyDiscordSignature(publicKey, signature, timestamp, rawBody)
  ) {
    return new NextResponse('Invalid signature', { status: 401 });
  }

  let interaction: Interaction;
  try {
    interaction = JSON.parse(rawBody) as Interaction;
  } catch {
    return new NextResponse('Bad payload', { status: 400 });
  }

  // Discords endepunkt-validering: PING → PONG.
  if (interaction.type === PING) {
    return NextResponse.json({ type: PONG });
  }

  if (interaction.type !== MESSAGE_COMPONENT) {
    return NextResponse.json({
      type: CHANNEL_MESSAGE,
      data: { content: 'Ustøttet interaksjonstype.', flags: EPHEMERAL },
    });
  }

  const userId = interaction.member?.user?.id ?? interaction.user?.id;
  if (userId !== ownerId) {
    console.warn(`[${LOG_PREFIX}] avvist knappetrykk fra ikke-eier`);
    return NextResponse.json({
      type: CHANNEL_MESSAGE,
      data: { content: 'Kun eieren kan styre loopene.', flags: EPHEMERAL },
    });
  }

  const action = parseCustomId(interaction.data?.custom_id ?? '');
  if (!action) {
    return NextResponse.json({
      type: CHANNEL_MESSAGE,
      data: { content: 'Ukjent knapp — si fra i chatten.', flags: EPHEMERAL },
    });
  }

  const followUpUrl = `https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}`;
  const gh = githubClient(pat);

  after(async () => {
    let content: string;
    try {
      content = await executeAction(action, gh);
    } catch (err) {
      console.error(`[${LOG_PREFIX}] handling feilet`, err);
      content = 'Noe gikk galt under utføringen — sjekk Vercel-loggene (api/discord/interactions).';
    }
    const res = await fetch(followUpUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    }).catch((err) => {
      console.error(`[${LOG_PREFIX}] follow-up til Discord feilet`, err);
      return null;
    });
    if (res && !res.ok) {
      console.error(`[${LOG_PREFIX}] follow-up fikk HTTP ${res.status}`);
    }
  });

  // Umiddelbart «tenker…»-svar innen 3-sekunders-fristen; resultatet kommer
  // som follow-up fra after()-arbeidet over.
  return NextResponse.json({ type: DEFERRED_CHANNEL_MESSAGE });
}
