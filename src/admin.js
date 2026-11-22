'use strict';
const {
  EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  ChannelSelectMenuBuilder, RoleSelectMenuBuilder, ChannelType, PermissionsBitField, MessageFlags
} = require('discord.js');
const database = require('./database');
const { CYAN, DEFAULT_CONTENT, MAIN_PANEL_BUTTONS, selectedMainPanelButtons, makeContentEmbed, publishMainPanel } = require('./panels');
const { deliverProduct, publishShop, refreshPublishedShop } = require('./shop');
const { renderAdminDashboard, renderAdminSection } = require('./render');

const FEATURES = [
  ['economy', 'العملات والمحفظة'], ['levels', 'المستويات وXP'], ['shop', 'المتجر'],
  ['top', 'TOP والمتصدرون'], ['main_panel', 'اللوحة الرئيسية'],
  ['interaction_roles', 'رتب التفاعل'], ['events', 'الفعاليات']
];
const CONTENT_KEYS = [
  ['main', 'اللوحة الرئيسية'], ['rules', 'قوانين السيرفر'], ['info', 'معلومات السيرفر'],
  ['notifications', 'رتب التفاعل'], ['system', 'نظام السيرفر'], ['events', 'الفعاليات'],
  ['social', 'منصات التواصل'], ['apply', 'التقديم'], ['news', 'آخر التحديثات']
];

function isAdmin(member, userId, permissionBits) {
  const owner = (process.env.OWNER_ID || '').trim();
  const perms = permissionBits || (member && member.permissions);
  const administrator = Boolean(perms && typeof perms.has === 'function' && perms.has(PermissionsBitField.Flags.Administrator));
  return Boolean(administrator || (owner && owner === userId));
}
function adminEmbed(title, description) {
  return new EmbedBuilder().setColor(CYAN).setTitle(title).setDescription(description).setFooter({ text: 'DOS CONTROL PANEL • الإدارة فقط' });
}
function withSectionImage(payload, title, subtitle, emblem) {
  const image = renderAdminSection({ title, subtitle, emblem });
  const embeds = (payload.embeds || []).map((embed, index) => index === 0 ? embed.setImage('attachment://dos-admin-section.png') : embed);
  return { ...payload, embeds, files: [new AttachmentBuilder(image, { name: 'dos-admin-section.png' })], attachments: [] };
}
function formatUptime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days) return `${days} أيام ${hours} ساعة`;
  if (hours) return `${hours} ساعة ${minutes} دقيقة`;
  return `${minutes} دقيقة`;
}

async function homePayload(guildOrId) {
  const guild = typeof guildOrId === 'string' ? null : guildOrId;
  const guildId = typeof guildOrId === 'string' ? guildOrId : guildOrId.id;
  const menu = new StringSelectMenuBuilder().setCustomId('admin:nav').setPlaceholder('اختر القسم الذي تريد إدارته')
    .addOptions(
      { label: 'إدارة المتجر', value: 'shop', description: 'إضافة المنتجات وتعديلها والطلبات', emoji: '🛍️' },
      { label: 'الغرف الخاصة', value: 'rooms', description: 'متابعة الغرف ومددها وتجديدها وإغلاقها', emoji: '🏠' },
      { label: 'اللوحات والرسائل', value: 'content', description: 'تعديل القوانين والمعلومات والرسائل', emoji: '📝' },
      { label: 'ترحيب الأعضاء الجدد', value: 'join_welcome', description: 'رسالة صغيرة عند دخول عضو جديد وتحديد الروم والإيموجي', emoji: '👋' },
      { label: 'تشغيل وإيقاف الأنظمة', value: 'features', description: 'إيقاف أو تشغيل كل نظام', emoji: '⏯️' },
      { label: 'العملات والمستويات', value: 'economy', description: 'تعديل XP والتحويل ومتطلبات المستويات وقناة الإشعارات', emoji: '📈' },
      { label: 'أوامر إدارة الأعضاء', value: 'member_tools', description: 'إضافة عملات وXP وإعادة ضبط عضو مع تأكيد', emoji: '🛠️' },
      { label: 'رتب التفاعل', value: 'roles', description: 'تحديد رتب الإشعارات', emoji: '🔔' },
      { label: 'رتب المستويات', value: 'level_roles', description: 'ربط رتب بمستويات الكتابة والصوت', emoji: '🏅' },
      { label: 'طلبات المتجر', value: 'sales', description: 'مراجعة طلبات الدفع والتسليم', emoji: '🧾' }
    );
  const stats = database.stats(guildId) || {};
  stats.serverName = guild ? guild.name : 'DOS COMMUNITY';
  stats.serverMembers = guild ? guild.memberCount : stats.members;
  stats.uptimeSeconds = process.uptime();
  stats.pendingOrders = database.pendingProductPurchases(guildId).length;
  stats.productCount = database.products(guildId, true).length;
  const image = await renderAdminDashboard({ guild });
  const statsEmbed = adminEmbed('DOS CONTROL PANEL • لوحة التحكم', 'اختر القسم من القائمة لإدارة الأنظمة والأوامر الموجودة فعلياً.\n\n**أوامر الإدارة:** `/admin-panel` • `/add-coins` • `/add-xp` • `/reset-member`\n**الاختصارات:** `.اضافة_عملات` • `.اضافة_xp` • `.تعيين_قناة` • `.رتبة_مستوى`').setImage('attachment://dos-admin-dashboard.png');
  statsEmbed.addFields(
    { name: 'الأعضاء', value: Number(stats.serverMembers || 0).toLocaleString('en-US'), inline: true },
    { name: 'إجمالي DOS Coin', value: Number(stats.coins || 0).toLocaleString('en-US'), inline: true },
    { name: 'إجمالي XP', value: Number(stats.total_xp || 0).toLocaleString('en-US'), inline: true },
    { name: 'منتجات المتجر المفعّلة', value: String(stats.productCount || 0), inline: true },
    { name: 'طلبات المتجر المعلّقة', value: String(stats.pendingOrders || 0), inline: true },
    { name: 'مدة تشغيل البوت', value: formatUptime(stats.uptimeSeconds), inline: true }
  );
  return {
    files: [new AttachmentBuilder(image, { name: 'dos-admin-dashboard.png' })],
    embeds: [statsEmbed],
    components: [new ActionRowBuilder().addComponents(menu)]
  };
}
async function shopAdminPayload(guildId) {
  database.ensureDefaultColorProduct(guildId);
  const products = database.products(guildId, false);
  const image = renderAdminSection({ title: 'إدارة متجر CREDITS SHOP', subtitle: 'إضافة المنتجات وتعديل أسعارها وتفعيلها ومراجعة الطلبات', emblem: 'SHOP' });
  const rows = [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('admin:shop:add').setLabel('إضافة منتج').setEmoji('➕').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('admin:shop:pending').setLabel('طلبات معلقة').setEmoji('🧾').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('admin:shop:settings').setLabel('إعداد القنوات').setEmoji('⚙️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('admin:shop:publish').setLabel('نشر المتجر').setEmoji('📌').setStyle(ButtonStyle.Secondary)
  )];
  if (products.length) {
    const menu = new StringSelectMenuBuilder().setCustomId('admin:shop:select').setPlaceholder('اختر منتجاً لإدارته')
      .addOptions(products.slice(0, 25).map((p) => ({
        label: `#${p.id} ${p.name}`.slice(0, 100), value: String(p.id),
        description: `${p.price} ${p.currency === 'cash' ? 'نقداً' : 'DOS Coin'} • ${p.active ? 'متاح' : 'متوقف'}`.slice(0, 100)
      })));
    rows.push(new ActionRowBuilder().addComponents(menu));
  }
  rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('admin:home').setLabel('رجوع').setStyle(ButtonStyle.Secondary)));
  const summary = products.slice(0, 10).map((product) => {
    const price = product.currency === 'cash'
      ? `${Number(product.price || 0).toFixed(2)} ${product.cash_currency || 'JOD'}`
      : `${Number(product.price || 0).toLocaleString('en-US')} DOS Coin`;
    return `**#${product.id} ${product.name}** — ${price} — ${product.active ? '🟢 مفعّل' : '🔴 متوقف'}`;
  });
  const productsEmbed = adminEmbed('قائمة المنتجات الفعلية', 'أضف منتجاتك وأسعارك من هنا. عنصر Colors موجود افتراضياً ومتوقف حتى تحدد سعره ثم تفعّله.\n\n' + (summary.join('\n') || 'لا توجد منتجات مضافة حالياً.')).setImage('attachment://dos-shop-admin.png');
  return { files: [new AttachmentBuilder(image, { name: 'dos-shop-admin.png' })], embeds: [productsEmbed], components: rows };
}
function shopSettingsPayload(guildId) {
  const settings = database.settings(guildId);
  const channelText = settings.shop_channel_id ? `<#${settings.shop_channel_id}>` : 'غير محددة';
  const categoryText = settings.shop_category_id ? `<#${settings.shop_category_id}>` : 'غير محدد (ستُنشأ الغرف دون تصنيف)';
  return withSectionImage({ embeds: [adminEmbed('⚙️ إعداد قنوات المتجر', `**قناة عرض المتجر:** ${channelText}\n**تصنيف الغرف الخاصة:** ${categoryText}\n\nاختر القناة والتصنيف؛ تبقى هذه الصفحة مفتوحة حتى تنتهي من الإعداد.`)], components: [
    new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('admin:set-shop-channel').setPlaceholder('اختر قناة عرض المتجر').setChannelTypes(ChannelType.GuildText)),
    new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('admin:set-room-category').setPlaceholder('اختر تصنيف الغرف الخاصة').setChannelTypes(ChannelType.GuildCategory)),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('admin:shop:back').setLabel('رجوع للمتجر').setStyle(ButtonStyle.Secondary))
  ] }, 'إعداد قنوات المتجر', 'اختر قناة عرض المتجر وتصنيف الغرف الخاصة', 'SHOP');
}
function contentAdminPayload(guildId, notice = '') {
  const editMenu = new StringSelectMenuBuilder().setCustomId('admin:content:choose').setPlaceholder('اختر رسالة لتعديلها')
    .addOptions(CONTENT_KEYS.map(([key,label]) => ({ label, value: key })));
  const previewMenu = new StringSelectMenuBuilder().setCustomId('admin:content:preview').setPlaceholder('معاينة رسالة قبل اعتمادها')
    .addOptions(CONTENT_KEYS.map(([key,label]) => ({ label, value: key })));
  const selected = new Set(guildId ? selectedMainPanelButtons(guildId) : MAIN_PANEL_BUTTONS.map((item) => item.key));
  const buttonMenu = new StringSelectMenuBuilder().setCustomId('admin:content:buttons')
    .setPlaceholder('اختر الأزرار التي تريد إظهارها في الترحيب')
    .setMinValues(0).setMaxValues(MAIN_PANEL_BUTTONS.length)
    .addOptions(MAIN_PANEL_BUTTONS.map((item) => ({
      label: item.label, value: item.key, emoji: item.emoji, default: selected.has(item.key),
      description: `زر ${item.label} في رسالة الترحيب`
    })));
  const description = 'اختر الرسالة التي تريد تعديلها. تستطيع تغيير العنوان والنص كاملاً، ثم حفظها.\n\n**أزرار رسالة الترحيب:** اختر من القائمة الثالثة الأزرار التي تريد إظهارها أو إخفاءها. يتحدث منشور الترحيب تلقائياً بعد الحفظ.\n\n' + (notice ? `✅ ${notice}\n\n` : '') + 'الرسائل المتاحة: الترحيب، القوانين، المعلومات، الرتب، منصات التواصل، التقديم، وآخر التحديثات.';
  return withSectionImage({ embeds: [adminEmbed('📝 إدارة اللوحات والرسائل', description)], components: [
    new ActionRowBuilder().addComponents(editMenu),
    new ActionRowBuilder().addComponents(previewMenu),
    new ActionRowBuilder().addComponents(buttonMenu),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('admin:panel:publish').setLabel('نشر / تحديث اللوحة الرئيسية').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('admin:home').setLabel('رجوع').setStyle(ButtonStyle.Secondary))
  ] }, 'اللوحات والرسائل', 'تعديل القوانين ورسالة الترحيب والتحكم بأزرارها', 'CONTENT');
}
function joinWelcomePayload(guildId, notice = '') {
  const enabled = database.getConfig(guildId, 'join_welcome_enabled', '1') !== '0';
  const channelId = database.getConfig(guildId, 'join_welcome_channel_id', '') || database.settings(guildId).welcome_channel_id || '';
  const template = database.getConfig(guildId, 'join_welcome_text', '🌟 First message from {user}');
  const emoji = database.getConfig(guildId, 'join_welcome_emoji', '👋');
  const previewText = String(template).replace(/\{user\}/g, '@NewMember').replace(/\{username\}/g, 'NewMember').replace(/\{server\}/g, 'DOS COMMUNITY').replace(/^\s*-#\s*/, '');
  const description = [
    `**الحالة:** ${enabled ? '🟢 مفعّل' : '🔴 متوقف'}`,
    `**قناة الترحيب:** ${channelId ? `<#${channelId}>` : 'لم يتم تحديدها — اختر الشات العام أدناه'}`,
    `**الإيموجي بجانب الرسالة:** ${emoji}`,
    '',
    '**شكل الرسالة التي ستظهر:**',
    `-# ${previewText}`,
    '',
    'استخدم `{user}` لمنشن العضو، و`{username}` لاسمه، و`{server}` لاسم السيرفر. ستُرسل الرسالة كنص صغير مباشرة دون Embed أو إطار.',
    ...(notice ? ['', `✅ ${notice}`] : [])
  ].join('\n');
  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('admin:join-welcome:edit').setLabel('تعديل النص والإيموجي').setEmoji('✏️').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('admin:join-welcome:toggle').setLabel(enabled ? 'إيقاف الترحيب' : 'تفعيل الترحيب').setEmoji(enabled ? '⏸️' : '▶️').setStyle(enabled ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder().setCustomId('admin:join-welcome:test').setLabel('إرسال تجربة').setEmoji('🧪').setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder().setCustomId('admin:join-welcome:channel').setPlaceholder('اختر الشات العام الذي يستقبل رسائل الترحيب').setChannelTypes(ChannelType.GuildText)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('admin:join-welcome:clear-channel').setLabel('إلغاء تحديد القناة').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('admin:home').setLabel('رجوع').setStyle(ButtonStyle.Secondary)
    )
  ];
  return withSectionImage({ embeds: [adminEmbed('👋 ترحيب الأعضاء الجدد', description)], components: rows }, 'ترحيب الأعضاء الجدد', 'إعداد رسالة صغيرة تلقائية عند دخول عضو جديد', 'WELCOME');
}

function featuresPayload(guildId) {
  const rows = [];
  for (let i = 0; i < FEATURES.length; i += 4) {
    const row = new ActionRowBuilder();
    for (const [key,label] of FEATURES.slice(i,i+4)) {
      const enabled = database.featureEnabled(guildId,key);
      row.addComponents(new ButtonBuilder().setCustomId(`admin:feature:${key}`).setLabel(`${enabled ? 'إيقاف' : 'تشغيل'} ${label}`.slice(0,80)).setStyle(enabled ? ButtonStyle.Danger : ButtonStyle.Success));
    }
    rows.push(row);
  }
  rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('admin:home').setLabel('رجوع').setStyle(ButtonStyle.Secondary)));
  return withSectionImage({ embeds: [adminEmbed('⏯️ تشغيل وإيقاف الأنظمة', 'كل زر يتحكم بنظام مستقل. إيقاف المتجر لا يوقف XP أو المحفظة، وإيقاف الفعاليات لا يؤثر على بقية الأنظمة.')], components: rows }, 'تشغيل وإيقاف الأنظمة', 'تحكم بكل ميزة بشكل مستقل دون تعطيل بقية البوت', 'FEATURES');
}
function economyPayload(guildId) {
  const curve = database.curveForGuild(guildId);
  const values = {
    message_xp: database.getConfig(guildId,'message_xp','7'),
    voice_xp: database.getConfig(guildId,'voice_xp','9'),
    xp_per_coin: database.getConfig(guildId,'xp_per_coin','250'),
    firstLevels: curve.firstLevels.join(', '), level7Base: curve.level7Base,
    level7Increment: curve.level7Increment, growthStep: curve.growthStep
  };
  const settings = database.settings(guildId);
  const levelChannel = settings.level_up_channel_id ? `<#${settings.level_up_channel_id}>` : 'غير محددة (سيستخدم البوت قناة الرسالة التي رفعت المستوى)';
  const embed = adminEmbed('📈 العملات والمستويات', `**الرسائل:** ${values.message_xp} XP\n**كل دقيقة فويس:** ${values.voice_xp} XP\n**التحويل:** كل ${values.xp_per_coin} XP = 1 DOS Coin\n\n**أول 6 مستويات:** ${values.firstLevels} XP\n**المستوى 7:** ${values.level7Base} XP\n**بعد ذلك:** تزيد المتطلبات ${values.level7Increment} XP أساسياً لكل مستوى، وتُضاف ${values.growthStep} XP إلى مقدار الزيادة في كل مستوى جديد.\n\n**قناة إشعارات اللفل:** ${levelChannel}`);
  return withSectionImage({ embeds: [embed], components: [
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('admin:economy:rates').setLabel('تعديل XP والعملات').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('admin:economy:curve').setLabel('تعديل صعوبة المستويات').setStyle(ButtonStyle.Primary)),
    new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('admin:set-level-channel').setPlaceholder('اختياري: اختر روم إشعارات رفع المستوى').setChannelTypes(ChannelType.GuildText)),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('admin:clear-level-channel').setLabel('استخدام قناة اللفل تلقائياً').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('admin:home').setLabel('رجوع').setStyle(ButtonStyle.Secondary))
  ] }, 'العملات والمستويات', 'تعديل معدلات XP ومنحنى المستوى وقناة إشعارات اللفل', 'XP');
}
function memberToolsPayload() {
  return withSectionImage({ embeds: [adminEmbed('🛠️ أوامر إدارة الأعضاء', [
    '**إضافة عملات:** `/add-coins member amount`',
    '**إضافة XP:** `/add-xp member amount type` — اختر كتابة أو صوت، وتُحتسب مكافأة DOS Coin حسب معدل التحويل.',
    '**إعادة ضبط:** `/reset-member member` — يعرض تأكيداً قبل تصفير عملات العضو وXP والرسائل ووقت الصوت وسجل TOP الدوري.',
    '**تحديد القنوات:** `.تعيين_قناة متجر #قناة` أو `.تعيين_قناة لفل #قناة`.',
    '**رتبة مستوى:** `.رتبة_مستوى كتابة 10 @رتبة` أو `.رتبة_مستوى صوت 10 @رتبة`.',
    '**فتح هذه اللوحة:** `/admin-panel`.',
    '',
    'الأوامر للإدارة فقط. إعادة الضبط لا تحذف سجل العضو من قاعدة البيانات ولا تؤثر على بقية الأعضاء.'
  ].join('\n'))], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('admin:home').setLabel('رجوع').setStyle(ButtonStyle.Secondary))] }, 'أوامر إدارة الأعضاء', 'إضافة العملات والخبرة وإعادة الضبط مع تأكيد', 'MEMBERS');
}
function rolesPayload(guildId) {
  const saved = database.interactionRoles(guildId);
  const menu = new RoleSelectMenuBuilder().setCustomId('admin:roles:save').setPlaceholder('اختر رتب الإشعارات التي تريد إتاحتها')
    .setMinValues(0).setMaxValues(10);
  return withSectionImage({ embeds: [adminEmbed('🔔 رتب التفاعل', `الرتب المفعّلة حالياً: ${saved.map((r) => r.role_name).join('، ') || 'لا توجد'}\n\nاختر حتى 10 رتب لإظهارها للأعضاء في زر «Roles».`)], components: [new ActionRowBuilder().addComponents(menu), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('admin:home').setLabel('رجوع').setStyle(ButtonStyle.Secondary))] }, 'رتب التفاعل', 'حدد الرتب التي يستطيع الأعضاء اختيارها من رسالة الترحيب', 'ROLES');
}
function levelRolesPayload(guildId) {
  const text = database.roles(guildId,'text');
  const voice = database.roles(guildId,'voice');
  const list = (rows) => rows.map((row) => `المستوى ${row.level}: <@&${row.role_id}>`).join('\n') || 'لا توجد رتب محددة بعد.';
  return withSectionImage({ embeds: [adminEmbed('🏅 رتب المستويات', `**رتب الكتابة**\n${list(text)}\n\n**رتب الصوت**\n${list(voice)}\n\nعند بلوغ المستوى المحدد، يمنح البوت العضو الرتبة المناسبة تلقائياً.`)], components: [
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('admin:level-role:write').setLabel('إضافة رتبة مستوى كتابة').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('admin:level-role:voice').setLabel('إضافة رتبة مستوى صوت').setStyle(ButtonStyle.Primary)),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('admin:home').setLabel('رجوع').setStyle(ButtonStyle.Secondary))
  ] }, 'رتب المستويات', 'اربط الرتب بمستويات الخبرة الكتابية والصوتية', 'LEVELS');
}
function roomsPayload(guildId) {
  const rooms = database.activeRooms(guildId);
  const text = rooms.slice(0,20).map((room) => `**#${room.id}** <#${room.channel_id}> — <@${room.user_id}> — ينتهي <t:${room.expires_at}:R>`);
  const components = [];
  if (rooms.length) {
    const menu = new StringSelectMenuBuilder().setCustomId('admin:rooms:select').setPlaceholder('اختر غرفة لإدارتها')
      .addOptions(rooms.slice(0,25).map((room) => ({ label: `#${room.id} ${room.channel_type === 'voice' ? 'صوتية' : 'كتابية'}`.slice(0,100), value: String(room.id), description: `تنتهي <t:${room.expires_at}:R>` })));
    components.push(new ActionRowBuilder().addComponents(menu));
  }
  components.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('admin:home').setLabel('رجوع').setStyle(ButtonStyle.Secondary)));
  return withSectionImage({ embeds: [adminEmbed('🏠 إدارة الغرف الخاصة', text.join('\n') || 'لا توجد غرف نشطة حالياً.\nمدة الغرفة حسب المنتج ويمكن تجديدها من قبل العضو.')], components }, 'إدارة الغرف الخاصة', 'مراجعة الغرف ومددها وتجديدها وإغلاقها', 'ROOMS');
}
function salesPayload(guildId) {
  const orders = database.pendingProductPurchases(guildId);
  const text = orders.map((o) => `**#${o.id} ${o.product_name}** — <@${o.user_id}> — ${o.price} ${o.currency === 'cash' ? 'نقداً' : 'Coin'} — ${o.status}`);
  const components = [];
  if (orders.length) {
    const menu = new StringSelectMenuBuilder().setCustomId('admin:sales:select').setPlaceholder('اختر طلباً لمراجعته')
      .addOptions(orders.slice(0,25).map((o) => ({ label: `#${o.id} ${o.product_name}`.slice(0,100), value: String(o.id), description: `${o.status} • ${o.price}`.slice(0,100) })));
    components.push(new ActionRowBuilder().addComponents(menu));
  }
  components.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('admin:home').setLabel('رجوع').setStyle(ButtonStyle.Secondary)));
  return withSectionImage({ embeds: [adminEmbed('🧾 طلبات المتجر', text.join('\n') || 'لا توجد طلبات معلقة حالياً.\nطلبات الدفع النقدي لا تُعتمد إلا بعد التحقق الفعلي من الدفع.')], components }, 'طلبات المتجر', 'مراجعة طلبات الشراء والدفع والتسليم', 'SALES');
}
function productModal(product) {
  const modal = new ModalBuilder().setCustomId(product ? `admin:product:save:${product.id}` : 'admin:product:save:new').setTitle(product ? 'تعديل منتج DOS SHOP' : 'إضافة منتج إلى DOS SHOP');
  const field = (id,label,value,placeholder,style,maxLength) => {
    const input = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style || TextInputStyle.Short).setRequired(id === 'name' || id === 'price' || id === 'type').setMaxLength(maxLength || 300).setPlaceholder(placeholder || '');
    if (value) input.setValue(String(value));
    return new ActionRowBuilder().addComponents(input);
  };
  modal.addComponents(
    field('name','اسم المنتج',product && product.name,'مثال: لون خاص'),
    field('description','وصف المنتج',product && product.description,'وصف قصير يظهر في المتجر',TextInputStyle.Paragraph,900),
    field('price','السعر والعملات',product ? `${product.currency}:${product.price}${product.currency === 'cash' ? ':'+(product.cash_currency || 'JOD') : ''}` : 'coin:250','coin:250 أو cash:5:JOD'),
    field('type','نوع المنتج',product ? (product.product_type === 'role' ? `role:${product.role_id || ''}` : product.product_type) : 'color','color / text_room / voice_room / role:ROLE_ID / digital / manual'),
    field('links','روابط اختيارية',product ? `${product.image_url || ''}\n${product.payment_url || ''}` : '', 'السطر الأول صورة المنتج، والثاني رابط الدفع النقدي',TextInputStyle.Paragraph,900)
  );
  return modal;
}
function contentModal(key, guildId) {
  const saved = database.getContent(guildId,key) || DEFAULT_CONTENT[key];
  return new ModalBuilder().setCustomId(`admin:content:save:${key}`).setTitle('تعديل ' + (CONTENT_KEYS.find((x) => x[0] === key)?.[1] || key))
    .addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('title').setLabel('عنوان الرسالة').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(256).setValue(saved.title)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('body').setLabel('محتوى الرسالة').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(4000).setValue(saved.body))
    );
}
function parseProductFields(interaction) {
  const name = interaction.fields.getTextInputValue('name').trim();
  const description = interaction.fields.getTextInputValue('description').trim();
  const priceValue = interaction.fields.getTextInputValue('price').trim();
  const typeValue = interaction.fields.getTextInputValue('type').trim();
  const links = interaction.fields.getTextInputValue('links').split('\n').map((x) => x.trim());
  const match = priceValue.match(/^(coin|cash)\s*:\s*(\d+(?:\.\d{1,2})?)(?:\s*:\s*([A-Z]{3}))?$/i);
  if (!match) throw new Error('صيغة السعر يجب أن تكون coin:250 أو cash:5:JOD');
  const currency = match[1].toLowerCase();
  const price = Number(match[2]);
  if (!Number.isFinite(price) || price < 0 || price > 100000000) throw new Error('السعر غير صالح.');
  let productType = typeValue;
  let roleId = null;
  if (typeValue.startsWith('role:')) { productType = 'role'; roleId = typeValue.slice(5).trim(); }
  if (!['color','text_room','voice_room','role','digital','manual'].includes(productType)) throw new Error('نوع المنتج غير معروف.');
  if (productType === 'role' && !/^\d{15,22}$/.test(roleId || '')) throw new Error('اكتب نوع الرتبة هكذا: role:ROLE_ID');
  if (currency === 'coin' && !Number.isSafeInteger(price)) throw new Error('سعر العملات غير صالح.');
  if (productType === 'color' && price < 1) throw new Error('حدد سعراً موجباً لمنتج Colors قبل تفعيله.');
  if (currency === 'cash' && ['text_room','voice_room'].includes(productType)) throw new Error('الغرف الخاصة حالياً تُباع بعملات DOS حتى يمكن تجديدها تلقائياً كل 30 يوماً.');
  if (links[0] && !/^https:\/\//i.test(links[0])) throw new Error('رابط صورة المنتج يجب أن يبدأ بـ https://');
  if (links[1] && !/^https:\/\//i.test(links[1])) throw new Error('رابط الدفع يجب أن يبدأ بـ https://');
  if (!name) throw new Error('اكتب اسم المنتج.');
  return { name, description, price, currency, cash_currency: (match[3] || 'JOD').toUpperCase(), product_type: productType, role_id: roleId, image_url: links[0] || null, payment_url: links[1] || null, duration_days: 30 };
}

async function handleAdminInteraction(interaction, client) {
  const parts = interaction.customId.split(':');
  if (parts[0] !== 'admin') return false;
  if (!isAdmin(interaction.member, interaction.user.id, interaction.memberPermissions)) return interaction.reply({ content: 'هذه اللوحة للإدارة فقط.', flags: MessageFlags.Ephemeral });

  if (parts[1] === 'home') return interaction.update(await homePayload(interaction.guild));
  if (parts[1] === 'nav' && interaction.isStringSelectMenu()) {
    const section = interaction.values[0];
    const payload = section === 'shop' ? await shopAdminPayload(interaction.guildId)
      : section === 'rooms' ? roomsPayload(interaction.guildId)
      : section === 'content' ? contentAdminPayload(interaction.guildId)
      : section === 'join_welcome' ? joinWelcomePayload(interaction.guildId)
      : section === 'features' ? featuresPayload(interaction.guildId)
      : section === 'economy' ? economyPayload(interaction.guildId)
      : section === 'member_tools' ? memberToolsPayload()
      : section === 'roles' ? rolesPayload(interaction.guildId)
      : section === 'level_roles' ? levelRolesPayload(interaction.guildId) : salesPayload(interaction.guildId);
    return interaction.update(payload);
  }
  if (parts[1] === 'join-welcome' && parts[2] === 'edit') {
    const template = database.getConfig(interaction.guildId, 'join_welcome_text', '🌟 First message from {user}');
    const emoji = database.getConfig(interaction.guildId, 'join_welcome_emoji', '👋');
    const modal = new ModalBuilder().setCustomId('admin:join-welcome:save').setTitle('تعديل رسالة دخول الأعضاء')
      .addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('template').setLabel('النص — استخدم {user} لمنشن العضو').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(450).setValue(String(template).replace(/^\s*-#\s*/, ''))),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('emoji').setLabel('إيموجي الزر بجانب الرسالة').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80).setValue(emoji))
      );
    return interaction.showModal(modal);
  }
  if (parts[1] === 'join-welcome' && parts[2] === 'toggle') {
    const enabled = database.getConfig(interaction.guildId, 'join_welcome_enabled', '1') !== '0';
    database.setConfig(interaction.guildId, 'join_welcome_enabled', enabled ? '0' : '1', interaction.user.id);
    database.logAdmin(interaction.guildId, interaction.user.id, 'join_welcome_toggle', String(!enabled));
    return interaction.update(joinWelcomePayload(interaction.guildId, enabled ? 'تم إيقاف رسالة الترحيب.' : 'تم تفعيل رسالة الترحيب.'));
  }
  if (parts[1] === 'join-welcome' && parts[2] === 'channel' && interaction.isChannelSelectMenu()) {
    const channelId = interaction.values[0];
    database.setConfig(interaction.guildId, 'join_welcome_channel_id', channelId, interaction.user.id);
    database.logAdmin(interaction.guildId, interaction.user.id, 'join_welcome_channel', channelId);
    return interaction.update(joinWelcomePayload(interaction.guildId, `تم تعيين قناة الترحيب إلى <#${channelId}>.`));
  }
  if (parts[1] === 'join-welcome' && parts[2] === 'clear-channel') {
    database.setConfig(interaction.guildId, 'join_welcome_channel_id', '', interaction.user.id);
    database.logAdmin(interaction.guildId, interaction.user.id, 'join_welcome_channel', 'auto');
    return interaction.update(joinWelcomePayload(interaction.guildId, 'تم إلغاء القناة المخصصة. سيحاول البوت استخدام قناة باسم general أو الشات العام ثم قناة النظام.'));
  }
  if (parts[1] === 'join-welcome' && parts[2] === 'test') {
    const { sendJoinWelcome } = require('./join-welcome');
    try {
      const testMember = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      const message = testMember ? await sendJoinWelcome(testMember, { test: true }) : null;
      if (!message) return interaction.reply({ content: 'لم تُرسل التجربة. تأكد أن الترحيب مفعّل وأن قناة الترحيب محددة وأن للبوت صلاحية إرسال الرسائل.', flags: MessageFlags.Ephemeral });
      return interaction.reply({ content: `✅ تم إرسال رسالة التجربة في ${message.channel}.`, flags: MessageFlags.Ephemeral });
    } catch (error) {
      console.error('[ADMIN] Join welcome test failed:', error);
      return interaction.reply({ content: 'تعذّر إرسال التجربة: ' + error.message, flags: MessageFlags.Ephemeral });
    }
  }
  if (parts[1] === 'member-reset' && ['confirm','cancel'].includes(parts[2])) {
    const targetId = parts[3];
    const actorId = parts[4];
    if (interaction.user.id !== actorId) return interaction.reply({ content: 'فقط المسؤول الذي بدأ العملية يستطيع تأكيدها أو إلغاءها.', flags: MessageFlags.Ephemeral });
    if (parts[2] === 'cancel') return interaction.update({ content: 'تم إلغاء إعادة الضبط. لم تتغير بيانات العضو.', embeds: [], components: [] });
    const member = await interaction.guild.members.fetch(targetId).catch(() => null);
    if (!member) return interaction.update({ content: 'تعذر العثور على العضو. لم يتم تغيير أي بيانات.', embeds: [], components: [] });
    database.resetMember(interaction.guildId, targetId);
    database.logAdmin(interaction.guildId, interaction.user.id, 'member_reset', `target=${targetId}`);
    return interaction.update({ content: `✅ تمت إعادة ضبط بيانات ${member.user.tag}. صُفّرت العملات وXP والرسائل ووقت الصوت، مع إبقاء سجل العضو وقاعدة البيانات.`, embeds: [], components: [] });
  }
  if (parts[1] === 'feature') {
    const key = parts[2];
    if (!FEATURES.some((item) => item[0] === key)) return interaction.reply({ content: 'النظام غير معروف.', flags: MessageFlags.Ephemeral });
    const enabled = !database.featureEnabled(interaction.guildId,key);
    database.setFeature(interaction.guildId,key,enabled,interaction.user.id);
    database.logAdmin(interaction.guildId,interaction.user.id,'feature_toggle',`${key}=${enabled}`);
    if (key === 'shop') await refreshPublishedShop(interaction.guild).catch((error) => console.error('[ADMIN] Store refresh failed:',error.message));
    return interaction.update(featuresPayload(interaction.guildId));
  }
  if (parts[1] === 'level-role' && ['write','voice'].includes(parts[2])) {
    const kind = parts[2] === 'voice' ? 'صوت' : 'كتابة';
    const modal = new ModalBuilder().setCustomId(`admin:level-role:save:${parts[2]}`).setTitle('ربط رتبة بمستوى')
      .addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('level').setLabel('رقم المستوى المطلوب').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('مثال: 10')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('role_id').setLabel('معرّف الرتبة أو منشنها').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('@Role أو Role ID'))
      );
    return interaction.showModal(modal);
  }
  if (parts[1] === 'level-role' && parts[2] === 'back') return interaction.update(levelRolesPayload(interaction.guildId));
  if (parts[1] === 'shop' && parts[2] === 'add') return interaction.showModal(productModal(null));
  if (parts[1] === 'shop' && parts[2] === 'select' && interaction.isStringSelectMenu()) {
    const id = Number(interaction.values[0]);
    const product = database.products(interaction.guildId,false).find((p) => p.id === id);
    if (!product) return interaction.reply({ content: 'المنتج غير موجود.', flags: MessageFlags.Ephemeral });
    const embed = adminEmbed(`🛍️ ${product.name}`, `رقم المنتج: #${id}\nالسعر: ${product.price} ${product.currency}\nالنوع: ${product.product_type}\nالحالة: ${product.active ? 'متاح' : 'متوقف'}\nالمدة: ${product.duration_days} يوماً\n\n${product.description || ''}`);
    return withSectionImage({ embeds: [embed], components: [
      new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`admin:product:edit:${id}`).setLabel('تعديل الاسم والسعر').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId(`admin:product:toggle:${id}`).setLabel(product.active ? 'إيقاف المنتج' : 'تشغيل المنتج').setStyle(product.active ? ButtonStyle.Danger : ButtonStyle.Success)),
      new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('admin:shop:back').setLabel('رجوع للمتجر').setStyle(ButtonStyle.Secondary))
    ] }, product.name, `#${id} • ${product.product_type} • ${product.active ? 'مفعّل' : 'متوقف'}`, 'ITEM');
  }
  if (parts[1] === 'shop' && parts[2] === 'back') return interaction.update(await shopAdminPayload(interaction.guildId));
  if (parts[1] === 'product' && parts[2] === 'edit') {
    const product = database.products(interaction.guildId,false).find((p) => p.id === Number(parts[3]));
    if (!product) return interaction.reply({ content: 'المنتج غير موجود.', flags: MessageFlags.Ephemeral });
    return interaction.showModal(productModal(product));
  }
  if (parts[1] === 'product' && parts[2] === 'toggle') {
    const id = Number(parts[3]);
    const product = database.products(interaction.guildId,false).find((p) => p.id === id);
    if (!product) return interaction.reply({ content: 'المنتج غير موجود.', flags: MessageFlags.Ephemeral });
    database.setProductActive(interaction.guildId,id,!product.active);
    database.logAdmin(interaction.guildId,interaction.user.id,'product_toggle',`id=${id};active=${!product.active}`);
    await refreshPublishedShop(interaction.guild).catch((error) => console.error('[ADMIN] Store refresh failed:',error.message));
    return interaction.update(await shopAdminPayload(interaction.guildId));
  }
  if (parts[1] === 'shop' && parts[2] === 'publish') {
    const settings = database.settings(interaction.guildId);
    const channel = settings.shop_channel_id ? await interaction.guild.channels.fetch(settings.shop_channel_id).catch(() => null) : null;
    if (!channel || !channel.isTextBased()) return interaction.reply({ content: 'حدّد قناة المتجر أولاً من إعداد القنوات.', flags: MessageFlags.Ephemeral });
    const message = await publishShop(interaction.guild,channel);
    database.logAdmin(interaction.guildId,interaction.user.id,'shop_publish',`channel=${channel.id};message=${message.id}`);
    return interaction.update({ content: `✅ تم نشر/تحديث المتجر في ${channel}.`, embeds: [], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('admin:shop:back').setLabel('رجوع للمتجر').setStyle(ButtonStyle.Secondary))] });
  }
  if (parts[1] === 'shop' && parts[2] === 'settings') return interaction.update(shopSettingsPayload(interaction.guildId));
  if (parts[1] === 'clear-level-channel') {
    database.setSetting(interaction.guildId, 'level_up_channel_id', null);
    database.logAdmin(interaction.guildId, interaction.user.id, 'level_up_channel_setting', 'default');
    return interaction.update(economyPayload(interaction.guildId));
  }
  if (parts[1] === 'set-level-channel' && interaction.isChannelSelectMenu()) {
    const channelId = interaction.values[0];
    database.setSetting(interaction.guildId, 'level_up_channel_id', channelId);
    database.logAdmin(interaction.guildId, interaction.user.id, 'level_up_channel_setting', channelId);
    return interaction.update(economyPayload(interaction.guildId));
  }
  if ((parts[1] === 'set-shop-channel' || parts[1] === 'set-room-category') && interaction.isChannelSelectMenu()) {
    const channelId = interaction.values[0];
    database.setSetting(interaction.guildId, parts[1] === 'set-shop-channel' ? 'shop_channel_id' : 'shop_category_id', channelId);
    database.logAdmin(interaction.guildId,interaction.user.id,'shop_channel_setting',`${parts[1]}=${channelId}`);
    return interaction.update(shopSettingsPayload(interaction.guildId));
  }
  if (parts[1] === 'shop' && parts[2] === 'pending') return interaction.update(salesPayload(interaction.guildId));
  if (parts[1] === 'sales' && parts[2] === 'select' && interaction.isStringSelectMenu()) {
    const id = Number(interaction.values[0]);
    const order = database.getProductPurchase(interaction.guildId,id);
    if (!order || !['awaiting_payment','pending_fulfillment'].includes(order.status)) return interaction.reply({ content: 'الطلب غير متاح للمراجعة.', flags: MessageFlags.Ephemeral });
    const cashWarning = order.currency === 'cash' ? '\n\n⚠️ لا تضغط اعتماد إلا بعد التأكد من وصول الدفع فعلياً.' : '';
    return interaction.update(withSectionImage({ embeds: [adminEmbed(`طلب المتجر #${id}`, `المنتج: ${order.product_name}\nالعضو: <@${order.user_id}>\nالسعر: ${order.price} ${order.currency}\nالحالة: ${order.status}${cashWarning}`)], components: [
      new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`admin:purchase:approve:${id}`).setLabel(order.currency === 'cash' ? 'اعتماد بعد التحقق من الدفع' : 'تسليم المنتج').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`admin:purchase:reject:${id}`).setLabel('رفض الطلب').setStyle(ButtonStyle.Danger)),
      new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('admin:shop:pending').setLabel('رجوع للطلبات').setStyle(ButtonStyle.Secondary))
    ] }, `طلب المتجر #${id}`, `${order.product_name} • ${order.price} ${order.currency}`, 'ORDER'));
  }
  if (parts[1] === 'purchase' && parts[2] === 'approve') {
    try {
      const result = await deliverProduct(client,interaction.guildId,Number(parts[3]),interaction.user.id);
      database.logAdmin(interaction.guildId,interaction.user.id,'purchase_approved',`id=${parts[3]}`);
      return interaction.update({ content: '✅ ' + result.message, embeds: [], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('admin:shop:pending').setLabel('العودة للطلبات').setStyle(ButtonStyle.Secondary))] });
    } catch (error) {
      return interaction.reply({ content: 'تعذر تسليم الطلب: ' + error.message, flags: MessageFlags.Ephemeral });
    }
  }
  if (parts[1] === 'purchase' && parts[2] === 'reject') {
    const order = database.getProductPurchase(interaction.guildId,Number(parts[3]));
    if (!order || !['awaiting_payment','pending_fulfillment'].includes(order.status)) return interaction.reply({ content: 'الطلب غير موجود أو تمت مراجعته.', flags: MessageFlags.Ephemeral });
    if (order.currency === 'coin') database.refundProductPurchase(interaction.guildId,order.id);
    database.updateProductPurchase(interaction.guildId,order.id,'rejected',{ rejected:true },interaction.user.id);
    const user = await client.users.fetch(order.user_id).catch(() => null);
    if (user) await user.send(`تم رفض طلبك #${order.id} من DOS SHOP.${order.currency === 'coin' ? ' تمت إعادة العملات إلى محفظتك.' : ' تواصل مع الإدارة بخصوص عملية الدفع.'}`).catch(() => {});
    database.logAdmin(interaction.guildId,interaction.user.id,'purchase_rejected',`id=${order.id}`);
    return interaction.update({ content: `تم رفض الطلب #${order.id}. ${order.currency === 'coin' ? 'تمت إعادة العملات.' : 'يرجى متابعة أي استرداد نقدي يدوياً.'}`, embeds: [], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('admin:shop:pending').setLabel('العودة للطلبات').setStyle(ButtonStyle.Secondary))] });
  }
  if (parts[1] === 'rooms' && parts[2] === 'select' && interaction.isStringSelectMenu()) {
    const room = database.getRoom(interaction.guildId,Number(interaction.values[0]));
    if (!room) return interaction.reply({ content: 'الغرفة غير موجودة أو انتهت.', flags: MessageFlags.Ephemeral });
    return interaction.update(withSectionImage({ embeds: [adminEmbed(`غرفة خاصة #${room.id}`, `القناة: <#${room.channel_id}>\nالمالك: <@${room.user_id}>\nالنوع: ${room.channel_type === 'voice' ? 'صوتية' : 'كتابية'}\nتاريخ الانتهاء: <t:${room.expires_at}:F>`) ], components: [
      new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`admin:room:extend:${room.id}`).setLabel('تمديد 30 يوماً').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`admin:room:close:${room.id}`).setLabel('إغلاق الغرفة').setStyle(ButtonStyle.Danger)),
      new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('admin:rooms:back').setLabel('رجوع').setStyle(ButtonStyle.Secondary))
    ] }, `غرفة خاصة #${room.id}`, `المالك: ${room.user_id}`, 'ROOM'));
  }
  if (parts[1] === 'rooms' && parts[2] === 'back') return interaction.update(roomsPayload(interaction.guildId));
  if (parts[1] === 'room' && parts[2] === 'extend') {
    const id = Number(parts[3]);
    if (!database.getRoom(interaction.guildId,id)) return interaction.reply({ content: 'الغرفة غير موجودة في هذا السيرفر.', flags: MessageFlags.Ephemeral });
    if (!database.extendRoom(id,30)) return interaction.reply({ content: 'تعذر تمديد الغرفة.', flags: MessageFlags.Ephemeral });
    database.logAdmin(interaction.guildId,interaction.user.id,'room_extend',`id=${id};days=30`);
    return interaction.update({ content: `✅ تم تمديد الغرفة #${id} لمدة 30 يوماً.`, embeds: [], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('admin:rooms:back').setLabel('العودة للغرف').setStyle(ButtonStyle.Secondary))] });
  }
  if (parts[1] === 'room' && parts[2] === 'close') {
    const id = Number(parts[3]);
    const room = database.getRoom(interaction.guildId,id);
    if (!room) return interaction.reply({ content: 'الغرفة غير موجودة.', flags: MessageFlags.Ephemeral });
    const channel = await interaction.guild.channels.fetch(room.channel_id).catch(() => null);
    if (channel) await channel.delete('Closed by DOS administrator');
    database.closeRoom(id);
    database.logAdmin(interaction.guildId,interaction.user.id,'room_closed',`id=${id}`);
    return interaction.update({ content: `تم إغلاق الغرفة #${id}.`, embeds: [], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('admin:rooms:back').setLabel('العودة للغرف').setStyle(ButtonStyle.Secondary))] });
  }
  if (parts[1] === 'content' && parts[2] === 'buttons' && interaction.isStringSelectMenu()) {
    const allowed = new Set(MAIN_PANEL_BUTTONS.map((item) => item.key));
    const chosen = MAIN_PANEL_BUTTONS.map((item) => item.key).filter((key) => interaction.values.includes(key) && allowed.has(key));
    database.setConfig(interaction.guildId, 'main_panel_buttons', JSON.stringify(chosen), interaction.user.id);
    database.logAdmin(interaction.guildId, interaction.user.id, 'main_panel_buttons_update', chosen.join(','));
    let refreshed = false;
    const settings = database.settings(interaction.guildId);
    const channel = settings.panel_channel_id ? await interaction.guild.channels.fetch(settings.panel_channel_id).catch(() => null) : null;
    if (channel && channel.isTextBased()) {
      try { await publishMainPanel(interaction.guild, channel); refreshed = true; }
      catch (error) { console.error('[ADMIN] Main panel button refresh failed:', error.message); }
    }
    const names = MAIN_PANEL_BUTTONS.filter((item) => chosen.includes(item.key)).map((item) => item.label);
    const notice = chosen.length ? `تم تحديث الأزرار (${chosen.length}): ${names.join('، ')}.${refreshed ? ' وتم تحديث رسالة الترحيب المنشورة.' : ' انشر اللوحة من الزر أدناه لتطبيقها في القناة.'}` : `تم إخفاء جميع أزرار رسالة الترحيب.${refreshed ? ' وتم تحديث الرسالة المنشورة.' : ' انشر اللوحة من الزر أدناه لتطبيق التغيير.'}`;
    return interaction.update(contentAdminPayload(interaction.guildId, notice));
  }
  if (parts[1] === 'content' && parts[2] === 'choose' && interaction.isStringSelectMenu()) return interaction.showModal(contentModal(interaction.values[0],interaction.guildId));
  if (parts[1] === 'content' && parts[2] === 'preview' && interaction.isStringSelectMenu()) {
    const key = interaction.values[0];
    const item = DEFAULT_CONTENT[key];
    return interaction.update(withSectionImage({ embeds: [makeContentEmbed(interaction.guildId,key)], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('admin:content:back').setLabel('رجوع لإدارة الرسائل').setStyle(ButtonStyle.Secondary))] }, item ? item.title : 'معاينة الرسالة', 'هذه معاينة للنص المحفوظ قبل النشر', 'PREVIEW'));
  }
  if (parts[1] === 'content' && parts[2] === 'back') return interaction.update(contentAdminPayload(interaction.guildId));
  if (parts[1] === 'panel' && parts[2] === 'publish') {
    return interaction.update(withSectionImage({ embeds: [adminEmbed('📌 نشر اللوحة الرئيسية', 'اختر القناة التي تريد نشر اللوحة فيها. إذا كانت اللوحة موجودة مسبقاً فسيتم تحديثها.')], components: [
      new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('admin:panel:publish-channel').setPlaceholder('اختر قناة اللوحة الرئيسية').setChannelTypes(ChannelType.GuildText)),
      new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('admin:home').setLabel('رجوع').setStyle(ButtonStyle.Secondary))
    ] }, 'نشر رسالة الترحيب', 'اختر القناة التي ستظهر فيها صورة السيرفر وأزرار القوانين', 'PUBLISH'));
  }
  if (parts[1] === 'panel' && parts[2] === 'publish-channel' && interaction.isChannelSelectMenu()) {
    const channel = await interaction.guild.channels.fetch(interaction.values[0]);
    const message = await publishMainPanel(interaction.guild,channel);
    database.logAdmin(interaction.guildId,interaction.user.id,'main_panel_publish',`channel=${channel.id};message=${message.id}`);
    return interaction.update({ content: `✅ تم نشر/تحديث اللوحة في ${channel}.`, embeds: [], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('admin:home').setLabel('العودة للوحة الإدارة').setStyle(ButtonStyle.Secondary))] });
  }
  if (parts[1] === 'economy' && parts[2] === 'rates') {
    const modal = new ModalBuilder().setCustomId('admin:economy:save-rates').setTitle('تعديل معدلات XP والعملات')
      .addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('message_xp').setLabel('XP لكل رسالة').setStyle(TextInputStyle.Short).setValue(database.getConfig(interaction.guildId,'message_xp','7')).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('voice_xp').setLabel('XP لكل دقيقة فويس').setStyle(TextInputStyle.Short).setValue(database.getConfig(interaction.guildId,'voice_xp','9')).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('xp_per_coin').setLabel('كم XP يساوي عملة واحدة؟').setStyle(TextInputStyle.Short).setValue(database.getConfig(interaction.guildId,'xp_per_coin','250')).setRequired(true))
      );
    return interaction.showModal(modal);
  }
  if (parts[1] === 'economy' && parts[2] === 'curve') {
    const curve = database.curveForGuild(interaction.guildId);
    const modal = new ModalBuilder().setCustomId('admin:economy:save-curve').setTitle('تعديل صعوبة المستويات')
      .addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('first').setLabel('متطلبات أول 6 مستويات (مفصولة بفواصل)').setStyle(TextInputStyle.Short).setValue(curve.firstLevels.join(',')).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('later').setLabel('المستوى 7، والزيادة الأساسية (مثال 750,150)').setStyle(TextInputStyle.Short).setValue(`${curve.level7Base},${curve.level7Increment}`).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('growth').setLabel('زيادة مقدار التصاعد لكل مستوى (مثال 5)').setStyle(TextInputStyle.Short).setValue(String(curve.growthStep)).setRequired(true))
      );
    return interaction.showModal(modal);
  }
  if (parts[1] === 'roles' && parts[2] === 'save' && interaction.isRoleSelectMenu()) {
    const roles = interaction.roles.filter((role) => role.id !== interaction.guildId && !role.managed && !role.permissions.has(PermissionsBitField.Flags.Administrator)).map((role) => ({ id: role.id, name: role.name }));
    database.setInteractionRoles(interaction.guildId,roles);
    database.logAdmin(interaction.guildId,interaction.user.id,'interaction_roles_update',roles.map((r) => r.id).join(','));
    return interaction.update({ content: `✅ تم حفظ ${roles.length} رتبة تفاعل.`, embeds: [], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('admin:home').setLabel('العودة للوحة الإدارة').setStyle(ButtonStyle.Secondary))] });
  }
  return false;
}

async function handleAdminModal(interaction) {
  const parts = interaction.customId.split(':');
  if (parts[0] !== 'admin') return false;
  if (!isAdmin(interaction.member,interaction.user.id,interaction.memberPermissions)) return interaction.reply({ content: 'هذه العملية للإدارة فقط.', flags: MessageFlags.Ephemeral });
  if (parts[1] === 'join-welcome' && parts[2] === 'save') {
    const template = interaction.fields.getTextInputValue('template').trim().replace(/^\s*-#\s*/, '');
    const emoji = interaction.fields.getTextInputValue('emoji').trim();
    if (!template || template.length > 450 || !emoji || emoji.length > 80 || /[\r\n]/.test(emoji)) {
      return interaction.reply({ content: 'أدخل نصاً صالحاً وإيموجياً واحداً أو رمز إيموجي مخصص.', flags: MessageFlags.Ephemeral });
    }
    database.setConfig(interaction.guildId, 'join_welcome_text', template, interaction.user.id);
    database.setConfig(interaction.guildId, 'join_welcome_emoji', emoji, interaction.user.id);
    database.logAdmin(interaction.guildId, interaction.user.id, 'join_welcome_update', JSON.stringify({ template, emoji }));
    return interaction.reply({ content: '✅ تم حفظ نص وإيموجي الترحيب. سيُستخدمان مع كل عضو جديد يدخل السيرفر.', flags: MessageFlags.Ephemeral });
  }
  if (parts[1] === 'level-role' && parts[2] === 'save') {
    const kind = parts[3] === 'voice' ? 'voice' : parts[3] === 'write' ? 'text' : null;
    const level = Number(interaction.fields.getTextInputValue('level'));
    const roleInput = interaction.fields.getTextInputValue('role_id').trim();
    const mention = roleInput.match(/^<@&(\d{15,22})>$/);
    const roleId = mention ? mention[1] : roleInput;
    if (!kind || !Number.isSafeInteger(level) || level < 1 || level > 100000 || !/^\d{15,22}$/.test(roleId)) return interaction.reply({ content: 'تأكد من رقم المستوى ومعرّف الرتبة.', flags: MessageFlags.Ephemeral });
    const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
    const botTop = interaction.guild.members.me && interaction.guild.members.me.roles.highest;
    if (!role || role.managed || !botTop || role.position >= botTop.position) return interaction.reply({ content: 'الرتبة غير موجودة أو ليست أسفل أعلى رتبة للبوت. ارفع رتبة البوت أولاً.', flags: MessageFlags.Ephemeral });
    database.setRole(interaction.guildId,kind,level,role.id);
    database.logAdmin(interaction.guildId,interaction.user.id,'level_role_set',`${kind};level=${level};role=${role.id}`);
    return interaction.reply({ content: `✅ تم ربط ${role} بمستوى ${level} (${kind === 'text' ? 'كتابي' : 'صوتي'}).`, flags: MessageFlags.Ephemeral });
  }
  if (parts[1] === 'product' && parts[2] === 'save') {
    try {
      const data = parseProductFields(interaction);
      const id = parts[3] === 'new' ? database.createProduct(interaction.guildId,data) : Number(parts[3]);
      if (parts[3] !== 'new' && !database.updateProduct(interaction.guildId,id,data)) throw new Error('المنتج غير موجود.');
      database.logAdmin(interaction.guildId,interaction.user.id,'product_saved',`id=${id};name=${data.name}`);
      await refreshPublishedShop(interaction.guild).catch((error) => console.error('[ADMIN] Store refresh failed:',error.message));
      return interaction.reply({ content: `✅ تم حفظ المنتج **${data.name}** برقم #${id}. تم تحديث رسالة المتجر تلقائياً إذا كانت منشورة.`, flags: MessageFlags.Ephemeral });
    } catch (error) {
      return interaction.reply({ content: 'لم يتم حفظ المنتج: ' + error.message, flags: MessageFlags.Ephemeral });
    }
  }
  if (parts[1] === 'content' && parts[2] === 'save') {
    const key = parts[3];
    if (!CONTENT_KEYS.some((item) => item[0] === key)) return interaction.reply({ content: 'قسم الرسالة غير صالح.', flags: MessageFlags.Ephemeral });
    const title = interaction.fields.getTextInputValue('title');
    const body = interaction.fields.getTextInputValue('body');
    database.setContent(interaction.guildId,key,title,body,interaction.user.id);
    database.logAdmin(interaction.guildId,interaction.user.id,'content_updated',key);
    let panelUpdated = false;
    if (key === 'main') {
      const settings = database.settings(interaction.guildId);
      const channel = settings.panel_channel_id ? await interaction.guild.channels.fetch(settings.panel_channel_id).catch(() => null) : null;
      if (channel && channel.isTextBased()) {
        try { await publishMainPanel(interaction.guild,channel); panelUpdated = true; }
        catch (error) { console.error('[ADMIN] Main panel refresh failed:',error.message); }
      }
    }
    const label = CONTENT_KEYS.find((item) => item[0] === key)[1];
    const detail = key === 'main' ? (panelUpdated ? ' وتم تحديث اللوحة المنشورة.' : ' احفظها في قناة من زر نشر/تحديث اللوحة الرئيسية.') : ' سيظهر النص الجديد عند ضغط الأعضاء على الزر.';
    return interaction.reply({ content: `✅ تم حفظ رسالة «${label}».${detail}`, flags: MessageFlags.Ephemeral });
  }
  if (parts[1] === 'economy' && parts[2] === 'save-rates') {
    const parsed = ['message_xp','voice_xp','xp_per_coin'].map((key) => [key,Number(interaction.fields.getTextInputValue(key))]);
    if (parsed.some(([,value]) => !Number.isSafeInteger(value) || value < 1 || value > 100000)) return interaction.reply({ content: 'كل القيم يجب أن تكون أرقاماً صحيحة بين 1 و100000.', flags: MessageFlags.Ephemeral });
    for (const [key,value] of parsed) database.setConfig(interaction.guildId,key,value,interaction.user.id);
    database.logAdmin(interaction.guildId,interaction.user.id,'economy_rates_update',JSON.stringify(Object.fromEntries(parsed)));
    return interaction.reply({ content: '✅ تم حفظ معدلات الرسائل والصوت وتحويل XP إلى DOS Coin. القيم الجديدة تطبق على المكاسب القادمة.', flags: MessageFlags.Ephemeral });
  }
  if (parts[1] === 'economy' && parts[2] === 'save-curve') {
    const first = interaction.fields.getTextInputValue('first').split(',').map((item) => Number(item.trim()));
    const later = interaction.fields.getTextInputValue('later').split(',').map((item) => Number(item.trim()));
    const growth = Number(interaction.fields.getTextInputValue('growth').trim());
    if (first.length !== 6 || first.some((n) => !Number.isSafeInteger(n) || n < 1 || n > 100000) ||
        later.length !== 2 || later.some((n) => !Number.isSafeInteger(n) || n < 1 || n > 100000) ||
        !Number.isSafeInteger(growth) || growth < 0 || growth > 100000) {
      return interaction.reply({ content: 'أدخل 6 أرقام صحيحة لأول المستويات، ورقمين للمستوى 7 والزيادة الأساسية، ورقماً صحيحاً للتصاعد.', flags: MessageFlags.Ephemeral });
    }
    if (first.some((value, index) => index > 0 && value <= first[index - 1]) || later[0] <= first[5]) {
      return interaction.reply({ content: 'يجب أن يزيد XP المطلوب في كل مستوى عن المستوى الذي قبله.', flags: MessageFlags.Ephemeral });
    }
    database.setConfig(interaction.guildId, 'level_first_six', first.join(','), interaction.user.id);
    database.setConfig(interaction.guildId, 'level_7_base', later[0], interaction.user.id);
    database.setConfig(interaction.guildId, 'level_7_increment', later[1], interaction.user.id);
    database.setConfig(interaction.guildId, 'level_growth_step', growth, interaction.user.id);
    database.logAdmin(interaction.guildId, interaction.user.id, 'level_curve_update', JSON.stringify({ first, level7Base: later[0], level7Increment: later[1], growthStep: growth }));
    return interaction.reply({ content: '✅ تم تحديث منحنى XP التصاعدي. بيانات XP والعملات لم تُصفّر؛ سيُعاد حساب المستوى وفق المنحنى الجديد.', flags: MessageFlags.Ephemeral });
  }
  return false;
}

module.exports = { isAdmin, homePayload, shopAdminPayload, shopSettingsPayload, contentAdminPayload, joinWelcomePayload, featuresPayload, economyPayload, memberToolsPayload, rolesPayload, levelRolesPayload, salesPayload, roomsPayload, handleAdminInteraction, handleAdminModal };
