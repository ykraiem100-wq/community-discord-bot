'use strict';

// XP required to gain levels 1–6. From level 7 onward the requirement grows
// by a larger base amount plus an additional increase at every level.
const DEFAULT_CURVE = Object.freeze({
  firstLevels: Object.freeze([100, 150, 250, 400, 500, 600]),
  level7Base: 750,
  level7Increment: 150,
  growthStep: 5
});

function normalizeCurve(curve) {
  const source = curve || {};
  const raw = Array.isArray(source.firstLevels) ? source.firstLevels : DEFAULT_CURVE.firstLevels;
  const firstLevels = DEFAULT_CURVE.firstLevels.map((fallback, index) => {
    const value = Number(raw[index]);
    return Number.isSafeInteger(value) && value >= 1 ? value : fallback;
  });
  // Do not allow an invalid custom curve to make later levels easier.
  for (let i = 1; i < firstLevels.length; i += 1) {
    if (firstLevels[i] <= firstLevels[i - 1]) firstLevels[i] = Math.max(fallbackIncrement(firstLevels, i), firstLevels[i - 1] + 1);
  }
  const read = (key) => {
    const value = Number(source[key]);
    return Number.isSafeInteger(value) && value >= 0 ? value : DEFAULT_CURVE[key];
  };
  const level7Base = read('level7Base');
  const level7Increment = Math.max(1, read('level7Increment'));
  const growthStep = read('growthStep');
  return { firstLevels, level7Base: Math.max(level7Base, firstLevels[5] + 1), level7Increment, growthStep };
}
function fallbackIncrement(values, index) {
  return DEFAULT_CURVE.firstLevels[index];
}

function xpToNextLevel(level, curve) {
  const current = Math.max(0, Math.floor(Number(level) || 0));
  const c = normalizeCurve(curve);
  if (current < c.firstLevels.length) return c.firstLevels[current];
  const k = current - c.firstLevels.length;
  return c.level7Base + c.level7Increment * k + c.growthStep * k * (k - 1) / 2;
}

function xpToReachLevel(level, curve) {
  const target = Math.max(0, Math.floor(Number(level) || 0));
  const c = normalizeCurve(curve);
  const firstCount = Math.min(target, c.firstLevels.length);
  let total = c.firstLevels.slice(0, firstCount).reduce((sum, value) => sum + value, 0);
  const remaining = Math.max(0, target - c.firstLevels.length);
  if (remaining > 0) {
    total += remaining * c.level7Base;
    total += c.level7Increment * remaining * (remaining - 1) / 2;
    total += c.growthStep * remaining * (remaining - 1) * (remaining - 2) / 6;
  }
  return Math.floor(total);
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
  if (value <= 6) return 'بداية';
  if (value <= 100) return 'صعب ومتزايد';
  return 'نخبوي';
}

module.exports = { DEFAULT_CURVE, normalizeCurve, xpToNextLevel, xpToReachLevel, levelProgress, levelFor, difficultyFor };
