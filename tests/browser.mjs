import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { parseMap } from '../src/core.js';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch {
  if (!process.env.PLAYWRIGHT_MODULE) throw new Error('Install Playwright: npm install --no-save playwright && npx playwright install chromium');
  ({ chromium } = require(process.env.PLAYWRIGHT_MODULE));
}
const base = process.env.TEST_FILE ? pathToFileURL(process.env.TEST_FILE).href : process.env.TEST_URL || 'http://127.0.0.1:5174';
const server = process.env.TEST_URL || process.env.TEST_FILE ? null : spawn(process.execPath, ['scripts/serve.mjs', '--dist', '--port', '5174'], { stdio: 'inherit' });
let browser;
try {
  for (let i = 0; server && i < 30; i++) {
    try { if ((await fetch(base)).ok) break; } catch {}
    await delay(100);
  }
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await page.waitForLoadState('networkidle');
  await page.getByRole('heading', { name: 'Генератор карт ArUco', exact: true }).waitFor();
  assert.equal(await page.locator('#marker-rows tr').count(), 4);
  assert.equal(await page.locator('#map-preview [data-marker-id]').count(), 4);
  assert.match(await page.locator('footer').innerText(), /форк/);
  await page.getByRole('button', { name: 'Пример из исходника', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('#marker-rows tr').length === 13);
  assert.equal(await page.locator('#map-preview [data-marker-id]').count(), 13);
  await mkdir('test-results', { recursive: true });
  for (const format of ['SVG', 'PNG', 'TXT']) {
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: `Скачать ${format}`, exact: true }).click();
    const download = await downloadPromise;
    await download.saveAs(`test-results/map.${format.toLowerCase()}`);
  }
  const svg = await readFile('test-results/map.svg', 'utf8');
  assert.doesNotMatch(svg, /<pattern|<text|<line|<script/);
  assert.match(svg, /translate\(1707\.5 755\.5\)/);
  assert.equal(parseMap(await readFile('test-results/map.txt', 'utf8')).length, 13);
  const png = await readFile('test-results/map.png');
  assert.equal(png.readUInt32BE(16), 2000);
  assert.equal(png.readUInt32BE(20), 2000);
  await page.locator('#marker-rows input[data-field="length"]').first().fill('0');
  await page.getByRole('button', { name: 'Скачать SVG', exact: true }).isDisabled().then(disabled => assert.equal(disabled, true));
  assert.match(await page.locator('#validation-error').innerText(), /больше нуля/);
  await page.locator('#marker-rows input[data-field="length"]').first().fill('0.185');
  await page.getByRole('button', { name: 'Добавить маркер', exact: true }).click();
  assert.equal(await page.locator('#marker-rows tr').count(), 14);
  await page.getByRole('button', { name: 'Удалить маркер 0', exact: true }).click();
  assert.equal(await page.locator('#marker-rows tr').count(), 13);
  await page.getByRole('tab', { name: 'TXT' }).click();
  await page.getByLabel('Карта в формате TXT').fill('# header\n1 0.2 0.3 0.4 1 30 40 50');
  await page.getByRole('button', { name: 'Применить TXT', exact: true }).click();
  assert.equal(await page.locator('#map-preview [data-marker-id]').count(), 1);
  const txtPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать TXT', exact: true }).click();
  const txtDownload = await txtPromise;
  assert.deepEqual(parseMap(await readFile(await txtDownload.path(), 'utf8')), [{ id: 1, length: .2, x: .3, y: .4, z: 1, rot_z: 30, rot_y: 40, rot_x: 50 }]);
  await page.getByLabel('Карта в формате TXT').fill('50 .1 0 0 0 0 0 0');
  await page.getByRole('button', { name: 'Скачать SVG', exact: true }).isDisabled().then(disabled => assert.equal(disabled, true));
  await page.getByRole('button', { name: 'Применить TXT', exact: true }).click();
  assert.match(await page.locator('#txt-error').innerText(), /Строка 1/);
  await page.locator('#file-input').setInputFiles({ name: 'custom.txt', mimeType: 'text/plain', buffer: Buffer.from('2 .24 -.25 .5 0 0 0 0') });
  await page.waitForFunction(() => document.querySelectorAll('#marker-rows tr').length === 1 && document.querySelector('#marker-rows input[data-field="id"]').value === '2');
  await page.getByLabel('Ширина, px').fill('1200');
  assert.match(await page.locator('#canvas-dimensions').innerText(), /1200/);
  await page.getByLabel('Ширина, px').fill('');
  assert.equal(await page.getByRole('button', { name: 'Скачать PNG', exact: true }).isDisabled(), true);
  await page.getByLabel('Ширина, px').fill('2000');
  await page.getByRole('button', { name: 'Новая карта', exact: true }).click();
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  assert.deepEqual(errors, []);
  console.log('Browser checks passed: example, file import, editing, TXT preservation, validation, SVG/PNG/TXT downloads, mobile layout.');
} finally {
  await browser?.close();
  server?.kill();
}
