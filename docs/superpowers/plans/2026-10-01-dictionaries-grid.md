# Dictionaries and Grid Implementation Plan

**Goal:** Словари OpenCV и регулярная карта с отдельным полем для печати.
**Architecture:** Сохраняется статический браузерный генератор. Компактные словари содержат hex внутренней матрицы, рамка добавляется при рендере. Чистая функция generateGrid рассчитывает координаты.
**Tech Stack:** JavaScript, SVG/Canvas, Node tests, OpenCV/Python и Playwright для проверок.

## Global constraints
Расстояния между центрами; максимум 1000 маркеров. Формат исходных 8 колонок сохраняется. Печатное поле отделено от границ сетки. Ручные правки не пропадают при смене режима или словаря. Исходная атрибуция остаётся.

## Tasks
- [ ] 1. Сначала добавить tests/grid.test.mjs и расширить tests/core.test.mjs, убедиться в ожидаемом падении. Реализовать src/grid.js, обновить scripts/generate_dictionary.py и src/core.js: getDictionary(name), getMarkerMatrix(id,name), parseMap(text,name), serializeMap(markers,name), dictionaryFromText(text,fallback); настройки поддерживают dictionary, paperWidth/paperHeight. generateGrid(options,dictionary,paper) выдаёт markers, spanX/spanY, stepX/stepY и boundsWidth/boundsHeight.
- [ ] 2. index.html и src/app.js: selector dictionary-select; print-width/print-height в метрах; canvas-scale остаётся разрешением. Панель сетки с grid-columns/rows, grid-length, grid-id-start/end, grid-span-x/y, grid-step-x/y; радиопереключатель span/step; generate-grid создаёт сетку. Отображать оба расчётных размера, предупреждения и понятные ошибки. Сохранить ручную таблицу/TXT; PNG drawImage задаёт размеры назначения явно.
- [ ] 3. Обновить tests/browser.mjs и независимые fixtures/verify_opencv.py. Выполнить npm test, build, Playwright и OpenCV. Обновить README и upstream/ORIGIN.md; review изменений; push main, дождаться Pages и проверить HTTP/интерфейс публичного сайта. Обновить outputs HTML/ZIP.

## Defaults
Словарь DICT_4X4_50; поле 2×2 м; 1000 px/м; сетка 3×3, 0.185 м, диапазон 1–49, span 1.6×1.6 м. Генерация по явной кнопке, изменения настроек не заменяют ручную карту автоматически.
