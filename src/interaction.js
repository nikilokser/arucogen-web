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
    const bound = grid.snap ? Math.floor(limit / step + 1e-12) * step : limit;
    const proposed = marker[axis] + delta[axis];
    const value = grid.snap ? Math.round(proposed / step) * step : proposed;
    result[axis] = Number(Math.max(-bound, Math.min(bound, value)).toPrecision(12));
    if (Object.is(result[axis], -0)) result[axis] = 0;
  }
  return result;
}
