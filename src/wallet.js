'use strict';
const { EmbedBuilder } = require('discord.js');
function createWalletEmbed(member, user) {
  const textLevel = Math.floor(Math.sqrt(Math.max(0, member.text_xp) / 100));
  const voiceLevel = Math.floor(Math.sqrt(Math.max(0, member.voice_xp) / 100));
  const seconds = Number(member.voice_seconds || 0);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return new EmbedBuilder().setColor(0xAEB8C8)
    .setAuthor({ name: user.username + ' — DOS WALLET', iconURL: user.displayAvatarURL() })
    .setThumbnail(user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: 'رصيد العملات', value: '**' + Number(member.coins).toLocaleString() + '**', inline: true },
      { name: 'إجمالي XP', value: '**' + Number(member.total_xp).toLocaleString() + '**', inline: true },
      { name: 'الرسائل', value: '**' + Number(member.messages).toLocaleString() + '**', inline: true },
      { name: 'المستوى الكتابي', value: '**' + textLevel + '**\n' + Number(member.text_xp).toLocaleString() + ' XP', inline: true },
      { name: 'المستوى الصوتي', value: '**' + voiceLevel + '**\n' + Number(member.voice_xp).toLocaleString() + ' XP', inline: true },
      { name: 'وقت الفويس', value: '**' + hours + '** ساعة و **' + minutes + '** دقيقة', inline: true }
    ).setFooter({ text: 'DOS COMMUNITY • كل 250 XP = 1 COIN' }).setTimestamp();
}
module.exports = { createWalletEmbed };
