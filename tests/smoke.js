'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dos-bot-smoke-'));
process.env.DATA_DIR = dir;
const db = require('../src/database');
try {
  const guild = 'guild-test';
  const user = 'user-test';
  assert.equal(db.ensureMember(guild, user).coins, 0);
  let result = db.addXp(guild, user, 'text', 250, { message: true });
  assert.equal(result.member.coins, 1);
  assert.equal(result.member.text_xp, 250);
  assert.equal(result.member.messages, 1);
  result = db.addXp(guild, user, 'voice', 9, { seconds: 60 });
  assert.equal(result.member.voice_xp, 9);
  assert.equal(result.member.total_xp, 259);
  const order = db.createPurchase(guild, user, 'legacy-test', 'Legacy item', 1);
  assert.ok(order > 0);
  assert.equal(db.ensureMember(guild, user).coins, 0);
  assert.equal(db.reviewOrder(guild, order, 'rejected', 'admin'), true);
  assert.equal(db.ensureMember(guild, user).coins, 1);
  assert.equal(db.reviewOrder(guild, order, 'rejected', 'admin'), false);
  assert.equal(db.leaderboard(guild, 'text')[0].score, 250);
  assert.equal(db.leaderboard(guild, 'voice')[0].score, 9);
  assert.equal(db.leaderboard(guild, 'coins')[0].score, 1);
  db.setSetting(guild, 'shop_channel_id', 'shop');
  assert.equal(db.settings(guild).shop_channel_id, 'shop');
  db.setRole(guild, 'text', 5, 'role');
  assert.equal(db.roles(guild, 'text')[0].role_id, 'role');
  db.close();
  console.log('Smoke test passed.');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
