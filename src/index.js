'use strict';
require('dotenv').config();
if (!process.env.TZ) process.env.TZ = 'Asia/Amman';
const {
  Client, GatewayIntentBits, Partials, EmbedBuilder, AttachmentBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, REST, Routes, MessageFlags, PermissionFlagsBits
} = require('discord.js');
const database = require('./database');
const { createWalletImage } = require('./wallet');
const { renderTopLeaderboard, renderLevelUpBanner, renderAdminSection } = require('./render');
const { shopPayload, handleShopInteraction, handleShopModal, processRoomExpirations, colorPickerPayload } = require('./shop');
const { handlePublicPanelInteraction, CYAN } = require('./panels');
const { sendJoinWelcome, getJoinWelcomeConfig, parseButtonEmoji } = require('./join-welcome');
const { sendMemberWelcomeCard } = require('./member-welcome');
const { tickDailyQuestions, checkDailyQuestionAnswer } = require('./daily-questions');
const { memberTasksPayload, handleTaskInteraction, handleTaskModal, grantTaskReward, publishTaskRewardMessage } = require('./tasks');
const { getBoosterMultiplier, applyXpMultiplier } = require('./booster-xp');
const { getLevelRoleTransition } = require('./level-roles');
const { isAdmin, homePayload, handleAdminInteraction, handleAdminModal } = require('./admin');
const { broadcastStatusText, processDmBroadcastTick } = require('./broadcast');
const { startGenieGame, handleGenieInteraction } = require('./genie');

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
    GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildInvites],
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
  new SlashCommandBuilder().setName('admin-panel').setDescription('فتح لوحة إدارة DOS COMMUNITY'),
  new SlashCommandBuilder().setName('add-coins').setDescription('إضافة عملات DOS إلى عضو (للإدارة فقط)')
    .addUserOption((option) => option.setName('member').setDescription('العضو المستهدف').setRequired(true))
    .addIntegerOption((option) => option.setName('amount').setDescription('عدد العملات').setRequired(true).setMinValue(1).setMaxValue(1000000000)),
  new SlashCommandBuilder().setName('add-xp').setDescription('إضافة XP إلى عضو (للإدارة فقط)')
    .addUserOption((option) => option.setName('member').setDescription('العضو المستهدف').setRequired(true))
    .addIntegerOption((option) => option.setName('amount').setDescription('كمية XP').setRequired(true).setMinValue(1).setMaxValue(1000000000))
    .addStringOption((option) => option.setName('type').setDescription('نوع XP').setRequired(true)
      .addChoices({ name: 'كتابي', value: 'text' }, { name: 'صوتي', value: 'voice' })),
  new SlashCommandBuilder().setName('reset-member').setDescription('إعادة ضبط بيانات عضو بعد التأكيد (للإدارة فقط)')
    .addUserOption((option) => option.setName('member').setDescription('العضو المستهدف').setRequired(true)),
  new SlashCommandBuilder().setName('dm-notifications').setDescription('الاشتراك أو إلغاء الاشتراك في إعلانات DOS الخاصة')
    .addBooleanOption((option) => option.setName('enabled').setDescription('تفعيل أو إيقاف استقبال إعلانات الخاص').setRequired(true)),
  new SlashCommandBuilder().setName('dm-announcement').setDescription('إعداد إعلان خاص للمشتركين بإعلانات DOS (للإدارة فقط)')
    .addStringOption((option) => option.setName('message').setDescription('نص الإعلان الذي سيصل للمشتركين فقط').setRequired(true).setMaxLength(1800)),
  new SlashCommandBuilder().setName('dm-announcement-status').setDescription('عرض حالة آخر إعلان خاص (للإدارة فقط)')
].map((command) => command.toJSON());

const PREFIX_COMMAND_KEYS = Object.freeze({
  'مساعدة': 'help', 'اوامر': 'help', 'أوامر': 'help', 'محفظتي': 'wallet',
  'مهامي': 'tasks', 'دعواتي': 'invites', 'رابط': 'invite_link',
  'top': 'top', 'متصدرين': 'top', 'إحصائيات': 'stats', 'المتجر': 'shop',
  'طلبات': 'orders', 'قبول': 'order_review', 'رفض': 'order_review',
  'اضافة_عملات': 'add_coins', 'إضافة_عملات': 'add_coins', 'add-coins': 'add_coins',
  'اضافة_xp': 'add_xp', 'إضافة_xp': 'add_xp', 'اضافة_خبرة': 'add_xp', 'إضافة_خبرة': 'add_xp', 'add-xp': 'add_xp',
  'reset': 'reset_member', 'ريست': 'reset_member', 'reset-member': 'reset_member',
  'المارد': 'genie',
  'تعيين_قناة': 'set_channel', 'رتبة_مستوى': 'level_role'
});
const SLASH_COMMAND_KEYS = Object.freeze({
  wallet: 'wallet', top: 'top', shop: 'shop', 'color-selection': 'color_selection',
  'admin-panel': 'admin_panel', 'add-coins': 'add_coins', 'add-xp': 'add_xp',
  'reset-member': 'reset_member', 'dm-notifications': 'dm_notifications',
  'dm-announcement': 'dm_announcement', 'dm-announcement-status': 'dm_announcement_status'
});
function commandEnabled(guildId, key) {
  return !key || database.featureEnabled(guildId, `command:${key}`);
}

async function registerSlashCommands() {
  if (!clientId) return;
  const rest = new REST({ version: '10' }).setToken(token);
  const fastGuildId = targetGuildId || (client.guilds.cache.size === 1 ? client.guilds.cache.first().id : '');
  const guildIds = new Set([...client.guilds.cache.keys(), ...(targetGuildId ? [targetGuildId] : [])]);
  const names = slashCommands.map((command) => command.name);
  if (new Set(names).size !== names.length) throw new Error('Duplicate slash command names found in source registry.');

  // Discord keeps global and guild commands in separate scopes. Replacing only
  // one scope leaves stale copies from older deployments visible beside the new
  // list, so clear the unused scope before publishing exactly one active set.
  if (fastGuildId) {
    await rest.put(Routes.applicationCommands(clientId), { body: [] });
    for (const guildId of guildIds) {
      if (guildId !== fastGuildId) await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
    }
    await rest.put(Routes.applicationGuildCommands(clientId, fastGuildId), { body: slashCommands });
  } else {
    for (const guildId of guildIds) await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
    await rest.put(Routes.applicationCommands(clientId), { body: slashCommands });
  }
  console.log(`[SLASH] Replaced stale command scopes and registered ${slashCommands.length} unique commands ${fastGuildId ? 'for guild '+fastGuildId : 'globally'}.`);
}
function helpEmbed() {
  return new EmbedBuilder().setColor(CYAN).setTitle('DOS COMMUNITY • الأوامر').setDescription([
    '/wallet أو .محفظتي أو r — عرض المحفظة',
    '/top أو اكتب TOP — المتصدرون',
    '/shop أو .المتجر — متجر DOS',
    '.المارد — لعبة التخمين التفاعلية (في الروم الذي تحدده الإدارة)',
    '/color-selection — استكمال اختيار اللون برقم الطلب إن تعذّر فتح الرسائل الخاصة',
    '.متصدرين كتابي / صوتي / عملات — ترتيب مختصر',
    '.إحصائيات — إحصائيات السيرفر',
    '.دعواتي — عدد الأعضاء الذين انضموا من رابطك الشخصي',
    '.مهامي — عرض تقدمك في مهام اليوم والأسبوع',
    '.رابط — إرسال رابط دعوة شخصي إلى الخاص',
    '/dm-notifications enabled:true — الاشتراك في إعلانات الخاص، وfalse لإلغاء الاشتراك',
    '/dm-announcement — إرسال إعلان خاص للمشتركين بعد التأكيد',
    'للإدارة: /admin-panel — لوحة التحكم التفاعلية',
    'للإدارة: /add-coins و /add-xp و /reset-member (مع تأكيد لإعادة الضبط)',
    'للإدارة: .اضافة_عملات @عضو 500 أو .اضافة_xp @عضو 500 كتابة',
    'للإدارة: .تعيين_قناة متجر #قناة أو .تعيين_قناة لفل #قناة',
    'للإدارة: .رتبة_مستوى كتابة 10 @رتبة أو .رتبة_مستوى صوت 10 @رتبة'
  ].join('\n')).setFooter({ text: '7 XP لكل رسالة • 9 XP لكل دقيقة صوت • 250 XP = 1 DOS Coin (قابلة للتعديل من الإدارة)' })
    .setImage('attachment://dos-commands.png');
}
async function helpPayload() {
  const image = renderAdminSection({ title: 'DOS COMMANDS', subtitle: 'Current bot commands', emblem: 'DOS' });
  return { embeds: [helpEmbed()], files: [new AttachmentBuilder(image, { name: 'dos-commands.png' })] };
}
async function walletPayload(guild, user) {
  const guildId = guild.id;
  const profile = database.ensureMember(guildId, user.id);
  const invites = database.inviteCount(guildId, user.id);
  const guildMember = guild.members.cache.get(user.id)
    || await guild.members.fetch(user.id).catch(() => null);
  const image = await createWalletImage(profile, user, guildId, guild, {
    text: database.memberRank(guildId, user.id, 'text'),
    voice: database.memberRank(guildId, user.id, 'voice'),
    invites,
    displayName: guildMember ? guildMember.displayName : (user.globalName || user.username)
  });
  return { files: [image] };
}
async function topPayload(guild, kind, period) {
  const rows = database.leaderboard(guild.id, kind, period);
  const entries = await Promise.all(rows.slice(0, 10).map(async (row) => {
    let member = guild.members.cache.get(row.user_id);
    if (!member) member = await guild.members.fetch(row.user_id).catch(() => null);
    let user = member?.user || null;
    if (!user && guild.client?.users?.fetch) user = await guild.client.users.fetch(row.user_id).catch(() => null);
    return {
      name: member ? member.displayName : (user?.globalName || user?.username || `Member ${String(row.user_id).slice(-4)}`),
      fallbackName: user?.globalName || user?.username || `Member ${String(row.user_id).slice(-4)}`,
      score: Number(row.score || 0),
      avatarURL: member ? member.displayAvatarURL({ extension: 'png', size: 128 }) : (user ? user.displayAvatarURL({ extension: 'png', size: 128 }) : null)
    };
  }));
  const image = await renderTopLeaderboard({ guild, entries, period, metric: kind });
  return { files: [new AttachmentBuilder(image, { name: 'dos-top.png' })] };
}
async function assignLevelRole(member, kind, level) {
  if (!member || !member.guild || !Number.isSafeInteger(Number(level)) || Number(level) < 1) return false;
  const guild = member.guild;
  const otherKind = kind === 'text' ? 'voice' : 'text';
  const transition = getLevelRoleTransition(
    database.roles(guild.id, kind),
    Number(level),
    database.roles(guild.id, otherKind)
  );
  if (!transition.selected) return false;

  const role = guild.roles.cache.get(transition.selected.role_id)
    || await guild.roles.fetch(transition.selected.role_id).catch(() => null);
  const topRole = guild.members.me && guild.members.me.roles.highest;
  if (!role || !topRole || role.position >= topRole.position) {
    console.warn('[LEVEL ROLE] The reached-level role is missing or above the bot role.');
    return false;
  }

  // Grant the new level role first. If Discord rejects it, keep the old role.
  if (!member.roles.cache.has(role.id)) {
    try {
      await member.roles.add(role, `Reached ${kind} level ${level}`);
    } catch (error) {
      console.error('[LEVEL ROLE] Could not add the new role:', error.message);
      return false;
    }
  }

  // Remove all earlier roles from this same progression, including any
  // stacked legacy rewards, but preserve roles configured for the other track.
  for (const previousRoleId of transition.previousRoleIds) {
    if (!member.roles.cache.has(previousRoleId)) continue;
    const previousRole = guild.roles.cache.get(previousRoleId)
      || await guild.roles.fetch(previousRoleId).catch(() => null);
    if (!previousRole || previousRole.position >= topRole.position) continue;
    try {
      await member.roles.remove(previousRole, `Replaced by ${kind} level ${level}`);
    } catch (error) {
      console.error(`[LEVEL ROLE] Could not remove previous role ${previousRoleId}:`, error.message);
    }
  }
  return true;
}
async function sendLevelUpNotice(channel, user, level) {
  if (!channel || !channel.isTextBased() || typeof channel.send !== 'function') return;
  const image = await renderLevelUpBanner({ level });
  await channel.send({
    content: `🎉 مبروك ${user ? `<@${user.id}>` : ''}! وصلت إلى المستوى **${level}** في DOS COMMUNITY.`,
    files: [new AttachmentBuilder(image, { name: 'dos-level-up.png' })]
  }).catch((error) => console.warn('[LEVEL-UP] Could not send notice:', error.message));
}
async function sendConfiguredLevelUpNotice(guild, fallbackChannel, user, level) {
  if (!guild) return;
  const settings = database.settings(guild.id);
  let channel = settings.level_up_channel_id
    ? await guild.channels.fetch(settings.level_up_channel_id).catch(() => null)
    : null;
  if (!channel || !channel.isTextBased() || typeof channel.send !== 'function') channel = fallbackChannel;
  if (!channel || !channel.isTextBased() || typeof channel.send !== 'function') channel = guild.systemChannel;
  if (channel) await sendLevelUpNotice(channel, user, level);
}
function memberResetConfirmationPayload(member, actorId) {
  return {
    content: `⚠️ هل أنت متأكد من إعادة ضبط بيانات ${member}؟\nسيتم تصفير DOS Coin وXP الكتابي والصوتي وإجمالي XP والرسائل ووقت الصوت وسجل TOP الدوري. لن يتم حذف سجل العضو من قاعدة البيانات.`,
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`admin:member-reset:confirm:${member.id}:${actorId}`).setLabel('تأكيد إعادة الضبط').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`admin:member-reset:cancel:${member.id}:${actorId}`).setLabel('إلغاء').setStyle(ButtonStyle.Secondary)
    )]
  };
}
function validAdminAmount(value) {
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount >= 1 && amount <= 1000000000 ? amount : null;
}
async function awardAdminXp(guild, channel, user, kind, amount, actorId) {
  const result = database.addXp(guild.id, user.id, kind, amount, {
    awardXp: true, awardCoins: true,
    xpPerCoin: Number(database.getConfig(guild.id, 'xp_per_coin', '250'))
  });
  database.logAdmin(guild.id, actorId, 'member_add_xp', `target=${user.id};kind=${kind};amount=${amount};coins=${result.coinsEarned}`);
  const taskCompletions = database.incrementTaskProgress(guild.id, user.id, 'xp', amount);
  await applyTaskCompletions(guild, channel, taskCompletions);
  if (result.newTextLevel > result.oldTextLevel || result.newVoiceLevel > result.oldVoiceLevel) {
    const member = await guild.members.fetch(user.id).catch(() => null);
    if (kind === 'text' && member) await assignLevelRole(member, 'text', result.newTextLevel);
    if (kind === 'voice' && member) await assignLevelRole(member, 'voice', result.newVoiceLevel);
    const level = kind === 'text' ? result.newTextLevel : result.newVoiceLevel;
    await sendConfiguredLevelUpNotice(guild, channel, user, level);
  }
  return result;
}

async function applyTaskCompletions(guild, fallbackChannel, completions) {
  for (const result of completions || []) {
    try {
      grantTaskReward(guild.id, result.userId, result.rewardType, result.rewardAmount);
      const configuredChannel = database.getConfig(guild.id, 'tasks_announce_channel_id', '');
      const channel = configuredChannel ? await guild.channels.fetch(configuredChannel).catch(() => null) : fallbackChannel || guild.systemChannel;
      await publishTaskRewardMessage(channel, result.userId, result.task, result.rewardAmount, result.rewardType, guild.id);
    } catch (error) {
      console.error('[TASKS] Reward delivery failed:', error);
    }
  }
}

async function awardVoice(guildId,userId) {
  const session = database.voice(guildId,userId);
  if (!session) return;
  const elapsedMinutes = Math.floor((Date.now()-session.started_at)/60000);
  if (elapsedMinutes < 1) return;
  const voiceRate = Number(database.getConfig(guildId,'voice_xp','9'));
  const guild = client.guilds.cache.get(guildId);
  let member = guild && guild.members.cache.get(userId);
  if (!member && guild) member = await guild.members.fetch(userId).catch(() => null);
  const multiplier = getBoosterMultiplier(member, database.getConfig(guildId, 'booster_role_id', ''), database.getConfig(guildId, 'booster_xp_multiplier', '1.5'));
  const amount = applyXpMultiplier(elapsedMinutes * voiceRate, multiplier);
  const result = database.addXp(guildId,userId,'voice',amount,{seconds:elapsedMinutes*60,
    awardXp:database.featureEnabled(guildId,'levels'), awardCoins:database.featureEnabled(guildId,'economy'),
    xpPerCoin:Number(database.getConfig(guildId,'xp_per_coin','250'))});
  if (database.featureEnabled(guildId,'levels')) {
    const completions = database.incrementTaskProgress(guildId,userId,'xp',amount);
    if (guild) await applyTaskCompletions(guild, guild.systemChannel, completions);
  }
  database.updateVoice(guildId,userId,session.started_at+elapsedMinutes*60000);
  if (database.featureEnabled(guildId,'levels') && result.newVoiceLevel > result.oldVoiceLevel) {
    await assignLevelRole(member,'voice',result.newVoiceLevel);
    if (member && guild) await sendConfiguredLevelUpNotice(guild, guild.systemChannel, member.user, result.newVoiceLevel);
  }
}
async function handleCommand(message, rawCommandText = null) {
  const commandSource = rawCommandText === null ? message.content.slice(prefix.length) : rawCommandText;
  const args = commandSource.trim().split(/\s+/).filter(Boolean);
  const command = (args.shift() || '').toLowerCase();
  const guildId = message.guild.id;
  const userId = message.author.id;
  try {
    const commandKey = PREFIX_COMMAND_KEYS[command];
    if (commandKey && !commandEnabled(guildId, commandKey)) return message.reply('هذا الأمر متوقف حالياً من لوحة التحكم.');
    if (['مساعدة','اوامر','أوامر'].includes(command)) return message.reply(await helpPayload());
    if (command === 'محفظتي') {
      if (!database.featureEnabled(guildId,'economy')) return message.reply('المحفظة متوقفة مؤقتاً.');
      const user = message.mentions.users.first() || message.author;
      return message.reply(await walletPayload(message.guild,user));
    }
    if (command === 'مهامي') {
      return message.reply(memberTasksPayload(guildId, userId));
    }
    if (command === 'المارد') {
      if (!commandEnabled(guildId, 'genie')) return message.reply('أمر لعبة المارد متوقف حالياً من لوحة التحكم.');
      return startGenieGame(message, database);
    }
    if (command === 'دعواتي') {
      const count = database.inviteCount(guildId, userId);
      return message.reply({ embeds: [new EmbedBuilder().setColor(CYAN).setTitle('دعواتك • DOS COMMUNITY')
        .setDescription(`تم تسجيل **${count.toLocaleString('en-US')}** عضو انضموا من روابط الدعوة التي تتبعها.`)
        .setFooter({ text: 'يبدأ احتساب الدعوات بعد تشغيل التتبع ومنح البوت صلاحية إدارة السيرفر.' })] });
    }
    if (command === 'رابط') {
      const botMember = message.guild.members.me;
      if (!botMember || !message.channel.permissionsFor(botMember)?.has(PermissionFlagsBits.CreateInstantInvite)) return message.reply('البوت يحتاج صلاحية إنشاء دعوة في هذه القناة.');
      const invite = await message.channel.createInvite({ maxAge: 0, maxUses: 0, unique: true, reason: `Personal invite for ${message.author.tag}` });
      try {
        await message.author.send(`رابط دعوتك الشخصي لسيرفر DOS COMMUNITY:\n${invite.url}`);
        return message.reply('تم إرسال رابط دعوتك الشخصي برسالة خاصة.');
      } catch (error) {
        return message.reply(`تعذّر إرسال الخاص. هذا رابط دعوتك الشخصي: ${invite.url}`);
      }
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
      return message.reply(await shopPayload(message.guild,0));
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
    if (['اضافة_عملات','إضافة_عملات','add-coins'].includes(command)) {
      if (!isAdmin(message.member,userId)) return message.reply('هذا الأمر للإدارة فقط.');
      const target = message.mentions.users.first();
      const amount = validAdminAmount(args.find((value) => /^\d+$/.test(value)));
      if (!target || !amount) return message.reply('استخدم: .اضافة_عملات @عضو 500');
      const profile = database.addCoins(guildId,target.id,amount);
      database.logAdmin(guildId,userId,'member_add_coins',`target=${target.id};amount=${amount}`);
      return message.reply(`✅ تمت إضافة **${amount.toLocaleString('en-US')} DOS Coin** إلى محفظة <@${target.id}>. الرصيد الآن: **${Number(profile.coins).toLocaleString('en-US')}**.`);
    }
    if (['اضافة_xp','إضافة_xp','اضافة_خبرة','إضافة_خبرة','add-xp'].includes(command)) {
      if (!isAdmin(message.member,userId)) return message.reply('هذا الأمر للإدارة فقط.');
      const target = message.mentions.users.first();
      const amount = validAdminAmount(args.find((value) => /^\d+$/.test(value)));
      const kind = args.includes('صوت') || args.includes('صوتي') ? 'voice' : 'text';
      if (!target || !amount) return message.reply('استخدم: .اضافة_xp @عضو 500 كتابة أو .اضافة_xp @عضو 500 صوت');
      const result = await awardAdminXp(message.guild,message.channel,target,kind,amount,userId);
      return message.reply(`✅ تمت إضافة **${amount.toLocaleString('en-US')} XP** إلى <@${target.id}> (${kind === 'text' ? 'كتابي' : 'صوتي'}). مكافأة التحويل: **${result.coinsEarned} DOS Coin**.`);
    }
    if (['reset','ريست','reset-member'].includes(command)) {
      if (!isAdmin(message.member,userId)) return message.reply('هذا الأمر للإدارة فقط.');
      const target = message.mentions.users.first();
      if (!target || target.bot) return message.reply('استخدم: .reset @عضو');
      return message.reply(memberResetConfirmationPayload(target,userId));
    }
    if (command === 'تعيين_قناة') {
      if (!isAdmin(message.member,userId)) return message.reply('هذا الأمر للإدارة فقط.');
      const channel = message.mentions.channels.first();
      if (!channel) return message.reply('اذكر القناة المطلوبة.');
      const key = args[0] === 'متجر' ? 'shop_channel_id' : ['لفل','مستويات','اشعارات'].includes(args[0]) ? 'level_up_channel_id' : null;
      if (!key) return message.reply('استخدم: .تعيين_قناة متجر #قناة أو .تعيين_قناة لفل #قناة.');
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
  const commandKey = SLASH_COMMAND_KEYS[interaction.commandName];
  if (commandKey && !commandEnabled(guildId, commandKey)) {
    return interaction.reply({ content: 'هذا الأمر متوقف حالياً من لوحة التحكم.', flags: MessageFlags.Ephemeral });
  }
  if (interaction.commandName === 'dm-notifications') {
    const enabled = interaction.options.getBoolean('enabled', true);
    database.setDmAnnouncementSubscription(guildId, interaction.user.id, enabled);
    return interaction.reply({
      content: enabled
        ? '✅ اشتركت في إعلانات DOS الخاصة. يمكنك إلغاء الاشتراك في أي وقت باستخدام `/dm-notifications enabled:false`.'
        : 'تم إلغاء اشتراكك في إعلانات الخاص ولن تصلك الحملات القادمة.',
      flags: MessageFlags.Ephemeral
    });
  }
  if (interaction.commandName === 'dm-announcement') {
    if (!isAdmin(interaction.member, interaction.user.id, interaction.memberPermissions, guildId)) {
      return interaction.reply({ content: 'هذا الأمر للإدارة فقط.', flags: MessageFlags.Ephemeral });
    }
    const message = interaction.options.getString('message', true).trim();
    if (!message) return interaction.reply({ content: 'اكتب نص الإعلان أولاً.', flags: MessageFlags.Ephemeral });
    const subscribers = database.dmAnnouncementSubscriberCount(guildId);
    if (!subscribers) return interaction.reply({ content: 'لا يوجد أعضاء مشتركين في إعلانات الخاص حالياً. اطلب من الأعضاء الاشتراك باستخدام `/dm-notifications enabled:true`.', flags: MessageFlags.Ephemeral });
    const preview = new EmbedBuilder().setColor(CYAN).setTitle('📨 معاينة إعلان DOS الخاص')
      .setDescription(message.slice(0, 4000))
      .addFields({ name: 'المستلمون', value: `${subscribers.toLocaleString('en-US')} عضو مشترك فقط`, inline: true }, { name: 'طريقة الإرسال', value: 'إرسال تدريجي مع فاصل لتجنّب تجاوز حدود Discord', inline: true })
      .setFooter({ text: 'لن تصل الرسالة لمن لم يشترك، أو لمن أغلق الرسائل الخاصة من البوت.' });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`broadcast:confirm:${interaction.user.id}`).setLabel('تأكيد الإرسال').setEmoji('📨').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`broadcast:cancel:${interaction.user.id}`).setLabel('إلغاء').setStyle(ButtonStyle.Secondary)
    );
    return interaction.reply({ embeds: [preview], components: [row], flags: MessageFlags.Ephemeral });
  }
  if (interaction.commandName === 'dm-announcement-status') {
    if (!isAdmin(interaction.member, interaction.user.id, interaction.memberPermissions, guildId)) return interaction.reply({ content: 'هذا الأمر للإدارة فقط.', flags: MessageFlags.Ephemeral });
    const latest = database.latestDmBroadcastJob(guildId);
    return interaction.reply({ content: `${broadcastStatusText(latest)}\n\n**المشتركون الحاليون:** ${database.dmAnnouncementSubscriberCount(guildId).toLocaleString('en-US')}`, flags: MessageFlags.Ephemeral });
  }
  if (interaction.commandName === 'admin-panel') {
    if (!isAdmin(interaction.member,interaction.user.id,interaction.memberPermissions,guildId)) return interaction.reply({ content:'هذه اللوحة للإدارة فقط.',flags:MessageFlags.Ephemeral });
    const dashboardChannelId = database.getConfig(guildId, 'admin_panel_channel_id', '');
    if (dashboardChannelId && interaction.channelId !== dashboardChannelId) {
      return interaction.reply({ content: `افتح لوحة التحكم من الروم المحدد: <#${dashboardChannelId}>.`, flags: MessageFlags.Ephemeral });
    }
    // Public dashboard: everyone in the configured room can view it; all controls
    // are still checked by isAdmin() before any action is performed.
    return interaction.reply(await homePayload(interaction.guild));
  }
  if (['add-coins','add-xp','reset-member'].includes(interaction.commandName)) {
    if (!isAdmin(interaction.member,interaction.user.id,interaction.memberPermissions,guildId)) {
      return interaction.reply({ content: 'هذه الأوامر للإدارة فقط.', flags: MessageFlags.Ephemeral });
    }
    const target = interaction.options.getUser('member',true);
    if (target.bot) return interaction.reply({ content: 'لا يمكن تعديل بيانات حساب بوت.', flags: MessageFlags.Ephemeral });
    if (interaction.commandName === 'add-coins') {
      const amount = validAdminAmount(interaction.options.getInteger('amount',true));
      if (!amount) return interaction.reply({ content: 'عدد العملات غير صالح.', flags: MessageFlags.Ephemeral });
      const profile = database.addCoins(guildId,target.id,amount);
      database.logAdmin(guildId,interaction.user.id,'member_add_coins',`target=${target.id};amount=${amount}`);
      return interaction.reply({ content: `✅ تمت إضافة **${amount.toLocaleString('en-US')} DOS Coin** إلى ${target}. الرصيد الآن: **${Number(profile.coins).toLocaleString('en-US')}**.`, flags: MessageFlags.Ephemeral });
    }
    if (interaction.commandName === 'add-xp') {
      const amount = validAdminAmount(interaction.options.getInteger('amount',true));
      if (!amount) return interaction.reply({ content: 'كمية XP غير صالحة.', flags: MessageFlags.Ephemeral });
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const kind = interaction.options.getString('type',true);
      const result = await awardAdminXp(interaction.guild,interaction.channel,target,kind,amount,interaction.user.id);
      return interaction.editReply({ content: `✅ تمت إضافة **${amount.toLocaleString('en-US')} XP** إلى ${target} (${kind === 'text' ? 'كتابي' : 'صوتي'}). مكافأة التحويل: **${result.coinsEarned} DOS Coin**.` });
    }
    return interaction.reply({ ...memberResetConfirmationPayload(target,interaction.user.id), flags: MessageFlags.Ephemeral });
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
    return interaction.reply(await shopPayload(interaction.guild,0));
  }
  if (interaction.commandName === 'color-selection') {
    const orderId = interaction.options.getInteger('order_id');
    const purchase = database.getProductPurchase(guildId,orderId);
    if (!purchase || purchase.user_id !== interaction.user.id || purchase.status !== 'awaiting_selection') return interaction.reply({content:'لا يوجد طلب لون معلّق بهذا الرقم لحسابك.',flags:MessageFlags.Ephemeral});
    return interaction.reply({ ...colorPickerPayload(guildId,orderId,0),flags:MessageFlags.Ephemeral });
  }
}

async function refreshInviteSnapshots(guild) {
  try {
    const current = await guild.invites.fetch();
    database.saveInviteSnapshots(guild.id, [...current.values()].map((invite) => ({
      code: invite.code, inviterId: invite.inviter && invite.inviter.id,
      uses: invite.uses, maxUses: invite.maxUses, expiresTimestamp: invite.expiresTimestamp
    })));
    return true;
  } catch (error) {
    console.warn(`[INVITES] Cannot read invites for ${guild.name}; grant Manage Server to enable tracking: ${error.message}`);
    return false;
  }
}
async function trackInviteJoin(member) {
  if (!member || member.user.bot) return;
  const guild = member.guild;
  try {
    const previous = new Map(database.inviteSnapshots(guild.id).map((row) => [row.code, row]));
    const current = await guild.invites.fetch();
    const used = [...current.values()].map((invite) => ({
      invite,
      previousUses: Number(previous.get(invite.code)?.uses || 0),
      currentUses: Number(invite.uses || 0)
    })).filter((item) => item.currentUses > item.previousUses)
      .sort((a, b) => (b.currentUses - b.previousUses) - (a.currentUses - a.previousUses))[0];
    const inviterId = used && ((used.invite.inviter && used.invite.inviter.id) || (previous.get(used.invite.code) && previous.get(used.invite.code).inviter_id));
    if (used && inviterId) {
      const recorded = database.recordInviteJoin(guild.id, member.id, inviterId, used.invite.code);
      if (recorded && inviterId !== member.id) {
        const amount = Math.max(0, Math.min(1000000, Math.floor(Number(database.getConfig(guild.id,'invite_reward_amount','0')) || 0)));
        const type = database.getConfig(guild.id,'invite_reward_type','coins');
        if (amount > 0 && ['coins','xp'].includes(type)) {
          if (type === 'xp') {
            database.addXp(guild.id, inviterId, 'text', amount, { awardXp: true, awardCoins: true, xpPerCoin: Number(database.getConfig(guild.id,'xp_per_coin','250')) });
            const taskCompletions = database.incrementTaskProgress(guild.id, inviterId, 'xp', amount);
            await applyTaskCompletions(guild, guild.systemChannel, taskCompletions);
          } else database.addCoins(guild.id, inviterId, amount);
          const inviter = await guild.members.fetch(inviterId).catch(() => null);
          if (inviter && guild.systemChannel) await guild.systemChannel.send({ content: `🎟️ ${inviter} حصل على مكافأة دعوة جديدة: **${amount.toLocaleString('en-US')} ${type === 'xp' ? 'XP' : 'DOS Coin'}**.`, allowedMentions: { users: [inviterId] } }).catch(() => {});
          database.logAdmin(guild.id, inviterId, 'invite_reward_paid', `joined=${member.id};type=${type};amount=${amount}`);
        }
      }
      console.log(`[INVITES] ${member.user.tag} joined via ${used.invite.code} (inviter ${inviterId}).`);
    } else {
      console.log(`[INVITES] Invite source for ${member.user.tag} could not be identified.`);
    }
    database.saveInviteSnapshots(guild.id, [...current.values()].map((invite) => ({
      code: invite.code, inviterId: invite.inviter && invite.inviter.id,
      uses: invite.uses, maxUses: invite.maxUses, expiresTimestamp: invite.expiresTimestamp
    })));
  } catch (error) {
    console.warn(`[INVITES] Could not track new member in ${guild.name}: ${error.message}`);
  }
}

client.once('clientReady',async () => {
  console.log('[DISCORD] Logged in as '+client.user.tag);
  console.log('[DISCORD] Connected to '+client.guilds.cache.size+' server(s)');
  for (const guild of client.guilds.cache.values()) await refreshInviteSnapshots(guild);
  await registerSlashCommands().catch((error) => console.error('[SLASH] Registration failed:',error.message));
  await tickDailyQuestions(client).catch((error) => console.error('[DAILY QUESTION] Initial scheduler failed:', error));
  setInterval(() => tickDailyQuestions(client).catch((error) => console.error('[DAILY QUESTION] Scheduler failed:', error)), 60_000).unref();
  processDmBroadcastTick(client).catch((error) => console.error('[DM BROADCAST] Initial queue tick failed:', error));
  // One opt-in recipient every two seconds. The queue is persisted in SQLite,
  // so it safely resumes after a restart without resending completed recipients.
  setInterval(() => processDmBroadcastTick(client).catch((error) => console.error('[DM BROADCAST] Queue tick failed:', error)), 2_000).unref();
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

client.on('inviteCreate', (invite) => {
  if (!invite.guild) return;
  database.saveInviteSnapshots(invite.guild.id, [{
    code: invite.code, inviterId: invite.inviter && invite.inviter.id,
    uses: invite.uses, maxUses: invite.maxUses, expiresTimestamp: invite.expiresTimestamp
  }]);
});
client.on('inviteDelete', (invite) => {
  if (invite.guild) database.deleteInviteSnapshot(invite.guild.id, invite.code);
});
client.on('guildMemberAdd', (member) => {
  trackInviteJoin(member).catch((error) => console.error('[INVITES] Join tracking failed:', error));
  // Keep the original small -# join line first, then post the new DOS welcome card.
  sendJoinWelcome(member)
    .catch((error) => console.error('[WELCOME] Small join message failed:', error))
    .finally(() => sendMemberWelcomeCard(member).catch((error) => console.error('[WELCOME] Member card failed:', error)));
});

client.on('messageCreate',async (message) => {
  if (!message.guild || message.author.bot) return;
  const trimmed = message.content.trim();
  // Single-letter wallet shortcut, exactly `r` (no dot/prefix required).
  // Handle it before message XP so running the shortcut does not grant XP.
  if (/^r$/i.test(trimmed)) {
    if (!commandEnabled(message.guild.id, 'wallet')) return message.reply('أمر المحفظة متوقف حالياً من لوحة التحكم.');
    if (!database.featureEnabled(message.guild.id, 'economy')) return message.reply('المحفظة متوقفة مؤقتاً.');
    try { return await message.reply(await walletPayload(message.guild, message.author)); }
    catch (error) {
      console.error('[WALLET SHORTCUT] r failed:', error);
      return message.reply('تعذر إنشاء صورة المحفظة حالياً. حاول مرة أخرى بعد قليل.').catch(() => {});
    }
  }
  try { await checkDailyQuestionAnswer(message); }
  catch (error) { console.error('[DAILY QUESTION] Answer check failed:', error); }
  try {
    const messageTaskCompletions = database.setTaskMessageProgress(message.guild.id, message.author.id, message.channel.id);
    await applyTaskCompletions(message.guild, message.channel, messageTaskCompletions);
  } catch (error) { console.error('[TASKS] Message progress failed:', error); }
  if (/^top$/i.test(trimmed)) {
    if (!database.featureEnabled(message.guild.id,'top') || !commandEnabled(message.guild.id,'top')) return;
    return message.reply(await topPayload(message.guild,'all','all'));
  }
  if (trimmed.startsWith(prefix)) return handleCommand(message);
  try {
    const guildId = message.guild.id;
    const baseRate = Number(database.getConfig(guildId,'message_xp','7'));
    const multiplier = getBoosterMultiplier(message.member, database.getConfig(guildId, 'booster_role_id', ''), database.getConfig(guildId, 'booster_xp_multiplier', '1.5'));
    const rate = applyXpMultiplier(baseRate, multiplier);
    const awardXp = database.featureEnabled(guildId,'levels');
    const awardCoins = database.featureEnabled(guildId,'economy');
    const result = database.addXp(guildId,message.author.id,'text',rate,{message:true,awardXp,awardCoins,xpPerCoin:Number(database.getConfig(guildId,'xp_per_coin','250'))});
    if (awardXp) {
      const completions = database.incrementTaskProgress(guildId,message.author.id,'xp',rate);
      await applyTaskCompletions(message.guild,message.channel,completions);
    }
    if (awardXp && result.newTextLevel > result.oldTextLevel) {
      await assignLevelRole(message.member,'text',result.newTextLevel);
      await sendConfiguredLevelUpNotice(message.guild, message.channel, message.author, result.newTextLevel);
    }
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
      const adminHandled = await handleAdminModal(interaction);
      if (adminHandled !== false) return adminHandled;
      const taskHandled = await handleTaskModal(interaction);
      if (taskHandled !== false) return taskHandled;
      const shopHandled = await handleShopModal(interaction, client);
      if (shopHandled !== false) return shopHandled;
    }
    if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isChannelSelectMenu() || interaction.isRoleSelectMenu()) {
      if (interaction.isButton() && interaction.customId.startsWith('broadcast:')) {
        const [, action, actorId] = interaction.customId.split(':');
        if (interaction.user.id !== actorId) return interaction.reply({ content: 'هذا التأكيد مخصص للمسؤول الذي أنشأ الإعلان.', flags: MessageFlags.Ephemeral });
        if (action === 'cancel') return interaction.update({ content: 'تم إلغاء الإعلان. لم تُرسل أي رسالة.', embeds: [], components: [] });
        if (action === 'confirm') {
          if (!isAdmin(interaction.member, interaction.user.id, interaction.memberPermissions, interaction.guildId)) {
            return interaction.reply({ content: 'هذه العملية للإدارة فقط.', flags: MessageFlags.Ephemeral });
          }
          await interaction.deferUpdate();
          const messageText = interaction.message.embeds?.[0]?.description || '';
          if (!messageText.trim()) return interaction.editReply({ content: 'تعذر استرجاع نص الإعلان. أعد إنشاءه من الأمر.', embeds: [], components: [] });
          const subscribers = database.dmAnnouncementSubscribers(interaction.guildId);
          const created = database.createDmBroadcastJob(interaction.guildId, interaction.user.id, messageText, subscribers);
          if (created.error === 'active') return interaction.editReply({ content: `يوجد إعلان قيد الإرسال بالفعل (#${created.id}). استخدم /dm-announcement-status لمتابعته.`, embeds: [], components: [] });
          if (created.error) return interaction.editReply({ content: 'لا يوجد أعضاء مشتركين حالياً. لم يتم إرسال شيء.', embeds: [], components: [] });
          database.logAdmin(interaction.guildId, interaction.user.id, 'dm_broadcast_started', `job=${created.id};recipients=${created.total}`);
          await processDmBroadcastTick(client).catch(() => {});
          return interaction.editReply({ content: `✅ تم إنشاء الإعلان #${created.id} وبدأ الإرسال التدريجي إلى **${created.total.toLocaleString('en-US')}** عضو مشترك. تابع التقدم باستخدام /dm-announcement-status.`, embeds: [], components: [] });
        }
      }
      if (interaction.customId.startsWith('genie:')) {
        const handled = await handleGenieInteraction(interaction, database);
        if (handled !== false) return handled;
      }
      if (interaction.customId.startsWith('tasks:')) {
        const taskHandled = await handleTaskInteraction(interaction);
        if (taskHandled !== false) return taskHandled;
      }
      if (interaction.isButton() && interaction.customId === 'joinwelcome:wave') {
        await interaction.deferUpdate();
        try {
          const configuredEmoji = parseButtonEmoji(getJoinWelcomeConfig(interaction.guildId).emoji);
          await interaction.message.react(configuredEmoji.id || configuredEmoji.name);
          await interaction.followUp({ content: `${configuredEmoji.name || '👋'} تمت التحية!`, flags: MessageFlags.Ephemeral });
        } catch (error) {
          console.warn('[WELCOME] Could not add wave reaction:', error.message);
          await interaction.followUp({ content: 'تعذرت إضافة التفاعل. تأكد من صلاحية إضافة التفاعلات للبوت.', flags: MessageFlags.Ephemeral }).catch(() => {});
        }
        return;
      }
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
