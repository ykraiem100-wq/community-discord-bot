'use strict';
const assert = require('node:assert/strict');
const {
  renderWallet, renderTopLeaderboard, renderShopGrid, renderPanelPage
} = require('../src/render');

async function main() {
  const user = { username: 'DOS Member', displayName: 'عضو DOS', displayAvatarURL: () => null };
  const profile = { coins: 1250, total_xp: 16750, messages: 1207, voice_seconds: 5160, text_xp: 5876, voice_xp: 10744 };
  const progress = { level: 7, xp: 976, needed: 1500, percent: 65 };
  const outputs = [
    await renderWallet({ user, profile, textProgress: progress, voiceProgress: progress }),
    await renderTopLeaderboard({ entries: [{ name: 'DOS Member', score: 1250 }], period: 'weekly', metric: 'coins' }),
    await renderShopGrid([{ name: 'لون خاص', price: 200, display_price: '200 DOS Coin', product_type: 'color' }]),
    await renderPanelPage({ title: 'DOS COMMUNITY', body: 'اختبار صورة اللوحة', sections: ['القوانين', 'المعلومات', 'رتب التفاعل', 'النظام', 'الفعاليات'] })
  ];
  for (const [index, image] of outputs.entries()) {
    assert.ok(Buffer.isBuffer(image), 'render ' + index + ' must return a Buffer');
    assert.ok(image.length > 1000, 'render ' + index + ' must not be empty');
    assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'render ' + index + ' must be a valid PNG');
  }
  console.log('PNG rendering tests passed.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
