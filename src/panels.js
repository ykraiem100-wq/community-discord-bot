'use strict';
const {
  EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, MessageFlags
} = require('discord.js');
const database = require('./database');
const { renderPanelPage } = require('./render');

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
    title: '🎮 الفعاليات',
    body: 'تابع فعاليات DOS COMMUNITY وشارك في المسابقات والتحديات والأنشطة الجماعية.\n\nArena & Events'
  },
  main: {
    title: '👑 DOS COMMUNITY',
    body: 'أهلاً بك في مجتمع DOS! استخدم الأزرار بالأسفل لعرض القوانين والمعلومات والأنظمة.\nWelcome to DOS COMMUNITY.'
  }
};

function content(guildId, key) {
  const saved = database.getContent(guildId, key);
  return saved || DEFAULT_CONTENT[key] || { title: 'DOS COMMUNITY', body: 'لا يوجد محتوى بعد.' };
}
function makeContentEmbed(guildId, key) {
  const item = content(guildId, key);
  return new EmbedBuilder().setColor(CYAN).setTitle(item.title).setDescription(item.body).setFooter({ text: 'DOS COMMUNITY • Silver × Cyan × Gold' });
}
async function buildMainPanel(guild, guildId) {
  const main = content(guildId, 'main');
  const image = await renderPanelPage({
    guild, title: main.title, body: main.body,
    sections: ['قوانين السيرفر', 'معلومات السيرفر', 'رتب التفاعل', 'نظام السيرفر', 'الفعاليات'],
    subtitle: 'DOS COMMUNITY • MAIN PANEL'
  });
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('public:rules').setLabel('قوانين السيرفر').setEmoji('📜').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('public:info').setLabel('معلومات السيرفر').setEmoji('ℹ️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('public:notifications').setLabel('رتب التفاعل').setEmoji('🔔').setStyle(ButtonStyle.Primary)
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('public:system').setLabel('نظام السيرفر').setEmoji('⚙️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('public:events').setLabel('الفعاليات').setEmoji('🎮').setStyle(ButtonStyle.Secondary)
  );
  return { files: [new AttachmentBuilder(image, { name: 'dos-main-panel.png' })], attachments: [], components: [row1, row2] };
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
  if (scope === 'public' && ['rules', 'info', 'system', 'events'].includes(action)) {
      if (action === 'events' && !database.featureEnabled(interaction.guildId, 'events')) {
      return interaction.reply({ content: 'قسم الفعاليات متوقف حالياً.', flags: MessageFlags.Ephemeral });
    }
    const item = content(interaction.guildId, action);
    const image = await renderPanelPage({ guild: interaction.guild, title: item.title, body: item.body, subtitle: 'DOS COMMUNITY • ' + action.toUpperCase() });
    return interaction.reply({ files: [new AttachmentBuilder(image, { name: 'dos-' + action + '.png' })], flags: MessageFlags.Ephemeral });
  }
  if (scope === 'public' && action === 'notifications') {
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
    return interaction.reply({ files: [new AttachmentBuilder(image, { name: 'dos-notifications.png' })], components: [new ActionRowBuilder().addComponents(menu)], flags: MessageFlags.Ephemeral });
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
