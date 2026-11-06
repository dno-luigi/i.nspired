// Turns an uploaded file into text.
//
// The Worker only takes text, so anything attached is read here: PDF through
// pdf.js, DOCX through mammoth, HTML/RTF through a light strip, and anything
// else as plain text. Formats that cannot be read in a browser say so plainly
// instead of pasting binary noise into the docket.

import { extractPdfText } from './pdf';

const nameOf = (file) => (file && file.name) || 'that file';

function extOf(file) {
  const match = /\.([a-z0-9]+)$/i.exec(nameOf(file));
  return match ? match[1].toLowerCase() : '';
}

const typeOf = (file) => (file && file.type) || '';

const isPdf = (file) => extOf(file) === 'pdf' || typeOf(file) === 'application/pdf';
const isDocx = (file) =>
  extOf(file) === 'docx' ||
  typeOf(file) === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const isLegacyDoc = (file) => extOf(file) === 'doc' || typeOf(file) === 'application/msword';
const isOutlookMsg = (file) => extOf(file) === 'msg' || typeOf(file) === 'application/vnd.ms-outlook';
const isHtml = (file) => ['html', 'htm', 'xhtml'].includes(extOf(file)) || typeOf(file) === 'text/html';
const isRtf = (file) => extOf(file) === 'rtf' || /rtf$/i.test(typeOf(file));
const isImage = (file) =>
  /^image\//.test(typeOf(file)) || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif', 'tif', 'tiff', 'bmp'].includes(extOf(file));

// file.text() will happily return garbage for a .zip or a .doc, and that
// garbage would be sent as docket text. Control characters give it away.
function looksBinary(text) {
  const sample = text.slice(0, 4000);
  if (!sample) return false;
  let bad = 0;
  for (let i = 0; i < sample.length; i += 1) {
    const code = sample.charCodeAt(i);
    if (code === 0 || code === 65533 || (code < 9) || (code > 13 && code < 32)) bad += 1;
  }
  return bad / sample.length > 0.02;
}

async function readHtml(file) {
  const raw = await file.text();
  const doc = new DOMParser().parseFromString(raw, 'text/html');
  doc.querySelectorAll('script, style, noscript, head').forEach((el) => el.remove());
  const body = (doc.body && doc.body.textContent) || '';
  return body
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

function readRtf(file) {
  return file
    .text()
    .then((raw) =>
      raw
        .replace(/\\'([0-9a-f]{2})/gi, (m, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/\\u(-?\d+)\??/g, (m, code) => String.fromCharCode(((parseInt(code, 10) + 65536) % 65536)))
        .replace(/\{\\\*[^{}]*\}/g, ' ')
        .replace(/\\par[d]?\b/g, '\n')
        .replace(/\\[a-z]+-?\d* ?/gi, '')
        .replace(/[{}]/g, '')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\n\s*\n\s*\n+/g, '\n\n')
        .trim()
    );
}

/**
 * Read one file into text. Resolves with { text, pages, note }.
 * Throws with a message meant for the person who picked the file.
 */
export async function readFileToText(file) {
  if (isLegacyDoc(file)) {
    throw new Error('Word .doc files cannot be read in a browser. Save it as .docx or PDF and attach that.');
  }

  if (isOutlookMsg(file)) {
    throw new Error('Outlook .msg files cannot be read in a browser. Save the email as .eml, .txt, or PDF.');
  }

  if (isImage(file)) {
    throw new Error('Photos and scans need OCR first, which this page does not do yet. Attach a text PDF, or paste the text.');
  }

  if (isPdf(file)) {
    const { pages, text } = await extractPdfText(file);
    return { text, pages, note: null };
  }

  if (isDocx(file)) {
    const mammoth = await import('mammoth');
    const lib = mammoth.default || mammoth;
    const buffer = await file.arrayBuffer();
    const result = await lib.extractRawText({ arrayBuffer: buffer });
    const text = (result.value || '').trim();
    if (!text) throw new Error('No text found in that document.');
    return { text, pages: null, note: null };
  }

  if (isHtml(file)) {
    const text = await readHtml(file);
    if (!text) throw new Error('No text found in that page. It may be a script-only page.');
    return { text, pages: null, note: 'text only' };
  }

  if (isRtf(file)) {
    const text = await readRtf(file);
    if (!text) throw new Error('No text found in that RTF file.');
    return { text, pages: null, note: 'converted from RTF' };
  }

  const raw = await file.text();
  if (looksBinary(raw)) {
    throw new Error('That file is not text. Attach a PDF, DOCX, or text file.');
  }
  const text = raw.trim();
  if (!text) throw new Error('No text found in that file.');
  return { text, pages: null, note: null };
}
