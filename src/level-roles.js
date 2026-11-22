'use strict';

/**
 * Pick the highest configured reward reached and the earlier rewards that
 * should be replaced for the same progression type. A role also configured
 * for the other progression type is deliberately preserved.
 */
function getLevelRoleTransition(rows, level, otherKindRows = []) {
  const currentLevel = Number(level);
  if (!Number.isSafeInteger(currentLevel) || currentLevel < 1) {
    return { selected: null, previousRoleIds: [] };
  }

  const eligible = (Array.isArray(rows) ? rows : [])
    .filter((row) => row && Number.isSafeInteger(Number(row.level))
      && Number(row.level) >= 1 && Number(row.level) <= currentLevel
      && typeof row.role_id === 'string' && row.role_id.length > 0)
    .slice()
    .sort((a, b) => Number(a.level) - Number(b.level));

  const selected = eligible.length ? eligible[eligible.length - 1] : null;
  if (!selected) return { selected: null, previousRoleIds: [] };

  const protectedRoleIds = new Set(
    (Array.isArray(otherKindRows) ? otherKindRows : [])
      .map((row) => row && row.role_id)
      .filter((id) => typeof id === 'string' && id.length > 0)
  );
  const previousRoleIds = [...new Set(eligible
    .filter((row) => Number(row.level) < Number(selected.level)
      && row.role_id !== selected.role_id
      && !protectedRoleIds.has(row.role_id))
    .map((row) => row.role_id))];

  return { selected, previousRoleIds };
}

module.exports = { getLevelRoleTransition };
