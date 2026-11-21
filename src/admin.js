'use strict';
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  ChannelSelectMenuBuilder, RoleSelectMenuBuilder, ChannelType, PermissionsBitField, MessageFlags
} = require('discord.js');
const database = require('./database');
const { CYAN, DEFAULT_CONTENT, makeContentEmbed, publishMainPanel } = require('./panels');
const { deliverProduct, publishShop, refreshPublishedShop } = require('./shop');

const FEATURES = [
  ['economy', 'العملات والمحفظة'], ['levels', 'المستويات وXP'], ['shop', 'المتجر'],
  ['top', 'TOP والمتصدرون'], ['main_panel', 'اللوحة الرئيسية'],
  ['interaction_roles', 'رتب التفاعل'], ['events', 'الفعاليات'], ['welcome', 'رسالة الترحيب الحالية']
];
const CONTENT_KEYS = [
  ['main', 'اللوحة الرئيسية'], ['rules', 'قوانين السيرفر'], ['info', 'معلومات السيرفر'],
  ['notifications', 'رتب التفاعل'], ['system', 'نظام السيرفر'], ['events', 'الفعاليات']
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
function homePayload() {
  const menu = new StringSelectMenuBuilder().setCustomId('admin:nav').setPlaceholder('اختر القسم الذي تريد إدارته')
    .addOptions(
      { label: 'إدارة المتجر', value: 'shop', description: 'إضافة المنتجات وتعديلها والطلبات', emoji: '🛍️' },
      { label: 'الغرف الخاصة', value: 'rooms', description: 'متابعة الغرف ومددها وتجديدها وإغلاقها', emoji: '🏠' },
      { label: 'اللوحات والرسائل', value: 'content', description: 'تعديل القوانين والمعلومات والرسائل', emoji: '📝' },
      { label: 'تشغيل وإيقاف الأنظمة', value: 'features', description: 'إيقاف أو تشغيل كل نظام', emoji: '⏯️' },
      { label: 'العملات والمستويات', value: 'economy', description: 'تعديل XP والتحويل ومتطلبات المستويات', emoji: '📈' },
      { label: 'رتب التفاعل', value: 'roles', description: 'تحديد رتب الإشعارات', emoji: '🔔' },
      { label: 'رتب المستويات', value: 'level_roles', description: 'ربط رتب بمستويات الكتابة والصوت', emoji: '🏅' },
      { label: 'طلبات المتجر', value: 'sales', description: 'مراجعة طلبات الدفع والتسليم', emoji: '🧾' }
    );
  const embed = adminEmbed('👑 DOS CONTROL PANEL', 'لوحة الإدارة المركزية لسيرفر DOS COMMUNITY.\nادخل إلى أي قسم لتعديل إعداداته وحفظ التغييرات.\n\n**Silver × Cyan × Gold**');
  embed.addFields(
    { name: '🛍️ المتجر', value: 'إضافة منتجات، الأسعار، الصور، تعطيل المنتجات، وإعداد الغرف.', inline: true },
    { name: '📝 الرسائل', value: 'تعديل القوانين والمعلومات ونصوص الأزرار.', inline: true },
    { name: '⏯️ الأنظمة', value: 'تشغيل وإيقاف كل نظام بشكل مستقل.', inline: true }
  );
  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] };
}
function shopAdminPayload(guildId) {
  const products = database.products(guildId, false);
  const text = products.slice(0, 20).map((p) => `**#${p.id} ${p.name}** — ${p.price} ${p.currency === 'cash' ? 'نقداً' : 'DOS Coin'} — ${p.product_type} — ${p.active ? '🟢 متاح' : '⛔ متوقف'}`);
  const embed = adminEmbed('🛍️ إدارة DOS SHOP', text.join('\n') || 'لم تضف أي منتجات بعد.');
  embed.addFields({ name: 'إعداد الغرف', value: 'مدة الغرفة الافتراضية 30 يوماً، والتجديد يضيف 30 يوماً إلى تاريخ الانتهاء الحالي، مع تنبيه قبل 3 أيام.' });
  const rows = [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('admin:shop:add').setLabel('إضافة منتج').setEmoji('➕').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('admin:shop:pending').setLabel('طلبات معلقة').setEmoji('🧾').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('admin:shop:settings').setLabel('إعداد القنوات').setEmoji('⚙️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('admin:shop:publish').setLabel('نشر المتجر').setEmoji('📌').setStyle(ButtonStyle.Secondary)
  )];
  if (products.length) {
    const menu = new StringSelectMenuBuilder().setCustomId('admin:shop:select').setPlaceholder('اختر منتجاً لإدارته')
      .addOptions(products.slice(0,25).map((p) => ({ label: `#${p.id} ${p.name}`.slice(0,100), value: String(p.id), description: `${p.price} ${p.currency === 'cash' ? 'نقداً' : 'Coin'} • ${p.active ? 'متاح' : 'متوقف'}`.slice(0,100) })));
    rows.push(new ActionRowBuilder().addComponents(menu));
  }
  rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('admin:home').setLabel('رجوع').setStyle(ButtonStyle.Secondary)));
  return { embeds: [embed], components: rows };
}
function shopSettingsPayload(guildId) {
  const settings = database.settings(guildId);
  const channelText = settings.shop_channel_id ? `<#${settings.shop_channel_id}>` : 'غير محددة';
  const categoryText = settings.shop_category_id ? `<#${settings.shop_category_id}>` : 'غير محدد (ستُنشأ الغرف دون تصنيف)';
  return { embeds: [adminEmbed('⚙️ إعداد قنوات المتجر', `**قناة عرض المتجر:** ${channelText}\n**تصنيف الغرف الخاصة:** ${categoryText}\n\nاختر القناة والتصنيف؛ تبقى هذه الصفحة مفتوحة حتى تنتهي من الإعداد.`)], components: [
    new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('admin:set-shop-channel').setPlaceholder('اختر قناة عرض المتجر').setChannelTypes(ChannelType.GuildText)),
    new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('admin:set-room-category').setPlaceholder('اختر تصنيف الغرف الخاصة').setChannelTypes(ChannelType.GuildCategory)),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('admin:shop:back').setLabel('رجوع للمتجر').setStyle(ButtonStyle.Secondary))
  ] };
}

function contentAdminPayload() {
  const editMenu = new StringSelectMenuBuilder().setCustomId('admin:content:choose').setPlaceholder('اختر رسالة لتعديلها')
    .addOptions(CONTENT_KEYS.map(([key,label]) => ({ label, value: key })));
  const previewMenu = new StringSelectMenuBuilder().setCustomId('admin:content:preview').setPlaceholder('معاينة رسالة قبل اعتمادها')
    .addOptions(CONTENT_KEYS.map(([key,label]) => ({ label, value: key })));
  return { embeds: [adminEmbed('📝 إدارة اللوحات والرسائل', 'اختر الرسالة التي تريد تعديلها. تستطيع تغيير العنوان والنص كاملاً، ثم حفظها؛ وسيظهر التحديث عند ضغط الأعضاء على الزر.\n\nاستخدم القائمة الثانية لمعاينة النص المحفوظ، ثم انشر أو حدّث اللوحة الرئيسية عند تغيير عنوانها أو وصفها.')], components: [new ActionRowBuilder().addComponents(editMenu), new ActionRowBuilder().addComponents(previewMenu), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('admin:panel:publish').setLabel('نشر / تحديث اللوحة الرئيسية').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('admin:home').setLabel('رجوع').setStyle(ButtonStyle.Secondary))] };
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
  return { embeds: [adminEmbed('⏯️ تشغيل وإيقاف الأنظمة', 'كل زر يتحكم بنظام مستقل. إيقاف المتجر لا يوقف XP أو المحفظة، وإيقاف الفعاليات لا يؤثر على بقية الأنظمة.')], components: rows };
}
function economyPayload(guildId) {
  const values = {
    message_xp: database.getConfig(guildId,'message_xp','7'),
    voice_xp: database.getConfig(guildId,'voice_xp','9'),
    xp_per_coin: database.getConfig(guildId,'xp_per_coin','250'),
    easyBase: database.getConfig(guildId,'level_easy_base','100'), easyStep: database.getConfig(guildId,'level_easy_step','4'),
    mediumBase: database.getConfig(guildId,'level_medium_base','300'), mediumStep: database.getConfig(guildId,'level_medium_step','10'),
    hardBase: database.getConfig(guildId,'level_hard_base','800'), hardStep: database.getConfig(guildId,'level_hard_step','20')
  };
  const embed = adminEmbed('📈 العملات والمستويات', `**الرسائل:** ${values.message_xp} XP\n**كل دقيقة فويس:** ${values.voice_xp} XP\n**التحويل:** كل ${values.xp_per_coin} XP = 1 DOS Coin\n\n**1–50:** سهل ← متوسط (${values.easyBase} + ${values.easyStep} لكل مستوى)\n**51–100:** متوسط ← صعب (${values.mediumBase} + ${values.mediumStep})\n**101+:** صعب (${values.hardBase} + ${values.hardStep})`);
  return { embeds: [embed], components: [
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('admin:economy:rates').setLabel('تعديل XP والعملات').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('admin:economy:curve').setLabel('تعديل صعوبة المستويات').setStyle(ButtonStyle.Primary)),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('admin:home').setLabel('رجوع').setStyle(ButtonStyle.Secondary))
  ] };
}
function rolesPayload(guildId) {
  const saved = database.interactionRoles(guildId);
  const menu = new RoleSelectMenuBuilder().setCustomId('admin:roles:save').setPlaceholder('اختر رتب الإشعارات التي تريد إتاحتها')
    .setMinValues(0).setMaxValues(10);
  return { embeds: [adminEmbed('🔔 رتب التفاعل', `الرتب المفعّلة حالياً: ${saved.map((r) => r.role_name).join('، ') || 'لا توجد'}\n\nاختر حتى 10 رتب لإظهارها للأعضاء في زر «رتب التفاعل».`)], components: [new ActionRowBuilder().addComponents(menu), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('admin:home').setLabel('رجوع').setStyle(ButtonStyle.Secondary))] };
}
function levelRolesPayload(guildId) {
  const text = database.roles(guildId,'text');
  const voice = database.roles(guildId,'voice');
  const list = (rows) => rows.map((row) => `المستوى ${row.level}: <@&${row.role_id}>`).join('\n') || 'لا توجد رتب محددة بعد.';
  return { embeds: [adminEmbed('🏅 رتب المستويات', `**رتب الكتابة**\n${list(text)}\n\n**رتب الصوت**\n${list(voice)}\n\nعند بلوغ المستوى المحدد، يمنح البوت العضو الرتبة المناسبة تلقائياً.`)], components: [
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('admin:level-role:write').setLabel('إضافة رتبة مستوى كتابة').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('admin:level-role:voice').setLabel('إضافة رتبة مستوى صوت').setStyle(ButtonStyle.Primary)),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('admin:home').setLabel('رجوع').setStyle(ButtonStyle.Secondary))
  ] };
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
  return { embeds: [adminEmbed('🏠 إدارة الغرف الخاصة', text.join('\n') || 'لا توجد غرف نشطة حالياً.\nمدة الغرفة 30 يوماً، ويمكن تجديدها من قبل العضو أو الإدارة.')], components };
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
  return { embeds: [adminEmbed('🧾 طلبات المتجر', text.join('\n') || 'لا توجد طلبات معلقة حالياً.\nطلبات الدفع النقدي لا تُعتمد إلا بعد التحقق الفعلي من الدفع.')], components };
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

  if (parts[1] === 'home') return interaction.update(homePayload());
  if (parts[1] === 'nav' && interaction.isStringSelectMenu()) {
    const section = interaction.values[0];
    const payload = section === 'shop' ? shopAdminPayload(interaction.guildId)
      : section === 'rooms' ? roomsPayload(interaction.guildId)
      : section === 'content' ? contentAdminPayload()
      : section === 'features' ? featuresPayload(interaction.guildId)
      : section === 'economy' ? economyPayload(interaction.guildId)
      : section === 'roles' ? rolesPayload(interaction.guildId)
      : section === 'level_roles' ? levelRolesPayload(interaction.guildId) : salesPayload(interaction.guildId);
    return interaction.update(payload);
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
    return interaction.update({ embeds: [embed], components: [
      new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`admin:product:edit:${id}`).setLabel('تعديل').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId(`admin:product:toggle:${id}`).setLabel(product.active ? 'إيقاف المنتج' : 'تشغيل المنتج').setStyle(product.active ? ButtonStyle.Danger : ButtonStyle.Success)),
      new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('admin:shop:back').setLabel('رجوع للمتجر').setStyle(ButtonStyle.Secondary))
    ] });
  }
  if (parts[1] === 'shop' && parts[2] === 'back') return interaction.update(shopAdminPayload(interaction.guildId));
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
    return interaction.update(shopAdminPayload(interaction.guildId));
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
    return interaction.update({ embeds: [adminEmbed(`طلب المتجر #${id}`, `المنتج: ${order.product_name}\nالعضو: <@${order.user_id}>\nالسعر: ${order.price} ${order.currency}\nالحالة: ${order.status}${cashWarning}`)], components: [
      new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`admin:purchase:approve:${id}`).setLabel(order.currency === 'cash' ? 'اعتماد بعد التحقق من الدفع' : 'تسليم المنتج').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`admin:purchase:reject:${id}`).setLabel('رفض الطلب').setStyle(ButtonStyle.Danger)),
      new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('admin:shop:pending').setLabel('رجوع للطلبات').setStyle(ButtonStyle.Secondary))
    ] });
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
    return interaction.update({ embeds: [adminEmbed(`غرفة خاصة #${room.id}`, `القناة: <#${room.channel_id}>\nالمالك: <@${room.user_id}>\nالنوع: ${room.channel_type === 'voice' ? 'صوتية' : 'كتابية'}\nتاريخ الانتهاء: <t:${room.expires_at}:F>`) ], components: [
      new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`admin:room:extend:${room.id}`).setLabel('تمديد 30 يوماً').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`admin:room:close:${room.id}`).setLabel('إغلاق الغرفة').setStyle(ButtonStyle.Danger)),
      new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('admin:rooms:back').setLabel('رجوع').setStyle(ButtonStyle.Secondary))
    ] });
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
  if (parts[1] === 'content' && parts[2] === 'choose' && interaction.isStringSelectMenu()) return interaction.showModal(contentModal(interaction.values[0],interaction.guildId));
  if (parts[1] === 'content' && parts[2] === 'preview' && interaction.isStringSelectMenu()) {
    const key = interaction.values[0];
    return interaction.update({ embeds: [makeContentEmbed(interaction.guildId,key)], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('admin:content:back').setLabel('رجوع لإدارة الرسائل').setStyle(ButtonStyle.Secondary))] });
  }
  if (parts[1] === 'content' && parts[2] === 'back') return interaction.update(contentAdminPayload());
  if (parts[1] === 'panel' && parts[2] === 'publish') {
    return interaction.update({ embeds: [adminEmbed('📌 نشر اللوحة الرئيسية', 'اختر القناة التي تريد نشر اللوحة فيها. إذا كانت اللوحة موجودة مسبقاً فسيتم تحديثها.')], components: [
      new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('admin:panel:publish-channel').setPlaceholder('اختر قناة اللوحة الرئيسية').setChannelTypes(ChannelType.GuildText)),
      new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('admin:home').setLabel('رجوع').setStyle(ButtonStyle.Secondary))
    ] });
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
    const modal = new ModalBuilder().setCustomId('admin:economy:save-curve').setTitle('تعديل صعوبة المستويات')
      .addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('easy').setLabel('1-50: البداية والزيادة (100,4)').setStyle(TextInputStyle.Short).setValue(`${database.getConfig(interaction.guildId,'level_easy_base','100')},${database.getConfig(interaction.guildId,'level_easy_step','4')}`).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('medium').setLabel('المستويات 51–100: البداية, الزيادة').setStyle(TextInputStyle.Short).setValue(`${database.getConfig(interaction.guildId,'level_medium_base','300')},${database.getConfig(interaction.guildId,'level_medium_step','10')}`).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('hard').setLabel('المستوى 101+: البداية, الزيادة').setStyle(TextInputStyle.Short).setValue(`${database.getConfig(interaction.guildId,'level_hard_base','800')},${database.getConfig(interaction.guildId,'level_hard_step','20')}`).setRequired(true))
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
    const parsePair = (key) => interaction.fields.getTextInputValue(key).split(',').map((item) => Number(item.trim()));
    const pairs = [['easy','level_easy_base','level_easy_step'],['medium','level_medium_base','level_medium_step'],['hard','level_hard_base','level_hard_step']];
    const values = pairs.map(([field,base,step]) => ({ base, step, pair: parsePair(field) }));
    if (values.some((v) => v.pair.length !== 2 || v.pair.some((n) => !Number.isSafeInteger(n) || n < 1 || n > 100000))) return interaction.reply({ content: 'اكتب كل مرحلة بصيغة رقمين مثل 100,4، والقيم من 1 إلى 100000.', flags: MessageFlags.Ephemeral });
    const [easy,medium,hard] = values.map((v) => v.pair);
    if (medium[0] < easy[0] + 49 * easy[1] || hard[0] < medium[0] + 49 * medium[1]) return interaction.reply({ content: 'للحفاظ على التدرج، يجب أن تكون بداية المرحلة التالية أكبر من متطلبات آخر مستوى في المرحلة السابقة.', flags: MessageFlags.Ephemeral });
    for (const value of values) {
      database.setConfig(interaction.guildId,value.base,value.pair[0],interaction.user.id);
      database.setConfig(interaction.guildId,value.step,value.pair[1],interaction.user.id);
    }
    database.logAdmin(interaction.guildId,interaction.user.id,'level_curve_update',JSON.stringify(values.map((v) => v.pair)));
    return interaction.reply({ content: '✅ تم تحديث منحنى XP. المراحل بقيت 1–50 ثم 51–100 ثم 101+، والتدرج الجديد يطبق على حساب المستويات.', flags: MessageFlags.Ephemeral });
  }
  return false;
}

module.exports = { isAdmin, homePayload, shopAdminPayload, shopSettingsPayload, contentAdminPayload, featuresPayload, economyPayload, rolesPayload, levelRolesPayload, salesPayload, roomsPayload, handleAdminInteraction, handleAdminModal };
