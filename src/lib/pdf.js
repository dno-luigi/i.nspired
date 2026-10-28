// PDF text extraction, in the browser.
//
// This Worker only accepts text in `content` and calls a text chat model, so a
// docket has to be read here and sent as text. pdf.js is loaded on demand.

import { pageItemsToText } from './pdfText';

let loading = null;

// The legacy build is used on purpose: the modern one needs browser APIs
// (Promise.withResolvers and friends) that older phone browsers lack, and it
// fails before reading a single page. The worker is constructed by Vite
// (`?worker`) rather than pointing workerSrc at a URL, which avoids the
// "fake worker" failure that leaves every PDF unread.
function loadPdfjs() {
  if (!loading) {
    loading = (async () => {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      try {
        const Worker = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker')).default;
        pdfjs.GlobalWorkerOptions.workerPort = new Worker();
      } catch (e) {
        // Without a worker, pdf.js reads on the main thread: slower, still works.
        pdfjs.GlobalWorkerOptions.workerPort = null;
      }
      return pdfjs;
    })();
  }
  return loading;
}

/**
 * Read a PDF file into plain text.
 * Resolves with { pages, text }.
 */
export async function extractPdfText(file) {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());

  // The loading task owns the document; newer builds no longer expose
  // destroy() on the document proxy itself.
  let task;
  let doc;
  try {
    task = pdfjs.getDocument({ data, isEvalSupported: false });
    doc = await task.promise;
  } catch (e) {
    if (e && e.name === 'PasswordException') {
      throw new Error('That PDF is password protected. Remove the password and try again.');
    }
    // Keep the real reason: a generic message once hid a browser-support
    // failure and made the upload look like it did nothing.
    throw new Error(`PDF could not be read${e && e.message ? `: ${e.message}` : '.'}`);
  }

  const pageCount = doc.numPages;
  const pages = [];

  try {
    for (let i = 1; i <= pageCount; i += 1) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pages.push(pageItemsToText(content.items));
      page.cleanup();
    }
  } finally {
    if (task && typeof task.destroy === 'function') await task.destroy();
    else if (doc && typeof doc.destroy === 'function') await doc.destroy();
  }

  const text = pages.join('\n\n').trim();
  if (!text) {
    throw new Error('No text found in that PDF. It may be a scan, which needs OCR first.');
  }
  return { pages: pageCount, text };
}
