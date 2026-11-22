'use strict';
const {
  EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder,
  TextInputBuilder, TextInputStyle, MessageFlags
} = require('discord.js');
const database = require('./database');

function periodLabel(period) { return period === 'weekly' ? 'أسبوعية' : 'يومية'; }
function trackingLabel(type) { return type === 'xp' ? 'جمع XP' : type === 'messages' ? 'رسائل في روم محدد' : 'إثبات وموافقة الإدارة'; }
function rewardLabel(task) { return `${Number(task.reward_amount).toLocaleString('en-US')} ${task.reward_type === 'xp' ? 'XP' : 'DOS Coin'}`; }
function memberTasksPayload(guildId, userId) {
  const tasks = database.listGuildTasks(guildId, true).slice(0, 15);
  const lines = tasks.map((task) => {
    const key = database.taskPeriodKey(task.period);
    const progress = database.getTaskProgress(guildId, task.id, userId, key);
    const current = Math.min(Number(task.threshold), Number(progress?.progress || 0));
    const status = progress?.status === 'awarded' ? '🏆 فزت بالمهمة' : progress?.status === 'pending' ? '⏳ بانتظار مراجعة الإدارة' : progress?.status === 'rejected' ? (task.tracking_type === 'manual' ? 'لم تتم الموافقة على الإثبات' : 'اكتملت مقاعد الفائزين') : `${current.toLocaleString('en-US')} / ${Number(task.threshold).toLocaleString('en-US')}`;
    return `**#${task.id} ${task.title}** (${periodLabel(task.period)})\n${task.description || '—'}\nالتقدم: **${status}** • الجائزة: **${rewardLabel(task)}**`;
  });
  const manual = tasks.filter((task) => task.tracking_type === 'manual' && !['pending','awarded'].includes(database.getTaskProgress(guildId, task.id, userId, database.taskPeriodKey(task.period))?.status || ''));
  const components = [];
  if (manual.length) {
    const options = manual.slice(0, 25).map((task) => ({
      label: `#${task.id} ${task.title}`.slice(0, 100),
      value: String(task.id),
      description: `الجائزة: ${rewardLabel(task)}`.slice(0, 100)
    }));
    const select = new StringSelectMenuBuilder().setCustomId('tasks:claim-select')
      .setPlaceholder('اختر مهمة مكتملة لإرسال إثباتك').addOptions(options);
    components.push(new ActionRowBuilder().addComponents(select));
  }
  const embed = new EmbedBuilder().setColor(0x55DDF5).setTitle('📋 مهام DOS COMMUNITY')
    .setDescription(lines.join('\n\n') || 'لا توجد مهام مفعّلة حالياً. تابع اللوحة لمعرفة المهام الجديدة.')
    .setFooter({ text: 'المهام الآلية تُحتسب تلقائياً • المهام اليدوية تحتاج إثباتاً وموافقة الإدارة' });
  return { embeds: [embed], components };
}
function taskClaimModal(taskId) {
  return new ModalBuilder().setCustomId(`tasks:submit:${taskId}`).setTitle('إرسال إثبات إنجاز المهمة')
    .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('proof').setLabel('كيف أنجزت المهمة؟ أرفق وصفاً أو رابطاً').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500)));
}
async function handleTaskInteraction(interaction) {
  if (interaction.customId === 'tasks:claim-select' && interaction.isStringSelectMenu()) {
    const taskId = Number(interaction.values[0]);
    const task = database.getGuildTask(interaction.guildId, taskId);
    if (!task || !task.enabled || task.tracking_type !== 'manual') return interaction.reply({ content: 'هذه المهمة غير متاحة لتقديم الإثبات.', flags: MessageFlags.Ephemeral });
    return interaction.showModal(taskClaimModal(taskId));
  }
  return false;
}
async function handleTaskModal(interaction) {
  const match = interaction.customId.match(/^tasks:submit:(\d+)$/);
  if (!match) return false;
  const taskId = Number(match[1]);
  const proof = interaction.fields.getTextInputValue('proof').trim();
  const result = database.claimManualTask(interaction.guildId, taskId, interaction.user.id, proof);
  if (result.error === 'already_claimed') return interaction.reply({ content: 'سبق أن قدمت هذه المهمة أو حصلت على جائزتها خلال هذه الفترة.', flags: MessageFlags.Ephemeral });
  if (!result.ok) return interaction.reply({ content: 'المهمة غير متاحة أو لا تقبل إثباتاً يدوياً.', flags: MessageFlags.Ephemeral });
  return interaction.reply({ content: `✅ تم إرسال إثبات مهمة **${result.task.title}** إلى الإدارة للمراجعة. ترتيبك محفوظ حسب وقت الإرسال.`, flags: MessageFlags.Ephemeral });
}
function grantTaskReward(guildId, userId, rewardType, amount) {
  const value = Math.max(1, Math.floor(Number(amount) || 1));
  if (rewardType === 'xp') {
    return database.addXp(guildId, userId, 'text', value, {
      awardXp: true, awardCoins: true,
      xpPerCoin: Number(database.getConfig(guildId, 'xp_per_coin', '250'))
    });
  }
  return database.addCoins(guildId, userId, value);
}
function publishTaskRewardMessage(channel, userId, task, amount, rewardType, guildId) {
  if (!channel || !channel.isTextBased() || !channel.send) return Promise.resolve(null);
  const unit = rewardType === 'xp' ? 'XP' : 'DOS Coin';
  const template = guildId
    ? database.getConfig(guildId, 'task_reward_message_template', '🏆 <@{user}> أكمل المهمة **{task}** وكان من الفائزين! حصل على **{reward} {unit}**.')
    : '🏆 <@{user}> أكمل المهمة **{task}** وكان من الفائزين! حصل على **{reward} {unit}**.';
  const content = String(template)
    .replace(/\{user\}/g, userId)
    .replace(/\{task\}/g, String(task.title || '').slice(0,120))
    .replace(/\{reward\}/g, Number(amount).toLocaleString('en-US'))
    .replace(/\{unit\}/g, unit)
    .slice(0,1900);
  return channel.send({ content, allowedMentions: { users: [userId], roles: [], parse: [] } }).catch(() => null);
}
module.exports = { memberTasksPayload, handleTaskInteraction, handleTaskModal, grantTaskReward, publishTaskRewardMessage, periodLabel, trackingLabel, rewardLabel };
