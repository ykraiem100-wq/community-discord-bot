'use strict';
const {
  EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ChannelType, PermissionFlagsBits, MessageFlags,
  ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');
const database = require('./database');
const { renderShopHeader, renderColorWheel } = require('./render');

const PAGE_SIZE = 25;
const COLOR_PAGE_SIZE = 25;
// Named color choices: users select a readable Arabic color name, never a HEX code.
const COLOR_PALETTE = [
  ['أحمر داكن','#8E2430','🔴'],['أحمر كلاسيكي','#C62828','🔴'],['أحمر فاتح','#EF5350','🔴'],['مرجاني','#FF6B6B','🟥'],
  ['برتقالي داكن','#B94A16','🟠'],['برتقالي','#E87522','🟠'],['برتقالي فاتح','#FF9B45','🟠'],['خوخي','#FFB38A','🟠'],
  ['عنبر داكن','#A85E00','🟡'],['ذهبي دافئ','#C58A18','🟡'],['أصفر مشرق','#E5C52B','🟡'],['ليموني فاتح','#DCEB68','🟡'],
  ['أخضر زيتوني','#64752B','🟢'],['أخضر داكن','#176B45','🟢'],['أخضر زمردي','#159B65','🟢'],['أخضر فاتح','#65C98A','🟢'],
  ['نعناعي داكن','#168C7A','🟩'],['نعناعي','#36BFA5','🟩'],['نعناعي فاتح','#83E0C5','🟩'],['تركواز','#16A6A6','🟩'],
  ['فيروزي داكن','#087F9B','🩵'],['فيروزي','#19B6C8','🩵'],['سماوي DOS','#36D9FF','🩵'],['سماوي فاتح','#91E8F7','🩵'],
  ['أزرق سماوي داكن','#147FA8','🔵'],['أزرق سماوي','#249DD3','🔵'],['أزرق فاتح','#62BEEA','🔵'],['أزرق ثلجي','#B2E8F8','🔵'],
  ['أزرق ملكي داكن','#173C8A','🔵'],['أزرق ملكي','#2856B8','🔵'],['أزرق متوسط','#477BDD','🔵'],['أزرق فاتح ناعم','#8BAEF2','🔵'],
  ['كحلي','#182A4D','🔷'],['كحلي مزرق','#253D68','🔷'],['نيلي','#3E4B9B','🔷'],['نيلي فاتح','#7885D5','🔷'],
  ['بنفسجي داكن','#59318A','🟣'],['بنفسجي ملكي','#7444B5','🟣'],['بنفسجي متوسط','#9870D5','🟣'],['لافندر','#C0A7EA','🟣'],
  ['موف داكن','#8B3C91','🟪'],['موف','#AE58B5','🟪'],['ليلكي','#CF8AD2','🟪'],['ليلكي فاتح','#E7BDE8','🟪'],
  ['وردي داكن','#B83E75','🌸'],['وردي فوشيا','#DD4F9A','🌸'],['وردي','#F078B2','🌸'],['وردي فاتح','#F6B5D0','🌸'],
  ['نحاسي','#9A543F','🟤'],['بني دافئ','#87543A','🟤'],['بني فاتح','#B9825D','🟤'],['رملي','#D1AA81','🟤'],
  ['رمادي فحمي','#414750','⚙️'],['رمادي داكن','#626B76','⚙️'],['فضي','#9DAAB6','⚙️'],['فضي فاتح','#C9D4DD','⚙️'],
  ['أزرق معدني','#536C86','🔹'],['رمادي مزرق','#71899B','🔹'],['جليدي','#A7D8E7','🔹'],['سماوي معدني','#76C9DB','🔹']
].map(([name, hex, emoji]) => ({ name, hex, emoji }));

function currencyLabel(product) {
  return product.currency === 'cash' ? Number(product.price).toFixed(2) + ' ' + (product.cash_currency || 'JOD') : Number(product.price).toLocaleString() + ' DOS Coin';
}
function productIcon(type) {
  return ({ color: '🎨', text_room: '📝', voice_room: '🔊', role: '👑', digital: '📦', manual: '🛠️' })[type] || '🛍️';
}
async function shopPayload(guildOrId, page) {
  const guild = guildOrId && typeof guildOrId === 'object' ? guildOrId : null;
  const guildId = guild ? guild.id : guildOrId;
  if (!database.featureEnabled(guildId, 'shop')) {
    return { content: '🛍️ DOS SHOP مغلق مؤقتاً. تابع إعلانات DOS COMMUNITY لمعرفة موعد عودته.', components: [] };
  }
  database.ensureDefaultColorProduct(guildId);
  const products = database.products(guildId, true);
  const maxPage = Math.max(0, Math.ceil(products.length / PAGE_SIZE) - 1);
  const safePage = Math.min(Math.max(0, Number(page) || 0), maxPage);
  const current = products.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const subtitle = database.getConfig(guildId, 'shop_subtitle', 'COLORS • CUSTOM ROLES • ITEMS');
  const image = await renderShopHeader(guild, subtitle);
  const rows = [];
  if (current.length) {
    const menu = new StringSelectMenuBuilder().setCustomId('shop:buy').setPlaceholder('Buy... اختر المنتج الذي تريد شراءه').setMinValues(1).setMaxValues(1)
      .addOptions(current.map((p) => ({ label: p.name.slice(0, 100), value: String(p.id), description: currencyLabel(p).slice(0, 100), emoji: productIcon(p.product_type) })));
    rows.push(new ActionRowBuilder().addComponents(menu));
  }
  if (maxPage > 0) {
    const row = new ActionRowBuilder();
    if (safePage > 0) row.addComponents(new ButtonBuilder().setCustomId('shop:page:' + (safePage - 1)).setLabel('السابق').setStyle(ButtonStyle.Secondary));
    row.addComponents(new ButtonBuilder().setCustomId('shop:page:current').setLabel('صفحة ' + (safePage + 1) + '/' + (maxPage + 1)).setStyle(ButtonStyle.Secondary).setDisabled(true));
    if (safePage < maxPage) row.addComponents(new ButtonBuilder().setCustomId('shop:page:' + (safePage + 1)).setLabel('التالي').setStyle(ButtonStyle.Secondary));
    rows.push(row);
  }
  // The user asked for an image-only storefront: keep only the large artwork
  // and the actual product selector/navigation controls, with no extra title copy.
  const shopEmbed = new EmbedBuilder()
    .setImage('attachment://dos-credits-shop.png');
  return {
    embeds: [shopEmbed],
    files: [new AttachmentBuilder(image, { name: 'dos-credits-shop.png' })],
    attachments: [],
    components: rows
  };
}

function colorPickerPayload(guildId, purchaseId, page) {
  const totalPages = Math.ceil(COLOR_PALETTE.length / COLOR_PAGE_SIZE);
  const safePage = Math.min(Math.max(0, Number(page) || 0), totalPages - 1);
  const colors = COLOR_PALETTE.slice(safePage * COLOR_PAGE_SIZE, (safePage + 1) * COLOR_PAGE_SIZE);
  const menu = new StringSelectMenuBuilder().setCustomId(`color:choose:${guildId}:${purchaseId}`).setPlaceholder('اختر اسم اللون الذي يعجبك')
    .setMinValues(1).setMaxValues(1).addOptions(colors.map((color) => ({
      label: color.name, value: color.hex, description: 'اختيار هذه الدرجة لرتبتك', emoji: color.emoji
    })));
  const rows = [new ActionRowBuilder().addComponents(menu)];
  const nav = new ActionRowBuilder();
  if (safePage > 0) nav.addComponents(new ButtonBuilder().setCustomId(`color:page:${guildId}:${purchaseId}:${safePage - 1}`).setLabel('السابق').setStyle(ButtonStyle.Secondary));
  nav.addComponents(new ButtonBuilder().setCustomId('color:page:noop:0').setLabel(`${safePage + 1}/${totalPages} • ${COLOR_PALETTE.length} لون`).setStyle(ButtonStyle.Secondary).setDisabled(true));
  if (safePage < totalPages - 1) nav.addComponents(new ButtonBuilder().setCustomId(`color:page:${guildId}:${purchaseId}:${safePage + 1}`).setLabel('التالي').setStyle(ButtonStyle.Secondary));
  rows.push(nav);
  return {
    content: `🎨 **اختر لون رتبتك لمدة 30 يوماً**\nشاهد عجلة الألوان ثم اختر اسم الدرجة من القائمة. لا تحتاج إلى كتابة أي كود أو البحث عن HEX.`,
    files: [new AttachmentBuilder(renderColorWheel(), { name: 'dos-full-color-wheel.png' })],
    attachments: [],
    components: rows
  };
}

function voiceRoomControlPayload(room, channel) {
  const everyoneOverwrite = channel.permissionOverwrites.cache.get(channel.guild.roles.everyone.id);
  const locked = Boolean(room.voice_locked || (everyoneOverwrite && everyoneOverwrite.deny.has(PermissionFlagsBits.Connect)));
  const embed = new EmbedBuilder().setColor(0x36D9FF).setTitle('🎙️ لوحة التحكم بالغرفة الصوتية الخاصة')
    .setDescription(`مالك الغرفة: <@${room.user_id}>\nتاريخ الانتهاء: <t:${room.expires_at}:F>\n\nاستخدم الأزرار لتغيير الاسم والحد، وإضافة أو إزالة أعضاء. القفل يمنع اتصال الأعضاء المضافين أيضاً، والفتح يعيد السماح لهم.`)
    .setFooter({ text: 'DOS COMMUNITY • Voice Room Controls' });
  return { embeds: [embed], components: [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`room:voice:rename:${room.id}`).setLabel('تغيير الاسم').setEmoji('✏️').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`room:voice:limit:${room.id}`).setLabel('حد الأعضاء').setEmoji('👥').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`room:voice:add:${room.id}`).setLabel('إضافة عضو').setEmoji('➕').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`room:voice:remove:${room.id}`).setLabel('إزالة عضو').setEmoji('➖').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`room:voice:lock:${room.id}`).setLabel(locked ? 'فتح الدخول' : 'قفل الدخول').setEmoji(locked ? '🔓' : '🔒').setStyle(locked ? ButtonStyle.Success : ButtonStyle.Danger)
    )
  ] };
}

async function sendVoiceRoomControlPanel(channel, room) {
  if (!channel || typeof channel.send !== 'function') throw new Error('ميزة دردشة الروم الصوتي غير متاحة في هذا السيرفر.');
  const message = await channel.send(voiceRoomControlPayload(room, channel));
  database.setRoomPanelMessage(room.id, message.id);
  return message;
}

async function createPrivateRoom(guild, member, product) {
  const settings = database.settings(guild.id);
  const categoryId = settings.shop_category_id;
  const botMember = guild.members.me;
  if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ManageChannels)) throw new Error('البوت يحتاج صلاحية Manage Channels لإنشاء الغرف الخاصة.');
  let parent = null;
  if (categoryId) {
    parent = await guild.channels.fetch(categoryId).catch(() => null);
    if (!parent || parent.type !== ChannelType.GuildCategory) throw new Error('تصنيف الغرف غير مضبوط. حدّد تصنيفاً من لوحة إدارة المتجر.');
  }
  const isVoice = product.product_type === 'voice_room';
  const permissionOverwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: botMember.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect] },
    { id: member.id, allow: isVoice
      ? [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.Stream, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles]
      : [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ManageChannels] }
  ];
  const channel = await guild.channels.create({
    name: `${isVoice ? '🔊' : '📝'}-${member.user.username}`.slice(0, 90),
    type: isVoice ? ChannelType.GuildVoice : ChannelType.GuildText,
    parent: parent ? parent.id : undefined,
    permissionOverwrites,
    reason: `DOS SHOP purchase #${product.id} for ${member.user.tag}`
  });
  const days = Math.max(1, Number(product.duration_days) || 30);
  const expiresAt = Math.floor(Date.now() / 1000) + days * 86400;
  const roomId = database.createRoomRecord(guild.id, member.id, channel.id, isVoice ? 'voice' : 'text', product.id, expiresAt);
  if (isVoice) await sendVoiceRoomControlPanel(channel, { id: roomId, user_id: member.id, expires_at: expiresAt, voice_locked: 0 }).catch((error) => console.warn('[ROOM] Could not publish voice controls:', error.message));
  return { channel, roomId, expiresAt };
}

async function publishShop(guild, channel) {
  const settings = database.settings(guild.id);
  let message = null;
  if (settings.shop_message_id && settings.shop_channel_id) {
    const oldChannel = await guild.channels.fetch(settings.shop_channel_id).catch(() => null);
    if (oldChannel && oldChannel.isTextBased()) message = await oldChannel.messages.fetch(settings.shop_message_id).catch(() => null);
  }
  const payload = await shopPayload(guild,0);
  if (message && message.channelId === channel.id) {
    await message.edit(payload);
    return message;
  }
  const created = await channel.send(payload);
  database.saveShopMessage(guild.id,created.id);
  database.setSetting(guild.id,'shop_channel_id',channel.id);
  return created;
}

async function refreshPublishedShop(guild) {
  const settings = database.settings(guild.id);
  if (!settings.shop_channel_id) return null;
  const channel = await guild.channels.fetch(settings.shop_channel_id).catch(() => null);
  if (!channel || !channel.isTextBased() || !channel.send) return null;
  return publishShop(guild, channel);
}

async function deliverProduct(client, guildId, purchaseId, actorId) {
  const purchase = database.getProductPurchase(guildId, purchaseId);
  if (!purchase) throw new Error('الطلب غير موجود.');
  if (!['awaiting_payment', 'pending_fulfillment'].includes(purchase.status)) throw new Error('تمت مراجعة هذا الطلب أو تسليمه مسبقاً.');
  const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId);
  const member = await guild.members.fetch(purchase.user_id).catch(() => null);
  if (!member) throw new Error('لم أستطع العثور على صاحب الطلب في السيرفر.');
  const product = database.products(guildId, false).find((item) => item.id === purchase.product_id);
  if (!product) throw new Error('المنتج لم يعد موجوداً.');
  if (product.product_type === 'color') {
    database.updateProductPurchase(guildId, purchaseId, 'awaiting_selection', { approved: true }, actorId);
    await member.send(colorPickerPayload(guildId, purchaseId, 0));
    return { message: `تم اعتماد الطلب #${purchaseId} وإرسال اختيار اللون إلى <@${member.id}>.` };
  }
  if (product.product_type === 'role') {
    if (!product.role_id) throw new Error('المنتج يحتاج Role ID. عدّل المنتج وحدد type بصيغة role:ROLE_ID.');
    const role = await guild.roles.fetch(product.role_id).catch(() => null);
    if (!role) throw new Error('الرتبة المرتبطة بالمنتج غير موجودة.');
    await member.roles.add(role, `DOS SHOP order #${purchaseId}`);
    database.updateProductPurchase(guildId, purchaseId, 'completed', { deliveredRoleId: role.id }, actorId);
    return { message: `تم تسليم ${product.name} إلى <@${member.id}>.` };
  }
  if (product.product_type === 'text_room' || product.product_type === 'voice_room') {
    const room = await createPrivateRoom(guild, member, product);
    database.updateProductPurchase(guildId, purchaseId, 'completed', { roomId: room.roomId, channelId: room.channel.id, expiresAt: room.expiresAt }, actorId);
    await member.send({ content: `تم إنشاء غرفتك ${room.channel} لمدة ${product.duration_days || 30} يوماً.`, components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`room:renew:${guildId}:${room.roomId}`).setLabel('تجديد الغرفة 30 يوماً').setStyle(ButtonStyle.Primary))] }).catch(() => {});
    return { message: `تم إنشاء الغرفة ${room.channel} للعضو <@${member.id}>.` };
  }
  database.updateProductPurchase(guildId, purchaseId, 'completed', { manualDelivery: true }, actorId);
  await member.send(`تم اعتماد طلبك #${purchaseId} من DOS SHOP. ${product.description || 'تواصل مع الإدارة لاستلام المنتج.'}`).catch(() => {});
  return { message: `تم اعتماد الطلب #${purchaseId}. إذا كان المنتج يحتاج تسليماً يدوياً، أكمله مع العضو.` };
}

async function handleShopInteraction(interaction, client) {
  const parts = interaction.customId.split(':');
  if (parts[0] === 'shop' && parts[1] === 'page') {
    return interaction.update(await shopPayload(interaction.guild, Number(parts[2]) || 0));
  }
  if (parts[0] === 'shop' && parts[1] === 'buy' && interaction.isStringSelectMenu()) {
    if (!database.featureEnabled(interaction.guildId, 'shop')) return interaction.reply({ content: 'المتجر متوقف حالياً.', flags: MessageFlags.Ephemeral });
    const productId = Number(interaction.values[0]);
    const result = database.purchaseProduct(interaction.guildId, interaction.user.id, productId);
    if (result.error === 'insufficient_funds') return interaction.reply({ content: 'رصيد DOS Coin غير كافٍ لشراء هذا المنتج.', flags: MessageFlags.Ephemeral });
    if (result.error) return interaction.reply({ content: 'هذا المنتج غير متاح حالياً.', flags: MessageFlags.Ephemeral });
    const product = result.product;
    database.logAdmin(interaction.guildId, interaction.user.id, 'shop_purchase', `purchase=${result.id}; product=${product.id}; currency=${product.currency}`);
    if (product.currency === 'cash') {
      const link = product.payment_url;
      const embed = new EmbedBuilder().setColor(CYAN).setTitle('طلب شراء مدفوع').setDescription(`تم تسجيل طلبك **#${result.id}** لمنتج **${product.name}** بسعر **${product.price}**.\n\n${link ? 'استخدم رابط الدفع المرفق، وبعد الدفع ستراجع الإدارة الطلب.' : 'تواصل مع الإدارة لإتمام الدفع وتأكيده.'}`);
      const components = link && /^https?:\/\//i.test(link) ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('فتح رابط الدفع').setStyle(ButtonStyle.Link).setURL(link))] : [];
      return interaction.reply({ embeds: [embed], components, flags: MessageFlags.Ephemeral });
    }
    if (product.product_type === 'color') return interaction.reply({ ...colorPickerPayload(interaction.guildId, result.id, 0), flags: MessageFlags.Ephemeral });
    if (product.product_type === 'role') {
      try {
        const role = product.role_id ? await interaction.guild.roles.fetch(product.role_id).catch(() => null) : null;
        const botTop = interaction.guild.members.me && interaction.guild.members.me.roles.highest;
        if (!role || role.managed || !botTop || role.position >= botTop.position) throw new Error('الرتبة غير موجودة أو أعلى من رتبة البوت.');
        await interaction.member.roles.add(role, `DOS SHOP purchase #${result.id}`);
        database.updateProductPurchase(interaction.guildId, result.id, 'completed', { deliveredRoleId: role.id }, interaction.user.id);
        return interaction.reply({ content: `👑 تم شراء **${product.name}** وإضافة ${role} إليك.`, flags: MessageFlags.Ephemeral });
      } catch (error) {
        database.refundProductPurchase(interaction.guildId, result.id);
        database.updateProductPurchase(interaction.guildId, result.id, 'rejected', { error: error.message }, interaction.user.id);
        return interaction.reply({ content: `تعذر تسليم الرتبة، لذلك أعدت DOS Coin إلى محفظتك. السبب: ${error.message}`, flags: MessageFlags.Ephemeral });
      }
    }
    if (product.product_type === 'text_room' || product.product_type === 'voice_room') {
      try {
        const member = await interaction.guild.members.fetch(interaction.user.id);
        const room = await createPrivateRoom(interaction.guild, member, product);
        database.updateProductPurchase(interaction.guildId, result.id, 'completed', { roomId: room.roomId, channelId: room.channel.id, expiresAt: room.expiresAt }, interaction.user.id);
        return interaction.reply({ content: `تم إنشاء غرفتك ${room.channel}! صلاحيتها 30 يوماً. سنذكّرك قبل انتهائها بثلاثة أيام.`, components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`room:renew:${interaction.guildId}:${room.roomId}`).setLabel('تجديد الغرفة 30 يوماً').setStyle(ButtonStyle.Primary))], flags: MessageFlags.Ephemeral });
      } catch (error) {
        database.updateProductPurchase(interaction.guildId, result.id, 'pending_fulfillment', { error: error.message }, interaction.user.id);
        return interaction.reply({ content: `تم حجز الشراء، لكن تعذر إنشاء الغرفة تلقائياً: ${error.message}\nتم تحويل الطلب للإدارة للمراجعة.`, flags: MessageFlags.Ephemeral });
      }
    }
    if (product.product_type === 'digital') {
      database.updateProductPurchase(interaction.guildId, result.id, 'completed', { delivered: true }, interaction.user.id);
      return interaction.reply({ content: `تم شراء **${product.name}** بنجاح!\n${product.description}`, flags: MessageFlags.Ephemeral });
    }
    return interaction.reply({ content: `تم تسجيل طلبك #${result.id} لـ **${product.name}** وينتظر مراجعة الإدارة.`, flags: MessageFlags.Ephemeral });
  }
  if (parts[0] === 'color' && parts[1] === 'page') {
    const guildId = parts[2];
    const purchaseId = Number(parts[3]);
    const purchase = database.getProductPurchase(guildId, purchaseId);
    if (!purchase || purchase.user_id !== interaction.user.id || purchase.status !== 'awaiting_selection') return interaction.reply({ content: 'اختيار اللون غير صالح أو انتهت صلاحيته.', flags: MessageFlags.Ephemeral });
    return interaction.update(colorPickerPayload(guildId, purchaseId, Number(parts[4]) || 0));
  }
  if (parts[0] === 'color' && parts[1] === 'choose' && interaction.isStringSelectMenu()) {
    return applyColorSelection(interaction, client, parts[2], Number(parts[3]), interaction.values[0], 'update');
  }
  if (parts[0] === 'room' && parts[1] === 'voice') {
    const roomId = Number(parts[3]);
    const room = database.getRoom(interaction.guildId, roomId);
    if (!room || room.channel_type !== 'voice') return interaction.reply({ content: 'الغرفة الصوتية غير موجودة أو انتهت.', flags: MessageFlags.Ephemeral });
    const adminRole = database.getConfig(interaction.guildId, 'admin_role_id', '');
    const memberRoleCache = interaction.member && interaction.member.roles && interaction.member.roles.cache;
    const memberRoleIds = interaction.member && Array.isArray(interaction.member.roles) ? interaction.member.roles : [];
    const hasAdminRole = Boolean(adminRole && (memberRoleCache ? memberRoleCache.has(adminRole) : memberRoleIds.includes(adminRole)));
    const owner = room.user_id === interaction.user.id;
    const administrator = Boolean(interaction.memberPermissions && interaction.memberPermissions.has(PermissionFlagsBits.Administrator));
    if (!owner && !administrator && !hasAdminRole) return interaction.reply({ content: 'هذه الأزرار لمالك الغرفة والإدارة فقط.', flags: MessageFlags.Ephemeral });
    const channel = await interaction.guild.channels.fetch(room.channel_id).catch(() => null);
    if (!channel) return interaction.reply({ content: 'الروم الصوتي غير موجود.', flags: MessageFlags.Ephemeral });
    if (parts[2] === 'lock') {
      const next = !Boolean(room.voice_locked);
      const reason = 'DOS private voice room lock control';
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: next ? false : null }, reason);
      const botId = interaction.client.user.id;
      const memberOverwrites = [...channel.permissionOverwrites.cache.values()].filter((overwrite) =>
        overwrite.type === 1 && overwrite.id !== room.user_id && overwrite.id !== botId && overwrite.allow.has(PermissionFlagsBits.ViewChannel)
      );
      for (const overwrite of memberOverwrites) {
        if (next) {
          await channel.permissionOverwrites.edit(overwrite.id, { Connect: false }, reason);
        } else if (overwrite.deny.has(PermissionFlagsBits.Connect)) {
          await channel.permissionOverwrites.edit(overwrite.id, { Connect: true }, reason);
        }
      }
      database.setRoomLocked(room.id, next);
      const updatedRoom = database.getRoom(interaction.guildId, roomId);
      return interaction.update(voiceRoomControlPayload(updatedRoom, channel));
    }
    if (['rename','limit','add','remove'].includes(parts[2])) {
      const modal = new ModalBuilder().setCustomId(`room:voice:${parts[2]}:${roomId}`)
        .setTitle(parts[2] === 'rename' ? 'تغيير اسم الغرفة' : parts[2] === 'limit' ? 'تحديد عدد الأعضاء' : parts[2] === 'add' ? 'إضافة عضو للغرفة' : 'إزالة عضو من الغرفة');
      if (parts[2] === 'rename') modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('room_name').setLabel('اسم الغرفة الجديد').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(90)));
      if (parts[2] === 'limit') modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('user_limit').setLabel('من 0 إلى 99 — صفر دون حد').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(2).setValue(String(channel.userLimit || 0))));
      if (parts[2] === 'add' || parts[2] === 'remove') modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('member_id').setLabel('منشن العضو أو معرفه').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(30).setPlaceholder('@عضو أو 123456789012345678')));
      return interaction.showModal(modal);
    }
  }
  if (parts[0] === 'room' && parts[1] === 'renew') {
    const guildId = parts[2];
    const roomId = Number(parts[3]);
    const result = database.renewRoom(guildId, interaction.user.id, roomId);
    if (result.error === 'insufficient_funds') return interaction.reply({ content: 'رصيدك لا يكفي لتجديد الغرفة.', flags: MessageFlags.Ephemeral });
    if (result.error) return interaction.reply({ content: 'تعذر تجديد الغرفة. تأكد أنها ما زالت فعّالة.', flags: MessageFlags.Ephemeral });
    return interaction.reply({ content: `تم تجديد الغرفة بنجاح! تاريخ الانتهاء الجديد: <t:${result.expires_at}:F>. تم خصم ${result.price} DOS Coin.`, flags: MessageFlags.Ephemeral });
  }
  return false;
}

async function applyColorSelection(interaction, client, guildId, purchaseId, rawColor, mode) {
  const replyPrivately = (payload) => interaction.reply(interaction.guildId ? { ...payload, flags: MessageFlags.Ephemeral } : payload);
  const purchase = database.getProductPurchase(guildId, purchaseId);
  const selectedColor = COLOR_PALETTE.find((item) => item.hex === String(rawColor || '').toUpperCase());
  const invalid = { content: 'اختر لوناً من عجلة الألوان والقائمة المرفقة.' };
  if (!purchase || purchase.user_id !== interaction.user.id || purchase.status !== 'awaiting_selection') {
    const payload = { content: 'اختيار اللون غير صالح أو تم استخدامه سابقاً.' };
    return mode === 'update' ? interaction.update(payload) : replyPrivately(payload);
  }
  if (!selectedColor) return mode === 'update' ? interaction.update(invalid) : replyPrivately(invalid);
  const color = selectedColor.hex;
  try {
    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId);
    const member = await guild.members.fetch(interaction.user.id);
    const botMember = guild.members.me;
    if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ManageRoles)) throw new Error('البوت يحتاج صلاحية Manage Roles لإنشاء رتبة اللون.');
    const memberRole = guild.roles.cache.find((candidate) => {
      const name = candidate.name.trim().toLocaleLowerCase();
      return ['member','members','عضو','الأعضاء'].includes(name) || name.includes('member');
    });
    if (!memberRole) throw new Error('أنشئ رتبة باسم Member أولاً حتى يضع البوت رتب الألوان فوقها.');
    const targetPosition = memberRole.position + 1;
    if (botMember.roles.highest.position <= targetPosition) throw new Error('ارفع أعلى رتبة للبوت فوق رتبة Member أولاً حتى يستطيع وضع رتبة اللون فوقها.');
    let roleId = database.getCustomColorRole(guildId, interaction.user.id);
    let role = roleId ? await guild.roles.fetch(roleId).catch(() => null) : null;
    if (role) await role.edit({ name: `DOS • ${member.displayName}`.slice(0, 100), color, reason: `DOS color purchase #${purchaseId}` });
    else role = await guild.roles.create({ name: `DOS • ${member.displayName}`.slice(0, 100), color, reason: `DOS color purchase #${purchaseId}` });
    role = await role.setPosition(targetPosition, { reason: `Place DOS color role above Member for ${member.user.tag}` });
    if (role.position >= botMember.roles.highest.position) throw new Error('رتبة اللون أعلى من رتبة البوت ولا يمكن إسنادها.');
    await member.roles.add(role, 'DOS custom color role');
    const expiresAt = Math.floor(Date.now() / 1000) + 30 * 86400;
    database.setCustomColorRole(guildId, interaction.user.id, role.id, expiresAt);
    database.updateProductPurchase(guildId, purchaseId, 'completed', { colorName: selectedColor.name, color, roleId: role.id, expiresAt }, interaction.user.id);
    const payload = { content: `🎨 تم اختيار **${selectedColor.name}** وإضافة رتبتك ${role}.\nصلاحية اللون 30 يوماً، وينتهي في <t:${expiresAt}:F>.`, components: [], embeds: [], files: [] };
    return mode === 'update' ? interaction.update(payload) : replyPrivately(payload);
  } catch (error) {
    if (purchase.currency === 'coin') {
      database.refundProductPurchase(guildId, purchaseId);
      database.updateProductPurchase(guildId, purchaseId, 'rejected', { error: error.message }, interaction.user.id);
    } else {
      database.updateProductPurchase(guildId, purchaseId, 'pending_fulfillment', { error: error.message }, interaction.user.id);
    }
    const payload = { content: `تعذر إنشاء رتبة اللون: ${error.message}${purchase.currency === 'coin' ? ' تمت إعادة DOS Coin إلى محفظتك.' : ' أُعيد الطلب إلى قائمة الإدارة للمراجعة.'}`, components: [], embeds: [] };
    return mode === 'update' ? interaction.update(payload) : replyPrivately(payload);
  }
}

async function handleShopModal(interaction, client) {
  const parts = interaction.customId.split(':');
  if (parts[0] !== 'room' || parts[1] !== 'voice') return false;
  const roomId = Number(parts[3]);
  const room = database.getRoom(interaction.guildId, roomId);
  if (!room || room.channel_type !== 'voice') return interaction.reply({ content: 'الغرفة الصوتية غير موجودة أو انتهت صلاحيتها.', flags: MessageFlags.Ephemeral });
  const configuredAdminRole = database.getConfig(interaction.guildId, 'admin_role_id', '');
  const roleCache = interaction.member && interaction.member.roles && interaction.member.roles.cache;
  const roleIds = interaction.member && Array.isArray(interaction.member.roles) ? interaction.member.roles : [];
  const owner = room.user_id === interaction.user.id;
  const administrator = Boolean(interaction.memberPermissions && interaction.memberPermissions.has(PermissionFlagsBits.Administrator));
  const configuredAdmin = Boolean(configuredAdminRole && (roleCache ? roleCache.has(configuredAdminRole) : roleIds.includes(configuredAdminRole)));
  if (!owner && !administrator && !configuredAdmin) return interaction.reply({ content: 'لوحة الغرفة متاحة لمالك الغرفة والإدارة فقط.', flags: MessageFlags.Ephemeral });
  const channel = await interaction.guild.channels.fetch(room.channel_id).catch(() => null);
  if (!channel) return interaction.reply({ content: 'لم أجد الروم الصوتي.', flags: MessageFlags.Ephemeral });

  if (parts[2] === 'rename') {
    const name = interaction.fields.getTextInputValue('room_name').trim().replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 90);
    if (name.length < 2) return interaction.reply({ content: 'اسم الغرفة يجب أن يحتوي على حرفين على الأقل.', flags: MessageFlags.Ephemeral });
    await channel.setName(name, 'DOS private voice room owner control');
    return interaction.reply({ content: `✅ تم تغيير اسم الغرفة إلى **${name}**.`, flags: MessageFlags.Ephemeral });
  }
  if (parts[2] === 'limit') {
    const raw = interaction.fields.getTextInputValue('user_limit').trim();
    const limit = Number(raw);
    if (!/^\d{1,2}$/.test(raw) || limit < 0 || limit > 99) return interaction.reply({ content: 'اكتب رقماً من 0 إلى 99. الرقم 0 يعني دون حد.', flags: MessageFlags.Ephemeral });
    await channel.setUserLimit(limit, 'DOS private voice room owner control');
    return interaction.reply({ content: `✅ تم ضبط حد الأعضاء إلى ${limit === 0 ? 'مفتوح' : limit}.`, flags: MessageFlags.Ephemeral });
  }
  if (parts[2] === 'add' || parts[2] === 'remove') {
    const raw = interaction.fields.getTextInputValue('member_id').trim();
    const mention = raw.match(/^<@!?(\d{15,22})>$/);
    const userId = mention ? mention[1] : raw;
    if (!/^\d{15,22}$/.test(userId)) return interaction.reply({ content: 'اذكر العضو بمنشن أو اكتب معرفه.', flags: MessageFlags.Ephemeral });
    if (userId === room.user_id || userId === interaction.client.user.id) return interaction.reply({ content: 'لا يمكن إزالة مالك الغرفة أو البوت.', flags: MessageFlags.Ephemeral });
    const member = await interaction.guild.members.fetch(userId).catch(() => null);
    if (!member) return interaction.reply({ content: 'العضو غير موجود في السيرفر.', flags: MessageFlags.Ephemeral });
    if (parts[2] === 'add') {
      await channel.permissionOverwrites.edit(member.id, { ViewChannel: true, Connect: !room.voice_locked, Speak: true, Stream: true, SendMessages: true, ReadMessageHistory: true }, 'Added by private voice room owner');
      return interaction.reply({ content: `✅ تمت إضافة ${member} إلى الغرفة الصوتية.`, flags: MessageFlags.Ephemeral });
    }
    await channel.permissionOverwrites.delete(member.id, 'Removed by private voice room owner');
    return interaction.reply({ content: `✅ تمت إزالة صلاحية ${member} من الغرفة.`, flags: MessageFlags.Ephemeral });
  }
  return false;
}

async function processRoomExpirations(client) {
  const now = Math.floor(Date.now() / 1000);
  for (const expired of database.expiredCustomColorRoles(now)) {
    const guild = client.guilds.cache.get(expired.guild_id);
    // Keep the expiry record while the guild is unavailable so cleanup is retried.
    let cleanupComplete = false;
    if (guild) {
      const member = await guild.members.fetch(expired.user_id).catch(() => null);
      const role = await guild.roles.fetch(expired.role_id).catch(() => null);
      cleanupComplete = !member || !role || !member.roles.cache.has(expired.role_id);
      if (member && role && member.roles.cache.has(role.id)) {
        try {
          await member.roles.remove(role, 'DOS color role expired after 30 days');
          cleanupComplete = true;
        } catch (error) {
          console.warn('[COLOR] Could not remove expired role; will retry:', error.message);
        }
      }
      if (cleanupComplete && role && role.members.size === 0) await role.delete('DOS color role subscription expired').catch(() => {});
      if (cleanupComplete && member) await member.send('انتهت صلاحية رتبة اللون الخاصة بك بعد 30 يوماً. يمكنك شراء Colors مجدداً من DOS SHOP.').catch(() => {});
    }
    if (cleanupComplete) database.deleteCustomColorRole(expired.guild_id, expired.user_id);
  }
  for (const guild of client.guilds.cache.values()) {
    for (const room of database.activeRooms(guild.id)) {
      if (room.channel_type === 'voice') {
        const voiceChannel = await guild.channels.fetch(room.channel_id).catch(() => null);
        if (voiceChannel && !room.panel_message_id && typeof voiceChannel.send === 'function') {
          await sendVoiceRoomControlPanel(voiceChannel, room).catch((error) => console.warn('[ROOM] Legacy voice panel publish failed:', error.message));
        }
      }
      if (room.expires_at <= now) {
        const channel = await guild.channels.fetch(room.channel_id).catch(() => null);
        let deleted = !channel;
        if (channel) {
          try { await channel.delete('DOS private room subscription expired'); deleted = true; }
          catch (error) { console.error('[ROOM] Delete failed:', error.message); }
        }
        if (!deleted) continue;
        database.closeRoom(room.id);
        const user = await client.users.fetch(room.user_id).catch(() => null);
        if (user) await user.send('انتهت مدة غرفتك الخاصة في DOS COMMUNITY وتم إغلاقها. يمكنك شراء غرفة جديدة من المتجر.').catch(() => {});
      } else if (!room.warning_sent && room.expires_at - now <= 3 * 86400) {
        const user = await client.users.fetch(room.user_id).catch(() => null);
        if (user) await user.send({ content: `تنبيه: ستنتهي غرفتك الخاصة بعد أقل من 3 أيام، في <t:${room.expires_at}:F>. يمكنك تجديدها لمدة 30 يوماً من هنا.`, components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`room:renew:${guild.id}:${room.id}`).setLabel('تجديد الغرفة 30 يوماً').setStyle(ButtonStyle.Primary))] }).catch(() => {});
        database.markRoomWarned(room.id);
      }
    }
  }
}

module.exports = { shopPayload, colorPickerPayload, handleShopInteraction, handleShopModal, deliverProduct, publishShop, refreshPublishedShop, processRoomExpirations, COLOR_PALETTE };
