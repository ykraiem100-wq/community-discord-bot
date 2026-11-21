'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dos-bot-migration-'));
const file = path.join(dir, 'community.sqlite');
try {
  const old = new Database(file);
  old.exec(
    'CREATE TABLE members (guild_id TEXT NOT NULL,user_id TEXT NOT NULL,coins INTEGER NOT NULL DEFAULT 0,total_xp INTEGER NOT NULL DEFAULT 0,xp_progress INTEGER NOT NULL DEFAULT 0,messages INTEGER NOT NULL DEFAULT 0,voice_minutes INTEGER NOT NULL DEFAULT 0,voice_seconds INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(guild_id,user_id));' +
    "INSERT INTO members(guild_id,user_id,coins,total_xp,xp_progress,messages,voice_minutes,voice_seconds,updated_at) VALUES('old-guild','old-user',17,760,10,99,8,480,123);"
  );
  old.close();
  process.env.DATA_DIR = dir;
  const db = require('../src/database');
  const member = db.ensureMember('old-guild', 'old-user');
  assert.equal(member.coins, 17);
  assert.equal(member.total_xp, 760);
  assert.equal(member.text_xp, 760);
  assert.equal(member.messages, 99);
  assert.equal(member.voice_seconds, 480);
  assert.equal(member.coin_remainder, 10);
  db.close();
  console.log('Migration test passed.');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
