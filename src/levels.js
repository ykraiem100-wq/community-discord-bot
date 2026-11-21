'use strict';

const DEFAULT_CURVE = Object.freeze({
  easyBase: 100, easyStep: 4,
  mediumBase: 300, mediumStep: 10,
  hardBase: 800, hardStep: 20
});

function normalizeCurve(curve) {
  const source = curve || {};
  const out = {};
  for (const key of Object.keys(DEFAULT_CURVE)) {
    const value = Number(source[key]);
    out[key] = Number.isSafeInteger(value) && value >= 1 ? value : DEFAULT_CURVE[key];
  }
  return out;
}
function xpToNextLevel(level, curve) {
  const current = Math.max(0, Math.floor(Number(level) || 0));
  const c = normalizeCurve(curve);
  if (current < 50) return c.easyBase + current * c.easyStep;
  if (current < 100) return c.mediumBase + (current - 50) * c.mediumStep;
  return c.hardBase + (current - 100) * c.hardStep;
}
function xpToReachLevel(level, curve) {
  const target = Math.max(0, Math.floor(Number(level) || 0));
  const c = normalizeCurve(curve);
  const easy = Math.min(target, 50);
  const medium = Math.max(0, Math.min(target - 50, 50));
  const hard = Math.max(0, target - 100);
  const easyTotal = c.easyBase * easy + c.easyStep * easy * (easy - 1) / 2;
  const mediumTotal = c.mediumBase * medium + c.mediumStep * medium * (medium - 1) / 2;
  const hardTotal = c.hardBase * hard + c.hardStep * hard * (hard - 1) / 2;
  return easyTotal + mediumTotal + hardTotal;
}
function levelProgress(totalXp, curve) {
  const xp = Math.max(0, Math.floor(Number(totalXp) || 0));
  let low = 0;
  let high = 1;
  while (xpToReachLevel(high, curve) <= xp && high < 1000000) high *= 2;
  while (low + 1 < high) {
    const mid = Math.floor((low + high) / 2);
    if (xpToReachLevel(mid, curve) <= xp) low = mid;
    else high = mid;
  }
  const level = low;
  const intoLevel = xp - xpToReachLevel(level, curve);
  const needed = xpToNextLevel(level, curve);
  return { level, xp: intoLevel, needed, totalXp: xp, percent: Math.min(100, Math.floor((intoLevel / needed) * 100)) };
}
function levelFor(totalXp, curve) { return levelProgress(totalXp, curve).level; }
function difficultyFor(level) {
  const value = Math.max(0, Math.floor(Number(level) || 0));
  if (value <= 50) return 'سهل ← متوسط';
  if (value <= 100) return 'متوسط ← صعب';
  return 'صعب';
}
module.exports = { DEFAULT_CURVE, normalizeCurve, xpToNextLevel, xpToReachLevel, levelProgress, levelFor, difficultyFor };
