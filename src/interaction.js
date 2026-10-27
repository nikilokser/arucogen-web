import { DEFAULT_FRAME } from './coordinates.js';

export function exportFilename(name, extension) {
  let base = name.trim().replace(/\.(svg|png|txt)$/i, '').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '-').replace(/^[.\s-]+|[.\s-]+$/g, '').slice(0, 100);
  if (!base) base = 'aruco-map';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base)) base = `map-${base}`;
  return `${base}.${extension}`;
}

export function moveOnGrid(marker, delta, grid) {
  const result = {};
  for (const axis of ['x', 'y']) {
    const step = axis === 'x' ? grid.stepX : grid.stepY;
    const paper = axis === 'x' ? grid.width : grid.height;
    const limit = Math.max(0, (paper - marker.length) / 2);
    const frame = grid.frame || DEFAULT_FRAME;
    const origin = axis === 'x' ? frame.originX : frame.originY;
    const direction = axis === 'x' ? frame.directionX : frame.directionY;
    const edges = [(-limit - origin) * direction, (limit - origin) * direction];
    const min = Math.min(...edges), max = Math.max(...edges);
    const lower = grid.snap ? Math.ceil(min / step - 1e-12) * step : min;
    const upper = grid.snap ? Math.floor(max / step + 1e-12) * step : max;
    const proposed = marker[axis] + delta[axis];
    const value = grid.snap ? Math.round(proposed / step) * step : proposed;
    result[axis] = Number(Math.max(min, Math.min(max, lower <= upper ? Math.max(lower, Math.min(upper, value)) : proposed)).toPrecision(12));
    if (Object.is(result[axis], -0)) result[axis] = 0;
  }
  return result;
}
