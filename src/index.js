'use strict';

require('dotenv').config();
const {
  Client, GatewayIntentBits, Partials, EmbedBuilder,
  PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle
} = require('discord.js');
const database = require('./database');
const { createWalletEmbed } = require('./wallet');

const token = (process.env.DISCORD_TOKEN || '').trim();
const clientId = (process.env.DISCORD_CLIENT_ID || '').trim();
const ownerId = (process.env.OWNER_ID || '').trim();
const prefix = process.env.BOT_PREFIX || '.';

if (!token) {
  console.error('[STARTUP] DISCORD_TOKEN is missing. Add it in Nowhost → Environment and redeploy.');
  process.exit(1);
}
if (!clientId) console.warn('[CONFIG] DISCORD_CLIENT_ID is missing. Nowhost uses it for the invite link.');
if (prefix.length > 5) {
  console.error('[CONFIG] BOT_PREFIX must contain five characters or fewer.');
  process.exit(1);
}

console.log('[STARTUP] DOS Community | Node ' + process.version + ' | prefix=' + prefix);
console.log('[DATABASE] ' + database.databasePath);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

const shopItems = [
  { key: 'prison', name: 'Prison', price: 25, description: '25 credits and up' },
  { key: 'animate', name: 'Animate', price: 30, description: '30 credits and up' },
  { key: 'typo-virus', name: 'Typo Virus', price: 30, description: '30 credits and up' },
  { key: 'vault-guard', name: 'Vault Guard', price: 50, description: '50 credits / 3 days' },
  { key: 'sticker-slot', name: 'Sticker Slot', price: 50, description: '50 credits / 14 days' },
  { key: 'honorary-booster', name: 'Honorary Booster', price: 150, description: '150 credits / 7 days' },
  { key: 'emoji-slot', name: 'Emoji Slot', price: 150, description: '150 credits' },
  { key: 'custom-role', name: 'Custom Role', price: 200, description: '200 credits / 14 days' }
];

function isAdmin(member) {
  return Boolean(member && (
    member.permissions.has(PermissionsBitField.Flags.Administrator) ||
    (ownerId && member.id === ownerId)
  ));
}
function eligibleVoice(state) {
  return Boolean(state.channelId && state.member && !state.member.user.bot &&
    !state.selfDeaf && !state.serverDeaf && !state.selfMute && !state.serverMute);
}
async function assignLevelRole(member, kind, level) {
  if (!member || !level) return;
  const configured = database.roles(member.guild.id, kind).filter((row) => level >= row.level);
  if (!configured.length) return;
  const role = member.guild.roles.cache.get(configured[configured.length - 1].role_id);
  const topRole = member.guild.members.me && member.guild.members.me.roles.highest;
  if (!role || !topRole || role.position >= topRole.position || member.roles.cache.has(role.id)) return;
  try {
    await member.roles.add(role, 'Reached ' + kind + ' level ' + level);
  } catch (error) {
    console.error('[LEVEL ROLE] ' + error.message);
  }
}
async function awardVoice(guildId, userId) {
  const session = database.voice(guildId, userId);
  if (!session) return;
  const elapsedMinutes = Math.floor((Date.now() - session.started_at) / 60000);
  if (elapsedMinutes < 1) return;
  const result = database.addXp(guildId, userId, 'voice', elapsedMinutes * 9, { seconds: elapsedMinutes * 60 });
  database.updateVoice(guildId, userId, session.started_at + elapsedMinutes * 60000);
  if (result.newVoiceLevel > result.oldVoiceLevel) {
    const guild = client.guilds.cache.get(guildId);
    let member = guild && guild.members.cache.get(userId);
    if (!member && guild) member = await guild.members.fetch(userId).catch(() => null);
    await assignLevelRole(member, 'voice', result.newVoiceLevel);
  }
}
function helpEmbed() {
  return new EmbedBuilder().setColor(0xAEB8C8).setTitle('DOS COMMUNITY • الأوامر').setDescription([
    '.محفظتي — عرض المحفظة',
    '.متصدرين كتابي — المتصدرون كتابياً',
    '.متصدرين صوتي — المتصدرون صوتياً',
    '.متصدرين عملات — أغنى الأعضاء',
    '.المتجر و .شراء رقم — المتجر',
    '.إحصائيات — إحصائيات السيرفر',
    'الإدارة: .تعيين_قناة متجر #قناة أو .تعيين_قناة ترحيب #قناة',
    'الإدارة: .رتبة_مستوى كتابة 10 @رتبة أو .رتبة_مستوى صوت 10 @رتبة',
    'الإدارة: .طلبات، .قبول ID، .رفض ID'
  ].join('\n')).setFooter({ text: 'كل رسالة 7 XP • كل دقيقة فويس 9 XP • كل 250 XP = 1 عملة' });
}

async function handleCommand(message) {
  const args = message.content.slice(prefix.length).trim().split(/\s+/).filter(Boolean);
  const command = (args.shift() || '').toLowerCase();
  const guildId = message.guild.id;
  const userId = message.author.id;
  try {
    if (command === 'مساعدة' || command === 'اوامر' || command === 'أوامر') {
      return message.reply({ embeds: [helpEmbed()] });
    }
    if (command === 'محفظتي') {
      const user = message.mentions.users.first() || message.author;
      return message.reply({ embeds: [createWalletEmbed(database.ensureMember(guildId, user.id), user)] });
    }
    if (command === 'متصدرين') {
      const kind = args[0] === 'صوتي' ? 'voice' : args[0] === 'عملات' ? 'coins' : 'text';
      const title = kind === 'voice' ? 'المتصدرون صوتياً' : kind === 'coins' ? 'أغنى الأعضاء' : 'المتصدرون كتابياً';
      const lines = database.leaderboard(guildId, kind).map((row, index) =>
        '**' + (index + 1) + '.** <@' + row.user_id + '> — ' + Number(row.score).toLocaleString()
      );
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xAEB8C8).setTitle(title).setDescription(lines.join('\n') || 'لا توجد بيانات بعد.')] });
    }
    if (command === 'إحصائيات') {
      const stats = database.stats(guildId);
      const embed = new EmbedBuilder().setColor(0xAEB8C8).setTitle('إحصائيات المجتمع').addFields(
        { name: 'الأعضاء المسجلون', value: String(stats.members), inline: true },
        { name: 'الرسائل', value: Number(stats.messages).toLocaleString(), inline: true },
        { name: 'ساعات الصوت', value: (Number(stats.voice_seconds) / 3600).toFixed(1), inline: true },
        { name: 'العملات المتداولة', value: Number(stats.coins).toLocaleString(), inline: true }
      );
      return message.reply({ embeds: [embed] });
    }
    if (command === 'المتجر') {
      const text = shopItems.map((item, index) =>
        '**' + (index + 1) + '. ' + item.name + '** — ' + item.description + ' (السعر: ' + item.price + ' عملة)'
      ).join('\n');
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xAEB8C8).setTitle('DOS SHOP').setDescription(text + '\n\nللشراء: ' + prefix + 'شراء رقم_المنتج')] });
    }
    if (command === 'شراء') {
      const item = shopItems[Number(args[0]) - 1];
      if (!item) return message.reply('اختر رقم منتج صحيح من .المتجر.');
      const settings = database.settings(guildId);
      if (settings.shop_channel_id && message.channel.id !== settings.shop_channel_id) {
        return message.reply('المتجر متاح في القناة المخصصة فقط.');
      }
      const orderId = database.createPurchase(guildId, userId, item.key, item.name, item.price);
      if (!orderId) return message.reply('رصيدك غير كافٍ. استخدم .محفظتي لمعرفة رصيدك.');
      return message.reply('تم حجز ' + item.name + ' مقابل ' + item.price + ' عملة. رقم الطلب: #' + orderId + ' وينتظر موافقة الإدارة.');
    }
    if (command === 'طلبات') {
      if (!isAdmin(message.member)) return message.reply('هذا الأمر للإدارة فقط.');
      const rows = database.orders(guildId);
      return message.reply(rows.map((row) =>
        '#' + row.id + ' — ' + row.item_name + ' — <@' + row.user_id + '> — ' + row.price + ' عملة'
      ).join('\n') || 'لا توجد طلبات معلقة.');
    }
    if (command === 'قبول' || command === 'رفض') {
      if (!isAdmin(message.member)) return message.reply('هذا الأمر للإدارة فقط.');
      const orderId = Number(args[0]);
      if (!Number.isSafeInteger(orderId) || orderId < 1) return message.reply('اكتب رقم الطلب بشكل صحيح.');
      const status = command === 'قبول' ? 'approved' : 'rejected';
      if (!database.reviewOrder(guildId, orderId, status, userId)) {
        return message.reply('الطلب غير موجود أو تمت مراجعته مسبقاً.');
      }
      return message.reply(status === 'approved' ? 'تم قبول الطلب #' + orderId + '.' : 'تم رفض الطلب #' + orderId + ' وإعادة العملات لصاحبه.');
    }
    if (command === 'تعيين_قناة') {
      if (!isAdmin(message.member)) return message.reply('هذا الأمر للإدارة فقط.');
      const channel = message.mentions.channels.first();
      if (!channel) return message.reply('اذكر القناة المطلوبة.');
      const key = args[0] === 'ترحيب' ? 'welcome_channel_id' : args[0] === 'متجر' ? 'shop_channel_id' : null;
      if (!key) return message.reply('استخدم: .تعيين_قناة متجر #قناة أو .تعيين_قناة ترحيب #قناة.');
      database.setSetting(guildId, key, channel.id);
      return message.reply('تم تعيين قناة ' + args[0] + ': ' + channel);
    }
    if (command === 'رتبة_مستوى') {
      if (!isAdmin(message.member)) return message.reply('هذا الأمر للإدارة فقط.');
      const kind = args[0] === 'صوت' ? 'voice' : args[0] === 'كتابة' ? 'text' : null;
      const level = Number(args[1]);
      const role = message.mentions.roles.first();
      if (!kind || !Number.isSafeInteger(level) || level < 1 || !role) {
        return message.reply('استخدم: .رتبة_مستوى كتابة 10 @رتبة أو .رتبة_مستوى صوت 10 @رتبة.');
      }
      database.setRole(guildId, kind, level, role.id);
      return message.reply('تم ربط ' + role + ' بمستوى ' + level + '.');
    }
  } catch (error) {
    console.error('[COMMAND] ' + command + ' failed:', error);
    return message.reply('حدث خطأ أثناء تنفيذ الأمر. راجع سجل البوت.').catch(() => {});
  }
}

client.once('ready', async () => {
  console.log('[DISCORD] Logged in as ' + client.user.tag);
  console.log('[DISCORD] Connected to ' + client.guilds.cache.size + ' server(s)');
  // Do not award offline time after redeploy; start fresh sessions for connected members.
  for (const session of database.allVoice()) database.stopVoice(session.guild_id, session.user_id);
  for (const guild of client.guilds.cache.values()) {
    for (const state of guild.voiceStates.cache.values()) {
      if (eligibleVoice(state)) database.startVoice(guild.id, state.id, Date.now());
    }
  }
  setInterval(() => {
    for (const session of database.allVoice()) {
      awardVoice(session.guild_id, session.user_id).catch((error) => console.error('[VOICE] XP update failed:', error));
    }
  }, 15000);
});

client.on('messageCreate', async (message) => {
  if (!message.guild || message.author.bot) return;
  if (message.content.trim().startsWith(prefix)) return handleCommand(message);
  try {
    const result = database.addXp(message.guild.id, message.author.id, 'text', 7, { message: true });
    if (result.newTextLevel > result.oldTextLevel) await assignLevelRole(message.member, 'text', result.newTextLevel);
  } catch (error) {
    console.error('[XP] Message XP failed:', error);
  }
});

client.on('voiceStateUpdate', async (oldState, newState) => {
  try {
    const guildId = newState.guild.id;
    const userId = newState.id;
    const oldChannel = oldState.channelId;
    const newChannel = newState.channelId;
    if (oldChannel && (oldChannel !== newChannel || !eligibleVoice(newState))) {
      await awardVoice(guildId, userId);
      database.stopVoice(guildId, userId);
    }
    if (newChannel && eligibleVoice(newState) && !database.voice(guildId, userId)) {
      database.startVoice(guildId, userId, Date.now());
    }
  } catch (error) {
    console.error('[VOICE] State update failed:', error);
  }
});

client.on('guildMemberAdd', async (member) => {
  try {
    const settings = database.settings(member.guild.id);
    if (!settings.welcome_channel_id) return;
    const channel = member.guild.channels.cache.get(settings.welcome_channel_id);
    if (!channel || !channel.isTextBased() || !channel.send) return;
    const embed = new EmbedBuilder().setColor(0xAEB8C8)
      .setTitle('Welcome to ' + member.guild.name)
      .setDescription('أهلاً ' + member + ' في مجتمعنا! نتمنى لك وقتاً ممتعاً.')
      .setThumbnail(member.user.displayAvatarURL()).setTimestamp();
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('welcome_rules').setLabel('قوانين السيرفر').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('welcome_info').setLabel('معلومات السيرفر').setStyle(ButtonStyle.Primary)
    );
    await channel.send({ embeds: [embed], components: [row] });
  } catch (error) {
    console.error('[WELCOME] Send failed:', error);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  try {
    if (interaction.customId === 'welcome_rules') {
      return interaction.reply({ content: 'يرجى مراجعة قناة القوانين في السيرفر.', ephemeral: true });
    }
    if (interaction.customId === 'welcome_info') {
      return interaction.reply({ content: 'أهلاً بك! استخدم .مساعدة لعرض الأوامر.', ephemeral: true });
    }
  } catch (error) {
    console.error('[BUTTON] Interaction failed:', error);
  }
});

client.on('error', (error) => console.error('[DISCORD] Client error:', error));
client.on('shardError', (error) => console.error('[DISCORD] Gateway error:', error));
client.on('warn', (warning) => console.warn('[DISCORD] Warning:', warning));
process.on('unhandledRejection', (error) => console.error('[PROCESS] Unhandled rejection:', error));
process.on('uncaughtException', (error) => {
  console.error('[PROCESS] Uncaught exception:', error);
  process.exit(1);
});

function shutdown(signal) {
  console.log('[SHUTDOWN] ' + signal + ' received; closing connections.');
  try { client.destroy(); } catch (error) { console.error(error); }
  try { database.close(); } catch (error) { console.error(error); }
  process.exit(0);
}
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

client.login(token).catch((error) => {
  console.error('[STARTUP] Discord login failed:', error);
  if (error && (error.code === 4014 || error.name === 'PrivilegedIntentsRequired')) {
    console.error('[STARTUP] Enable Message Content Intent and Server Members Intent in Discord Developer Portal → Bot → Privileged Gateway Intents.');
  }
  if (error && (error.code === 'TokenInvalid' || error.name === 'TokenInvalid')) {
    console.error('[STARTUP] DISCORD_TOKEN is invalid. Replace it in Nowhost Environment settings.');
  }
  try { database.close(); } catch (closeError) { console.error(closeError); }
  process.exit(1);
});
