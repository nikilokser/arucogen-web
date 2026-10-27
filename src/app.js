import { DEFAULT_SETTINGS, DEFAULT_DICTIONARY, DICTIONARY_NAMES, FIELDS, MAX_MARKERS, parseMap, serializeMap, validateMap, validateSettings, generateSvg, markerBox, mapWarnings, getDictionary, dictionaryFromText, renderDimensions } from './core.js';
import { generateGrid } from './grid.js';
import { exportFilename, moveOnGrid } from './interaction.js';
import { DEFAULT_FRAME, toWorld, fromWorld, validateFrame, frameFromText } from './coordinates.js';
import { EXAMPLE } from './example.js';

const $ = selector => document.querySelector(selector);
const themeButton = $('#theme-toggle');
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const dark = theme === 'dark';
  themeButton.textContent = dark ? '☀ Светлая' : '☾ Тёмная';
  themeButton.setAttribute('aria-label', dark ? 'Включить светлую тему' : 'Включить тёмную тему');
  themeButton.setAttribute('aria-pressed', String(dark));
}
setTheme(document.documentElement.dataset.theme);
themeButton.addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  setTheme(theme);
  try { localStorage.setItem('arucogen-theme', theme); } catch {}
});
const newMap = () => [
  { id: 1, length: .185, x: -.4, y: .4, z: 0, rot_z: 0, rot_y: 0, rot_x: 0 },
  { id: 2, length: .185, x: .4, y: .4, z: 0, rot_z: 0, rot_y: 0, rot_x: 0 },
  { id: 3, length: .185, x: -.4, y: -.4, z: 0, rot_z: 0, rot_y: 0, rot_x: 0 },
  { id: 4, length: .185, x: .4, y: -.4, z: 0, rot_z: 0, rot_y: 0, rot_x: 0 },
];
let markers = newMap();
let settings = { ...DEFAULT_SETTINGS };
let coordinateFrame = { ...DEFAULT_FRAME };
let heightMarker = null;
let zoom = 1;
let sourceDirty = false;
let pngBusy = false;
let notificationTimer;
let placementGrid = { stepX: .1, stepY: .1, snap: true };
let drag = null;
let dragFrame = 0;
const preview = $('#map-preview');
const mapName = $('#map-name');
const controls = { paperWidth: $('#print-width'), paperHeight: $('#print-height'), scale: $('#canvas-scale') };
const dictionarySelect = $('#dictionary-select');
const gridFields = { columns: $('#grid-columns'), rows: $('#grid-rows'), length: $('#grid-length'), idStart: $('#grid-id-start'), idEnd: $('#grid-id-end'), spanX: $('#grid-span-x'), spanY: $('#grid-span-y'), stepX: $('#grid-step-x'), stepY: $('#grid-step-y') };
let gridMode = 'span';
let previousDictionary = DEFAULT_DICTIONARY;
const exportButtons = [$('#export-svg'), $('#export-png'), $('#export-txt')];
const labels = { id: 'ID', length: 'Размер', x: 'X', y: 'Y', z: 'Z' };
const formatMeters = value => Number(value.toPrecision(6)).toLocaleString('ru-RU');

for (const family of ['4X4', '5X5', '6X6', '7X7', 'ARUCO', 'APRILTAG']) {
  const group = document.createElement('optgroup');
  group.label = family === 'ARUCO' ? 'ArUco Original и MIP' : family === 'APRILTAG' ? 'AprilTag' : `ArUco ${family.replace('X', ' × ')}`;
  const names = DICTIONARY_NAMES.filter(name => name.startsWith(`DICT_${family}`));
  if (family.endsWith('X4') || family.endsWith('X5') || family.endsWith('X6') || family.endsWith('X7')) names.sort((a, b) => getDictionary(a).count - getDictionary(b).count);
  for (const name of names) {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = `${name} — ${getDictionary(name).count} меток`;
    group.append(option);
  }
  dictionarySelect.append(group);
}
dictionarySelect.value = DEFAULT_DICTIONARY;

function refreshDictionary() {
  const name = dictionarySelect.value;
  const dictionary = getDictionary(name);
  const maxId = dictionary.count - 1;
  $('#dictionary-badge').textContent = name;
  $('#dictionary-info').textContent = `${dictionary.markerSize} × ${dictionary.markerSize} ячеек + рамка. ID: 0–${maxId}.`;
  $('#marker-range-hint').textContent = `Размер и координаты — в метрах. ID от 0 до ${maxId}.`;
  for (const input of $('#marker-rows').querySelectorAll('input[data-field="id"]')) input.max = maxId;
  if (gridFields.idEnd.valueAsNumber === getDictionary(previousDictionary).count - 1 || gridFields.idEnd.valueAsNumber > maxId) gridFields.idEnd.value = maxId;
  gridFields.idStart.max = maxId;
  gridFields.idEnd.max = maxId;
  previousDictionary = name;
}

function notify(message) {
  clearTimeout(notificationTimer);
  $('#notification').textContent = message;
  $('#notification').hidden = false;
  notificationTimer = setTimeout(() => { $('#notification').hidden = true; }, 4500);
}

function syncSource() {
  $('#txt-source').value = `# dictionary: ${dictionarySelect.value}\n# coordinates: ${JSON.stringify(coordinateFrame)}\n# ${FIELDS.join(' ')}\n` + markers.map(m => FIELDS.map(f => m[f]).join('\t')).join('\n') + '\n';
  sourceDirty = false;
  $('#txt-error').hidden = true;
  $('#txt-state').textContent = 'Все изменения применены';
}

function renderRows() {
  const fragment = document.createDocumentFragment();
  markers.forEach((marker, index) => {
    const row = document.createElement('tr');
    row.dataset.index = index;
    for (const field of ['id', 'length', 'x', 'y', 'z']) {
      const cell = document.createElement('td');
      const input = document.createElement('input');
      input.type = 'number';
      input.value = marker[field];
      input.step = field === 'id' ? '1' : 'any';
      input.inputMode = field === 'id' ? 'numeric' : 'decimal';
      if (field === 'id') { input.min = '0'; input.max = getDictionary(dictionarySelect.value).count - 1; }
      if (field === 'length') input.min = '0.000001';
      input.dataset.field = field;
      input.setAttribute('aria-label', `${labels[field]} маркера, строка ${index + 1}`);
      cell.append(input);
      row.append(cell);
    }
    const deleteCell = document.createElement('td');
    const remove = document.createElement('button');
    remove.className = 'remove-marker';
    remove.type = 'button';
    remove.textContent = '×';
    remove.setAttribute('aria-label', `Удалить маркер ${marker.id}`);
    remove.disabled = markers.length === 1;
    deleteCell.append(remove);
    row.append(deleteCell);
    fragment.append(row);
  });
  $('#marker-rows').replaceChildren(fragment);
  $('#marker-count').textContent = markers.length;
  $('#add-marker').disabled = markers.length >= MAX_MARKERS;
}

function readSettings() {
  const dimensions = Object.fromEntries(Object.entries(controls).map(([field, input]) => [field, input.valueAsNumber]));
  return validateSettings({ ...dimensions, width: Math.round(dimensions.paperWidth * dimensions.scale), height: Math.round(dimensions.paperHeight * dimensions.scale), dictionary: dictionarySelect.value, frame: coordinateFrame });
}

function validState() {
  validateMap(markers, dictionarySelect.value);
  const currentSettings = readSettings();
  if (sourceDirty) throw new Error('Примените изменения TXT, чтобы обновить карту и скачать файл.');
  return currentSettings;
}

function fitSheet() {
  const canvas = $('#preview-canvas');
  const dimensions = renderDimensions(settings);
  const width = Math.max(1, canvas.clientWidth - 128);
  const height = Math.max(1, canvas.clientHeight - 128);
  const factor = Math.min(width / dimensions.width, height / dimensions.height) * zoom;
  const sheetWidth = dimensions.width * factor;
  const sheetHeight = dimensions.height * factor;
  $('#map-sheet').style.width = `${sheetWidth}px`;
  $('#map-sheet').style.height = `${sheetHeight}px`;
  $('#canvas-space').style.width = `${Math.max(canvas.clientWidth, sheetWidth + 128)}px`;
  $('#canvas-space').style.height = `${Math.max(canvas.clientHeight, sheetHeight + 128)}px`;
  $('#zoom-level').textContent = `${Math.round(zoom * 100)}%`;
  $('#zoom-out').disabled = zoom <= .5;
  $('#zoom-in').disabled = zoom >= 3;
  return $('#map-sheet').getBoundingClientRect().width || sheetWidth;
}

function buildOriginGuide(dimensions, origin, unit) {
  const { width, height } = dimensions;
  const outside = origin.x < 0 || origin.y < 0 || origin.x > width || origin.y > height;
  const x = Math.max(0, Math.min(width, origin.x));
  const y = Math.max(0, Math.min(height, origin.y));
  const badgeWidth = outside ? 164 : 112;
  const desiredBadgeX = x > width - (badgeWidth + 14) * unit ? -badgeWidth - 14 : 14;
  const horizontalRoom = Math.max(64, ($('#preview-canvas').clientWidth - width / unit) / 2);
  const badgeX = Math.max(-x / unit - horizontalRoom + 8, Math.min((width - x) / unit + horizontalRoom - badgeWidth - 8, desiredBadgeX));
  const badgeY = y > height - 42 * unit ? -32 : 18;
  const horizontal = origin.x < 0 ? -1 : origin.x > width ? 1 : 0;
  const vertical = origin.y < 0 ? -1 : origin.y > height ? 1 : 0;
  const direction = vertical < 0 ? (horizontal < 0 ? '↖' : horizontal > 0 ? '↗' : '↑') : vertical > 0 ? (horizontal < 0 ? '↙' : horizontal > 0 ? '↘' : '↓') : horizontal < 0 ? '←' : '→';
  const label = outside ? `Начало вне поля ${direction}` : 'Начало · 0, 0';
  const axis = (name, dx, dy, color) => `<line x1="${dx * 12}" y1="${dy * 12}" x2="${dx * 42}" y2="${dy * 42}" stroke="white" stroke-width="7"/><line data-axis="${name.toLowerCase()}" x1="${dx * 12}" y1="${dy * 12}" x2="${dx * 42}" y2="${dy * 42}" stroke="${color}" stroke-width="2.5" marker-end="url(#origin-arrow-${name})"/><text x="${dx * 54}" y="${dy * 54}" text-anchor="middle" dominant-baseline="central" font-size="12" font-weight="700" fill="${color}" stroke="white" stroke-width="4" paint-order="stroke">${name}</text>`;
  const arrows = outside ? '' : axis('X', coordinateFrame.directionX, 0, '#b42318') + axis('Y', 0, -coordinateFrame.directionY, '#087950');
  const point = outside ? '<path d="M 0 -9 L 9 0 L 0 9 L -9 0 Z" fill="#ffdc80" stroke="#735600" stroke-width="2"/>' : '<circle data-origin-point="true" r="8" fill="white" stroke="#0f172a" stroke-width="2"/><path d="M -12 0 H 12 M 0 -12 V 12" fill="none" stroke="#007da6" stroke-width="2"/><circle r="3" fill="#007da6"/>';
  return `<svg class="origin-guide" data-outside="${outside}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}. X ${coordinateFrame.directionX === 1 ? 'вправо' : 'влево'}, Y ${coordinateFrame.directionY === 1 ? 'вверх' : 'вниз'}"><defs><marker id="origin-arrow-X" markerUnits="userSpaceOnUse" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M 0 0 L 7 3.5 L 0 7 Z" fill="#b42318"/></marker><marker id="origin-arrow-Y" markerUnits="userSpaceOnUse" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M 0 0 L 7 3.5 L 0 7 Z" fill="#087950"/></marker></defs><g transform="translate(${x} ${y}) scale(${unit})" font-family="Inter,Arial,sans-serif">${arrows}${point}<g transform="translate(${badgeX} ${badgeY})"><rect width="${badgeWidth}" height="25" rx="6" fill="white" stroke="${outside ? '#a77915' : '#007da6'}" stroke-width="1.5"/><text x="${badgeWidth / 2}" y="16.5" text-anchor="middle" font-size="11" font-weight="600" fill="#0f172a">${label}</text></g></g></svg>`;
}

function renderPreview() {
  const sheetWidth = fitSheet();
  const dimensions = renderDimensions(settings);
  const unit = dimensions.width / sheetWidth;
  const origin = { x: dimensions.width / 2 + coordinateFrame.originX * settings.scale, y: dimensions.height / 2 - coordinateFrame.originY * settings.scale };
  let svg = generateSvg(markers, settings);
  if ($('#show-grid').checked) {
    const visibleStep = step => { const pixels = step * settings.scale; return pixels * 10 ** Math.max(0, Math.ceil(Math.log10(16 * unit / pixels))); };
    const pixelStepX = visibleStep(placementGrid.stepX);
    const pixelStepY = visibleStep(placementGrid.stepY);
    const strokeWidth = .65 * unit;
    const grid = `<defs><pattern id="preview-grid" width="${pixelStepX}" height="${pixelStepY}" patternUnits="userSpaceOnUse" x="${origin.x}" y="${origin.y}"><path d="M ${pixelStepX} 0 H 0 V ${pixelStepY}" fill="none" stroke="#e0f1f7" stroke-width="${strokeWidth}"/></pattern></defs><rect width="${dimensions.width}" height="${dimensions.height}" fill="url(#preview-grid)"/><g stroke="#8dcadd" stroke-width="${unit}" stroke-dasharray="${3 * unit} ${4 * unit}"><line x1="${origin.x}" y1="0" x2="${origin.x}" y2="${dimensions.height}"/><line x1="0" y1="${origin.y}" x2="${dimensions.width}" y2="${origin.y}"/></g>`;
    svg = svg.replace(/(<g data-marker-id=)/, grid + '$1');
  }
  const markerLabels = markers.map((marker, index) => {
    const box = markerBox(marker, settings);
    const x = Math.max(40 * unit, Math.min(dimensions.width - 40 * unit, box.x + box.size / 2));
    const showId = $('#show-labels').checked;
    const belowFits = box.y + box.size + (showId ? 29 : 16) * unit <= dimensions.height;
    const labelY = belowFits ? box.y + box.size + 13 * unit : Math.max(11 * unit, box.y - (showId ? 17 : 4) * unit);
    const idLabel = showId ? `<text x="${x}" y="${labelY}" text-anchor="middle" font-size="${10 * unit}" font-family="Arial,sans-serif" fill="#516984">${marker.id}</text>` : '';
    return idLabel + `<text data-marker-height="${index}" x="${x}" y="${labelY + (showId ? 13 : 0) * unit}" text-anchor="middle" font-size="${10 * unit}" font-family="Arial,sans-serif" fill="#334e68" role="button" tabindex="0" aria-label="Изменить высоту метки ${marker.id}, строка ${index + 1}">Z: ${formatMeters(marker.z)} м</text>`;
  }).join('');
  svg = svg.replace('</svg>', markerLabels + '</svg>');
  // Content is generated exclusively from finite validated numbers and fixed strings.
  preview.innerHTML = svg + buildOriginGuide(dimensions, origin, unit);
  preview.querySelectorAll('[data-marker-id]').forEach((group, index) => {
    group.dataset.markerIndex = index;
    group.setAttribute('tabindex', '0');
    group.setAttribute('role', 'button');
    group.setAttribute('aria-label', `Маркер ${markers[index].id}, строка ${index + 1}. Перемещение стрелками. Высота ${formatMeters(markers[index].z)} м. Enter — изменить высоту`);
    if (drag?.index === index) group.classList.add('dragged-marker');
  });
}

function update() {
  const maxId = getDictionary(dictionarySelect.value).count - 1;
  for (const row of $('#marker-rows').rows) {
    for (const input of row.querySelectorAll('input')) {
      const value = markers[Number(row.dataset.index)][input.dataset.field];
      const invalid = !Number.isFinite(value) || (input.dataset.field === 'id' && (!Number.isInteger(value) || value < 0 || value > maxId)) || (input.dataset.field === 'length' && value <= 0);
      input.setAttribute('aria-invalid', String(invalid));
    }
  }
  try {
    settings = validState();
    $('#validation-error').hidden = true;
    $('#preview-invalid').hidden = true;
    exportButtons.forEach(button => { button.disabled = pngBusy; });
    $('#canvas-dimensions').textContent = `${settings.width} × ${settings.height} px`;
    $('#physical-size').textContent = `Поле для печати: ${formatMeters(settings.paperWidth)} × ${formatMeters(settings.paperHeight)} м. PNG: ${settings.width} × ${settings.height} px.`;
    const spanX = Math.max(...markers.map(m => m.x)) - Math.min(...markers.map(m => m.x));
    const spanY = Math.max(...markers.map(m => m.y)) - Math.min(...markers.map(m => m.y));
    const boundsWidth = Math.max(...markers.map(m => m.x + m.length / 2)) - Math.min(...markers.map(m => m.x - m.length / 2));
    const boundsHeight = Math.max(...markers.map(m => m.y + m.length / 2)) - Math.min(...markers.map(m => m.y - m.length / 2));
    $('#map-measurements').replaceChildren(...[
      `Между крайними центрами: ${formatMeters(spanX)} × ${formatMeters(spanY)} м`,
      `Габариты всех маркеров: ${formatMeters(boundsWidth)} × ${formatMeters(boundsHeight)} м`,
    ].map(text => { const span = document.createElement('span'); span.textContent = text; return span; }));
    const warnings = mapWarnings(markers, settings);
    $('#warnings').replaceChildren(...warnings.map(message => { const p = document.createElement('p'); p.textContent = message; return p; }));
    $('#warnings').hidden = !warnings.length;
    renderPreview();
  } catch (error) {
    $('#validation-error').textContent = error.message;
    $('#validation-error').hidden = false;
    $('#preview-invalid').hidden = false;
    exportButtons.forEach(button => { button.disabled = true; });
    $('#warnings').hidden = true;
  }
}

function applyText() {
  try {
    const nextDictionary = dictionaryFromText($('#txt-source').value, dictionarySelect.value);
    const next = parseMap($('#txt-source').value, nextDictionary);
    const nextFrame = frameFromText($('#txt-source').value, coordinateFrame);
    dictionarySelect.value = nextDictionary;
    refreshDictionary();
    installFrame(nextFrame);
    markers = next;
    sourceDirty = false;
    renderRows();
    syncSource();
    update();
    refreshGrid();
    return true;
  } catch (error) {
    $('#txt-error').textContent = error.message;
    $('#txt-error').hidden = false;
    return false;
  }
}

function setTab(name, focus = false) {
  if (name === 'table' && sourceDirty && !applyText()) return;
  if (name === 'txt' && !sourceDirty) syncSource();
  for (const mode of ['table', 'txt']) {
    const selected = mode === name;
    $(`#${mode}-tab`).setAttribute('aria-selected', String(selected));
    $(`#${mode}-tab`).tabIndex = selected ? 0 : -1;
    $(`#${mode}-panel`).hidden = !selected;
  }
  if (focus) $(`#${name}-tab`).focus();
}

$('#table-tab').addEventListener('click', () => setTab('table'));
$('#txt-tab').addEventListener('click', () => setTab('txt'));
$('.tab-bar').addEventListener('keydown', event => {
  if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    const mode = event.key === 'Home' ? 'table' : event.key === 'End' ? 'txt' : $('#table-tab').getAttribute('aria-selected') === 'true' ? 'txt' : 'table';
    setTab(mode, true);
  }
});
$('#txt-source').addEventListener('input', () => {
  sourceDirty = true;
  $('#txt-state').textContent = 'Есть неприменённые изменения';
  $('#txt-error').hidden = true;
  update();
});
$('#apply-txt').addEventListener('click', () => { if (applyText()) notify('TXT применён — карта обновлена'); });

$('#marker-rows').addEventListener('input', event => {
  const input = event.target.closest('input[data-field]');
  if (!input) return;
  const index = Number(input.closest('tr').dataset.index);
  markers[index][input.dataset.field] = input.valueAsNumber;
  if (input.dataset.field === 'id') input.closest('tr').querySelector('button').setAttribute('aria-label', `Удалить маркер ${input.value}`);
  syncSource();
  update();
});
$('#marker-rows').addEventListener('click', event => {
  const button = event.target.closest('.remove-marker');
  if (!button || markers.length === 1) return;
  const index = Number(button.closest('tr').dataset.index);
  markers.splice(index, 1);
  renderRows(); syncSource(); update();
  $('#marker-rows').rows[Math.min(index, markers.length - 1)]?.querySelector('button')?.focus();
});
$('#add-marker').addEventListener('click', () => {
  const used = new Set(markers.map(m => m.id));
  const count = getDictionary(dictionarySelect.value).count;
  const id = Array.from({ length: count }, (_, i) => i).find(i => !used.has(i));
  if (id === undefined) { notify(`Все ${count} ID уже используются. Удалите маркер или добавьте повторный ID через TXT.`); return; }
  markers.push({ id, length: .185, ...fromWorld({ x: 0, y: 0 }, coordinateFrame), z: 0, rot_z: 0, rot_y: 0, rot_x: 0 });
  renderRows(); syncSource(); update();
  $('#marker-rows').lastElementChild.querySelector('input').focus();
});

function replaceMap(next, message) {
  markers = next;
  renderRows(); syncSource(); setTab('table'); update(); refreshGrid(); notify(message);
}
$('#load-example').addEventListener('click', () => {
  installFrame(DEFAULT_FRAME, 'center');
  dictionarySelect.value = DEFAULT_DICTIONARY;
  refreshDictionary();
  replaceMap(parseMap(EXAMPLE), 'Загружен пример GeBondar: 13 маркеров, DICT_4X4_50');
});
$('#new-map').addEventListener('click', () => {
  mapName.value = mapName.defaultValue;
  refreshFilename();
  controls.paperWidth.value = 2;
  controls.paperHeight.value = 2;
  controls.scale.value = DEFAULT_SETTINGS.scale;
  installFrame(DEFAULT_FRAME, 'center');
  dictionarySelect.value = DEFAULT_DICTIONARY;
  refreshDictionary();
  for (const input of Object.values(gridFields)) input.value = input.defaultValue;
  gridMode = 'span';
  $('input[name="grid-mode"][value="span"]').checked = true;
  $('#span-fields').hidden = false;
  $('#step-fields').hidden = true;
  zoom = 1;
  replaceMap(newMap(), 'Новая карта: 4 маркера, холст 2000 × 2000 px');
});
$('#import-file').addEventListener('click', () => $('#file-input').click());
$('#file-input').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 1_000_000) throw new Error('Файл должен быть меньше 1 МБ.');
    const text = await file.text();
    const nextDictionary = dictionaryFromText(text, dictionarySelect.value);
    const next = parseMap(text, nextDictionary);
    const nextFrame = frameFromText(text);
    dictionarySelect.value = nextDictionary;
    refreshDictionary();
    installFrame(nextFrame);
    mapName.value = file.name.replace(/\.txt$/i, '').slice(0, 100);
    refreshFilename();
    replaceMap(next, `Загружен файл ${file.name}`);
  } catch (error) { notify(`Карта не изменена. ${error.message}`); }
  event.target.value = '';
});

Object.values(controls).forEach(input => input.addEventListener('input', () => {
  if (input !== controls.scale) changeCoordinateFrame();
  update(); refreshGrid();
}));
dictionarySelect.addEventListener('change', () => {
  refreshDictionary();
  // Changing the dictionary preserves the map and any unapplied TXT draft.
  if (!sourceDirty) syncSource();
  update();
  refreshGrid();
});

function readGrid() {
  return { ...Object.fromEntries(Object.entries(gridFields).map(([key, input]) => [key, input.valueAsNumber])), mode: gridMode };
}
function currentGrid() {
  const current = readSettings();
  const grid = generateGrid(readGrid(), dictionarySelect.value, { width: current.paperWidth, height: current.paperHeight });
  return { ...grid, markers: grid.markers.map(marker => ({ ...marker, ...fromWorld(marker, coordinateFrame) })) };
}
function refreshGrid(apply = false) {
  const options = readGrid();
  gridFields.spanX.disabled = gridFields.stepX.disabled = options.columns === 1;
  gridFields.spanY.disabled = gridFields.stepY.disabled = options.rows === 1;
  try {
    const grid = currentGrid();
    if (apply) {
      if (sourceDirty) throw new Error('Сначала примените изменения TXT. Текущая карта сохранена.');
      markers = grid.markers;
      renderRows();
      syncSource();
      update();
    }
    $('#grid-error').hidden = true;
    $('#grid-summary').textContent = `${grid.markers.length} меток, ID ${grid.markers[0].id}–${grid.markers.at(-1).id}. Крайние центры: ${formatMeters(grid.spanX)} × ${formatMeters(grid.spanY)} м. Шаг: ${formatMeters(grid.stepX)} × ${formatMeters(grid.stepY)} м. Габариты с учётом размера меток: ${formatMeters(grid.boundsWidth)} × ${formatMeters(grid.boundsHeight)} м.`;
  } catch (error) {
    $('#grid-summary').textContent = 'Текущая карта сохранена. Исправьте настройки для автоматического обновления сетки.';
    $('#grid-error').textContent = error.message;
    $('#grid-error').hidden = false;
  }
}
Object.values(gridFields).forEach(input => input.addEventListener('input', () => refreshGrid(true)));
for (const radio of document.querySelectorAll('input[name="grid-mode"]')) radio.addEventListener('change', () => {
  const old = readGrid();
  for (const axis of ['X', 'Y']) {
    const count = old[axis === 'X' ? 'columns' : 'rows'];
    const span = count === 1 ? 0 : gridMode === 'span' ? old[`span${axis}`] : old[`step${axis}`] * (count - 1);
    const step = count === 1 ? 0 : span / (count - 1);
    gridFields[`span${axis}`].value = Number.isFinite(span) ? Number(span.toPrecision(12)) : '';
    gridFields[`step${axis}`].value = Number.isFinite(step) ? Number(step.toPrecision(12)) : '';
  }
  gridMode = radio.value;
  $('#span-fields').hidden = gridMode !== 'span';
  $('#step-fields').hidden = gridMode !== 'step';
  refreshGrid();
});
function installFrame(frame, preset = null) {
  coordinateFrame = validateFrame(frame);
  $('#coordinate-origin').value = preset || (frame.originX === 0 && frame.originY === 0 ? 'center' : 'custom');
  $('#coordinate-x').value = frame.directionX;
  $('#coordinate-y').value = frame.directionY;
  $('#origin-offset-x').value = Number(((controls.paperWidth.valueAsNumber || 2) / 2 + frame.originX).toPrecision(14));
  $('#origin-offset-y').value = Number(((controls.paperHeight.valueAsNumber || 2) / 2 - frame.originY).toPrecision(14));
  $('#custom-origin-fields').hidden = $('#coordinate-origin').value !== 'custom';
  $('#coordinate-note').textContent = `Начало: ${$('#coordinate-origin').selectedOptions[0].textContent}. X ${frame.directionX === 1 ? '→' : '←'}, Y ${frame.directionY === 1 ? '↑' : '↓'}. Z ↑.`;
  $('#origin-legend').textContent = `Начало (0, 0) · X ${frame.directionX === 1 ? '→' : '←'} · Y ${frame.directionY === 1 ? '↑' : '↓'}`;
  $('#coordinate-error').hidden = true;
}
function changeCoordinateFrame() {
  $('#custom-origin-fields').hidden = $('#coordinate-origin').value !== 'custom';
  try {
    const current = validState();
    const preset = $('#coordinate-origin').value;
    let originX = 0, originY = 0;
    if (preset === 'custom') {
      originX = $('#origin-offset-x').valueAsNumber - current.paperWidth / 2;
      originY = current.paperHeight / 2 - $('#origin-offset-y').valueAsNumber;
    } else {
      if (preset.includes('left')) originX = -current.paperWidth / 2;
      if (preset.includes('right')) originX = current.paperWidth / 2;
      if (preset.includes('top')) originY = current.paperHeight / 2;
      if (preset.includes('bottom')) originY = -current.paperHeight / 2;
    }
    const nextFrame = validateFrame({ originX, originY, directionX: Number($('#coordinate-x').value), directionY: Number($('#coordinate-y').value) });
    const next = markers.map(marker => ({ ...marker, ...fromWorld(toWorld(marker, coordinateFrame), nextFrame) }));
    validateMap(next, dictionarySelect.value);
    markers = next;
    installFrame(nextFrame, preset);
    renderRows(); syncSource(); update(); refreshGrid();
  } catch (error) {
    $('#coordinate-error').textContent = `${error.message} Последняя корректная система координат сохранена.`;
    $('#coordinate-error').hidden = false;
  }
}
for (const id of ['coordinate-origin', 'coordinate-x', 'coordinate-y']) $(`#${id}`).addEventListener('change', changeCoordinateFrame);
for (const id of ['origin-offset-x', 'origin-offset-y']) $(`#${id}`).addEventListener('input', changeCoordinateFrame);

function openHeightEditor(index) {
  try {
    validState();
    heightMarker = markers[index];
    if (!heightMarker) return;
    $('#height-marker-info').textContent = `ID ${heightMarker.id}, строка ${index + 1}. Высота направлена вверх и сохраняется в TXT.`;
    $('#marker-height').value = heightMarker.z;
    $('#height-error').hidden = true;
    $('#height-dialog').showModal();
    $('#marker-height').focus();
    $('#marker-height').select();
  } catch (error) { notify(error.message); }
}
preview.addEventListener('dblclick', event => {
  // Pointer capture can retarget the click to the preview container.
  const target = event.target.closest('[data-marker-index], [data-marker-height]') || document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-marker-index], [data-marker-height]');
  if (target) { event.preventDefault(); openHeightEditor(Number(target.dataset.markerIndex ?? target.dataset.markerHeight)); }
});
preview.addEventListener('keydown', event => {
  if (!['Enter', ' '].includes(event.key)) return;
  const target = event.target.closest('[data-marker-index], [data-marker-height]');
  if (target) { event.preventDefault(); openHeightEditor(Number(target.dataset.markerIndex ?? target.dataset.markerHeight)); }
});
$('#cancel-height').addEventListener('click', () => $('#height-dialog').close());
$('#height-dialog').addEventListener('close', () => {
  const index = markers.indexOf(heightMarker);
  preview.querySelector(`[data-marker-index="${index}"]`)?.focus({ preventScroll: true });
  heightMarker = null;
});
$('#height-form').addEventListener('submit', event => {
  event.preventDefault();
  const z = $('#marker-height').valueAsNumber;
  const index = markers.indexOf(heightMarker);
  if (!Number.isFinite(z) || index < 0) {
    $('#height-error').textContent = index < 0 ? 'Карта изменилась. Откройте высоту метки заново.' : 'Введите конечное число для высоты Z в метрах.';
    $('#height-error').hidden = false;
    return;
  }
  heightMarker.z = z;
  $('#marker-rows').rows[index].querySelector('input[data-field="z"]').value = z;
  syncSource(); update();
  $('#height-dialog').close();
});
function refreshFilename() {
  $('#filename-hint').textContent = `Файлы: ${['svg', 'png', 'txt'].map(extension => exportFilename(mapName.value, extension)).join(' / ')}`;
}
mapName.addEventListener('input', refreshFilename);

function readPlacementGrid() {
  const stepX = $('#placement-step-x').valueAsNumber;
  const stepY = $('#placement-step-y').valueAsNumber;
  if (![stepX, stepY].every(step => Number.isFinite(step) && step >= .000001 && step <= 1_000_000)) throw new Error('Шаг сетки X и Y должен быть от 0,000001 до 1 000 000 м.');
  return { stepX, stepY, snap: $('#snap-markers').checked };
}
for (const id of ['placement-step-x', 'placement-step-y', 'snap-markers']) $(`#${id}`).addEventListener('input', () => {
  try {
    placementGrid = readPlacementGrid();
    $('#placement-error').hidden = true;
    update();
  } catch (error) {
    $('#placement-error').textContent = `${error.message} Последняя корректная сетка сохранена.`;
    $('#placement-error').hidden = false;
  }
});
function applyMarkerPosition(index, position) {
  Object.assign(markers[index], position);
  const row = $('#marker-rows').rows[index];
  for (const axis of ['x', 'y']) row.querySelector(`input[data-field="${axis}"]`).value = position[axis];
  syncSource();
  update();
}
preview.addEventListener('pointerdown', event => {
  const group = event.target.closest('[data-marker-index]');
  if (!group || drag || !event.isPrimary || event.button !== 0) return;
  try {
    const current = validState();
    const index = Number(group.dataset.markerIndex);
    drag = {
      index, pointerId: event.pointerId, origin: { ...markers[index] }, startX: event.clientX, startY: event.clientY,
      bounds: $('#map-sheet').getBoundingClientRect(),
      grid: { ...readPlacementGrid(), width: current.paperWidth, height: current.paperHeight, frame: { ...coordinateFrame } }, moved: false,
    };
    event.preventDefault();
    group.focus({ preventScroll: true });
    preview.setPointerCapture(event.pointerId);
    preview.classList.add('is-dragging');
  } catch (error) { drag = null; notify(error.message); }
});
function movePointer(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const dx = event.clientX - drag.startX;
  const dy = event.clientY - drag.startY;
  if (!drag.moved && Math.hypot(dx, dy) < 3) return;
  drag.moved = true;
  const delta = { x: dx / drag.bounds.width * drag.grid.width * drag.grid.frame.directionX, y: -dy / drag.bounds.height * drag.grid.height * drag.grid.frame.directionY };
  applyMarkerPosition(drag.index, moveOnGrid(drag.origin, delta, drag.grid));
}
preview.addEventListener('pointermove', event => {
  if (!drag || event.pointerId !== drag.pointerId) return;
  cancelAnimationFrame(dragFrame);
  dragFrame = requestAnimationFrame(() => movePointer(event));
});
function finishDrag(cancel = false, event = null) {
  if (!drag || (event && event.pointerId !== drag.pointerId)) return;
  cancelAnimationFrame(dragFrame);
  if (event && !cancel) movePointer(event);
  const { index, pointerId, origin, moved } = drag;
  drag = null;
  preview.classList.remove('is-dragging');
  if (preview.hasPointerCapture(pointerId)) preview.releasePointerCapture(pointerId);
  if (cancel && moved) applyMarkerPosition(index, { x: origin.x, y: origin.y });
  else if (moved) update();
  preview.querySelector(`[data-marker-index="${index}"]`)?.focus({ preventScroll: true });
}
preview.addEventListener('pointerup', event => finishDrag(false, event));
preview.addEventListener('pointercancel', event => finishDrag(true, event));
preview.addEventListener('lostpointercapture', () => finishDrag(true));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && drag) { event.preventDefault(); finishDrag(true); }
});
preview.addEventListener('keydown', event => {
  const group = event.target.closest('[data-marker-index]');
  if (!group || drag || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
  event.preventDefault();
  try {
    const current = validState();
    const grid = { ...readPlacementGrid(), width: current.paperWidth, height: current.paperHeight, frame: coordinateFrame };
    const index = Number(group.dataset.markerIndex);
    const delta = { x: event.key === 'ArrowLeft' ? -grid.stepX * coordinateFrame.directionX : event.key === 'ArrowRight' ? grid.stepX * coordinateFrame.directionX : 0, y: event.key === 'ArrowDown' ? -grid.stepY * coordinateFrame.directionY : event.key === 'ArrowUp' ? grid.stepY * coordinateFrame.directionY : 0 };
    applyMarkerPosition(index, moveOnGrid(markers[index], delta, grid));
    preview.querySelector(`[data-marker-index="${index}"]`).focus({ preventScroll: true });
  } catch (error) { notify(error.message); }
});
for (const id of ['show-grid', 'show-labels']) $(`#${id}`).addEventListener('change', update);
function setZoom(value) {
  zoom = Math.min(3, Math.max(.5, value));
  update();
  const canvas = $('#preview-canvas');
  canvas.scrollLeft = (canvas.scrollWidth - canvas.clientWidth) / 2;
  canvas.scrollTop = (canvas.scrollHeight - canvas.clientHeight) / 2;
}
$('#zoom-in').addEventListener('click', () => setZoom(zoom + .25));
$('#zoom-out').addEventListener('click', () => setZoom(zoom - .25));
$('#zoom-fit').addEventListener('click', () => setZoom(1));
new ResizeObserver(() => { try { validState(); renderPreview(); } catch {} }).observe($('#preview-canvas'));

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

$('#export-svg').addEventListener('click', () => {
  try {
    const current = validState();
    download(new Blob([generateSvg(markers, current)], { type: 'image/svg+xml;charset=utf-8' }), exportFilename(mapName.value, 'svg'));
    notify('SVG скачан — векторная карта без сетки');
  } catch (error) { notify(error.message); }
});
$('#export-txt').addEventListener('click', () => {
  try {
    validState();
    download(new Blob([serializeMap(markers, dictionarySelect.value, coordinateFrame)], { type: 'text/plain;charset=utf-8' }), exportFilename(mapName.value, 'txt'));
    notify('TXT скачан — все восемь столбцов сохранены');
  } catch (error) { notify(error.message); }
});
$('#export-png').addEventListener('click', async () => {
  let url;
  try {
    const current = validState();
    const svg = generateSvg(markers, current);
    const filename = exportFilename(mapName.value, 'png');
    pngBusy = true; update();
    $('#export-png').setAttribute('aria-busy', 'true');
    url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('Не удалось создать PNG. Попробуйте SVG.')); image.src = url; });
    const canvas = document.createElement('canvas');
    canvas.width = current.width;
    canvas.height = current.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Браузер не поддерживает экспорт PNG. Скачайте SVG.');
    context.imageSmoothingEnabled = false;
    context.drawImage(image, 0, 0, current.width, current.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Недостаточно памяти для PNG. Уменьшите холст или скачайте SVG.');
    download(blob, filename);
    notify('PNG скачан — белый фон, без сетки');
  } catch (error) { notify(error.message); }
  finally {
    if (url) URL.revokeObjectURL(url);
    pngBusy = false;
    $('#export-png').removeAttribute('aria-busy');
    update();
  }
});

installFrame(DEFAULT_FRAME, 'center');
refreshFilename();
renderRows();
refreshDictionary();
syncSource();
update();
refreshGrid();
