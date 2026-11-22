'use strict';
const { EmbedBuilder, MessageFlags } = require('discord.js');
const database = require('./database');
const { QUESTIONS } = require('./question-bank');

function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randomLocalTimeForDate(date) {
  const value = new Date(date.getFullYear(), date.getMonth(), date.getDate(), randomInt(10, 22), randomInt(0, 59), randomInt(0, 59), 0);
  return Math.floor(value.getTime() / 1000);
}
function nextRandomSchedule(nowMs = Date.now()) {
  const now = new Date(nowMs);
  const todayCandidate = randomLocalTimeForDate(now);
  if (todayCandidate * 1000 > nowMs + 60_000) return todayCandidate;
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return randomLocalTimeForDate(tomorrow);
}
function dateKeyAt(seconds) { return database.localDateKey(new Date(seconds * 1000)); }
const { normalizeAnswer, answerMatches } = require('./question-utils');
function chooseQuestion(lastKey = '') {
  const available = QUESTIONS.filter((item) => item[0] !== lastKey);
  const pool = available.length ? available : QUESTIONS;
  return pool[randomInt(0, pool.length - 1)];
}

async function tickDailyQuestions(client, nowMs = Date.now()) {
  for (const guild of client.guilds.cache.values()) {
    const guildId = guild.id;
    if (database.getConfig(guildId, 'daily_questions_enabled', '0') !== '1') continue;
    const channelId = database.getConfig(guildId, 'daily_question_channel_id', '');
    if (!channelId) continue;
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased() || typeof channel.send !== 'function') continue;
    const nowSeconds = Math.floor(nowMs / 1000);
    let nextAt = Number(database.getConfig(guildId, 'daily_question_next_at', '0')) || 0;
    if (!nextAt) {
      nextAt = nextRandomSchedule(nowMs);
      database.setConfig(guildId, 'daily_question_next_at', nextAt, 'scheduler');
    }
    if (nowSeconds < nextAt) continue;
    const todayKey = database.localDateKey(new Date(nowMs));
    // If the bot was offline past the saved date, do not replay several missed days.
    // Move to the next randomized slot from the current moment instead.
    if (dateKeyAt(nextAt) < todayKey) {
      database.expireOldDailyQuestions(guildId, todayKey);
      nextAt = nextRandomSchedule(nowMs);
      database.setConfig(guildId, 'daily_question_next_at', nextAt, 'scheduler');
      continue;
    }
    const dateKey = dateKeyAt(nextAt);
    database.expireOldDailyQuestions(guildId, todayKey);
    if (database.openDailyQuestion(guildId)) continue;

    // Recover a question that was saved but not posted because the process stopped
    // between the database insert and Discord's send response.
    let run = database.dailyQuestionForDate(guildId, dateKey);
    let runId = run && run.id;
    let key = run && run.question_key;
    let question = run && run.question_text;
    let reward = run && Number(run.reward_coins);
    if (run && ['won', 'expired', 'open'].includes(run.status)) {
      const target = new Date(nextAt * 1000);
      const tomorrow = new Date(target.getFullYear(), target.getMonth(), target.getDate() + 1);
      database.setConfig(guildId, 'daily_question_next_at', randomLocalTimeForDate(tomorrow), 'scheduler');
      continue;
    }
    if (run && run.status === 'failed') {
      database.retryDailyQuestionRun(run.id);
      run = database.dailyQuestionForDate(guildId, dateKey);
    }
    if (!run) {
      const lastKey = database.getConfig(guildId, 'daily_question_last_key', '');
      [key, question] = chooseQuestion(lastKey);
      const answer = QUESTIONS.find((item) => item[0] === key)?.[2] || '';
      reward = Math.max(1, Math.min(100000, Math.floor(Number(database.getConfig(guildId, 'daily_question_reward', '1')) || 1)));
      runId = database.createDailyQuestionRun({ guildId, dateKey, channelId, questionKey: key, question, answer, rewardCoins: reward, scheduledAt: nextAt });
      run = runId ? database.dailyQuestionForDate(guildId, dateKey) : null;
    }
    if (!run || !runId && run.status !== 'pending') continue;
    runId = run.id;
    key = run.question_key;
    question = run.question_text;
    reward = Number(run.reward_coins);
    try {
      const embed = new EmbedBuilder().setColor(0x55DDF5).setTitle('💎 سؤال DOS اليومي')
        .setDescription(`**${question}**\n\n🏆 أول إجابة صحيحة تحصل على **${reward.toLocaleString('en-US')} DOS Coin**.\nاكتب إجابتك مباشرة في هذه القناة.`)
        .setFooter({ text: 'DOS COMMUNITY • Daily Challenge' }).setTimestamp();
      const sent = await channel.send({ embeds: [embed] });
      database.setDailyQuestionSent(runId, sent.id);
      database.setConfig(guildId, 'daily_question_last_key', key, 'scheduler');
      const target = new Date(nextAt * 1000);
      const tomorrow = new Date(target.getFullYear(), target.getMonth(), target.getDate() + 1);
      database.setConfig(guildId, 'daily_question_next_at', randomLocalTimeForDate(tomorrow), 'scheduler');
      console.log(`[DAILY QUESTION] Published ${key} in ${guild.name}.`);
    } catch (error) {
      database.failDailyQuestion(runId);
      database.setConfig(guildId, 'daily_question_next_at', nowSeconds + 300, 'scheduler');
      console.error('[DAILY QUESTION] Publish failed:', error.message);
    }
  }
}

async function checkDailyQuestionAnswer(message) {
  if (!message || !message.guild || message.author.bot) return false;
  const run = database.openDailyQuestion(message.guild.id);
  if (!run || run.channel_id !== message.channel.id || !answerMatches(message.content, run.answer_text)) return false;
  if (!database.winDailyQuestion(run.id, message.author.id)) return true;
  database.addCoins(message.guild.id, message.author.id, Number(run.reward_coins));
  const embed = new EmbedBuilder().setColor(0x55DDF5).setTitle('🏆 إجابة صحيحة!')
    .setDescription(`مبروك <@${message.author.id}>! كنت أول من أجاب إجابة صحيحة.\n\nحصلت على **${Number(run.reward_coins).toLocaleString('en-US')} DOS Coin** 💎`)
    .setFooter({ text: 'DOS COMMUNITY • Daily Challenge' });
  await message.channel.send({ embeds: [embed], allowedMentions: { users: [message.author.id] } }).catch(() => {});
  return true;
}

function questionSettingsPayload(guildId) {
  const enabled = database.getConfig(guildId, 'daily_questions_enabled', '0') === '1';
  const channel = database.getConfig(guildId, 'daily_question_channel_id', '');
  const reward = database.getConfig(guildId, 'daily_question_reward', '1');
  const nextAt = Number(database.getConfig(guildId, 'daily_question_next_at', '0')) || 0;
  const open = database.openDailyQuestion(guildId);
  return { enabled, channel, reward, nextAt, open, questionCount: QUESTIONS.length };
}

module.exports = {
  QUESTIONS, normalizeAnswer, answerMatches, nextRandomSchedule, dateKeyAt,
  tickDailyQuestions, checkDailyQuestionAnswer, questionSettingsPayload
};
