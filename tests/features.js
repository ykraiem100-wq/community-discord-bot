'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(),'dos-bot-features-'));
process.env.DATA_DIR = dir;
const db = require('../src/database');
try {
  const guild = 'features-guild';
  const user = 'features-user';
  db.ensureMember(guild,user);
  db.addXp(guild,user,'text',250,{message:true});
  assert.equal(db.ensureMember(guild,user).coins,1);

  db.setFeature(guild,'shop',false,'admin');
  assert.equal(db.featureEnabled(guild,'shop'),false);
  db.setFeature(guild,'shop',true,'admin');
  assert.equal(db.featureEnabled(guild,'shop'),true);

  db.setContent(guild,'rules','قوانين DOS','احترم الجميع','admin');
  assert.equal(db.getContent(guild,'rules').body,'احترم الجميع');

  const productId = db.createProduct(guild,{name:'لون خاص',description:'لون رتبة',price:1,currency:'coin',cash_currency:'JOD',product_type:'color',duration_days:30});
  const purchase = db.purchaseProduct(guild,user,productId);
  assert.equal(purchase.product.name,'لون خاص');
  assert.equal(purchase.status,'awaiting_selection');
  assert.equal(db.ensureMember(guild,user).coins,0);
  assert.equal(db.refundProductPurchase(guild,purchase.id),true);
  assert.equal(db.ensureMember(guild,user).coins,1);

  db.setInteractionRoles(guild,[{id:'role-a',name:'فعاليات'},{id:'role-b',name:'مسابقات'}]);
  assert.equal(db.interactionRoles(guild).length,2);
  db.setSetting(guild,'shop_category_id','category-id');
  assert.equal(db.settings(guild).shop_category_id,'category-id');

  db.addXp(guild,user,'text',250,{message:true});
  const roomProduct = db.createProduct(guild,{name:'غرفة صوتية',description:'30 يوماً',price:1,currency:'coin',cash_currency:'JOD',product_type:'voice_room',duration_days:30});
  const roomPurchase = db.purchaseProduct(guild,user,roomProduct);
  assert.equal(roomPurchase.status,'pending_fulfillment');
  const now = Math.floor(Date.now()/1000);
  const expiry = now + 10*86400;
  const roomId = db.createRoomRecord(guild,user,'channel-test','voice',roomProduct,expiry);
  assert.equal(db.getRoom(guild,roomId,user).expires_at,expiry);
  const renewal = db.renewRoom(guild,user,roomId,now);
  assert.equal(renewal.error,undefined);
  assert.equal(renewal.expires_at,expiry+30*86400);
  assert.equal(db.getRoom(guild,roomId,user).expires_at,expiry+30*86400);
  assert.equal(db.extendRoom(roomId,30),true);
  assert.equal(db.closeRoom(roomId),true);
  assert.equal(db.activeRooms(guild).some((room)=>room.id===roomId),false);

  db.setConfig(guild,'main_panel_buttons',JSON.stringify(['rules','roles','arena']),'admin');
  assert.equal(db.getConfig(guild,'main_panel_buttons','[]'),JSON.stringify(['rules','roles','arena']));

  db.setConfig(guild,'message_xp',11,'admin');
  db.setConfig(guild,'level_first_six','100,150,250,400,500,600','admin');
  assert.equal(db.getConfig(guild,'message_xp','7'),'11');
  assert.deepEqual(db.curveForGuild(guild).firstLevels,[100,150,250,400,500,600]);
  assert.ok(db.leaderboard(guild,'text','daily').length > 0);
  db.close();
  console.log('Feature database tests passed.');
} finally {
  fs.rmSync(dir,{recursive:true,force:true});
}
