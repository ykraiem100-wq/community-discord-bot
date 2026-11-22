'use strict';

const DEFAULT_MEMBER_WELCOME_TEXT = 'أهلاً وسهلاً {user} في **{server}**! 💎\nنتمنى لك وقتاً ممتعاً معنا. أنت العضو رقم **{memberCount}** في مجتمعنا.';

function normalizeMemberWelcomeTemplate(value) {
  return String(value == null ? DEFAULT_MEMBER_WELCOME_TEXT : value)
    .trim()
    .replace(/@(everyone|here)\b/gi, '@\u200b$1')
    .slice(0, 1800);
}

function formatMemberWelcomeText(template, member) {
  const user = member && member.user || {};
  const safeName = String(member && member.displayName || user.globalName || user.username || 'عضو جديد')
    .replace(/@/g, '@\u200b').slice(0, 80);
  const serverName = String(member && member.guild && member.guild.name || 'DOS COMMUNITY')
    .replace(/@/g, '@\u200b').slice(0, 100);
  const count = Math.max(0, Math.floor(Number(member && member.guild && member.guild.memberCount) || 0));
  return normalizeMemberWelcomeTemplate(template)
    .replace(/\{user\}/g, `<@${member && member.id || ''}>`)
    .replace(/\{username\}/g, safeName)
    .replace(/\{server\}/g, serverName)
    .replace(/\{memberCount\}|\{count\}|\{members\}/g, count.toLocaleString('en-US'));
}

module.exports = { DEFAULT_MEMBER_WELCOME_TEXT, normalizeMemberWelcomeTemplate, formatMemberWelcomeText };
