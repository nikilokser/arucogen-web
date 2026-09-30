import { DICTIONARIES } from './dictionary.js';

// Web adaptation of GeBondar/aruco_map_generator. See upstream/ORIGIN.md.
export const FIELDS = ['id', 'length', 'x', 'y', 'z', 'rot_z', 'rot_y', 'rot_x'];
export const DEFAULT_SETTINGS = { width: 2000, height: 2000, scale: 1000 };
export const MAX_MARKERS = 1000;
export const DEFAULT_DICTIONARY = 'DICT_4X4_50';
export const DICTIONARY_NAMES = Object.keys(DICTIONARIES);
const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

export function getDictionary(name = DEFAULT_DICTIONARY) {
  if (!Object.hasOwn(DICTIONARIES, name)) throw new Error(`Неизвестный словарь: ${name}.`);
  return DICTIONARIES[name];
}

export function getMarkerMatrix(id, name = DEFAULT_DICTIONARY) {
  const dictionary = getDictionary(name);
  if (!Number.isInteger(id) || id < 0 || id >= dictionary.count) throw new Error(`ID должен быть от 0 до ${dictionary.count - 1}.`);
  const size = dictionary.markerSize;
  const bits = BigInt(`0x${dictionary.markers[id]}`).toString(2).padStart(size * size, '0');
  return Array.from({ length: size + 2 }, (_, y) => Array.from({ length: size + 2 }, (_, x) =>
    x === 0 || y === 0 || x === size + 1 || y === size + 1 ? 0 : Number(bits[(y - 1) * size + x - 1])));
}

export function dictionaryFromText(text, fallback = DEFAULT_DICTIONARY) {
  const match = text.match(/^\s*#\s*dictionary:\s*(\S+)\s*$/im);
  const name = match ? match[1].toUpperCase() : fallback;
  getDictionary(name);
  return name;
}

export function validateMarker(marker, label = 'Маркер', dictionary = DEFAULT_DICTIONARY) {
  const maxId = getDictionary(dictionary).count - 1;
  if (!FIELDS.every(field => typeof marker[field] === 'number' && Number.isFinite(marker[field]))) {
    throw new Error(`${label}: все восемь значений должны быть конечными числами.`);
  }
  if (!Number.isInteger(marker.id) || marker.id < 0 || marker.id > maxId) {
    throw new Error(`${label}: ID должен быть целым числом от 0 до ${maxId} для ${dictionary}.`);
  }
  if (marker.length <= 0) throw new Error(`${label}: размер должен быть больше нуля.`);
  if (Math.max(Math.abs(marker.x), Math.abs(marker.y), marker.length) > 1e6) {
    throw new Error(`${label}: координаты и размер не должны превышать 1 000 000 м.`);
  }
  return marker;
}

export function validateMap(markers, dictionary = DEFAULT_DICTIONARY) {
  if (!Array.isArray(markers) || !markers.length) throw new Error('Добавьте хотя бы один маркер.');
  if (markers.length > MAX_MARKERS) throw new Error(`Допускается не более ${MAX_MARKERS} маркеров.`);
  markers.forEach((marker, i) => validateMarker(marker, `Строка ${i + 1}`, dictionary));
  return markers;
}

export function parseMap(text, dictionary = DEFAULT_DICTIONARY) {
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
    markers.push(validateMarker(marker, label, dictionary));
    if (markers.length > MAX_MARKERS) throw new Error(`${label}: допускается не более ${MAX_MARKERS} маркеров.`);
  }
  return validateMap(markers, dictionary);
}

export function serializeMap(markers, dictionary = DEFAULT_DICTIONARY) {
  validateMap(markers, dictionary);
  return `# dictionary: ${dictionary}\n# ${FIELDS.join(' ')}\n` + markers.map(marker => FIELDS.map(field => marker[field]).join('\t')).join('\n') + '\n';
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
  const result = { width, height, scale };
  if (settings.dictionary !== undefined) { getDictionary(settings.dictionary); result.dictionary = settings.dictionary; }
  if (settings.paperWidth !== undefined || settings.paperHeight !== undefined) {
    if (![settings.paperWidth, settings.paperHeight].every(n => Number.isFinite(n) && n > 0 && n <= 1e6)) {
      throw new Error('Ширина и длина поля для печати должны быть больше нуля.');
    }
    if (Math.round(settings.paperWidth * scale) !== width || Math.round(settings.paperHeight * scale) !== height) {
      throw new Error('Размер холста не соответствует полю для печати и разрешению.');
    }
    result.paperWidth = settings.paperWidth;
    result.paperHeight = settings.paperHeight;
  }
  return result;
}

export function markerRects(id, dictionary = DEFAULT_DICTIONARY) {
  const image = getMarkerMatrix(id, dictionary);
  const size = image.length;
  const visited = Array.from({ length: size }, () => Array(size).fill(false));
  const rectangles = [];
  // Same greedy black-rectangle grouping as the upstream SVG script, at cell resolution.
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (image[y][x] !== 0 || visited[y][x]) continue;
    let width = 1;
    let height = 1;
    while (x + width < size && image[y][x + width] === 0 && !visited[y][x + width]) width++;
    while (y + height < size && Array.from({ length: width }, (_, k) => k)
      .every(k => image[y + height][x + k] === 0 && !visited[y + height][x + k])) height++;
    for (let i = y; i < y + height; i++) for (let j = x; j < x + width; j++) visited[i][j] = true;
    rectangles.push({ x, y, width, height });
  }
  return rectangles;
}

export function markerBox(marker, settings) {
  const { width, height } = renderDimensions(settings);
  const size = marker.length * settings.scale;
  return { x: width / 2 + marker.x * settings.scale - size / 2,
    y: height / 2 - marker.y * settings.scale - size / 2, size };
}

export function renderDimensions(settings) {
  // Physical geometry must not inherit integer pixel rounding used by Canvas.
  return {
    width: settings.paperWidth !== undefined ? Number((settings.paperWidth * settings.scale).toPrecision(15)) : settings.width,
    height: settings.paperHeight !== undefined ? Number((settings.paperHeight * settings.scale).toPrecision(15)) : settings.height,
  };
}

export function generateSvg(markers, settings) {
  const dictionary = settings.dictionary || DEFAULT_DICTIONARY;
  validateMap(markers, dictionary);
  validateSettings(settings);
  const { width, height } = renderDimensions(settings);
  const cells = getDictionary(dictionary).markerSize + 2;
  const groups = markers.map(marker => {
    const box = markerBox(marker, settings);
    const rectangles = markerRects(marker.id, dictionary).map(rect =>
      `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}"/>`).join('');
    return `<g data-marker-id="${marker.id}" transform="translate(${box.x} ${box.y}) scale(${box.size / cells})"><rect width="${cells}" height="${cells}" fill="white"/><g fill="black">${rectangles}</g></g>`;
  }).join('\n');
  const svgWidth = settings.paperWidth ? `${Number((settings.paperWidth * 1000).toPrecision(12))}mm` : width;
  const svgHeight = settings.paperHeight ? `${Number((settings.paperHeight * 1000).toPrecision(12))}mm` : height;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${width} ${height}">\n<title>ArUco map — ${dictionary}</title>\n<desc>Web fork of GeBondar/aruco_map_generator: https://github.com/GeBondar/aruco_map_generator</desc>\n<rect width="${width}" height="${height}" fill="white"/>\n${groups}\n</svg>`;
}

export function mapWarnings(markers, settings) {
  const warnings = [];
  const { width, height } = renderDimensions(settings);
  const boxes = markers.map(marker => markerBox(marker, settings));
  const clipped = markers.filter((_, i) => {
    const { x, y, size } = boxes[i];
    return x < 0 || y < 0 || x + size > width || y + size > height;
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
  const minPixels = (getDictionary(settings.dictionary).markerSize + 2) * 3;
  if (boxes.some(box => box.size < minPixels)) warnings.push(`В PNG есть маркеры меньше ${minPixels} пикселей: увеличьте разрешение для надёжного распознавания.`);
  return warnings;
}
