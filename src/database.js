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
  'CREATE TABLE IF NOT EXISTS admin_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, user_id TEXT NOT NULL, action TEXT NOT NULL, details TEXT NOT NULL DEFAULT \'\', created_at INTEGER NOT NULL DEFAULT (unixepoch()));'
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
addColumn('shop_products', 'cash_currency', "TEXT NOT NULL DEFAULT 'JOD'");
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
  totalTop: db.prepare('SELECT user_id,total_xp AS score FROM members WHERE guild_id=? ORDER BY score DESC LIMIT 10'),
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
  setPanel: db.prepare('INSERT INTO guild_settings(guild_id,panel_channel_id,panel_message_id) VALUES(?,?,?) ON CONFLICT(guild_id) DO UPDATE SET panel_channel_id=excluded.panel_channel_id,panel_message_id=excluded.panel_message_id'),
  setShopMessage: db.prepare('INSERT INTO guild_settings(guild_id,shop_message_id) VALUES(?,?) ON CONFLICT(guild_id) DO UPDATE SET shop_message_id=excluded.shop_message_id'),
  setCategory: db.prepare('INSERT INTO guild_settings(guild_id,shop_category_id) VALUES(?,?) ON CONFLICT(guild_id) DO UPDATE SET shop_category_id=excluded.shop_category_id'),
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
function setSetting(guildId, key, value) {
  if (key === 'welcome_channel_id') return q.setWelcome.run(guildId, value).changes > 0;
  if (key === 'shop_channel_id') return q.setShop.run(guildId, value).changes > 0;
  if (key === 'shop_category_id') return q.setCategory.run(guildId, value).changes > 0;
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
    easyBase: getConfig(guildId,'level_easy_base','120'), easyStep: getConfig(guildId,'level_easy_step','8'),
    mediumBase: getConfig(guildId,'level_medium_base','650'), mediumStep: getConfig(guildId,'level_medium_step','24'),
    hardBase: getConfig(guildId,'level_hard_base','2200'), hardStep: getConfig(guildId,'level_hard_step','120')
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
function setCustomColorRole(guildId, userId, roleId) {
  db.prepare('INSERT INTO custom_color_roles(guild_id,user_id,role_id) VALUES(?,?,?) ON CONFLICT(guild_id,user_id) DO UPDATE SET role_id=excluded.role_id,updated_at=unixepoch()').run(guildId, userId, roleId);
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
function addCoins(guildId, userId, amount) {
  if (!Number.isSafeInteger(amount) || amount < 1) throw new TypeError('Invalid coin amount');
  ensureMember(guildId,userId);
  db.prepare('UPDATE members SET coins=coins+?,updated_at=unixepoch() WHERE guild_id=? AND user_id=?').run(amount,guildId,userId);
  return q.get.get(guildId,userId);
}
function resetMember(guildId, userId) {
  ensureMember(guildId,userId);
  db.prepare('UPDATE members SET text_xp=0,voice_xp=0,total_xp=0,coin_remainder=0,coins=0,messages=0,voice_seconds=0,updated_at=unixepoch() WHERE guild_id=? AND user_id=?').run(guildId,userId);
  db.prepare('DELETE FROM xp_events WHERE guild_id=? AND user_id=?').run(guildId,userId);
  return q.get.get(guildId,userId);
}
function ensureColorProduct(guildId) {
  const existing = db.prepare("SELECT id FROM shop_products WHERE guild_id=? AND product_type='color' LIMIT 1").get(guildId);
  if (existing) return existing.id;
  const result = db.prepare("INSERT INTO shop_products(guild_id,name,description,price,currency,product_type,active) VALUES(?,?,?,0,'coin','color',0)")
    .run(guildId,'لون رتبة خاص','اختر من أكثر من 200 لون، وسيُنشئ البوت رتبتك تلقائياً فوق رتبة Member حسب ترتيب الرتب.',);
  return Number(result.lastInsertRowid);
}
function logAdmin(guildId, userId, action, details) {
  db.prepare('INSERT INTO admin_audit(guild_id,user_id,action,details) VALUES(?,?,?,?)').run(guildId,userId,action,details || '');
}
function pruneXpEvents() {
  return db.prepare('DELETE FROM xp_events WHERE created_at < unixepoch() - 45*86400').run().changes;
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
  addXp,
  leaderboard,
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
  createProduct, updateProduct, setProductActive, removeProduct, products, addCoins, resetMember, ensureColorProduct,
  purchaseProduct, getProductPurchase, updateProductPurchase, pendingProductPurchases, refundProductPurchase,
  setCustomColorRole, getCustomColorRole, createRoomRecord, activeRooms, getRoom,
  markRoomWarned, closeRoom, extendRoom, renewRoom, setInteractionRoles, interactionRoles,
  logAdmin, pruneXpEvents, close: () => db.close()
};
