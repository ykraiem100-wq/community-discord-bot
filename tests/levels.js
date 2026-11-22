'use strict';
const assert = require('node:assert/strict');
const { DEFAULT_CURVE, xpToNextLevel, xpToReachLevel, levelProgress, difficultyFor } = require('../src/levels');

const expected = [100, 150, 250, 400, 500, 600];
expected.forEach((value, index) => assert.equal(xpToNextLevel(index), value));
assert.equal(xpToNextLevel(6), 750);
assert.equal(xpToNextLevel(7), 900);
assert.equal(xpToNextLevel(8), 1055);
assert.equal(xpToReachLevel(6), 2000);
assert.equal(xpToReachLevel(7), 2750);
assert.equal(xpToReachLevel(8), 3650);
assert.equal(levelProgress(1999).level, 5);
assert.equal(levelProgress(2000).level, 6);
assert.equal(levelProgress(2750).level, 7);
assert.equal(levelProgress(xpToReachLevel(100)).level, 100);
assert.equal(difficultyFor(3), 'بداية');
assert.equal(difficultyFor(50), 'صعب ومتزايد');
assert.equal(difficultyFor(100), 'صعب ومتزايد');
assert.equal(difficultyFor(101), 'نخبوي');

const adjusted = { ...DEFAULT_CURVE, firstLevels: [120, 180, 260, 420, 550, 700], level7Base: 900, growthStep: 10 };
assert.equal(xpToNextLevel(0, adjusted), 120);
assert.equal(xpToNextLevel(6, adjusted), 900);
assert.equal(xpToNextLevel(7, adjusted), 1050);
console.log('Level curve tests passed.');
