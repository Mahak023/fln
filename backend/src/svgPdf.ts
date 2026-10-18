// Draws the printable question artwork straight into a PDF page.
//
// The artwork in frontend/public/assets/svg/questions is deliberately plain
// (validateSvgMarkup rejects scripts, external references and foreignObject).
// So instead of opening a headless browser to rasterise it, this reads the few
// shapes it uses and draws them as PDF vector paths: nothing is executed, the
// result is sharp at any print size, and it is fast.
//
// It is strict on purpose. A shape or attribute it does not understand throws
// UnsupportedSvgError, so a new kind of artwork fails loudly the day someone
// adds it, instead of printing a worksheet with a missing or wrong picture.

import { PDFPage, LineCapStyle, rgb } from 'pdf-lib';
import { validateSvgMarkup } from './svgAssetCatalog';

export class UnsupportedSvgError extends Error {}

export interface SvgShape {
  /** Path data in the viewBox coordinate system (y down), already spelled out by normalizePathData. */
  d: string;
  fill: boolean;
  stroke: boolean;
  strokeWidth: number;
}

export interface ParsedSvg {
  viewBox: { minX: number; minY: number; width: number; height: number };
  shapes: SvgShape[];
}

interface Style { fill: string; stroke: string; strokeWidth: number }

const GRAPHICS = new Set(['path', 'circle', 'ellipse', 'rect']);
const KNOWN_TAGS = new Set(['svg', 'g', ...GRAPHICS]);
const KNOWN_ATTRS = new Set([
  'xmlns', 'viewBox', 'width', 'height', 'role', 'aria-label', 'class', 'id',
  'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
  'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y',
]);

function num(value: string | undefined, what: string, fallback?: number): number {
  if (value === undefined) {
    if (fallback !== undefined) return fallback;
    throw new UnsupportedSvgError(`missing ${what}`);
  }
  const n = Number(value);
  if (!Number.isFinite(n)) throw new UnsupportedSvgError(`${what} is not a number: ${value}`);
  return n;
}

function attrsOf(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([A-Za-z_:][\w:.-]*)\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  let consumed = '';
  while ((m = re.exec(source))) {
    out[m[1]] = m[2];
    consumed += m[0];
  }
  // Anything left that is not whitespace was an attribute we could not read
  // (single quotes, no quotes, a bare flag).
  if (source.replace(re, '').replace(/[\s/]/g, '').length > 0) {
    throw new UnsupportedSvgError(`unreadable attributes: ${source.trim().slice(0, 60)}`);
  }
  for (const name of Object.keys(out)) {
    if (!KNOWN_ATTRS.has(name)) throw new UnsupportedSvgError(`attribute not supported: ${name}`);
  }
  return out;
}

function circleToPath(cx: number, cy: number, rx: number, ry: number): string {
  return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0z`;
}

function rectToPath(x: number, y: number, w: number, h: number, rx: number, ry: number): string {
  rx = Math.min(rx, w / 2);
  ry = Math.min(ry, h / 2);
  if (rx <= 0 || ry <= 0) return `M${x} ${y}h${w}v${h}h${-w}z`;
  return `M${x + rx} ${y}h${w - 2 * rx}a${rx} ${ry} 0 0 1 ${rx} ${ry}v${h - 2 * ry}`
    + `a${rx} ${ry} 0 0 1 ${-rx} ${ry}h${-(w - 2 * rx)}a${rx} ${ry} 0 0 1 ${-rx} ${-ry}`
    + `v${-(h - 2 * ry)}a${rx} ${ry} 0 0 1 ${rx} ${-ry}z`;
}

function paintOf(value: string, what: string): string {
  const v = value.trim().toLowerCase();
  if (v === 'none') return 'none';
  if (v === '#111' || v === '#111111' || v === '#000' || v === '#000000' || v === 'black' || v === 'currentcolor') return 'ink';
  throw new UnsupportedSvgError(`${what} colour not supported: ${value}`);
}

export function parseSimpleSvg(svg: string): ParsedSvg {
  const invalid = validateSvgMarkup(svg);
  if (invalid) throw new UnsupportedSvgError(invalid);

  const body = svg.replace(/<!--[\s\S]*?-->/g, '');
  const tagRe = /<(\/?)([A-Za-z][\w:-]*)([^>]*)>/g;
  const shapes: SvgShape[] = [];
  const stack: Style[] = [];
  let viewBox: ParsedSvg['viewBox'] | null = null;
  let m: RegExpExecArray | null;

  while ((m = tagRe.exec(body))) {
    const closing = m[1] === '/';
    const tag = m[2];
    if (!KNOWN_TAGS.has(tag)) throw new UnsupportedSvgError(`element not supported: <${tag}>`);
    if (closing) {
      stack.pop();
      continue;
    }
    const selfClosing = /\/\s*$/.test(m[3]);
    const attrs = attrsOf(m[3]);
    const parent = stack[stack.length - 1] ?? { fill: 'ink', stroke: 'none', strokeWidth: 1 };
    const style: Style = {
      fill: attrs.fill !== undefined ? paintOf(attrs.fill, 'fill') : parent.fill,
      stroke: attrs.stroke !== undefined ? paintOf(attrs.stroke, 'stroke') : parent.stroke,
      strokeWidth: attrs['stroke-width'] !== undefined ? num(attrs['stroke-width'], 'stroke-width') : parent.strokeWidth,
    };

    if (tag === 'svg') {
      const vb = (attrs.viewBox ?? '').trim().split(/[\s,]+/).map(Number);
      if (vb.length !== 4 || vb.some(v => !Number.isFinite(v)) || vb[2] <= 0 || vb[3] <= 0) {
        throw new UnsupportedSvgError('svg needs a usable viewBox');
      }
      viewBox = { minX: vb[0], minY: vb[1], width: vb[2], height: vb[3] };
    } else if (GRAPHICS.has(tag)) {
      let d: string;
      if (tag === 'path') {
        if (!attrs.d) throw new UnsupportedSvgError('path without d');
        d = attrs.d;
      } else if (tag === 'circle') {
        const r = num(attrs.r, 'circle r');
        d = circleToPath(num(attrs.cx, 'cx', 0), num(attrs.cy, 'cy', 0), r, r);
      } else if (tag === 'ellipse') {
        d = circleToPath(num(attrs.cx, 'cx', 0), num(attrs.cy, 'cy', 0), num(attrs.rx, 'ellipse rx'), num(attrs.ry, 'ellipse ry'));
      } else {
        const rxRaw = attrs.rx !== undefined ? num(attrs.rx, 'rx') : undefined;
        const ryRaw = attrs.ry !== undefined ? num(attrs.ry, 'ry') : undefined;
        const rx = rxRaw ?? ryRaw ?? 0;
        const ry = ryRaw ?? rxRaw ?? 0;
        d = rectToPath(num(attrs.x, 'x', 0), num(attrs.y, 'y', 0), num(attrs.width, 'rect width'), num(attrs.height, 'rect height'), rx, ry);
      }
      shapes.push({ d: normalizePathData(d), fill: style.fill === 'ink', stroke: style.stroke === 'ink', strokeWidth: style.strokeWidth });
    }
    if (!selfClosing) stack.push(style);
  }
  if (!viewBox) throw new UnsupportedSvgError('no <svg> element');
  if (shapes.length === 0) throw new UnsupportedSvgError('no drawable shapes');
  return { viewBox, shapes };
}


const PARAMS: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;

/**
 * Rewrite path data with every number and flag separated by a space.
 *
 * SVG lets an arc's two flags run into the next number ("a14 14 0 100-28" means
 * "a14 14 0 1 0 0 -28"), and the PDF library reads that wrongly: a circle came
 * out as a small leaf. Spelling the data out removes the ambiguity. Repeated
 * parameter groups ("l1 2 3 4") become one command each, and anything that is
 * not a known path command throws.
 */
export function normalizePathData(d: string): string {
  const out: string[] = [];
  let i = 0;
  const skip = () => { while (i < d.length && /[\s,]/.test(d[i])) i++; };
  const readNumber = (): string => {
    skip();
    const m = NUMBER.exec(d.slice(i));
    if (!m) throw new UnsupportedSvgError(`bad number in path near: ${d.slice(i, i + 12)}`);
    i += m[0].length;
    return String(Number(m[0]));
  };
  const readFlag = (): string => {
    skip();
    if (d[i] !== '0' && d[i] !== '1') throw new UnsupportedSvgError(`bad arc flag in path near: ${d.slice(i, i + 12)}`);
    return d[i++];
  };
  skip();
  while (i < d.length) {
    const cmd = d[i++];
    const upper = cmd.toUpperCase();
    if (!(upper in PARAMS)) throw new UnsupportedSvgError(`path command not supported: ${cmd}`);
    if (upper === 'Z') { out.push(cmd); skip(); continue; }
    let first = true;
    do {
      let command = cmd;
      // After the first pair, extra pairs of M/m are implicit lineto commands.
      if (!first && upper === 'M') command = cmd === 'M' ? 'L' : 'l';
      const nums: string[] = [];
      for (let k = 0; k < PARAMS[upper]; k++) {
        nums.push(upper === 'A' && (k === 3 || k === 4) ? readFlag() : readNumber());
      }
      out.push(`${command} ${nums.join(' ')}`);
      first = false;
      skip();
    } while (i < d.length && /[+\-.\d]/.test(d[i]));
  }
  return out.join(' ');
}

const INK = rgb(0.067, 0.067, 0.067);

/**
 * Draw an artwork inside a square whose top-left corner is (x, yTop), `size`
 * points wide. PDF y grows upward, so the square covers yTop - size .. yTop.
 */
export function drawSimpleSvg(page: PDFPage, parsed: ParsedSvg, x: number, yTop: number, size: number): void {
  const scale = size / Math.max(parsed.viewBox.width, parsed.viewBox.height);
  const offsetX = x - parsed.viewBox.minX * scale;
  const offsetY = yTop + parsed.viewBox.minY * scale;
  for (const shape of parsed.shapes) {
    page.drawSvgPath(shape.d, {
      x: offsetX,
      y: offsetY,
      scale,
      color: shape.fill ? INK : undefined,
      borderColor: shape.stroke ? INK : undefined,
      borderWidth: shape.stroke ? shape.strokeWidth * scale : 0,
      borderLineCap: LineCapStyle.Round,
    });
  }
}
