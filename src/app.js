import { DEFAULT_SETTINGS, FIELDS, MAX_MARKERS, parseMap, serializeMap, validateMap, validateSettings, generateSvg, markerBox, mapWarnings } from './core.js';
import { EXAMPLE } from './example.js';

const $ = selector => document.querySelector(selector);
const newMap = () => [
  { id: 1, length: .185, x: -.4, y: .4, z: 0, rot_z: 0, rot_y: 0, rot_x: 0 },
  { id: 2, length: .185, x: .4, y: .4, z: 0, rot_z: 0, rot_y: 0, rot_x: 0 },
  { id: 3, length: .185, x: -.4, y: -.4, z: 0, rot_z: 0, rot_y: 0, rot_x: 0 },
  { id: 4, length: .185, x: .4, y: -.4, z: 0, rot_z: 0, rot_y: 0, rot_x: 0 },
];
let markers = newMap();
let settings = { ...DEFAULT_SETTINGS };
let zoom = 1;
let sourceDirty = false;
let pngBusy = false;
let notificationTimer;
const controls = { width: $('#canvas-width'), height: $('#canvas-height'), scale: $('#canvas-scale') };
const exportButtons = [$('#export-svg'), $('#export-png'), $('#export-txt')];
const labels = { id: 'ID', length: 'Размер', x: 'X', y: 'Y' };

function notify(message) {
  clearTimeout(notificationTimer);
  $('#notification').textContent = message;
  $('#notification').hidden = false;
  notificationTimer = setTimeout(() => { $('#notification').hidden = true; }, 4500);
}

function syncSource() {
  $('#txt-source').value = `# ${FIELDS.join(' ')}\n` + markers.map(m => FIELDS.map(f => m[f]).join('\t')).join('\n') + '\n';
  sourceDirty = false;
  $('#txt-error').hidden = true;
  $('#txt-state').textContent = 'Все изменения применены';
}

function renderRows() {
  const fragment = document.createDocumentFragment();
  markers.forEach((marker, index) => {
    const row = document.createElement('tr');
    row.dataset.index = index;
    for (const field of ['id', 'length', 'x', 'y']) {
      const cell = document.createElement('td');
      const input = document.createElement('input');
      input.type = 'number';
      input.value = marker[field];
      input.step = field === 'id' ? '1' : 'any';
      input.inputMode = field === 'id' ? 'numeric' : 'decimal';
      if (field === 'id') { input.min = '0'; input.max = '49'; }
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
  return validateSettings(Object.fromEntries(Object.entries(controls).map(([field, input]) => [field, input.valueAsNumber])));
}

function validState() {
  validateMap(markers);
  const currentSettings = readSettings();
  if (sourceDirty) throw new Error('Примените изменения TXT, чтобы обновить карту и скачать файл.');
  return currentSettings;
}

function fitSheet() {
  const canvas = $('#preview-canvas');
  const width = Math.max(1, canvas.clientWidth - 80);
  const height = Math.max(1, canvas.clientHeight - 80);
  const factor = Math.min(width / settings.width, height / settings.height) * zoom;
  const sheetWidth = settings.width * factor;
  const sheetHeight = settings.height * factor;
  $('#map-sheet').style.width = `${sheetWidth}px`;
  $('#map-sheet').style.height = `${sheetHeight}px`;
  $('#canvas-space').style.width = `${Math.max(canvas.clientWidth, sheetWidth + 80)}px`;
  $('#canvas-space').style.height = `${Math.max(canvas.clientHeight, sheetHeight + 80)}px`;
  $('#zoom-level').textContent = `${Math.round(zoom * 100)}%`;
  $('#zoom-out').disabled = zoom <= .5;
  $('#zoom-in').disabled = zoom >= 3;
  return Math.max(1, sheetWidth);
}

function renderPreview() {
  const sheetWidth = fitSheet();
  const unit = settings.width / sheetWidth;
  let svg = generateSvg(markers, settings);
  if ($('#show-grid').checked) {
    const pixelStep = Math.max(settings.scale / 10, 16 * unit);
    const strokeWidth = .65 * unit;
    const grid = `<defs><pattern id="preview-grid" width="${pixelStep}" height="${pixelStep}" patternUnits="userSpaceOnUse" x="${settings.width / 2}" y="${settings.height / 2}"><path d="M ${pixelStep} 0 H 0 V ${pixelStep}" fill="none" stroke="#e4ebf3" stroke-width="${strokeWidth}"/></pattern></defs><rect width="${settings.width}" height="${settings.height}" fill="url(#preview-grid)"/><g stroke="#9cb2d1" stroke-width="${unit}" stroke-dasharray="${3 * unit} ${4 * unit}"><line x1="${settings.width / 2}" y1="0" x2="${settings.width / 2}" y2="${settings.height}"/><line x1="0" y1="${settings.height / 2}" x2="${settings.width}" y2="${settings.height / 2}"/></g><circle cx="${settings.width / 2}" cy="${settings.height / 2}" r="${2.5 * unit}" fill="#2459d3"/>`;
    svg = svg.replace(/(<g data-marker-id=)/, grid + '$1');
  }
  if ($('#show-labels').checked) {
    const markerLabels = markers.map(marker => {
      const box = markerBox(marker, settings);
      return `<text x="${box.x + box.size / 2}" y="${box.y + box.size + 13 * unit}" text-anchor="middle" font-size="${10 * unit}" font-family="Arial,sans-serif" fill="#516984">${marker.id}</text>`;
    }).join('');
    svg = svg.replace('</svg>', markerLabels + '</svg>');
  }
  // Content is generated exclusively from finite validated numbers and fixed strings.
  $('#map-preview').innerHTML = svg;
}

function update() {
  for (const row of $('#marker-rows').rows) {
    for (const input of row.querySelectorAll('input')) {
      const value = markers[Number(row.dataset.index)][input.dataset.field];
      const invalid = !Number.isFinite(value) || (input.dataset.field === 'id' && (!Number.isInteger(value) || value < 0 || value > 49)) || (input.dataset.field === 'length' && value <= 0);
      input.setAttribute('aria-invalid', String(invalid));
    }
  }
  try {
    settings = validState();
    $('#validation-error').hidden = true;
    $('#preview-invalid').hidden = true;
    exportButtons.forEach(button => { button.disabled = pngBusy; });
    $('#canvas-dimensions').textContent = `${settings.width} × ${settings.height} px`;
    const format = n => Number(n.toPrecision(5)).toLocaleString('ru-RU');
    $('#physical-size').textContent = `Область карты: ${format(settings.width / settings.scale)} × ${format(settings.height / settings.scale)} м`;
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
    const next = parseMap($('#txt-source').value);
    markers = next;
    sourceDirty = false;
    renderRows();
    syncSource();
    update();
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
  const id = Array.from({ length: 50 }, (_, i) => i).find(i => !used.has(i));
  if (id === undefined) { notify('Все 50 ID уже используются. Удалите маркер или добавьте повторный ID через TXT.'); return; }
  markers.push({ id, length: .185, x: 0, y: 0, z: 0, rot_z: 0, rot_y: 0, rot_x: 0 });
  renderRows(); syncSource(); update();
  $('#marker-rows').lastElementChild.querySelector('input').focus();
});

function replaceMap(next, message) {
  markers = next;
  renderRows(); syncSource(); setTab('table'); update(); notify(message);
}
$('#load-example').addEventListener('click', () => replaceMap(parseMap(EXAMPLE), 'Загружен пример GeBondar: 13 маркеров'));
$('#new-map').addEventListener('click', () => {
  Object.entries(DEFAULT_SETTINGS).forEach(([key, value]) => { controls[key].value = value; });
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
    replaceMap(parseMap(text), `Загружен файл ${file.name}`);
  } catch (error) { notify(`Карта не изменена. ${error.message}`); }
  event.target.value = '';
});

Object.values(controls).forEach(input => input.addEventListener('input', update));
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
    download(new Blob([generateSvg(markers, current)], { type: 'image/svg+xml;charset=utf-8' }), 'aruco-map.svg');
    notify('SVG скачан — векторная карта без сетки');
  } catch (error) { notify(error.message); }
});
$('#export-txt').addEventListener('click', () => {
  try {
    validState();
    download(new Blob([serializeMap(markers)], { type: 'text/plain;charset=utf-8' }), 'aruco-map.txt');
    notify('TXT скачан — все восемь столбцов сохранены');
  } catch (error) { notify(error.message); }
});
$('#export-png').addEventListener('click', async () => {
  let url;
  try {
    const current = validState();
    const svg = generateSvg(markers, current);
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
    context.drawImage(image, 0, 0);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Недостаточно памяти для PNG. Уменьшите холст или скачайте SVG.');
    download(blob, 'aruco-map.png');
    notify('PNG скачан — белый фон, без сетки');
  } catch (error) { notify(error.message); }
  finally {
    if (url) URL.revokeObjectURL(url);
    pngBusy = false;
    $('#export-png').removeAttribute('aria-busy');
    update();
  }
});

renderRows();
syncSource();
update();
