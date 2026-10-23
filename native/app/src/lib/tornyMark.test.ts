// #2627: Tørny-merket i appen er en kopi av master-SVG-ene. Type A.
//
// Merket har sitt hjem i `native/assets/icon-master-full-bleed.svg` (#1985).
// Appens vektorkopi (`tornyMark.ts`) står ved siden av, så denne testen leser
// masteren og feiler hvis farger eller mål sporer av (AGENTS felle 4: en regel
// har ett hjem, og to hjem må ha en test som holder dem like).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MARK_SIZE, TORNY_MARK } from './tornyMark';

const MASTER = readFileSync(resolve(__dirname, '../../../assets/icon-master-full-bleed.svg'), 'utf8');
const ICON_ONLY = readFileSync(
  resolve(__dirname, '../../../../docs/design/realized/brand-foundations/assets/brand-mark-icon-only.svg'),
  'utf8',
);

function attrs(svg: string, tag: string, nth = 0): Record<string, string> {
  const element = [...svg.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, 'g'))][nth]?.[1] ?? '';
  return Object.fromEntries([...element.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, k, v]) => [k, v]));
}

/** Ytterkantene til stien: alle koordinatpar etter en kommando. */
function pathBounds(d: string) {
  const xs: number[] = [];
  const ys: number[] = [];
  let x = 0;
  let y = 0;
  for (const [, cmd, args] of d.matchAll(/([MLHVQZ])([^MLHVQZ]*)/g)) {
    const n = args.trim() ? args.trim().split(/[\s,]+/).map(Number) : [];
    if (cmd === 'H') x = n[0];
    else if (cmd === 'V') y = n[0];
    else if (cmd !== 'Z') [x, y] = [n[n.length - 2], n[n.length - 1]];
    xs.push(x);
    ys.push(y);
  }
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
}

describe('TORNY_MARK', () => {
  it('har masterens flate, ball og skygge', () => {
    expect(attrs(MASTER, 'svg').viewBox).toBe(`0 0 ${MARK_SIZE} ${MARK_SIZE}`);
    expect(attrs(MASTER, 'stop', 0)['stop-color']).toBe(TORNY_MARK.tileTop);
    expect(attrs(MASTER, 'stop', 1)['stop-color']).toBe(TORNY_MARK.tileBottom);
    expect(Number(attrs(ICON_ONLY, 'rect').rx)).toBe(TORNY_MARK.tileRadius);

    const ball = attrs(MASTER, 'circle', 0);
    expect([Number(ball.cx), Number(ball.cy), Number(ball.r), ball.fill]).toEqual([
      TORNY_MARK.ball.cx,
      TORNY_MARK.ball.cy,
      TORNY_MARK.ball.r,
      TORNY_MARK.ball.fill,
    ]);
    const shade = attrs(MASTER, 'radialGradient', 0);
    expect([Number(shade.cx), Number(shade.cy), Number(shade.r)]).toEqual([
      TORNY_MARK.ballShade.cx,
      TORNY_MARK.ballShade.cy,
      TORNY_MARK.ballShade.r,
    ]);
    const light = attrs(MASTER, 'radialGradient', 1);
    expect([Number(light.cx), Number(light.cy), Number(light.r)]).toEqual([
      TORNY_MARK.ballLight.cx,
      TORNY_MARK.ballLight.cy,
      TORNY_MARK.ballLight.r,
    ]);

    const shadow = attrs(MASTER, 'ellipse');
    expect([Number(shadow.cx), Number(shadow.cy), Number(shadow.rx), Number(shadow.ry), shadow.fill]).toEqual([
      TORNY_MARK.shadow.cx,
      TORNY_MARK.shadow.cy,
      TORNY_MARK.shadow.rx,
      TORNY_MARK.shadow.ry,
      TORNY_MARK.shadow.fill,
    ]);
  });

  it('har T-en der masterens tekst står: midt på x, på grunnlinja, og ballen hviler på den', () => {
    const text = attrs(MASTER, 'text');
    expect(text.fill).toBe(TORNY_MARK.ink);
    const t = pathBounds(TORNY_MARK.tPath);
    expect((t.left + t.right) / 2).toBeCloseTo(Number(text.x), 0);
    expect(t.bottom).toBeCloseTo(Number(text.y), 2);
    // Ballens underkant ligger på tverrliggeren (masteren lar den gå litt ned i den).
    expect(TORNY_MARK.ball.cy + TORNY_MARK.ball.r).toBeGreaterThanOrEqual(t.top);
    expect(TORNY_MARK.ball.cy + TORNY_MARK.ball.r).toBeLessThan(t.top + 2);
  });
});
