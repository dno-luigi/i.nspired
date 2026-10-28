// Turns an uploaded file into text, matching what the old front end accepted:
// PDF through pdf.js, DOCX through mammoth, everything else as plain text.

import { extractPdfText } from './pdf';

const isPdf = (file) => /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
const isDocx = (file) => /\.docx$/i.test(file.name);

export async function readFileToText(file) {
  if (isPdf(file)) {
    const { pages, text } = await extractPdfText(file);
    return { text, pages };
  }

  if (isDocx(file)) {
    const mammoth = await import('mammoth');
    const lib = mammoth.default || mammoth;
    const buffer = await file.arrayBuffer();
    const result = await lib.extractRawText({ arrayBuffer: buffer });
    return { text: result.value || '', pages: null };
  }

  return { text: await file.text(), pages: null };
}
