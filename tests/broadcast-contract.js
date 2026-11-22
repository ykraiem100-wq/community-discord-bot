'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

const index = read('src/index.js');
const admin = read('src/admin.js');
const database = read('src/database.js');
const broadcast = read('src/broadcast.js');
const welcome = read('src/member-welcome.js');
const render = read('src/render.js');
const daily = read('src/daily-questions.js');
const tasks = read('src/tasks.js');

// The wallet shortcut is the documented command only; a bare "r" is ordinary chat.
assert.doesNotMatch(index, /\^r\(\?:\\s\+<@!\?\\d\+>\)\?\$/i);
assert.doesNotMatch(index, /trimmed\s*===?\s*['"]r['"]/i);
assert.match(index, /if \(trimmed\.startsWith\(prefix\)\) return handleCommand\(message\)/);

// Every known prefix and slash command category has a corresponding admin toggle.
for (const key of ['help','wallet','tasks','invites','invite_link','top','stats','shop','orders','order_review','add_coins','add_xp','reset_member','set_channel','level_role','color_selection','admin_panel','dm_notifications','dm_announcement','dm_announcement_status']) {
  assert.match(admin, new RegExp(`\\['${key}'\\s*,`), `admin command controls must include ${key}`);
}
assert.match(index, /PREFIX_COMMAND_KEYS/);
assert.match(index, /SLASH_COMMAND_KEYS/);
assert.match(index, /commandEnabled\(guildId, commandKey\)/);
assert.match(admin, /admin:command-toggle:/);

// Welcome text remains editable normal message content with a raw image attachment, not an embed.
assert.match(welcome, /content: description/);
assert.match(welcome, /files: \[new AttachmentBuilder/);
assert.doesNotMatch(welcome, /EmbedBuilder/);
const walletCall = render.match(/drawCircleImage\(ctx, avatar, (\d+), (\d+), (\d+), '#C8F4FF'/);
assert.ok(walletCall, 'wallet avatar must be drawn into the round portrait aperture');
assert.equal(Number(walletCall[3]), 108, 'wallet avatar must fill the portrait opening');
const welcomeRenderer = render.match(/async function renderMemberWelcomeCard\([\s\S]*?\n}\n/);
assert.ok(welcomeRenderer);
assert.doesNotMatch(welcomeRenderer[0], /drawText\(/, 'welcome artwork must stay free of baked wording');

// DM broadcasts are explicitly consent-based and throttled.
assert.match(index, /dm-notifications/);
assert.match(index, /dm-announcement/);
assert.match(database, /dm_announcement_subscribers/);
assert.match(database, /dm_broadcast_recipients/);
assert.match(database, /setDmAnnouncementSubscription/);
assert.match(broadcast, /isDmAnnouncementSubscriber/);
assert.match(broadcast, /await member\.send/);
assert.match(index, /setInterval\(\(\) => processDmBroadcastTick\(client\)[\s\S]*?2_000/);
assert.match(admin, /يختار الاشتراك بنفسه/);

// Current announcement and task messages can be edited from admin tools.
assert.match(admin, /daily-question:content-edit/);
assert.match(admin, /daily_question_message_template/);
assert.match(admin, /daily_question_winner_template/);
assert.match(admin, /tasks:message-save/);
assert.match(admin, /task_reward_message_template/);
assert.match(daily, /fillQuestionTemplate/);
assert.match(tasks, /task_reward_message_template/);

console.log('Broadcast opt-in, command toggles, bare-r removal, editable message and image-only welcome contracts passed.');
