import test from 'node:test';
import assert from 'node:assert/strict';
import { generateGrid } from '../src/grid.js';
const base = { columns: 3, rows: 2, length: .1, idStart: 10, idEnd: 20, mode: 'span', spanX: .8, spanY: .6, stepX: .4, stepY: .6 };
test('span mode centers a row-major grid and uses inclusive ID range', () => {
  const grid = generateGrid(base);
  assert.deepEqual(grid.markers.map(m => [m.id, m.x, m.y]), [[10,-.4,.3],[11,0,.3],[12,.4,.3],[13,-.4,-.3],[14,0,-.3],[15,.4,-.3]]);
  assert.equal(grid.stepX, .4);
  assert.equal(grid.stepY, .6);
  assert.equal(grid.boundsWidth, .9);
  assert.ok(Math.abs(grid.boundsHeight - .7) < 1e-12);
});
test('step mode computes extreme-center distance; same settings produce identical positions', () => {
  const grid = generateGrid({ ...base, mode: 'step' });
  assert.deepEqual(grid.markers, generateGrid(base).markers);
  assert.equal(grid.spanX, .8);
  assert.equal(grid.spanY, .6);
});
test('one row or column is centered and ignores its distance input', () => {
  const grid = generateGrid({ ...base, columns: 1, rows: 1, spanX: NaN, spanY: NaN, idStart: 49, idEnd: 49 });
  assert.deepEqual(grid.markers.map(m => [m.id,m.x,m.y]), [[49,0,0]]);
  assert.equal(grid.spanX, 0);
  assert.equal(grid.stepY, 0);
  assert.equal(grid.boundsWidth, .1);
});
test('grid rejects insufficient IDs, invalid counts, ID range and overlapping markers', () => {
  for (const options of [{ idEnd: 14 }, { columns: 0 }, { rows: 1.5 }, { idStart: -1 }, { idEnd: 50 }, { idStart: 20, idEnd: 10 }, { spanX: .1 }, { spanX: 0 }, { length: 0 }, { columns: 40, rows: 40 }, { mode: 'bad' }]) {
    assert.throws(() => generateGrid({ ...base, ...options }));
  }
});
test('grid uses chosen dictionary ID bounds and verifies whole markers fit paper', () => {
  const grid = generateGrid({ ...base, idStart: 90, idEnd: 99 }, 'DICT_5X5_100', { width: 1, height: 1 });
  assert.equal(grid.markers.at(-1).id, 95);
  assert.throws(() => generateGrid(base, undefined, { width: .85, height: 1 }), /поле/);
  assert.doesNotThrow(() => generateGrid(base, undefined, { width: .9, height: .7 }));
});
