'use strict';

const database = require('./database');

let ticking = false;

function broadcastStatusText(job) {
  if (!job) return 'لا توجد حملات إرسال سابقة.';
  const status = job.status === 'running' ? 'قيد الإرسال' : job.status === 'completed' ? 'مكتمل' : 'متوقف';
  return [
    `**الحملة:** #${job.id} • ${status}`,
    `**الإجمالي:** ${Number(job.total_count).toLocaleString('en-US')}`,
    `**تم الإرسال:** ${Number(job.sent_count).toLocaleString('en-US')}`,
    `**تعذّر الإرسال:** ${Number(job.failed_count).toLocaleString('en-US')}`,
    `**تخطي:** ${Number(job.skipped_count).toLocaleString('en-US')}`
  ].join('\n');
}

async function processDmBroadcastTick(client) {
  if (ticking) return false;
  ticking = true;
  try {
    const jobs = database.activeDmBroadcastJobs();
    for (const job of jobs) {
      const guild = client.guilds.cache.get(job.guild_id);
      if (!guild) continue;
      const recipient = database.nextDmBroadcastRecipient(job.id);
      if (!recipient) continue;
      if (!database.isDmAnnouncementSubscriber(job.guild_id, recipient.user_id)) {
        database.markDmBroadcastRecipient(job.id, recipient.user_id, 'skipped', 'subscription disabled');
        return true;
      }
      let member = guild.members.cache.get(recipient.user_id);
      if (!member) member = await guild.members.fetch(recipient.user_id).catch(() => null);
      if (!member || member.user.bot) {
        database.markDmBroadcastRecipient(job.id, recipient.user_id, 'skipped', 'member unavailable');
        return true;
      }
      try {
        await member.send({
          content: String(job.message).slice(0, 1900),
          allowedMentions: { parse: [], users: [], roles: [], repliedUser: false }
        });
        database.markDmBroadcastRecipient(job.id, recipient.user_id, 'sent');
      } catch (error) {
        database.markDmBroadcastRecipient(job.id, recipient.user_id, 'failed', error && error.code ? `Discord ${error.code}` : 'DM unavailable');
      }
      return true;
    }
    return false;
  } catch (error) {
    console.error('[DM BROADCAST] Queue tick failed:', error);
    return false;
  } finally {
    ticking = false;
  }
}

module.exports = { broadcastStatusText, processDmBroadcastTick };
