import { DEFAULT_DICTIONARY, MAX_MARKERS, getDictionary, validateMap } from './core.js';

export function generateGrid(options, dictionary = DEFAULT_DICTIONARY, paper = null) {
  const { columns, rows, length, idStart, idEnd, mode } = options;
  const count = columns * rows;
  if (![columns, rows].every(n => Number.isInteger(n) && n >= 1) || count > MAX_MARKERS) {
    throw new Error(`Колонки и ряды должны быть целыми числами от 1. Максимум ${MAX_MARKERS} маркеров.`);
  }
  const maxId = getDictionary(dictionary).count - 1;
  if (![idStart, idEnd].every(n => Number.isInteger(n) && n >= 0 && n <= maxId) || idEnd < idStart) {
    throw new Error(`Диапазон ID: от 0 до ${maxId}; начальный ID не должен превышать конечный.`);
  }
  if (idEnd - idStart + 1 < count) throw new Error(`Не хватает ID: для ${count} маркеров нужны ${count} разных ID в диапазоне.`);
  if (!Number.isFinite(length) || length <= 0 || length > 1e6) throw new Error('Размер маркера должен быть больше нуля.');
  if (!['span', 'step'].includes(mode)) throw new Error('Выберите расстояние между крайними маркерами или соседними.');
  function axis(n, span, step) {
    if (n === 1) return { span: 0, step: 0 };
    const spacing = mode === 'span' ? span / (n - 1) : step;
    if (!Number.isFinite(spacing) || spacing <= length) {
      throw new Error('Расстояние между центрами соседних маркеров должно быть больше размера маркера.');
    }
    if (spacing * (n - 1) > 1e6) throw new Error('Расстояние между крайними маркерами не должно превышать 1 000 000 м.');
    return { span: mode === 'span' ? span : spacing * (n - 1), step: spacing };
  }
  const horizontal = axis(columns, options.spanX, options.stepX);
  const vertical = axis(rows, options.spanY, options.stepY);
  const boundsWidth = horizontal.span + length;
  const boundsHeight = vertical.span + length;
  if (paper) {
    if (![paper.width, paper.height].every(n => Number.isFinite(n) && n > 0)) throw new Error('Задайте положительные размеры поля для печати.');
    if (boundsWidth - paper.width > 1e-9 || boundsHeight - paper.height > 1e-9) {
      throw new Error('Сетка не помещается в поле для печати: увеличьте поле или уменьшите расстояния и размер маркеров.');
    }
  }
  const round = value => Number(value.toPrecision(12)) || 0;
  const markers = Array.from({ length: count }, (_, index) => ({
    id: idStart + index,
    length,
    x: round((index % columns) * horizontal.step - horizontal.span / 2),
    y: round(vertical.span / 2 - Math.floor(index / columns) * vertical.step),
    z: 0, rot_z: 0, rot_y: 0, rot_x: 0,
  }));
  validateMap(markers, dictionary);
  return { markers, spanX: horizontal.span, spanY: vertical.span, stepX: horizontal.step,
    stepY: vertical.step, boundsWidth, boundsHeight };
}
