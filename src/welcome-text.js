'use strict';

const DEFAULT_JOIN_WELCOME_TEXT = '🌟 First message from {user}';

function normalizeJoinWelcomeTemplate(value) {
  return String(value == null ? DEFAULT_JOIN_WELCOME_TEXT : value)
    .trim()
    .replace(/^\s*-#\s*/, '')
    .replace(/@(everyone|here)\b/gi, '@\u200b$1')
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 450);
}

function formatJoinWelcomeText(template, member) {
  const safeName = String(member.displayName || member.user?.globalName || member.user?.username || 'New member')
    .replace(/@/g, '@\u200b')
    .slice(0, 80);
  const serverName = String(member.guild?.name || 'our server').replace(/@/g, '@\u200b').slice(0, 100);
  const body = normalizeJoinWelcomeTemplate(template)
    .replace(/\{user\}/g, `<@${member.id}>`)
    .replace(/\{username\}/g, safeName)
    .replace(/\{server\}/g, serverName);
  return `-#  ${body}`.slice(0, 1900);
}

module.exports = { DEFAULT_JOIN_WELCOME_TEXT, normalizeJoinWelcomeTemplate, formatJoinWelcomeText };
