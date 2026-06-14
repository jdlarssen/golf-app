// Sends a "Resultatet er klart" mail to a player after admin avslutter spillet.
//
// Best-effort: callers should wrap a Promise.allSettled() around per-player
// sends so a single failure doesn't block the rest, and the action itself
// never aborts on mail errors — the game-finished state lives in the DB and
// the leaderboard is reachable in-app even without the mail.
//
// Locale-aware (i18n Fase M, #594): each recipient's body line renders from the
// mail catalog for their `users.locale`. The mode-specific copy (placement,
// plurals, match result) lives as single ICU messages per branch, so word order,
// ordinals (1. plass / 1st place) and plurals localize without code-side
// string assembly. HTML and plain-text share one message per branch — the tag
// callbacks either wrap in <strong> (HTML) or pass the chunk through (text).

import { Resend } from 'resend';
import { getMailTranslator, resolveMailLocale, mailUrl } from './i18n';

function resolveFromEmail(): string {
  const raw = process.env.RESEND_FROM_EMAIL?.trim();
  if (!raw) return 'Tørny <noreply@tornygolf.no>';
  if (raw.includes('<') && raw.includes('>')) return raw;
  return `Tørny <${raw}>`;
}

function getClient(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error('RESEND_API_KEY is not set');
  }
  return new Resend(key);
}

/**
 * Mode-spesifikk personalisering av mail-body.
 *
 *   - `kind: 'stableford'` + `variant: 'solo'` legger inn en personlig
 *     plassering + poeng-linje («Du endte på 3. plass med 32 poeng») så hver
 *     spiller får et eget resultat-spoiler i innboksen.
 *   - `kind: 'stableford'` + `variant: 'team'` (par-stableford / 4BBB) bruker
 *     lag-plassering + lag-poeng + partnernavn slik at begge på laget får
 *     samme spoiler-tone selv om de hadde ulik individuell prestasjon.
 *   - `kind: 'singles_matchplay'` (1v1 net matchplay) viser matchresultatet
 *     per spiller — «Du vant 3&2 over Per», «Du tapte 1up mot Per», eller
 *     «Matchen mot Per endte uavgjort (AS)». Begge spillerne får speilet copy.
 *   - `kind: 'solo_strokeplay'` (klassisk slagspill) viser personlig
 *     plassering + netto-total + brutto-total («Du endte på 2. plass av 8 med
 *     72 slag netto (78 brutto)»). 1. får gratulasjon, 2-3 får «Solid
 *     plassering», 4+ får nøytral tone — samme cascade som stableford-grenen.
 *   - `kind: 'best_ball'` (eller udefinert) bruker dagens nøytrale
 *     copy («Runden er ferdig — leaderboard er åpen») fordi lag-vinneren
 *     ikke nødvendigvis er én spesifikk spiller å adressere.
 */
export type GameFinishedNotificationMode =
  | { kind: 'best_ball' }
  | {
      kind: 'stableford';
      variant: 'solo';
      /** Spillerens slutt-plassering (1, 2, 3, ...). */
      rank: number;
      /** Spillerens totale stableford-poeng. */
      totalPoints: number;
      /** Totalt antall spillere i turneringen — gir kontekst til plasseringen. */
      totalPlayers: number;
    }
  | {
      kind: 'stableford';
      variant: 'team';
      /** Lagets slutt-plassering (1, 2, 3, ...). */
      teamRank: number;
      /** Lagets totale stableford-poeng (sum av MAX-poeng per hull). */
      teamTotalPoints: number;
      /**
       * Partnerens fornavn (eller hele navnet hvis fornavnet ikke kan parses).
       * `null` hvis spilleren står alene på laget (defensiv — par-stableford
       * tvinger 2 per lag i payload-validatoren, men vi forsvarer mail-laget).
       */
      teamPartnerName: string | null;
      /** Totalt antall lag i turneringen — gir kontekst til plasseringen. */
      totalTeams: number;
    }
  | {
      kind: 'singles_matchplay';
      /**
       * Hvordan matchen endte SETT FRA mottakeren:
       *   - `'won'`  — mottakeren vant matchen
       *   - `'lost'` — mottakeren tapte matchen
       *   - `'tied'` — matchen endte uavgjort (AS — all square etter 18 hull)
       */
      matchResult: 'won' | 'lost' | 'tied';
      /**
       * Golf-formatert resultat-streng: «3&2» (mat-em før 18), «1up» (etter
       * 18 hull med margin), eller «AS» (uavgjort etter 18). Speiler
       * `MatchplayMatchResult.formatted` fra `lib/scoring/modes/types.ts`.
       */
      formattedResult: string;
      /**
       * Motspillerens fornavn (eller hele navnet hvis fornavnet ikke kan
       * parses). `null` hvis motspillerens navn mangler — da bruker mailen
       * et nøytralt «motstanderen»-fallback i stedet for å fyre med «null».
       */
      opponentName: string | null;
      /**
       * Hvilken side mottakeren spilte på (1 eller 2). Lagres for symmetri
       * med scoring-laget, men brukes ikke direkte i mail-copy-en —
       * matchResult er nok for å rendre riktig linje.
       */
      selfSide: 1 | 2;
    }
  | {
      kind: 'solo_strokeplay';
      /** Spillerens slutt-plassering (1, 2, 3, ...). */
      rank: number;
      /** Spillerens totale netto-slag for runden (sum av spilte hull). */
      totalNetStrokes: number;
      /**
       * Spillerens totale gross-slag for runden (sum av spilte hull). Vises
       * som side-note ved siden av netto-totalen («72 slag netto (78 brutto)»)
       * slik at mottakeren ser begge tall uten å åpne leaderboardet.
       */
      totalGrossStrokes: number;
      /** Totalt antall spillere i turneringen — gir kontekst til plasseringen. */
      totalPlayers: number;
    }
  | {
      kind: 'texas_scramble';
      /** Lagets slutt-plassering (1, 2, 3, ...). */
      teamRank: number;
      /** Lagets totale netto-slag (sum av spilte hull). */
      teamTotalNet: number;
      /** Lagets totale gross-slag (sum av spilte hull). Vises som side-note. */
      teamTotalGross: number;
      /**
       * Fornavnene til de andre lag-medlemmene (alle utenom mottakeren).
       * Tom array hvis mottakeren var alene på laget (defensiv —
       * validator håndhever team_size 2|4 ved publish). Brukes til
       * «Du spilte med X, Y, Z»-linjen.
       */
      teamPartnerNames: string[];
      /** Totalt antall lag i turneringen — gir kontekst til plasseringen. */
      totalTeams: number;
    };

export type GameFinishedNotificationParams = {
  to: string;
  /** First name of the recipient, for "Hei <name>!" salutation. Pass null if unknown. */
  playerFirstName: string | null;
  /** The game's display name, used in subject + body. */
  gameName: string;
  /** Game id — used to build the leaderboard URL. */
  gameId: string;
  /**
   * Spillmodus-spesifikk personalisering. Når udefinert behandles mailen som
   * best-ball-netto (dagens copy). Stableford-grenen krever rank/poeng per
   * mottaker — kallsteder må derfor regne ut leaderboard først.
   */
  mode?: GameFinishedNotificationMode;
  /** Mottakerens locale (#594). Default `no`. */
  locale?: string | null;
};

type MailTranslator = ReturnType<typeof getMailTranslator>;

// Tag callbacks for `t.markup`. HTML wraps each emphasised chunk in <strong>;
// plain text passes the chunk through unchanged. The same per-branch ICU message
// therefore renders both variants.
function strongTags() {
  const s = (chunks: string) => `<strong>${chunks}</strong>`;
  return { g: s, p: s, pts: s, r: s, o: s, pa: s };
}
function plainTags() {
  const id = (chunks: string) => chunks;
  return { g: id, p: id, pts: id, r: id, o: id, pa: id };
}

/** rank → celebration tone key: 1 = win, 2/3 = solid, otherwise none. */
function celebrationKind(rank: number): 'win' | 'solid' | 'none' {
  if (rank === 1) return 'win';
  if (rank === 2 || rank === 3) return 'solid';
  return 'none';
}

/**
 * Komma-separert navneliste med en locale-spesifikk konjunksjon før siste
 * element. Tom array → tom streng.
 *   ['Bjørn']                     → 'Bjørn'
 *   ['Bjørn','Carla'], 'og'       → 'Bjørn og Carla'
 *   ['Bjørn','Carla','Dag'], 'og' → 'Bjørn, Carla og Dag'
 */
function formatPartnerList(names: string[], conjunction: string): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  const last = names[names.length - 1];
  const rest = names.slice(0, -1).join(', ');
  return `${rest} ${conjunction} ${last}`;
}

/**
 * Builds the mode-specific body line. `asHtml` toggles between the <strong>-
 * wrapped HTML rendering and the plain-text rendering of the same ICU message.
 */
function buildBodyLine(
  t: MailTranslator,
  mode: GameFinishedNotificationMode | undefined,
  gameName: string,
  asHtml: boolean,
): string {
  const tags = asHtml ? strongTags() : plainTags();
  const esc = asHtml ? escapeHtml : (s: string) => s;

  if (!mode || mode.kind === 'best_ball') {
    return t.markup('gameFinished.bodyBestBall', { ...tags, game: esc(gameName) });
  }

  if (mode.kind === 'stableford' && mode.variant === 'solo') {
    return t.markup('gameFinished.bodyStablefordSolo', {
      ...tags,
      game: esc(gameName),
      rank: mode.rank,
      total: mode.totalPlayers,
      points: mode.totalPoints,
      kind: celebrationKind(mode.rank),
    });
  }

  if (mode.kind === 'stableford' && mode.variant === 'team') {
    return t.markup('gameFinished.bodyStablefordTeam', {
      ...tags,
      game: esc(gameName),
      rank: mode.teamRank,
      total: mode.totalTeams,
      points: mode.teamTotalPoints,
      kind: celebrationKind(mode.teamRank),
      hasPartner: mode.teamPartnerName ? 'yes' : 'no',
      partnerName: esc(mode.teamPartnerName ?? ''),
    });
  }

  if (mode.kind === 'singles_matchplay') {
    const opponent = mode.opponentName ?? t('gameFinished.opponentFallback');
    return t.markup('gameFinished.bodyMatchplay', {
      ...tags,
      game: esc(gameName),
      res: mode.matchResult,
      result: esc(mode.formattedResult),
      opp: esc(opponent),
    });
  }

  if (mode.kind === 'solo_strokeplay') {
    return t.markup('gameFinished.bodySoloStrokeplay', {
      ...tags,
      game: esc(gameName),
      rank: mode.rank,
      total: mode.totalPlayers,
      net: mode.totalNetStrokes,
      gross: mode.totalGrossStrokes,
      kind: celebrationKind(mode.rank),
    });
  }

  // texas_scramble
  const conjunction = t('gameFinished.listConjunction');
  const partnerList = formatPartnerList(mode.teamPartnerNames, conjunction);
  return t.markup('gameFinished.bodyTexasScramble', {
    ...tags,
    game: esc(gameName),
    rank: mode.teamRank,
    total: mode.totalTeams,
    net: mode.teamTotalNet,
    gross: mode.teamTotalGross,
    kind: celebrationKind(mode.teamRank),
    hasPartners: mode.teamPartnerNames.length > 0 ? 'yes' : 'no',
    partnerList: esc(partnerList),
  });
}

export async function sendGameFinishedNotification(
  params: GameFinishedNotificationParams,
): Promise<void> {
  const { to, playerFirstName, gameName, gameId, mode, locale } = params;
  const loc = resolveMailLocale(locale);
  const t = getMailTranslator(locale);

  const subject = t('gameFinished.subject', { gameName });
  const leaderboardUrl = mailUrl(locale, `/games/${gameId}/leaderboard`);
  const salutation = playerFirstName
    ? t('gameFinished.salutationNamed', { name: playerFirstName })
    : t('gameFinished.salutationGeneric');

  const bodyLine = buildBodyLine(t, mode, gameName, true);
  const bodyLineText = buildBodyLine(t, mode, gameName, false);

  const footerHtml = t.markup('gameFinished.footerHtml', {
    link: (chunks) =>
      `<a href="${mailUrl(locale, '')}" style="color:#1B4332;text-decoration:underline;">${chunks}</a>`,
  });

  const html = `<!DOCTYPE html><html lang="${loc}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#F8F6F0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1A1813;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#F8F6F0;">
    <tr>
      <td align="center" style="padding:48px 16px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:480px;background:#ffffff;border-radius:12px;padding:32px;">
          <tr><td>
            <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:32px;line-height:1.1;margin:0 0 8px;color:#1B4332;letter-spacing:-0.01em;">
              Tørny<span style="color:#C9A961;">.</span>
            </h1>
            <p style="font-size:13px;color:#4A3F30;margin:0 0 32px;">
              ${t('common.tagline')}
            </p>
            <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.2;margin:0 0 16px;color:#1A1813;">
              ${t('gameFinished.heading')}
            </h2>
            <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
              ${escapeHtml(salutation)}
            </p>
            <p style="font-size:16px;line-height:1.5;margin:0 0 24px;">
              ${bodyLine}
            </p>
            <div style="margin:32px 0;">
              <a href="${leaderboardUrl}" style="display:inline-block;background:#1B4332;color:#F8F6F0;text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:600;font-size:15px;">
                ${t('gameFinished.viewLeaderboard')}
              </a>
            </div>
            <p style="font-size:13px;color:#4A3F30;line-height:1.5;margin:32px 0 0;border-top:1px solid #E6E2D6;padding-top:24px;">
              ${footerHtml}
            </p>
          </td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text =
    `${subject}\n\n` +
    `${salutation}\n\n` +
    `${bodyLineText}\n\n` +
    `${t('gameFinished.viewLeaderboard')}: ${leaderboardUrl}\n\n` +
    `${t('common.footerTagline')}\n`;

  const resend = getClient();
  const result = await resend.emails.send({
    from: resolveFromEmail(),
    to,
    subject,
    html,
    text,
  });

  if (result.error) {
    throw new Error(
      `Resend send failed: ${result.error.message ?? JSON.stringify(result.error)}`,
    );
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
