'use strict';
require('dotenv').config();
const {
  Client, GatewayIntentBits, Partials, EmbedBuilder, AttachmentBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, REST, Routes, MessageFlags
} = require('discord.js');
const database = require('./database');
const { createWalletImage } = require('./wallet');
const { renderTopLeaderboard } = require('./render');
const { shopPayload, handleShopInteraction, processRoomExpirations, colorPickerPayload } = require('./shop');
const { handlePublicPanelInteraction, CYAN } = require('./panels');
const { isAdmin, homePayload, handleAdminInteraction, handleAdminModal } = require('./admin');

const token = (process.env.DISCORD_TOKEN || '').trim();
const clientId = (process.env.DISCORD_CLIENT_ID || '').trim();
const ownerId = (process.env.OWNER_ID || '').trim();
const prefix = process.env.BOT_PREFIX || '.';
const targetGuildId = (process.env.DISCORD_GUILD_ID || '').trim();
if (!token) {
  console.error('[STARTUP] DISCORD_TOKEN is missing. Add it in Nowhost → Environment and redeploy.');
  process.exit(1);
}
if (!clientId) console.warn('[CONFIG] DISCORD_CLIENT_ID is missing. Slash commands will not be registered.');
if (prefix.length > 5) {
  console.error('[CONFIG] BOT_PREFIX must contain five characters or fewer.');
  process.exit(1);
}

console.log('[STARTUP] DOS Community | Node ' + process.version + ' | prefix=' + prefix);
console.log('[DATABASE] ' + database.databasePath);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel]
});

const slashCommands = [
  new SlashCommandBuilder().setName('wallet').setDescription('عرض محفظتك أو محفظة عضو آخر')
    .addUserOption((option) => option.setName('member').setDescription('العضو المطلوب').setRequired(false)),
  new SlashCommandBuilder().setName('shop').setDescription('عرض متجر DOS COMMUNITY'),
  new SlashCommandBuilder().setName('top').setDescription('عرض المتصدرين في DOS COMMUNITY')
    .addStringOption((option) => option.setName('category').setDescription('نوع الترتيب').setRequired(false)
      .addChoices({name:'الكل',value:'all'},{name:'العملات',value:'coins'},{name:'كتابي',value:'text'},{name:'صوتي',value:'voice'}))
    .addStringOption((option) => option.setName('period').setDescription('الفترة الزمنية').setRequired(false)
      .addChoices({name:'منذ البداية',value:'all'},{name:'يومي',value:'daily'},{name:'أسبوعي',value:'weekly'},{name:'شهري',value:'monthly'})),
  new SlashCommandBuilder().setName('color-selection').setDescription('استكمال اختيار لون منتج اشتريته')
    .addIntegerOption((option) => option.setName('order_id').setDescription('رقم طلب اللون').setRequired(true)),
  new SlashCommandBuilder().setName('admin-panel').setDescription('فتح لوحة إدارة DOS COMMUNITY')
].map((command) => command.toJSON());

async function registerSlashCommands() {
  if (!clientId) return;
  const rest = new REST({ version: '10' }).setToken(token);
  const fastGuildId = targetGuildId || (client.guilds.cache.size === 1 ? client.guilds.cache.first().id : '');
  const route = fastGuildId ? Routes.applicationGuildCommands(clientId,fastGuildId) : Routes.applicationCommands(clientId);
  await rest.put(route,{ body: slashCommands });
  console.log(`[SLASH] Registered ${slashCommands.length} commands ${fastGuildId ? 'for guild '+fastGuildId : 'globally'}.`);
}
function helpEmbed() {
  return new EmbedBuilder().setColor(CYAN).setTitle('DOS COMMUNITY • الأوامر').setDescription([
    '/wallet أو .محفظتي — عرض المحفظة',
    '/top أو اكتب TOP — المتصدرون',
    '/shop أو .المتجر — متجر DOS',
    '/color-selection — استكمال اختيار اللون برقم الطلب إن تعذّر فتح الرسائل الخاصة',
    '.متصدرين كتابي / صوتي / عملات — ترتيب مختصر',
    '.إحصائيات — إحصائيات السيرفر',
    'للإدارة: /admin-panel — لوحة التحكم التفاعلية',
    'للإدارة: .تعيين_قناة متجر #قناة',
    'للإدارة: .رتبة_مستوى كتابة 10 @رتبة أو .رتبة_مستوى صوت 10 @رتبة'
  ].join('\n')).setFooter({ text: '7 XP لكل رسالة • 9 XP لكل دقيقة صوت • 250 XP = 1 DOS Coin (قابلة للتعديل من الإدارة)' });
}
async function walletPayload(guild, user) {
  const guildId = guild.id;
  const profile = database.ensureMember(guildId, user.id);
  const guildMember = guild.members.cache.get(user.id)
    || await guild.members.fetch(user.id).catch(() => null);
  const image = await createWalletImage(profile, user, guildId, guild, {
    text: database.memberRank(guildId, user.id, 'text'),
    voice: database.memberRank(guildId, user.id, 'voice'),
    displayName: guildMember ? guildMember.displayName : (user.globalName || user.username)
  });
  return { files: [image] };
}
async function topPayload(guild, kind, period) {
  const rows = database.leaderboard(guild.id, kind, period);
  const entries = await Promise.all(rows.slice(0, 10).map(async (row) => {
    let member = guild.members.cache.get(row.user_id);
    if (!member) member = await guild.members.fetch(row.user_id).catch(() => null);
    return { name: member ? member.displayName : ('عضو ' + String(row.user_id).slice(-4)), score: Number(row.score || 0) };
  }));
  const image = await renderTopLeaderboard({ guild, entries, period, metric: kind });
  return { files: [new AttachmentBuilder(image, { name: 'dos-top.png' })] };
}
async function assignLevelRole(member, kind, level) {
  if (!member || !level) return;
  const configured = database.roles(member.guild.id,kind).filter((row) => level >= row.level);
  if (!configured.length) return;
  const role = member.guild.roles.cache.get(configured[configured.length-1].role_id);
  const topRole = member.guild.members.me && member.guild.members.me.roles.highest;
  if (!role || !topRole || role.position >= topRole.position || member.roles.cache.has(role.id)) return;
  try { await member.roles.add(role,`Reached ${kind} level ${level}`); }
  catch (error) { console.error('[LEVEL ROLE]',error.message); }
}
async function awardVoice(guildId,userId) {
  const session = database.voice(guildId,userId);
  if (!session) return;
  const elapsedMinutes = Math.floor((Date.now()-session.started_at)/60000);
  if (elapsedMinutes < 1) return;
  const voiceRate = Number(database.getConfig(guildId,'voice_xp','9'));
  const amount = elapsedMinutes * voiceRate;
  const result = database.addXp(guildId,userId,'voice',amount,{seconds:elapsedMinutes*60,
    awardXp:database.featureEnabled(guildId,'levels'), awardCoins:database.featureEnabled(guildId,'economy'),
    xpPerCoin:Number(database.getConfig(guildId,'xp_per_coin','250'))});
  database.updateVoice(guildId,userId,session.started_at+elapsedMinutes*60000);
  if (database.featureEnabled(guildId,'levels') && result.newVoiceLevel > result.oldVoiceLevel) {
    const guild = client.guilds.cache.get(guildId);
    let member = guild && guild.members.cache.get(userId);
    if (!member && guild) member = await guild.members.fetch(userId).catch(() => null);
    await assignLevelRole(member,'voice',result.newVoiceLevel);
  }
}
async function handleCommand(message) {
  const args = message.content.slice(prefix.length).trim().split(/\s+/).filter(Boolean);
  const command = (args.shift() || '').toLowerCase();
  const guildId = message.guild.id;
  const userId = message.author.id;
  try {
    if (['مساعدة','اوامر','أوامر'].includes(command)) return message.reply({ embeds:[helpEmbed()] });
    if (command === 'محفظتي') {
      if (!database.featureEnabled(guildId,'economy')) return message.reply('المحفظة متوقفة مؤقتاً.');
      const user = message.mentions.users.first() || message.author;
      return message.reply(await walletPayload(message.guild,user));
    }
    if (command === 'top' || command === 'متصدرين') {
      if (!database.featureEnabled(guildId,'top')) return message.reply('نظام TOP متوقف حالياً.');
      const category = args[0] === 'صوتي' ? 'voice' : args[0] === 'عملات' ? 'coins' : args[0] === 'الكل' ? 'all' : 'text';
      const period = ({يومي:'daily',أسبوعي:'weekly',شهري:'monthly','منذ_البداية':'all'})[args[1]] || 'all';
      return message.reply(await topPayload(message.guild,category,period));
    }
    if (command === 'إحصائيات') {
      const stats = database.stats(guildId);
      return message.reply({ embeds:[new EmbedBuilder().setColor(CYAN).setTitle('إحصائيات DOS COMMUNITY').addFields(
        {name:'الأعضاء المسجلون',value:String(stats.members),inline:true},
        {name:'الرسائل',value:Number(stats.messages).toLocaleString(),inline:true},
        {name:'ساعات الصوت',value:(Number(stats.voice_seconds)/3600).toFixed(1),inline:true},
        {name:'العملات المتداولة',value:Number(stats.coins).toLocaleString(),inline:true}
      )] });
    }
    if (command === 'المتجر') {
      if (!database.featureEnabled(guildId,'shop')) return message.reply('المتجر متوقف حالياً.');
      const settings = database.settings(guildId);
      if (settings.shop_channel_id && message.channel.id !== settings.shop_channel_id) return message.reply({ content:`المتجر متاح في ${message.guild.channels.cache.get(settings.shop_channel_id) || 'القناة المخصصة'} فقط.` });
      return message.reply(await shopPayload(guildId,0));
    }
    if (command === 'طلبات') {
      if (!isAdmin(message.member,userId)) return message.reply('هذا الأمر للإدارة فقط.');
      const rows = database.orders(guildId);
      return message.reply(rows.map((row) => `#${row.id} — ${row.item_name} — <@${row.user_id}> — ${row.price} عملة`).join('\n') || 'لا توجد طلبات معلقة.');
    }
    if (command === 'قبول' || command === 'رفض') {
      if (!isAdmin(message.member,userId)) return message.reply('هذا الأمر للإدارة فقط.');
      const orderId = Number(args[0]);
      if (!Number.isSafeInteger(orderId) || orderId < 1) return message.reply('اكتب رقم الطلب بشكل صحيح.');
      const status = command === 'قبول' ? 'approved' : 'rejected';
      if (!database.reviewOrder(guildId,orderId,status,userId)) return message.reply('الطلب غير موجود أو تمت مراجعته مسبقاً.');
      return message.reply(status === 'approved' ? `تم قبول الطلب #${orderId}.` : `تم رفض الطلب #${orderId} وإعادة العملات لصاحبه.`);
    }
    if (command === 'تعيين_قناة') {
      if (!isAdmin(message.member,userId)) return message.reply('هذا الأمر للإدارة فقط.');
      const channel = message.mentions.channels.first();
      if (!channel) return message.reply('اذكر القناة المطلوبة.');
      const key = args[0] === 'متجر' ? 'shop_channel_id' : null;
      if (!key) return message.reply('استخدم: .تعيين_قناة متجر #قناة.');
      database.setSetting(guildId,key,channel.id);
      return message.reply(`تم تعيين قناة ${args[0]}: ${channel}`);
    }
    if (command === 'رتبة_مستوى') {
      if (!isAdmin(message.member,userId)) return message.reply('هذا الأمر للإدارة فقط.');
      const kind = args[0] === 'صوت' ? 'voice' : args[0] === 'كتابة' ? 'text' : null;
      const level = Number(args[1]);
      const role = message.mentions.roles.first();
      if (!kind || !Number.isSafeInteger(level) || level < 1 || !role) return message.reply('استخدم: .رتبة_مستوى كتابة 10 @رتبة أو .رتبة_مستوى صوت 10 @رتبة.');
      database.setRole(guildId,kind,level,role.id);
      return message.reply(`تم ربط ${role} بمستوى ${level}.`);
    }
  } catch (error) {
    console.error('[COMMAND] '+command+' failed:',error);
    return message.reply('حدث خطأ أثناء تنفيذ الأمر. راجع سجل البوت.').catch(() => {});
  }
}

async function handleSlashCommand(interaction) {
  if (!interaction.guildId || !interaction.guild) return interaction.reply({ content: 'استخدم هذا الأمر داخل سيرفر DOS COMMUNITY.', flags: MessageFlags.Ephemeral });
  const guildId = interaction.guildId;
  if (interaction.commandName === 'admin-panel') {
    if (!isAdmin(interaction.member,interaction.user.id,interaction.memberPermissions)) return interaction.reply({ content:'هذه اللوحة للإدارة فقط.',flags:MessageFlags.Ephemeral });
    return interaction.reply({ ...await homePayload(interaction.guildId),flags:MessageFlags.Ephemeral });
  }
  if (interaction.commandName === 'wallet') {
    if (!database.featureEnabled(guildId,'economy')) return interaction.reply({content:'المحفظة متوقفة مؤقتاً.',flags:MessageFlags.Ephemeral});
    const user = interaction.options.getUser('member') || interaction.user;
    return interaction.reply({ ...(await walletPayload(interaction.guild,user)), flags: MessageFlags.Ephemeral });
  }
  if (interaction.commandName === 'top') {
    if (!database.featureEnabled(guildId,'top')) return interaction.reply({content:'نظام TOP متوقف حالياً.',flags:MessageFlags.Ephemeral});
    const category = interaction.options.getString('category') || 'all';
    const period = interaction.options.getString('period') || 'all';
    return interaction.reply(await topPayload(interaction.guild,category,period));
  }
  if (interaction.commandName === 'shop') {
    if (!database.featureEnabled(guildId,'shop')) return interaction.reply({content:'المتجر متوقف حالياً.',flags:MessageFlags.Ephemeral});
    const settings = database.settings(guildId);
    if (settings.shop_channel_id && interaction.channelId !== settings.shop_channel_id) return interaction.reply({content:`المتجر متاح في <#${settings.shop_channel_id}> فقط.`,flags:MessageFlags.Ephemeral});
    return interaction.reply(await shopPayload(guildId,0));
  }
  if (interaction.commandName === 'color-selection') {
    const orderId = interaction.options.getInteger('order_id');
    const purchase = database.getProductPurchase(guildId,orderId);
    if (!purchase || purchase.user_id !== interaction.user.id || purchase.status !== 'awaiting_selection') return interaction.reply({content:'لا يوجد طلب لون معلّق بهذا الرقم لحسابك.',flags:MessageFlags.Ephemeral});
    return interaction.reply({ ...colorPickerPayload(guildId,orderId,0),flags:MessageFlags.Ephemeral });
  }
}

client.once('clientReady',async () => {
  console.log('[DISCORD] Logged in as '+client.user.tag);
  console.log('[DISCORD] Connected to '+client.guilds.cache.size+' server(s)');
  await registerSlashCommands().catch((error) => console.error('[SLASH] Registration failed:',error.message));
  for (const session of database.allVoice()) database.stopVoice(session.guild_id,session.user_id);
  for (const guild of client.guilds.cache.values()) for (const state of guild.voiceStates.cache.values()) {
    if (state.channelId && state.member && !state.member.user.bot && !state.selfDeaf && !state.serverDeaf && !state.selfMute && !state.serverMute) database.startVoice(guild.id,state.id,Date.now());
  }
  setInterval(() => {
    for (const session of database.allVoice()) awardVoice(session.guild_id,session.user_id).catch((error) => console.error('[VOICE] XP update failed:',error));
  },15000).unref();
  setInterval(() => processRoomExpirations(client).catch((error) => console.error('[ROOM] Scheduler failed:',error)),60000).unref();
  processRoomExpirations(client).catch((error) => console.error('[ROOM] Initial sweep failed:',error));
  database.pruneXpEvents();
  setInterval(() => database.pruneXpEvents(),3600000).unref();
});

client.on('messageCreate',async (message) => {
  if (!message.guild || message.author.bot) return;
  const trimmed = message.content.trim();
  if (/^top$/i.test(trimmed)) {
    if (!database.featureEnabled(message.guild.id,'top')) return;
    return message.reply(await topPayload(message.guild,'all','all'));
  }
  if (trimmed.startsWith(prefix)) return handleCommand(message);
  try {
    const guildId = message.guild.id;
    const rate = Number(database.getConfig(guildId,'message_xp','7'));
    const awardXp = database.featureEnabled(guildId,'levels');
    const awardCoins = database.featureEnabled(guildId,'economy');
    const result = database.addXp(guildId,message.author.id,'text',rate,{message:true,awardXp,awardCoins,xpPerCoin:Number(database.getConfig(guildId,'xp_per_coin','250'))});
    if (awardXp && result.newTextLevel > result.oldTextLevel) await assignLevelRole(message.member,'text',result.newTextLevel);
  } catch (error) { console.error('[XP] Message XP failed:',error); }
});

client.on('voiceStateUpdate',async (oldState,newState) => {
  try {
    const guildId = newState.guild.id;
    const userId = newState.id;
    const wasEligible = Boolean(oldState.channelId && oldState.member && !oldState.member.user.bot && !oldState.selfDeaf && !oldState.serverDeaf && !oldState.selfMute && !oldState.serverMute);
    const isEligible = Boolean(newState.channelId && newState.member && !newState.member.user.bot && !newState.selfDeaf && !newState.serverDeaf && !newState.selfMute && !newState.serverMute);
    if (oldState.channelId && (!isEligible || oldState.channelId !== newState.channelId)) {
      await awardVoice(guildId,userId);
      database.stopVoice(guildId,userId);
    }
    if (isEligible && !database.voice(guildId,userId)) database.startVoice(guildId,userId,Date.now());
  } catch (error) { console.error('[VOICE] State update failed:',error); }
});

client.on('interactionCreate',async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) return await handleSlashCommand(interaction);
    if (interaction.isModalSubmit()) {
      const handled = await handleAdminModal(interaction);
      if (handled !== false) return handled;
    }
    if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isChannelSelectMenu() || interaction.isRoleSelectMenu()) {
      if (interaction.customId.startsWith('admin:')) return await handleAdminInteraction(interaction,client);
      if (interaction.customId.startsWith('public:') || interaction.customId.startsWith('notify:')) {
        const handled = await handlePublicPanelInteraction(interaction);
        if (handled !== false) return handled;
      }
      if (interaction.customId.startsWith('shop:') || interaction.customId.startsWith('color:') || interaction.customId.startsWith('room:')) {
        const handled = await handleShopInteraction(interaction,client);
        if (handled !== false) return handled;
      }
    }
  } catch (error) {
    console.error('[INTERACTION] Failed:',error);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) await interaction.reply({content:'حدث خطأ أثناء تنفيذ الطلب. راجع سجل البوت.',flags:MessageFlags.Ephemeral}).catch(() => {});
    else if (interaction.isRepliable() && interaction.deferred) await interaction.editReply({content:'حدث خطأ أثناء تنفيذ الطلب. راجع سجل البوت.'}).catch(() => {});
  }
});

client.on('error',(error) => console.error('[DISCORD] Client error:',error));
client.on('shardError',(error) => console.error('[DISCORD] Gateway error:',error));
client.on('warn',(warning) => console.warn('[DISCORD] Warning:',warning));
process.on('unhandledRejection',(error) => console.error('[PROCESS] Unhandled rejection:',error));
process.on('uncaughtException',(error) => { console.error('[PROCESS] Uncaught exception:',error); process.exit(1); });
function shutdown(signal) {
  console.log('[SHUTDOWN] '+signal+' received; closing connections.');
  try { client.destroy(); } catch (error) { console.error(error); }
  try { database.close(); } catch (error) { console.error(error); }
  process.exit(0);
}
process.once('SIGINT',() => shutdown('SIGINT'));
process.once('SIGTERM',() => shutdown('SIGTERM'));
client.login(token).catch((error) => {
  console.error('[STARTUP] Discord login failed:',error);
  if (error && (error.code === 4014 || error.name === 'PrivilegedIntentsRequired')) console.error('[STARTUP] Enable Message Content Intent and Server Members Intent in Discord Developer Portal → Bot → Privileged Gateway Intents.');
  if (error && (error.code === 'TokenInvalid' || error.name === 'TokenInvalid')) console.error('[STARTUP] DISCORD_TOKEN is invalid. Replace it in Nowhost Environment settings.');
  try { database.close(); } catch (closeError) { console.error(closeError); }
  process.exit(1);
});
