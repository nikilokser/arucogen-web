import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseMap, serializeMap, validateSettings, generateSvg, markerRects, mapWarnings } from '../src/core.js';

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
