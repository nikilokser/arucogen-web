import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseMap, serializeMap, validateSettings, generateSvg, markerRects, mapWarnings, getDictionary, getMarkerMatrix, dictionaryFromText } from '../src/core.js';

test('TXT preserves eight values, comments, whitespace and scientific notation', () => {
  assert.deepEqual(parseMap('\uFEFF  # comment\n1 0.185 8e-1 0.152 2 90 -10 3\n'),
    [{ id: 1, length: 0.185, x: 0.8, y: 0.152, z: 2, rot_z: 90, rot_y: -10, rot_x: 3 }]);
});
test('TXT round trip preserves unused 3D values and rotations', () => {
  const rows = parseMap('49 0.03 -0.8 -0.075 1.2 30 -20 10');
  assert.deepEqual(parseMap(serializeMap(rows)), rows);
});
test('original example has 13 markers and retains the tiny marker', async () => {
  const rows = parseMap(await readFile(new URL('../public/examples/aruco_map.txt', import.meta.url), 'utf8'));
  assert.equal(rows.length, 13);
  assert.deepEqual(rows.find(m => m.id === 10), { id: 10, length: 0.015, x: 0, y: -0.123, z: 0, rot_z: 0, rot_y: 0, rot_x: 0 });
});
test('invalid rows report actual line; zero size, bad IDs and nonfinite values are rejected', () => {
  for (const row of ['50 .1 0 0 0 0 0 0', '-1 .1 0 0 0 0 0 0', '1.5 .1 0 0 0 0 0 0', '1 0 0 0 0 0 0 0', '1 -.1 0 0 0 0 0 0', '1 .1 Infinity 0 0 0 0 0', '1 .1 nope 0 0 0 0 0', '1 .1 0 0', '1 .1 0 0 0 0 0 0 extra']) {
    assert.throws(() => parseMap('# header\n\n' + row), /Строка 3/);
  }
  assert.throws(() => parseMap('# only comments'), /маркер/);
});
test('settings reject excessive PNG dimensions, invalid dimensions and scale', () => {
  assert.deepEqual(validateSettings({ width: 2000, height: 2000, scale: 1000 }), { width: 2000, height: 2000, scale: 1000 });
  for (const settings of [{ width: 0, height: 20, scale: 1 }, { width: 20.5, height: 20, scale: 1 }, { width: 2000, height: 2000, scale: 0 }, { width: 9000, height: 9000, scale: 1000 }]) {
    assert.throws(() => validateSettings(settings));
  }
});
test('SVG places marker center using upstream coordinates and excludes preview decorations', () => {
  const svg = generateSvg(parseMap('1 .185 .8 .152 0 0 0 0'), { width: 2000, height: 2000, scale: 1000 });
  assert.match(svg, /viewBox="0 0 2000 2000"/);
  assert.match(svg, /translate\(1707\.5 755\.5\)/);
  assert.match(svg, /scale\(30\.833333/);
  assert.doesNotMatch(svg, /<text|<pattern|<line|<script/);
  assert.match(svg, /GeBondar\/aruco_map_generator/);
});
test('marker rectangles reconstruct the known OpenCV marker 0', () => {
  const grid = Array.from({ length: 6 }, () => Array(6).fill(1));
  for (const { x, y, width, height } of markerRects(0)) {
    for (let i = y; i < y + height; i++) for (let j = x; j < x + width; j++) grid[i][j] = 0;
  }
  assert.deepEqual(grid.map(row => row.join('')), ['000000', '010110', '001010', '000110', '000100', '000000']);
});
test('out-of-canvas markers, overlaps and ignored rotations are visible warnings', () => {
  const rows = parseMap('1 .2 1 0 0 0 0 0\n2 .2 1 0 1 90 0 0');
  const warnings = mapWarnings(rows, { width: 1000, height: 1000, scale: 1000 });
  assert.ok(warnings.some(s => s.includes('холст')));
  assert.ok(warnings.some(s => s.includes('перекры')));
  assert.ok(warnings.some(s => s.includes('3D')));
});

test('different dictionaries accept their own ID ranges and render correct grid size', () => {
  const rows = parseMap('99 .18 0 0 0 0 0 0', 'DICT_5X5_100');
  assert.equal(getDictionary('DICT_5X5_100').count, 100);
  assert.equal(getMarkerMatrix(99, 'DICT_5X5_100').length, 7);
  assert.throws(() => parseMap('99 .18 0 0 0 0 0 0'));
  assert.throws(() => getDictionary('DICT_FAKE'));
  assert.throws(() => parseMap('30 .18 0 0 0 0 0 0', 'DICT_APRILTAG_16H5'));
  assert.match(generateSvg(rows, { width: 1000, height: 1000, scale: 1000, dictionary: 'DICT_5X5_100' }), /DICT_5X5_100/);
});
test('TXT records dictionary as a comment and legacy files retain selected dictionary', () => {
  const rows = parseMap('99 .18 0 0 0 10 20 30', 'DICT_5X5_100');
  const text = serializeMap(rows, 'DICT_5X5_100');
  assert.equal(dictionaryFromText(text), 'DICT_5X5_100');
  assert.deepEqual(parseMap(text, dictionaryFromText(text)), rows);
  assert.equal(dictionaryFromText('# old map\n1 .1 0 0 0 0 0 0', 'DICT_7X7_50'), 'DICT_7X7_50');
});
test('physical SVG dimensions preserve paper size while viewBox preserves pixel geometry', () => {
  const svg = generateSvg(parseMap('0 .03 0 0 0 0 0 0'), { width: 2100, height: 2970, scale: 10000, paperWidth: .21, paperHeight: .297 });
  assert.match(svg, /width="210mm" height="297mm" viewBox="0 0 2100 2970"/);
});
test('physical SVG geometry is exact even when PNG pixels round paper dimensions', () => {
  const rows = parseMap('0 .1 0 0 0 0 0 0');
  const lowResolution = generateSvg(rows, { width: 2, height: 3, scale: 10, paperWidth: .21, paperHeight: .297 });
  assert.match(lowResolution, /viewBox="0 0 2\.1 2\.97"/);
  const fractional = generateSvg(rows, { width: 210, height: 297, scale: 1000, paperWidth: .2104, paperHeight: .2974 });
  assert.match(fractional, /viewBox="0 0 210\.4 297\.4"/);
  const match = fractional.match(/translate\(([^ ]+) ([^)]+)\)/);
  assert.ok(Math.abs(Number(match[1]) - 55.2) < 1e-10);
  assert.ok(Math.abs(Number(match[2]) - 98.7) < 1e-10);
});
