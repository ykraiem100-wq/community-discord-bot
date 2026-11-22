'use strict';

const { AttachmentBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
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
  const description = formatMemberWelcomeText(config.template, member);
  return channel.send({
    // Send copy as ordinary message content and the artwork as a plain image
    // attachment. This removes Discord's embed frame and keeps all wording
    // editable from the administration panel.
    content: description,
    files: [new AttachmentBuilder(image, { name: 'dos-member-welcome.png' })],
    allowedMentions: { users: [member.id], roles: [], parse: [] }
  });
}

module.exports = { getMemberWelcomeConfig, resolveMemberWelcomeChannel, sendMemberWelcomeCard };
