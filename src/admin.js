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
const { questionSettingsPayload, nextRandomSchedule } = require('./daily-questions');
const { trackingLabel, rewardLabel } = require('./tasks');

const FEATURES = [
  ['economy', 'العملات والمحفظة'], ['levels', 'المستويات وXP'], ['shop', 'المتجر'],
  ['top', 'TOP والمتصدرون'], ['main_panel', 'اللوحة الرئيسية'],
  ['interaction_roles', 'رتب التفاعل'], ['events', 'الفعاليات']
];
const COMMAND_CONTROLS = [
  ['help', 'المساعدة والأوامر', 'مساعدة / أوامر'],
  ['wallet', 'المحفظة', '/wallet و .محفظتي'],
  ['tasks', 'مهامي', '.مهامي'],
  ['invites', 'دعواتي', '.دعواتي'],
  ['invite_link', 'رابط الدعوة', '.رابط'],
  ['top', 'المتصدرون', '/top و TOP'],
  ['stats', 'إحصائيات السيرفر', '.إحصائيات'],
  ['shop', 'المتجر', '/shop و .المتجر'],
  ['orders', 'طلبات المتجر', '.طلبات'],
  ['order_review', 'قبول ورفض الطلبات', '.قبول و .رفض'],
  ['add_coins', 'إضافة العملات', '/add-coins و .اضافة_عملات'],
  ['add_xp', 'إضافة XP', '/add-xp و .اضافة_xp'],
  ['reset_member', 'إعادة ضبط عضو', '/reset-member و .reset'],
  ['set_channel', 'تعيين القنوات', '.تعيين_قناة'],
  ['level_role', 'رتب المستويات', '.رتبة_مستوى'],
  ['color_selection', 'استكمال اختيار اللون', '/color-selection'],
  ['admin_panel', 'لوحة الإدارة', '/admin-panel'],
  ['dm_notifications', 'اشتراك إعلانات الخاص', '/dm-notifications'],
  ['dm_announcement', 'الإعلان الخاص الجماعي', '/dm-announcement'],
  ['dm_announcement_status', 'حالة الإعلان الخاص', '/dm-announcement-status']
];
const CONTENT_KEYS = [
  ['main', 'اللوحة الرئيسية'], ['rules', 'قوانين السيرفر'], ['info', 'معلومات السيرفر'],
  ['notifications', 'رتب التفاعل'], ['system', 'نظام السيرفر'], ['events', 'الفعاليات'],
  ['social', 'منصات التواصل'], ['apply', 'التقديم'], ['news', 'آخر التحديثات']
];

function isAdmin(member, userId, permissionBits, guildId) {
  const owner = (process.env.OWNER_ID || '').trim();
  const perms = permissionBits || (member && member.permissions);
  const administrator = Boolean(perms && typeof perms.has === 'function' && perms.has(PermissionsBitField.Flags.Administrator));
  const resolvedGuildId = guildId || (member && (member.guildId || (member.guild && member.guild.id))) || '';
  const configuredRole = resolvedGuildId ? database.getConfig(resolvedGuildId, 'admin_role_id', '') : '';
  const roleCache = member && member.roles && member.roles.cache;
  const roleIds = roleCache && typeof roleCache.has === 'function'
    ? null
    : (member && Array.isArray(member.roles) ? member.roles : []);
  const hasConfiguredRole = Boolean(configuredRole && (roleCache ? roleCache.has(configuredRole) : roleIds.includes(configuredRole)));
  return Boolean(administrator || hasConfiguredRole || (owner && owner === userId));
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
      { label: '🚀 مضاعف XP للبوستر', value: 'boost_xp', description: 'تحديد رتبة البوست ومضاعف XP — واضح في أعلى القائمة' },
      { label: '❓ سؤال اليوم العشوائي', value: 'daily_questions', description: '110+ سؤالاً، توقيت عشوائي يومياً، وجائزة أول إجابة' },
      { label: '🎯 المهام اليومية والأسبوعية', value: 'tasks', description: 'إنشاء مهام وتحديد الجوائز وعدد الفائزين ومراجعة الإثباتات' },
      { label: '🎟️ مكافآت الدعوات', value: 'invite_rewards', description: 'حدد XP أو عملات لكل عضو يدخل من دعوة مسجلة' },
      { label: '📨 إعلانات الخاص للمشتركين', value: 'broadcast', description: 'إحصائيات الاشتراك وحالة الحملات الخاصة' },
      { label: '📈 العملات والمستويات', value: 'economy', description: 'تعديل XP والتحويل ومتطلبات المستويات وقناة الإشعارات' },
      { label: '🛍️ إدارة المتجر', value: 'shop', description: 'إضافة المنتجات وتعديلها والطلبات' },
      { label: '🏠 الغرف الخاصة', value: 'rooms', description: 'متابعة الغرف ومددها وتجديدها وإغلاقها' },
      { label: '📝 اللوحات والرسائل', value: 'content', description: 'تعديل القوانين والمعلومات والرسائل' },
      { label: '👋 ترحيب الأعضاء الجدد', value: 'join_welcome', description: 'رسالة صغيرة عند دخول عضو جديد وتحديد الروم والإيموجي' },
      { label: '🖼️ بطاقة ترحيب بصورة', value: 'welcome_card', description: 'تصميم ترحيب DOS مع منشن العضو وعدد الأعضاء' },
      { label: '⏯️ تشغيل وإيقاف الأنظمة', value: 'features', description: 'إيقاف أو تشغيل كل نظام' },
      { label: '🎛️ تشغيل وإيقاف كل أمر', value: 'commands', description: 'تفعيل أو تعطيل أوامر البوت واحداً واحداً' },
      { label: '🛠️ أوامر إدارة الأعضاء', value: 'member_tools', description: 'إضافة عملات وXP وإعادة ضبط عضو مع تأكيد' },
      { label: '🔔 رتب التفاعل', value: 'roles', description: 'تحديد رتب الإشعارات' },
      { label: '🏅 رتب المستويات', value: 'level_roles', description: 'ربط رتب بمستويات الكتابة والصوت' },
      { label: '🧾 طلبات المتجر', value: 'sales', description: 'مراجعة طلبات الدفع والتسليم' },
      { label: '🔐 صلاحيات الإدارة وروم اللوحة', value: 'access', description: 'تحديد رتبة الإدارة والقناة التي تظهر فيها لوحة التحكم' }
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
  const subtitle = database.getConfig(guildId, 'shop_subtitle', 'COLORS • CUSTOM ROLES • ITEMS');
  return withSectionImage({ embeds: [adminEmbed('⚙️ إعداد قنوات المتجر', `**قناة عرض المتجر:** ${channelText}\n**تصنيف الغرف الخاصة:** ${categoryText}\n**النص الصغير تحت DOS SHOP:** ${subtitle || 'فارغ'}\n\nاختر القناة والتصنيف، أو عدّل الكتابة داخل صورة المتجر؛ تبقى هذه الصفحة مفتوحة حتى تنتهي من الإعداد.`)], components: [
    new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('admin:set-shop-channel').setPlaceholder('اختر قناة عرض المتجر').setChannelTypes(ChannelType.GuildText)),
    new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('admin:set-room-category').setPlaceholder('اختر تصنيف الغرف الخاصة').setChannelTypes(ChannelType.GuildCategory)),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('admin:shop:subtitle').setLabel('تعديل كتابة صورة المتجر').setEmoji('🖼️').setStyle(ButtonStyle.Primary)),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('admin:shop:back').setLabel('رجوع للمتجر').setStyle(ButtonStyle.Secondary))
  ] }, 'إعداد قنوات المتجر', 'اختر قناة عرض المتجر وتصنيف الغرف الخاصة', 'SHOP');
}
function adminAccessPayload(guildId, notice = '') {
  const roleId = database.getConfig(guildId, 'admin_role_id', '');
  const channelId = database.getConfig(guildId, 'admin_panel_channel_id', '');
  const description = [
    `**رتبة الإدارة:** ${roleId ? `<@&${roleId}>` : 'غير محددة — سيبقى Administrator ومالك البوت مخولين'}`,
    `**روم لوحة التحكم:** ${channelId ? `<#${channelId}>` : 'غير محدد — يمكن فتح اللوحة من أي روم'}`,
    '',
    'أي عضو يحمل رتبة الإدارة المحددة يستطيع استخدام `/admin-panel` وإدارة الإعدادات. تظل صلاحية Administrator ومالك البوت متاحة دائماً.',
    'بعد تحديد روم اللوحة، يجب استخدام `/admin-panel` من ذلك الروم، وتظهر اللوحة علناً لجميع من يستطيع مشاهدة القناة. الأزرار نفسها تبقى محمية للإدارة.',
    ...(notice ? ['', `✅ ${notice}`] : [])
  ].join('\n');
  const roleMenu = new RoleSelectMenuBuilder().setCustomId('admin:access:role').setPlaceholder('اختر رتبة الإدارة').setMinValues(1).setMaxValues(1);
  const channelMenu = new ChannelSelectMenuBuilder().setCustomId('admin:access:channel').setPlaceholder('اختر روم لوحة التحكم').setChannelTypes(ChannelType.GuildText);
  return withSectionImage({ embeds: [adminEmbed('🔐 صلاحيات الإدارة وروم لوحة التحكم', description)], components: [
    new ActionRowBuilder().addComponents(roleMenu),
    new ActionRowBuilder().addComponents(channelMenu),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('admin:access:clear-role').setLabel('إلغاء رتبة الإدارة').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('admin:access:clear-channel').setLabel('إلغاء تحديد الروم').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('admin:home').setLabel('رجوع').setStyle(ButtonStyle.Secondary)
    )
  ] }, 'صلاحيات الإدارة', 'اختر رتبة الإدارة وروم لوحة التحكم', 'ACCESS');
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

function memberWelcomeCardPayload(guildId, notice = '') {
  const enabled = database.getConfig(guildId, 'member_welcome_enabled', '1') !== '0';
  const channelId = database.getConfig(guildId, 'member_welcome_channel_id', '') || database.getConfig(guildId, 'join_welcome_channel_id', '') || database.settings(guildId).welcome_channel_id || '';
  const template = database.getConfig(guildId, 'member_welcome_text', 'أهلاً وسهلاً {user} في **{server}**! 💎\nنتمنى لك وقتاً ممتعاً معنا. أنت العضو رقم **{memberCount}** في مجتمعنا.');
  const preview = String(template).replace(/\{user\}/g, '@NewMember').replace(/\{username\}/g, 'NewMember').replace(/\{server\}/g, 'DOS COMMUNITY').replace(/\{memberCount\}|\{count\}|\{members\}/g, '1,250');
  const description = [
    `**الحالة:** ${enabled ? '🟢 مفعّلة' : '🔴 متوقفة'}`,
    `**قناة الإرسال:** ${channelId ? `<#${channelId}>` : 'الشات العام تلقائياً'}`,
    '',
    '**معاينة النص:**', preview,
    '',
    'المتغيرات: `{user}` منشن العضو، `{username}` اسم العضو، `{server}` اسم السيرفر، `{memberCount}` عدد الأعضاء.',
    'تظهر البطاقة بصورة DOS السماوية، بينما يبقى النص في الرسالة واضحاً وقابلاً للنسخ.',
    ...(notice ? ['', `✅ ${notice}`] : [])
  ].join('\n');
  return withSectionImage({ embeds: [adminEmbed('🖼️ بطاقة ترحيب DOS', description)], components: [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('admin:welcome-card:edit').setLabel('تعديل رسالة الترحيب').setEmoji('✏️').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('admin:welcome-card:toggle').setLabel(enabled ? 'إيقاف البطاقة' : 'تفعيل البطاقة').setEmoji(enabled ? '⏸️' : '▶️').setStyle(enabled ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder().setCustomId('admin:welcome-card:test').setLabel('تجربة البطاقة').setEmoji('🧪').setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('admin:welcome-card:channel').setPlaceholder('اختر قناة ترحيب البطاقة').setChannelTypes(ChannelType.GuildText)),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('admin:welcome-card:clear-channel').setLabel('استخدام الشات العام تلقائياً').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('admin:home').setLabel('رجوع').setStyle(ButtonStyle.Secondary)
    )
  ] }, 'بطاقة ترحيب DOS', 'صورة ترحيب جديدة قابلة للتعديل مع المنشن وعدد الأعضاء', 'WELCOME');
}

function boosterXpPayload(guildId, notice = '') {
  const roleId = database.getConfig(guildId, 'booster_role_id', '');
  const multiplier = database.getConfig(guildId, 'booster_xp_multiplier', '1.5');
  const description = [
    `**مضاعف XP الحالي:** ×${multiplier}`,
    `**رتبة البوست:** ${roleId ? `<@&${roleId}>` : 'غير محددة — يُحتسب لأي عضو لديه حالة Server Boost نشطة'}`,
    '',
    'يجب أن يكون العضو يقوم ببوست فعلياً للسيرفر (Server Booster). وعند تحديد رتبة، يجب أن يحملها أيضاً حتى يحصل على المضاعف.',
    'تُطبّق النسبة على XP الرسائل والصوت، ويُحسب تحويل DOS Coin من XP بعد المضاعفة. لا تتغير مكافآت XP الإدارية اليدوية.',
    ...(notice ? ['', `✅ ${notice}`] : [])
  ].join('\n');
  return withSectionImage({ embeds: [adminEmbed('🚀 مضاعف XP للبوستر', description)], components: [
    new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('admin:boost-xp:role').setPlaceholder('اختيار رتبة البوست').setMinValues(1).setMaxValues(1)),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('admin:boost-xp:edit').setLabel('تعديل نسبة XP').setEmoji('⚙️').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('admin:boost-xp:clear-role').setLabel('إلغاء شرط الرتبة').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('admin:home').setLabel('رجوع').setStyle(ButtonStyle.Secondary)
    )
  ] }, 'مكافأة بوست السيرفر', 'زيادة خبرة الأعضاء الداعمين للسيرفر', 'BOOST');
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
function commandControlsPayload(guildId, selectedKey = 'wallet', notice = '') {
  const selected = COMMAND_CONTROLS.find(([key]) => key === selectedKey) || COMMAND_CONTROLS[0];
  const enabled = database.featureEnabled(guildId, `command:${selected[0]}`);
  const menu = new StringSelectMenuBuilder().setCustomId('admin:commands:select')
    .setPlaceholder('اختر الأمر الذي تريد تشغيله أو إيقافه')
    .addOptions(COMMAND_CONTROLS.map(([key,label,usage]) => ({
      label: `${database.featureEnabled(guildId, `command:${key}`) ? '🟢' : '🔴'} ${label}`.slice(0,100),
      value: key,
      description: usage.slice(0,100),
      default: key === selected[0]
    })));
  const description = [
    `**الأمر المحدد:** ${selected[1]}`,
    `**طريقة الاستخدام:** ${selected[2]}`,
    `**الحالة الحالية:** ${enabled ? '🟢 يعمل' : '🔴 متوقف'}`,
    '',
    'اختر أي أمر من القائمة ثم اضغط الزر لتشغيله أو إيقافه. ينطبق المفتاح على كل اختصارات الأمر، بما فيها أوامر Slash وPrefix المرتبطة به.',
    'الرسائل والأزرار التفاعلية الداخلية لا تتوقف إلا إذا كان الأمر الأساسي الذي يفتحها متوقفاً.',
    ...(notice ? ['', `✅ ${notice}`] : [])
  ].join('\n');
  return withSectionImage({ embeds: [adminEmbed('🎛️ تشغيل وإيقاف الأوامر', description)], components: [
    new ActionRowBuilder().addComponents(menu),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`admin:command-toggle:${selected[0]}`).setLabel(enabled ? 'إيقاف الأمر المحدد' : 'تشغيل الأمر المحدد').setEmoji(enabled ? '⏸️' : '▶️').setStyle(enabled ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder().setCustomId('admin:home').setLabel('رجوع').setStyle(ButtonStyle.Secondary)
    )
  ] }, 'تشغيل وإيقاف الأوامر', 'تحكم مستقل بكل أمر من أوامر DOS COMMUNITY', 'COMMANDS');
}
function broadcastAdminPayload(guildId, notice = '') {
  const subscribers = database.dmAnnouncementSubscriberCount(guildId);
  const latest = database.latestDmBroadcastJob(guildId);
  const status = latest
    ? `**آخر حملة:** #${latest.id} • ${latest.status === 'running' ? 'قيد الإرسال' : latest.status === 'completed' ? 'مكتملة' : 'متوقفة'}\n**المرسل:** ${Number(latest.sent_count).toLocaleString('en-US')}\n**فشل:** ${Number(latest.failed_count).toLocaleString('en-US')}\n**تخطي:** ${Number(latest.skipped_count).toLocaleString('en-US')} من ${Number(latest.total_count).toLocaleString('en-US')}`
    : 'لا توجد حملات سابقة.';
  const description = [
    `**الأعضاء المشتركون حالياً:** ${subscribers.toLocaleString('en-US')}`,
    status,
    '',
    'العضو يختار الاشتراك بنفسه عبر `/dm-notifications enabled:true`، ويمكنه إلغاء الاشتراك في أي وقت. الأمر `/dm-announcement` يعرض معاينة ويطلب تأكيداً قبل بدء الإرسال.',
    'يُرسل البوت تدريجياً لتجنب ضغط Discord، ويتخطى من غادر السيرفر أو ألغى الاشتراك، ويُسجل من أغلق الخاص كفشل.',
    ...(notice ? ['', `✅ ${notice}`] : [])
  ].join('\n');
  return withSectionImage({ embeds: [adminEmbed('📨 إعلانات DOS الخاصة', description)], components: [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('admin:broadcast:status').setLabel('تحديث الحالة').setEmoji('🔄').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('admin:home').setLabel('رجوع').setStyle(ButtonStyle.Secondary)
    )
  ] }, 'إعلانات الخاص', 'حملات خاصة للأعضاء الذين اشتركوا باستقبالها', 'DM');
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
function dailyQuestionAdminPayload(guildId, notice = '') {
  const state = questionSettingsPayload(guildId);
  const nextText = state.nextAt ? `<t:${state.nextAt}:F> (<t:${state.nextAt}:R>)` : 'سيحدد البوت أول موعد عشوائي بعد التفعيل';
  const description = [
    `**الحالة:** ${state.enabled ? '🟢 مفعّل' : '🔴 متوقف'}`,
    `**القناة:** ${state.channel ? `<#${state.channel}>` : 'غير محددة'}`,
    `**الجائزة:** ${Number(state.reward).toLocaleString('en-US')} DOS Coin لأول إجابة صحيحة`,
    `**بنك الأسئلة:** ${state.questionCount} سؤالاً عشوائياً`,
    `**موعد السؤال القادم:** ${nextText}`,
    `**السؤال الحالي:** ${state.open ? state.open.question_text : 'لا يوجد سؤال مفتوح حالياً'}`,
    `**سؤال مخصص للمرة القادمة:** ${database.getConfig(guildId, 'daily_question_custom_question', '') || 'لا يوجد — سيختار البوت من بنك الأسئلة'}`,
    '',
    'يُرسل سؤال واحد كل يوم في وقت عشوائي مختلف بين 10 صباحاً و10 مساءً بتوقيت السيرفر (TZ). أول إجابة مطابقة صحيحة تحصل على الجائزة مرة واحدة فقط. يمكنك تعديل السؤال والإجابة وعناوين ورسائل السؤال والفوز.',
    ...(notice ? ['', `✅ ${notice}`] : [])
  ].join('\n');
  return withSectionImage({ embeds: [adminEmbed('❓ سؤال DOS اليومي', description)], components: [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('admin:daily-question:toggle').setLabel(state.enabled ? 'إيقاف الأسئلة' : 'تفعيل الأسئلة').setStyle(state.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder().setCustomId('admin:daily-question:reward').setLabel('تعديل جائزة السؤال').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('admin:daily-question:now').setLabel('إرسال سؤال الآن').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('admin:daily-question:content-edit').setLabel('تعديل نص السؤال والإجابة').setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('admin:daily-question:channel').setPlaceholder('اختر قناة سؤال اليوم').setChannelTypes(ChannelType.GuildText)),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('admin:daily-question:clear-channel').setLabel('إلغاء القناة').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('admin:home').setLabel('رجوع').setStyle(ButtonStyle.Secondary))
  ] }, 'سؤال DOS اليومي', '110+ سؤالاً • توقيت عشوائي يومياً • أول إجابة تفوز', 'QUIZ');
}
function inviteRewardsPayload(guildId, notice = '') {
  const type = database.getConfig(guildId, 'invite_reward_type', 'coins');
  const amount = Number(database.getConfig(guildId, 'invite_reward_amount', '0')) || 0;
  const description = [
    `**المكافأة الحالية:** ${amount > 0 ? `${amount.toLocaleString('en-US')} ${type === 'xp' ? 'XP' : 'DOS Coin'}` : 'متوقفة (القيمة صفر)'}`,
    '**طريقة الاحتساب:** تُصرف مرة واحدة فقط عندما ينجح البوت في تحديد رابط الدعوة المستخدم وتسجيل العضو الجديد.',
    'لا تُمنح مكافأة إذا كان مصدر الدعوة غير معروف أو كانت الدعوة ذاتية.',
    ...(notice ? ['', `✅ ${notice}`] : [])
  ].join('\n');
  return withSectionImage({ embeds: [adminEmbed('🎟️ مكافآت الدعوات', description)], components: [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('admin:invite-reward:edit').setLabel('تعديل مكافأة الدعوة').setEmoji('⚙️').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('admin:home').setLabel('رجوع').setStyle(ButtonStyle.Secondary)
    )
  ] }, 'مكافآت الدعوات', 'حدد مكافأة XP أو DOS Coin لكل عضو جديد تتم معرفة صاحبه من رابط الدعوة', 'INVITES');
}
function tasksAdminPayload(guildId, notice = '') {
  const tasks = database.listGuildTasks(guildId, false);
  const claims = database.pendingTaskClaims(guildId);
  const lines = tasks.slice(0, 12).map((task) => `**#${task.id} ${task.title}** — ${task.enabled ? '🟢 مفعّلة' : '🔴 متوقفة'} — ${task.period === 'weekly' ? 'أسبوعية' : 'يومية'} — ${trackingLabel(task.tracking_type)} — ${rewardLabel(task)} — أول ${task.max_winners} فائزين`);
  const menu = tasks.length ? new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('admin:tasks:select').setPlaceholder('اختر مهمة لتعديلها')
    .addOptions(tasks.slice(0, 25).map((task) => ({ label: `#${task.id} ${task.title}`.slice(0, 100), value: String(task.id), description: `${task.enabled ? 'مفعلة' : 'متوقفة'} • ${rewardLabel(task)}`.slice(0, 100) })))) : null;
  const rows = [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('admin:tasks:add').setLabel('إنشاء مهمة').setEmoji('➕').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('admin:tasks:claims').setLabel(`مراجعة الإثباتات (${claims.length})`).setEmoji('🧾').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('admin:tasks:message').setLabel('تعديل رسالة الفوز بالمهمة').setEmoji('✏️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('admin:home').setLabel('رجوع').setStyle(ButtonStyle.Secondary)
  )];
  if (menu) rows.push(menu);
  return withSectionImage({ embeds: [adminEmbed('🎯 المهام اليومية والأسبوعية', (lines.join('\n') || 'لا توجد مهام بعد.') + '\n\n**الأنواع:** XP تلقائي، نشاط رسائل في روم تحدده، أو مهمة يدوية بإثبات وموافقة الإدارة.\n**المقاعد:** تُمنح الجوائز لأول عدد تحدده من المكتملين.' + (notice ? `\n\n✅ ${notice}` : ''))], components: rows }, 'إدارة المهام', 'إنشاء المهام وتتبع التقدم وتحديد الفائزين والجوائز', 'TASKS');
}
function taskDetailsPayload(guildId, taskId, notice = '') {
  const task = database.getGuildTask(guildId, taskId);
  if (!task) return tasksAdminPayload(guildId, 'لم تعد المهمة موجودة.');
  const claims = database.pendingTaskClaims(guildId, taskId);
  const description = `**المهمة:** ${task.title}\n**الوصف:** ${task.description || '—'}\n**الدورية:** ${task.period === 'weekly' ? 'أسبوعية' : 'يومية'}\n**طريقة الإكمال:** ${trackingLabel(task.tracking_type)}\n**المطلوب:** ${task.threshold}\n**قناة التتبع:** ${task.channel_id ? `<#${task.channel_id}>` : 'غير محددة'}\n**الجائزة:** ${rewardLabel(task)}\n**عدد الفائزين:** ${task.max_winners}\n**الحالة:** ${task.enabled ? 'مفعّلة' : 'متوقفة'}\n**إثباتات تنتظر المراجعة:** ${claims.length}${notice ? `\n\n✅ ${notice}` : ''}`;
  return withSectionImage({ embeds: [adminEmbed(`🎯 المهمة #${task.id}`, description)], components: [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`admin:task:edit:${task.id}`).setLabel('تعديل المهمة والجائزة').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`admin:task:toggle:${task.id}`).setLabel(task.enabled ? 'إيقاف المهمة' : 'تفعيل المهمة').setStyle(task.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`admin:task:winners:${task.id}`).setLabel('تعديل عدد الفائزين').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`admin:task:delete:${task.id}`).setLabel('حذف المهمة').setStyle(ButtonStyle.Danger)
    ),
    ...(task.tracking_type === 'messages' ? [new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId(`admin:task:channel:${task.id}`).setPlaceholder('اختر روم احتساب نشاط المهمة').setChannelTypes(ChannelType.GuildText))] : []),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('admin:tasks:claims').setLabel('مراجعة الإثباتات').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('admin:tasks:back').setLabel('رجوع للمهام').setStyle(ButtonStyle.Secondary))
  ] }, 'إعدادات المهمة', 'تعديل حالة المهمة وقواعد الفوز', 'TASK');
}
function taskClaimsPayload(guildId, notice = '') {
  const claims = database.pendingTaskClaims(guildId);
  const lines = claims.slice(0, 10).map((claim) => `**#${claim.task_id} ${claim.title}** — <@${claim.user_id}> — <t:${claim.completed_at}:R>\n${claim.proof || 'بدون وصف'}`);
  const components = [];
  if (claims.length) {
    const options = claims.slice(0, 25).map((claim) => ({
      label: `#${claim.task_id} ${claim.title}`.slice(0, 100),
      value: `${claim.task_id}|${claim.user_id}|${claim.period_key}`,
      description: `عضو ${claim.user_id} • ${claim.proof || 'إثبات'}`.slice(0, 100)
    }));
    components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('admin:tasks:claim-select').setPlaceholder('اختر إثباتاً لمراجعته').addOptions(options)));
  }
  components.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('admin:tasks:back').setLabel('رجوع للمهام').setStyle(ButtonStyle.Secondary)));
  return withSectionImage({ embeds: [adminEmbed('🧾 مراجعة إثباتات المهام', (lines.join('\n\n') || 'لا توجد إثباتات معلقة حالياً.') + (notice ? `\n\n✅ ${notice}` : ''))], components }, 'مراجعة إثباتات المهام', 'تُراجع الإثباتات حسب ترتيب وصولها', 'CLAIMS');
}
function taskClaimReviewPayload(guildId, taskId, userId, periodKey) {
  const claim = database.pendingTaskClaims(guildId, taskId).find((row) => row.user_id === userId && row.period_key === periodKey);
  if (!claim) return taskClaimsPayload(guildId, 'لم يعد هذا الإثبات معلقاً.');
  const value = `**المهمة:** ${claim.title}\n**العضو:** <@${userId}>\n**وصل الإثبات:** <t:${claim.completed_at}:F>\n**الإثبات:**\n${claim.proof || 'بدون وصف'}\n\n**الجائزة:** ${rewardLabel(claim)} • أول ${claim.max_winners} فائزين`;
  return withSectionImage({ embeds: [adminEmbed('مراجعة إثبات المهمة', value)], components: [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`admin:task-claim:approve:${taskId}:${userId}:${periodKey}`).setLabel('قبول ومنح الجائزة').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`admin:task-claim:reject:${taskId}:${userId}:${periodKey}`).setLabel('رفض الإثبات').setStyle(ButtonStyle.Danger)
    ),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('admin:tasks:claims').setLabel('رجوع للإثباتات').setStyle(ButtonStyle.Secondary))
  ] }, 'مراجعة إثبات مهمة', 'قبول الإثبات أو رفضه', 'REVIEW');
}
function taskCreateModal(task = null) {
  const editing = Boolean(task);
  const modal = new ModalBuilder()
    .setCustomId(editing ? `admin:task:edit-save:${task.id}` : 'admin:tasks:create-save')
    .setTitle(editing ? `تعديل المهمة #${task.id}` : 'إنشاء مهمة DOS');
  const field = (id, label, value, style = TextInputStyle.Short, placeholder = '') => {
    const input = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(true).setMaxLength(id === 'description' ? 500 : 100).setPlaceholder(placeholder);
    if (value !== undefined && value !== null) input.setValue(String(value));
    return new ActionRowBuilder().addComponents(input);
  };
  modal.addComponents(
    field('title', 'اسم المهمة', editing ? task.title : '', TextInputStyle.Short, 'اسم المهمة'),
    field('description', 'وصف المهمة', editing ? task.description : '', TextInputStyle.Paragraph, 'وصف المهمة'),
    field('period', 'الدورية: daily أو weekly', editing ? task.period : 'daily'),
    field('tracking', 'التتبع: xp:5000 أو messages:3 أو manual:1', editing ? `${task.tracking_type}:${task.threshold}` : '', TextInputStyle.Short, 'xp:5000 / messages:3 / manual:1'),
    field('reward', 'الجائزة: coins:100 أو xp:500', editing ? `${task.reward_type}:${task.reward_amount}` : '', TextInputStyle.Short, 'coins:100')
  );
  return modal;
}
function inviteRewardModal(guildId) {
  const type = database.getConfig(guildId, 'invite_reward_type', 'coins');
  const amount = database.getConfig(guildId, 'invite_reward_amount', '0');
  return new ModalBuilder().setCustomId('admin:invite-reward:save').setTitle('تعديل مكافأة الدعوة')
    .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reward').setLabel('اكتب coins:10 أو xp:250 أو 0 للإيقاف').setStyle(TextInputStyle.Short).setRequired(true).setValue(Number(amount) > 0 ? `${type}:${amount}` : '0')));
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
  if (!isAdmin(interaction.member, interaction.user.id, interaction.memberPermissions, interaction.guildId)) return interaction.reply({ content: 'هذه اللوحة للإدارة فقط.', flags: MessageFlags.Ephemeral });

  if (parts[1] === 'home') return interaction.update(await homePayload(interaction.guild));
  if (parts[1] === 'nav' && interaction.isStringSelectMenu()) {
    const section = interaction.values[0];
    const payload = section === 'shop' ? await shopAdminPayload(interaction.guildId)
      : section === 'rooms' ? roomsPayload(interaction.guildId)
      : section === 'content' ? contentAdminPayload(interaction.guildId)
      : section === 'join_welcome' ? joinWelcomePayload(interaction.guildId)
      : section === 'welcome_card' ? memberWelcomeCardPayload(interaction.guildId)
      : section === 'boost_xp' ? boosterXpPayload(interaction.guildId)
      : section === 'daily_questions' ? dailyQuestionAdminPayload(interaction.guildId)
      : section === 'tasks' ? tasksAdminPayload(interaction.guildId)
      : section === 'invite_rewards' ? inviteRewardsPayload(interaction.guildId)
      : section === 'broadcast' ? broadcastAdminPayload(interaction.guildId)
      : section === 'commands' ? commandControlsPayload(interaction.guildId)
      : section === 'features' ? featuresPayload(interaction.guildId)
      : section === 'economy' ? economyPayload(interaction.guildId)
      : section === 'member_tools' ? memberToolsPayload()
      : section === 'access' ? adminAccessPayload(interaction.guildId)
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
  if (parts[1] === 'welcome-card' && parts[2] === 'edit') {
    const current = database.getConfig(interaction.guildId, 'member_welcome_text', 'أهلاً وسهلاً {user} في **{server}**! 💎\nنتمنى لك وقتاً ممتعاً معنا. أنت العضو رقم **{memberCount}** في مجتمعنا.');
    const modal = new ModalBuilder().setCustomId('admin:welcome-card:save').setTitle('تعديل رسالة ترحيب DOS')
      .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('template').setLabel('رسالة الترحيب — استخدم المتغيرات المعروضة').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1800).setValue(String(current).slice(0,1800))));
    return interaction.showModal(modal);
  }
  if (parts[1] === 'welcome-card' && parts[2] === 'toggle') {
    const enabled = database.getConfig(interaction.guildId, 'member_welcome_enabled', '1') !== '0';
    database.setConfig(interaction.guildId, 'member_welcome_enabled', enabled ? '0' : '1', interaction.user.id);
    database.logAdmin(interaction.guildId, interaction.user.id, 'member_welcome_toggle', String(!enabled));
    return interaction.update(memberWelcomeCardPayload(interaction.guildId, enabled ? 'تم إيقاف بطاقة الترحيب.' : 'تم تفعيل بطاقة الترحيب.'));
  }
  if (parts[1] === 'welcome-card' && parts[2] === 'channel' && interaction.isChannelSelectMenu()) {
    const channelId = interaction.values[0];
    database.setConfig(interaction.guildId, 'member_welcome_channel_id', channelId, interaction.user.id);
    database.logAdmin(interaction.guildId, interaction.user.id, 'member_welcome_channel', channelId);
    return interaction.update(memberWelcomeCardPayload(interaction.guildId, `تم تحديد قناة الترحيب: <#${channelId}>.`));
  }
  if (parts[1] === 'welcome-card' && parts[2] === 'clear-channel') {
    database.setConfig(interaction.guildId, 'member_welcome_channel_id', '', interaction.user.id);
    database.logAdmin(interaction.guildId, interaction.user.id, 'member_welcome_channel', 'auto');
    return interaction.update(memberWelcomeCardPayload(interaction.guildId, 'سيستخدم البوت قناة الشات العام تلقائياً.'));
  }
  if (parts[1] === 'welcome-card' && parts[2] === 'test') {
    const { sendMemberWelcomeCard } = require('./member-welcome');
    try {
      const testMember = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      const message = testMember ? await sendMemberWelcomeCard(testMember, { test: true }) : null;
      if (!message) return interaction.reply({ content: 'تعذر إرسال التجربة. تحقق من القناة وصلاحيات View Channel وSend Messages وAttach Files.', flags: MessageFlags.Ephemeral });
      return interaction.reply({ content: `✅ تم إرسال بطاقة الترحيب التجريبية في ${message.channel}.`, flags: MessageFlags.Ephemeral });
    } catch (error) {
      console.error('[ADMIN] Member welcome card test failed:', error);
      return interaction.reply({ content: 'تعذر إرسال التجربة: ' + error.message, flags: MessageFlags.Ephemeral });
    }
  }
  if (parts[1] === 'boost-xp' && parts[2] === 'role' && interaction.isRoleSelectMenu()) {
    const role = interaction.roles.first();
    if (!role || role.id === interaction.guildId) return interaction.reply({ content: 'اختر رتبة بوست عادية، ولا تختَر @everyone.', flags: MessageFlags.Ephemeral });
    database.setConfig(interaction.guildId, 'booster_role_id', role.id, interaction.user.id);
    database.logAdmin(interaction.guildId, interaction.user.id, 'booster_role_set', role.id);
    return interaction.update(boosterXpPayload(interaction.guildId, `تم تعيين ${role} كرتبة البوست المطلوبة.`));
  }
  if (parts[1] === 'boost-xp' && parts[2] === 'clear-role') {
    database.setConfig(interaction.guildId, 'booster_role_id', '', interaction.user.id);
    database.logAdmin(interaction.guildId, interaction.user.id, 'booster_role_clear', '');
    return interaction.update(boosterXpPayload(interaction.guildId, 'تم إلغاء شرط الرتبة؛ سيكفي وجود Server Boost نشط.'));
  }
  if (parts[1] === 'boost-xp' && parts[2] === 'edit') {
    const current = database.getConfig(interaction.guildId, 'booster_xp_multiplier', '1.5');
    const modal = new ModalBuilder().setCustomId('admin:boost-xp:save').setTitle('تعديل مضاعف XP للبوستر')
      .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('multiplier').setLabel('المضاعف (مثال 1.5 أو 2)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(5).setValue(String(current))));
    return interaction.showModal(modal);
  }

  if (parts[1] === 'daily-question' && parts[2] === 'toggle') {
    const enabled = database.getConfig(interaction.guildId, 'daily_questions_enabled', '0') !== '1';
    database.setConfig(interaction.guildId, 'daily_questions_enabled', enabled ? '1' : '0', interaction.user.id);
    if (enabled && !Number(database.getConfig(interaction.guildId, 'daily_question_next_at', '0'))) database.setConfig(interaction.guildId, 'daily_question_next_at', nextRandomSchedule(Date.now()), interaction.user.id);
    database.logAdmin(interaction.guildId, interaction.user.id, 'daily_question_toggle', String(enabled));
    return interaction.update(dailyQuestionAdminPayload(interaction.guildId, enabled ? 'تم تفعيل السؤال اليومي.' : 'تم إيقاف السؤال اليومي.'));
  }
  if (parts[1] === 'daily-question' && parts[2] === 'channel' && interaction.isChannelSelectMenu()) {
    const channelId = interaction.values[0];
    database.setConfig(interaction.guildId, 'daily_question_channel_id', channelId, interaction.user.id);
    database.logAdmin(interaction.guildId, interaction.user.id, 'daily_question_channel', channelId);
    return interaction.update(dailyQuestionAdminPayload(interaction.guildId, `تم اختيار ${interaction.guild.channels.cache.get(channelId) || `<#${channelId}>`}.`));
  }
  if (parts[1] === 'daily-question' && parts[2] === 'clear-channel') {
    database.setConfig(interaction.guildId, 'daily_question_channel_id', '', interaction.user.id);
    return interaction.update(dailyQuestionAdminPayload(interaction.guildId, 'تم إلغاء قناة السؤال.'));
  }
  if (parts[1] === 'daily-question' && parts[2] === 'reward') {
    const current = database.getConfig(interaction.guildId, 'daily_question_reward', '1');
    const modal = new ModalBuilder().setCustomId('admin:daily-question:reward-save').setTitle('تعديل جائزة سؤال اليوم')
      .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('amount').setLabel('عدد DOS Coin للفائز').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(current))));
    return interaction.showModal(modal);
  }
  if (parts[1] === 'daily-question' && parts[2] === 'content-edit') {
    const question = database.getConfig(interaction.guildId, 'daily_question_custom_question', '');
    const answer = database.getConfig(interaction.guildId, 'daily_question_custom_answer', '');
    const title = database.getConfig(interaction.guildId, 'daily_question_title', '💎 سؤال DOS اليومي');
    const body = database.getConfig(interaction.guildId, 'daily_question_message_template', '**{question}**\n\n🏆 أول إجابة صحيحة تحصل على **{reward} DOS Coin**.\nاكتب إجابتك مباشرة في هذه القناة.');
    const winner = database.getConfig(interaction.guildId, 'daily_question_winner_template', 'مبروك {user}! كنت أول من أجاب إجابة صحيحة.\n\nحصلت على **{reward} DOS Coin** 💎');
    const questionInput = new TextInputBuilder().setCustomId('question').setLabel('سؤال مخصص للمرة القادمة (فارغ = عشوائي)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(900);
    const answerInput = new TextInputBuilder().setCustomId('answer').setLabel('إجابة السؤال المخصص (مع السؤال فقط)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(180);
    // Discord modals reject an empty default value; leave optional fields unset
    // so admins can deliberately clear the custom question and return to random mode.
    if (String(question).trim()) questionInput.setValue(String(question).slice(0,900));
    if (String(answer).trim()) answerInput.setValue(String(answer).slice(0,180));
    const modal = new ModalBuilder().setCustomId('admin:daily-question:content-save').setTitle('تعديل نص سؤال اليوم')
      .addComponents(
        new ActionRowBuilder().addComponents(questionInput),
        new ActionRowBuilder().addComponents(answerInput),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('title').setLabel('عنوان رسالة السؤال').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(256).setValue(String(title).slice(0,256))),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('body').setLabel('نص السؤال — {question} و{reward}').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000).setValue(String(body).slice(0,1000))),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('winner').setLabel('رسالة الفائز — {user} و{reward}').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(900).setValue(String(winner).slice(0,900)))
      );
    return interaction.showModal(modal);
  }
  if (parts[1] === 'daily-question' && parts[2] === 'now') {
    if (database.getConfig(interaction.guildId, 'daily_questions_enabled', '0') !== '1') return interaction.reply({ content: 'فعّل الأسئلة اليومية أولاً.', flags: MessageFlags.Ephemeral });
    if (!database.getConfig(interaction.guildId, 'daily_question_channel_id', '')) return interaction.reply({ content: 'حدد قناة السؤال أولاً.', flags: MessageFlags.Ephemeral });
    database.setConfig(interaction.guildId, 'daily_question_next_at', Math.floor(Date.now()/1000), interaction.user.id);
    const { tickDailyQuestions } = require('./daily-questions');
    await tickDailyQuestions(client);
    return interaction.update(dailyQuestionAdminPayload(interaction.guildId, 'تم إرسال سؤال فوري إذا لم يكن هناك سؤال مفتوح.'));
  }
  if (parts[1] === 'invite-reward' && parts[2] === 'edit') return interaction.showModal(inviteRewardModal(interaction.guildId));
  if (parts[1] === 'tasks' && parts[2] === 'add') return interaction.showModal(taskCreateModal());
  if (parts[1] === 'tasks' && parts[2] === 'message') {
    const current = database.getConfig(interaction.guildId, 'task_reward_message_template', '🏆 <@{user}> أكمل المهمة **{task}** وكان من الفائزين! حصل على **{reward} {unit}**.');
    const modal = new ModalBuilder().setCustomId('admin:tasks:message-save').setTitle('تعديل رسالة الفوز بالمهمة')
      .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('template').setLabel('الرسالة — {user} {task} {reward} {unit}').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1700).setValue(String(current).slice(0,1700))));
    return interaction.showModal(modal);
  }
  if (parts[1] === 'tasks' && parts[2] === 'back') return interaction.update(tasksAdminPayload(interaction.guildId));
  if (parts[1] === 'tasks' && parts[2] === 'claims') return interaction.update(taskClaimsPayload(interaction.guildId));
  if (parts[1] === 'tasks' && parts[2] === 'select' && interaction.isStringSelectMenu()) return interaction.update(taskDetailsPayload(interaction.guildId, Number(interaction.values[0])));
  if (parts[1] === 'tasks' && parts[2] === 'claim-select' && interaction.isStringSelectMenu()) {
    const [taskId,userId,periodKey] = interaction.values[0].split('|');
    return interaction.update(taskClaimReviewPayload(interaction.guildId, Number(taskId), userId, periodKey));
  }
  if (parts[1] === 'task' && parts[2] === 'edit') {
    const task = database.getGuildTask(interaction.guildId, Number(parts[3]));
    if (!task) return interaction.reply({ content: 'المهمة غير موجودة.', flags: MessageFlags.Ephemeral });
    return interaction.showModal(taskCreateModal(task));
  }
  if (parts[1] === 'task' && parts[2] === 'toggle') {
    const taskId = Number(parts[3]); const task = database.getGuildTask(interaction.guildId,taskId);
    if (!task) return interaction.reply({ content: 'المهمة غير موجودة.', flags: MessageFlags.Ephemeral });
    database.updateGuildTask(interaction.guildId,taskId,{ enabled: !task.enabled });
    database.logAdmin(interaction.guildId,interaction.user.id,'task_toggle',`${taskId}=${!task.enabled}`);
    return interaction.update(taskDetailsPayload(interaction.guildId,taskId,task.enabled ? 'تم إيقاف المهمة.' : 'تم تفعيل المهمة.'));
  }
  if (parts[1] === 'task' && parts[2] === 'delete') {
    const taskId = Number(parts[3]);
    database.deleteGuildTask(interaction.guildId,taskId);
    database.logAdmin(interaction.guildId,interaction.user.id,'task_delete',String(taskId));
    return interaction.update(tasksAdminPayload(interaction.guildId,'تم حذف المهمة وسجل تقدمها فقط.'));
  }
  if (parts[1] === 'task' && parts[2] === 'winners') {
    const taskId = Number(parts[3]);
    const task = database.getGuildTask(interaction.guildId,taskId);
    if (!task) return interaction.reply({ content: 'المهمة غير موجودة.', flags: MessageFlags.Ephemeral });
    const modal = new ModalBuilder().setCustomId(`admin:task:winners-save:${taskId}`).setTitle('تعديل عدد الفائزين')
      .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('winners').setLabel('عدد الفائزين (1 إلى 25)').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(task.max_winners))));
    return interaction.showModal(modal);
  }
  if (parts[1] === 'task' && parts[2] === 'channel' && interaction.isChannelSelectMenu()) {
    const taskId = Number(parts[3]); const channelId = interaction.values[0];
    database.updateGuildTask(interaction.guildId,taskId,{ channel_id: channelId });
    database.logAdmin(interaction.guildId,interaction.user.id,'task_channel',`${taskId}=${channelId}`);
    return interaction.update(taskDetailsPayload(interaction.guildId,taskId,`تم تعيين قناة التتبع <#${channelId}>.`));
  }
  if (parts[1] === 'task-claim' && ['approve','reject'].includes(parts[2])) {
    const taskId = Number(parts[3]); const userId = parts[4]; const periodKey = parts[5];
    const result = database.reviewTaskClaim(interaction.guildId,taskId,userId,periodKey,parts[2] === 'approve');
    if (result.error === 'not_first') return interaction.reply({ content: 'يجب مراجعة الإثبات الأقدم أولاً حتى يبقى ترتيب الفائزين عادلاً.', flags: MessageFlags.Ephemeral });
    if (result.error === 'full') return interaction.reply({ content: 'اكتمل عدد الفائزين المحدد لهذه المهمة.', flags: MessageFlags.Ephemeral });
    if (result.error) return interaction.reply({ content: 'لم يعد هذا الإثبات متاحاً للمراجعة.', flags: MessageFlags.Ephemeral });
    if (result.approved) {
      const { grantTaskReward, publishTaskRewardMessage } = require('./tasks');
      grantTaskReward(interaction.guildId,userId,result.rewardType,result.rewardAmount);
      const channelId = result.task.channel_id || database.getConfig(interaction.guildId,'tasks_announce_channel_id','');
      const channel = channelId ? await interaction.guild.channels.fetch(channelId).catch(() => null) : interaction.guild.systemChannel;
      await publishTaskRewardMessage(channel,userId,result.task,result.rewardAmount,result.rewardType,interaction.guildId);
    }
    database.logAdmin(interaction.guildId,interaction.user.id,'task_claim_review',`${taskId};${userId};${parts[2]}`);
    return interaction.update(taskClaimsPayload(interaction.guildId,result.approved ? 'تم قبول الإثبات وصرف الجائزة.' : 'تم رفض الإثبات.'));
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
  if (parts[1] === 'commands' && parts[2] === 'select' && interaction.isStringSelectMenu()) {
    return interaction.update(commandControlsPayload(interaction.guildId, interaction.values[0]));
  }
  if (parts[1] === 'command-toggle') {
    const key = parts[2];
    const command = COMMAND_CONTROLS.find(([itemKey]) => itemKey === key);
    if (!command) return interaction.reply({ content: 'الأمر غير معروف.', flags: MessageFlags.Ephemeral });
    const enabled = !database.featureEnabled(interaction.guildId, `command:${key}`);
    database.setFeature(interaction.guildId, `command:${key}`, enabled, interaction.user.id);
    database.logAdmin(interaction.guildId, interaction.user.id, 'command_toggle', `${key}=${enabled}`);
    return interaction.update(commandControlsPayload(interaction.guildId, key, enabled ? 'تم تشغيل الأمر.' : 'تم إيقاف الأمر.'));
  }
  if (parts[1] === 'broadcast' && parts[2] === 'status') {
    return interaction.update(broadcastAdminPayload(interaction.guildId, 'تم تحديث حالة حملات الخاص.'));
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
  if (parts[1] === 'shop' && parts[2] === 'subtitle') {
    const current = database.getConfig(interaction.guildId, 'shop_subtitle', 'COLORS • CUSTOM ROLES • ITEMS');
    const subtitleInput = new TextInputBuilder().setCustomId('subtitle').setLabel('النص الصغير أسفل DOS SHOP').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(90).setPlaceholder('COLORS • CUSTOM ROLES • ITEMS');
    if (String(current || '').trim()) subtitleInput.setValue(String(current).slice(0, 90));
    const modal = new ModalBuilder().setCustomId('admin:shop:subtitle-save').setTitle('تعديل كتابة صورة DOS SHOP')
      .addComponents(new ActionRowBuilder().addComponents(subtitleInput));
    return interaction.showModal(modal);
  }
  if (parts[1] === 'access' && parts[2] === 'role' && interaction.isRoleSelectMenu()) {
    const role = interaction.roles.first();
    if (!role || role.id === interaction.guildId || role.managed) return interaction.reply({ content: 'اختر رتبة عادية غير مُدارة من Discord.', flags: MessageFlags.Ephemeral });
    database.setConfig(interaction.guildId, 'admin_role_id', role.id, interaction.user.id);
    database.logAdmin(interaction.guildId, interaction.user.id, 'admin_role_set', role.id);
    return interaction.update(adminAccessPayload(interaction.guildId, `تم تعيين ${role} كرتبة إدارة.`));
  }
  if (parts[1] === 'access' && parts[2] === 'channel' && interaction.isChannelSelectMenu()) {
    const channel = await interaction.guild.channels.fetch(interaction.values[0]).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildText) return interaction.reply({ content: 'اختر روم كتابي عادي للوحة التحكم.', flags: MessageFlags.Ephemeral });
    database.setConfig(interaction.guildId, 'admin_panel_channel_id', channel.id, interaction.user.id);
    database.logAdmin(interaction.guildId, interaction.user.id, 'admin_panel_channel_set', channel.id);
    return interaction.update(adminAccessPayload(interaction.guildId, `تم تحديد ${channel} رومًا للوحة التحكم.`));
  }
  if (parts[1] === 'access' && parts[2] === 'clear-role') {
    database.setConfig(interaction.guildId, 'admin_role_id', '', interaction.user.id);
    database.logAdmin(interaction.guildId, interaction.user.id, 'admin_role_clear', '');
    return interaction.update(adminAccessPayload(interaction.guildId, 'تم إلغاء رتبة الإدارة الإضافية.'));
  }
  if (parts[1] === 'access' && parts[2] === 'clear-channel') {
    database.setConfig(interaction.guildId, 'admin_panel_channel_id', '', interaction.user.id);
    database.logAdmin(interaction.guildId, interaction.user.id, 'admin_panel_channel_clear', '');
    return interaction.update(adminAccessPayload(interaction.guildId, 'يمكن الآن فتح اللوحة من أي روم.'));
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
  if (!isAdmin(interaction.member,interaction.user.id,interaction.memberPermissions,interaction.guildId)) return interaction.reply({ content: 'هذه العملية للإدارة فقط.', flags: MessageFlags.Ephemeral });
  if (parts[1] === 'shop' && parts[2] === 'subtitle-save') {
    const subtitle = interaction.fields.getTextInputValue('subtitle').trim().slice(0, 90);
    database.setConfig(interaction.guildId, 'shop_subtitle', subtitle, interaction.user.id);
    database.logAdmin(interaction.guildId, interaction.user.id, 'shop_subtitle_update', subtitle);
    await refreshPublishedShop(interaction.guild).catch((error) => console.error('[ADMIN] Store artwork refresh failed:', error.message));
    return interaction.reply({ content: '✅ تم حفظ النص الصغير في صورة DOS SHOP وتحديث المتجر المنشور إذا كان موجوداً.', flags: MessageFlags.Ephemeral });
  }
  if (parts[1] === 'daily-question' && parts[2] === 'reward-save') {
    const amount = Number(interaction.fields.getTextInputValue('amount').trim());
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 100000) return interaction.reply({ content: 'الجائزة يجب أن تكون بين 1 و100000 DOS Coin.', flags: MessageFlags.Ephemeral });
    database.setConfig(interaction.guildId,'daily_question_reward',amount,interaction.user.id);
    database.logAdmin(interaction.guildId,interaction.user.id,'daily_question_reward',String(amount));
    return interaction.reply({ content: `✅ تم ضبط جائزة سؤال اليوم على ${amount} DOS Coin.`, flags: MessageFlags.Ephemeral });
  }
  if (parts[1] === 'daily-question' && parts[2] === 'content-save') {
    const question = interaction.fields.getTextInputValue('question').trim().slice(0,900);
    const answer = interaction.fields.getTextInputValue('answer').trim().slice(0,180);
    if (Boolean(question) !== Boolean(answer)) return interaction.reply({ content: 'للسؤال المخصص اكتب السؤال والإجابة معاً، أو اترك الحقلين فارغين لاستخدام البنك العشوائي.', flags: MessageFlags.Ephemeral });
    const title = interaction.fields.getTextInputValue('title').trim().slice(0,256);
    const body = interaction.fields.getTextInputValue('body').trim().slice(0,1000);
    const winner = interaction.fields.getTextInputValue('winner').trim().slice(0,900);
    if (!title || !body || !winner) return interaction.reply({ content: 'العنوان ونص السؤال ورسالة الفائز مطلوبة.', flags: MessageFlags.Ephemeral });
    database.setConfig(interaction.guildId, 'daily_question_custom_question', question, interaction.user.id);
    database.setConfig(interaction.guildId, 'daily_question_custom_answer', answer, interaction.user.id);
    database.setConfig(interaction.guildId, 'daily_question_title', title, interaction.user.id);
    database.setConfig(interaction.guildId, 'daily_question_message_template', body, interaction.user.id);
    database.setConfig(interaction.guildId, 'daily_question_winner_template', winner, interaction.user.id);
    database.logAdmin(interaction.guildId, interaction.user.id, 'daily_question_content_update', question ? 'custom-next-question' : 'message-templates-only');
    return interaction.reply({ content: `✅ تم حفظ نص السؤال ورسالة الفائز.${question ? ' وسيُستخدم السؤال المخصص في المرة القادمة.' : ' سيستمر اختيار الأسئلة عشوائياً.'}`, flags: MessageFlags.Ephemeral });
  }
  if (parts[1] === 'tasks' && parts[2] === 'message-save') {
    const template = interaction.fields.getTextInputValue('template').trim().slice(0,1700);
    if (!template) return interaction.reply({ content: 'اكتب رسالة الفوز بالمهمة.', flags: MessageFlags.Ephemeral });
    database.setConfig(interaction.guildId, 'task_reward_message_template', template, interaction.user.id);
    database.logAdmin(interaction.guildId, interaction.user.id, 'task_reward_message_update', 'updated');
    return interaction.reply({ content: '✅ تم حفظ رسالة الفوز الجديدة، وستُستخدم في إعلانات المهام القادمة.', flags: MessageFlags.Ephemeral });
  }
  if (parts[1] === 'invite-reward' && parts[2] === 'save') {
    const raw = interaction.fields.getTextInputValue('reward').trim().toLowerCase();
    if (raw === '0') {
      database.setConfig(interaction.guildId,'invite_reward_amount','0',interaction.user.id);
      database.logAdmin(interaction.guildId,interaction.user.id,'invite_reward_disable','');
      return interaction.reply({ content: 'تم إيقاف مكافأة الدعوات.', flags: MessageFlags.Ephemeral });
    }
    const match = raw.match(/^(coins|xp)\s*:\s*(\d+)$/);
    if (!match || Number(match[2]) < 1 || Number(match[2]) > 1000000) return interaction.reply({ content: 'استخدم coins:10 أو xp:250 أو 0 للإيقاف.', flags: MessageFlags.Ephemeral });
    database.setConfig(interaction.guildId,'invite_reward_type',match[1],interaction.user.id);
    database.setConfig(interaction.guildId,'invite_reward_amount',Number(match[2]),interaction.user.id);
    database.logAdmin(interaction.guildId,interaction.user.id,'invite_reward_update',raw);
    return interaction.reply({ content: `✅ تم ضبط مكافأة كل دعوة على ${match[2]} ${match[1] === 'xp' ? 'XP' : 'DOS Coin'}.`, flags: MessageFlags.Ephemeral });
  }
  if (parts[1] === 'task' && parts[2] === 'edit-save') {
    const taskId = Number(parts[3]);
    const title = interaction.fields.getTextInputValue('title').trim();
    const description = interaction.fields.getTextInputValue('description').trim();
    const period = interaction.fields.getTextInputValue('period').trim().toLowerCase();
    const trackingRaw = interaction.fields.getTextInputValue('tracking').trim().toLowerCase();
    const rewardRaw = interaction.fields.getTextInputValue('reward').trim().toLowerCase();
    const trackingMatch = trackingRaw.match(/^(xp|messages|manual)\s*:\s*(\d+)$/);
    const rewardMatch = rewardRaw.match(/^(coins|xp)\s*:\s*(\d+)$/);
    if (!title || !['daily','weekly'].includes(period) || !trackingMatch || !rewardMatch) return interaction.reply({ content: 'تحقق من البيانات: الدورية daily أو weekly، والتتبع xp:5000 أو messages:3 أو manual:1، والجائزة coins:100 أو xp:500.', flags: MessageFlags.Ephemeral });
    const threshold = Number(trackingMatch[2]); const rewardAmount = Number(rewardMatch[2]);
    if (!Number.isSafeInteger(threshold) || threshold < 1 || threshold > 100000000 || !Number.isSafeInteger(rewardAmount) || rewardAmount < 1 || rewardAmount > 100000000 || (trackingMatch[1] === 'manual' && threshold !== 1)) return interaction.reply({ content: 'قيمة الهدف أو الجائزة غير صالحة. المهام اليدوية تستخدم manual:1.', flags: MessageFlags.Ephemeral });
    const updated = database.updateGuildTask(interaction.guildId, taskId, { title, description, period, tracking_type: trackingMatch[1], threshold, reward_type: rewardMatch[1], reward_amount: rewardAmount });
    if (!updated) return interaction.reply({ content: 'تعذر تحديث المهمة؛ ربما تم حذفها.', flags: MessageFlags.Ephemeral });
    database.logAdmin(interaction.guildId, interaction.user.id, 'task_updated', `id=${taskId};title=${title};reward=${rewardMatch[0]}`);
    return interaction.reply({ content: `✅ تم تحديث المهمة #${taskId} والجائزة والهدف. لم يتم حذف سجل التقدم الحالي.`, flags: MessageFlags.Ephemeral });
  }
  if (parts[1] === 'tasks' && parts[2] === 'create-save') {
    const title = interaction.fields.getTextInputValue('title').trim();
    const description = interaction.fields.getTextInputValue('description').trim();
    const period = interaction.fields.getTextInputValue('period').trim().toLowerCase();
    const trackingRaw = interaction.fields.getTextInputValue('tracking').trim().toLowerCase();
    const rewardRaw = interaction.fields.getTextInputValue('reward').trim().toLowerCase();
    const trackingMatch = trackingRaw.match(/^(xp|messages|manual)\s*:\s*(\d+)$/);
    const rewardMatch = rewardRaw.match(/^(coins|xp)\s*:\s*(\d+)$/);
    if (!title || !['daily','weekly'].includes(period) || !trackingMatch || !rewardMatch) return interaction.reply({ content: 'تحقق من البيانات: الدورية daily أو weekly، والتتبع xp:5000 أو messages:3 أو manual:1، والجائزة coins:100 أو xp:500.', flags: MessageFlags.Ephemeral });
    const threshold = Number(trackingMatch[2]); const rewardAmount = Number(rewardMatch[2]);
    if (!Number.isSafeInteger(threshold) || threshold < 1 || threshold > 100000000 || !Number.isSafeInteger(rewardAmount) || rewardAmount < 1 || rewardAmount > 100000000) return interaction.reply({ content: 'قيمة الهدف أو الجائزة غير صالحة.', flags: MessageFlags.Ephemeral });
    if (trackingMatch[1] === 'manual' && threshold !== 1) return interaction.reply({ content: 'المهام اليدوية تستخدم manual:1؛ الإدارة تراجع الإثباتات وتختار الفائزين.', flags: MessageFlags.Ephemeral });
    const taskId = database.createGuildTask(interaction.guildId,{ title,description,period,trackingType:trackingMatch[1],threshold,rewardType:rewardMatch[1],rewardAmount,maxWinners:3 },interaction.user.id);
    database.logAdmin(interaction.guildId,interaction.user.id,'task_created',`id=${taskId};title=${title}`);
    return interaction.reply({ content: `✅ تم إنشاء المهمة #${taskId}. عدد الفائزين الافتراضي 3. ${trackingMatch[1] === 'messages' ? 'افتح تفاصيل المهمة وحدد روم التتبع.' : ''}`, flags: MessageFlags.Ephemeral });
  }
  if (parts[1] === 'task' && parts[2] === 'winners-save') {
    const taskId = Number(parts[3]); const winners = Number(interaction.fields.getTextInputValue('winners').trim());
    if (!Number.isSafeInteger(winners) || winners < 1 || winners > 25) return interaction.reply({ content: 'عدد الفائزين يجب أن يكون بين 1 و25.', flags: MessageFlags.Ephemeral });
    database.updateGuildTask(interaction.guildId,taskId,{ max_winners: winners });
    database.logAdmin(interaction.guildId,interaction.user.id,'task_winners_update',`${taskId}=${winners}`);
    return interaction.reply({ content: `✅ تم تحديث عدد الفائزين إلى ${winners}.`, flags: MessageFlags.Ephemeral });
  }
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
  if (parts[1] === 'welcome-card' && parts[2] === 'save') {
    const template = interaction.fields.getTextInputValue('template').trim().slice(0,1800);
    if (!template || template.length > 1800) return interaction.reply({ content: 'اكتب رسالة ترحيب لا تتجاوز 1800 حرف.', flags: MessageFlags.Ephemeral });
    database.setConfig(interaction.guildId, 'member_welcome_text', template, interaction.user.id);
    database.logAdmin(interaction.guildId, interaction.user.id, 'member_welcome_text_update', template);
    return interaction.reply({ content: '✅ تم حفظ رسالة الترحيب المصوّرة. ستُستخدم مع الأعضاء الجدد.', flags: MessageFlags.Ephemeral });
  }
  if (parts[1] === 'boost-xp' && parts[2] === 'save') {
    const raw = interaction.fields.getTextInputValue('multiplier').trim();
    const multiplier = Number(raw);
    if (!Number.isFinite(multiplier) || multiplier < 1 || multiplier > 5 || Math.abs(multiplier * 100 - Math.round(multiplier * 100)) > 1e-8) {
      return interaction.reply({ content: 'أدخل مضاعفاً بين 1 و5 وبحد أقصى منزلتين عشريتين، مثل 1.5 أو 2.', flags: MessageFlags.Ephemeral });
    }
    database.setConfig(interaction.guildId, 'booster_xp_multiplier', multiplier.toFixed(2).replace(/0+$/, '').replace(/\.$/, ''), interaction.user.id);
    database.logAdmin(interaction.guildId, interaction.user.id, 'booster_xp_multiplier_update', String(multiplier));
    return interaction.reply({ content: `✅ تم حفظ مضاعف XP للبوستر: ×${multiplier}. سيُطبق على XP الرسائل والصوت ابتداءً من المكاسب القادمة.`, flags: MessageFlags.Ephemeral });
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

module.exports = { isAdmin, homePayload, shopAdminPayload, shopSettingsPayload, adminAccessPayload, contentAdminPayload, joinWelcomePayload, memberWelcomeCardPayload, boosterXpPayload, dailyQuestionAdminPayload, inviteRewardsPayload, tasksAdminPayload, taskDetailsPayload, taskClaimsPayload, featuresPayload, economyPayload, memberToolsPayload, rolesPayload, levelRolesPayload, salesPayload, roomsPayload, handleAdminInteraction, handleAdminModal };
