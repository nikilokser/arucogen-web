import test from 'node:test';
import assert from 'node:assert/strict';
import { exportFilename, moveOnGrid } from '../src/interaction.js';

test('export names retain Unicode and strip extensions and unsafe path characters', () => {
  assert.equal(exportFilename('Карта полигона.svg', 'png'), 'Карта полигона.png');
  assert.equal(exportFilename('../Поле: 1/2', 'txt'), 'Поле- 1-2.txt');
  assert.equal(exportFilename('   ', 'svg'), 'aruco-map.svg');
  assert.equal(exportFilename('CON', 'png'), 'map-CON.png');
});
const grid = { snap: true, stepX: .2, stepY: .25, width: 2, height: 2 };
test('drag snaps marker centers to independent X/Y grid intervals', () => {
  assert.deepEqual(moveOnGrid({ x: -.4, y: .4, length: .185 }, { x: .22, y: -.19 }, grid), { x: -.2, y: .25 });
  assert.deepEqual(moveOnGrid({ x: -.2, y: .25, length: .185 }, { x: .07, y: .03 }, { ...grid, snap: false }), { x: -.13, y: .28 });
});
test('drag keeps the whole marker within paper on available grid nodes', () => {
  assert.deepEqual(moveOnGrid({ x: 0, y: 0, length: .185 }, { x: 10, y: -10 }, grid), { x: .8, y: -.75 });
  assert.deepEqual(moveOnGrid({ x: 0, y: 0, length: .185 }, { x: 10, y: -10 }, { ...grid, snap: false }), { x: .9075, y: -.9075 });
});
