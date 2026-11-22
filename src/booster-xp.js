'use strict';

const DEFAULT_BOOSTER_MULTIPLIER = 1.5;
const MAX_BOOSTER_MULTIPLIER = 5;

function normalizeBoosterMultiplier(value, fallback = DEFAULT_BOOSTER_MULTIPLIER) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1 || number > MAX_BOOSTER_MULTIPLIER) return fallback;
  return Math.round(number * 100) / 100;
}

function hasRole(member, roleId) {
  if (!roleId) return true;
  const cache = member && member.roles && member.roles.cache;
  if (cache && typeof cache.has === 'function') return cache.has(roleId);
  return Boolean(member && Array.isArray(member.roles) && member.roles.includes(roleId));
}

function isEligibleBooster(member, requiredRoleId = '') {
  if (!member) return false;
  const isBoosting = Boolean(member.premiumSince || member.premiumSinceTimestamp);
  return isBoosting && hasRole(member, requiredRoleId);
}

function getBoosterMultiplier(member, roleId, configuredMultiplier) {
  if (!isEligibleBooster(member, roleId)) return 1;
  return normalizeBoosterMultiplier(configuredMultiplier);
}

function applyXpMultiplier(baseXp, multiplier) {
  const base = Math.max(0, Math.floor(Number(baseXp) || 0));
  const safeMultiplier = normalizeBoosterMultiplier(multiplier, 1);
  return Math.max(0, Math.round(base * safeMultiplier));
}

module.exports = {
  DEFAULT_BOOSTER_MULTIPLIER,
  MAX_BOOSTER_MULTIPLIER,
  normalizeBoosterMultiplier,
  isEligibleBooster,
  getBoosterMultiplier,
  applyXpMultiplier
};
