'use strict';
const path = require('node:path');
const {
  EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags
} = require('discord.js');
const engine = require('./genie-engine');
const GENIE_IMAGE = path.join(__dirname, '..', 'assets', 'genie', 'dos-genie.png');
const CYAN = 0x55DFFF;

function readConfig(database, guildId) {
  return {
    enabled: database.getConfig(guildId, 'genie_enabled', '0') === '1',
    channelId: database.getConfig(guildId, 'genie_channel_id', ''),
    rewardEnabled: database.getConfig(guildId, 'genie_reward_enabled', '1') === '1',
    rewardCoins: Math.max(0, Math.min(100000, Number(database.getConfig(guildId, 'genie_reward_coins', '25')) || 0)),
    maxQuestions: Math.max(5, Math.min(30, Number(database.getConfig(guildId, 'genie_max_questions', '15')) || 15)),
    maxGuesses: Math.max(1, Math.min(10, Number(database.getConfig(guildId, 'genie_max_guesses', '3')) || 3)),
    cooldownSeconds: Math.max(0, Math.min(86400, Number(database.getConfig(guildId, 'genie_cooldown_seconds', '60')) || 0)),
    sessionTimeoutMinutes: Math.max(0, Math.min(1440, Number(database.getConfig(guildId, 'genie_session_timeout_minutes', '30')) || 0))
  };
}

function makeEmbed(title, description) {
  return new EmbedBuilder().setColor(CYAN).setTitle(title).setDescription(description)
    .setThumbnail('attachment://dos-genie.png')
    .setFooter({ text: 'DOS COMMUNITY • لعبة المارد' });
}
function heroFile() { return new AttachmentBuilder(GENIE_IMAGE, { name: 'dos-genie.png' }); }
function welcomePayload(user) {
  const embed = makeEmbed('🧞‍♂️ المارد • DOS COMMUNITY',
    `أهلاً ${user}!
فكّر بشخصية حقيقية أو خيالية، وسأحاول تخمينها من خلال أسئلة متتابعة.

**طريقة اللعب:** أجب بصراحة باستخدام الأزرار، وبعدها سيكشف المارد تخمينه.

💎 ${'الجائزة اختيارية وتحددها الإدارة من لوحة التحكم.'}`)
    .addFields({ name: 'خيارات الإجابة', value: 'نعم • لا • غالباً نعم • غالباً لا • لا أعرف', inline: true });
  return {
    embeds: [embed], files: [heroFile()],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`genie:start:${user.id}`).setLabel('ابدأ اللعبة').setEmoji('🎮').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`genie:top:${user.id}`).setLabel('أفضل اللاعبين').setEmoji('🏆').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`genie:stats:${user.id}`).setLabel('إحصائياتي').setEmoji('📊').setStyle(ButtonStyle.Secondary)
    )]
  };
}
function questionPayload(userId, state, question, maxQuestions) {
  const embed = makeEmbed(`🧞‍♂️ السؤال ${state.questions + 1} من ${maxQuestions}`,
    `**${question.prompt}**\n\nفكّر جيداً واختر أقرب إجابة.`)
    .addFields({ name: 'التقدم', value: `${state.questions} إجابة • ${state.guesses} تخمينات خاطئة`, inline: true });
  const buttons = [
    ['yes', 'نعم', '✅', ButtonStyle.Success],
    ['no', 'لا', '❌', ButtonStyle.Danger],
    ['probably_yes', 'غالباً نعم', '👍', ButtonStyle.Primary],
    ['probably_no', 'غالباً لا', '👎', ButtonStyle.Secondary],
    ['unknown', 'لا أعرف', '❔', ButtonStyle.Secondary]
  ].map(([answer, label, emoji, style]) => new ButtonBuilder()
    .setCustomId(`genie:answer:${userId}:${question.id}:${answer}`)
    .setLabel(label).setEmoji(emoji).setStyle(style));
  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(buttons)] };
}
function guessPayload(userId, state, guess, maxGuesses) {
  const embed = makeEmbed('✨ أعتقد أنني عرفتها!',
    `هل الشخصية التي تفكر بها هي:\n\n# **${guess.name}**\n*التصنيف: ${guess.category}*\n\n${guess.description || 'هل أصبت هذه المرة؟'}`)
    .addFields({ name: 'محاولات المارد', value: `${state.guesses + 1} من ${maxGuesses}`, inline: true });
  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`genie:guess:${userId}:yes`).setLabel('نعم، صحيح!').setEmoji('🏆').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`genie:guess:${userId}:no`).setLabel('لا، حاول مرة أخرى').setEmoji('🔄').setStyle(ButtonStyle.Danger)
  )] };
}
function resultPayload(won, reward, state, guessCount) {
  if (won) {
    const rewardText = reward > 0 ? `\n\n💎 حصلت على **${reward.toLocaleString('en-US')} DOS Coin**.` : '\n\nاللعبة بدون جائزة حالياً.';
    return { embeds: [makeEmbed('🎉 أحسنت! انتصر المارد!', `عرفت الشخصية بنجاح بعد **${state.questions}** سؤالاً.${rewardText}\n\nاكتب \.المارد للعب مرة أخرى بعد انتهاء فترة الانتظار.`)], components: [] };
  }
  return { embeds: [makeEmbed('🧞‍♂️ هذه المرة لم أفز!', `لقد حيّرت المارد بعد **${state.questions}** سؤالاً و**${guessCount}** تخمينات.\n\nحاول مرة أخرى لاحقاً!`)], components: [] };
}

async function startGenieGame(message, database) {
  const guildId = message.guild.id;
  const config = readConfig(database, guildId);
  if (!config.enabled) return message.reply('🧞‍♂️ لعبة المارد متوقفة حالياً. اطلب من الإدارة تفعيلها من لوحة التحكم.');
  if (!config.channelId) return message.reply('حددت الإدارة بعد قناة لعبة المارد.');
  if (message.channel.id !== config.channelId) return message.reply(`🧞‍♂️ لعبة المارد متاحة في <#${config.channelId}> فقط.`);

  const active = database.getGenieSession(guildId, message.author.id);
  if (active && active.status === 'active') {
    const ageSeconds = Math.floor(Date.now() / 1000) - Number(active.created_at || 0);
    const timeoutSeconds = config.sessionTimeoutMinutes * 60;
    if (timeoutSeconds > 0 && ageSeconds >= timeoutSeconds) database.expireGenieSession(guildId, message.author.id);
    else return message.reply('لديك لعبة مارد مفتوحة بالفعل في هذه القناة. أكملها من الرسالة السابقة أولاً.');
  }
  const stats = database.getGenieStats(guildId, message.author.id);
  const elapsed = Math.floor(Date.now() / 1000) - Number(stats.last_played_at || 0);
  if (config.cooldownSeconds > 0 && stats.last_played_at && elapsed < config.cooldownSeconds) {
    const remaining = config.cooldownSeconds - elapsed;
    const waitText = remaining < 60 ? `${remaining} ثانية` : `${Math.ceil(remaining / 60)} دقيقة`;
    return message.reply(`⏳ انتظر ${waitText} قبل بدء لعبة جديدة.`);
  }
  const payload = welcomePayload(message.author);
  const sent = await message.reply(payload);
  const saved = database.saveGenieSession(guildId, message.author.id, message.channel.id, sent.id, {
    phase: 'ready', asked: [], answers: {}, excluded: [], questions: 0, guesses: 0, currentQuestion: null, currentGuessId: null
  });
  if (!saved) await sent.edit({ content: 'لديك لعبة مارد مفتوحة بالفعل.', components: [] }).catch(() => {});
  return sent;
}

function currentPayload(userId, state, config) {
  if (engine.shouldGuess(state, config.maxQuestions)) {
    const guess = engine.bestGuess(state);
    if (guess) {
      state.phase = 'guessing';
      state.currentGuessId = guess.id;
      return { state, payload: guessPayload(userId, state, guess, config.maxGuesses) };
    }
  }
  const question = engine.chooseQuestion(state);
  if (!question) {
    const guess = engine.bestGuess(state);
    if (!guess) return { state, payload: resultPayload(false, 0, state, state.guesses) };
    state.phase = 'guessing';
    state.currentGuessId = guess.id;
    return { state, payload: guessPayload(userId, state, guess, config.maxGuesses) };
  }
  state.phase = 'asking';
  state.currentQuestion = question.id;
  return { state, payload: questionPayload(userId, state, question, config.maxQuestions) };
}

function updateGameMessage(interaction, payload) {
  const attachments = [...(interaction.message.attachments?.values?.() || [])].map((item) => ({ id: item.id, filename: item.name }));
  return interaction.update({ ...payload, attachments });
}

async function handleGenieInteraction(interaction, database) {
  if (!interaction.customId.startsWith('genie:')) return false;
  const parts = interaction.customId.split(':');
  const action = parts[1];
  const ownerId = action === 'answer' ? parts[2] : parts[2];
  if (interaction.user.id !== ownerId) return interaction.reply({ content: 'هذه اللعبة تخص العضو الذي بدأها. اكتب `.المارد` لبدء لعبتك.', flags: MessageFlags.Ephemeral });
  const guildId = interaction.guildId;
  if (!guildId) return interaction.reply({ content: 'هذه اللعبة تعمل داخل السيرفر فقط.', flags: MessageFlags.Ephemeral });

  if (action === 'top' || action === 'stats') {
    if (action === 'stats') {
      const stats = database.getGenieStats(guildId, ownerId);
      const embed = makeEmbed('📊 إحصائيات المارد', `**الألعاب:** ${stats.total_games}\n**التخمينات الصحيحة:** ${stats.wins}\n**الأسئلة التي أجبت عنها:** ${stats.questions_total}\n**العملات التي ربحتها:** ${Number(stats.coins_earned).toLocaleString('en-US')} DOS Coin`);
      return interaction.reply({ embeds: [embed], files: [heroFile()], flags: MessageFlags.Ephemeral });
    }
    const rows = database.getGenieLeaderboard(guildId, 10);
    const lines = await Promise.all(rows.map(async (row, index) => {
      const user = await interaction.client.users.fetch(row.user_id).catch(() => null);
      return `**${index + 1}.** ${user ? user.username : `عضو ${String(row.user_id).slice(-4)}`} — **${row.wins}** فوز من ${row.total_games} لعبة`;
    }));
    const embed = makeEmbed('🏆 أفضل لاعبي المارد', lines.join('\n') || 'لا توجد نتائج بعد. كن أول من يلعب!');
    return interaction.reply({ embeds: [embed], files: [heroFile()], flags: MessageFlags.Ephemeral });
  }

  const session = database.getGenieSession(guildId, ownerId);
  if (!session || session.status !== 'active') return interaction.reply({ content: 'هذه الجلسة انتهت أو لم تعد موجودة. اكتب `.المارد` للبدء من جديد.', flags: MessageFlags.Ephemeral });
  if (session.channel_id !== interaction.channelId || session.message_id !== interaction.message.id) return interaction.reply({ content: 'استخدم أزرار رسالة لعبتك الحالية في الروم المحدد.', flags: MessageFlags.Ephemeral });
  const config = readConfig(database, guildId);
  const sessionAge = Math.floor(Date.now() / 1000) - Number(session.created_at || 0);
  if (config.sessionTimeoutMinutes > 0 && sessionAge >= config.sessionTimeoutMinutes * 60) {
    database.expireGenieSession(guildId, ownerId);
    const expired = { embeds: [makeEmbed('⌛ انتهى وقت اللعبة', 'انتهت جلسة المارد بسبب عدم النشاط. اكتب `.المارد` لبدء لعبة جديدة.')], components: [] };
    return updateGameMessage(interaction, expired);
  }
  const state = session.state;

  if (action === 'start') {
    if (state.phase !== 'ready') return interaction.reply({ content: 'اللعبة بدأت بالفعل.', flags: MessageFlags.Ephemeral });
    const next = currentPayload(ownerId, state, config);
    database.updateGenieSession(guildId, ownerId, next.state, interaction.message.id);
    return updateGameMessage(interaction, next.payload);
  }

  if (action === 'answer') {
    const questionId = parts[3];
    const answer = parts[4];
    if (state.phase !== 'asking' || state.currentQuestion !== questionId || !['yes','no','probably_yes','probably_no','unknown'].includes(answer)) {
      return interaction.reply({ content: 'تم استخدام هذا السؤال بالفعل. استخدم أزرار السؤال الحالي.', flags: MessageFlags.Ephemeral });
    }
    state.answers[questionId] = answer;
    state.asked.push(questionId);
    state.questions += 1;
    const next = currentPayload(ownerId, state, config);
    database.updateGenieSession(guildId, ownerId, next.state, interaction.message.id);
    return updateGameMessage(interaction, next.payload);
  }

  if (action === 'guess') {
    const answer = parts[3];
    if (state.phase !== 'guessing' || !state.currentGuessId || !['yes','no'].includes(answer)) {
      return interaction.reply({ content: 'هذا التخمين لم يعد نشطاً.', flags: MessageFlags.Ephemeral });
    }
    if (answer === 'yes') {
      const reward = config.rewardEnabled ? config.rewardCoins : 0;
      const completed = database.completeGenieGame(guildId, ownerId, true, state.questions, reward);
      if (!completed) return interaction.reply({ content: 'تم إنهاء هذه اللعبة مسبقاً.', flags: MessageFlags.Ephemeral });
      const result = resultPayload(true, reward, state, state.guesses + 1);
      return updateGameMessage(interaction, result);
    }
    state.excluded.push(state.currentGuessId);
    state.currentGuessId = null;
    state.guesses += 1;
    state.lastGuessQuestions = state.questions;
    if (state.guesses >= config.maxGuesses) {
      database.completeGenieGame(guildId, ownerId, false, state.questions, 0);
      return updateGameMessage(interaction, resultPayload(false, 0, state, state.guesses));
    }
    const next = currentPayload(ownerId, state, config);
    if (next.payload.embeds?.[0]?.data?.title === '🧞‍♂️ هذه المرة لم أفز!') {
      database.completeGenieGame(guildId, ownerId, false, state.questions, 0);
    } else {
      database.updateGenieSession(guildId, ownerId, next.state, interaction.message.id);
    }
    return updateGameMessage(interaction, next.payload);
  }
  return false;
}

module.exports = { startGenieGame, handleGenieInteraction, readConfig };
