const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");
const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, "community.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");
db.exec("CREATE TABLE IF NOT EXISTS members (guild_id TEXT NOT NULL,user_id TEXT NOT NULL,text_xp INTEGER NOT NULL DEFAULT 0,voice_xp INTEGER NOT NULL DEFAULT 0,total_xp INTEGER NOT NULL DEFAULT 0,coin_remainder INTEGER NOT NULL DEFAULT 0,coins INTEGER NOT NULL DEFAULT 0,messages INTEGER NOT NULL DEFAULT 0,voice_seconds INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL DEFAULT (unixepoch()),PRIMARY KEY(guild_id,user_id)); CREATE TABLE IF NOT EXISTS guild_settings (guild_id TEXT PRIMARY KEY,welcome_channel_id TEXT,shop_channel_id TEXT); CREATE TABLE IF NOT EXISTS voice_sessions (guild_id TEXT NOT NULL,user_id TEXT NOT NULL,started_at INTEGER NOT NULL,PRIMARY KEY(guild_id,user_id)); CREATE TABLE IF NOT EXISTS level_roles (guild_id TEXT NOT NULL,kind TEXT NOT NULL,level INTEGER NOT NULL,role_id TEXT NOT NULL,PRIMARY KEY(guild_id,kind,level)); CREATE TABLE IF NOT EXISTS shop_orders (id INTEGER PRIMARY KEY AUTOINCREMENT,guild_id TEXT NOT NULL,user_id TEXT NOT NULL,item_key TEXT NOT NULL,item_name TEXT NOT NULL,price INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_at INTEGER NOT NULL DEFAULT (unixepoch()),reviewed_by TEXT,reviewed_at INTEGER);");
const q = {
 get:db.prepare("SELECT * FROM members WHERE guild_id=? AND user_id=?"),
 ensure:db.prepare("INSERT OR IGNORE INTO members(guild_id,user_id) VALUES(?,?)"),
 message:db.prepare("UPDATE members SET messages=messages+1 WHERE guild_id=? AND user_id=?"),
 update:db.prepare("UPDATE members SET text_xp=?,voice_xp=?,total_xp=?,coin_remainder=?,coins=coins+?,voice_seconds=voice_seconds+? WHERE guild_id=? AND user_id=?"),
 spend:db.prepare("UPDATE members SET coins=coins-? WHERE guild_id=? AND user_id=? AND coins>=?"),
 stats:db.prepare("SELECT COUNT(*) members,COALESCE(SUM(messages),0) messages,COALESCE(SUM(voice_seconds),0) voice_seconds,COALESCE(SUM(coins),0) coins FROM members WHERE guild_id=?"),
 settings:db.prepare("SELECT * FROM guild_settings WHERE guild_id=?"),
 setSettings:db.prepare("INSERT INTO guild_settings(guild_id,welcome_channel_id,shop_channel_id) VALUES(?,?,?) ON CONFLICT(guild_id) DO UPDATE SET welcome_channel_id=COALESCE(excluded.welcome_channel_id,guild_settings.welcome_channel_id),shop_channel_id=COALESCE(excluded.shop_channel_id,guild_settings.shop_channel_id)"),
 voiceStart:db.prepare("INSERT OR IGNORE INTO voice_sessions(guild_id,user_id,started_at) VALUES(?,?,?)"),
 voiceGet:db.prepare("SELECT * FROM voice_sessions WHERE guild_id=? AND user_id=?"),
 voiceAll:db.prepare("SELECT * FROM voice_sessions"),
 voiceUpdate:db.prepare("UPDATE voice_sessions SET started_at=? WHERE guild_id=? AND user_id=?"),
 voiceStop:db.prepare("DELETE FROM voice_sessions WHERE guild_id=? AND user_id=?"),
 roleSet:db.prepare("INSERT INTO level_roles(guild_id,kind,level,role_id) VALUES(?,?,?,?) ON CONFLICT(guild_id,kind,level) DO UPDATE SET role_id=excluded.role_id"),
 roles:db.prepare("SELECT * FROM level_roles WHERE guild_id=? AND kind=? ORDER BY level"),
 orderCreate:db.prepare("INSERT INTO shop_orders(guild_id,user_id,item_key,item_name,price) VALUES(?,?,?,?,?)"),
 orderGet:db.prepare("SELECT * FROM shop_orders WHERE guild_id=? AND id=?"),
 orders:db.prepare("SELECT * FROM shop_orders WHERE guild_id=? AND status='pending' ORDER BY id LIMIT 20"),
 orderReview:db.prepare("UPDATE shop_orders SET status=?,reviewed_by=?,reviewed_at=unixepoch() WHERE guild_id=? AND id=? AND status='pending'")
};
function ensure(g,u){q.ensure.run(g,u);return q.get.get(g,u);}
function level(x){return Math.floor(Math.sqrt(Math.max(0,x)/100));}
function addXp(g,u,kind,n,opts={}){const old=ensure(g,u);const tx=old.text_xp+(kind==="text"?n:0);const vx=old.voice_xp+(kind==="voice"?n:0);const earned=old.coin_remainder+n;const coins=Math.floor(earned/250);q.update.run(tx,vx,tx+vx,earned%250,coins,opts.seconds||0,g,u);if(opts.message)q.message.run(g,u);return {member:q.get.get(g,u),oldTextLevel:level(old.text_xp),newTextLevel:level(tx),oldVoiceLevel:level(old.voice_xp),newVoiceLevel:level(vx),coins};}
function spend(g,u,n){ensure(g,u);return q.spend.run(n,g,u,n).changes===1;}
function startVoice(g,u,now=Date.now()){ensure(g,u);q.voiceStart.run(g,u,now);}
function voice(g,u){return q.voiceGet.get(g,u);}
function allVoice(){return q.voiceAll.all();}
function updateVoice(g,u,t){q.voiceUpdate.run(t,g,u);}
function stopVoice(g,u){q.voiceStop.run(g,u);}
function stats(g){return q.stats.get(g);}
function leaderboard(g,k){const col=k==="voice"?"voice_xp":k==="coins"?"coins":"text_xp";return db.prepare("SELECT user_id,"+col+" score FROM members WHERE guild_id=? ORDER BY "+col+" DESC LIMIT 10").all(g);}
function settings(g){return q.settings.get(g)||{};}
function setSetting(g,k,v){const s=settings(g);q.setSettings.run(g,k==="welcome_channel_id"?v:s.welcome_channel_id||null,k==="shop_channel_id"?v:s.shop_channel_id||null);}
function setRole(g,k,l,r){q.roleSet.run(g,k,l,r);}
function roles(g,k){return q.roles.all(g,k);}
function createOrder(g,u,key,name,price){return Number(q.orderCreate.run(g,u,key,name,price).lastInsertRowid);}
function getOrder(g,id){return q.orderGet.get(g,id);}
function orders(g){return q.orders.all(g);}
function review(g,id,status,by){return q.orderReview.run(status,by,g,id).changes===1;}
module.exports={db,ensure,level,addXp,spend,startVoice,voice,allVoice,updateVoice,stopVoice,stats,leaderboard,settings,setSetting,setRole,roles,createOrder,getOrder,orders,review};
