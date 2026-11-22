'use strict';
const assert = require('node:assert/strict');
const { normalizeLeaderboardName } = require('../src/leaderboard-name');

assert.equal(normalizeLeaderboardName('𝖄𝖔𝖚𝖘𝖊𝖋', 'Yousef'), 'Yousef');
assert.equal(normalizeLeaderboardName('👑 𝕐𝕠𝕦𝕤𝕖𝕗 ⚔️', 'username'), 'Yousef');
assert.equal(normalizeLeaderboardName('يوسف DOS', 'fallback'), 'يوسف DOS');
assert.equal(normalizeLeaderboardName('يـوسـف', 'fallback'), 'يوسف');
assert.equal(normalizeLeaderboardName('👑⚔️', 'username'), 'username');
assert.equal(normalizeLeaderboardName('\u202Eيوسف\u202C', 'fallback'), 'يوسف');
console.log('Leaderboard name normalization tests passed.');
