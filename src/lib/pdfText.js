// Turns one page's pdf.js text items into a string.
// Kept separate and dependency-free so it can be tested headlessly.

export function pageItemsToText(items) {
  if (!Array.isArray(items)) return '';
  return items
    .map((item) => (item && typeof item.str === 'string' ? item.str : ''))
    .join(' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}
