import { DEFAULT_DICTIONARY, getDictionary, markerRects, validateMap } from './core.js';

export const PRINT_PAPERS = Object.freeze({
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 },
});

export const PRINT_MARGIN_MM = 10;
const pt = mm => mm * 72 / 25.4;
const pdfNumber = value => value.toFixed(9).replace(/\.?0+$/, '');

export function printMarkerLimit(format) {
  if (!Object.hasOwn(PRINT_PAPERS, format)) throw new Error('Выберите формат A4 или A3.');
  return PRINT_PAPERS[format].width - 2 * PRINT_MARGIN_MM;
}

export function printFitError(markers, format) {
  const limit = printMarkerLimit(format);
  const index = markers.findIndex(marker => marker.length > limit / 1000);
  if (index < 0) return '';
  const marker = markers[index];
  const side = new Intl.NumberFormat('ru-RU', { maximumSignificantDigits: 15 }).format(marker.length * 1000);
  return `Метка ID ${marker.id} (строка ${index + 1}, ${side} мм) не помещается на ${format}. Максимум — ${limit} мм. Выберите больший формат или уменьшите метку в карте.`;
}

export function generatePrintPdf(markers, format, dictionary = DEFAULT_DICTIONARY) {
  validateMap(markers, dictionary);
  const error = printFitError(markers, format);
  if (error) throw new Error(error);

  const paper = PRINT_PAPERS[format];
  const width = pt(paper.width);
  const height = pt(paper.height);
  const cells = getDictionary(dictionary).markerSize + 2;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R /ViewerPreferences << /PrintScaling /None >> >>',
    '', // Page tree, populated after all page objects have been added.
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const pages = [];
  markers.forEach((marker, index) => {
    const side = pt(marker.length * 1000);
    const left = (width - side) / 2;
    const bottom = (height - side) / 2;
    const cell = side / cells;
    const instructions = ['0 g'];
    for (const rect of markerRects(marker.id, dictionary)) {
      instructions.push([
        left + rect.x * cell,
        bottom + (cells - rect.y - rect.height) * cell,
        rect.width * cell,
        rect.height * cell,
      ].map(pdfNumber).join(' ') + ' re');
    }
    instructions.push('f');
    instructions.push(`BT /F1 10 Tf ${pdfNumber(pt(PRINT_MARGIN_MM))} ${pdfNumber(height - pt(PRINT_MARGIN_MM))} Td (ID ${marker.id}   |   ${index + 1}/${markers.length}   |   ${pdfNumber(marker.length * 1000)} mm) Tj ET`);
    const stream = instructions.join('\n') + '\n';
    const page = objects.length + 1;
    pages.push(`${page} 0 R`);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pdfNumber(width)} ${pdfNumber(height)}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${page + 1} 0 R >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
  });
  objects[1] = `<< /Type /Pages /Count ${pages.length} /Kids [${pages.join(' ')}] >>`;

  // All objects are ASCII, so string offsets are also byte offsets.
  const chunks = ['%PDF-1.7\n'];
  const offsets = ['0000000000 65535 f \n'];
  let offset = chunks[0].length;
  objects.forEach((object, index) => {
    offsets.push(`${String(offset).padStart(10, '0')} 00000 n \n`);
    const chunk = `${index + 1} 0 obj\n${object}\nendobj\n`;
    chunks.push(chunk);
    offset += chunk.length;
  });
  chunks.push(`xref\n0 ${offsets.length}\n${offsets.join('')}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`);
  return chunks.join('');
}
