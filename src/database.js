'use strict';
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { levelFor: baseLevelFor, normalizeCurve } = require('./levels');

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

// Base schema from v2 is kept. New features are additive so member balances survive upgrades.
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
  "CREATE TABLE IF NOT EXISTS shop_orders (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, user_id TEXT NOT NULL, item_key TEXT NOT NULL, item_name TEXT NOT NULL, price INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL DEFAULT (unixepoch()), reviewed_by TEXT, reviewed_at INTEGER);" +
  'CREATE TABLE IF NOT EXISTS guild_content (guild_id TEXT NOT NULL, content_key TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, updated_by TEXT, updated_at INTEGER NOT NULL DEFAULT (unixepoch()), PRIMARY KEY(guild_id,content_key));' +
  'CREATE TABLE IF NOT EXISTS guild_features (guild_id TEXT NOT NULL, feature_key TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, updated_by TEXT, updated_at INTEGER NOT NULL DEFAULT (unixepoch()), PRIMARY KEY(guild_id,feature_key));' +
  'CREATE TABLE IF NOT EXISTS guild_config (guild_id TEXT NOT NULL, config_key TEXT NOT NULL, config_value TEXT NOT NULL, updated_by TEXT, updated_at INTEGER NOT NULL DEFAULT (unixepoch()), PRIMARY KEY(guild_id,config_key));' +
  "CREATE TABLE IF NOT EXISTS shop_products (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', price REAL NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'coin', cash_currency TEXT NOT NULL DEFAULT 'JOD', product_type TEXT NOT NULL DEFAULT 'manual', image_url TEXT, payment_url TEXT, role_id TEXT, duration_days INTEGER NOT NULL DEFAULT 30, active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL DEFAULT (unixepoch()), updated_at INTEGER NOT NULL DEFAULT (unixepoch()));" +
  "CREATE TABLE IF NOT EXISTS product_purchases (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, user_id TEXT NOT NULL, product_id INTEGER NOT NULL, product_name TEXT NOT NULL, price REAL NOT NULL, currency TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL DEFAULT (unixepoch()), updated_at INTEGER NOT NULL DEFAULT (unixepoch()), metadata_json TEXT NOT NULL DEFAULT '{}', reviewed_by TEXT, reviewed_at INTEGER);" +
  'CREATE TABLE IF NOT EXISTS custom_color_roles (guild_id TEXT NOT NULL, user_id TEXT NOT NULL, role_id TEXT NOT NULL, updated_at INTEGER NOT NULL DEFAULT (unixepoch()), PRIMARY KEY(guild_id,user_id));' +
  'CREATE TABLE IF NOT EXISTS private_rooms (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, user_id TEXT NOT NULL, channel_id TEXT NOT NULL, channel_type TEXT NOT NULL, product_id INTEGER NOT NULL, expires_at INTEGER NOT NULL, warning_sent INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL DEFAULT (unixepoch()));' +
  'CREATE TABLE IF NOT EXISTS interaction_roles (guild_id TEXT NOT NULL, role_id TEXT NOT NULL, role_name TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(guild_id,role_id));' +
  'CREATE TABLE IF NOT EXISTS xp_events (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, user_id TEXT NOT NULL, event_type TEXT NOT NULL, amount INTEGER NOT NULL, created_at INTEGER NOT NULL DEFAULT (unixepoch()));' +
  'CREATE INDEX IF NOT EXISTS idx_xp_events_guild_date ON xp_events(guild_id,created_at);' +
  'CREATE TABLE IF NOT EXISTS admin_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, user_id TEXT NOT NULL, action TEXT NOT NULL, details TEXT NOT NULL DEFAULT \'\', created_at INTEGER NOT NULL DEFAULT (unixepoch()));' +
  'CREATE TABLE IF NOT EXISTS invite_snapshots (guild_id TEXT NOT NULL, code TEXT NOT NULL, inviter_id TEXT, uses INTEGER NOT NULL DEFAULT 0, max_uses INTEGER NOT NULL DEFAULT 0, expires_at INTEGER, updated_at INTEGER NOT NULL DEFAULT (unixepoch()), PRIMARY KEY(guild_id,code));' +
  'CREATE TABLE IF NOT EXISTS member_invites (guild_id TEXT NOT NULL, joined_user_id TEXT NOT NULL, inviter_id TEXT NOT NULL, invite_code TEXT NOT NULL, joined_at INTEGER NOT NULL DEFAULT (unixepoch()), PRIMARY KEY(guild_id,joined_user_id));' +
  'CREATE INDEX IF NOT EXISTS idx_member_invites_inviter ON member_invites(guild_id,inviter_id);' +
  "CREATE TABLE IF NOT EXISTS daily_question_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, date_key TEXT NOT NULL, channel_id TEXT NOT NULL, question_key TEXT NOT NULL, question_text TEXT NOT NULL, answer_text TEXT NOT NULL, reward_coins INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'pending', message_id TEXT, scheduled_at INTEGER NOT NULL, sent_at INTEGER, winner_id TEXT, answered_at INTEGER, created_at INTEGER NOT NULL DEFAULT (unixepoch()), UNIQUE(guild_id,date_key));" +
  'CREATE INDEX IF NOT EXISTS idx_daily_question_open ON daily_question_runs(guild_id,status);' +
  "CREATE TABLE IF NOT EXISTS guild_tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', period TEXT NOT NULL DEFAULT 'daily' CHECK(period IN ('daily','weekly')), tracking_type TEXT NOT NULL DEFAULT 'manual' CHECK(tracking_type IN ('xp','messages','manual')), threshold INTEGER NOT NULL DEFAULT 1, channel_id TEXT, reward_type TEXT NOT NULL DEFAULT 'coins' CHECK(reward_type IN ('coins','xp')), reward_amount INTEGER NOT NULL DEFAULT 1, max_winners INTEGER NOT NULL DEFAULT 3, enabled INTEGER NOT NULL DEFAULT 1, created_by TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()));" +
  "CREATE TABLE IF NOT EXISTS task_progress (guild_id TEXT NOT NULL, task_id INTEGER NOT NULL, user_id TEXT NOT NULL, period_key TEXT NOT NULL, progress INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'progress' CHECK(status IN ('progress','pending','awarded','rejected')), proof TEXT NOT NULL DEFAULT '', completed_at INTEGER, awarded_at INTEGER, PRIMARY KEY(guild_id,task_id,user_id,period_key));" +
  'CREATE INDEX IF NOT EXISTS idx_task_progress_claims ON task_progress(guild_id,status,completed_at);' +
  'CREATE TABLE IF NOT EXISTS dm_announcement_subscribers (guild_id TEXT NOT NULL, user_id TEXT NOT NULL, created_at INTEGER NOT NULL DEFAULT (unixepoch()), PRIMARY KEY(guild_id,user_id));' +
  "CREATE TABLE IF NOT EXISTS dm_broadcast_jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, created_by TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','completed','cancelled')), total_count INTEGER NOT NULL DEFAULT 0, sent_count INTEGER NOT NULL DEFAULT 0, failed_count INTEGER NOT NULL DEFAULT 0, skipped_count INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT (unixepoch()), updated_at INTEGER NOT NULL DEFAULT (unixepoch()));" +
  "CREATE TABLE IF NOT EXISTS dm_broadcast_recipients (job_id INTEGER NOT NULL, user_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','failed','skipped')), error TEXT NOT NULL DEFAULT '', attempted_at INTEGER, PRIMARY KEY(job_id,user_id));" +
  'CREATE INDEX IF NOT EXISTS idx_dm_broadcast_queue ON dm_broadcast_recipients(job_id,status);' +
  "CREATE TABLE IF NOT EXISTS genie_sessions (guild_id TEXT NOT NULL, user_id TEXT NOT NULL, channel_id TEXT NOT NULL, message_id TEXT NOT NULL, state_json TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed')), created_at INTEGER NOT NULL DEFAULT (unixepoch()), updated_at INTEGER NOT NULL DEFAULT (unixepoch()), PRIMARY KEY(guild_id,user_id));" +
  'CREATE INDEX IF NOT EXISTS idx_genie_sessions_status ON genie_sessions(guild_id,status);' +
  "CREATE TABLE IF NOT EXISTS genie_stats (guild_id TEXT NOT NULL, user_id TEXT NOT NULL, total_games INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0, questions_total INTEGER NOT NULL DEFAULT 0, coins_earned INTEGER NOT NULL DEFAULT 0, last_played_at INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(guild_id,user_id));" +
  'CREATE INDEX IF NOT EXISTS idx_genie_stats_wins ON genie_stats(guild_id,wins DESC,total_games ASC);'
);

// Additive migration for databases created by older versions.
addColumn('members', 'text_xp', 'INTEGER NOT NULL DEFAULT 0');
addColumn('members', 'voice_xp', 'INTEGER NOT NULL DEFAULT 0');
addColumn('members', 'total_xp', 'INTEGER NOT NULL DEFAULT 0');
addColumn('members', 'coin_remainder', 'INTEGER NOT NULL DEFAULT 0');
addColumn('members', 'coins', 'INTEGER NOT NULL DEFAULT 0');
addColumn('members', 'messages', 'INTEGER NOT NULL DEFAULT 0');
addColumn('members', 'voice_seconds', 'INTEGER NOT NULL DEFAULT 0');
addColumn('members', 'updated_at', 'INTEGER NOT NULL DEFAULT 0');
addColumn('guild_settings', 'panel_channel_id', 'TEXT');
addColumn('guild_settings', 'panel_message_id', 'TEXT');
addColumn('guild_settings', 'shop_category_id', 'TEXT');
addColumn('guild_settings', 'shop_message_id', 'TEXT');
addColumn('guild_settings', 'level_up_channel_id', 'TEXT');
addColumn('shop_products', 'cash_currency', "TEXT NOT NULL DEFAULT 'JOD'");
addColumn('custom_color_roles', 'expires_at', 'INTEGER');
addColumn('private_rooms', 'panel_message_id', 'TEXT');
addColumn('private_rooms', 'voice_locked', 'INTEGER NOT NULL DEFAULT 0');
// Existing custom-color roles receive a fresh 30-day grace period on first upgrade.
db.exec('UPDATE custom_color_roles SET expires_at=unixepoch()+2592000 WHERE expires_at IS NULL');
const memberColumns = columns('members');
if (memberColumns.has('total_xp') && memberColumns.has('text_xp') && memberColumns.has('voice_xp')) {
  db.exec('UPDATE members SET text_xp = total_xp WHERE text_xp = 0 AND voice_xp = 0 AND total_xp > 0');
  // Preserve the exact legacy XP carry-over when it exists. Derive it only for
  // older schemas that never stored a separate remainder, to avoid re-awarding coins.
  if (memberColumns.has('xp_progress')) {
    db.exec('UPDATE members SET coin_remainder = xp_progress WHERE coin_remainder = 0 AND xp_progress > 0');
  } else {
    db.exec('UPDATE members SET coin_remainder = total_xp % 250 WHERE coin_remainder = 0 AND total_xp > 0');
  }
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
  totalTop: db.prepare('SELECT user_id,total_xp AS score FROM members WHERE guild_id=? ORDER BY score DESC LIMIT 10'),
  voiceTop: db.prepare('SELECT user_id,voice_xp AS score FROM members WHERE guild_id=? ORDER BY score DESC LIMIT 10'),
  coinTop: db.prepare('SELECT user_id,coins AS score FROM members WHERE guild_id=? ORDER BY score DESC LIMIT 10'),
  stats: db.prepare('SELECT COUNT(*) AS members,COALESCE(SUM(messages),0) AS messages,COALESCE(SUM(voice_seconds),0) AS voice_seconds,COALESCE(SUM(coins),0) AS coins,COALESCE(SUM(total_xp),0) AS total_xp FROM members WHERE guild_id=?'),
  voiceGet: db.prepare('SELECT * FROM voice_sessions WHERE guild_id=? AND user_id=?'),
  voiceAll: db.prepare('SELECT * FROM voice_sessions'),
  voiceStart: db.prepare('INSERT OR REPLACE INTO voice_sessions(guild_id,user_id,started_at) VALUES(?,?,?)'),
  voiceUpdate: db.prepare('UPDATE voice_sessions SET started_at=? WHERE guild_id=? AND user_id=?'),
  voiceStop: db.prepare('DELETE FROM voice_sessions WHERE guild_id=? AND user_id=?'),
  settings: db.prepare('SELECT * FROM guild_settings WHERE guild_id=?'),
  setWelcome: db.prepare('INSERT INTO guild_settings(guild_id,welcome_channel_id) VALUES(?,?) ON CONFLICT(guild_id) DO UPDATE SET welcome_channel_id=excluded.welcome_channel_id'),
  setShop: db.prepare('INSERT INTO guild_settings(guild_id,shop_channel_id) VALUES(?,?) ON CONFLICT(guild_id) DO UPDATE SET shop_channel_id=excluded.shop_channel_id'),
  setPanel: db.prepare('INSERT INTO guild_settings(guild_id,panel_channel_id,panel_message_id) VALUES(?,?,?) ON CONFLICT(guild_id) DO UPDATE SET panel_channel_id=excluded.panel_channel_id,panel_message_id=excluded.panel_message_id'),
  setShopMessage: db.prepare('INSERT INTO guild_settings(guild_id,shop_message_id) VALUES(?,?) ON CONFLICT(guild_id) DO UPDATE SET shop_message_id=excluded.shop_message_id'),
  setCategory: db.prepare('INSERT INTO guild_settings(guild_id,shop_category_id) VALUES(?,?) ON CONFLICT(guild_id) DO UPDATE SET shop_category_id=excluded.shop_category_id'),
  setLevelUpChannel: db.prepare('INSERT INTO guild_settings(guild_id,level_up_channel_id) VALUES(?,?) ON CONFLICT(guild_id) DO UPDATE SET level_up_channel_id=excluded.level_up_channel_id'),
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
const addXpTransaction = db.transaction((guildId, userId, kind, amount, seconds, isMessage, awardXp, awardCoins, xpPerCoin) => {
  const old = ensureMember(guildId, userId);
  const textXp = old.text_xp + (awardXp && kind === 'text' ? amount : 0);
  const voiceXp = old.voice_xp + (awardXp && kind === 'voice' ? amount : 0);
  const coinProgress = old.coin_remainder + (awardCoins ? amount : 0);
  const threshold = Math.max(1, Math.floor(Number(xpPerCoin) || 250));
  const coinsEarned = awardCoins ? Math.floor(coinProgress / threshold) : 0;
  const remainder = awardCoins ? coinProgress % threshold : old.coin_remainder;
  q.update.run(textXp, voiceXp, textXp + voiceXp, remainder, coinsEarned, seconds, guildId, userId);
  if (isMessage) q.message.run(guildId, userId);
  if (awardXp && amount > 0) db.prepare('INSERT INTO xp_events(guild_id,user_id,event_type,amount) VALUES(?,?,?,?)').run(guildId, userId, kind, amount);
  if (coinsEarned > 0) db.prepare("INSERT INTO xp_events(guild_id,user_id,event_type,amount) VALUES(?,?,'coins',?)").run(guildId, userId, coinsEarned);
  return {
    member: q.get.get(guildId, userId),
    oldTextLevel: baseLevelFor(old.text_xp, curveForGuild(guildId)), newTextLevel: baseLevelFor(textXp, curveForGuild(guildId)),
    oldVoiceLevel: baseLevelFor(old.voice_xp, curveForGuild(guildId)), newVoiceLevel: baseLevelFor(voiceXp, curveForGuild(guildId)), coinsEarned
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
const createProductPurchaseTransaction = db.transaction((guildId, userId, productId) => {
  const product = db.prepare('SELECT * FROM shop_products WHERE guild_id=? AND id=? AND active=1').get(guildId, productId);
  if (!product) return { error: 'not_found' };
  ensureMember(guildId, userId);
  if (product.currency === 'coin') {
    const price = Math.floor(Number(product.price));
    if (!Number.isSafeInteger(price) || price < 0) return { error: 'invalid_price' };
    if (q.spend.run(price, guildId, userId, price).changes !== 1) return { error: 'insufficient_funds' };
  }
  const status = product.currency === 'cash' ? 'awaiting_payment' : (product.product_type === 'color' ? 'awaiting_selection' : 'pending_fulfillment');
  const result = db.prepare('INSERT INTO product_purchases(guild_id,user_id,product_id,product_name,price,currency,status) VALUES(?,?,?,?,?,?,?)')
    .run(guildId, userId, product.id, product.name, product.price, product.currency, status);
  return { id: Number(result.lastInsertRowid), product, status };
});
const renewRoomTransaction = db.transaction((guildId, userId, roomId, now) => {
  const room = db.prepare('SELECT * FROM private_rooms WHERE guild_id=? AND id=? AND user_id=? AND active=1').get(guildId, roomId, userId);
  if (!room) return { error: 'not_found' };
  if (Number(room.expires_at) <= now) return { error: 'expired' };
  const product = db.prepare('SELECT * FROM shop_products WHERE guild_id=? AND id=?').get(guildId, room.product_id);
  if (!product || product.currency !== 'coin') return { error: 'not_renewable' };
  const price = Math.floor(Number(product.price));
  if (q.spend.run(price, guildId, userId, price).changes !== 1) return { error: 'insufficient_funds' };
  const currentEnd = Math.max(Number(room.expires_at), now);
  const nextEnd = currentEnd + Math.max(1, Number(product.duration_days) || 30) * 86400;
  db.prepare('UPDATE private_rooms SET expires_at=?,warning_sent=0 WHERE id=?').run(nextEnd, roomId);
  return { expires_at: nextEnd, price };
});

function addXp(guildId, userId, kind, amount, options) {
  options = options || {};
  if (kind !== 'text' && kind !== 'voice') throw new TypeError('Invalid XP kind');
  if (!Number.isSafeInteger(amount) || amount < 1) throw new TypeError('Invalid XP amount');
  return addXpTransaction(guildId, userId, kind, amount, options.seconds || 0, Boolean(options.message), options.awardXp !== false, options.awardCoins !== false, options.xpPerCoin || 250);
}
function addCoins(guildId, userId, amount) {
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1000000000) throw new TypeError('Invalid coin amount');
  ensureMember(guildId, userId);
  db.prepare('UPDATE members SET coins=coins+?,updated_at=unixepoch() WHERE guild_id=? AND user_id=?').run(amount, guildId, userId);
  db.prepare("INSERT INTO xp_events(guild_id,user_id,event_type,amount) VALUES(?,?,'coins',?)").run(guildId, userId, amount);
  return q.get.get(guildId, userId);
}
const resetMemberTransaction = db.transaction((guildId, userId, nowMs) => {
  ensureMember(guildId, userId);
  db.prepare('UPDATE members SET text_xp=0,voice_xp=0,total_xp=0,coin_remainder=0,coins=0,messages=0,voice_seconds=0,updated_at=unixepoch() WHERE guild_id=? AND user_id=?').run(guildId, userId);
  db.prepare('DELETE FROM xp_events WHERE guild_id=? AND user_id=?').run(guildId, userId);
  db.prepare('UPDATE voice_sessions SET started_at=? WHERE guild_id=? AND user_id=?').run(nowMs, guildId, userId);
  return q.get.get(guildId, userId);
});
function resetMember(guildId, userId) { return resetMemberTransaction(guildId, userId, Date.now()); }

function setSetting(guildId, key, value) {
  if (key === 'welcome_channel_id') return q.setWelcome.run(guildId, value).changes > 0;
  if (key === 'shop_channel_id') return q.setShop.run(guildId, value).changes > 0;
  if (key === 'shop_category_id') return q.setCategory.run(guildId, value).changes > 0;
  if (key === 'level_up_channel_id') return q.setLevelUpChannel.run(guildId, value).changes > 0;
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
function curveForGuild(guildId) {
  return normalizeCurve({
    firstLevels: getConfig(guildId,'level_first_six','100,150,250,400,500,600').split(',').map(Number),
    level7Base: getConfig(guildId,'level_7_base','750'),
    level7Increment: getConfig(guildId,'level_7_increment','150'),
    growthStep: getConfig(guildId,'level_growth_step','5')
  });
}
function levelForGuild(totalXp, guildId) { return baseLevelFor(totalXp, guildId ? curveForGuild(guildId) : undefined); }
function setConfig(guildId, key, value, actorId) {
  db.prepare('INSERT INTO guild_config(guild_id,config_key,config_value,updated_by) VALUES(?,?,?,?) ON CONFLICT(guild_id,config_key) DO UPDATE SET config_value=excluded.config_value,updated_by=excluded.updated_by,updated_at=unixepoch()')
    .run(guildId, key, String(value), actorId || null);
}
function getConfig(guildId, key, fallback) {
  const row = db.prepare('SELECT config_value FROM guild_config WHERE guild_id=? AND config_key=?').get(guildId, key);
  return row ? row.config_value : fallback;
}
function featureEnabled(guildId, key) {
  const row = db.prepare('SELECT enabled FROM guild_features WHERE guild_id=? AND feature_key=?').get(guildId, key);
  return row ? Boolean(row.enabled) : true;
}
function setFeature(guildId, key, enabled, actorId) {
  db.prepare('INSERT INTO guild_features(guild_id,feature_key,enabled,updated_by) VALUES(?,?,?,?) ON CONFLICT(guild_id,feature_key) DO UPDATE SET enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=unixepoch()')
    .run(guildId, key, enabled ? 1 : 0, actorId || null);
}
function setContent(guildId, key, title, body, actorId) {
  db.prepare('INSERT INTO guild_content(guild_id,content_key,title,body,updated_by) VALUES(?,?,?,?,?) ON CONFLICT(guild_id,content_key) DO UPDATE SET title=excluded.title,body=excluded.body,updated_by=excluded.updated_by,updated_at=unixepoch()')
    .run(guildId, key, String(title).slice(0, 256), String(body).slice(0, 4000), actorId || null);
}
function getContent(guildId, key) {
  return db.prepare('SELECT * FROM guild_content WHERE guild_id=? AND content_key=?').get(guildId, key) || null;
}
function savePanel(guildId, channelId, messageId) { q.setPanel.run(guildId, channelId, messageId); }
function saveShopMessage(guildId, messageId) { q.setShopMessage.run(guildId,messageId); }
function createProduct(guildId, data) {
  const result = db.prepare('INSERT INTO shop_products(guild_id,name,description,price,currency,cash_currency,product_type,image_url,payment_url,role_id,duration_days,active) VALUES(?,?,?,?,?,?,?,?,?,?,?,1)')
    .run(guildId, data.name, data.description || '', data.price, data.currency, data.cash_currency || 'JOD', data.product_type, data.image_url || null, data.payment_url || null, data.role_id || null, data.duration_days || 30);
  return Number(result.lastInsertRowid);
}
function ensureDefaultColorProduct(guildId) {
  const existing = db.prepare("SELECT id FROM shop_products WHERE guild_id=? AND product_type='color' ORDER BY id ASC LIMIT 1").get(guildId);
  if (existing) return Number(existing.id);
  // A disabled-by-default Colors product prevents accidental free purchases.
  const result = db.prepare("INSERT INTO shop_products(guild_id,name,description,price,currency,product_type,active) VALUES(?,?,?,0,'coin','color',0)")
    .run(guildId, 'Colors', 'اشترِ لوناً خاصاً واختره من عجلة الألوان الكاملة. حدّد السعر من لوحة إدارة المتجر قبل تفعيله.');
  return Number(result.lastInsertRowid);
}
function updateProduct(guildId, id, data) {
  const old = db.prepare('SELECT * FROM shop_products WHERE guild_id=? AND id=?').get(guildId, id);
  if (!old) return false;
  db.prepare('UPDATE shop_products SET name=?,description=?,price=?,currency=?,cash_currency=?,product_type=?,image_url=?,payment_url=?,role_id=?,duration_days=?,updated_at=unixepoch() WHERE guild_id=? AND id=?')
    .run(data.name ?? old.name, data.description ?? old.description, data.price ?? old.price, data.currency ?? old.currency, data.cash_currency ?? old.cash_currency,
      data.product_type ?? old.product_type, data.image_url ?? old.image_url, data.payment_url ?? old.payment_url,
      data.role_id ?? old.role_id, data.duration_days ?? old.duration_days, guildId, id);
  return true;
}
function setProductActive(guildId, id, active) {
  return db.prepare('UPDATE shop_products SET active=?,updated_at=unixepoch() WHERE guild_id=? AND id=?').run(active ? 1 : 0, guildId, id).changes > 0;
}
function removeProduct(guildId, id) { return setProductActive(guildId, id, false); }
function products(guildId, activeOnly) {
  return db.prepare('SELECT * FROM shop_products WHERE guild_id=?' + (activeOnly ? ' AND active=1' : '') + ' ORDER BY id DESC LIMIT 100').all(guildId);
}
function purchaseProduct(guildId, userId, productId) { return createProductPurchaseTransaction(guildId, userId, productId); }
function getProductPurchase(guildId, purchaseId) { return db.prepare('SELECT * FROM product_purchases WHERE guild_id=? AND id=?').get(guildId, purchaseId) || null; }
function refundProductPurchase(guildId, purchaseId) {
  const row = db.prepare('SELECT user_id,price,currency,status FROM product_purchases WHERE guild_id=? AND id=?').get(guildId,purchaseId);
  if (!row || row.currency !== 'coin' || ['rejected','refunded'].includes(row.status)) return false;
  const tx = db.transaction(() => {
    q.refund.run(Math.floor(Number(row.price)),guildId,row.user_id);
    db.prepare("UPDATE product_purchases SET status='refunded',updated_at=unixepoch() WHERE guild_id=? AND id=?").run(guildId,purchaseId);
  });
  tx();
  return true;
}
function updateProductPurchase(guildId, purchaseId, status, metadata, reviewerId) {
  return db.prepare('UPDATE product_purchases SET status=?,metadata_json=?,reviewed_by=?,reviewed_at=unixepoch(),updated_at=unixepoch() WHERE guild_id=? AND id=?')
    .run(status, JSON.stringify(metadata || {}), reviewerId || null, guildId, purchaseId).changes > 0;
}
function pendingProductPurchases(guildId) {
  return db.prepare("SELECT * FROM product_purchases WHERE guild_id=? AND status IN ('awaiting_payment','pending_fulfillment') ORDER BY id ASC LIMIT 30").all(guildId);
}
function setCustomColorRole(guildId, userId, roleId, expiresAt) {
  const expiry = Number.isSafeInteger(Number(expiresAt)) ? Number(expiresAt) : Math.floor(Date.now() / 1000) + 30 * 86400;
  db.prepare('INSERT INTO custom_color_roles(guild_id,user_id,role_id,expires_at) VALUES(?,?,?,?) ON CONFLICT(guild_id,user_id) DO UPDATE SET role_id=excluded.role_id,expires_at=excluded.expires_at,updated_at=unixepoch()').run(guildId, userId, roleId, expiry);
}
function expiredCustomColorRoles(now = Math.floor(Date.now() / 1000)) {
  return db.prepare('SELECT guild_id,user_id,role_id,expires_at FROM custom_color_roles WHERE expires_at IS NOT NULL AND expires_at<=?').all(now);
}
function deleteCustomColorRole(guildId, userId) {
  return db.prepare('DELETE FROM custom_color_roles WHERE guild_id=? AND user_id=?').run(guildId,userId).changes > 0;
}
function getCustomColorRole(guildId, userId) {
  const row = db.prepare('SELECT role_id FROM custom_color_roles WHERE guild_id=? AND user_id=?').get(guildId, userId);
  return row ? row.role_id : null;
}
function createRoomRecord(guildId, userId, channelId, channelType, productId, expiresAt) {
  const result = db.prepare('INSERT INTO private_rooms(guild_id,user_id,channel_id,channel_type,product_id,expires_at) VALUES(?,?,?,?,?,?)')
    .run(guildId, userId, channelId, channelType, productId, expiresAt);
  return Number(result.lastInsertRowid);
}
function activeRooms(guildId) {
  return db.prepare('SELECT * FROM private_rooms WHERE guild_id=? AND active=1').all(guildId);
}
function getRoomByChannel(guildId, channelId) {
  return db.prepare('SELECT * FROM private_rooms WHERE guild_id=? AND channel_id=? AND active=1').get(guildId,channelId) || null;
}
function setRoomPanelMessage(roomId, messageId) {
  return db.prepare('UPDATE private_rooms SET panel_message_id=? WHERE id=? AND active=1').run(messageId,roomId).changes > 0;
}
function setRoomLocked(roomId, locked) {
  return db.prepare('UPDATE private_rooms SET voice_locked=? WHERE id=? AND active=1').run(locked ? 1 : 0,roomId).changes > 0;
}
function getRoom(guildId, id, userId) {
  return db.prepare('SELECT * FROM private_rooms WHERE guild_id=? AND id=?' + (userId ? ' AND user_id=?' : '')).get(...(userId ? [guildId,id,userId] : [guildId,id])) || null;
}
function markRoomWarned(id) { return db.prepare('UPDATE private_rooms SET warning_sent=1 WHERE id=? AND warning_sent=0').run(id).changes > 0; }
function closeRoom(id) { return db.prepare('UPDATE private_rooms SET active=0 WHERE id=?').run(id).changes > 0; }
function extendRoom(id, days) {
  const value = Math.max(1,Math.min(365,Math.floor(Number(days) || 30)));
  return db.prepare('UPDATE private_rooms SET expires_at=MAX(expires_at,unixepoch())+?,warning_sent=0 WHERE id=? AND active=1').run(value*86400,id).changes > 0;
}
function renewRoom(guildId, userId, roomId, nowSeconds) { return renewRoomTransaction(guildId,userId,roomId,nowSeconds || Math.floor(Date.now()/1000)); }
function setInteractionRoles(guildId, roles) {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM interaction_roles WHERE guild_id=?').run(guildId);
    const insert = db.prepare('INSERT INTO interaction_roles(guild_id,role_id,role_name,enabled) VALUES(?,?,?,1)');
    for (const role of roles) insert.run(guildId, role.id, role.name);
  });
  tx();
}
function interactionRoles(guildId) { return db.prepare('SELECT * FROM interaction_roles WHERE guild_id=? AND enabled=1 ORDER BY role_name').all(guildId); }
function logAdmin(guildId, userId, action, details) {
  db.prepare('INSERT INTO admin_audit(guild_id,user_id,action,details) VALUES(?,?,?,?)').run(guildId,userId,action,details || '');
}

function inviteSnapshots(guildId) {
  return db.prepare('SELECT * FROM invite_snapshots WHERE guild_id=?').all(guildId);
}
function saveInviteSnapshots(guildId, invites) {
  const rows = Array.from(invites || []).map((invite) => ({
    code: String(invite.code || ''),
    inviterId: invite.inviterId || (invite.inviter && invite.inviter.id) || null,
    uses: Math.max(0, Math.floor(Number(invite.uses) || 0)),
    maxUses: Math.max(0, Math.floor(Number(invite.maxUses) || 0)),
    expiresAt: invite.expiresTimestamp ? Math.floor(Number(invite.expiresTimestamp) / 1000) : null
  })).filter((invite) => invite.code);
  const upsert = db.prepare('INSERT INTO invite_snapshots(guild_id,code,inviter_id,uses,max_uses,expires_at,updated_at) VALUES(?,?,?,?,?,?,unixepoch()) ON CONFLICT(guild_id,code) DO UPDATE SET inviter_id=COALESCE(excluded.inviter_id,invite_snapshots.inviter_id),uses=excluded.uses,max_uses=excluded.max_uses,expires_at=excluded.expires_at,updated_at=unixepoch()');
  const tx = db.transaction(() => {
    for (const invite of rows) upsert.run(guildId, invite.code, invite.inviterId, invite.uses, invite.maxUses, invite.expiresAt);
  });
  tx();
  return rows.length;
}
function deleteInviteSnapshot(guildId, code) {
  return db.prepare('DELETE FROM invite_snapshots WHERE guild_id=? AND code=?').run(guildId, String(code)).changes > 0;
}
function recordInviteJoin(guildId, joinedUserId, inviterId, inviteCode) {
  if (!inviterId || !inviteCode) return false;
  return db.prepare('INSERT OR IGNORE INTO member_invites(guild_id,joined_user_id,inviter_id,invite_code) VALUES(?,?,?,?)')
    .run(guildId, joinedUserId, inviterId, String(inviteCode)).changes > 0;
}
function inviteCount(guildId, inviterId) {
  const row = db.prepare('SELECT COUNT(*) AS count FROM member_invites WHERE guild_id=? AND inviter_id=?').get(guildId, inviterId);
  return Number(row && row.count) || 0;
}

function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function taskPeriodKey(period, date = new Date()) {
  if (period === 'daily') return localDateKey(date);
  const value = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = (value.getDay() + 6) % 7;
  value.setDate(value.getDate() - day + 3);
  const firstThursday = new Date(value.getFullYear(), 0, 4);
  firstThursday.setDate(firstThursday.getDate() - ((firstThursday.getDay() + 6) % 7) + 3);
  const week = 1 + Math.round((value - firstThursday) / 604800000);
  return `${value.getFullYear()}-W${String(week).padStart(2, '0')}`;
}
function createDailyQuestionRun(data) {
  const result = db.prepare("INSERT OR IGNORE INTO daily_question_runs(guild_id,date_key,channel_id,question_key,question_text,answer_text,reward_coins,status,scheduled_at) VALUES(?,?,?,?,?,?,?,'pending',?)")
    .run(data.guildId, data.dateKey, data.channelId, data.questionKey, data.question, data.answer, Math.max(0, Math.floor(Number(data.rewardCoins) || 0)), Math.floor(Number(data.scheduledAt) || Date.now() / 1000));
  return result.changes ? Number(result.lastInsertRowid) : null;
}
function openDailyQuestion(guildId) {
  return db.prepare("SELECT * FROM daily_question_runs WHERE guild_id=? AND status='open' ORDER BY id DESC LIMIT 1").get(guildId) || null;
}
function expireOldDailyQuestions(guildId, todayKey) {
  return db.prepare("UPDATE daily_question_runs SET status='expired' WHERE guild_id=? AND status='open' AND date_key<?").run(guildId,todayKey).changes;
}
function dailyQuestionForDate(guildId, dateKey) {
  return db.prepare('SELECT * FROM daily_question_runs WHERE guild_id=? AND date_key=?').get(guildId, dateKey) || null;
}
function setDailyQuestionSent(id, messageId) {
  return db.prepare("UPDATE daily_question_runs SET status='open',message_id=?,sent_at=unixepoch() WHERE id=? AND status='pending'").run(messageId,id).changes > 0;
}
function failDailyQuestion(id) {
  return db.prepare("UPDATE daily_question_runs SET status='failed' WHERE id=? AND status='pending'").run(id).changes > 0;
}
function retryDailyQuestionRun(id) {
  return db.prepare("UPDATE daily_question_runs SET status='pending' WHERE id=? AND status='failed'").run(id).changes > 0;
}
function winDailyQuestion(id, userId) {
  return db.prepare("UPDATE daily_question_runs SET status='won',winner_id=?,answered_at=unixepoch() WHERE id=? AND status='open' AND winner_id IS NULL").run(userId,id).changes > 0;
}
function listGuildTasks(guildId, enabledOnly = false) {
  return db.prepare('SELECT * FROM guild_tasks WHERE guild_id=?' + (enabledOnly ? ' AND enabled=1' : '') + ' ORDER BY enabled DESC,id DESC').all(guildId);
}
function getGuildTask(guildId, taskId) {
  return db.prepare('SELECT * FROM guild_tasks WHERE guild_id=? AND id=?').get(guildId,taskId) || null;
}
function createGuildTask(guildId, data, actorId) {
  const result = db.prepare('INSERT INTO guild_tasks(guild_id,title,description,period,tracking_type,threshold,channel_id,reward_type,reward_amount,max_winners,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    .run(guildId, String(data.title).slice(0,100), String(data.description || '').slice(0,500), data.period, data.trackingType,
      Math.max(1,Math.floor(Number(data.threshold)||1)), data.channelId || null, data.rewardType,
      Math.max(1,Math.floor(Number(data.rewardAmount)||1)), Math.max(1,Math.min(25,Math.floor(Number(data.maxWinners)||3))), actorId || null);
  return Number(result.lastInsertRowid);
}
function updateGuildTask(guildId, taskId, patch) {
  const old = getGuildTask(guildId,taskId);
  if (!old) return false;
  const next = { ...old, ...patch };
  return db.prepare('UPDATE guild_tasks SET title=?,description=?,period=?,tracking_type=?,threshold=?,channel_id=?,reward_type=?,reward_amount=?,max_winners=?,enabled=? WHERE guild_id=? AND id=?')
    .run(next.title,next.description,next.period,next.tracking_type,next.threshold,next.channel_id || null,next.reward_type,next.reward_amount,next.max_winners,next.enabled ? 1 : 0,guildId,taskId).changes > 0;
}
function deleteGuildTask(guildId, taskId) {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM task_progress WHERE guild_id=? AND task_id=?').run(guildId,taskId);
    return db.prepare('DELETE FROM guild_tasks WHERE guild_id=? AND id=?').run(guildId,taskId).changes > 0;
  });
  return tx();
}
function incrementTaskProgress(guildId, userId, trackingType, amount, channelId = null, now = new Date()) {
  const tasks = db.prepare('SELECT * FROM guild_tasks WHERE guild_id=? AND enabled=1 AND tracking_type=?').all(guildId,trackingType);
  const completed = [];
  for (const task of tasks) {
    if (task.tracking_type === 'messages' && !task.channel_id) continue;
    if (task.channel_id && task.channel_id !== channelId) continue;
    const periodKey = taskPeriodKey(task.period,now);
    const current = db.prepare('SELECT * FROM task_progress WHERE guild_id=? AND task_id=? AND user_id=? AND period_key=?').get(guildId,task.id,userId,periodKey);
    if (current && ['awarded','pending','rejected'].includes(current.status)) continue;
    const next = (current ? Number(current.progress) : 0) + Math.max(0,Math.floor(Number(amount)||0));
    db.prepare("INSERT INTO task_progress(guild_id,task_id,user_id,period_key,progress,status) VALUES(?,?,?,?,?,'progress') ON CONFLICT(guild_id,task_id,user_id,period_key) DO UPDATE SET progress=excluded.progress")
      .run(guildId,task.id,userId,periodKey,next);
    if (next >= Number(task.threshold)) {
      const winners = db.prepare("SELECT COUNT(*) AS n FROM task_progress WHERE guild_id=? AND task_id=? AND period_key=? AND status='awarded'").get(guildId,task.id,periodKey).n;
      if (winners < Number(task.max_winners)) {
        db.prepare("UPDATE task_progress SET status='awarded',completed_at=unixepoch(),awarded_at=unixepoch() WHERE guild_id=? AND task_id=? AND user_id=? AND period_key=? AND status='progress'").run(guildId,task.id,userId,periodKey);
        completed.push({ task, userId, rewardType: task.reward_type, rewardAmount: Number(task.reward_amount), periodKey });
      } else {
        db.prepare("UPDATE task_progress SET status='rejected',completed_at=unixepoch() WHERE guild_id=? AND task_id=? AND user_id=? AND period_key=? AND status='progress'").run(guildId,task.id,userId,periodKey);
      }
    }
  }
  return completed;
}
function getTaskProgress(guildId, taskId, userId, periodKey) {
  return db.prepare('SELECT * FROM task_progress WHERE guild_id=? AND task_id=? AND user_id=? AND period_key=?').get(guildId,taskId,userId,periodKey) || null;
}
function claimManualTask(guildId, taskId, userId, proof = '', now = new Date()) {
  const task = getGuildTask(guildId,taskId);
  if (!task || !task.enabled || task.tracking_type !== 'manual') return { error: 'unavailable' };
  const periodKey = taskPeriodKey(task.period,now);
  const old = getTaskProgress(guildId,taskId,userId,periodKey);
  if (old && ['pending','awarded'].includes(old.status)) return { error: 'already_claimed' };
  db.prepare("INSERT INTO task_progress(guild_id,task_id,user_id,period_key,progress,status,proof,completed_at) VALUES(?,?,?, ?,?,'pending',?,unixepoch()) ON CONFLICT(guild_id,task_id,user_id,period_key) DO UPDATE SET progress=1,status='pending',proof=excluded.proof,completed_at=unixepoch()")
    .run(guildId,taskId,userId,periodKey,1,String(proof).slice(0,500));
  return { ok: true, task, periodKey };
}
function pendingTaskClaims(guildId, taskId = null) {
  return db.prepare("SELECT p.*,t.title,t.description,t.reward_type,t.reward_amount,t.max_winners,t.period FROM task_progress p JOIN guild_tasks t ON t.id=p.task_id AND t.guild_id=p.guild_id WHERE p.guild_id=? AND p.status='pending'" + (taskId ? ' AND p.task_id=?' : '') + ' ORDER BY p.completed_at ASC,p.rowid ASC LIMIT 50').all(...(taskId ? [guildId,taskId] : [guildId]));
}
function reviewTaskClaim(guildId, taskId, userId, periodKey, approve) {
  const tx = db.transaction(() => {
    const row = db.prepare("SELECT p.rowid AS claim_rowid,p.*,t.title,t.channel_id,t.reward_type,t.reward_amount,t.max_winners FROM task_progress p JOIN guild_tasks t ON t.id=p.task_id AND t.guild_id=p.guild_id WHERE p.guild_id=? AND p.task_id=? AND p.user_id=? AND p.period_key=? AND p.status='pending'").get(guildId,taskId,userId,periodKey);
    if (!row) return { error: 'not_found' };
    if (approve) {
      const earlier = db.prepare("SELECT 1 FROM task_progress WHERE guild_id=? AND task_id=? AND period_key=? AND status='pending' AND (completed_at<? OR (completed_at=? AND rowid<?)) LIMIT 1").get(guildId,taskId,periodKey,row.completed_at,row.completed_at,row.claim_rowid);
      if (earlier) return { error: 'not_first' };
      const winners = db.prepare("SELECT COUNT(*) AS n FROM task_progress WHERE guild_id=? AND task_id=? AND period_key=? AND status='awarded'").get(guildId,taskId,periodKey).n;
      if (winners >= Number(row.max_winners)) return { error: 'full' };
      db.prepare("UPDATE task_progress SET status='awarded',awarded_at=unixepoch() WHERE guild_id=? AND task_id=? AND user_id=? AND period_key=? AND status='pending'").run(guildId,taskId,userId,periodKey);
      return { task: row, userId, rewardType: row.reward_type, rewardAmount: Number(row.reward_amount), approved: true };
    }
    db.prepare("UPDATE task_progress SET status='rejected' WHERE guild_id=? AND task_id=? AND user_id=? AND period_key=? AND status='pending'").run(guildId,taskId,userId,periodKey);
    return { task: row, userId, approved: false };
  });
  return tx();
}
function setTaskMessageProgress(guildId, userId, channelId) {
  return incrementTaskProgress(guildId,userId,'messages',1,channelId);
}

function setDmAnnouncementSubscription(guildId, userId, enabled) {
  if (enabled) {
    db.prepare('INSERT OR IGNORE INTO dm_announcement_subscribers(guild_id,user_id) VALUES(?,?)').run(guildId,userId);
    return true;
  }
  return db.prepare('DELETE FROM dm_announcement_subscribers WHERE guild_id=? AND user_id=?').run(guildId,userId).changes > 0;
}
function isDmAnnouncementSubscriber(guildId, userId) {
  return Boolean(db.prepare('SELECT 1 FROM dm_announcement_subscribers WHERE guild_id=? AND user_id=?').get(guildId,userId));
}
function dmAnnouncementSubscribers(guildId) {
  return db.prepare('SELECT user_id FROM dm_announcement_subscribers WHERE guild_id=? ORDER BY created_at ASC').all(guildId).map((row) => row.user_id);
}
function dmAnnouncementSubscriberCount(guildId) {
  return Number(db.prepare('SELECT COUNT(*) AS n FROM dm_announcement_subscribers WHERE guild_id=?').get(guildId).n || 0);
}
function createDmBroadcastJob(guildId, actorId, message, userIds) {
  const ids = [...new Set((userIds || []).map(String).filter((id) => /^\d{15,22}$/.test(id)))];
  if (!ids.length) return { error: 'no_recipients' };
  const tx = db.transaction(() => {
    const active = db.prepare("SELECT id FROM dm_broadcast_jobs WHERE guild_id=? AND status='running' LIMIT 1").get(guildId);
    if (active) return { error: 'active', id: Number(active.id) };
    const result = db.prepare("INSERT INTO dm_broadcast_jobs(guild_id,created_by,message,status,total_count) VALUES(?,?,?,'running',?)")
      .run(guildId,actorId,String(message).slice(0,1800),ids.length);
    const jobId = Number(result.lastInsertRowid);
    const insert = db.prepare("INSERT INTO dm_broadcast_recipients(job_id,user_id,status) VALUES(?,?,'pending')");
    for (const userId of ids) insert.run(jobId,userId);
    return { id: jobId, total: ids.length };
  });
  return tx();
}
function activeDmBroadcastJobs() {
  return db.prepare("SELECT * FROM dm_broadcast_jobs WHERE status='running' ORDER BY id ASC").all();
}
function nextDmBroadcastRecipient(jobId) {
  return db.prepare("SELECT * FROM dm_broadcast_recipients WHERE job_id=? AND status='pending' ORDER BY rowid ASC LIMIT 1").get(jobId) || null;
}
function markDmBroadcastRecipient(jobId, userId, status, error = '') {
  if (!['sent','failed','skipped'].includes(status)) throw new TypeError('Invalid DM broadcast recipient status');
  const tx = db.transaction(() => {
    const changed = db.prepare("UPDATE dm_broadcast_recipients SET status=?,error=?,attempted_at=unixepoch() WHERE job_id=? AND user_id=? AND status='pending'")
      .run(status,String(error).slice(0,300),jobId,userId).changes;
    if (!changed) return false;
    db.prepare("UPDATE dm_broadcast_jobs SET sent_count=(SELECT COUNT(*) FROM dm_broadcast_recipients WHERE job_id=? AND status='sent'), failed_count=(SELECT COUNT(*) FROM dm_broadcast_recipients WHERE job_id=? AND status='failed'), skipped_count=(SELECT COUNT(*) FROM dm_broadcast_recipients WHERE job_id=? AND status='skipped'), updated_at=unixepoch() WHERE id=?")
      .run(jobId,jobId,jobId,jobId);
    const pending = db.prepare("SELECT COUNT(*) AS n FROM dm_broadcast_recipients WHERE job_id=? AND status='pending'").get(jobId).n;
    if (!pending) db.prepare("UPDATE dm_broadcast_jobs SET status='completed',updated_at=unixepoch() WHERE id=? AND status='running'").run(jobId);
    return true;
  });
  return tx();
}
function getDmBroadcastJob(guildId, jobId) {
  return db.prepare('SELECT * FROM dm_broadcast_jobs WHERE guild_id=? AND id=?').get(guildId,jobId) || null;
}
function latestDmBroadcastJob(guildId) {
  return db.prepare('SELECT * FROM dm_broadcast_jobs WHERE guild_id=? ORDER BY id DESC LIMIT 1').get(guildId) || null;
}

function getGenieSession(guildId, userId) {
  const row = db.prepare('SELECT * FROM genie_sessions WHERE guild_id=? AND user_id=?').get(guildId, userId);
  if (!row) return null;
  try { row.state = JSON.parse(row.state_json || '{}'); }
  catch { row.state = {}; }
  return row;
}
function saveGenieSession(guildId, userId, channelId, messageId, state) {
  const result = db.prepare(`INSERT INTO genie_sessions(guild_id,user_id,channel_id,message_id,state_json,status)
    VALUES(?,?,?,?,?,'active')
    ON CONFLICT(guild_id,user_id) DO UPDATE SET channel_id=excluded.channel_id,message_id=excluded.message_id,
      state_json=excluded.state_json,status='active',created_at=unixepoch(),updated_at=unixepoch()
    WHERE genie_sessions.status!='active'`).run(guildId,userId,channelId,messageId,JSON.stringify(state || {}));
  return result.changes === 1;
}
function updateGenieSession(guildId, userId, state, messageId) {
  return db.prepare(`UPDATE genie_sessions SET state_json=?,message_id=COALESCE(?,message_id),updated_at=unixepoch()
    WHERE guild_id=? AND user_id=? AND status='active'`).run(JSON.stringify(state || {}),messageId || null,guildId,userId).changes === 1;
}
function expireGenieSession(guildId, userId) {
  return db.prepare("UPDATE genie_sessions SET status='completed',updated_at=unixepoch() WHERE guild_id=? AND user_id=? AND status='active'").run(guildId,userId).changes === 1;
}
function getGenieStats(guildId, userId) {
  return db.prepare('SELECT * FROM genie_stats WHERE guild_id=? AND user_id=?').get(guildId,userId) || {
    guild_id:guildId,user_id:userId,total_games:0,wins:0,questions_total:0,coins_earned:0,last_played_at:0
  };
}
function getGenieLeaderboard(guildId, limit = 10) {
  return db.prepare('SELECT user_id,total_games,wins,questions_total,coins_earned FROM genie_stats WHERE guild_id=? AND total_games>0 ORDER BY wins DESC,total_games DESC,questions_total ASC LIMIT ?')
    .all(guildId,Math.max(1,Math.min(25,Number(limit)||10)));
}
const completeGenieGameTransaction = db.transaction((guildId,userId,won,questions,rewardCoins) => {
  const session = db.prepare("SELECT status FROM genie_sessions WHERE guild_id=? AND user_id=?").get(guildId,userId);
  if (!session || session.status !== 'active') return null;
  db.prepare("UPDATE genie_sessions SET status='completed',updated_at=unixepoch() WHERE guild_id=? AND user_id=? AND status='active'").run(guildId,userId);
  const reward = won ? Math.max(0,Math.min(100000,Math.floor(Number(rewardCoins)||0))) : 0;
  if (reward > 0) {
    ensureMember(guildId,userId);
    db.prepare('UPDATE members SET coins=coins+?,updated_at=unixepoch() WHERE guild_id=? AND user_id=?').run(reward,guildId,userId);
    db.prepare("INSERT INTO xp_events(guild_id,user_id,event_type,amount) VALUES(?,?,'coins',?)").run(guildId,userId,reward);
  }
  db.prepare(`INSERT INTO genie_stats(guild_id,user_id,total_games,wins,questions_total,coins_earned,last_played_at)
    VALUES(?,?,1,?,?,?,unixepoch())
    ON CONFLICT(guild_id,user_id) DO UPDATE SET total_games=genie_stats.total_games+1,
      wins=genie_stats.wins+excluded.wins,questions_total=genie_stats.questions_total+excluded.questions_total,
      coins_earned=genie_stats.coins_earned+excluded.coins_earned,last_played_at=unixepoch()`)
    .run(guildId,userId,won?1:0,Math.max(0,Math.floor(Number(questions)||0)),reward);
  return { won:Boolean(won), rewardCoins:reward };
});
function completeGenieGame(guildId,userId,won,questions,rewardCoins) {
  return completeGenieGameTransaction(guildId,userId,Boolean(won),questions,rewardCoins);
}

function pruneXpEvents() {
  return db.prepare('DELETE FROM xp_events WHERE created_at < unixepoch() - 45*86400').run().changes;
}
function memberRank(guildId, userId, kind) {
  const column = ({ text: 'text_xp', voice: 'voice_xp', coins: 'coins', all: 'total_xp' })[kind];
  if (!column) throw new TypeError('Invalid leaderboard metric');
  const row = db.prepare('SELECT ' + column + ' AS score FROM members WHERE guild_id=? AND user_id=?').get(guildId, userId);
  if (!row) return null;
  const higher = db.prepare('SELECT COUNT(*) AS count FROM members WHERE guild_id=? AND ' + column + '>?').get(guildId, Number(row.score) || 0);
  return Number(higher.count) + 1;
}

function leaderboard(guildId, kind, period) {
  if (!period || period === 'all') {
    return (kind === 'voice' ? q.voiceTop : kind === 'coins' ? q.coinTop : kind === 'all' ? q.totalTop : q.textTop).all(guildId);
  }
  const days = period === 'daily' ? 1 : period === 'weekly' ? 7 : 30;
  const eventTypes = kind === 'voice' ? "event_type='voice'" : kind === 'coins' ? "event_type='coins'" : kind === 'text' ? "event_type='text'" : "event_type IN ('text','voice')";
  return db.prepare('SELECT user_id,SUM(amount) AS score FROM xp_events WHERE guild_id=? AND ' + eventTypes + ' AND created_at>=unixepoch()-? GROUP BY user_id ORDER BY score DESC LIMIT 10').all(guildId,days*86400);
}

module.exports = {
  db, databasePath, ensureMember,
  levelFor: levelForGuild, curveForGuild,
  addXp, addCoins, resetMember,
  leaderboard, memberRank,
  stats: (guildId) => q.stats.get(guildId),
  startVoice: (guildId, userId, time) => q.voiceStart.run(guildId, userId, time || Date.now()),
  updateVoice: (guildId, userId, time) => q.voiceUpdate.run(time, guildId, userId),
  stopVoice: (guildId, userId) => q.voiceStop.run(guildId, userId),
  voice: (guildId, userId) => q.voiceGet.get(guildId, userId),
  allVoice: () => q.voiceAll.all(),
  settings: (guildId) => q.settings.get(guildId) || {},
  setSetting, roles: (guildId, kind) => q.roles.all(guildId, kind), setRole,
  createPurchase, orders: (guildId) => q.orders.all(guildId), reviewOrder: reviewTransaction,
  setConfig, getConfig, featureEnabled, setFeature, setContent, getContent, savePanel, saveShopMessage,
  createProduct, ensureDefaultColorProduct, updateProduct, setProductActive, removeProduct, products,
  purchaseProduct, getProductPurchase, updateProductPurchase, pendingProductPurchases, refundProductPurchase,
  setCustomColorRole, getCustomColorRole, expiredCustomColorRoles, deleteCustomColorRole,
  createRoomRecord, activeRooms, getRoom, getRoomByChannel, setRoomPanelMessage, setRoomLocked,
  markRoomWarned, closeRoom, extendRoom, renewRoom, setInteractionRoles, interactionRoles,
  logAdmin, pruneXpEvents,
  inviteSnapshots, saveInviteSnapshots, deleteInviteSnapshot, recordInviteJoin, inviteCount,
  localDateKey, taskPeriodKey, createDailyQuestionRun, openDailyQuestion, dailyQuestionForDate,
  setDailyQuestionSent, failDailyQuestion, retryDailyQuestionRun, winDailyQuestion, expireOldDailyQuestions,
  listGuildTasks, getGuildTask, createGuildTask, updateGuildTask, deleteGuildTask,
  incrementTaskProgress, getTaskProgress, claimManualTask, pendingTaskClaims, reviewTaskClaim,
  setTaskMessageProgress,
  setDmAnnouncementSubscription, isDmAnnouncementSubscriber, dmAnnouncementSubscribers, dmAnnouncementSubscriberCount,
  createDmBroadcastJob, activeDmBroadcastJobs, nextDmBroadcastRecipient, markDmBroadcastRecipient, getDmBroadcastJob, latestDmBroadcastJob,
  getGenieSession, saveGenieSession, updateGenieSession, expireGenieSession, getGenieStats, getGenieLeaderboard, completeGenieGame,
  close: () => db.close()
};
