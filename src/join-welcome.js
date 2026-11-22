'use strict';

const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits
} = require('discord.js');
const database = require('./database');
const { DEFAULT_JOIN_WELCOME_TEXT, formatJoinWelcomeText } = require('./welcome-text');

function getJoinWelcomeConfig(guildId) {
  const legacyChannel = database.settings(guildId).welcome_channel_id || '';
  return {
    enabled: database.getConfig(guildId, 'join_welcome_enabled', '1') !== '0',
    channelId: database.getConfig(guildId, 'join_welcome_channel_id', '') || legacyChannel,
    template: database.getConfig(guildId, 'join_welcome_text', DEFAULT_JOIN_WELCOME_TEXT),
    emoji: database.getConfig(guildId, 'join_welcome_emoji', '👋')
  };
}

function parseButtonEmoji(value) {
  const raw = String(value || '👋').trim();
  const custom = raw.match(/^<(a?):([A-Za-z0-9_]{2,32}):(\d{15,22})>$/);
  if (custom) return { name: custom[2], id: custom[3], animated: custom[1] === 'a' };
  return { name: raw || '👋' };
}

function resolveJoinWelcomeChannel(guild, config) {
  if (config.channelId) {
    const configured = guild.channels.cache.get(config.channelId);
    if (configured && configured.type === ChannelType.GuildText) return configured;
    return null;
  }
  const generalNames = new Set(['general', 'chat', 'عام', 'الشات-العام', 'الشات العام', 'العام']);
  const general = guild.channels.cache.find((channel) => channel.type === ChannelType.GuildText && generalNames.has(channel.name.toLowerCase()));
  return general || guild.systemChannel || null;
}

function buildJoinWelcomePayload(member, config, test = false) {
  const text = test
    ? `-#  ${formatJoinWelcomeText(config.template, member).replace(/^\s*-#\s*/, '')} *(تجربة)*`
    : formatJoinWelcomeText(config.template, member);
  const button = new ButtonBuilder()
    .setCustomId('joinwelcome:wave')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji(parseButtonEmoji(config.emoji));
  return {
    content: text,
    components: [new ActionRowBuilder().addComponents(button)],
    allowedMentions: { users: [member.id], roles: [], parse: [] }
  };
}

async function sendJoinWelcome(member, options = {}) {
  if (!member || !member.guild || member.user.bot) return null;
  const config = getJoinWelcomeConfig(member.guild.id);
  if (!options.test && !config.enabled) return null;
  const channel = resolveJoinWelcomeChannel(member.guild, config);
  if (!channel || !channel.isTextBased() || typeof channel.send !== 'function') return null;
  const botMember = member.guild.members.me;
  if (botMember) {
    const permissions = channel.permissionsFor(botMember);
    if (!permissions || !permissions.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) return null;
  }
  return channel.send(buildJoinWelcomePayload(member, config, Boolean(options.test)));
}

module.exports = {
  getJoinWelcomeConfig,
  parseButtonEmoji,
  resolveJoinWelcomeChannel,
  buildJoinWelcomePayload,
  sendJoinWelcome
};
