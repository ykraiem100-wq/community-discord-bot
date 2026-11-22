'use strict';
const {
  EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, MessageFlags
} = require('discord.js');
const database = require('./database');
const { renderPanelPage, renderMainPanel, renderLevelSystemPage } = require('./render');

const CYAN = 0x36D9FF;
const DEFAULT_CONTENT = {
  rules: {
    title: '📜 قوانين DOS COMMUNITY',
    body: 'أهلاً بك في DOS COMMUNITY!\n\n1. احترم جميع الأعضاء والإدارة.\n2. يمنع السب والشتم أو التحرش.\n3. يمنع الإزعاج والتكرار والروابط الضارة.\n4. يمنع الإعلان دون إذن الإدارة.\n5. استخدم كل قناة للغرض المخصص لها.\n6. التزم بتعليمات الإدارة وقراراتها.\n\nمخالفة القوانين قد تؤدي إلى تحذير أو تقييد أو حظر.'
  },
  info: {
    title: 'ℹ️ معلومات DOS COMMUNITY',
    body: 'مرحباً بك في مجتمع DOS!\n\nهذا القسم يعرّفك بأقسام السيرفر وطريقة المشاركة.\nاستكشف القنوات، تعرّف على الأعضاء، وشارك في النقاشات والأنشطة.\n\nللمساعدة، تواصل مع فريق الإدارة.'
  },
  notifications: {
    title: '🔔 رتب التفاعل والإشعارات',
    body: 'اختر رتب الإشعارات التي تهمك. يمكنك اختيار أكثر من رتبة، وتعديل اختياراتك في أي وقت.'
  },
  system: {
    title: '⚙️ نظام السيرفر',
    body: 'أنظمة DOS COMMUNITY:\n• DOS Coin: العملات والمحفظة.\n• XP والمستويات: تتطور مع تفاعلك الكتابي والصوتي.\n• DOS SHOP: منتجات ومزايا تُشترى بعملات DOS أو بالدفع الخارجي.\n• TOP: ترتيب المتصدرين.\n\nاستخدم /wallet و /top و /shop لعرض الأنظمة.'
  },
  events: {
    title: '🎮 Arena • الفعاليات',
    body: 'تابع فعاليات DOS COMMUNITY وشارك في المسابقات والتحديات والأنشطة الجماعية.\n\nArena & Events'
  },
  social: {
    title: '🌐 Social Media • منصات التواصل',
    body: 'تابع حسابات DOS COMMUNITY الرسمية. تضيف الإدارة روابط المنصات هنا من لوحة التحكم.'
  },
  apply: {
    title: '📝 Apply • التقديم',
    body: 'للتقديم على الطاقم أو الانضمام إلى برامج السيرفر، اقرأ الشروط ثم تواصل مع الإدارة. يمكن تعديل خطوات التقديم من لوحة التحكم.'
  },
  news: {
    title: '✨ New • آخر التحديثات',
    body: 'تابع آخر التحديثات والإضافات والأنظمة الجديدة في DOS COMMUNITY. تضيف الإدارة الأخبار من لوحة التحكم.'
  },
  main: {
    title: 'شكراً لانضمامك إلى DOS COMMUNITY الرسمي',
    body: 'شكراً لانضمامك في خادم DOS COMMUNITY الرسمي.\nيمكنك مشاهدة جميع القوانين والأنظمة، ولا تنسَ اختيار رتب الإشعارات عن طريق الأزرار الموجودة بالأسفل. وفي حال تريد فهم السيرفر بشكل أفضل اضغط على زر قراءة المعلومات.\n\nWelcome to the official DOS COMMUNITY server. Here you can read every rule and system we run, and you can also pick up any of the notification roles using the buttons below. If you want to understand the server better, press the Read Information button.'
  }
};

function content(guildId, key) {
  const saved = database.getContent(guildId, key);
  return saved || DEFAULT_CONTENT[key] || { title: 'DOS COMMUNITY', body: 'لا يوجد محتوى بعد.' };
}
function makeContentEmbed(guildId, key) {
  const item = content(guildId, key);
  return new EmbedBuilder().setColor(CYAN).setTitle(item.title).setDescription(item.body).setFooter({ text: 'DOS COMMUNITY • Silver × Cyan' });
}
async function buildMainPanel(guild, guildId) {
  const main = content(guildId, 'main');
  const owner = guild && guild.fetchOwner ? await guild.fetchOwner().catch(() => null) : null;
  const signature = owner ? `تحيات إدارة ${owner.displayName || owner.user.username}` : `تحيات إدارة ${guild.name}`;
  const image = await renderMainPanel({ guild, title: main.title, body: main.body, signature });
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('public:rules').setLabel('Server Rules').setEmoji('📕').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('public:info').setLabel('Read Information').setEmoji('📖').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('public:roles').setLabel('Roles').setEmoji('🎭').setStyle(ButtonStyle.Secondary)
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('public:social').setLabel('Social Media').setEmoji('🌐').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('public:apply').setLabel('Apply').setEmoji('📝').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('public:news').setLabel('New').setEmoji('✨').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('public:arena').setLabel('Arena').setEmoji('🎮').setStyle(ButtonStyle.Secondary)
  );
  const panelEmbed = new EmbedBuilder()
    .setColor(CYAN)
    .setTitle(main.title || `مرحباً بك في ${guild.name}`)
    .setDescription(String(main.body || '').slice(0, 4096))
    .setImage('attachment://dos-main-panel.png')
    .setFooter({ text: signature || `تحيات إدارة ${guild.name}` });
  return { embeds: [panelEmbed], files: [new AttachmentBuilder(image, { name: 'dos-main-panel.png' })], attachments: [], components: [row1, row2] };
}

async function publishMainPanel(guild, channel) {
  if (!channel || !channel.isTextBased() || !channel.send) throw new Error('اختر قناة كتابية صالحة.');
  const settings = database.settings(guild.id);
  let message = null;
  if (settings.panel_channel_id && settings.panel_message_id) {
    const oldChannel = await guild.channels.fetch(settings.panel_channel_id).catch(() => null);
    if (oldChannel && oldChannel.isTextBased()) message = await oldChannel.messages.fetch(settings.panel_message_id).catch(() => null);
  }
  const payload = await buildMainPanel(guild, guild.id);
  if (message) {
    await message.edit(payload);
    if (channel.id !== message.channelId) {
      const created = await channel.send(payload);
      database.savePanel(guild.id, channel.id, created.id);
      return created;
    }
    database.savePanel(guild.id, channel.id, message.id);
    return message;
  }
  const created = await channel.send(payload);
  database.savePanel(guild.id, channel.id, created.id);
  return created;
}

async function handlePublicPanelInteraction(interaction) {
  const [scope, action] = interaction.customId.split(':');
  if (!database.featureEnabled(interaction.guildId,'main_panel')) return interaction.reply({ content: 'اللوحة الرئيسية متوقفة حالياً.', flags: MessageFlags.Ephemeral });
  if (scope === 'public' && ['rules', 'info', 'system', 'events', 'arena', 'social', 'apply', 'news'].includes(action)) {
      if ((action === 'events' || action === 'arena') && !database.featureEnabled(interaction.guildId, 'events')) {
      return interaction.reply({ content: 'قسم الفعاليات متوقف حالياً.', flags: MessageFlags.Ephemeral });
    }
    const contentKey = action === 'arena' ? 'events' : action;
    const item = content(interaction.guildId, contentKey);
    const image = action === 'system'
      ? await renderLevelSystemPage({
          messageXp: database.getConfig(interaction.guildId, 'message_xp', '7'),
          voiceXp: database.getConfig(interaction.guildId, 'voice_xp', '9'),
          xpPerCoin: database.getConfig(interaction.guildId, 'xp_per_coin', '250')
        })
      : await renderPanelPage({ guild: interaction.guild, title: item.title, body: item.body, subtitle: 'DOS COMMUNITY • ' + action.toUpperCase() });
    const systemCurve = action === 'system' ? database.curveForGuild(interaction.guildId) : null;
    const systemRates = action === 'system'
      ? `\n\n**معدلات الخبرة الحالية:** ${database.getConfig(interaction.guildId, 'message_xp', '7')} XP لكل رسالة، و${database.getConfig(interaction.guildId, 'voice_xp', '9')} XP لكل دقيقة صوت. كل ${database.getConfig(interaction.guildId, 'xp_per_coin', '250')} XP تساوي 1 DOS Coin.`
      : '';
    const systemDetails = systemCurve
      ? `\n\n**متطلبات المستويات:** ${systemCurve.firstLevels.join('، ')} XP لأول 6 مستويات. يبدأ المستوى 7 بـ ${systemCurve.level7Base} XP، ثم تزداد المتطلبات تدريجياً بمقدار ${systemCurve.level7Increment} XP أساسياً مع زيادة إضافية قدرها ${systemCurve.growthStep} XP في كل مستوى. يستمر التصاعد بعد المستوى 100.`
      : '';
    const imageName = 'dos-' + action + '.png';
    const contentEmbed = new EmbedBuilder().setColor(CYAN).setTitle(item.title).setDescription((String(item.body || '') + systemRates + systemDetails).slice(0, 4096)).setImage('attachment://' + imageName);
    return interaction.reply({
      embeds: [contentEmbed],
      files: [new AttachmentBuilder(image, { name: imageName })],
      flags: MessageFlags.Ephemeral
    });
  }
  if (scope === 'public' && (action === 'notifications' || action === 'roles')) {
    if (!database.featureEnabled(interaction.guildId, 'interaction_roles')) {
      return interaction.reply({ content: 'اختيار رتب التفاعل متوقف حالياً.', flags: MessageFlags.Ephemeral });
    }
    const roles = database.interactionRoles(interaction.guildId).filter((row) => interaction.guild.roles.cache.has(row.role_id)).slice(0, 25);
    if (!roles.length) return interaction.reply({ content: 'لم تضف الإدارة رتب إشعارات بعد.', flags: MessageFlags.Ephemeral });
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const current = member.roles.cache;
    const menu = new StringSelectMenuBuilder().setCustomId('notify:select').setPlaceholder('اختر رتب الإشعارات').setMinValues(0).setMaxValues(roles.length)
      .addOptions(roles.map((row) => ({ label: row.role_name.slice(0, 100), value: row.role_id, default: current.has(row.role_id) })));
    const item = content(interaction.guildId, 'notifications');
    const image = await renderPanelPage({ guild: interaction.guild, title: item.title, body: item.body, subtitle: 'DOS COMMUNITY • NOTIFICATIONS' });
    const contentEmbed = new EmbedBuilder().setColor(CYAN).setTitle(item.title).setDescription(String(item.body || '').slice(0, 4096)).setImage('attachment://dos-notifications.png');
    return interaction.reply({ embeds: [contentEmbed], files: [new AttachmentBuilder(image, { name: 'dos-notifications.png' })], components: [new ActionRowBuilder().addComponents(menu)], flags: MessageFlags.Ephemeral });
  }
  if (scope === 'notify' && action === 'select' && interaction.isStringSelectMenu()) {
    const managed = database.interactionRoles(interaction.guildId).map((row) => row.role_id);
    const selected = new Set(interaction.values);
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const remove = managed.filter((id) => !selected.has(id) && member.roles.cache.has(id));
    const add = [...selected].filter((id) => !member.roles.cache.has(id));
    if (remove.length) await member.roles.remove(remove, 'DOS notification role preference').catch(() => {});
    if (add.length) await member.roles.add(add, 'DOS notification role preference');
    return interaction.update({ content: '💙 تم حفظ رتب الإشعارات الخاصة بك.', components: [] });
  }
  return false;
}

module.exports = { CYAN, DEFAULT_CONTENT, content, makeContentEmbed, buildMainPanel, publishMainPanel, handlePublicPanelInteraction };
