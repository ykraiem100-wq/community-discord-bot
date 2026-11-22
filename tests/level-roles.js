'use strict';
const assert = require('node:assert/strict');
const { getLevelRoleTransition } = require('../src/level-roles');

const configured = [
  { level: 5, role_id: 'bronze' },
  { level: 10, role_id: 'silver' },
  { level: 20, role_id: 'gold' },
  { level: 30, role_id: 'diamond' }
];

let result = getLevelRoleTransition(configured, 20);
assert.equal(result.selected.role_id, 'gold');
assert.deepEqual(result.previousRoleIds, ['bronze', 'silver']);

result = getLevelRoleTransition(configured, 7);
assert.equal(result.selected.role_id, 'bronze');
assert.deepEqual(result.previousRoleIds, []);

result = getLevelRoleTransition(configured, 20, [{ level: 3, role_id: 'silver' }]);
assert.equal(result.selected.role_id, 'gold');
assert.deepEqual(result.previousRoleIds, ['bronze']);

result = getLevelRoleTransition([
  { level: 5, role_id: 'same' },
  { level: 10, role_id: 'same' },
  { level: 20, role_id: 'next' }
], 20);
assert.deepEqual(result.previousRoleIds, ['same']);

result = getLevelRoleTransition(configured, 4);
assert.equal(result.selected, null);
assert.deepEqual(result.previousRoleIds, []);

console.log('Level role replacement tests passed.');
