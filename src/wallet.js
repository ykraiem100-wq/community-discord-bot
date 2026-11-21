'use strict';
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { levelProgress, difficultyFor } = require('./levels');
const database = require('./database');
const { renderWallet } = require('./render');
function progressBar(percent) {
  const filled = Math.round(Math.min(100,Math.max(0,percent))/10);
  return '▰'.repeat(filled) + '▱'.repeat(10-filled);
}
function createWalletEmbed(member, user, guildId) {
  const curve = guildId ? database.curveForGuild(guildId) : undefined;
  const text = levelProgress(member.text_xp,curve);
  const voice = levelProgress(member.voice_xp,curve);
  const seconds = Number(member.voice_seconds || 0);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return new EmbedBuilder().setColor(0x36D9FF)
    .setAuthor({ name: user.username + ' — DOS WALLET', iconURL: user.displayAvatarURL() })
    .setThumbnail(user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: '💰 رصيد DOS Coin', value: '**' + Number(member.coins).toLocaleString() + '**', inline: true },
      { name: '✨ إجمالي XP', value: '**' + Number(member.total_xp).toLocaleString() + '**', inline: true },
      { name: '💬 الرسائل', value: '**' + Number(member.messages).toLocaleString() + '**', inline: true },
      { name: `📝 المستوى الكتابي ${text.level}`, value: `${progressBar(text.percent)}\n${text.xp}/${text.needed} XP • ${difficultyFor(text.level)}`, inline: false },
      { name: `🎙️ المستوى الصوتي ${voice.level}`, value: `${progressBar(voice.percent)}\n${voice.xp}/${voice.needed} XP • ${difficultyFor(voice.level)}`, inline: false },
      { name: '⏱️ وقت الفويس', value: '**' + hours + '** ساعة و **' + minutes + '** دقيقة', inline: true }
    ).setFooter({ text: 'DOS COMMUNITY • Silver × Cyan × Gold' }).setTimestamp();
}
async function createWalletImage(member, user, guildId, guild, positions = {}) {
  const curve = guildId ? database.curveForGuild(guildId) : undefined;
  const text = levelProgress(Number(member.text_xp || 0), curve);
  const voice = levelProgress(Number(member.voice_xp || 0), curve);
  const image = await renderWallet({
    user, profile: member, textProgress: text, voiceProgress: voice,
    textPosition: positions.text || 0, voicePosition: positions.voice || 0, guild
  });
  return new AttachmentBuilder(image, { name: 'dos-wallet.png' });
}
module.exports = { createWalletEmbed, createWalletImage };
