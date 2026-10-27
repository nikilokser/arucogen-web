export const DEFAULT_FRAME = { originX: 0, originY: 0, directionX: 1, directionY: 1 };
const coordinateNumber = value => Number(value.toPrecision(14)) || 0;

export function validateFrame(frame) {
  if (!frame || ![frame.originX, frame.originY].every(n => Number.isFinite(n) && Math.abs(n) <= 1e6) || ![frame.directionX, frame.directionY].every(n => n === 1 || n === -1)) {
    throw new Error('Начало координат должно быть конечным числом в пределах ±1 000 000 м; направления осей — 1 или −1.');
  }
  return { originX: frame.originX, originY: frame.originY, directionX: frame.directionX, directionY: frame.directionY };
}
export function toWorld(point, frame = DEFAULT_FRAME) {
  return { x: coordinateNumber(frame.originX + frame.directionX * point.x), y: coordinateNumber(frame.originY + frame.directionY * point.y) };
}
export function fromWorld(point, frame = DEFAULT_FRAME) {
  return { x: coordinateNumber((point.x - frame.originX) * frame.directionX), y: coordinateNumber((point.y - frame.originY) * frame.directionY) };
}
export function frameFromText(text, fallback = DEFAULT_FRAME) {
  const match = text.match(/^\s*#\s*coordinates:\s*(.*)$/im);
  if (!match) return validateFrame(fallback);
  let frame;
  try { frame = JSON.parse(match[1]); }
  catch { throw new Error('Некорректная строка # coordinates в TXT.'); }
  return validateFrame(frame);
}
