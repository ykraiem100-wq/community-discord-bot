'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  renderWallet, renderTopLeaderboard, renderShopGrid, renderPanelPage,
  renderMainPanel, renderLevelSystemPage, renderAdminDashboard, renderAdminShop, TEMPLATE_DIR
} = require('../src/render');

async function main() {
  for (const filename of [
    'dos-community-banner.png', 'wallet-base.png', 'leaderboard-base.png', 'shop-base.png', 'main-panel-base.png',
    'content-panel-base.png', 'level-system-base.png', 'admin-dashboard-base.png', 'admin-shop-base.png'
  ]) {
    assert.ok(fs.existsSync(path.join(TEMPLATE_DIR, filename)), `missing current template ${filename}`);
  }
  const user = { username: 'dos_member', globalName: 'عضو DOS', displayAvatarURL: () => null };
  const profile = { coins: 1250, total_xp: 16750, messages: 1207, voice_seconds: 5160, text_xp: 5876, voice_xp: 10744 };
  const progress = { level: 7, xp: 976, needed: 1500, percent: 65 };
  const outputs = [
    await renderWallet({ user, displayName: 'عضو DOS', profile, textProgress: progress, voiceProgress: { ...progress, level: 10 }, textPosition: 94, voicePosition: 50 }),
    await renderTopLeaderboard({ entries: [{ name: 'عضو DOS', score: 1250 }], period: 'weekly', metric: 'coins' }),
    await renderShopGrid([{ name: 'لون خاص', price: 200, display_price: '200 DOS Coin', product_type: 'color' }], 'Colors Role'),
    await renderPanelPage({ title: 'DOS COMMUNITY', body: 'اختبار صورة اللوحة', sections: ['القوانين', 'المعلومات', 'رتب التفاعل', 'النظام', 'الفعاليات'] }),
    await renderMainPanel({ title: 'DOS COMMUNITY', body: 'مرحباً بك في مجتمع DOS' }),
    await renderLevelSystemPage({ messageXp: 7, voiceXp: 9, xpPerCoin: 250 }),
    await renderAdminDashboard({ stats: { members: 25, messages: 1500, coins: 1200, voice_seconds: 3600 }, features: { shop: true } }),
    await renderAdminShop([{ name: 'لون خاص', price: 200, currency: 'coin', active: true }])
  ];
  for (const [index, image] of outputs.entries()) {
    assert.ok(Buffer.isBuffer(image), `render ${index} must return a Buffer`);
    assert.ok(image.length > 1000, `render ${index} must not be empty`);
    assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `render ${index} must be a valid PNG`);
  }
  console.log('DOS metallic-cyan PNG rendering tests passed.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
