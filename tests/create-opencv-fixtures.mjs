import { writeFile, mkdir } from 'node:fs/promises';
import { generateSvg, parseMap } from '../src/core.js';
import { EXAMPLE } from '../src/example.js';
await mkdir('test-results', { recursive: true });
const markers = Array.from({ length: 50 }, (_, id) => ({ id, length: .15, x: (id % 10 - 4.5) * .2, y: (2 - Math.floor(id / 10)) * .2, z: 0, rot_z: 0, rot_y: 0, rot_x: 0 }));
await writeFile('test-results/all-markers.svg', generateSvg(markers, { width: 2000, height: 1200, scale: 1000 }));
await writeFile('test-results/example.svg', generateSvg(parseMap(EXAMPLE), { width: 2000, height: 2000, scale: 1000 }));
