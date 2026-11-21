const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

const dataDir = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), "data"));
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, "community.sqlite");
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");

// Create the current schema for fresh installations.
db.exec(`
  CREATE TABLE IF NOT EXISTS members (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    text_xp INTEGER NOT NULL DEFAULT 0,
    voice_xp INTEGER NOT NULL DEFAULT 0,
    total_xp INTEGER NOT NULL DEFAULT 0,
    coin_remainder INTEGER NOT NULL DEFAULT 0,
    coins INTEGER NOT NULL DEFAULT 0,
    messages INTEGER NOT NULL DEFAULT 0,
    voice_seconds INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (guild_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS guild_settings (
    guild_id TEXT PRIMARY KEY,
    welcome_channel_id TEXT,
    shop_channel_id TEXT
  );

  CREATE TABLE IF NOT EXISTS voice_sessions (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    PRIMARY KEY (guild_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS level_roles (
    guild_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    level INTEGER NOT NULL,
    role_id TEXT NOT NULL,
    PRIMARY KEY (guild_id, kind, level)
  );

  CREATE TABLE IF NOT EXISTS shop_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    item_key TEXT NOT NULL,
    item_name TEXT NOT NULL,
    price INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    reviewed_by TEXT,
    reviewed_at INTEGER
  );
`);

// Older releases used a different members layout. Add missing columns in place;
// never drop or recreate the table, so existing coins and member records survive.
function ensureColumn(table, column, definition) {
  const columns = new Set(db.pragma(`table_info(${table})`).map((item) => item.name));
  if (!columns.has(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn("members", "text_xp", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("members", "voice_xp", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("members", "total_xp", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("members", "coin_remainder", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("members", "coins", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("members", "messages", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("members", "voice_seconds", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("members", "updated_at", "INTEGER NOT NULL DEFAULT 0");

const memberColumns = new Set(db.pragma("table_info(members)").map((item) => item.name));

// Preserve XP from the legacy total_xp field. The previous version did not
// separate text and voice XP, so legacy XP is carried forward as text XP.
if (memberColumns.has("total_xp")) {
  db.exec(`
    UPDATE members
    SET text_xp = total_xp
    WHERE text_xp = 0 AND voice_xp = 0 AND total_xp > 0
  `);
  db.exec(`
    UPDATE members
    SET coin_remainder = total_xp % 250
    WHERE coin_remainder = 0 AND total_xp > 0
  `);
}

if (memberColumns.has("voice_minutes")) {
  db.exec(`
    UPDATE members
    SET voice_seconds = voice_minutes * 60
    WHERE voice_seconds = 0 AND voice_minutes > 0
  `);
}

const q = {
  get: db.prepare("SELECT * FROM members WHERE guild_id = ? AND user_id = ?"),
  ensure: db.prepare("INSERT OR IGNORE INTO members(guild_id, user_id) VALUES(?, ?)"),
  message: db.prepare("UPDATE members SET messages = messages + 1 WHERE guild_id = ? AND user_id = ?"),
  update: db.prepare(`
    UPDATE members
    SET text_xp = ?, voice_xp = ?, total_xp = ?, coin_remainder = ?,
        coins = coins + ?, voice_seconds = voice_seconds + ?,
        updated_at = unixepoch()
    WHERE guild_id = ? AND user_id = ?
  `),
  spend: db.prepare("UPDATE members SET coins = coins - ? WHERE guild_id = ? AND user_id = ? AND coins >= ?"),
  stats: db.prepare("SELECT COUNT(*) members, COALESCE(SUM(messages), 0) messages, COALESCE(SUM(voice_seconds), 0) voice_seconds, COALESCE(SUM(coins), 0) coins FROM members WHERE guild_id = ?"),
  settings: db.prepare("SELECT * FROM guild_settings WHERE guild_id = ?"),
  setSettings: db.prepare("INSERT INTO guild_settings(guild_id, welcome_channel_id, shop_channel_id) VALUES(?, ?, ?) ON CONFLICT(guild_id) DO UPDATE SET welcome_channel_id = COALESCE(excluded.welcome_channel_id, guild_settings.welcome_channel_id), shop_channel_id = COALESCE(excluded.shop_channel_id, guild_settings.shop_channel_id)"),
  voiceStart: db.prepare("INSERT OR IGNORE INTO voice_sessions(guild_id, user_id, started_at) VALUES(?, ?, ?)"),
  voiceGet: db.prepare("SELECT * FROM voice_sessions WHERE guild_id = ? AND user_id = ?"),
  voiceAll: db.prepare("SELECT * FROM voice_sessions"),
  voiceUpdate: db.prepare("UPDATE voice_sessions SET started_at = ? WHERE guild_id = ? AND user_id = ?"),
  voiceStop: db.prepare("DELETE FROM voice_sessions WHERE guild_id = ? AND user_id = ?"),
  roleSet: db.prepare("INSERT INTO level_roles(guild_id, kind, level, role_id) VALUES(?, ?, ?, ?) ON CONFLICT(guild_id, kind, level) DO UPDATE SET role_id = excluded.role_id"),
  roles: db.prepare("SELECT * FROM level_roles WHERE guild_id = ? AND kind = ? ORDER BY level"),
  orderCreate: db.prepare("INSERT INTO shop_orders(guild_id, user_id, item_key, item_name, price) VALUES(?, ?, ?, ?, ?)"),
  orderGet: db.prepare("SELECT * FROM shop_orders WHERE guild_id = ? AND id = ?"),
  orders: db.prepare("SELECT * FROM shop_orders WHERE guild_id = ? AND status = 'pending' ORDER BY id LIMIT 20"),
  orderReview: db.prepare("UPDATE shop_orders SET status = ?, reviewed_by = ?, reviewed_at = unixepoch() WHERE guild_id = ? AND id = ? AND status = 'pending'")
};

function ensure(guildId, userId) {
  q.ensure.run(guildId, userId);
  return q.get.get(guildId, userId);
}

function level(xp) {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 100));
}

function addXp(guildId, userId, kind, amount, options = {}) {
  const old = ensure(guildId, userId);
  const textXp = old.text_xp + (kind === "text" ? amount : 0);
  const voiceXp = old.voice_xp + (kind === "voice" ? amount : 0);
  const earnedXp = old.coin_remainder + amount;
  const coinsEarned = Math.floor(earnedXp / 250);

  q.update.run(
    textXp,
    voiceXp,
    textXp + voiceXp,
    earnedXp % 250,
    coinsEarned,
    options.seconds || 0,
    guildId,
    userId
  );

  if (options.message) q.message.run(guildId, userId);

  return {
    member: q.get.get(guildId, userId),
    oldTextLevel: level(old.text_xp),
    newTextLevel: level(textXp),
    oldVoiceLevel: level(old.voice_xp),
    newVoiceLevel: level(voiceXp),
    coins: coinsEarned
  };
}

function spend(guildId, userId, amount) {
  ensure(guildId, userId);
  return q.spend.run(amount, guildId, userId, amount).changes === 1;
}

function startVoice(guildId, userId, now = Date.now()) {
  ensure(guildId, userId);
  q.voiceStart.run(guildId, userId, now);
}

function voice(guildId, userId) {
  return q.voiceGet.get(guildId, userId);
}

function allVoice() {
  return q.voiceAll.all();
}

function updateVoice(guildId, userId, timestamp) {
  q.voiceUpdate.run(timestamp, guildId, userId);
}

function stopVoice(guildId, userId) {
  q.voiceStop.run(guildId, userId);
}

function stats(guildId) {
  return q.stats.get(guildId);
}

function leaderboard(guildId, kind) {
  const column = kind === "voice" ? "voice_xp" : kind === "coins" ? "coins" : "text_xp";
  return db.prepare(`SELECT user_id, ${column} score FROM members WHERE guild_id = ? ORDER BY ${column} DESC LIMIT 10`).all(guildId);
}

function settings(guildId) {
  return q.settings.get(guildId) || {};
}

function setSetting(guildId, key, value) {
  const current = settings(guildId);
  q.setSettings.run(
    guildId,
    key === "welcome_channel_id" ? value : current.welcome_channel_id || null,
    key === "shop_channel_id" ? value : current.shop_channel_id || null
  );
}

function setRole(guildId, kind, levelNumber, roleId) {
  q.roleSet.run(guildId, kind, levelNumber, roleId);
}

function roles(guildId, kind) {
  return q.roles.all(guildId, kind);
}

function createOrder(guildId, userId, key, name, price) {
  return Number(q.orderCreate.run(guildId, userId, key, name, price).lastInsertRowid);
}

function getOrder(guildId, id) {
  return q.orderGet.get(guildId, id);
}

function orders(guildId) {
  return q.orders.all(guildId);
}

function review(guildId, id, status, reviewerId) {
  return q.orderReview.run(status, reviewerId, guildId, id).changes === 1;
}

module.exports = {
  db, ensure, level, addXp, spend, startVoice, voice, allVoice,
  updateVoice, stopVoice, stats, leaderboard, settings, setSetting,
  setRole, roles, createOrder, getOrder, orders, review
};
