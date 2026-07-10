import { NextResponse, type NextRequest } from 'next/server';
import { after } from 'next/server';
import {
  executeAction,
  isTimestampFresh,
  parseCustomId,
  verifyDiscordSignature,
  type GitHubClient,
  type LanseringDeps,
} from '@/lib/loops/discordActions';
import { getAdminClient } from '@/lib/supabase/admin';
import { publishProductUpdate } from '@/lib/productUpdates/publish';
import { formatMonthLongNb } from '@/lib/format/date';

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
// DISCORD_OWNER_ID (eierens bruker-ID), GITHUB_LOOP_PAT (fine-grained, kun dette
// repoet: Issues RW + Pull requests RW + Actions RO + Contents RW). Actions RO
// leser CI-status (merge-knappen sjekker ci.yml-workflow-runen; Checks finnes
// IKKE som fine-grained-permission, så check-runs kan ikke leses). Contents RW
// trengs for selve mergen (skriver til base-branchen). Tokens logges aldri.
//
// publish_lansering (#1207) trenger ingen nye env-variabler: tavle-kommentaren
// hentes med samme PAT (Issues RW), og publiseringen bruker appens eksisterende
// Supabase service-role via getAdminClient.

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

// Dedupe-vindu for dobbel-tapp på 📣 Publiser: identisk tittel innenfor
// vinduet regnes som allerede publisert.
const DEDUPE_WINDOW_DAYS = 45;

// Inneværende måneds start i Europe/Oslo (samme Intl-mønster som
// previousMonthPeriod i lib/productUpdates/digest.ts — Vercel kjører UTC, så
// lokale Date-gettere er forbudt for Oslo-vinduer). Som i digest-en brukes
// UTC-midnatt for datogrensen; ±2 timers DST-fuzz på månedsskiftet er
// akseptert for en kvitterings-telling.
function osloCurrentMonth(nowMs = Date.now()): { startIso: string; label: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Oslo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date(nowMs));
  const year = Number(parts.find((p) => p.type === 'year')!.value);
  const month = Number(parts.find((p) => p.type === 'month')!.value);
  return {
    startIso: `${year}-${String(month).padStart(2, '0')}-01T00:00:00.000Z`,
    label: formatMonthLongNb(new Date(Date.UTC(year, month - 1, 15))),
  };
}

// DB-avhengighetene for publish_lansering (#1207) — konstrueres kun når den
// knappen faktisk trykkes, så merge-/svar-knappene aldri rører Supabase.
function lanseringDeps(): LanseringDeps {
  const admin = getAdminClient();
  const month = osloCurrentMonth();
  return {
    async findPublisherUserId() {
      const { data } = await admin
        .from('users')
        .select('id')
        .eq('is_admin', true)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle<{ id: string }>();
      return data?.id ?? null;
    },
    async wasRecentlyPublished(title) {
      const since = new Date(Date.now() - DEDUPE_WINDOW_DAYS * 86_400_000).toISOString();
      const { data } = await admin
        .from('product_updates')
        .select('id')
        .eq('title', title)
        .gte('created_at', since)
        .limit(1);
      return (data ?? []).length > 0;
    },
    async publish(input) {
      return publishProductUpdate(input);
    },
    async countPublishedThisMonth() {
      const { count } = await admin
        .from('product_updates')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', month.startIso);
      return count ?? 0;
    },
    monthLabel: () => month.label,
  };
}

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
      const deps = action.kind === 'publish_lansering' ? lanseringDeps() : undefined;
      content = await executeAction(action, gh, deps);
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
