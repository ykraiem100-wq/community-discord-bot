'use strict';
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const dataDirectory = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
fs.mkdirSync(dataDirectory, { recursive: true });
const databasePath = path.join(dataDirectory, 'community.sqlite');
const db = new Database(databasePath);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');
db.pragma('foreign_keys = ON');

function columns(table) {
  return new Set(db.pragma('table_info(' + table + ')').map((item) => item.name));
}
function addColumn(table, column, definition) {
  if (!columns(table).has(column)) db.exec('ALTER TABLE ' + table + ' ADD COLUMN ' + column + ' ' + definition);
}

db.exec(
  'CREATE TABLE IF NOT EXISTS members (' +
    'guild_id TEXT NOT NULL, user_id TEXT NOT NULL, text_xp INTEGER NOT NULL DEFAULT 0, ' +
    'voice_xp INTEGER NOT NULL DEFAULT 0, total_xp INTEGER NOT NULL DEFAULT 0, ' +
    'coin_remainder INTEGER NOT NULL DEFAULT 0, coins INTEGER NOT NULL DEFAULT 0, ' +
    'messages INTEGER NOT NULL DEFAULT 0, voice_seconds INTEGER NOT NULL DEFAULT 0, ' +
    'updated_at INTEGER NOT NULL DEFAULT (unixepoch()), PRIMARY KEY (guild_id, user_id));' +
  'CREATE TABLE IF NOT EXISTS guild_settings (guild_id TEXT PRIMARY KEY, welcome_channel_id TEXT, shop_channel_id TEXT);' +
  'CREATE TABLE IF NOT EXISTS voice_sessions (guild_id TEXT NOT NULL, user_id TEXT NOT NULL, started_at INTEGER NOT NULL, PRIMARY KEY (guild_id, user_id));' +
  "CREATE TABLE IF NOT EXISTS level_roles (guild_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('text','voice')), level INTEGER NOT NULL, role_id TEXT NOT NULL, PRIMARY KEY(guild_id,kind,level));" +
  "CREATE TABLE IF NOT EXISTS shop_orders (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, user_id TEXT NOT NULL, item_key TEXT NOT NULL, item_name TEXT NOT NULL, price INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL DEFAULT (unixepoch()), reviewed_by TEXT, reviewed_at INTEGER);"
);

// Upgrade legacy tables in place. Member rows and coin balances are never dropped.
addColumn('members', 'text_xp', 'INTEGER NOT NULL DEFAULT 0');
addColumn('members', 'voice_xp', 'INTEGER NOT NULL DEFAULT 0');
addColumn('members', 'total_xp', 'INTEGER NOT NULL DEFAULT 0');
addColumn('members', 'coin_remainder', 'INTEGER NOT NULL DEFAULT 0');
addColumn('members', 'coins', 'INTEGER NOT NULL DEFAULT 0');
addColumn('members', 'messages', 'INTEGER NOT NULL DEFAULT 0');
addColumn('members', 'voice_seconds', 'INTEGER NOT NULL DEFAULT 0');
addColumn('members', 'updated_at', 'INTEGER NOT NULL DEFAULT 0');
const memberColumns = columns('members');
if (memberColumns.has('total_xp') && memberColumns.has('text_xp') && memberColumns.has('voice_xp')) {
  db.exec(
    'UPDATE members SET text_xp = total_xp WHERE text_xp = 0 AND voice_xp = 0 AND total_xp > 0;' +
    'UPDATE members SET coin_remainder = total_xp % 250 WHERE coin_remainder = 0 AND total_xp > 0;'
  );
}
if (memberColumns.has('voice_minutes')) {
  db.exec('UPDATE members SET voice_seconds = voice_minutes * 60 WHERE voice_seconds = 0 AND voice_minutes > 0');
}

const q = {
  get: db.prepare('SELECT * FROM members WHERE guild_id = ? AND user_id = ?'),
  ensure: db.prepare('INSERT OR IGNORE INTO members(guild_id,user_id) VALUES(?,?)'),
  update: db.prepare('UPDATE members SET text_xp=?,voice_xp=?,total_xp=?,coin_remainder=?,coins=coins+?,voice_seconds=voice_seconds+?,updated_at=unixepoch() WHERE guild_id=? AND user_id=?'),
  message: db.prepare('UPDATE members SET messages=messages+1,updated_at=unixepoch() WHERE guild_id=? AND user_id=?'),
  textTop: db.prepare('SELECT user_id,text_xp AS score FROM members WHERE guild_id=? ORDER BY score DESC LIMIT 10'),
  voiceTop: db.prepare('SELECT user_id,voice_xp AS score FROM members WHERE guild_id=? ORDER BY score DESC LIMIT 10'),
  coinTop: db.prepare('SELECT user_id,coins AS score FROM members WHERE guild_id=? ORDER BY score DESC LIMIT 10'),
  stats: db.prepare('SELECT COUNT(*) AS members,COALESCE(SUM(messages),0) AS messages,COALESCE(SUM(voice_seconds),0) AS voice_seconds,COALESCE(SUM(coins),0) AS coins FROM members WHERE guild_id=?'),
  voiceGet: db.prepare('SELECT * FROM voice_sessions WHERE guild_id=? AND user_id=?'),
  voiceAll: db.prepare('SELECT * FROM voice_sessions'),
  voiceStart: db.prepare('INSERT OR REPLACE INTO voice_sessions(guild_id,user_id,started_at) VALUES(?,?,?)'),
  voiceUpdate: db.prepare('UPDATE voice_sessions SET started_at=? WHERE guild_id=? AND user_id=?'),
  voiceStop: db.prepare('DELETE FROM voice_sessions WHERE guild_id=? AND user_id=?'),
  settings: db.prepare('SELECT * FROM guild_settings WHERE guild_id=?'),
  setWelcome: db.prepare('INSERT INTO guild_settings(guild_id,welcome_channel_id) VALUES(?,?) ON CONFLICT(guild_id) DO UPDATE SET welcome_channel_id=excluded.welcome_channel_id'),
  setShop: db.prepare('INSERT INTO guild_settings(guild_id,shop_channel_id) VALUES(?,?) ON CONFLICT(guild_id) DO UPDATE SET shop_channel_id=excluded.shop_channel_id'),
  setRole: db.prepare('INSERT INTO level_roles(guild_id,kind,level,role_id) VALUES(?,?,?,?) ON CONFLICT(guild_id,kind,level) DO UPDATE SET role_id=excluded.role_id'),
  roles: db.prepare('SELECT * FROM level_roles WHERE guild_id=? AND kind=? ORDER BY level ASC'),
  orderGet: db.prepare('SELECT * FROM shop_orders WHERE guild_id=? AND id=?'),
  orders: db.prepare("SELECT * FROM shop_orders WHERE guild_id=? AND status='pending' ORDER BY id ASC LIMIT 20"),
  orderCreate: db.prepare('INSERT INTO shop_orders(guild_id,user_id,item_key,item_name,price) VALUES(?,?,?,?,?)'),
  spend: db.prepare('UPDATE members SET coins=coins-?,updated_at=unixepoch() WHERE guild_id=? AND user_id=? AND coins>=?'),
  refund: db.prepare('UPDATE members SET coins=coins+?,updated_at=unixepoch() WHERE guild_id=? AND user_id=?'),
  orderReview: db.prepare("UPDATE shop_orders SET status=?,reviewed_by=?,reviewed_at=unixepoch() WHERE guild_id=? AND id=? AND status='pending'")
};

function ensureMember(guildId, userId) {
  q.ensure.run(guildId, userId);
  return q.get.get(guildId, userId);
}
function levelFor(xp) {
  return Math.floor(Math.sqrt(Math.max(0, Number(xp) || 0) / 100));
}
const addXpTransaction = db.transaction((guildId, userId, kind, amount, seconds, isMessage) => {
  const old = ensureMember(guildId, userId);
  const textXp = old.text_xp + (kind === 'text' ? amount : 0);
  const voiceXp = old.voice_xp + (kind === 'voice' ? amount : 0);
  const coinProgress = old.coin_remainder + amount;
  const coinsEarned = Math.floor(coinProgress / 250);
  q.update.run(textXp, voiceXp, textXp + voiceXp, coinProgress % 250, coinsEarned, seconds, guildId, userId);
  if (isMessage) q.message.run(guildId, userId);
  return {
    member: q.get.get(guildId, userId),
    oldTextLevel: levelFor(old.text_xp),
    newTextLevel: levelFor(textXp),
    oldVoiceLevel: levelFor(old.voice_xp),
    newVoiceLevel: levelFor(voiceXp),
    coinsEarned
  };
});
const purchaseTransaction = db.transaction((guildId, userId, key, name, price) => {
  ensureMember(guildId, userId);
  if (q.spend.run(price, guildId, userId, price).changes !== 1) return null;
  return Number(q.orderCreate.run(guildId, userId, key, name, price).lastInsertRowid);
});
const reviewTransaction = db.transaction((guildId, orderId, status, reviewerId) => {
  const order = q.orderGet.get(guildId, orderId);
  if (!order || order.status !== 'pending') return false;
  if (q.orderReview.run(status, reviewerId, guildId, orderId).changes !== 1) return false;
  if (status === 'rejected') q.refund.run(order.price, guildId, order.user_id);
  return true;
});
function addXp(guildId, userId, kind, amount, options) {
  options = options || {};
  if (kind !== 'text' && kind !== 'voice') throw new TypeError('Invalid XP kind');
  if (!Number.isSafeInteger(amount) || amount < 1) throw new TypeError('Invalid XP amount');
  return addXpTransaction(guildId, userId, kind, amount, options.seconds || 0, Boolean(options.message));
}
function setSetting(guildId, key, value) {
  if (key === 'welcome_channel_id') return q.setWelcome.run(guildId, value).changes > 0;
  if (key === 'shop_channel_id') return q.setShop.run(guildId, value).changes > 0;
  throw new TypeError('Unknown setting');
}
function setRole(guildId, kind, level, roleId) {
  if ((kind !== 'text' && kind !== 'voice') || !Number.isSafeInteger(level) || level < 1) throw new TypeError('Invalid level role');
  return q.setRole.run(guildId, kind, level, roleId).changes > 0;
}
function createPurchase(guildId, userId, key, name, price) {
  if (!Number.isSafeInteger(price) || price < 0) throw new TypeError('Invalid price');
  return purchaseTransaction(guildId, userId, key, name, price);
}
module.exports = {
  db, databasePath, ensureMember, levelFor, addXp,
  leaderboard: (guildId, kind) => (kind === 'voice' ? q.voiceTop : kind === 'coins' ? q.coinTop : q.textTop).all(guildId),
  stats: (guildId) => q.stats.get(guildId),
  startVoice: (guildId, userId, time) => q.voiceStart.run(guildId, userId, time || Date.now()),
  updateVoice: (guildId, userId, time) => q.voiceUpdate.run(time, guildId, userId),
  stopVoice: (guildId, userId) => q.voiceStop.run(guildId, userId),
  voice: (guildId, userId) => q.voiceGet.get(guildId, userId),
  allVoice: () => q.voiceAll.all(),
  settings: (guildId) => q.settings.get(guildId) || {},
  setSetting, roles: (guildId, kind) => q.roles.all(guildId, kind), setRole,
  createPurchase, orders: (guildId) => q.orders.all(guildId),
  reviewOrder: reviewTransaction, close: () => db.close()
};
