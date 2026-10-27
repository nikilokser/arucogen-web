import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_FRAME, toWorld, fromWorld, validateFrame, frameFromText } from '../src/coordinates.js';
import { markerBox, serializeMap } from '../src/core.js';
import { moveOnGrid } from '../src/interaction.js';
const frame = { originX: -1, originY: 1, directionX: 1, directionY: -1 };
test('top-left origin and downward Y preserve physical placement across coordinate conversion', () => {
  const marker = { id: 1, length: .2, x: -.4, y: .4, z: 2, rot_x: 0, rot_y: 0, rot_z: 0 };
  const converted = { ...marker, ...fromWorld(marker, frame) };
  assert.deepEqual({ x: converted.x, y: converted.y }, { x: .6, y: .6 });
  assert.deepEqual(toWorld(converted, frame), { x: -.4, y: .4 });
  const settings = { width: 2000, height: 2000, scale: 1000 };
  assert.deepEqual(markerBox(converted, { ...settings, frame }), markerBox(marker, settings));
  const text = serializeMap([converted], undefined, frame);
  assert.deepEqual(frameFromText(text), frame);
  assert.deepEqual(frameFromText('1 .2 0 0 0 0 0 0'), DEFAULT_FRAME);
});
test('inverted axes and custom origins round trip and reject malformed metadata', () => {
  const custom = { originX: .25, originY: -.5, directionX: -1, directionY: 1 };
  assert.deepEqual(fromWorld(toWorld({ x: .4, y: .8 }, custom), custom), { x: .4, y: .8 });
  assert.throws(() => validateFrame({ ...frame, directionX: 0 }));
  assert.throws(() => frameFromText('# coordinates: {bad}'));
  assert.throws(() => frameFromText('# coordinates: {"originX":0}'));
});
test('drag bounds and snapping follow origin and axis directions', () => {
  const grid = { width: 2, height: 2, stepX: .2, stepY: .25, snap: true, frame };
  assert.deepEqual(moveOnGrid({ x: .6, y: .6, length: .2 }, { x: .2, y: .2 }, grid), { x: .8, y: .75 });
  assert.deepEqual(moveOnGrid({ x: .6, y: .6, length: .2 }, { x: -10, y: 10 }, grid), { x: .2, y: 1.75 });
});
