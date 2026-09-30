import { MARKERS } from './dictionary.js';

// Web adaptation of GeBondar/aruco_map_generator. See upstream/ORIGIN.md.
export const FIELDS = ['id', 'length', 'x', 'y', 'z', 'rot_z', 'rot_y', 'rot_x'];
export const DEFAULT_SETTINGS = { width: 2000, height: 2000, scale: 1000 };
export const MAX_MARKERS = 1000;
const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

export function validateMarker(marker, label = 'Маркер') {
  if (!FIELDS.every(field => typeof marker[field] === 'number' && Number.isFinite(marker[field]))) {
    throw new Error(`${label}: все восемь значений должны быть конечными числами.`);
  }
  if (!Number.isInteger(marker.id) || marker.id < 0 || marker.id > 49) {
    throw new Error(`${label}: ID должен быть целым числом от 0 до 49.`);
  }
  if (marker.length <= 0) throw new Error(`${label}: размер должен быть больше нуля.`);
  if (Math.max(Math.abs(marker.x), Math.abs(marker.y), marker.length) > 1e6) {
    throw new Error(`${label}: координаты и размер не должны превышать 1 000 000 м.`);
  }
  return marker;
}

export function validateMap(markers) {
  if (!Array.isArray(markers) || !markers.length) throw new Error('Добавьте хотя бы один маркер.');
  if (markers.length > MAX_MARKERS) throw new Error(`Допускается не более ${MAX_MARKERS} маркеров.`);
  markers.forEach((marker, i) => validateMarker(marker, `Строка ${i + 1}`));
  return markers;
}

export function parseMap(text) {
  const markers = [];
  for (const [index, line] of text.replace(/^\uFEFF/, '').split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const values = trimmed.split(/\s+/);
    const label = `Строка ${index + 1}`;
    if (values.length !== 8) throw new Error(`${label}: нужны 8 столбцов — ${FIELDS.join(' ')}.`);
    if (values.some(value => !DECIMAL.test(value))) {
      throw new Error(`${label}: используйте числа с точкой в качестве десятичного разделителя.`);
    }
    const marker = Object.fromEntries(FIELDS.map((field, i) => [field, Number(values[i]) || 0]));
    markers.push(validateMarker(marker, label));
    if (markers.length > MAX_MARKERS) throw new Error(`${label}: допускается не более ${MAX_MARKERS} маркеров.`);
  }
  return validateMap(markers);
}

export function serializeMap(markers) {
  validateMap(markers);
  return `# ${FIELDS.join(' ')}\n` + markers.map(marker => FIELDS.map(field => marker[field]).join('\t')).join('\n') + '\n';
}

export function validateSettings(settings) {
  const { width, height, scale } = settings;
  if (![width, height].every(n => Number.isInteger(n) && n >= 1 && n <= 8192)) {
    throw new Error('Ширина и высота: целые числа от 1 до 8192 пикселей.');
  }
  if (width * height > 32_000_000) throw new Error('Площадь холста: не более 32 миллионов пикселей.');
  if (!Number.isFinite(scale) || scale <= 0 || scale > 1e6) {
    throw new Error('Масштаб должен быть больше 0 и не превышать 1 000 000 пикселей на метр.');
  }
  return { width, height, scale };
}

export function markerRects(id) {
  if (!Number.isInteger(id) || id < 0 || id >= MARKERS.length) throw new Error('ID должен быть от 0 до 49.');
  const image = MARKERS[id];
  const visited = Array.from({ length: 6 }, () => Array(6).fill(false));
  const rectangles = [];
  // Same greedy black-rectangle grouping as the upstream SVG script, at cell resolution.
  for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) {
    if (image[y][x] !== 0 || visited[y][x]) continue;
    let width = 1;
    let height = 1;
    while (x + width < 6 && image[y][x + width] === 0 && !visited[y][x + width]) width++;
    while (y + height < 6 && Array.from({ length: width }, (_, k) => k)
      .every(k => image[y + height][x + k] === 0 && !visited[y + height][x + k])) height++;
    for (let i = y; i < y + height; i++) for (let j = x; j < x + width; j++) visited[i][j] = true;
    rectangles.push({ x, y, width, height });
  }
  return rectangles;
}

export function markerBox(marker, settings) {
  const size = marker.length * settings.scale;
  return { x: settings.width / 2 + marker.x * settings.scale - size / 2,
    y: settings.height / 2 - marker.y * settings.scale - size / 2, size };
}

export function generateSvg(markers, settings) {
  validateMap(markers);
  const { width, height } = validateSettings(settings);
  const groups = markers.map(marker => {
    const box = markerBox(marker, settings);
    const rectangles = markerRects(marker.id).map(rect =>
      `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}"/>`).join('');
    return `<g data-marker-id="${marker.id}" transform="translate(${box.x} ${box.y}) scale(${box.size / 6})"><rect width="6" height="6" fill="white"/><g fill="black">${rectangles}</g></g>`;
  }).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n<title>ArUco map — DICT_4X4_50</title>\n<desc>Web fork of GeBondar/aruco_map_generator: https://github.com/GeBondar/aruco_map_generator</desc>\n<rect width="${width}" height="${height}" fill="white"/>\n${groups}\n</svg>`;
}

export function mapWarnings(markers, settings) {
  const warnings = [];
  const boxes = markers.map(marker => markerBox(marker, settings));
  const clipped = markers.filter((_, i) => {
    const { x, y, size } = boxes[i];
    return x < 0 || y < 0 || x + size > settings.width || y + size > settings.height;
  });
  if (clipped.length) warnings.push(`За холст выходят ${clipped.length} маркер(а). При экспорте края будут обрезаны.`);
  let overlaps = false;
  for (let i = 0; i < boxes.length && !overlaps; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (a.x < b.x + b.size && a.x + a.size > b.x && a.y < b.y + b.size && a.y + a.size > b.y) { overlaps = true; break; }
  }
  if (overlaps) warnings.push('Маркеры перекрываются. Измените координаты или размеры для корректного распознавания.');
  if (new Set(markers.map(m => m.id)).size < markers.length) warnings.push('Некоторые ID повторяются: робот не сможет различить одинаковые маркеры.');
  if (markers.some(m => m.z !== 0 || m.rot_z !== 0 || m.rot_y !== 0 || m.rot_x !== 0)) {
    warnings.push('3D-координата z и углы сохранены в TXT, но не применяются к 2D-карте, как в исходном проекте.');
  }
  if (boxes.some(box => box.size < 18)) warnings.push('В PNG есть маркеры меньше 18 пикселей: увеличьте масштаб для надёжного распознавания.');
  return warnings;
}
