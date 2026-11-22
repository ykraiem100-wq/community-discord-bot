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

// The exact bare letter r is a wallet shortcut, handled before question/task/XP processing.
assert.ok(index.includes('if (/^r$/i.test(trimmed))'), 'plain r must open the wallet');
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
const walletCall = render.match(/drawCircleCover\(ctx, avatar, (\d+), (\d+), (\d+), 1\.015\)/);
assert.ok(walletCall, 'wallet avatar must be cover-cropped into the round portrait aperture');
assert.equal(Number(walletCall[3]), 114, 'wallet avatar must cover the full portrait opening');
const welcomeRenderer = render.match(/async function renderMemberWelcomeCard\([\s\S]*?\n}\n/);
assert.ok(welcomeRenderer);
assert.match(welcomeRenderer[0], /Welcome To/, 'welcome artwork must include its cyan brand text');
assert.match(welcomeRenderer[0], /drawText\(ctx, 'DOS'/, 'welcome artwork must include the unbracketed DOS wordmark');
assert.match(welcomeRenderer[0], /loadTemplate\('dos-community-logo-circle\.png'\)/, 'welcome must use the tightly-cropped logo asset');
assert.match(welcomeRenderer[0], /drawCircleCover\(ctx, logo, 1436, 311, 208, 1\.0\)/, 'welcome logo must be centered and cover the circular aperture');
assert.doesNotMatch(welcomeRenderer[0], /『|』|□/, 'welcome DOS wordmark must not render unsupported square brackets');

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

console.log('Broadcast opt-in, command toggles, bare-r wallet shortcut, editable message and image-only welcome contracts passed.');
