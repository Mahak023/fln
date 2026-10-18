import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { UnsupportedSvgError, drawSimpleSvg, normalizePathData, parseSimpleSvg } from '../src/svgPdf';
import { listThemes, readVariantSvg } from '../src/svgAssetCatalog';

const wrap = (inner: string, attrs = 'viewBox="0 0 64 64"') =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${inner}</svg>`;

test('every artwork file in the manifest can be read and has something to draw', () => {
  const variants = listThemes().flatMap(t => t.variants);
  assert.ok(variants.length >= 40, 'the manifest lists the artwork library');
  for (const v of variants) {
    const markup = readVariantSvg(v);
    assert.ok(markup, `${v.file} is readable`);
    const parsed = parseSimpleSvg(markup!);
    assert.ok(parsed.shapes.length > 0, `${v.file} has shapes`);
    assert.deepEqual(parsed.viewBox, { minX: 0, minY: 0, width: 64, height: 64 });
  }
});

test('inherited style from a group, and the shapes it turns into', () => {
  const p = parseSimpleSvg(wrap(
    '<g fill="none" stroke="#111" stroke-width="2.5"><circle cx="10" cy="10" r="5"/><rect x="1" y="2" width="8" height="6" rx="2"/>'
    + '<ellipse cx="30" cy="30" rx="6" ry="3"/><path d="M0 0h5v5z" fill="#111"/></g>'));
  assert.equal(p.shapes.length, 4);
  assert.deepEqual(p.shapes.map(s => [s.fill, s.stroke, s.strokeWidth]),
    [[false, true, 2.5], [false, true, 2.5], [false, true, 2.5], [true, true, 2.5]]);
  assert.equal(p.shapes[0].d, 'M 5 10 a 5 5 0 1 0 10 0 a 5 5 0 1 0 -10 0 z');
});

test('shapes with no style attributes follow the SVG defaults: filled, no outline', () => {
  const p = parseSimpleSvg(wrap('<rect x="0" y="0" width="4" height="4"/>'));
  assert.deepEqual([p.shapes[0].fill, p.shapes[0].stroke], [true, false]);
});

test('anything it does not understand is refused, never skipped', () => {
  const refused: [string, string][] = [
    ['text', wrap('<text x="1" y="1">hi</text>')],
    ['use', wrap('<use href="#a"/>')],
    ['image', wrap('<image width="4" height="4"/>')],
    ['text beside a valid shape (must not be skipped)', wrap('<path d="M0 0h5v5z"/><text x="1" y="1">hi</text>')],
    ['a gradient beside a valid shape', wrap('<defs><linearGradient id="g"/></defs><path d="M0 0h5v5z"/>')],
    ['a group with a clip path', wrap('<g><clipPath id="c"/><path d="M0 0h5v5z"/></g>')],
    ['a transform', wrap('<g transform="rotate(5)"><path d="M0 0h1"/></g>')],
    ['a style attribute', wrap('<path d="M0 0h1" style="fill:red"/>')],
    ['a colour that is not ink', wrap('<path d="M0 0h1" stroke="red"/>')],
    ['single quoted attributes', wrap("<path d='M0 0h1'/>")],
    ['a path command that does not exist', wrap('<path d="M0 0X5 5"/>')],
    ['no viewBox', '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1"/></svg>'],
    ['nothing to draw', wrap('<g></g>')],
    ['a script', wrap('<script>alert(1)</script><path d="M0 0h1"/>')],
    ['an event handler', wrap('<path d="M0 0h1" onclick="x()"/>')],
    ['an external reference', wrap('<path d="M0 0h1" href="https://example.org/x"/>')],
    ['not an svg', '<html></html>'],
  ];
  for (const [what, svg] of refused) {
    assert.throws(() => parseSimpleSvg(svg), UnsupportedSvgError, `${what} must be refused`);
  }
});

test('normalizePathData spells out compact arcs and implicit repeats', () => {
  assert.equal(normalizePathData('M32 34a14 14 0 100-28 14 14 0 000 28z'),
    'M 32 34 a 14 14 0 1 0 0 -28 a 14 14 0 0 0 0 28 z');
  assert.equal(normalizePathData('M10,10 20,20 30 30l1 2 3 4h5v-6H9V8Z'),
    'M 10 10 L 20 20 L 30 30 l 1 2 l 3 4 h 5 v -6 H 9 V 8 Z');
  assert.equal(normalizePathData('M0 0c1.5-2 .5.5 3 4'), 'M 0 0 c 1.5 -2 0.5 0.5 3 4');
  for (const bad of ['M0 0X1', 'M0', 'a1 1 0 2 0 5 5', 'M0 0 L']) {
    assert.throws(() => normalizePathData(bad), UnsupportedSvgError, bad);
  }
});

test('drawing puts vector content on the page', async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([200, 200]);
  const before = doc.context.enumerateIndirectObjects().length;
  const variant = listThemes()[0].variants[0];
  drawSimpleSvg(page, parseSimpleSvg(readVariantSvg(variant)!), 20, 180, 60);
  const bytes = await doc.save();
  assert.ok(bytes.length > 0);
  assert.ok(doc.context.enumerateIndirectObjects().length >= before);
});

test('readVariantSvg refuses names that could leave the artwork folder', () => {
  for (const file of ['../manifest.json', '../../package.json', 'sub/dir.svg', '/etc/passwd', 'a..svg.txt', 'x.png']) {
    assert.equal(readVariantSvg({ variantId: 'x', file }), null, file);
  }
  assert.equal(readVariantSvg({ variantId: 'x', file: 'does-not-exist.svg' }), null);
});
