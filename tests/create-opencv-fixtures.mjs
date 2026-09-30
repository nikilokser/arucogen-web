import { writeFile, mkdir } from 'node:fs/promises';
import { generateSvg, parseMap, DICTIONARY_NAMES, getDictionary, getMarkerMatrix } from '../src/core.js';
import { EXAMPLE } from '../src/example.js';
await mkdir('test-results', { recursive: true });
const markers = Array.from({ length: 50 }, (_, id) => ({ id, length: .15, x: (id % 10 - 4.5) * .2, y: (2 - Math.floor(id / 10)) * .2, z: 0, rot_z: 0, rot_y: 0, rot_x: 0 }));
await writeFile('test-results/all-markers.svg', generateSvg(markers, { width: 2000, height: 1200, scale: 1000 }));
await writeFile('test-results/example.svg', generateSvg(parseMap(EXAMPLE), { width: 2000, height: 2000, scale: 1000 }));
const matrices = {};
for (const name of DICTIONARY_NAMES) {
  const dictionary = getDictionary(name);
  matrices[name] = Array.from({ length: dictionary.count }, (_, id) => getMarkerMatrix(id, name));
  const sample = [0, Math.floor(dictionary.count / 2), dictionary.count - 1].map((id, index) => ({ id, length: (dictionary.markerSize + 2) * .024, x: (index - 1) * .3, y: 0, z: 0, rot_z: 0, rot_y: 0, rot_x: 0 }));
  await writeFile(`test-results/${name}.svg`, generateSvg(sample, { width: 900, height: 400, scale: 1000, dictionary: name }));
}
await writeFile('test-results/dictionaries.json', JSON.stringify(matrices));
