// lib/agent-monitor/morning-mail.ts
//
// Renders the daily monitoring summary mail. Returns null if there's nothing
// to report (quiet night = no mail). HTML follows the Tørny mail brand
// (forest green + champagne + linen) — same template as lib/mail/inviteNotification.ts.

export type FindingRow = {
  time: string;       // "HH:MM"
  summary: string;    // short Norwegian description
  ref: string;        // commit SHA or PR number
  refType: 'commit' | 'pr';
};

export type MorningMailInput = {
  fixed: FindingRow[];
  pending: FindingRow[];
  needsJudgment: FindingRow[];
  totalErrorsLogged: number;
  totalUsersAffected: number;
};

export type RenderedMail = {
  subject: string;
  html: string;
  text: string;
};

const REPO = 'jdlarssen/golf-app';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function refUrl(row: FindingRow): string {
  return row.refType === 'commit'
    ? `https://github.com/${REPO}/commit/${row.ref}`
    : `https://github.com/${REPO}/pull/${row.ref}`;
}

function refLabel(row: FindingRow): string {
  return row.refType === 'commit' ? 'commit' : `PR #${row.ref}`;
}

function renderSection(title: string, emoji: string, rows: FindingRow[]): string {
  if (rows.length === 0) return '';
  const items = rows
    .map(
      (r) =>
        `<li style="margin:0 0 8px;line-height:1.5;"><strong>${escapeHtml(r.time)}</strong> — ${escapeHtml(r.summary)} (<a href="${refUrl(r)}" style="color:#1B4332;">${refLabel(r)}</a>)</li>`,
    )
    .join('');
  return `<h3 style="font-family:Georgia,'Times New Roman',serif;font-size:18px;margin:24px 0 12px;color:#1A1813;">${emoji} ${escapeHtml(title)}</h3><ul style="margin:0;padding-left:20px;font-size:15px;">${items}</ul>`;
}

function renderTextSection(title: string, emoji: string, rows: FindingRow[]): string {
  if (rows.length === 0) return '';
  const lines = rows.map((r) => `- ${r.time} — ${r.summary} (${refUrl(r)})`).join('\n');
  return `\n${emoji} ${title}:\n${lines}\n`;
}

export function renderMorningMail(input: MorningMailInput): RenderedMail | null {
  const total = input.fixed.length + input.pending.length + input.needsJudgment.length;
  if (total === 0) return null;

  const subject = `Nattlig oppsummering — ${input.fixed.length} fixet, ${input.pending.length} venter på deg`;

  const html = `<!DOCTYPE html><html lang="nb">
<head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#F8F6F0;font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#1A1813;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#F8F6F0;">
    <tr><td align="center" style="padding:48px 16px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;padding:32px;">
        <tr><td>
          <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.1;margin:0 0 8px;color:#1B4332;">Tørny Agent</h1>
          <p style="font-size:13px;color:#5C5347;margin:0 0 24px;">God morgen!</p>
          ${renderSection('Jeg fikset (auto-push)', '🤖', input.fixed)}
          ${renderSection('Venter på din godkjenning (PR)', '⏳', input.pending)}
          ${renderSection('Trenger din vurdering (ikke fixet)', '🤔', input.needsJudgment)}
          <p style="font-size:13px;color:#5C5347;line-height:1.5;margin:32px 0 0;border-top:1px solid #E6E2D6;padding-top:24px;">
            ${input.totalErrorsLogged} errors logget i går, ${input.totalUsersAffected} brukere påvirket.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text =
    `Tørny Agent — ${subject}\n` +
    renderTextSection('Jeg fikset (auto-push)', '🤖', input.fixed) +
    renderTextSection('Venter på din godkjenning (PR)', '⏳', input.pending) +
    renderTextSection('Trenger din vurdering (ikke fixet)', '🤔', input.needsJudgment) +
    `\n${input.totalErrorsLogged} errors logget i går, ${input.totalUsersAffected} brukere påvirket.\n`;

  return { subject, html, text };
}
