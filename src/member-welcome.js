'use strict';

const { AttachmentBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const database = require('./database');
const { renderMemberWelcomeCard } = require('./render');
const { DEFAULT_MEMBER_WELCOME_TEXT, formatMemberWelcomeText } = require('./member-welcome-text');

function getMemberWelcomeConfig(guildId) {
  return {
    enabled: database.getConfig(guildId, 'member_welcome_enabled', '1') !== '0',
    channelId: database.getConfig(guildId, 'member_welcome_channel_id', '') ||
      database.getConfig(guildId, 'join_welcome_channel_id', '') || database.settings(guildId).welcome_channel_id || '',
    template: database.getConfig(guildId, 'member_welcome_text', DEFAULT_MEMBER_WELCOME_TEXT)
  };
}

function resolveMemberWelcomeChannel(guild, config) {
  if (config.channelId) {
    const selected = guild.channels.cache.get(config.channelId);
    return selected && selected.type === ChannelType.GuildText ? selected : null;
  }
  const generalNames = new Set(['general', 'chat', 'عام', 'الشات-العام', 'الشات العام', 'العام']);
  return guild.channels.cache.find((channel) => channel.type === ChannelType.GuildText && generalNames.has(channel.name.toLowerCase()))
    || guild.systemChannel || null;
}

async function sendMemberWelcomeCard(member, options = {}) {
  if (!member || !member.guild || member.user.bot) return null;
  const config = getMemberWelcomeConfig(member.guild.id);
  if (!options.test && !config.enabled) return null;
  const channel = resolveMemberWelcomeChannel(member.guild, config);
  if (!channel || !channel.isTextBased() || typeof channel.send !== 'function') return null;
  const botMember = member.guild.members.me;
  if (botMember) {
    const permissions = channel.permissionsFor(botMember);
    if (!permissions || !permissions.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles])) return null;
  }
  const image = await renderMemberWelcomeCard({ user: member.user, guild: member.guild });
  const count = Math.max(0, Math.floor(Number(member.guild.memberCount) || 0));
  const description = formatMemberWelcomeText(config.template, member);
  const embed = new EmbedBuilder()
    .setColor(0x55DDF5)
    .setAuthor({ name: member.guild.name, iconURL: member.guild.iconURL({ extension: 'png', size: 128 }) || undefined })
    .setTitle('أهلاً وسهلاً بك في DOS COMMUNITY')
    .setDescription(description)
    .setImage('attachment://dos-member-welcome.png')
    .setFooter({ text: `أنت العضو رقم ${count.toLocaleString('en-US')} • DOS COMMUNITY` });
  return channel.send({
    embeds: [embed],
    files: [new AttachmentBuilder(image, { name: 'dos-member-welcome.png' })],
    allowedMentions: { users: [member.id], roles: [], parse: [] }
  });
}

module.exports = { getMemberWelcomeConfig, resolveMemberWelcomeChannel, sendMemberWelcomeCard };
