'use strict';

/**
 * Convert decorative/unsupported display-name glyphs into text that the
 * bundled Noto Arabic/Latin fonts can actually draw. Preserve ordinary
 * Arabic and Latin names, digits, and simple separators.
 */
function normalizeLeaderboardName(value, fallback = 'DOS Member') {
  const clean = (input) => String(input ?? '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF\u0640\uFE00-\uFE0F\u{E0100}-\u{E01EF}]/gu, '')
    .replace(/[^\p{Script=Arabic}\p{Script=Latin}\p{N}\p{M}\s._@-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return clean(value) || clean(fallback) || 'DOS Member';
}

module.exports = { normalizeLeaderboardName };
