'use strict';
function normalizeAnswer(value) {
  return String(value || '').toLowerCase().trim()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/[،,.!?؟:;"'`()\[\]{}]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
function answerMatches(input, expected) {
  const normalized = normalizeAnswer(input);
  if (!normalized) return false;
  return String(expected || '').split('|').some((answer) => normalizeAnswer(answer) === normalized);
}
module.exports = { normalizeAnswer, answerMatches };
