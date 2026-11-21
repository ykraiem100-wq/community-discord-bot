'use strict';
const {
  EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ChannelType, PermissionFlagsBits, MessageFlags
} = require('discord.js');
const database = require('./database');
const { CYAN } = require('./panels');
const { renderShopGrid } = require('./render');

const PAGE_SIZE = 6;
const COLOR_PAGE_SIZE = 25;
const COLOR_STEPS = [0, 51, 102, 153, 204, 255];
const COLOR_PALETTE = [];
for (const r of COLOR_STEPS) for (const g of COLOR_STEPS) for (const b of COLOR_STEPS) {
  const hex = '#' + [r,g,b].map((v) => v.toString(16).padStart(2,'0')).join('').toUpperCase();
  if (hex !== '#000000' && hex !== '#FFFFFF') COLOR_PALETTE.push(hex);
}

function currencyLabel(product) {
  return product.currency === 'cash' ? Number(product.price).toFixed(2) + ' ' + (product.cash_currency || 'JOD') : Number(product.price).toLocaleString() + ' DOS Coin';
}
function productIcon(type) {
  return ({ color: '🎨', text_room: '📝', voice_room: '🔊', role: '👑', digital: '📦', manual: '🛠️' })[type] || '🛍️';
}
async function shopPayload(guildId, page) {
  if (!database.featureEnabled(guildId, 'shop')) {
    return { content: '🛍️ DOS SHOP مغلق مؤقتاً. تابع إعلانات DOS COMMUNITY لمعرفة موعد عودته.', components: [] };
  }
  const products = database.products(guildId, true);
  const maxPage = Math.max(0, Math.ceil(products.length / PAGE_SIZE) - 1);
  const safePage = Math.min(Math.max(0, Number(page) || 0), maxPage);
  const current = products.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const visualItems = current.map((product) => ({ ...product, display_price: currencyLabel(product) }));
  const image = await renderShopGrid(visualItems);
  const rows = [];
  if (current.length) {
    const menu = new StringSelectMenuBuilder().setCustomId('shop:buy').setPlaceholder('اختر المنتج الذي تريد شراءه').setMinValues(1).setMaxValues(1)
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
  return {
    content: '**DOS SHOP** • صفحة ' + (safePage + 1) + '/' + (maxPage + 1) + '\nاختر المنتج من القائمة أسفل الصورة.',
    files: [new AttachmentBuilder(image, { name: 'dos-shop.png' })],
    attachments: [],
    components: rows
  };
}
function colorPickerPayload(guildId, purchaseId, page) {
  const totalPages = Math.ceil(COLOR_PALETTE.length / COLOR_PAGE_SIZE);
  const safePage = Math.min(Math.max(0, Number(page) || 0), totalPages - 1);
  const colors = COLOR_PALETTE.slice(safePage * COLOR_PAGE_SIZE, (safePage + 1) * COLOR_PAGE_SIZE);
  const menu = new StringSelectMenuBuilder().setCustomId(`color:choose:${guildId}:${purchaseId}`).setPlaceholder('اختر لون رتبتك')
    .setMinValues(1).setMaxValues(1).addOptions(colors.map((hex) => ({ label: `لون ${hex}`, value: hex, description: 'اضغط لاختيار هذا اللون' })));
  const rows = [new ActionRowBuilder().addComponents(menu)];
  const nav = new ActionRowBuilder();
  if (safePage > 0) nav.addComponents(new ButtonBuilder().setCustomId(`color:page:${guildId}:${purchaseId}:${safePage - 1}`).setLabel('السابق').setStyle(ButtonStyle.Secondary));
  nav.addComponents(new ButtonBuilder().setCustomId('color:page:noop:0').setLabel(`${safePage + 1}/${totalPages} • ${COLOR_PALETTE.length} لون`).setStyle(ButtonStyle.Secondary).setDisabled(true));
  if (safePage < totalPages - 1) nav.addComponents(new ButtonBuilder().setCustomId(`color:page:${guildId}:${purchaseId}:${safePage + 1}`).setLabel('التالي').setStyle(ButtonStyle.Secondary));
  rows.push(nav);
  return { content: '🎨 **اختر لونك الخاص**\nيوجد أكثر من 200 لون. اختر اللون المناسب، وسيُنشئ البوت رتبتك تلقائياً.', components: rows };
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
  const channel = await guild.channels.create({
    name: `${isVoice ? '🔊' : '📝'}-${member.user.username}`.slice(0, 90),
    type: isVoice ? ChannelType.GuildVoice : ChannelType.GuildText,
    parent: parent ? parent.id : undefined,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: botMember.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect] },
      { id: member.id, allow: isVoice
        ? [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.Stream, PermissionFlagsBits.ManageChannels]
        : [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ManageChannels] }
    ],
    reason: `DOS SHOP purchase #${product.id} for ${member.user.tag}`
  });
  const days = Math.max(1, Number(product.duration_days) || 30);
  const expiresAt = Math.floor(Date.now() / 1000) + days * 86400;
  const roomId = database.createRoomRecord(guild.id, member.id, channel.id, isVoice ? 'voice' : 'text', product.id, expiresAt);
  return { channel, roomId, expiresAt };
}

async function publishShop(guild, channel) {
  const settings = database.settings(guild.id);
  let message = null;
  if (settings.shop_message_id && settings.shop_channel_id) {
    const oldChannel = await guild.channels.fetch(settings.shop_channel_id).catch(() => null);
    if (oldChannel && oldChannel.isTextBased()) message = await oldChannel.messages.fetch(settings.shop_message_id).catch(() => null);
  }
  const payload = await shopPayload(guild.id,0);
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
    return interaction.update(await shopPayload(interaction.guildId, Number(parts[2]) || 0));
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
    const guildId = parts[2];
    const purchaseId = Number(parts[3]);
    const purchase = database.getProductPurchase(guildId, purchaseId);
    if (!purchase || purchase.user_id !== interaction.user.id || purchase.status !== 'awaiting_selection') return interaction.reply({ content: 'هذا الاختيار لا يخصك أو تم استخدامه سابقاً.', flags: MessageFlags.Ephemeral });
    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId);
    const member = await guild.members.fetch(interaction.user.id);
    const color = String(interaction.values[0]).toUpperCase();
    if (!COLOR_PALETTE.includes(color)) return interaction.reply({ content: 'اللون المختار غير صالح.', flags: MessageFlags.Ephemeral });
    try {
      const botMember = guild.members.me;
      if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ManageRoles)) throw new Error('البوت يحتاج صلاحية Manage Roles لإنشاء رتبة اللون.');
      let roleId = database.getCustomColorRole(guildId, interaction.user.id);
      let role = roleId ? await guild.roles.fetch(roleId).catch(() => null) : null;
      if (role) await role.edit({ name: `DOS • ${member.displayName}`.slice(0,100), color, reason: `DOS color purchase #${purchaseId}` });
      else role = await guild.roles.create({ name: `DOS • ${member.displayName}`.slice(0,100), color, reason: `DOS color purchase #${purchaseId}` });
      if (role.position >= botMember.roles.highest.position) throw new Error('رتبة اللون أعلى من رتبة البوت ولا يمكن إسنادها.');
      await member.roles.add(role, 'DOS custom color role');
      database.setCustomColorRole(guildId, interaction.user.id, role.id);
      database.updateProductPurchase(guildId, purchaseId, 'completed', { color, roleId: role.id }, interaction.user.id);
      return interaction.update({ content: `🎨 تم اختيار اللون **${color}** وإنشاء رتبتك ${role}.`, components: [] });
    } catch (error) {
      if (purchase.currency === 'coin') {
        database.refundProductPurchase(guildId,purchaseId);
        database.updateProductPurchase(guildId,purchaseId,'rejected',{ error:error.message },interaction.user.id);
      } else {
        database.updateProductPurchase(guildId,purchaseId,'pending_fulfillment',{ error:error.message },interaction.user.id);
      }
      return interaction.update({ content: `تعذر إنشاء رتبة اللون: ${error.message}${purchase.currency === 'coin' ? ' تمت إعادة DOS Coin إلى محفظتك.' : ' أُعيد الطلب إلى قائمة الإدارة للمراجعة.'}`, components: [] });
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

async function processRoomExpirations(client) {
  const now = Math.floor(Date.now() / 1000);
  for (const guild of client.guilds.cache.values()) {
    for (const room of database.activeRooms(guild.id)) {
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

module.exports = { shopPayload, colorPickerPayload, handleShopInteraction, deliverProduct, publishShop, refreshPublishedShop, processRoomExpirations, COLOR_PALETTE };
